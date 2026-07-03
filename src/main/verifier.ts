// verifier.ts — main process (loop engineering Block 4)
// Tracks the prompts Buildy has suggested so the NEXT analysis can verify whether
// the pasted prompt achieved its intended outcome. This is a companion app, not a
// database: we keep only the most recent 1-2 pending outcomes in memory. Nothing
// here is persisted, and the store is cleared whenever the watch session changes.

export type PromptOutcomeStatus = 'pending' | 'success' | 'failed' | 'partial'

export interface PromptOutcome {
  id: string
  suggestedAt: string          // ISO timestamp when Buildy suggested the prompt
  promptText: string           // the nextPrompt the user was told to paste
  expectedOutcome: string      // one-sentence success description
  status: PromptOutcomeStatus
  verifiedAt?: string          // ISO timestamp when a verdict was reached
  note?: string                // plain-English verdict detail
  correctivePrompt?: string    // a better prompt when the previous one failed
}

const MAX_PENDING = 2

let pending: PromptOutcome[] = []

/**
 * Record a newly-suggested prompt as a pending outcome. Only the most recent
 * MAX_PENDING are kept. Ignores empty prompts/outcomes (nothing to verify).
 * Returns the created outcome, or null when there is nothing worth tracking.
 */
export function recordPendingOutcome(promptText: string, expectedOutcome: string): PromptOutcome | null {
  const p = (promptText || '').trim()
  const o = (expectedOutcome || '').trim()
  if (!p || !o) return null

  const outcome: PromptOutcome = {
    id: `outcome:${Date.now()}`,
    suggestedAt: new Date().toISOString(),
    promptText: p,
    expectedOutcome: o,
    status: 'pending',
  }
  pending.push(outcome)
  // Keep only the most recent few.
  if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING)
  return outcome
}

/**
 * The most recent still-pending outcome to verify against the next analysis, or
 * null if there is nothing awaiting verification.
 */
export function getMostRecentPending(): PromptOutcome | null {
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].status === 'pending') return pending[i]
  }
  return null
}

/** All tracked outcomes (mostly for tests / diagnostics). */
export function getOutcomes(): readonly PromptOutcome[] {
  return pending
}

/**
 * Apply a verdict to a tracked outcome. A resolved (success/failed/partial)
 * outcome is dropped from the pending set so it is never verified twice; a
 * 'pending' status leaves it in place to retry on a later cycle.
 */
export function resolveOutcome(
  id: string,
  status: PromptOutcomeStatus,
  note?: string,
  correctivePrompt?: string
): void {
  const found = pending.find((o) => o.id === id)
  if (!found) return
  found.status = status
  found.verifiedAt = new Date().toISOString()
  found.note = note
  found.correctivePrompt = correctivePrompt
  if (status !== 'pending') {
    pending = pending.filter((o) => o.id !== id)
  }
}

/** Clear all tracked outcomes (called on watch start / stop / window switch). */
export function clearOutcomes(): void {
  pending = []
}
