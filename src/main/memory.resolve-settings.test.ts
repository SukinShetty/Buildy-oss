// resolveSettings is where every provider call gets its base URL and key.
import { describe, it, expect, vi } from 'vitest'
import { tmpdir } from 'node:os'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, safeStorage: { isEncryptionAvailable: () => true } }))

const secrets: Record<string, string> = {
  customApiKey: 'custom-secret-key-000000',
  openaiApiKey: 'sk-openai-000000000000000000',
  elevenLabsApiKey: '',
}
let boundOrigin: string | null = 'https://llm.example.com'
vi.mock('./secure-store', () => ({
  getSecret: (name: string) => secrets[name] ?? '',
  hasSecret: (name: string) => !!secrets[name],
  getAllRedacted: () => ({}),
  getCustomKeyOrigin: () => boundOrigin,
  secretKeyForProvider: (p: string) => ({ openai: 'openaiApiKey', custom: 'customApiKey' } as Record<string, string>)[p] ?? null,
}))

import { resolveSettings } from './memory'
import { defaultNonSecretSettings } from '../renderer/src/types'

const base = defaultNonSecretSettings()

describe('resolveSettings — keys only go where they belong', () => {
  it('custom key is sent to the origin it was entered for', () => {
    boundOrigin = 'https://llm.example.com'
    expect(resolveSettings({ ...base, provider: 'custom', baseUrl: 'https://llm.example.com/v1' }).apiKey).toBe('custom-secret-key-000000')
  })

  it('custom key is withheld when the endpoint points somewhere else', () => {
    boundOrigin = 'https://llm.example.com'
    expect(resolveSettings({ ...base, provider: 'custom', baseUrl: 'https://attacker.example.net/v1' }).apiKey).toBe('')
    boundOrigin = null // key saved before origin binding existed
    expect(resolveSettings({ ...base, provider: 'custom', baseUrl: 'https://llm.example.com/v1' }).apiKey).toBe('')
  })

  it('a disallowed saved base URL for a cloud provider falls back to the provider default', () => {
    const s = resolveSettings({ ...base, provider: 'openai', baseUrl: 'http://api.openai.com/v1' })
    expect(s.baseUrl).toBe('')
    expect(s.apiKey).toBe('sk-openai-000000000000000000')
  })
})
