// ipc-handlers.ts — main process
// All IPC channels registered in one place.
// Every channel name is defined in types.ts (IPC constant) to prevent typos.

import { ipcMain, clipboard, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types'
import type { AppSettings, NonSecretSettings, GuidancePayload } from '../renderer/src/types'
import { showGuidanceWindow, hideGuidanceWindow, resizeGuidanceWindow, showLastGuidance } from './guidance-window'
import { handleVoiceEnded, handleVoiceError, stopVoice, setVoiceMuted, resetVoiceDedup } from './voice-player'
import * as nemp from './nemp-bridge'
import { listOpenWindows, captureWindowForAnalysis } from './capturer'
import {
  loadProjectMemory, saveProjectMemory, loadGoal, setGoal, updateGoal,
  loadSettings, loadRedactedSettings, saveNonSecretSettings, resolveSettings,
} from './memory'
import { setSecret } from './secure-store'
import { debugLog, debugError } from './debug-log'
import { getProvider } from './ai/provider-registry'
import { allProviderInfos } from './ai/provider-registry'
import { testProviderConnection } from './ai/connection-test'
import { startWatching, stopAnalysisLoop, pauseAnalysisLoop, resumeAnalysisLoop, setQuietMode, handleQuestion } from './analysis-loop'
import {
  parseInput, assertFromMainWindow, isAllowedBaseUrl,
  nonSecretSettingsSchema, setSecretSchema, captureResultSchema, projectMemorySchema,
  goalPartialSchema, shortText, sourceId as sourceIdSchema, windowName as windowNameSchema,
  confidenceEnum, chatHistorySchema,
} from './ipc-schemas'

// Registered ONCE at startup. Window references are GETTERS so handlers always
// target the current window even if a window is recreated (no re-registration,
// no duplicate-handler throws, no stacked listeners).
export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow,
  getCompanionWindow: () => BrowserWindow | null
): void {

  const mainWcId = (): number => getMainWindow().webContents.id

  // Companion settings cache (resolved AppSettings, secrets injected). Invalidated
  // whenever settings/secrets change so API calls use the latest key.
  let cachedSettings: AppSettings | null = null
  let lastSettingsLoad = 0
  const SETTINGS_REFRESH_MS = 10_000

  async function getFreshSettings(): Promise<AppSettings> {
    if (!cachedSettings || Date.now() - lastSettingsLoad > SETTINGS_REFRESH_MS) {
      cachedSettings = await loadSettings()
      lastSettingsLoad = Date.now()
    }
    return cachedSettings
  }
  function invalidateSettingsCache(): void { cachedSettings = null; lastSettingsLoad = 0 }

  // Validate renderer-supplied non-secret settings + base-URL allowlist, then
  // resolve the (main-owned) secrets. Renderer keys are never trusted here.
  function resolveValidatedSettings(channel: string, input: unknown): AppSettings {
    const nonSecret = parseInput(nonSecretSettingsSchema, channel, input) as NonSecretSettings
    if (!isAllowedBaseUrl(nonSecret.provider, nonSecret.baseUrl)) {
      console.warn(`[IPC] rejected invalid input on channel ${channel}: baseUrl not allowed for provider ${nonSecret.provider}`)
      throw new Error(`Disallowed base URL on ${channel}`)
    }
    return resolveSettings(nonSecret)
  }

  // ─── Window listing ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.LIST_WINDOWS, async () => {
    try {
      return await listOpenWindows()
    } catch (error) {
      console.error('[IPC] LIST_WINDOWS error:', error)
      throw error
    }
  })

  // ─── Screen capture ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.CAPTURE_WINDOW, async (_event, rawSourceId: unknown) => {
    try {
      const sid = rawSourceId == null ? null : parseInput(sourceIdSchema, 'CAPTURE_WINDOW', rawSourceId)
      return await captureWindowForAnalysis(sid)
    } catch (error) {
      console.error('[IPC] CAPTURE_WINDOW error:', error)
      throw error
    }
  })

  // ─── Screen analysis (provider-agnostic) ────────────────────────────────────

  ipcMain.handle(IPC.ANALYZE, async (_event, captureRaw: unknown, projectRaw: unknown, settingsRaw: unknown) => {
    try {
      const capture = parseInput(captureResultSchema, 'ANALYZE', captureRaw)
      const project = parseInput(projectMemorySchema, 'ANALYZE', projectRaw)
      const settings = resolveValidatedSettings('ANALYZE', settingsRaw)
      const provider = getProvider(settings.provider)
      return await provider.analyzeScreen(capture as never, project as never, settings)
    } catch (error) {
      console.error('[IPC] ANALYZE error:', error)
      throw error
    }
  })

  // ─── Brainstorm streaming (provider-agnostic) ───────────────────────────────

  ipcMain.handle(IPC.BRAINSTORM_START, async (_event, userMessageRaw: unknown, historyRaw: unknown, settingsRaw: unknown) => {
    try {
      const userMessage = parseInput(shortText, 'BRAINSTORM_START', userMessageRaw)
      const history = parseInput(chatHistorySchema, 'BRAINSTORM_START', historyRaw)
      const settings = resolveValidatedSettings('BRAINSTORM_START', settingsRaw)
      const provider = getProvider(settings.provider)
      await provider.streamBrainstorm(getMainWindow().webContents, userMessage, history as never, settings)
    } catch (error) {
      console.error('[IPC] BRAINSTORM_START error:', error)
      getMainWindow().webContents.send(IPC.BRAINSTORM_ERROR, String(error))
    }
  })

  // ─── Provider info (for Settings UI) ────────────────────────────────────────

  ipcMain.handle(IPC.GET_PROVIDER_INFOS, async () => {
    return allProviderInfos
  })

  // ─── Connection test ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.TEST_CONNECTION, async (_event, settingsRaw: unknown) => {
    try {
      const settings = resolveValidatedSettings('TEST_CONNECTION', settingsRaw)
      return await testProviderConnection(settings)
    } catch (error) {
      return { success: false, message: String(error) }
    }
  })

  // ─── Project memory persistence ──────────────────────────────────────────────

  ipcMain.handle(IPC.LOAD_PROJECT, async () => {
    try {
      return await loadProjectMemory()
    } catch (error) {
      console.error('[IPC] LOAD_PROJECT error:', error)
      throw error
    }
  })

  ipcMain.handle(IPC.SAVE_PROJECT, async (_event, projectRaw: unknown) => {
    try {
      const projectMemory = parseInput(projectMemorySchema, 'SAVE_PROJECT', projectRaw)
      await saveProjectMemory(projectMemory as never)
    } catch (error) {
      console.error('[IPC] SAVE_PROJECT error:', error)
      throw error
    }
  })

  // ─── Goal persistence (stored on the local project memory file) ──────────────

  ipcMain.handle(IPC.GOAL_GET, async () => {
    try {
      return await loadGoal()
    } catch (error) {
      console.error('[IPC] GOAL_GET error:', error)
      return null
    }
  })

  ipcMain.handle(IPC.GOAL_SET, async (_event, goalRaw: unknown) => {
    try {
      const goal = parseInput(goalPartialSchema, 'GOAL_SET', goalRaw)
      return await setGoal(goal)
    } catch (error) {
      console.error('[IPC] GOAL_SET error:', error)
      throw error
    }
  })

  ipcMain.handle(IPC.GOAL_UPDATE, async (_event, partialRaw: unknown) => {
    try {
      const partial = parseInput(goalPartialSchema, 'GOAL_UPDATE', partialRaw)
      return await updateGoal(partial)
    } catch (error) {
      console.error('[IPC] GOAL_UPDATE error:', error)
      throw error
    }
  })

  // ─── Settings persistence ────────────────────────────────────────────────────

  // Renderer ONLY ever gets the redacted view (no raw keys, just has* booleans).
  ipcMain.handle(IPC.LOAD_SETTINGS, async () => {
    try {
      return await loadRedactedSettings()
    } catch (error) {
      console.error('[IPC] LOAD_SETTINGS error:', error)
      throw error
    }
  })

  // Save NON-SECRET settings only. Any stray key fields are stripped by the schema.
  ipcMain.handle(IPC.SAVE_SETTINGS, async (event, settingsRaw: unknown) => {
    try {
      assertFromMainWindow(event, mainWcId(), 'SAVE_SETTINGS')
      const nonSecret = parseInput(nonSecretSettingsSchema, 'SAVE_SETTINGS', settingsRaw)
      if (!isAllowedBaseUrl(nonSecret.provider, nonSecret.baseUrl)) {
        console.warn(`[IPC] rejected invalid input on channel SAVE_SETTINGS: baseUrl not allowed for provider ${nonSecret.provider}`)
        throw new Error('Disallowed base URL on SAVE_SETTINGS')
      }
      await saveNonSecretSettings(nonSecret)
      invalidateSettingsCache()
    } catch (error) {
      console.error('[IPC] SAVE_SETTINGS error:', error)
      throw error
    }
  })

  // Store an API key (one-way renderer→main). Only the main settings window may do this.
  ipcMain.handle(IPC.SET_SECRET, async (event, raw: unknown) => {
    try {
      assertFromMainWindow(event, mainWcId(), 'SET_SECRET')
      const { name, value } = parseInput(setSecretSchema, 'SET_SECRET', raw)
      setSecret(name, value) // never logged
      invalidateSettingsCache()
    } catch (error) {
      console.error('[IPC] SET_SECRET error:', error)
      throw error
    }
  })

  // ─── Companion mode ─────────────────────────────────────────────────────────

  // COMPANION_START is a no-op — watching only begins when user picks a window
  ipcMain.handle(IPC.COMPANION_START, async () => {
    // Intentionally empty — companion stays idle until SELECT_WATCH_SOURCE
  })

  // User explicitly picks a window to watch
  // NOTE: Companion uses NO project memory — it analyzes only what it sees on screen
  ipcMain.handle(
    IPC.SELECT_WATCH_SOURCE,
    async (_event, sourceIdRaw: unknown, windowNameRaw: unknown) => {
      const companion = getCompanionWindow()
      if (!companion) return
      try {
        const sid = parseInput(sourceIdSchema, 'SELECT_WATCH_SOURCE', sourceIdRaw)
        const wname = parseInput(windowNameSchema, 'SELECT_WATCH_SOURCE', windowNameRaw)
        // The loop reloads settings + goal at the START of each cycle (async getters),
        // so editing the goal or settings mid-watch takes effect without restarting.
        startWatching(companion, sid, wname, () => loadSettings(), () => loadGoal())
      } catch (error) {
        console.error('[IPC] SELECT_WATCH_SOURCE error:', error)
      }
    }
  )

  ipcMain.handle(IPC.COMPANION_STOP, async () => {
    stopAnalysisLoop()
  })

  ipcMain.handle(IPC.COMPANION_PAUSE, async () => {
    pauseAnalysisLoop()
  })

  ipcMain.handle(IPC.COMPANION_RESUME, async () => {
    resumeAnalysisLoop()
  })

  ipcMain.handle(IPC.COMPANION_QUIET, async (_event, quiet: boolean) => {
    setQuietMode(quiet)
  })

  // User asks a spoken question — answer using current watched window context
  ipcMain.handle(IPC.ASK_QUESTION, async (_event, questionRaw: unknown) => {
    const companion = getCompanionWindow()
    if (!companion) return
    try {
      const question = parseInput(shortText, 'ASK_QUESTION', questionRaw)
      const settings = await getFreshSettings()
      await handleQuestion(companion, question, settings)
    } catch (error) {
      console.error('[IPC] ASK_QUESTION error:', error)
    }
  })

  // Transcribe audio via ElevenLabs Speech-to-Text
  ipcMain.handle(IPC.TRANSCRIBE_AUDIO, async (_event, audioBuffer: Buffer) => {
    try {
      const settings = await getFreshSettings()
      return await transcribeWithElevenLabs(audioBuffer, settings)
    } catch (error) {
      console.error('[IPC] TRANSCRIBE_AUDIO error:', error)
      return { success: false, text: '', error: String(error) }
    }
  })

  ipcMain.on(IPC.OPEN_PANEL, () => {
    const mw = getMainWindow()
    if (!mw.isDestroyed()) {
      mw.show()
      mw.focus()
    }
  })

  ipcMain.handle(IPC.RESET_COMPANION, async () => {
    const { resetCompanionPosition } = require('./companion-window')
    resetCompanionPosition()
  })

  ipcMain.handle(IPC.SHOW_COMPANION, async () => {
    const { showCompanion } = require('./companion-window')
    showCompanion()
  })

  // ─── Guidance panel (secondary window) ───────────────────────────────────────

  ipcMain.on(IPC.GUIDANCE_SHOW, (_event, payload: GuidancePayload) => {
    showGuidanceWindow(payload)
  })

  ipcMain.on(IPC.GUIDANCE_HIDE, () => {
    hideGuidanceWindow()
  })

  ipcMain.on(IPC.GUIDANCE_SHOW_LAST, () => {
    showLastGuidance()
  })

  ipcMain.on(IPC.GUIDANCE_RESIZE, (_event, height: number) => {
    resizeGuidanceWindow(height)
  })

  // Clipboard via main — reliable even from the non-focusable guidance window,
  // where navigator.clipboard would throw "Document is not focused".
  ipcMain.handle(IPC.COPY_TEXT, async (_event, text: string) => {
    clipboard.writeText(text)
  })

  // ─── Memory layer (Nemp bridge) ──────────────────────────────────────────────

  ipcMain.handle(IPC.MEMORY_GET, async () => nemp.getSnapshot())
  ipcMain.handle(IPC.MEMORY_GET_CONTEXT, async (_e, maxTokens?: unknown) =>
    nemp.getContextSummary(typeof maxTokens === 'number' ? maxTokens : undefined))
  ipcMain.handle(IPC.MEMORY_SEARCH, async (_e, query: unknown) =>
    nemp.searchMemories(parseInput(shortText, 'MEMORY_SEARCH', query)))
  ipcMain.handle(IPC.MEMORY_ADD_OBSERVATION, async (_e, text: unknown, sourceAnalysisId?: unknown) =>
    nemp.recordObservation(parseInput(shortText, 'MEMORY_ADD_OBSERVATION', text), typeof sourceAnalysisId === 'string' ? sourceAnalysisId : undefined))
  ipcMain.handle(IPC.MEMORY_ADD_COMPLETION, async (_e, feature: unknown) =>
    nemp.recordCompletion(parseInput(shortText, 'MEMORY_ADD_COMPLETION', feature)))
  ipcMain.handle(IPC.MEMORY_ADD_BLOCKER, async (_e, description: unknown) =>
    nemp.recordBlocker(parseInput(shortText, 'MEMORY_ADD_BLOCKER', description)))
  ipcMain.handle(IPC.MEMORY_RESOLVE_BLOCKER, async (_e, blockerId: unknown, resolution: unknown) =>
    nemp.resolveBlocker(parseInput(shortText, 'MEMORY_RESOLVE_BLOCKER', blockerId), parseInput(shortText, 'MEMORY_RESOLVE_BLOCKER', resolution)))
  ipcMain.handle(IPC.MEMORY_ADD_DECISION, async (_e, question: unknown, choice: unknown, reasoning?: unknown) =>
    nemp.recordDecision(parseInput(shortText, 'MEMORY_ADD_DECISION', question), parseInput(shortText, 'MEMORY_ADD_DECISION', choice), typeof reasoning === 'string' ? reasoning : undefined))
  ipcMain.handle(IPC.MEMORY_ADD_PATTERN, async (_e, observation: unknown, confidence: unknown) =>
    nemp.recordPattern(parseInput(shortText, 'MEMORY_ADD_PATTERN', observation), parseInput(confidenceEnum, 'MEMORY_ADD_PATTERN', confidence)))
  ipcMain.handle(IPC.MEMORY_EXPORT_BUILDYMD, async () => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Export BUILDY.md',
      defaultPath: 'BUILDY.md',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await nemp.exportToBuildyMd(result.filePath)
    return { saved: true, path: result.filePath }
  })
  ipcMain.handle(IPC.MEMORY_RESET, async () => nemp.resetMemory())

  // ─── Voice player ─────────────────────────────────────────────────────────────

  // From the hidden voice window:
  ipcMain.on(IPC.VOICE_ENDED, (_e, id: string) => handleVoiceEnded(id))
  ipcMain.on(IPC.VOICE_ERROR, (_e, id: string) => handleVoiceError(id))
  // From the companion (explicit user actions only):
  ipcMain.on(IPC.VOICE_CTL_STOP, () => stopVoice())
  ipcMain.on(IPC.VOICE_CTL_MUTE, (_e, muted: boolean) => setVoiceMuted(muted))
  ipcMain.on(IPC.VOICE_CTL_RESET, () => resetVoiceDedup())
}

