// gemini.ts — Google Gemini API provider
// Uses the Gemini REST API directly (not OpenAI-compatible mode).

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

export const geminiProviderInfo: ProviderInfo = {
  type: 'gemini',
  displayName: 'Google Gemini',
  description: 'Gemini models via the Google AI API. Strong vision and long context.',
  requiresApiKey: true,
  requiresBaseUrl: false,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  defaultModel: 'gemini-2.5-flash',
  supportsStreaming: true,
  models: [
    { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro', supportsVision: true, qualityTier: 'recommended' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsVision: true, qualityTier: 'recommended' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', supportsVision: true, qualityTier: 'capable' },
  ],
}

export class GeminiProvider implements AIProvider {
  readonly info = geminiProviderInfo

  async analyzeScreen(
    capture: CaptureResult,
    project: ProjectMemory,
    settings: AppSettings
  ): Promise<AnalysisResult> {
    const startTime = Date.now()
    const systemPrompt = buildAnalysisSystemPrompt(project, capture.windowTitle)
    const userPrompt = buildAnalysisUserPrompt(project, capture.windowTitle)

    const parts: Array<Record<string, unknown>> = [
      {
        inline_data: {
          mime_type: 'image/jpeg',
          data: capture.imageBase64,
        },
      },
      { text: `Screenshot of: ${capture.windowTitle}` },
      { text: userPrompt },
    ]

    const requestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 1500 },
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

    const contents = [
      ...conversationHistory.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: userMessage }] },
    ]

    const requestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1000 },
    }

    const baseUrl = settings.baseUrl || this.info.defaultBaseUrl
    const url = `${baseUrl}/models/${settings.modelId}:streamGenerateContent?alt=sse&key=${settings.apiKey}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error ${response.status}: ${errorText}`)
      }

      if (!response.body) throw new Error('Gemini API returned no response body')

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
          if (!jsonString) continue

          try {
            const event = JSON.parse(jsonString)
            const text = event.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
              accumulatedText += text
              if (!senderWebContents.isDestroyed()) {
                senderWebContents.send(IPC.BRAINSTORM_CHUNK, text)
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
    const baseUrl = settings.baseUrl || this.info.defaultBaseUrl
    const url = `${baseUrl}/models/${settings.modelId}:generateContent?key=${settings.apiKey}`

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error ${response.status}: ${errorText}`)
    }

    const responseJson = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const text = responseJson.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Gemini API returned no text content')

    return text
  }
}
