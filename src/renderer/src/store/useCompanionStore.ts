// useCompanionStore.ts
// State for the floating companion window.

import { create } from 'zustand'
import type { AnalysisResult } from '../types'

export type CompanionState = 'idle' | 'thinking' | 'speaking'
export type MicState = 'idle' | 'listening' | 'transcribing' | 'answering'

interface CompanionStoreState {
  avatarState: CompanionState
  latestAnalysis: AnalysisResult | null
  isMuted: boolean
  isPaused: boolean
  isQuietMode: boolean
  lastSpokenText: string
  showPromptCard: boolean

  // Watched source
  watchedWindowName: string | null
  watchedSourceMessage: string | null

  // Window picker
  showWindowPicker: boolean

  // Voice conversation
  micState: MicState
  micError: string | null
  lastAnswer: { question: string; answer: string } | null

  // Actions
  setAvatarState: (state: CompanionState) => void
  setLatestAnalysis: (analysis: AnalysisResult) => void
  setMuted: (muted: boolean) => void
  setPaused: (paused: boolean) => void
  setQuietMode: (quiet: boolean) => void
  setLastSpokenText: (text: string) => void
  setShowPromptCard: (show: boolean) => void
  setWatchedSource: (windowName: string | null, message: string | null) => void
  setShowWindowPicker: (show: boolean) => void
  setMicState: (state: MicState) => void
  setMicError: (error: string | null) => void
  setLastAnswer: (answer: { question: string; answer: string } | null) => void
  clearAnalysis: () => void
}

export const useCompanionStore = create<CompanionStoreState>((set) => ({
  avatarState: 'idle',
  latestAnalysis: null,
  isMuted: false,
  isPaused: false,
  isQuietMode: false,
  lastSpokenText: '',
  showPromptCard: false,
  watchedWindowName: null,
  watchedSourceMessage: null,
  showWindowPicker: false,
  micState: 'idle',
  micError: null,
  lastAnswer: null,

  setAvatarState: (avatarState) => set({ avatarState }),
  setLatestAnalysis: (latestAnalysis) => set({ latestAnalysis, showPromptCard: true }),
  setMuted: (isMuted) => set({ isMuted }),
  setPaused: (isPaused) => set({ isPaused }),
  setQuietMode: (isQuietMode) => set({ isQuietMode }),
  setLastSpokenText: (lastSpokenText) => set({ lastSpokenText }),
  setShowPromptCard: (showPromptCard) => set({ showPromptCard }),
  setWatchedSource: (watchedWindowName, watchedSourceMessage) =>
    set({ watchedWindowName, watchedSourceMessage }),
  setShowWindowPicker: (showWindowPicker) => set({ showWindowPicker }),
  setMicState: (micState) => set({ micState }),
  setMicError: (micError) => set({ micError }),
  setLastAnswer: (lastAnswer) => set({ lastAnswer, showPromptCard: !!lastAnswer }),
  clearAnalysis: () => set({ latestAnalysis: null, showPromptCard: false, lastSpokenText: '', lastAnswer: null }),
}))
