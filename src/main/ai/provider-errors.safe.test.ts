import { describe, it, expect } from 'vitest'
import { providerHttpError, redactSecrets, mapProviderError, PROVIDER_ERROR_MESSAGES } from './provider-errors'

const FAKE_KEY = 'sk-proj-FAKEKEYFAKEKEYFAKEKEY0123456789abcd'
const echoBody = (extra = '') =>
  JSON.stringify({ error: { message: `Incorrect API key provided: ${FAKE_KEY}. ${extra}`, type: 'invalid_request_error' } })

describe('providerHttpError — the raw response body never leaves this function', () => {
  it('keeps status and plain-English meaning, drops the body (including an echoed key)', async () => {
    const err = await providerHttpError('OpenAI', new Response(echoBody(), { status: 401 }))
    expect(err.message).not.toContain(FAKE_KEY)
    expect(err.message).not.toContain('Incorrect API key')
    expect(err.message).toContain('HTTP 401')
    expect(err.status).toBe(401)
    expect(err.kind).toBe('key-rejected')
    expect(mapProviderError(err.message)).toEqual({ kind: 'key-rejected', message: PROVIDER_ERROR_MESSAGES.keyRejected })
  })

  it('still classifies billing from the body (OpenAI insufficient_quota arrives as 429)', async () => {
    const err = await providerHttpError('OpenAI', new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 }))
    expect(err.kind).toBe('billing')
    expect(err.message).not.toContain('insufficient_quota')
    expect(mapProviderError(err.message).kind).toBe('billing')
  })

  it('an unrecognised failure gives a generic message, never the body', async () => {
    const err = await providerHttpError('Gemini', new Response(`weird upstream failure ${FAKE_KEY}`, { status: 500 }))
    expect(err.message).not.toContain(FAKE_KEY)
    expect(err.message).not.toContain('weird upstream failure')
    expect(mapProviderError(err.message).message).not.toContain(FAKE_KEY)
  })
})

describe('redactSecrets — second safeguard on anything logged or sent to a window', () => {
  it('removes known secret values and key-shaped strings', () => {
    const text = `failed with ${FAKE_KEY} and sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX and AIzaSyA1234567890abcdefghijklmnop and my-own-custom-token-123`
    const out = redactSecrets(text, ['my-own-custom-token-123'])
    for (const secret of [FAKE_KEY, 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX', 'AIzaSyA1234567890abcdefghijklmnop', 'my-own-custom-token-123']) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('[redacted]')
  })

  it('leaves ordinary text alone', () => {
    expect(redactSecrets('Model not found (HTTP 404)', [])).toBe('Model not found (HTTP 404)')
  })

  it('mapProviderError never echoes a key-shaped string even from an unknown error', () => {
    expect(mapProviderError(`Error: something odd happened near ${FAKE_KEY}`).message).not.toContain(FAKE_KEY)
  })
})
