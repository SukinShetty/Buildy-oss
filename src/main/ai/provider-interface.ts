// provider-interface.ts
// Core abstraction for all AI providers. Every provider adapter must implement
// the AIProvider interface. The rest of the app never talks to a specific API —
// it talks to this interface.

import type { WebContents } from 'electron'
import type {
  ProjectMemory,
  CaptureResult,
  AnalysisResult,
  AppSettings,
  ChatMessage,
} from '../../renderer/src/types'

// ─── Provider types ──────────────────────────────────────────────────────────

export type ProviderType =
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'ollama'
  | 'lmstudio'
  | 'custom'

// ─── Provider metadata ───────────────────────────────────────────────────────
// NOTE: there is deliberately NO hardcoded model catalog and NO default model.
// Model lists are fetched LIVE from each provider (see model-fetch.ts) and the
// user must explicitly pick one. Vision capability is proven by the vision
// check (connection-test.ts), never assumed from a static list.

export interface ProviderInfo {
  type: ProviderType
  displayName: string
  description: string
  requiresApiKey: boolean
  requiresBaseUrl: boolean
  defaultBaseUrl: string
  supportsStreaming: boolean
}

// ─── Provider interface ──────────────────────────────────────────────────────

export interface AIProvider {
  readonly info: ProviderInfo

  /**
   * Analyze a screenshot of the watched window and return structured guidance.
   * Non-streaming — the full JSON must be parsed before returning.
   */
  analyzeScreen(
    capture: CaptureResult,
    project: ProjectMemory,
    settings: AppSettings
  ): Promise<AnalysisResult>

  /**
   * Run a brainstorm conversation with streaming.
   * Pushes text chunks to the renderer via IPC as they arrive.
   */
  streamBrainstorm(
    senderWebContents: WebContents,
    userMessage: string,
    conversationHistory: ChatMessage[],
    settings: AppSettings
  ): Promise<void>
}

// The old checkVisionSupport() heuristic (guess vision from a hardcoded list,
// let non-vision models proceed in text-only mode) is REPLACED by the real
// vision check in connection-test.ts + the persisted vision gate
// (vision-gate.ts / vision-approvals.ts): watching is only allowed after the
// exact provider+model has actually answered a test image correctly.
