// openai-compatible.ts — Shared provider for all OpenAI Chat Completions-compatible APIs.
// Used by: OpenAI, OpenRouter, LM Studio, and custom endpoints.
// Each gets its own ProviderInfo but shares the same request/response logic.

import type { WebContents } from 'electron'
import type {
  ProjectMemory,
  CaptureResult,
  AnalysisResult,
  AppSettings,
  ChatMessage,
} from '../../../renderer/src/types'
import { IPC } from '../../../renderer/src/types'
import type { AIProvider, ProviderInfo } from '../provider-interface'
import { buildAnalysisSystemPrompt, buildAnalysisUserPrompt, buildBrainstormSystemPrompt } from '../prompt-builder'
import { parseAnalysisResponse, tryExtractProjectData } from '../response-parser'
import { fetchWithTimeout } from '../fetch-with-timeout'

// ─── Provider info definitions ───────────────────────────────────────────────

export const openaiProviderInfo: ProviderInfo = {
  type: 'openai',
  displayName: 'OpenAI',
  description: 'GPT models via the OpenAI API. Strong vision and reasoning.',
  requiresApiKey: true,
  requiresBaseUrl: false,
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o',
  supportsStreaming: true,
  models: [
    { id: 'gpt-4o', label: 'GPT-4o', supportsVision: true, qualityTier: 'recommended' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', supportsVision: true, qualityTier: 'capable' },
    { id: 'gpt-4.1', label: 'GPT-4.1', supportsVision: true, qualityTier: 'recommended' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', supportsVision: true, qualityTier: 'capable' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', supportsVision: true, qualityTier: 'experimental' },
    { id: 'o3', label: 'o3', supportsVision: true, qualityTier: 'recommended' },
    { id: 'o4-mini', label: 'o4 Mini', supportsVision: true, qualityTier: 'capable' },
  ],
}

export const openrouterProviderInfo: ProviderInfo = {
  type: 'openrouter',
  displayName: 'OpenRouter',
  description: 'Access hundreds of models through one API. Pay per token, pick any model.',
  requiresApiKey: true,
  requiresBaseUrl: false,
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'anthropic/claude-sonnet-4-6',
  supportsStreaming: true,
  models: [
    { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', supportsVision: true, qualityTier: 'recommended' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', supportsVision: true, qualityTier: 'recommended' },
    { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro', supportsVision: true, qualityTier: 'recommended' },
    { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', supportsVision: true, qualityTier: 'capable' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', supportsVision: false, qualityTier: 'capable' },
    { id: 'mistralai/mistral-large-latest', label: 'Mistral Large', supportsVision: true, qualityTier: 'capable' },
  ],
}

export const lmstudioProviderInfo: ProviderInfo = {
  type: 'lmstudio',
  displayName: 'LM Studio',
  description: 'Run local models via LM Studio. Free, private, no API key needed.',
  requiresApiKey: false,
  requiresBaseUrl: true,
  defaultBaseUrl: 'http://localhost:1234/v1',
  defaultModel: 'local-model',
  supportsStreaming: true,
  models: [
    { id: 'local-model', label: 'Currently Loaded Model', supportsVision: false, qualityTier: 'experimental' },
  ],
}

export const customProviderInfo: ProviderInfo = {
  type: 'custom',
  displayName: 'Custom Endpoint',
  description: 'Any OpenAI-compatible API endpoint. Specify your own URL and model.',
  requiresApiKey: false,
  requiresBaseUrl: true,
  defaultBaseUrl: 'http://localhost:8080/v1',
  defaultModel: 'custom-model',
  supportsStreaming: true,
  models: [
    { id: 'custom-model', label: 'Custom Model', supportsVision: false, qualityTier: 'experimental' },
  ],
}

// OpenAI reasoning models use max_completion_tokens instead of max_tokens.
const REASONING_MODEL_PREFIXES = ['o1', 'o3', 'o4']

function isReasoningModel(modelId: string): boolean {
  const baseId = modelId.includes('/') ? modelId.split('/').pop() ?? modelId : modelId
  return REASONING_MODEL_PREFIXES.some((prefix) => baseId.startsWith(prefix))
}

function buildTokenLimit(modelId: string, tokens: number): Record<string, number> {
  return isReasoningModel(modelId)
    ? { max_completion_tokens: tokens }
    : { max_tokens: tokens }
}

// ─── Shared implementation ───────────────────────────────────────────────────

export class OpenAICompatibleProvider implements AIProvider {
  readonly info: ProviderInfo

  constructor(providerInfo: ProviderInfo) {
    this.info = providerInfo
  }

  async analyzeScreen(
    capture: CaptureResult,
    project: ProjectMemory,
    settings: AppSettings
  ): Promise<AnalysisResult> {
    const startTime = Date.now()
    const systemPrompt = buildAnalysisSystemPrompt(project, capture.windowTitle)
    const userPrompt = buildAnalysisUserPrompt(project, capture.windowTitle)

    // Check if the model likely supports vision
    const model = this.info.models.find((m) => m.id === settings.modelId)
    const useVision = model ? model.supportsVision : false

    const userContent: Array<Record<string, unknown>> = []

    if (useVision) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${capture.imageBase64}`,
          detail: 'high',
        },
      })
    }

    userContent.push({ type: 'text', text: `Screenshot of: ${capture.windowTitle}` })
    userContent.push({ type: 'text', text: userPrompt })

    if (!useVision) {
      userContent.push({
        type: 'text',
        text: '\n[Note: This model does not support image input. Please provide your best guidance based on the project context alone.]',
      })
    }

    const requestBody = {
      model: settings.modelId,
      ...buildTokenLimit(settings.modelId, 1500),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }

    const responseText = await this.callAPI(requestBody, settings)
    return parseAnalysisResponse(responseText, startTime)
  }

  async streamBrainstorm(
    senderWebContents: WebContents,
    userMessage: string,
    conversationHistory: ChatMessage[],
    settings: AppSettings
  ): Promise<void> {
    const systemPrompt = buildBrainstormSystemPrompt()
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.map((msg) => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: userMessage },
    ]

    const requestBody = {
      model: settings.modelId,
      ...buildTokenLimit(settings.modelId, 1000),
      stream: true,
      messages,
    }

    const baseUrl = this.resolveBaseUrl(settings)
    const headers = this.buildHeaders(settings)

    try {
      const isLocal = this.info.type === 'lmstudio' || this.info.type === 'custom'
      const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      }, isLocal)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`${this.info.displayName} API error ${response.status}: ${errorText}`)
      }

      if (!response.body) throw new Error(`${this.info.displayName} returned no response body`)

      const reader = response.body.getReader()
      const textDecoder = new TextDecoder()
      let accumulatedText = ''
      let sseBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        sseBuffer += textDecoder.decode(value, { stream: true })
        const lines = sseBuffer.split('\n')
        sseBuffer = lines.pop() ?? '' // keep incomplete last line

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const jsonString = line.slice(6).trim()
          if (jsonString === '[DONE]') continue

          try {
            const event = JSON.parse(jsonString)
            const delta = event.choices?.[0]?.delta?.content
            if (delta) {
              accumulatedText += delta
              if (!senderWebContents.isDestroyed()) {
                senderWebContents.send(IPC.BRAINSTORM_CHUNK, delta)
              }
            }
          } catch {
            // Non-JSON SSE lines — ignore
          }
        }
      }

      const extractedProjectData = tryExtractProjectData(accumulatedText)
      if (!senderWebContents.isDestroyed()) {
        senderWebContents.send(IPC.BRAINSTORM_DONE, { fullText: accumulatedText, extractedProjectData })
      }
    } catch (error) {
      if (!senderWebContents.isDestroyed()) {
        senderWebContents.send(IPC.BRAINSTORM_ERROR, String(error))
      }
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async callAPI(
    requestBody: Record<string, unknown>,
    settings: AppSettings
  ): Promise<string> {
    const baseUrl = this.resolveBaseUrl(settings)
    const headers = this.buildHeaders(settings)

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`${this.info.displayName} API error ${response.status}: ${errorText}`)
    }

    const responseJson = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = responseJson.choices?.[0]?.message?.content
    if (!content) throw new Error(`${this.info.displayName} returned no text content`)

    return content
  }

  private resolveBaseUrl(settings: AppSettings): string {
    if (settings.baseUrl) return settings.baseUrl.replace(/\/$/, '')
    return this.info.defaultBaseUrl
  }

  private buildHeaders(settings: AppSettings): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }

    if (settings.apiKey) {
      headers['Authorization'] = `Bearer ${settings.apiKey}`
    }

    // OpenRouter requires extra headers
    if (this.info.type === 'openrouter') {
      headers['HTTP-Referer'] = 'https://buildy.app'
      headers['X-Title'] = 'Buildy'
    }

    return headers
  }
}
