import { describe, it, expect } from 'vitest'
import type { AnalysisResult } from './types'
import { HANDOFF_FALLBACK, ResolvedHandoffs, handoffRef } from './handoff'
import { deriveMascotSignals } from './companion/mascot-signals'

function a(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    screenContentVisible: true,
    whatIsHappening: '', whatItMeans: '', whatIsBuilt: [], whatIsMissing: [], whatIsBroken: [],
    whereUserIsStuck: null, bestNextMove: '', nextPrompt: '', builderNote: '',
    goalAlignment: 'on-track',
    analyzedAt: '2026-01-01T00:00:00.000Z',
    analysisDurationMs: 1,
    ...over,
  }
}

const QUESTION = 'Tests pass. Want to check the Invoices screen before saving your work?'
const handoff = (over: Partial<AnalysisResult> = {}) => a({ needsHumanJudgment: true, humanJudgmentReason: QUESTION, ...over })

describe('resolved hand-offs ("I\'ll decide" / "Skip for now")', () => {
  it('the same analysis re-sent after a patch stays resolved', () => {
    const resolved = new ResolvedHandoffs()
    resolved.resolve(handoffRef(handoff())!)
    expect(resolved.isResolved(handoff({ verification: { status: 'partial', note: '' } }))).toBe(true)
  })

  it('the same question on a later cycle stays resolved; a different one does not', () => {
    const resolved = new ResolvedHandoffs()
    resolved.resolve(handoffRef(handoff())!)
    expect(resolved.isResolved(handoff({ analyzedAt: '2026-01-01T00:01:00.000Z' }))).toBe(true)
    expect(resolved.isResolved(handoff({ analyzedAt: '2026-01-01T00:01:00.000Z', humanJudgmentReason: 'Monthly or yearly plans?' }))).toBe(false)
  })

  it('the generic fallback is matched by analysis only, so a later one still alerts', () => {
    const resolved = new ResolvedHandoffs()
    resolved.resolve(handoffRef(handoff({ humanJudgmentReason: HANDOFF_FALLBACK }))!)
    expect(resolved.isResolved(handoff({ humanJudgmentReason: HANDOFF_FALLBACK }))).toBe(true)
    expect(resolved.isResolved(handoff({ humanJudgmentReason: HANDOFF_FALLBACK, analyzedAt: '2026-01-01T00:05:00.000Z' }))).toBe(false)
  })

  it('a new watch starts with nothing resolved', () => {
    const resolved = new ResolvedHandoffs()
    resolved.resolve(handoffRef(handoff())!)
    resolved.clear()
    expect(resolved.isResolved(handoff())).toBe(false)
  })

  it('once resolved, the "!" badge is not raised again for that hand-off', () => {
    const resolved = new ResolvedHandoffs()
    const isResolved = (x: AnalysisResult) => resolved.isResolved(x)
    const first = handoff()
    expect(deriveMascotSignals(first, null, isResolved).raiseAlertBadge).toBe(true)

    resolved.resolve(handoffRef(first)!)
    // Re-sent after a patch, and re-asked on the next cycle after a plain analysis.
    expect(deriveMascotSignals(handoff({ verification: { status: 'partial', note: '' } }), first, isResolved).raiseAlertBadge).toBe(false)
    const plain = a({ analyzedAt: '2026-01-01T00:01:00.000Z' })
    expect(deriveMascotSignals(handoff({ analyzedAt: '2026-01-01T00:02:00.000Z' }), plain, isResolved).raiseAlertBadge).toBe(false)
    // A different hand-off still alerts.
    expect(deriveMascotSignals(handoff({ analyzedAt: '2026-01-01T00:03:00.000Z', humanJudgmentReason: 'Monthly or yearly plans?' }), plain, isResolved).raiseAlertBadge).toBe(true)
  })
})
