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
  CaptureOutcome,
  AnalysisResult,
  ProjectMemory,
  NonSecretSettings,
  RedactedSettings,
  SecretName,
  ChatMessage,
  ExtractedProjectData,
  Goal,
  GuidancePayload,
  QuestionAnswer,
  MemoryEntry,
  MemorySnapshot,
} from '../renderer/src/types'

// The API exposed to window.buildy in the renderer
const buildyAPI = {

  // ─── Window listing ──────────────────────────────────────────────────────
  listWindows: (): Promise<WindowSource[]> =>
    ipcRenderer.invoke(IPC.LIST_WINDOWS),

  // ─── Screen capture ──────────────────────────────────────────────────────
  // Returns a halt outcome (never a full-screen image) when the window is missing.
  captureWindow: (sourceId: string | null): Promise<CaptureOutcome> =>
    ipcRenderer.invoke(IPC.CAPTURE_WINDOW, sourceId),

  // ─── Analysis ────────────────────────────────────────────────────────────
  analyze: (
    capture: CaptureResult,
    project: ProjectMemory,
    settings: NonSecretSettings
  ): Promise<AnalysisResult> =>
    ipcRenderer.invoke(IPC.ANALYZE, capture, project, settings),

  // ─── Brainstorm streaming ─────────────────────────────────────────────────
  // Start the stream — chunks arrive via onBrainstormChunk
  startBrainstorm: (
    userMessage: string,
    history: ChatMessage[],
    settings: NonSecretSettings
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
  testConnection: (settings: NonSecretSettings): Promise<{ success: boolean; message: string; latencyMs: number | null }> =>
    ipcRenderer.invoke(IPC.TEST_CONNECTION, settings),

  // ─── Settings ─────────────────────────────────────────────────────────────
  // Returns REDACTED settings only (no raw keys — just has* booleans).
  loadSettings: (): Promise<RedactedSettings> =>
    ipcRenderer.invoke(IPC.LOAD_SETTINGS),

  // Saves NON-SECRET settings only. API keys go through setSecret (one-way).
  saveSettings: (settings: NonSecretSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings),

  // Store an API key in the encrypted main-process store. The renderer never reads it back.
  setSecret: (name: SecretName, value: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SET_SECRET, { name, value }),

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

  // ─── Voice player (hidden main-owned window) ───────────────────────────────
  voice: {
    // Used by the hidden voice window:
    onPlayAudio: (handler: (event: unknown, data: { id: string; audioBase64: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string; audioBase64: string }) => handler(_e, data)
      ipcRenderer.on(IPC.VOICE_PLAY_AUDIO, listener)
      return () => ipcRenderer.removeListener(IPC.VOICE_PLAY_AUDIO, listener)
    },
    onPlayTts: (handler: (event: unknown, data: { id: string; text: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, data: { id: string; text: string }) => handler(_e, data)
      ipcRenderer.on(IPC.VOICE_PLAY_TTS, listener)
      return () => ipcRenderer.removeListener(IPC.VOICE_PLAY_TTS, listener)
    },
    onStop: (handler: () => void): (() => void) => {
      const listener = (): void => handler()
      ipcRenderer.on(IPC.VOICE_STOP, listener)
      return () => ipcRenderer.removeListener(IPC.VOICE_STOP, listener)
    },
    ended: (id: string): void => ipcRenderer.send(IPC.VOICE_ENDED, id),
    error: (id: string): void => ipcRenderer.send(IPC.VOICE_ERROR, id),
    // Used by the companion window to control playback (explicit user actions):
    stop: (): void => ipcRenderer.send(IPC.VOICE_CTL_STOP),
    setMuted: (muted: boolean): void => ipcRenderer.send(IPC.VOICE_CTL_MUTE, muted),
    resetDedup: (): void => ipcRenderer.send(IPC.VOICE_CTL_RESET),
  },

  // Used by the guidance window to highlight the sentence being spoken:
  onSpeechProgress: (handler: (event: unknown, chunkText: string | null) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, chunkText: string | null) => handler(_e, chunkText)
    ipcRenderer.on(IPC.VOICE_SPEAK_PROGRESS, listener)
    return () => ipcRenderer.removeListener(IPC.VOICE_SPEAK_PROGRESS, listener)
  },

  // ─── Memory layer (Nemp bridge) ────────────────────────────────────────────
  memory: {
    get: (): Promise<MemorySnapshot> => ipcRenderer.invoke(IPC.MEMORY_GET),
    getContextSummary: (maxTokens?: number): Promise<string> =>
      ipcRenderer.invoke(IPC.MEMORY_GET_CONTEXT, maxTokens),
    search: (query: string): Promise<MemoryEntry[]> =>
      ipcRenderer.invoke(IPC.MEMORY_SEARCH, query),
    addObservation: (text: string, sourceAnalysisId?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_ADD_OBSERVATION, text, sourceAnalysisId),
    addCompletion: (feature: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_ADD_COMPLETION, feature),
    addBlocker: (description: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_ADD_BLOCKER, description),
    resolveBlocker: (blockerId: string, resolution: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_RESOLVE_BLOCKER, blockerId, resolution),
    addDecision: (question: string, choice: string, reasoning?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_ADD_DECISION, question, choice, reasoning),
    addPattern: (observation: string, confidence: 'low' | 'medium' | 'high'): Promise<void> =>
      ipcRenderer.invoke(IPC.MEMORY_ADD_PATTERN, observation, confidence),
    exportBuildyMd: (): Promise<{ saved: boolean; path?: string }> =>
      ipcRenderer.invoke(IPC.MEMORY_EXPORT_BUILDYMD),
    reset: (): Promise<void> => ipcRenderer.invoke(IPC.MEMORY_RESET),
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
