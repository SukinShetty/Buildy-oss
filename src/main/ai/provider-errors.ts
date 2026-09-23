// provider-errors.ts — PURE mapping from raw provider errors to plain-English
// messages. Used by the Settings vision check AND at runtime (mascot label +
// guidance panel) so the user always sees the same friendly wording.

export type ProviderErrorKind =
  | 'key-rejected'        // 401 / 403
  | 'billing'             // 402, OpenAI insufficient_quota, Anthropic low credit balance
  | 'rate-limited'        // 429
  | 'model-not-found'     // 404
  | 'network'             // timeout / DNS / connection failures
  | 'cannot-read-images'  // model rejected the image input
  | 'unknown'

export const PROVIDER_ERROR_MESSAGES = {
  keyRejected: 'Your API key was rejected. Open Settings and check it.',
  billing: 'No credits or a billing problem on your provider account. Check your provider billing page.',
  rateLimited: 'Rate limited by the provider. Wait a minute and try again.',
  modelNotFound: 'Model not found. Choose a different model in Settings.',
  network: "Can't reach the provider. Check your internet connection.",
  cannotReadImages: "This model can't see your screen. Pick one that passes the check.",
} as const

export interface MappedProviderError {
  kind: ProviderErrorKind
  message: string
}

/** Key/billing errors count toward the "pause watching after 3 in a row" rule. */
export function isAuthOrBillingError(kind: ProviderErrorKind): boolean {
  return kind === 'key-rejected' || kind === 'billing'
}

// Errors bubble up as strings like "Anthropic API error 401: {...}" — pull the
// first plausible HTTP status out of the text when none is given explicitly.
function extractStatus(text: string): number | null {
  const match = text.match(/\b(4\d\d|5\d\d)\b/)
  return match ? Number(match[1]) : null
}

const BILLING_PHRASES = ['insufficient_quota', 'credit balance is too low', 'billing_not_active', 'payment required']
const NETWORK_PHRASES = ['timed out', 'timeout', 'fetch failed', 'econnrefused', 'enotfound', 'econnreset', 'eai_again', 'network error', 'aborterror']
const IMAGE_PHRASES = [
  'does not support image', "doesn't support image", 'image input', 'invalid_image',
  'unsupported image', 'image_url is not supported', 'no images', 'not multimodal', 'vision is not supported',
]

/**
 * Map a raw provider error (message text + optional explicit HTTP status) to a
 * plain-English message. Billing phrases are checked BEFORE status codes:
 * OpenAI reports insufficient_quota with a 429, which is a billing problem —
 * not a transient rate limit.
 */
export function mapProviderError(errorText: string, status?: number | null): MappedProviderError {
  const text = String(errorText || '')
  const lower = text.toLowerCase()
  const code = status ?? extractStatus(text)

  if (BILLING_PHRASES.some((p) => lower.includes(p))) {
    return { kind: 'billing', message: PROVIDER_ERROR_MESSAGES.billing }
  }
  if (code === 401 || code === 403) {
    return { kind: 'key-rejected', message: PROVIDER_ERROR_MESSAGES.keyRejected }
  }
  if (code === 402) {
    return { kind: 'billing', message: PROVIDER_ERROR_MESSAGES.billing }
  }
  if (code === 429) {
    return { kind: 'rate-limited', message: PROVIDER_ERROR_MESSAGES.rateLimited }
  }
  if (code === 404) {
    return { kind: 'model-not-found', message: PROVIDER_ERROR_MESSAGES.modelNotFound }
  }
  if (IMAGE_PHRASES.some((p) => lower.includes(p))) {
    return { kind: 'cannot-read-images', message: PROVIDER_ERROR_MESSAGES.cannotReadImages }
  }
  if (NETWORK_PHRASES.some((p) => lower.includes(p))) {
    return { kind: 'network', message: PROVIDER_ERROR_MESSAGES.network }
  }
  const trimmed = text.replace(/^Error:\s*/, '').slice(0, 160)
  return { kind: 'unknown', message: `Provider error: ${trimmed || 'something went wrong.'}` }
}
