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
  Goal,
  GuidancePayload,
  QuestionAnswer,
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

  // ─── Goal (local only — stored alongside project memory) ───────────────────
  goal: {
    get: (): Promise<Goal | null> =>
      ipcRenderer.invoke(IPC.GOAL_GET),
    set: (goal: Partial<Goal>): Promise<Goal> =>
      ipcRenderer.invoke(IPC.GOAL_SET, goal),
    update: (partial: Partial<Goal>): Promise<Goal | null> =>
      ipcRenderer.invoke(IPC.GOAL_UPDATE, partial),
  },

  // ─── Provider info ────────────────────────────────────────────────────────
  getProviderInfos: (): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.GET_PROVIDER_INFOS),

  // ─── Connection test ────────────────────────────────────────────────────
  testConnection: (settings: AppSettings): Promise<{ success: boolean; message: string; latencyMs: number | null }> =>
    ipcRenderer.invoke(IPC.TEST_CONNECTION, settings),

  // ─── Settings ─────────────────────────────────────────────────────────────
  loadSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC.LOAD_SETTINGS),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),

  // ─── Companion mode ───────────────────────────────────────────────────────
  startCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPANION_START),

  stopCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPANION_STOP),

  selectWatchSource: (sourceId: string, windowName: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SELECT_WATCH_SOURCE, sourceId, windowName),

  onWatchedSourceChanged: (handler: (event: unknown, data: { windowName: string | null; message: string | null }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { windowName: string | null; message: string | null }
    ) => handler(_event, data)
    ipcRenderer.on(IPC.COMPANION_WATCHED_SOURCE, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_WATCHED_SOURCE, listener)
  },

  pauseCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPANION_PAUSE),

  resumeCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPANION_RESUME),

  setQuietMode: (quiet: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.COMPANION_QUIET, quiet),

  askQuestion: (question: string): Promise<void> =>
    ipcRenderer.invoke(IPC.ASK_QUESTION, question),

  transcribeAudio: (audioBuffer: ArrayBuffer): Promise<{ success: boolean; text: string; error?: string }> =>
    ipcRenderer.invoke(IPC.TRANSCRIBE_AUDIO, Buffer.from(audioBuffer)),

  onCompanionAnswer: (handler: (event: unknown, data: { question: string; answer: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { question: string; answer: string }
    ) => handler(_event, data)
    ipcRenderer.on(IPC.COMPANION_ANSWER, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_ANSWER, listener)
  },

  openPanel: (): void =>
    ipcRenderer.send(IPC.OPEN_PANEL),

  resetCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.RESET_COMPANION),

  showCompanion: (): Promise<void> =>
    ipcRenderer.invoke(IPC.SHOW_COMPANION),

  onCompanionAnalysis: (handler: (event: unknown, analysis: AnalysisResult) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, analysis: AnalysisResult) =>
      handler(_event, analysis)
    ipcRenderer.on(IPC.COMPANION_ANALYSIS, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_ANALYSIS, listener)
  },

  onCompanionState: (handler: (event: unknown, state: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: string) =>
      handler(_event, state)
    ipcRenderer.on(IPC.COMPANION_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_STATE, listener)
  },

  onCompanionSpeak: (handler: (event: unknown, data: { text: string; type: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { text: string; type: string }
    ) => handler(_event, data)
    ipcRenderer.on(IPC.COMPANION_SPEAK, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_SPEAK, listener)
  },

  onCompanionAudio: (handler: (event: unknown, data: { audioBase64: string; text: string; type: string }) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { audioBase64: string; text: string; type: string }
    ) => handler(_event, data)
    ipcRenderer.on(IPC.COMPANION_AUDIO, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_AUDIO, listener)
  },

  onCompanionShutdown: (handler: () => void): (() => void) => {
    const listener = () => handler()
    ipcRenderer.on(IPC.COMPANION_SHUTDOWN, listener)
    return () => ipcRenderer.removeListener(IPC.COMPANION_SHUTDOWN, listener)
  },

  // ─── Guidance panel (secondary floating window) ────────────────────────────
  // The companion forwards guidance here so it renders in its own window instead
  // of overflowing the mascot window.
  showGuidance: (analysis: AnalysisResult): void =>
    ipcRenderer.send(IPC.GUIDANCE_SHOW, { kind: 'analysis', analysis } as GuidancePayload),

  showGuidanceAnswer: (answer: QuestionAnswer): void =>
    ipcRenderer.send(IPC.GUIDANCE_SHOW, { kind: 'answer', answer } as GuidancePayload),

  hideGuidance: (): void =>
    ipcRenderer.send(IPC.GUIDANCE_HIDE),

  showLastGuidance: (): void =>
    ipcRenderer.send(IPC.GUIDANCE_SHOW_LAST),

  resizeGuidance: (height: number): void =>
    ipcRenderer.send(IPC.GUIDANCE_RESIZE, height),

  copyText: (text: string): Promise<void> =>
    ipcRenderer.invoke(IPC.COPY_TEXT, text),

  onGuidanceData: (handler: (event: unknown, payload: GuidancePayload) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: GuidancePayload) =>
      handler(_event, payload)
    ipcRenderer.on(IPC.GUIDANCE_DATA, listener)
    return () => ipcRenderer.removeListener(IPC.GUIDANCE_DATA, listener)
  },
}

contextBridge.exposeInMainWorld('buildy', buildyAPI)

// TypeScript global type declaration for the renderer
// Import this declaration in renderer tsconfig if needed
declare global {
  interface Window {
    buildy: typeof buildyAPI
  }
}
