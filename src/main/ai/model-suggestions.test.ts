// model-suggestions.test.ts
// Rule-based "Suggested" tag: only ever applied to a model actually present in
// the live list. Nothing is pre-selected — this is a tag, not a default.

import { describe, it, expect } from 'vitest'
import { pickSuggestedModelId, applySuggestedTag } from './model-suggestions'
import type { ModelChoice } from '../../renderer/src/types'

describe('pickSuggestedModelId', () => {
  it('anthropic: picks the newest Sonnet-class model from the live list', () => {
    const ids = [
      'claude-opus-4-1-20250805',
      'claude-sonnet-4-20250514',
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001',
    ]
    expect(pickSuggestedModelId('anthropic', ids)).toBe('claude-sonnet-4-5-20250929')
  })

  it('openai: picks the newest mini-class model', () => {
    const ids = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o3']
    expect(pickSuggestedModelId('openai', ids)).toBe('gpt-4.1-mini')
  })

  it('gemini: picks the newest flash-class model', () => {
    const ids = ['gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-2.5-flash']
    expect(pickSuggestedModelId('gemini', ids)).toBe('gemini-2.5-flash')
  })

  it('returns null when no class candidate is present in the live list', () => {
    expect(pickSuggestedModelId('anthropic', ['claude-opus-4-1-20250805'])).toBeNull()
    expect(pickSuggestedModelId('openai', [])).toBeNull()
  })

  it('never suggests for providers without a rule (openrouter, local)', () => {
    expect(pickSuggestedModelId('openrouter', ['anthropic/claude-sonnet-4'])).toBeNull()
    expect(pickSuggestedModelId('ollama', ['llava:latest'])).toBeNull()
  })
})

describe('applySuggestedTag', () => {
  it('tags only the suggested model, leaving others untouched', () => {
    const models: ModelChoice[] = [
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ]
    const tagged = applySuggestedTag('gemini', models)
    expect(tagged.find((m) => m.id === 'gemini-2.5-flash')?.suggested).toBe(true)
    expect(tagged.find((m) => m.id === 'gemini-2.5-pro')?.suggested).toBeUndefined()
  })
})
