// ipc-handlers.ts — main process
// All IPC channels registered in one place.
// Every channel name is defined in types.ts (IPC constant) to prevent typos.

import { ipcMain, clipboard } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types'
import type { ProjectMemory, AppSettings, CaptureResult, Goal, GuidancePayload } from '../renderer/src/types'
import { showGuidanceWindow, hideGuidanceWindow, resizeGuidanceWindow, showLastGuidance } from './guidance-window'
import { listOpenWindows, captureWindowForAnalysis } from './capturer'
import { loadProjectMemory, saveProjectMemory, loadSettings, saveSettings, loadGoal, setGoal, updateGoal } from './memory'
import { getProvider } from './ai/provider-registry'
import { allProviderInfos } from './ai/provider-registry'
import { testProviderConnection } from './ai/connection-test'
import { startWatching, stopAnalysisLoop, pauseAnalysisLoop, resumeAnalysisLoop, setQuietMode, handleQuestion } from './analysis-loop'
import { fetchWithTimeout } from './ai/fetch-with-timeout'

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  companionWindow: BrowserWindow | null
): void {

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

  ipcMain.handle(IPC.CAPTURE_WINDOW, async (_event, sourceId: string | null) => {
    try {
      return await captureWindowForAnalysis(sourceId)
    } catch (error) {
      console.error('[IPC] CAPTURE_WINDOW error:', error)
      throw error
    }
  })

  // ─── Screen analysis (provider-agnostic) ────────────────────────────────────

  ipcMain.handle(
    IPC.ANALYZE,
    async (_event, capture: CaptureResult, project: ProjectMemory, settings: AppSettings) => {
      try {
        const provider = getProvider(settings.provider)
        return await provider.analyzeScreen(capture, project, settings)
      } catch (error) {
        console.error('[IPC] ANALYZE error:', error)
        throw error
      }
    }
  )

  // ─── Brainstorm streaming (provider-agnostic) ───────────────────────────────

  ipcMain.handle(
    IPC.BRAINSTORM_START,
    async (
      _event,
      userMessage: string,
      conversationHistory: Array<{ role: string; content: string; timestamp: string }>,
      settings: AppSettings
    ) => {
      try {
        const provider = getProvider(settings.provider)
        await provider.streamBrainstorm(
          mainWindow.webContents,
          userMessage,
          conversationHistory,
          settings
        )
      } catch (error) {
        console.error('[IPC] BRAINSTORM_START error:', error)
        mainWindow.webContents.send(IPC.BRAINSTORM_ERROR, String(error))
      }
    }
  )

  // ─── Provider info (for Settings UI) ────────────────────────────────────────

  ipcMain.handle(IPC.GET_PROVIDER_INFOS, async () => {
    return allProviderInfos
  })

  // ─── Connection test ─────────────────────────────────────────────────────────

  ipcMain.handle(IPC.TEST_CONNECTION, async (_event, settings: AppSettings) => {
    try {
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

  ipcMain.handle(IPC.SAVE_PROJECT, async (_event, projectMemory: ProjectMemory) => {
    try {
      await saveProjectMemory(projectMemory)
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

  ipcMain.handle(IPC.GOAL_SET, async (_event, goal: Partial<Goal>) => {
    try {
      return await setGoal(goal)
    } catch (error) {
      console.error('[IPC] GOAL_SET error:', error)
      throw error
    }
  })

  ipcMain.handle(IPC.GOAL_UPDATE, async (_event, partial: Partial<Goal>) => {
    try {
      return await updateGoal(partial)
    } catch (error) {
      console.error('[IPC] GOAL_UPDATE error:', error)
      throw error
    }
  })

  // ─── Settings persistence ────────────────────────────────────────────────────

  ipcMain.handle(IPC.LOAD_SETTINGS, async () => {
    try {
      return await loadSettings()
    } catch (error) {
      console.error('[IPC] LOAD_SETTINGS error:', error)
      throw error
    }
  })

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_event, settings: AppSettings) => {
    try {
      await saveSettings(settings)
    } catch (error) {
      console.error('[IPC] SAVE_SETTINGS error:', error)
      throw error
    }
  })

  // ─── Companion mode ─────────────────────────────────────────────────────────

  // Cache settings only — companion does NOT use project memory (demo mode)
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

  // COMPANION_START is a no-op — watching only begins when user picks a window
  ipcMain.handle(IPC.COMPANION_START, async () => {
    // Intentionally empty — companion stays idle until SELECT_WATCH_SOURCE
  })

  // User explicitly picks a window to watch
  // NOTE: Companion uses NO project memory — it analyzes only what it sees on screen
  ipcMain.handle(
    IPC.SELECT_WATCH_SOURCE,
    async (_event, sourceId: string, windowName: string) => {
      if (!companionWindow) return
      try {
        cachedSettings = await loadSettings()
        lastSettingsLoad = Date.now()
        // Load the user's goal (if any) so the analysis loop can inject it into prompts
        const goal = await loadGoal()
        startWatching(
          companionWindow,
          sourceId,
          windowName,
          () => { getFreshSettings(); return cachedSettings! },
          goal
        )
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
  ipcMain.handle(IPC.ASK_QUESTION, async (_event, question: string) => {
    if (!companionWindow) return
    try {
      const settings = await getFreshSettings()
      await handleQuestion(companionWindow, question, settings)
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
    if (!mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
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
      console.error(`[ElevenLabs STT] API error ${response.status}: ${errText.slice(0, 300)}`)
      return { success: false, text: '', error: `ElevenLabs STT error ${response.status}: ${errText.slice(0, 120)}` }
    }

    const json = await response.json()
    console.log('[ElevenLabs STT] Response body:', JSON.stringify(json).slice(0, 300))

    const text = json.text?.trim() || ''

    if (!text) {
      console.log('[ElevenLabs STT] No speech detected in audio')
      return { success: false, text: '', error: 'No speech detected. Try speaking louder or longer.' }
    }

    console.log(`[ElevenLabs STT] Transcribed: "${text}"`)
    return { success: true, text }
  } catch (error: any) {
    const msg = String(error?.message || error)
    console.error(`[ElevenLabs STT] Exception: ${msg}`)

    if (msg.includes('abort') || msg.includes('TIMEOUT')) {
      return { success: false, text: '', error: 'ElevenLabs STT timed out (30s). Check your internet connection.' }
    }
    return { success: false, text: '', error: `STT failed: ${msg.slice(0, 120)}` }
  }
}