// ─── ElevenLabs Speech-to-Text ───────────────────────────────────────────────

async function transcribeWithElevenLabs(
  audioBuffer: Buffer,
  settings: AppSettings
): Promise<{ success: boolean; text: string; error?: string }> {
  const apiKey = settings.elevenLabsApiKey
  if (!apiKey) {
    console.log('[ElevenLabs STT] No ElevenLabs API key configured')
    return { success: false, text: '', error: 'No ElevenLabs API key configured. Add it in Settings.' }
  }

  const url = 'https://api.elevenlabs.io/v1/speech-to-text'
  console.log(`[ElevenLabs STT] Transcribing ${audioBuffer.length} bytes → ${url}`)

  try {
    // Use native FormData (Node 18+) — avoids manual boundary issues with undici
    const { FormData, Blob } = require('buffer')
    const formData = new globalThis.FormData()

    // Create a proper Blob from the audio buffer
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' })
    formData.append('file', audioBlob, 'audio.webm')
    formData.append('model_id', 'scribe_v1')

    console.log('[ElevenLabs STT] Sending request with FormData...')
    const startTime = Date.now()

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
        },
        body: formData,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    const elapsed = Date.now() - startTime
    console.log(`[ElevenLabs STT] Response: ${response.status} in ${elapsed}ms`)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`[ElevenLabs STT] API error ${response.status}`)
      debugError(`[ElevenLabs STT] error body: ${errText.slice(0, 300)}`)
      return { success: false, text: '', error: `ElevenLabs STT error ${response.status}: ${errText.slice(0, 120)}` }
    }

    const json = await response.json()
    debugLog('[ElevenLabs STT] Response body:', JSON.stringify(json).slice(0, 300))

    const text = json.text?.trim() || ''

    if (!text) {
      console.log('[ElevenLabs STT] No speech detected in audio')
      return { success: false, text: '', error: 'No speech detected. Try speaking louder or longer.' }
    }

    // Transcribed user speech — content-bearing, gated.
    debugLog(`[ElevenLabs STT] Transcribed: "${text}"`)
    return { success: true, text }
  } catch (error: any) {
    const msg = String(error?.message || error)
    debugError(`[ElevenLabs STT] Exception: ${msg}`)

    if (msg.includes('abort') || msg.includes('TIMEOUT')) {
      return { success: false, text: '', error: 'ElevenLabs STT timed out (30s). Check your internet connection.' }
    }
    return { success: false, text: '', error: `STT failed: ${msg.slice(0, 120)}` }
  }
}
