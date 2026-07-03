// text-completion.ts — main process
// A provider-agnostic, single-shot TEXT completion. Used by loop-engineering
// helpers (e.g. the verifier) that need a small structured judgment from the
// SAME provider/model the user selected — NOT a hardcoded provider.
//
// SECURITY: the API key comes from `settings` (main-owned, injected from the
// encrypted secure-store by memory.ts). It is never read from the renderer.
// Keys always go in headers, never the URL.

import type { AppSettings } from '../../renderer/src/types'
import { getProviderInfo } from './provider-registry'
import { fetchWithTimeout } from './fetch-with-timeout'

// OpenAI reasoning models use max_completion_tokens instead of max_tokens.
const REASONING_MODEL_PREFIXES = ['o1', 'o3', 'o4']

function isReasoningModel(modelId: string): boolean {
  const baseId = modelId.includes('/') ? modelId.split('/').pop() ?? modelId : modelId
  return REASONING_MODEL_PREFIXES.some((prefix) => baseId.startsWith(prefix))
}

export interface TextCompletionRequest {
  system: string
  user: string
  settings: AppSettings
  /** Override the model (e.g. use Haiku on Anthropic for a cheap grade). */
  modelOverride?: string
  maxTokens?: number
  /** Optional screenshot to include (base64 JPEG). */
  imageBase64?: string | null
}

/**
 * Run one text completion against the user's configured provider/model.
 * Returns the raw text (possibly empty). Throws on HTTP / network errors so the
 * caller can decide how to degrade.
 */
export async function callTextCompletion(req: TextCompletionRequest): Promise<string> {
  const { system, user, settings } = req
  const provider = settings.provider
  const model = req.modelOverride || settings.modelId
  const maxTokens = req.maxTokens ?? 500
  const image = req.imageBase64 || null
  const isLocal = provider === 'ollama' || provider === 'lmstudio'

  if (provider === 'anthropic') {
    const content: Array<Record<string, unknown>> = []
    if (image) {
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } })
    }
    content.push({ type: 'text', text: user })
    const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    }, isLocal)
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    return json.content?.find((b) => b.type === 'text')?.text || ''
  }

  if (provider === 'gemini') {
    const baseUrl = settings.baseUrl || getProviderInfo('gemini').defaultBaseUrl
    const parts: Array<Record<string, unknown>> = []
    if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } })
    parts.push({ text: user })
    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: maxTokens },
    }
    // Key in a header, never the URL.
    const res = await fetchWithTimeout(`${baseUrl}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.apiKey },
      body: JSON.stringify(body),
    }, isLocal)
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return json.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  // OpenAI-compatible (openai, openrouter, ollama, lmstudio, custom)
  const baseUrl = (settings.baseUrl || getProviderInfo(provider).defaultBaseUrl).replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://buildy.app'
    headers['X-Title'] = 'Buildy'
  }

  const userContent: Array<Record<string, unknown>> = []
  if (image) {
    userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}`, detail: 'high' } })
  }
  userContent.push({ type: 'text', text: user })

  const tokenLimit = isReasoningModel(model)
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens }
  const body = {
    model,
    ...tokenLimit,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
  }
  const res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }, isLocal)
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return json.choices?.[0]?.message?.content || ''
}
