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
  const text = redactSecrets(String(errorText || ''), [])
  const lower = text.toLowerCase()
  const code = status ?? extractStatus(text)

  // Errors built by providerHttpError carry their classification as a tag
  // ("(HTTP 429, billing)"), because the body they were classified from is gone.
  const tagged = /\(HTTP (\d{3}), ([a-z-]+)\)/.exec(text)
  if (tagged && tagged[2] !== 'unknown') {
    const kind = tagged[2] as ProviderErrorKind
    const message = MESSAGE_FOR_KIND[kind]
    if (message) return { kind, message }
  }

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

const MESSAGE_FOR_KIND: Partial<Record<ProviderErrorKind, string>> = {
  'key-rejected': PROVIDER_ERROR_MESSAGES.keyRejected,
  billing: PROVIDER_ERROR_MESSAGES.billing,
  'rate-limited': PROVIDER_ERROR_MESSAGES.rateLimited,
  'model-not-found': PROVIDER_ERROR_MESSAGES.modelNotFound,
  network: PROVIDER_ERROR_MESSAGES.network,
  'cannot-read-images': PROVIDER_ERROR_MESSAGES.cannotReadImages,
}

// ─── Safe HTTP errors ────────────────────────────────────────────────────────
// A provider's error body can echo request data back — including the API key
// ("Incorrect API key provided: sk-…"). The body is read ONLY to classify the
// failure here and is then dropped: nothing downstream (logs, the mascot label,
// the guidance panel, IPC replies) ever sees it.

const MAX_ERROR_BODY_CHARS = 4096

export class ProviderHttpError extends Error {
  constructor(label: string, readonly status: number, readonly kind: ProviderErrorKind, plain: string) {
    super(`${label} request failed (HTTP ${status}, ${kind}): ${plain}`)
    this.name = 'ProviderHttpError'
  }
}

export async function providerHttpError(label: string, response: Response): Promise<ProviderHttpError> {
  let body = ''
  try {
    body = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS)
  } catch {
    // unreadable body: classify from the status alone
  }
  const mapped = mapProviderError(body, response.status)
  const plain = mapped.kind === 'unknown' ? 'the provider returned an error.' : mapped.message
  return new ProviderHttpError(label, response.status, mapped.kind, plain)
}

// Key shapes used by the supported providers (OpenAI/OpenRouter/Anthropic sk-…,
// Google AIza…, ElevenLabs sk_…) plus bearer tokens in pasted headers.
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bsk_[A-Za-z0-9]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{20,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
]

/** Replace known secret values and key-shaped strings with [redacted]. */
export function redactSecrets(text: string, knownSecrets: readonly string[]): string {
  let out = String(text ?? '')
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]')
  }
  for (const pattern of KEY_PATTERNS) out = out.replace(pattern, '[redacted]')
  return out
}
