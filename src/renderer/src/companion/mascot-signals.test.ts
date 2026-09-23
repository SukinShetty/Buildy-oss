// mascot-signals.test.ts
// Pure mapping from an incoming AnalysisResult (plus the previously seen one)
// to mascot props: alignment glow, one-shot reactions, and the "!" alert badge.
//
// Event semantics under test:
//   - Reactions fire on TRANSITIONS, not on every analysis, so a persistent
//     blocked/permission state doesn't hop the mascot every cycle.
//   - The main process re-sends the SAME analysis (same analyzedAt) when a
//     background pass patches it (e.g. the verifier verdict arrives) — a
//     re-send must not replay an already-fired success.
//   - Priority when several events land in one analysis: blocked > success > permission.

import { describe, it, expect } from 'vitest'
import { deriveMascotSignals } from './mascot-signals'
import type { AnalysisResult } from '../types'

// Neutral sample analysis — only the fields the mapper reads are meaningful.
function makeAnalysis(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    screenContentVisible: true,
    whatIsHappening: 'sample activity',
    whatItMeans: 'sample meaning',
    whatIsBuilt: [],
    whatIsMissing: [],
    whatIsBroken: [],
    whereUserIsStuck: null,
    bestNextMove: 'sample move',
    nextPrompt: '',
    builderNote: 'sample note',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    analysisDurationMs: 100,
    ...overrides,
  }
}

describe('deriveMascotSignals — alignment glow', () => {
  it('passes goalAlignment through', () => {
    expect(deriveMascotSignals(makeAnalysis({ goalAlignment: 'on-track' }), null).alignment).toBe('on-track')
    expect(deriveMascotSignals(makeAnalysis({ goalAlignment: 'drift' }), null).alignment).toBe('drift')
    expect(deriveMascotSignals(makeAnalysis({ goalAlignment: 'blocked' }), null).alignment).toBe('blocked')
  })

  it('is null when the analysis has no goal alignment', () => {
    expect(deriveMascotSignals(makeAnalysis(), null).alignment).toBeNull()
    expect(deriveMascotSignals(makeAnalysis({ goalAlignment: null }), null).alignment).toBeNull()
  })
})

describe('deriveMascotSignals — no event', () => {
  it('a plain on-track analysis produces no reaction and no badge', () => {
    const s = deriveMascotSignals(makeAnalysis({ goalAlignment: 'on-track' }), null)
    expect(s.reaction).toBeNull()
    expect(s.raiseAlertBadge).toBe(false)
  })
})

describe('deriveMascotSignals — verifier success', () => {
  it('fires success when a success verdict arrives', () => {
    const current = makeAnalysis({ verification: { status: 'success', note: 'it worked' } })
    expect(deriveMascotSignals(current, null).reaction).toBe('success')
  })

  it('does not fire success for failed/partial verdicts', () => {
    expect(
      deriveMascotSignals(makeAnalysis({ verification: { status: 'failed', note: 'nope' } }), null).reaction
    ).toBeNull()
    expect(
      deriveMascotSignals(makeAnalysis({ verification: { status: 'partial', note: 'kind of' } }), null).reaction
    ).toBeNull()
  })

  it('fires success when the verdict is patched onto the SAME analysis (re-send)', () => {
    const prev = makeAnalysis({ analyzedAt: '2026-01-01T00:01:00.000Z' })
    const current = makeAnalysis({
      analyzedAt: '2026-01-01T00:01:00.000Z',
      verification: { status: 'success', note: 'it worked' },
    })
    expect(deriveMascotSignals(current, prev).reaction).toBe('success')
  })

  it('does not replay success on a second re-send of the same analysis', () => {
    const prev = makeAnalysis({
      analyzedAt: '2026-01-01T00:01:00.000Z',
      verification: { status: 'success', note: 'it worked' },
    })
    const current = makeAnalysis({
      analyzedAt: '2026-01-01T00:01:00.000Z',
      verification: { status: 'success', note: 'it worked' },
      nextPrompt: 'patched prompt', // some other patch triggered the re-send
    })
    expect(deriveMascotSignals(current, prev).reaction).toBeNull()
  })

  it('fires again for a NEW analysis with its own success verdict', () => {
    const prev = makeAnalysis({
      analyzedAt: '2026-01-01T00:01:00.000Z',
      verification: { status: 'success', note: 'first win' },
    })
    const current = makeAnalysis({
      analyzedAt: '2026-01-01T00:02:00.000Z',
      verification: { status: 'success', note: 'second win' },
    })
    expect(deriveMascotSignals(current, prev).reaction).toBe('success')
  })
})

