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
import type { AppSettings, AnalysisResult } from '../renderer/src/types'
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
import { synthesizeSpeech } from './ai/elevenlabs-tts'
import { formatSpokenGuidance } from './ai/speech-formatter'
import { buildQuestionSystemPrompt, buildQuestionUserPrompt } from './ai/prompt-builder'
import { fetchWithTimeout } from './ai/fetch-with-timeout'

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

let loopTimer: ReturnType<typeof setInterval> | null = null
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
let settingsGetter: (() => AppSettings) | null = null

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
  getSettings: () => AppSettings
): void {
  clearStaleState()

  companionRef = companionWindow
  watchedSourceId = sourceId
  watchedWindowName = windowName
  settingsGetter = getSettings
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

  console.log(`[AnalysisLoop] Now watching: "${windowName}" (${sourceId})`)

  notifyWatchedSource(companionWindow, windowName)
  notifyCompanionState(companionWindow, 'idle')

  // IMMEDIATE first analysis — no delay
  runOneAnalysisCycle(companionWindow, getSettings()).catch((err) => {
    console.error('[AnalysisLoop] Initial cycle error:', err)
    notifyCompanionState(companionWindow, 'idle')
  })

  // Continuous loop after first cycle
  loopTimer = setInterval(async () => {
    if (isPaused || !watchedSourceId) return
    try {
      await runOneAnalysisCycle(companionWindow, getSettings())
    } catch (error) {
      console.error('[AnalysisLoop] Cycle error:', error)
      notifyCompanionState(companionWindow, 'idle')
    }
  }, LOOP_INTERVAL_MS)
}

