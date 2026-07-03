// useAppStore.ts
// Zustand store — all app state in one place.
// Every screen reads from and writes to this store via hooks.

import { create } from 'zustand'
import type {
  ProjectMemory,
  RedactedSettings,
  WindowSource,
  CaptureResult,
  AnalysisResult,
  ChatMessage,
  ExtractedProjectData,
} from '../types'
import { emptyProjectMemory, defaultRedactedSettings } from '../types'

// ─── Screen navigation ────────────────────────────────────────────────────────

export type AppScreen = 'goal' | 'brainstorm' | 'guidance' | 'memory' | 'settings'

// ─── Analysis state ───────────────────────────────────────────────────────────

export type AnalysisPhase =
  | 'idle'
  | 'listing-windows'
  | 'awaiting-window-selection'
  | 'capturing'
  | 'analyzing'
  | 'done'
  | 'error'

// ─── Brainstorm state ─────────────────────────────────────────────────────────

export type BrainstormPhase = 'idle' | 'waiting-for-response' | 'streaming' | 'done' | 'error'

// ─── Full store ───────────────────────────────────────────────────────────────

interface AppState {
  // ── Navigation
  currentScreen: AppScreen

  // ── Project memory (persisted via IPC)
  project: ProjectMemory
  projectIsLoaded: boolean

  // ── Settings (REDACTED — non-secret fields + has* booleans; never raw keys)
  settings: RedactedSettings
  settingsAreLoaded: boolean

  // ── Analysis
  analysisPhase: AnalysisPhase
  availableWindows: WindowSource[]
  selectedWindowSourceId: string | null
  selectedWindowName: string | null       // name at pick time — guards against HWND/id reuse
  latestCapture: CaptureResult | null
  latestAnalysis: AnalysisResult | null
  analysisErrorMessage: string | null
  autoAnalysisEnabled: boolean
  secondsUntilNextAutoAnalysis: number

  // ── Brainstorm chat
  brainstormMessages: ChatMessage[]
  brainstormPhase: BrainstormPhase
  brainstormStreamingBuffer: string   // Accumulates chunks mid-stream
  brainstormErrorMessage: string | null
  lastExtractedProjectData: ExtractedProjectData | null

  // ── Actions
  setCurrentScreen: (screen: AppScreen) => void

  setProject: (project: ProjectMemory) => void
  patchProject: (partial: Partial<ProjectMemory>) => void
  setProjectIsLoaded: (loaded: boolean) => void

  setSettings: (settings: RedactedSettings) => void
  setSettingsAreLoaded: (loaded: boolean) => void

  setAnalysisPhase: (phase: AnalysisPhase) => void
  setAvailableWindows: (windows: WindowSource[]) => void
  setSelectedWindowSourceId: (id: string | null) => void
  setSelectedWindow: (id: string | null, name: string | null) => void
  setLatestCapture: (capture: CaptureResult | null) => void
  setLatestAnalysis: (result: AnalysisResult | null) => void
  setAnalysisError: (message: string | null) => void
  setAutoAnalysisEnabled: (enabled: boolean) => void
  setSecondsUntilNextAutoAnalysis: (seconds: number) => void

  addBrainstormUserMessage: (content: string) => void
  appendBrainstormStreamChunk: (chunk: string) => void
  finalizeBrainstormAssistantMessage: (
    fullText: string,
    extractedData: ExtractedProjectData | null
  ) => void
  setBrainstormPhase: (phase: BrainstormPhase) => void
  setBrainstormError: (message: string | null) => void
  clearBrainstormMessages: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Navigation
  currentScreen: 'brainstorm',

  // ── Project
  project: emptyProjectMemory(),
  projectIsLoaded: false,

  // ── Settings
  settings: defaultRedactedSettings(),
  settingsAreLoaded: false,

  // ── Analysis
  analysisPhase: 'idle',
  availableWindows: [],
  selectedWindowSourceId: null,
  selectedWindowName: null,
  latestCapture: null,
  latestAnalysis: null,
  analysisErrorMessage: null,
  autoAnalysisEnabled: false,
  secondsUntilNextAutoAnalysis: 0,

  // ── Brainstorm
  brainstormMessages: [],
  brainstormPhase: 'idle',
  brainstormStreamingBuffer: '',
  brainstormErrorMessage: null,
  lastExtractedProjectData: null,

  // ── Actions

  setCurrentScreen: (screen) => set({ currentScreen: screen }),

  setProject: (project) => set({ project }),
  patchProject: (partial) =>
    set((state) => ({ project: { ...state.project, ...partial } })),
  setProjectIsLoaded: (projectIsLoaded) => set({ projectIsLoaded }),

  setSettings: (settings) => set({ settings }),
  setSettingsAreLoaded: (settingsAreLoaded) => set({ settingsAreLoaded }),

  setAnalysisPhase: (analysisPhase) => set({ analysisPhase }),
  setAvailableWindows: (availableWindows) => set({ availableWindows }),
  setSelectedWindowSourceId: (selectedWindowSourceId) => set({ selectedWindowSourceId }),
  setSelectedWindow: (selectedWindowSourceId, selectedWindowName) =>
    set({ selectedWindowSourceId, selectedWindowName }),
  setLatestCapture: (latestCapture) => set({ latestCapture }),
  setLatestAnalysis: (latestAnalysis) => set({ latestAnalysis }),
  setAnalysisError: (analysisErrorMessage) => set({ analysisErrorMessage }),
  setAutoAnalysisEnabled: (autoAnalysisEnabled) => set({ autoAnalysisEnabled }),
  setSecondsUntilNextAutoAnalysis: (secondsUntilNextAutoAnalysis) =>
    set({ secondsUntilNextAutoAnalysis }),

  addBrainstormUserMessage: (content) => {
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }
    set((state) => ({
      brainstormMessages: [...state.brainstormMessages, userMessage],
      brainstormStreamingBuffer: '',
      brainstormPhase: 'waiting-for-response',
    }))
  },

  appendBrainstormStreamChunk: (chunk) => {
    set((state) => ({
      brainstormStreamingBuffer: state.brainstormStreamingBuffer + chunk,
      brainstormPhase: 'streaming',
    }))
  },

  finalizeBrainstormAssistantMessage: (fullText, extractedData) => {
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: fullText,
      timestamp: new Date().toISOString(),
    }
    set((state) => ({
      brainstormMessages: [...state.brainstormMessages, assistantMessage],
      brainstormStreamingBuffer: '',
      brainstormPhase: 'done',
      lastExtractedProjectData: extractedData,
    }))
  },

  setBrainstormPhase: (brainstormPhase) => set({ brainstormPhase }),
  setBrainstormError: (brainstormErrorMessage) =>
    set({ brainstormErrorMessage, brainstormPhase: 'error' }),

  clearBrainstormMessages: () =>
    set({
      brainstormMessages: [],
      brainstormPhase: 'idle',
      brainstormStreamingBuffer: '',
      brainstormErrorMessage: null,
      lastExtractedProjectData: null,
    }),
}))
