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

// ─── Model capabilities ─────────────────────────────────────────────────────

export type QualityTier = 'recommended' | 'capable' | 'experimental'

export interface ModelOption {
  id: string
  label: string
  supportsVision: boolean
  qualityTier: QualityTier
}

// ─── Provider metadata ───────────────────────────────────────────────────────

export interface ProviderInfo {
  type: ProviderType
  displayName: string
  description: string
  requiresApiKey: boolean
  requiresBaseUrl: boolean
  defaultBaseUrl: string
  defaultModel: string
  models: ModelOption[]
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

// ─── Vision warning ──────────────────────────────────────────────────────────

export interface VisionWarning {
  shouldWarn: boolean
  message: string
  canProceed: boolean   // true = text-only fallback available; false = won't work at all
}

/**
 * Check whether the selected model supports vision well enough for screen analysis.
 * Returns a warning object if the model is suboptimal.
 */
export function checkVisionSupport(
  providerInfo: ProviderInfo,
  modelId: string
): VisionWarning {
  const model = providerInfo.models.find((m) => m.id === modelId)

  // Unknown model (e.g. user-typed custom model) — warn but allow
  if (!model) {
    return {
      shouldWarn: true,
      message: `Unknown model "${modelId}". Vision support is uncertain. Screen analysis may not work well.`,
      canProceed: true,
    }
  }

  if (!model.supportsVision) {
    return {
      shouldWarn: true,
      message: `${model.label} does not support image input. Buildy will use text-only mode — you can still brainstorm but screen analysis won't work.`,
      canProceed: true,
    }
  }

  if (model.qualityTier === 'experimental') {
    return {
      shouldWarn: true,
      message: `${model.label} has experimental vision support. Screen analysis quality may vary. For best results, use a recommended model.`,
      canProceed: true,
    }
  }

  return { shouldWarn: false, message: '', canProceed: true }
}
