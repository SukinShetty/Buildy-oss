// types.test.ts
// isApiConfigured: a user is ready to talk to a provider when EITHER
//   - an API key is stored for the selected provider (cloud or otherwise), OR
//   - the selected provider is local (ollama / lmstudio / custom) and a baseUrl is set.
// A baseUrl alone on a CLOUD provider does not count — those need a key.

import { describe, it, expect } from 'vitest'
import { isApiConfigured, type ProviderType } from './types'

function s(provider: ProviderType, hasApiKey: boolean, baseUrl: string) {
  return { provider, hasApiKey, baseUrl }
}

describe('isApiConfigured', () => {
  it('returns true when a cloud key is present (empty baseUrl)', () => {
    expect(isApiConfigured(s('anthropic', true, ''))).toBe(true)
    expect(isApiConfigured(s('openai', true, ''))).toBe(true)
    expect(isApiConfigured(s('gemini', true, ''))).toBe(true)
  })

  it('returns false with no key and no baseUrl', () => {
    expect(isApiConfigured(s('anthropic', false, ''))).toBe(false)
    expect(isApiConfigured(s('ollama', false, ''))).toBe(false)
  })

  it('returns true for a local provider with a baseUrl and no key', () => {
    expect(isApiConfigured(s('ollama', false, 'http://localhost:11434'))).toBe(true)
    expect(isApiConfigured(s('lmstudio', false, 'http://localhost:1234'))).toBe(true)
    expect(isApiConfigured(s('custom', false, 'http://localhost:8080/v1'))).toBe(true)
  })

  it('returns false for a cloud provider with a baseUrl but no key', () => {
    expect(isApiConfigured(s('anthropic', false, 'https://example.com'))).toBe(false)
    expect(isApiConfigured(s('openrouter', false, 'https://openrouter.ai/api/v1'))).toBe(false)
  })
})
