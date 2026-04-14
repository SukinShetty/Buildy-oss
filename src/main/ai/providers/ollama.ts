// ollama.ts — Ollama provider
// Uses the Ollama REST API (OpenAI-compatible chat/completions endpoint).
// Ollama runs locally — no API key needed, free, private.

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

export const ollamaProviderInfo: ProviderInfo = {
  type: 'ollama',
  displayName: 'Ollama',
  description: 'Run open-source models locally via Ollama. Free and private — no API key needed.',
  requiresApiKey: false,
  requiresBaseUrl: true,
  defaultBaseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.1',
  supportsStreaming: true,
  models: [
    { id: 'llama3.1', label: 'Llama 3.1 8B', supportsVision: false, qualityTier: 'capable' },
    { id: 'llama3.1:70b', label: 'Llama 3.1 70B', supportsVision: false, qualityTier: 'capable' },
    { id: 'llava', label: 'LLaVA (Vision)', supportsVision: true, qualityTier: 'experimental' },
    { id: 'llava-llama3', label: 'LLaVA Llama 3 (Vision)', supportsVision: true, qualityTier: 'experimental' },
    { id: 'gemma3', label: 'Gemma 3', supportsVision: true, qualityTier: 'experimental' },
    { id: 'mistral', label: 'Mistral 7B', supportsVision: false, qualityTier: 'experimental' },
    { id: 'deepseek-r1', label: 'DeepSeek R1', supportsVision: false, qualityTier: 'capable' },
    { id: 'qwen2.5', label: 'Qwen 2.5', supportsVision: false, qualityTier: 'capable' },
  ],
}

export class OllamaProvider implements AIProvider {
  readonly info = ollamaProviderInfo

  async analyzeScreen(
    capture: CaptureResult,
    project: ProjectMemory,
    settings: AppSettings
  ): Promise<AnalysisResult> {
    const startTime = Date.now()
    const systemPrompt = buildAnalysisSystemPrompt(project, capture.windowTitle)
    const userPrompt = buildAnalysisUserPrompt(project, capture.windowTitle)

    const model = this.info.models.find((m) => m.id === settings.modelId)
    const useVision = model ? model.supportsVision : false

    // Ollama uses its own /api/chat format with images as base64 array
    const userContent = useVision
      ? `Screenshot of: ${capture.windowTitle}\n\n${userPrompt}`
      : `Screenshot of: ${capture.windowTitle}\n\n${userPrompt}\n\n[Note: This model does not support image input. Please provide your best guidance based on the project context alone.]`

    const requestBody: Record<string, unknown> = {
      model: settings.modelId,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userContent,
          ...(useVision ? { images: [capture.imageBase64] } : {}),
        },
      ],
    }

    const baseUrl = this.resolveBaseUrl(settings)
    const response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    }, true)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama error ${response.status}: ${errorText}`)
    }

    const responseJson = (await response.json()) as { message?: { content?: string } }
    const text = responseJson.message?.content
    if (!text) throw new Error('Ollama returned no text content')

    return parseAnalysisResponse(text, startTime)
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
      stream: true,
      messages,
    }

    const baseUrl = this.resolveBaseUrl(settings)

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Ollama error ${response.status}: ${errorText}`)
      }

      if (!response.body) throw new Error('Ollama returned no response body')

      // Ollama streams newline-delimited JSON (not SSE)
      const reader = response.body.getReader()
      const textDecoder = new TextDecoder()
      let accumulatedText = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += textDecoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // Keep incomplete last line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const event = JSON.parse(line)
            const content = event.message?.content
            if (content) {
              accumulatedText += content
              if (!senderWebContents.isDestroyed()) {
                senderWebContents.send(IPC.BRAINSTORM_CHUNK, content)
              }
            }
          } catch {
            // Malformed JSON line — skip
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          const content = event.message?.content
          if (content) {
            accumulatedText += content
            if (!senderWebContents.isDestroyed()) {
              senderWebContents.send(IPC.BRAINSTORM_CHUNK, content)
            }
          }
        } catch {
          // ignore
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

  private resolveBaseUrl(settings: AppSettings): string {
    const url = settings.baseUrl || this.info.defaultBaseUrl
    return url.replace(/\/$/, '')
  }
}
