// analysis-loop.ts — main process
// Live companion loop: watches a user-selected window continuously.
//
// Lifecycle:
//   1. User picks a window → startWatching()
//   2. IMMEDIATE first analysis (no delay, no gates) → always speaks
//   3. 10s interval: capture → image gate → AI → change gate → speak if meaningful
//   4. User asks question → fresh capture + session context → conversational answer
//   5. User picks different window → clear session → restart
//
// Session context:
//   Lightweight memory of what Buildy has observed in the current watched window.
//   Cleared on window switch. NOT persisted. NOT old project memory.

import type { BrowserWindow } from 'electron'
import type { AppSettings, AnalysisResult, Goal } from '../renderer/src/types'
import { emptyProjectMemory } from '../renderer/src/types'
import { IPC } from '../renderer/src/types'
import { captureWatchedWindow } from './capturer'
import { getProvider } from './ai/provider-registry'
import {
  computeImageChangeFraction,
  IMAGE_CHANGE_THRESHOLD,
  detectAnalysisChange,
} from './change-detector'
import type { AnalysisChangeResult } from './change-detector'
import { formatSpokenGuidance } from './ai/speech-formatter'
import { buildQuestionSystemPrompt, buildQuestionUserPrompt } from './ai/prompt-builder'
import { fetchWithTimeout } from './ai/fetch-with-timeout'
import * as nemp from './nemp-bridge'
import { checkPromptQuality } from './ai/prompt-quality-check'
import { verifyPromptOutcome } from './ai/verifier-check'
import {
  recordPendingOutcome, getMostRecentPending, resolveOutcome, clearOutcomes,
} from './verifier'
import type { PromptOutcome } from './verifier'
import { enqueueSpeech } from './voice-player'
import { RecentTopics } from './semantic-dedup'
import { isStaleSession } from './capture-guard'
import { debugLog, debugError } from './debug-log'
import type { VerificationVerdict } from '../renderer/src/types'

// Recently-spoken completion subjects + next-steps, for semantic (near-duplicate)
// dedup within a 3-minute window. Cleared on each fresh watch session.
const recentSpokenCompletions = new RecentTopics()
const recentSpokenNextMoves = new RecentTopics()

// ─── Session context ────────────────────────────────────────────────────────

interface SessionContext {
  windowName: string
  observations: string[]    // last 5 whatIsHappening summaries (rolling)
  currentState: string      // latest whatIsHappening
  currentNextMove: string   // latest bestNextMove
  startedAt: string
}

let session: SessionContext | null = null

function updateSession(analysis: AnalysisResult): void {
  if (!session) return
  session.currentState = analysis.whatIsHappening
  session.currentNextMove = analysis.bestNextMove
  session.observations.push(analysis.whatIsHappening)
  if (session.observations.length > 5) session.observations.shift()
}

export function getSessionContext(): SessionContext | null {
  return session
}

// ─── State ───────────────────────────────────────────────────────────────────

let loopTimer: ReturnType<typeof setTimeout> | null = null
let isRunning = false
let isPaused = false
let isQuietMode = false
let isFirstCycle = true
let previousScreenshot: string | null = null
let previousAnalysis: AnalysisResult | null = null
let lastSpokeAt = 0
let lastSpokenNextMove = ''
let watchedSourceId: string | null = null
let watchedWindowName: string | null = null
let companionRef: BrowserWindow | null = null
let watchedGoal: Goal | null = null   // injected into every analysis prompt so guidance is goal-aware

// Concurrency control: a monotonic session id (bumped on every start/stop/switch)
// and an in-flight guard so cycles can never overlap and stale-window results are
// discarded. The async getters are reloaded EVERY cycle so editing the goal or
// changing settings mid-watch takes effect without restarting.
let currentSession = 0
let inFlight = false
let getSettingsFn: (() => Promise<AppSettings>) | null = null
let getGoalFn: (() => Promise<Goal | null>) | null = null

// The analysis currently shown in the guidance panel for THIS cycle. Parallel
// background passes (prompt-quality grader, verifier) patch it and re-send so
// they compose instead of clobbering each other's fields.
let displayAnalysis: AnalysisResult | null = null
let displaySession = 0