export function stopAnalysisLoop(): void {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null }
  clearStaleState()
  isRunning = false
  isPaused = false
  watchedSourceId = null
  watchedWindowName = null
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

  console.log(`[AnalysisLoop] Question: "${question}"`)
  notifyCompanionState(companionWindow, 'thinking')

  // Capture fresh screenshot if we have a watched window
  let screenshotBase64: string | null = null
  let windowTitle = watchedWindowName || 'unknown'
  if (watchedSourceId) {
    const capture = await captureWatchedWindow(watchedSourceId)
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
    console.error('[AnalysisLoop] Question answer failed:', error)
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
    const baseUrl = (settings.useProxy && settings.proxyUrl) ? settings.proxyUrl : 'https://api.anthropic.com'
    url = `${baseUrl}/v1/messages`
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
      model: settings.modelId || 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    }
  } else if (providerType === 'gemini') {
    const modelId = settings.modelId || 'gemini-2.5-flash'
    url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${settings.apiKey}`
    headers = { 'Content-Type': 'application/json' }
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
  settings: AppSettings
): Promise<void> {
  if (companionWindow.isDestroyed() || !watchedSourceId) {
    stopAnalysisLoop()
    return
  }

  const thisIsFirstCycle = isFirstCycle
  isFirstCycle = false

  // Step 1: Capture the watched window
  const capture = await captureWatchedWindow(watchedSourceId)
  if (!capture) {
    console.log(`[AnalysisLoop] Watched window disappeared: "${watchedWindowName}"`)
    isPaused = true
    if (!companionWindow.isDestroyed()) {
      companionWindow.webContents.send(IPC.COMPANION_WATCHED_SOURCE, {
        windowName: null,
        message: `"${watchedWindowName}" is no longer open. Pick a new window.`,
      })
    }
    notifyCompanionState(companionWindow, 'idle')
    return
  }

  // Update window name if title changed
  if (capture.windowTitle !== watchedWindowName) {
    watchedWindowName = capture.windowTitle
    if (session) session.windowName = watchedWindowName
    notifyWatchedSource(companionWindow, watchedWindowName)
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
  let analysis: AnalysisResult
  try {
    analysis = await provider.analyzeScreen(capture, EMPTY_PROJECT, settings)
  } catch (error) {
    console.error('[AnalysisLoop] Analysis failed:', error)
    notifyCompanionState(companionWindow, 'idle')
    return
  }

  // Update session context
  updateSession(analysis)

  // Step 4: Analysis-level gate
  const change = detectAnalysisChange(previousAnalysis, analysis)
  previousAnalysis = analysis

  // Send analysis to companion for prompt card
  if (!companionWindow.isDestroyed()) {
    companionWindow.webContents.send(IPC.COMPANION_ANALYSIS, analysis)
  }

  // Step 5: Speak
  // First cycle: ALWAYS speak, no cooldown/quiet/overlap checks
  if (thisIsFirstCycle) {
    console.log(`[AnalysisLoop] ★ INITIAL analysis — happening: "${analysis.whatIsHappening?.slice(0, 60)}"`)
    console.log(`[AnalysisLoop] ★ INITIAL analysis — nextMove: "${analysis.bestNextMove?.slice(0, 60)}"`)
    lastSpokeAt = Date.now()
    lastSpokenNextMove = analysis.bestNextMove
    await speakToCompanion(companionWindow, {
      isSignificant: true,
      isHighPriority: false,
      whatChanged: 'new_step',
      whatHappened: analysis.whatIsHappening,
      bestNextMove: analysis.bestNextMove,
    }, settings)
  } else {
    console.log(`[AnalysisLoop] Change detected: ${change.whatChanged || 'none'}, significant=${change.isSignificant}, highPri=${change.isHighPriority}`)
    if (shouldSpeak(change)) {
      lastSpokeAt = Date.now()
      lastSpokenNextMove = change.bestNextMove
      await speakToCompanion(companionWindow, change, settings)
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

  console.log(`[AnalysisLoop] Will speak: ${change.whatChanged} — "${change.whatHappened?.slice(0, 50)}..."`)
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
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null }
  previousScreenshot = null
  previousAnalysis = null
  lastSpokeAt = 0
  lastSpokenNextMove = ''
  isFirstCycle = true
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
  settings: AppSettings
): Promise<void> {
  if (companionWindow.isDestroyed()) return
  const text = formatSpokenGuidance(change.whatHappened, change.bestNextMove, change.whatChanged)
  if (!text) {
    console.log('[Speech] Formatter returned empty text — nothing to say')
    return
  }
  console.log(`[Speech] Formatted for TTS (${change.whatChanged}): "${text}"`)
  await speakText(companionWindow, text, settings, change.whatChanged)
}

async function speakText(
  companionWindow: BrowserWindow,
  text: string,
  settings: AppSettings,
  changeType?: string | null
): Promise<void> {
  if (companionWindow.isDestroyed()) return

  console.log(`[Speech] Attempting to speak: "${text.slice(0, 80)}..."`)
  notifyCompanionState(companionWindow, 'speaking')

  // Try ElevenLabs first
  if (settings.elevenLabsApiKey) {
    try {
      console.log('[Speech] Trying ElevenLabs TTS...')
      const result = await synthesizeSpeech(text, settings.elevenLabsApiKey, settings.elevenLabsVoiceId || '21m00Tcm4TlvDq8ikWAM')
      if (result.success && result.audioBase64 && !companionWindow.isDestroyed()) {
        console.log('[Speech] ElevenLabs success — sending audio to companion')
        companionWindow.webContents.send(IPC.COMPANION_AUDIO, { audioBase64: result.audioBase64, text, type: changeType || 'answer' })
        return
      }
      console.warn(`[Speech] ElevenLabs failed: ${result.error}`)
    } catch (err) {
      console.error('[Speech] ElevenLabs exception:', err)
    }
  } else {
    console.log('[Speech] No ElevenLabs key — using system TTS fallback')
  }

  // Fall through to system TTS
  if (!companionWindow.isDestroyed()) {
    console.log('[Speech] Sending COMPANION_SPEAK for system TTS')
    companionWindow.webContents.send(IPC.COMPANION_SPEAK, { text, type: changeType || 'answer' })
  }
}
