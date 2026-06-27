// ipc-schemas.ts — main process
// Strict input validation for IPC handlers. The renderer is treated as untrusted:
// every handler validates its payload against a zod schema before acting, and
// provider base URLs are checked against an allowlist so a compromised renderer
// can't redirect cloud API calls (with the user's key) to an attacker host.

import { z } from 'zod'
import type { IpcMainInvokeEvent, IpcMainEvent } from 'electron'

// ─── Validation helper ──────────────────────────────────────────────────────────

/** Parse `value` with `schema`; on failure log + throw (rejecting the handler). */
export function parseInput<T>(schema: z.ZodType<T>, channel: string, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    console.warn(`[IPC] rejected invalid input on channel ${channel}: ${result.error.issues.map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`)
    throw new Error(`Invalid input on ${channel}`)
  }
  return result.data
}

/** Sender check: only the main app window may mutate secrets/settings. */
export function assertFromMainWindow(
  event: IpcMainInvokeEvent | IpcMainEvent,
  mainWindowWebContentsId: number,
  channel: string
): void {
  if (event.sender.id !== mainWindowWebContentsId) {
    console.warn(`[IPC] rejected ${channel}: sender is not the main window`)
    throw new Error(`Unauthorized sender on ${channel}`)
  }
}

// ─── Provider URL allowlist ───────────────────────────────────────────────────────

const ALLOWED_CLOUD_HOSTS = new Set([
  'api.anthropic.com',
  'api.openai.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.elevenlabs.io',
])

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
}

/**
 * Validate a provider base URL. Empty → provider default (always fine). Cloud
 * providers may only target allowlisted hosts; local providers must be localhost;
 * a custom base URL is allowed ONLY for the explicit "custom" provider.
 */
export function isAllowedBaseUrl(provider: string, baseUrl: string): boolean {
  const b = (baseUrl || '').trim()
  if (!b) return true
  const host = hostnameOf(b)
  if (!host) return false
  switch (provider) {
    case 'anthropic':
    case 'openai':
    case 'gemini':
    case 'openrouter':
      return ALLOWED_CLOUD_HOSTS.has(host)
    case 'ollama':
    case 'lmstudio':
      return isLocalHost(host)
    case 'custom':
      return b.startsWith('http://') || b.startsWith('https://')
    default:
      return false
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────────

export const providerEnum = z.enum([
  'anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'lmstudio', 'custom',
])

export const secretNameEnum = z.enum([
  'anthropicApiKey', 'openaiApiKey', 'geminiApiKey', 'openrouterApiKey', 'customApiKey', 'elevenLabsApiKey',
])

// Unknown keys are STRIPPED by zod's default object parse — so a renderer that tries
// to sneak an `apiKey` field into a settings save has it silently dropped.
export const nonSecretSettingsSchema = z.object({
  provider: providerEnum,
  modelId: z.string().min(1).max(200),
  baseUrl: z.string().max(2000),
  autoAnalysisIntervalSeconds: z.number().int().min(5).max(3600),
  elevenLabsVoiceId: z.string().max(200),
})

export const setSecretSchema = z.object({
  name: secretNameEnum,
  value: z.string().max(2000),
})

export const captureResultSchema = z.object({
  imageBase64: z.string().max(40_000_000),
  windowTitle: z.string().max(2000),
  sourceId: z.string().max(2000),
  wasClaudeCodeAutoDetected: z.boolean().optional(),
  capturedAt: z.string().max(64).optional(),
}).passthrough()

export const projectMemorySchema = z.object({}).passthrough() // shape validated elsewhere; just ensure it's an object

export const goalPartialSchema = z.object({
  purpose: z.string().max(5000).optional(),
  audience: z.string().max(2000).optional(),
  mostImportant: z.string().max(2000).optional(),
  successCriteria: z.string().max(2000).optional(),
  createdAt: z.string().max(64).optional(),
  lastReviewedAt: z.string().max(64).optional(),
}).passthrough()

export const shortText = z.string().max(10_000)
export const sourceId = z.string().max(2000)
export const windowName = z.string().max(2000)
export const confidenceEnum = z.enum(['low', 'medium', 'high'])
export const chatHistorySchema = z.array(
  z.object({ role: z.string().max(32), content: z.string().max(100_000), timestamp: z.string().max(64).optional() })
).max(200)