const LOOP_INTERVAL_MS = 10_000
const NORMAL_COOLDOWN_MS = 15_000
const QUIET_COOLDOWN_MS = 30_000

const EMPTY_PROJECT = emptyProjectMemory()

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start watching a specific window. Clears all stale state.
 * Runs an immediate first analysis that always speaks.
 */
export function startWatching(
  companionWindow: BrowserWindow,
  sourceId: string,
  windowName: string,
  getSettings: () => Promise<AppSettings>,
  getGoal: () => Promise<Goal | null>
): void {
  clearStaleState()

  // New watching session — any in-flight cycle from a previous window is now stale.
  currentSession++
  const mySession = currentSession

  companionRef = companionWindow
  watchedSourceId = sourceId
  watchedWindowName = windowName
  getSettingsFn = getSettings
  getGoalFn = getGoal
  watchedGoal = null
  isRunning = true
  isPaused = false
  isFirstCycle = true

  // Create fresh session context
  session = {
    windowName,
    observations: [],
    currentState: '',
    currentNextMove: '',
    startedAt: new Date().toISOString(),
  }

  // Structural log only — no window title (it may contain user content).
  console.log(`[AnalysisLoop] Now watching session ${mySession} (${sourceId})`)

  notifyWatchedSource(companionWindow, windowName)
  notifyCompanionState(companionWindow, 'idle')

  // IMMEDIATE first cycle, then a recursive setTimeout chain (each cycle fully
  // finishes before the next is scheduled — no overlap).
  void runCycleAndReschedule(companionWindow, mySession)
}

/** Run one cycle (guarded) then schedule the next, unless the session changed. */
async function runCycleAndReschedule(companionWindow: BrowserWindow, mySession: number): Promise<void> {
  if (mySession !== currentSession) return // a newer session superseded this chain
  if (!isPaused && !inFlight && watchedSourceId) {
    inFlight = true
    try {
      await runOneAnalysisCycle(companionWindow, mySession)
    } catch (error) {
      debugError('[AnalysisLoop] Cycle error:', error)
      notifyCompanionState(companionWindow, 'idle')
    } finally {
      inFlight = false
    }
  }
  scheduleNextCycle(companionWindow, mySession)
}

function scheduleNextCycle(companionWindow: BrowserWindow, mySession: number): void {
  if (mySession !== currentSession) return
  loopTimer = setTimeout(() => { void runCycleAndReschedule(companionWindow, mySession) }, LOOP_INTERVAL_MS)
}

export function stopAnalysisLoop(): void {
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null }
  // Bump the session so any in-flight cycle discards its result.
  currentSession++
  clearStaleState()
  isRunning = false
  isPaused = false
  inFlight = false
  watchedSourceId = null
  watchedWindowName = null
  getSettingsFn = null
  getGoalFn = null
  session = null
  console.log('[AnalysisLoop] Stopped')
}

export function pauseAnalysisLoop(): void { isPaused = true }
export function resumeAnalysisLoop(): void { isPaused = false }
export function setQuietMode(quiet: boolean): void { isQuietMode = quiet }
export function isAnalysisLoopRunning(): boolean { return isRunning && !isPaused && watchedSourceId !== null }

// ─── Question handling ──────────────────────────────────────────────────────

/**
 * Handle a spoken question from the user.
 * Takes a fresh screenshot, combines with session context, gets a conversational answer.
 */
