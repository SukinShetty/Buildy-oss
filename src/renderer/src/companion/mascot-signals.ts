// mascot-signals.ts
// Pure mapping from an incoming AnalysisResult (plus the previously seen one)
// to mascot props: alignment glow, one-shot event reactions, and whether to
// raise the "!" alert badge. Kept free of React/assets so it unit-tests cleanly.
//
// Event semantics:
//   - Reactions fire on TRANSITIONS into a state, not on every analysis, so a
//     blocked/permission state that persists across cycles doesn't hop the
//     mascot every 30 seconds.
//   - The main process re-sends the SAME analysis (same analyzedAt) when a
//     background pass patches it (verifier verdict, grader-improved prompt —
//     see patchDisplayAndResend in analysis-loop.ts). Success fires when the
//     verdict first appears, and never again for that analysis.
//   - When several events coincide in one analysis, the most urgent wins:
//     blocked > success > permission. The badge is raised regardless of which
//     reaction animates.
//   - A hand-off the user already answered or dismissed (isResolved) no longer
//     counts: it raises no badge and no reaction, however often it is re-sent.

import type { AnalysisResult } from '../types'
// Type-only import — erased at build time, so this module never pulls the
// mascot's PNG/framer-motion imports into a test run.
import type { MascotAlignment, MascotReactionType } from '../components/Mascot'

export interface MascotSignals {
  /** Glow color while watching: on-track green, drift amber, blocked red. */
  alignment: MascotAlignment | null
  /** One-shot reaction to play (the caller assigns a fresh id), or null. */
  reaction: MascotReactionType | null
  /** True when a NEW blocked/hand-off alert should raise the "!" badge. */
  raiseAlertBadge: boolean
}

/** BLOCKED alignment and unresolved hand-off moments share one alert treatment. */
function isBlocked(a: AnalysisResult, isResolved: (a: AnalysisResult) => boolean): boolean {
  return a.goalAlignment === 'blocked' || (!!a.needsHumanJudgment && !isResolved(a))
}

export function deriveMascotSignals(
  current: AnalysisResult,
  previous: AnalysisResult | null,
  isResolved: (a: AnalysisResult) => boolean = () => false
): MascotSignals {
  // Transition into blocked / hand-off.
  const newBlocked =
    isBlocked(current, isResolved) && (previous === null || !isBlocked(previous, isResolved))

  // Verifier success: fires when a success verdict is first seen — either on a
  // fresh analysis, or when the verdict is patched onto the one already shown.
  const prevAlreadySucceeded =
    previous !== null &&
    previous.analyzedAt === current.analyzedAt &&
    previous.verification?.status === 'success'
  const newSuccess = current.verification?.status === 'success' && !prevAlreadySucceeded

  // Transition into a permission prompt (agent asking y/n).
  const newPermission =
    current.terminalState === 'permission_prompt' &&
    previous?.terminalState !== 'permission_prompt'

  const reaction: MascotReactionType | null = newBlocked
    ? 'blocked'
    : newSuccess
      ? 'success'
      : newPermission
        ? 'permission'
        : null

  return {
    alignment: current.goalAlignment ?? null,
    reaction,
    raiseAlertBadge: newBlocked,
  }
}