describe('deriveMascotSignals — blocked / hand-off', () => {
  it('fires blocked + badge when alignment turns blocked', () => {
    const s = deriveMascotSignals(makeAnalysis({ goalAlignment: 'blocked' }), makeAnalysis({ goalAlignment: 'on-track' }))
    expect(s.reaction).toBe('blocked')
    expect(s.raiseAlertBadge).toBe(true)
  })

  it('fires blocked + badge on a hand-off (needsHumanJudgment)', () => {
    const s = deriveMascotSignals(makeAnalysis({ needsHumanJudgment: true }), makeAnalysis())
    expect(s.reaction).toBe('blocked')
    expect(s.raiseAlertBadge).toBe(true)
  })

  it('does not re-fire while the analysis stays blocked', () => {
    const s = deriveMascotSignals(
      makeAnalysis({ goalAlignment: 'blocked', analyzedAt: '2026-01-01T00:02:00.000Z' }),
      makeAnalysis({ goalAlignment: 'blocked', analyzedAt: '2026-01-01T00:01:00.000Z' })
    )
    expect(s.reaction).toBeNull()
    expect(s.raiseAlertBadge).toBe(false)
  })

  it('a hand-off following a blocked alignment is still the same alert (no re-fire)', () => {
    const s = deriveMascotSignals(
      makeAnalysis({ needsHumanJudgment: true }),
      makeAnalysis({ goalAlignment: 'blocked' })
    )
    expect(s.reaction).toBeNull()
    expect(s.raiseAlertBadge).toBe(false)
  })
})

describe('deriveMascotSignals — permission prompt', () => {
  it('fires permission when the agent starts asking for approval', () => {
    const s = deriveMascotSignals(
      makeAnalysis({ terminalState: 'permission_prompt' }),
      makeAnalysis({ terminalState: 'working' })
    )
    expect(s.reaction).toBe('permission')
  })

  it('fires permission on the first analysis of a session', () => {
    expect(deriveMascotSignals(makeAnalysis({ terminalState: 'permission_prompt' }), null).reaction).toBe('permission')
  })

  it('does not re-fire while the permission prompt persists', () => {
    const s = deriveMascotSignals(
      makeAnalysis({ terminalState: 'permission_prompt', analyzedAt: '2026-01-01T00:02:00.000Z' }),
      makeAnalysis({ terminalState: 'permission_prompt', analyzedAt: '2026-01-01T00:01:00.000Z' })
    )
    expect(s.reaction).toBeNull()
  })
})

describe('deriveMascotSignals — priority when events coincide', () => {
  it('blocked wins over success', () => {
    const current = makeAnalysis({
      goalAlignment: 'blocked',
      verification: { status: 'success', note: 'previous prompt worked' },
    })
    const s = deriveMascotSignals(current, makeAnalysis())
    expect(s.reaction).toBe('blocked')
    expect(s.raiseAlertBadge).toBe(true) // badge still raised even though the hop shows blocked
  })

  it('success wins over permission', () => {
    const current = makeAnalysis({
      terminalState: 'permission_prompt',
      verification: { status: 'success', note: 'previous prompt worked' },
    })
    expect(deriveMascotSignals(current, makeAnalysis()).reaction).toBe('success')
  })
})