export async function handleQuestion(
  companionWindow: BrowserWindow,
  question: string,
  settings: AppSettings
): Promise<void> {
  if (companionWindow.isDestroyed()) return

  debugLog(`[AnalysisLoop] Question: "${question}"`)
  notifyCompanionState(companionWindow, 'thinking')

  // Capture fresh screenshot if we have a watched window
  let screenshotBase64: string | null = null
  let windowTitle = watchedWindowName || 'unknown'
  if (watchedSourceId) {
    const capture = await captureWatchedWindow(watchedSourceId, watchedWindowName)
    if (capture) {
      screenshotBase64 = capture.imageBase64
      windowTitle = capture.windowTitle
    }
  }

  const provider = getProvider(settings.provider)
  const systemPrompt = buildQuestionSystemPrompt(windowTitle, session)
  const userPrompt = buildQuestionUserPrompt(question, session)

  try {
    // Build the messages for the provider
    // We need to call the provider's raw API since analyzeScreen returns AnalysisResult JSON
    // Use a text-only call via the brainstorm-style interface, but we want a single response
    const answer = await callProviderForAnswer(provider, systemPrompt, userPrompt, screenshotBase64, settings)

    if (!companionWindow.isDestroyed()) {
      companionWindow.webContents.send(IPC.COMPANION_ANSWER, { question, answer })
    }

    // Speak the answer
    await speakText(companionWindow, answer, settings)
  } catch (error) {
    debugError('[AnalysisLoop] Question answer failed:', error)
    if (!companionWindow.isDestroyed()) {
      companionWindow.webContents.send(IPC.COMPANION_ANSWER, {
        question,
        answer: "Sorry, I couldn't process that question. Try again in a moment.",
      })
    }
  }

  notifyCompanionState(companionWindow, 'idle')
}

