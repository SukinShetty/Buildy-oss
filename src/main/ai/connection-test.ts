// connection-test.ts
// Lightweight connectivity check for each provider.
// Sends a minimal request to verify API key, base URL, and model access.
// Returns a user-friendly result — no stack traces.

import type { AppSettings } from '../../renderer/src/types'
import { fetchWithTimeout } from './fetch-with-timeout'

export interface ConnectionTestResult {
  success: boolean
  message: string
  latencyMs: number | null
}

export async function testProviderConnection(
  settings: AppSettings
): Promise<ConnectionTestResult> {
  const startTime = Date.now()

  try {
    switch (settings.provider) {
      case 'anthropic':
        return await testAnthropic(settings, startTime)
      case 'openai':
        return await testOpenAICompatible(settings, startTime, 'https://api.openai.com/v1', 'OpenAI')
      case 'gemini':
        return await testGemini(settings, startTime)
      case 'openrouter':
        return await testOpenAICompatible(settings, startTime, 'https://openrouter.ai/api/v1', 'OpenRouter')
      case 'ollama':
        return await testOllama(settings, startTime)
      case 'lmstudio':
        return await testOpenAICompatible(settings, startTime, settings.baseUrl || 'http://localhost:1234/v1', 'LM Studio')
      case 'custom':
        return await testOpenAICompatible(settings, startTime, settings.baseUrl || 'http://localhost:8080/v1', 'Custom endpoint')
      default:
        return { success: false, message: `Unknown provider: ${settings.provider}`, latencyMs: null }
    }
  } catch (error) {
    return {
      success: false,
      message: friendlyError(error),
      latencyMs: Date.now() - startTime,
    }
  }
}

// ─── Provider-specific tests ─────────────────────────────────────────────────

async function testAnthropic(settings: AppSettings, startTime: number): Promise<ConnectionTestResult> {
  if (settings.useProxy && settings.proxyUrl) {
    // Just check if the proxy URL responds
    const response = await fetchWithTimeout(settings.proxyUrl.replace(/\/$/, ''), { method: 'GET' })
    const latency = Date.now() - startTime
    if (response.ok || response.status === 405 || response.status === 404) {
      // Proxy is reachable (405/404 is expected for GET on a POST-only endpoint)
      return { success: true, message: `Proxy is reachable (${latency}ms)`, latencyMs: latency }
    }
    return { success: false, message: `Proxy returned status ${response.status}`, latencyMs: latency }
  }

  // Send a minimal message to verify API key
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: settings.modelId,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'test' }],
    }),
  })

  const latency = Date.now() - startTime

  if (response.ok) {
    return { success: true, message: `Connected to Anthropic (${latency}ms)`, latencyMs: latency }
  }

  const errorBody = await response.text().catch(() => '')
  if (response.status === 401) {
    return { success: false, message: 'Invalid API key. Check your Anthropic API key.', latencyMs: latency }
  }
  if (response.status === 404) {
    return { success: false, message: `Model "${settings.modelId}" not found. Check the model ID.`, latencyMs: latency }
  }
  return { success: false, message: `Anthropic error ${response.status}: ${errorBody.slice(0, 200)}`, latencyMs: latency }
}

async function testOpenAICompatible(
  settings: AppSettings,
  startTime: number,
  defaultBaseUrl: string,
  providerName: string
): Promise<ConnectionTestResult> {
  const baseUrl = (settings.baseUrl || defaultBaseUrl).replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (settings.apiKey) headers['Authorization'] = `Bearer ${settings.apiKey}`

  const isLocal = providerName === 'LM Studio' || providerName === 'Custom endpoint'

  // Try listing models first — lightweight check
  const response = await fetchWithTimeout(`${baseUrl}/models`, {
    method: 'GET',
    headers,
  }, isLocal)

  const latency = Date.now() - startTime

  if (response.ok) {
    return { success: true, message: `Connected to ${providerName} (${latency}ms)`, latencyMs: latency }
  }

  if (response.status === 401) {
    return { success: false, message: `Invalid API key for ${providerName}.`, latencyMs: latency }
  }
  if (response.status === 403) {
    return { success: false, message: `Access denied. Check your ${providerName} API key permissions.`, latencyMs: latency }
  }
  return { success: false, message: `${providerName} returned status ${response.status}`, latencyMs: latency }
}

async function testGemini(settings: AppSettings, startTime: number): Promise<ConnectionTestResult> {
  const baseUrl = settings.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
  const url = `${baseUrl}/models?key=${settings.apiKey}`

  const response = await fetchWithTimeout(url, { method: 'GET' })
  const latency = Date.now() - startTime

  if (response.ok) {
    return { success: true, message: `Connected to Gemini (${latency}ms)`, latencyMs: latency }
  }

  if (response.status === 400 || response.status === 403) {
    return { success: false, message: 'Invalid API key. Check your Google AI API key.', latencyMs: latency }
  }
  return { success: false, message: `Gemini returned status ${response.status}`, latencyMs: latency }
}

async function testOllama(settings: AppSettings, startTime: number): Promise<ConnectionTestResult> {
  const baseUrl = (settings.baseUrl || 'http://localhost:11434').replace(/\/$/, '')

  // Ollama has a simple /api/tags endpoint to list models
  const response = await fetchWithTimeout(`${baseUrl}/api/tags`, {
    method: 'GET',
  }, true)

  const latency = Date.now() - startTime

  if (response.ok) {
    const data = (await response.json()) as { models?: Array<{ name: string }> }
    const modelCount = data.models?.length ?? 0
    return {
      success: true,
      message: `Connected to Ollama (${latency}ms). ${modelCount} model${modelCount === 1 ? '' : 's'} available.`,
      latencyMs: latency,
    }
  }

  return {
    success: false,
    message: `Cannot reach Ollama at ${baseUrl}. Is it running? Try: ollama serve`,
    latencyMs: latency,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function friendlyError(error: unknown): string {
  const msg = String(error)
  if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
    return 'Cannot connect. Check the URL and make sure the server is running.'
  }
  if (msg.includes('timed out')) {
    return msg
  }
  return msg.length > 300 ? msg.slice(0, 300) + '...' : msg
}
