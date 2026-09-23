// vision-gate.test.ts
// Watching is allowed ONLY after a vision check passed for that exact
// provider + model, and the pass is invalidated when the API key changes
// (the key fingerprint no longer matches).

import { describe, it, expect } from 'vitest'
import { isVisionApproved, upsertApproval } from './vision-gate'
import type { VisionApproval } from './vision-gate'

const passed: VisionApproval = {
  provider: 'anthropic',
  modelId: 'claude-sonnet-4-5-20250929',
  keyFingerprint: 'fp-aaa',
  passedAt: '2026-01-01T00:00:00.000Z',
}

describe('isVisionApproved', () => {
  it('allows watching when the exact provider+model+key passed the check', () => {
    expect(
      isVisionApproved([passed], {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        keyFingerprint: 'fp-aaa',
      })
    ).toBe(true)
  })

  it('blocks watching when no check has passed', () => {
    expect(
      isVisionApproved([], {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        keyFingerprint: 'fp-aaa',
      })
    ).toBe(false)
  })

  it('blocks watching for a different model on the same provider', () => {
    expect(
      isVisionApproved([passed], {
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        keyFingerprint: 'fp-aaa',
      })
    ).toBe(false)
  })

  it('invalidates the pass when the API key changes (fingerprint mismatch)', () => {
    expect(
      isVisionApproved([passed], {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5-20250929',
        keyFingerprint: 'fp-bbb',
      })
    ).toBe(false)
  })

  it('keeps provider identities separate', () => {
    expect(
      isVisionApproved([passed], {
        provider: 'openrouter',
        modelId: 'claude-sonnet-4-5-20250929',
        keyFingerprint: 'fp-aaa',
      })
    ).toBe(false)
  })
})

describe('upsertApproval', () => {
  it('replaces the entry for the same provider+model (new key fingerprint)', () => {
    const next = upsertApproval([passed], { ...passed, keyFingerprint: 'fp-bbb' })
    expect(next).toHaveLength(1)
    expect(next[0].keyFingerprint).toBe('fp-bbb')
  })

  it('adds a separate entry for a different model', () => {
    const other: VisionApproval = { ...passed, modelId: 'claude-haiku-4-5-20251001' }
    const next = upsertApproval([passed], other)
    expect(next).toHaveLength(2)
  })
})