async function callProviderForAnswer(
  provider: any,
  systemPrompt: string,
  userPrompt: string,
  screenshotBase64: string | null,
  settings: AppSettings
): Promise<string> {
  const providerType = settings.provider
  let url: string
  let headers: Record<string, string>
  let body: any

  if (providerType === 'anthropic') {
    url = 'https://api.anthropic.com/v1/messages'
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    }
    const userContent: any[] = []
    if (screenshotBase64) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 } })
    }
    userContent.push({ type: 'text', text: userPrompt })
    body = {
      model: settings.modelId || 'claude-opus-4-7',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }
  } else if (providerType === 'gemini') {
    const modelId = settings.modelId || 'gemini-2.5-flash'
    // Key in a header, never the URL.
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
    headers = { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey }
    const parts: any[] = []
    if (screenshotBase64) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: screenshotBase64 } })
    }
    parts.push({ text: userPrompt })
    body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 500 },
    }
  } else {
    // OpenAI-compatible (openai, openrouter, ollama, lmstudio, custom)
    let baseUrl = settings.baseUrl || 'https://api.openai.com'
    if (providerType === 'openai') baseUrl = 'https://api.openai.com'
    else if (providerType === 'openrouter') baseUrl = 'https://openrouter.ai/api'
    else if (providerType === 'ollama') baseUrl = settings.baseUrl || 'http://localhost:11434'
    else if (providerType === 'lmstudio') baseUrl = settings.baseUrl || 'http://localhost:1234'

    url = `${baseUrl}/v1/chat/completions`
    headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    }
    if (providerType === 'openrouter') {
      headers['HTTP-Referer'] = 'https://buildy.app'
      headers['X-Title'] = 'Buildy'
    }

    const userContent: any[] = []
    if (screenshotBase64) {
      userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}`, detail: 'high' } })
    }
    userContent.push({ type: 'text', text: userPrompt })

    body = {
      model: settings.modelId || 'gpt-4o',
      max_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }
  }

  const isLocal = providerType === 'ollama' || providerType === 'lmstudio'
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, isLocal)

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Provider returned ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = await response.json()

  // Extract text from response
  if (providerType === 'anthropic') {
    return json.content?.[0]?.text || 'No response.'
  } else if (providerType === 'gemini') {
    return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.'
  } else {
    return json.choices?.[0]?.message?.content || 'No response.'
  }
}

// ─── Core cycle ──────────────────────────────────────────────────────────────

async function runOneAnalysisCycle(
  companionWindow: BrowserWindow,
  mySession: number
): Promise<void> {
  if (companionWindow.isDestroyed() || !watchedSourceId) {
    stopAnalysisLoop()
    return
  }

  // Part 2: reload settings + goal at the START of each cycle so editing the goal
  // or changing settings mid-watch takes effect without restarting the watch.
  const settings = getSettingsFn ? await getSettingsFn() : null
  if (!settings) return
  watchedGoal = getGoalFn ? await getGoalFn() : watchedGoal
  if (isStaleSession(mySession, currentSession)) return

  const thisIsFirstCycle = isFirstCycle
  isFirstCycle = false

  // Step 1: Capture the watched window (NEVER the full screen — see capturer.ts).
  // Identity is (id + selection-time name) so a reused HWND/id can't swap us onto
  // a different window (see findWatchedSource).
  const capture = await captureWatchedWindow(watchedSourceId, watchedWindowName)
  if (isStaleSession(mySession, currentSession)) return
  if (!capture) {
    // Watched window is gone, or its id was reused by a DIFFERENT window. HALT —
    // never switch to or capture another window; only the user picks the target.
    // Structural log only (source id is not screen content).
    console.log(`[Capture] watched window ${watchedSourceId} no longer exists — analysis halted, awaiting reselection`)
    isPaused = true
    if (!companionWindow.isDestroyed()) {
      companionWindow.webContents.send(IPC.COMPANION_WATCHED_SOURCE, {
        windowName: null,
        message: `"${watchedWindowName}" is no longer open. Pick a window to watch.`,
      })
    }
    notifyCompanionState(companionWindow, 'idle')
    return
  }

  // Step 2: Image-level gate — SKIP for first cycle (always analyze on watch start)
  if (!thisIsFirstCycle && previousScreenshot) {
    const changeFraction = computeImageChangeFraction(previousScreenshot, capture.imageBase64)
    if (changeFraction < IMAGE_CHANGE_THRESHOLD) return
  }
  previousScreenshot = capture.imageBase64

  // Step 3: Analyze — pass EMPTY project, AI sees only the screenshot
  notifyCompanionState(companionWindow, 'thinking')

  const provider = getProvider(settings.provider)
  // Inject the user's goal AND the Nemp project-memory context so guidance is
  // memory-aware (knows what's built / decided / blocked).
  let memoryContext = ''
  try {
    memoryContext = await nemp.getContextSummary()
  } catch (error) {
    console.warn('[AnalysisLoop] memory context unavailable:', error)
  }
  const analysisProject = {
    ...EMPTY_PROJECT,
    ...(watchedGoal ? { goal: watchedGoal } : {}),
    memoryContext,
  }
  let analysis: AnalysisResult
  try {
    analysis = await provider.analyzeScreen(capture, analysisProject, settings)
  } catch (error) {
    debugError('[AnalysisLoop] Analysis failed:', error)
    notifyCompanionState(companionWindow, 'idle')
    return
  }

  // ★ STALE-SESSION DISCARD: if the user switched/stopped the watched window while
  // this analysis was in flight, throw the result away — do NOT mutate state, send
  // guidance, or speak. This kills wrong-window guidance from stale cycles.
  if (isStaleSession(mySession, currentSession)) {
    console.log(`[AnalysisLoop] stale cycle discarded (session ${mySession} != ${currentSession})`)
    return
  }

  // Update session context
  updateSession(analysis)

  // Step 4: Analysis-level gate
  const change = detectAnalysisChange(previousAnalysis, analysis)
  previousAnalysis = analysis

  // Seed the per-cycle display analysis, then send it to the companion. Parallel
  // background passes patch THIS object and re-send (never clobber each other).
  displayAnalysis = analysis
  displaySession = mySession
  if (!companionWindow.isDestroyed()) {
    companionWindow.webContents.send(IPC.COMPANION_ANALYSIS, analysis)
  }

  // Verifier (Block 4): if a prompt was suggested on a PREVIOUS cycle, check
  // whether it worked — using THIS analysis as evidence. Capture the pending
  // outcome BEFORE recording the new one below. Runs in parallel, never blocks.
  const toVerify = getMostRecentPending()
  if (toVerify) {
    runVerifier(companionWindow, toVerify, analysis, memoryContext, settings, mySession)
  }
  // Record the CURRENT suggestion as the thing to verify NEXT cycle (no-op if the
  // model produced no prompt / no expected outcome).
  recordPendingOutcome(analysis.nextPrompt, analysis.expectedOutcome || '')

  // Tee the analysis into the memory layer AFTER the UI has it (fire-and-forget,
  // never blocks display).
  teeAnalysisToMemory(analysis)

  // Second-pass prompt-quality grade — runs in parallel, never blocks. If it
  // improves or blanks the prompt, re-send the corrected analysis so the panel
  // updates in place (unless the watch session has since changed).
  gradePromptQuality(companionWindow, analysis, memoryContext, settings, mySession)

  // Step 5: Speak
  // First cycle: ALWAYS speak, no cooldown/quiet/overlap checks
  if (thisIsFirstCycle) {
    debugLog(`[AnalysisLoop] ★ INITIAL analysis — happening: "${analysis.whatIsHappening?.slice(0, 60)}"`)
    debugLog(`[AnalysisLoop] ★ INITIAL analysis — nextMove: "${analysis.bestNextMove?.slice(0, 60)}"`)
    lastSpokeAt = Date.now()
    lastSpokenNextMove = analysis.bestNextMove
    await speakToCompanion(companionWindow, {
      isSignificant: true,
      isHighPriority: false,
      whatChanged: 'new_step',
      whatHappened: analysis.whatIsHappening,
      bestNextMove: analysis.bestNextMove,
    }, settings, false)
  } else {
    console.log(`[AnalysisLoop] Change detected: ${change.whatChanged || 'none'}, significant=${change.isSignificant}, highPri=${change.isHighPriority}`)
    if (shouldSpeak(change)) {
      lastSpokeAt = Date.now()
      lastSpokenNextMove = change.bestNextMove
      // A brand-new blocker is a critical override (truncates the queue after the
      // current chunk). Driven by the model's isCriticalOverride flag.
      await speakToCompanion(companionWindow, change, settings, !!analysis.isCriticalOverride)
    }
  }

  notifyCompanionState(companionWindow, 'idle')
}

// ─── Speech gating (not used for first cycle) ───────────────────────────────

function shouldSpeak(change: AnalysisChangeResult): boolean {
  if (!change.isSignificant) {
    console.log('[AnalysisLoop] No significant change — staying quiet')
    return false
  }
  if (isQuietMode && !change.isHighPriority) {
    console.log('[AnalysisLoop] Quiet mode — suppressing non-priority change')
    return false
  }

  // Cooldown — high-priority changes (blockers, completions) bypass cooldown
  const cooldown = isQuietMode ? QUIET_COOLDOWN_MS : NORMAL_COOLDOWN_MS
  const elapsed = Date.now() - lastSpokeAt
  if (elapsed < cooldown) {
    if (change.whatChanged !== 'blocker' && change.whatChanged !== 'completion') {
      console.log(`[AnalysisLoop] Cooldown active (${Math.round(elapsed / 1000)}s/${Math.round(cooldown / 1000)}s) — waiting`)
      return false
    }
    console.log(`[AnalysisLoop] High-priority "${change.whatChanged}" bypasses cooldown`)
  }

  // Anti-repeat — only block if the next move is nearly identical (>75% overlap)
  if (lastSpokenNextMove && change.bestNextMove) {
    const overlap = quickWordOverlap(lastSpokenNextMove, change.bestNextMove)
    if (overlap > 0.75) {
      console.log(`[AnalysisLoop] Anti-repeat: ${Math.round(overlap * 100)}% overlap — skipping`)
      return false
    }
  }

  debugLog(`[AnalysisLoop] Will speak: ${change.whatChanged} — "${change.whatHappened?.slice(0, 50)}..."`)
  return true
}

function quickWordOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  const wb = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  if (wa.size === 0 && wb.size === 0) return 1
  let n = 0; for (const w of wa) { if (wb.has(w)) n++ }
  const u = wa.size + wb.size - n
  return u > 0 ? n / u : 0
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearStaleState(): void {
  if (loopTimer) { clearTimeout(loopTimer); loopTimer = null }
  previousScreenshot = null
  previousAnalysis = null
  lastSpokeAt = 0
  lastSpokenNextMove = ''
  isFirstCycle = true
  recentSpokenCompletions.clear()
  recentSpokenNextMoves.clear()
  // Drop any pending prompt-outcomes so a new watch session never verifies a
  // suggestion made for a different window.
  clearOutcomes()
  displayAnalysis = null
}

function notifyCompanionState(w: BrowserWindow, state: 'idle' | 'thinking' | 'speaking'): void {
  if (!w.isDestroyed()) w.webContents.send(IPC.COMPANION_STATE, state)
}

function notifyWatchedSource(w: BrowserWindow, windowName: string): void {
  if (!w.isDestroyed()) w.webContents.send(IPC.COMPANION_WATCHED_SOURCE, { windowName, message: null })
}

async function speakToCompanion(
  companionWindow: BrowserWindow,
  change: AnalysisChangeResult,
  settings: AppSettings,
  isCritical = false
): Promise<void> {
  if (companionWindow.isDestroyed()) return

  const now = Date.now()

  // FIX 1 — semantic dedup for completions: if the same fact was already spoken in
  // the last ~3 minutes (in slightly different words), don't repeat it.
  if (change.whatChanged === 'completion' && recentSpokenCompletions.isDuplicate(change.whatHappened, now)) {
    debugLog(`[Speech] Skipped (semantic duplicate of recent): ${change.whatHappened}`)
    // FIX 2 — but if the NEXT STEP is genuinely new, speak only that (not the repeat).
    const next = change.bestNextMove
    if (next && !recentSpokenNextMoves.isDuplicate(next, now)) {
      const nextText = formatSpokenGuidance('', next, 'progress')
      if (nextText) {
        recentSpokenNextMoves.record(next, now)
        debugLog(`[Speech] Display text: "${next}"`)
        debugLog(`[Speech] TTS text: "${nextText}"`)
        debugLog(`[Speech] Formatted for TTS (next-only): "${nextText}"`)
        await speakText(companionWindow, nextText, settings, 'progress', isCritical)
      }
    }
    return
  }

  const text = formatSpokenGuidance(change.whatHappened, change.bestNextMove, change.whatChanged)
  if (!text) {
    console.log('[Speech] Formatter returned empty text — nothing to say')
    return
  }

  // Record what we're about to say so future near-duplicates are caught.
  if (change.whatChanged === 'completion') recentSpokenCompletions.record(change.whatHappened, now)
  if (change.bestNextMove) recentSpokenNextMoves.record(change.bestNextMove, now)

  // Side-by-side sync check: the displayed (panel) content vs the spoken text.
  // These must match in content — TTS may strip markdown but must NOT truncate.
  const displayText = `${change.whatHappened} ${change.bestNextMove}`.replace(/\s+/g, ' ').trim()
  debugLog(`[Speech] Display text: "${displayText}"`)
  debugLog(`[Speech] TTS text: "${text}"`)
  debugLog(`[Speech] Formatted for TTS (${change.whatChanged}): "${text}"`)
  await speakText(companionWindow, text, settings, change.whatChanged, isCritical)
}

/**
 * Hand text to the MAIN-PROCESS voice player (a hidden window that survives
 * companion re-renders / backgrounding). The voice player owns the queue, the
 * lock, chunking, and ElevenLabs synthesis — see voice-player.ts. We only enqueue;
 * we never play here, so new analysis never interrupts the current clip.
 */
async function speakText(
  companionWindow: BrowserWindow,
  text: string,
  _settings: AppSettings,
  changeType?: string | null,
  isCritical = false
): Promise<void> {
  if (companionWindow.isDestroyed()) return
  debugLog(`[Speech] Enqueue to voice player: "${text.slice(0, 80)}..." (critical=${isCritical})`)
  notifyCompanionState(companionWindow, 'speaking')
  enqueueSpeech({ id: `${changeType || 'answer'}-${Date.now()}`, text, isCritical })
}

// ─── Memory + prompt-quality wiring (Block 2 / Part C) ───────────────────────

/**
 * Push the analysis into the Nemp memory layer. Fire-and-forget — the bridge
 * functions log + swallow their own errors, so this never affects the UI.
 */
function teeAnalysisToMemory(analysis: AnalysisResult): void {
  try {
    const id = analysis.analyzedAt
    if (analysis.whatIsHappening) void nemp.recordObservation(analysis.whatIsHappening, id)
    if (analysis.goalAlignment === 'on-track') {
      for (const feature of analysis.whatIsBuilt.slice(0, 5)) void nemp.recordCompletion(feature)
    }
    if (analysis.goalAlignment === 'blocked') {
      for (const broken of analysis.whatIsBroken.slice(0, 5)) void nemp.recordBlocker(broken)
    }
  } catch (error) {
    console.warn('[AnalysisLoop] memory tee failed:', error)
  }
}

/**
 * Run the Haiku second-pass grade in the background. If the prompt is weak, swap
 * in an improved version (or blank it with an explanation) and re-send so the
 * guidance panel updates. Never blocks the main flow.
 */
function gradePromptQuality(
  companionWindow: BrowserWindow,
  analysis: AnalysisResult,
  memoryContext: string,
  settings: AppSettings,
  mySession: number
): void {
  void (async () => {
    try {
      const result = await checkPromptQuality(analysis, memoryContext, watchedGoal, settings)
      if (result.valid) return
      // Don't re-send guidance for a window the user has since switched away from.
      if (isStaleSession(mySession, currentSession)) return

      const patch: Partial<AnalysisResult> = {}
      if (result.improvedPrompt) {
        patch.nextPrompt = result.improvedPrompt
        console.log('[AnalysisLoop] Prompt replaced by grader-improved version')
      } else {
        patch.nextPrompt = ''
        patch.alignmentNote = result.reason
          ? `No prompt suggested: ${result.reason}`
          : (analysis.alignmentNote || 'No high-quality next prompt right now.')
        console.log('[AnalysisLoop] Prompt blanked by grader (no improvement available)')
      }
      patchDisplayAndResend(companionWindow, patch, mySession)
    } catch (error) {
      debugError('[AnalysisLoop] prompt-quality grading failed:', error)
    }
  })()
}

/**
 * Merge a patch into the current cycle's display analysis and re-send it to the
 * companion so the guidance panel updates in place. Discards the patch if the
 * watch session has advanced or the display belongs to a different cycle — so a
 * stale background pass can never repaint the wrong window's guidance.
 */
function patchDisplayAndResend(
  companionWindow: BrowserWindow,
  patch: Partial<AnalysisResult>,
  mySession: number
): void {
  if (isStaleSession(mySession, currentSession)) return
  if (displaySession !== mySession || !displayAnalysis) return
  displayAnalysis = { ...displayAnalysis, ...patch }
  if (!companionWindow.isDestroyed()) {
    companionWindow.webContents.send(IPC.COMPANION_ANALYSIS, displayAnalysis)
  }
}

/**
 * Verifier (Block 4): judge whether a previously-suggested prompt achieved its
 * expected outcome, using the current analysis as evidence. Runs in parallel and
 * respects the session token, so a stale-window verdict is discarded and voice
 * never fires for the wrong window. Records completions/blockers in Nemp and, on
 * failure, swaps in a corrective prompt.
 */
function runVerifier(
  companionWindow: BrowserWindow,
  pending: PromptOutcome,
  analysis: AnalysisResult,
  memoryContext: string,
  settings: AppSettings,
  mySession: number
): void {
  void (async () => {
    try {
      const verdict = await verifyPromptOutcome(pending, analysis, watchedGoal, memoryContext, settings)
      // Not enough evidence yet — leave it pending for a later cycle, show nothing.
      if (verdict.status === 'still_pending') return
      // Don't repaint / record for a window the user has since switched away from.
      if (isStaleSession(mySession, currentSession)) return

      resolveOutcome(pending.id, verdict.status, verdict.note, verdict.correctivePrompt)

      const note = verdict.note || pending.expectedOutcome
      if (verdict.status === 'success') {
        void nemp.recordCompletion(pending.expectedOutcome)
      } else if (verdict.status === 'failed') {
        void nemp.recordBlocker(note)
      }

      const verification: VerificationVerdict = { status: verdict.status, note }
      const patch: Partial<AnalysisResult> = { verification }
      // On a failed/partial outcome, offer the corrective prompt as the next step.
      if (verdict.correctivePrompt) patch.nextPrompt = verdict.correctivePrompt
      patchDisplayAndResend(companionWindow, patch, mySession)
      console.log(`[Verifier] previous prompt → ${verdict.status}`)
    } catch (error) {
      debugError('[AnalysisLoop] verifier failed:', error)
    }
  })()
}
