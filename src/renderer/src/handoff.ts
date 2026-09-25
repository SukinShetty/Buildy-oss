// handoff.ts — identity of a hand-off, shared by the guidance window (where the
// card's buttons are) and the companion window (where the "!" badge is).
//
// A hand-off the user has answered ("I'll decide") or dismissed ("Skip for now")
// is RESOLVED: its badge clears at once and never comes back for it. "The same
// hand-off" means the same analysis (main re-sends it with the same analyzedAt
// whenever a background pass patches it) or, within one watch, the same question
// asked again on a later cycle. The generic fallback question is matched by
// analysis only — otherwise dismissing it once would hide every later one.
// Pure (no React, no window.*), so it unit-tests cleanly.

import type { AnalysisResult } from './types'

export const HANDOFF_FALLBACK =
  'Claude Code has finished. Check the result, then tell MyBuildy what to do next.'

export interface HandoffRef {
  analyzedAt: string
  question: string
}

/** The hand-off an analysis carries, or null when it is not a hand-off. */
export function handoffRef(analysis: AnalysisResult | null | undefined): HandoffRef | null {
  if (!analysis?.needsHumanJudgment) return null
  return { analyzedAt: analysis.analyzedAt, question: (analysis.humanJudgmentReason || '').trim() }
}

function questionKey(question: string): string | null {
  const q = question.replace(/\s+/g, ' ').trim().toLowerCase()
  return q && q !== HANDOFF_FALLBACK.toLowerCase() ? q : null
}

export class ResolvedHandoffs {
  private readonly analyses = new Set<string>()
  private readonly questions = new Set<string>()

  resolve(ref: HandoffRef): void {
    if (ref.analyzedAt) this.analyses.add(ref.analyzedAt)
    const q = questionKey(ref.question)
    if (q) this.questions.add(q)
  }

  /** True when this analysis's hand-off has already been answered or dismissed. */
  isResolved(analysis: AnalysisResult | null | undefined): boolean {
    const ref = handoffRef(analysis)
    if (!ref) return false
    if (this.analyses.has(ref.analyzedAt)) return true
    const q = questionKey(ref.question)
    return q !== null && this.questions.has(q)
  }

  /** A new watch starts with nothing resolved. */
  clear(): void {
    this.analyses.clear()
    this.questions.clear()
  }
}
