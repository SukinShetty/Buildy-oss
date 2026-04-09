// ipc-handlers.ts — main process
// All IPC channels registered in one place.
// Every channel name is defined in types.ts (IPC constant) to prevent typos.

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { IPC } from '../renderer/src/types'
import type { ProjectMemory, AppSettings, CaptureResult } from '../renderer/src/types'
import { listOpenWindows, captureWindowForAnalysis } from './capturer'
import { loadProjectMemory, saveProjectMemory, loadSettings, saveSettings } from './memory'
import { analyzeScreen, streamBrainstorm } from './claude-bridge'

export function registerIpcHandlers(mainWindow: BrowserWindow): void {

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

  // ─── Screen analysis ────────────────────────────────────────────────────────

  ipcMain.handle(
    IPC.ANALYZE,
    async (_event, capture: CaptureResult, project: ProjectMemory, settings: AppSettings) => {
      try {
        return await analyzeScreen(capture, project, settings)
      } catch (error) {
        console.error('[IPC] ANALYZE error:', error)
        throw error
      }
    }
  )

  // ─── Brainstorm (streaming) ──────────────────────────────────────────────────

  // invoke starts the stream; chunks arrive via mainWindow.webContents.send()
  ipcMain.handle(
    IPC.BRAINSTORM_START,
    async (
      _event,
      userMessage: string,
      conversationHistory: Array<{ role: string; content: string; timestamp: string }>,
      settings: AppSettings
    ) => {
      try {
        await streamBrainstorm(
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
}
