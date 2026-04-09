// preload/index.ts
// Secure bridge between the main process and the renderer.
// contextBridge.exposeInMainWorld() is the only safe way to give the renderer
// access to Electron/Node.js capabilities without enabling nodeIntegration.
//
// The renderer accesses everything via window.buildy.*

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../renderer/src/types'
import type {
  WindowSource,
  CaptureResult,
  AnalysisResult,
  ProjectMemory,
  AppSettings,
  ChatMessage,
  ExtractedProjectData,
} from '../renderer/src/types'

// The API exposed to window.buildy in the renderer
const buildyAPI = {

  // ─── Window listing ──────────────────────────────────────────────────────
  listWindows: (): Promise<WindowSource[]> =>
    ipcRenderer.invoke(IPC.LIST_WINDOWS),

  // ─── Screen capture ──────────────────────────────────────────────────────
  captureWindow: (sourceId: string | null): Promise<CaptureResult> =>
    ipcRenderer.invoke(IPC.CAPTURE_WINDOW, sourceId),

  // ─── Analysis ────────────────────────────────────────────────────────────
  analyze: (
    capture: CaptureResult,
    project: ProjectMemory,
    settings: AppSettings
  ): Promise<AnalysisResult> =>
    ipcRenderer.invoke(IPC.ANALYZE, capture, project, settings),

  // ─── Brainstorm streaming ─────────────────────────────────────────────────
  // Start the stream — chunks arrive via onBrainstormChunk
  startBrainstorm: (
    userMessage: string,
    history: ChatMessage[],
    settings: AppSettings
  ): Promise<void> =>
    ipcRenderer.invoke(IPC.BRAINSTORM_START, userMessage, history, settings),

  // Subscribe to brainstorm events — returns an unsubscribe function
  onBrainstormChunk: (handler: (chunk: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, chunk: string) => handler(chunk)
    ipcRenderer.on(IPC.BRAINSTORM_CHUNK, listener)
    return () => ipcRenderer.removeListener(IPC.BRAINSTORM_CHUNK, listener)
  },

  onBrainstormDone: (
    handler: (result: { fullText: string; extractedProjectData: ExtractedProjectData | null }) => void
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      result: { fullText: string; extractedProjectData: ExtractedProjectData | null }
    ) => handler(result)
    ipcRenderer.on(IPC.BRAINSTORM_DONE, listener)
    return () => ipcRenderer.removeListener(IPC.BRAINSTORM_DONE, listener)
  },

  onBrainstormError: (handler: (errorMessage: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, errorMessage: string) =>
      handler(errorMessage)
    ipcRenderer.on(IPC.BRAINSTORM_ERROR, listener)
    return () => ipcRenderer.removeListener(IPC.BRAINSTORM_ERROR, listener)
  },

  // ─── Project memory ───────────────────────────────────────────────────────
  loadProject: (): Promise<ProjectMemory> =>
    ipcRenderer.invoke(IPC.LOAD_PROJECT),

  saveProject: (project: ProjectMemory): Promise<void> =>
    ipcRenderer.invoke(IPC.SAVE_PROJECT, project),

  // ─── Settings ─────────────────────────────────────────────────────────────
  loadSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.LOAD_SETTINGS),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),
}

contextBridge.exposeInMainWorld('buildy', buildyAPI)

// TypeScript global type declaration for the renderer
// Import this declaration in renderer tsconfig if needed
declare global {
  interface Window {
    buildy: typeof buildyAPI
  }
}
