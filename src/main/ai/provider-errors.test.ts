// provider-errors.test.ts
// Error mapping: raw provider errors → exact plain-English strings shown on the
// mascot label, guidance panel and the Settings test result.

import { describe, it, expect } from 'vitest'
import { mapProviderError, PROVIDER_ERROR_MESSAGES } from './provider-errors'

describe('mapProviderError', () => {
  it('401 → key rejected', () => {
    const r = mapProviderError('Anthropic API error 401: {"type":"authentication_error"}')
    expect(r.kind).toBe('key-rejected')
    expect(r.message).toBe('Your API key was rejected. Open Settings and check it.')
  })

  it('403 → key rejected', () => {
    const r = mapProviderError('OpenAI API error 403: forbidden')
    expect(r.kind).toBe('key-rejected')
    expect(r.message).toBe(PROVIDER_ERROR_MESSAGES.keyRejected)
  })

  it('402 → billing problem', () => {
    const r = mapProviderError('OpenRouter API error 402: insufficient balance')
    expect(r.kind).toBe('billing')
    expect(r.message).toBe('No credits or a billing problem on your provider account. Check your provider billing page.')
  })

  it('OpenAI insufficient_quota → billing problem (even on a 429 status)', () => {
    const r = mapProviderError('OpenAI API error 429: {"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}')
    expect(r.kind).toBe('billing')
    expect(r.message).toBe(PROVIDER_ERROR_MESSAGES.billing)
  })

  it('Anthropic "credit balance is too low" → billing problem', () => {
    const r = mapProviderError('Anthropic API error 400: Your credit balance is too low to access the Anthropic API.')
    expect(r.kind).toBe('billing')
    expect(r.message).toBe(PROVIDER_ERROR_MESSAGES.billing)
  })

  it('429 → rate limited', () => {
    const r = mapProviderError('Anthropic API error 429: rate_limit_error')
    expect(r.kind).toBe('rate-limited')
    expect(r.message).toBe('Rate limited by the provider. Wait a minute and try again.')
  })

  it('404 → model not found', () => {
    const r = mapProviderError('OpenAI API error 404: The model `gpt-nonexistent` does not exist')
    expect(r.kind).toBe('model-not-found')
    expect(r.message).toBe('Model not found. Choose a different model in Settings.')
  })

  it('timeout → network message', () => {
    const r = mapProviderError('Request timed out after 60s. The API may be experiencing issues — try again.')
    expect(r.kind).toBe('network')
    expect(r.message).toBe("Can't reach the provider. Check your internet connection.")
  })

  it('connection refused / fetch failure → network message', () => {
    expect(mapProviderError('TypeError: fetch failed').kind).toBe('network')
    expect(mapProviderError('Error: connect ECONNREFUSED 127.0.0.1:11434').kind).toBe('network')
  })

  it('image-unsupported errors → cannot read images', () => {
    const r = mapProviderError('Ollama error 400: this model does not support image input')
    expect(r.kind).toBe('cannot-read-images')
    expect(r.message).toBe("This model can't see your screen. Pick one that passes the check.")
  })

  it('unknown errors keep a trimmed provider message', () => {
    const r = mapProviderError('Something exotic happened')
    expect(r.kind).toBe('unknown')
    expect(r.message).toContain('Something exotic happened')
  })

  it('an explicit status wins over text sniffing', () => {
    const r = mapProviderError('weird body', 401)
    expect(r.kind).toBe('key-rejected')
  })
})
