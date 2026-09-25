// verifier.ts — main process (loop engineering Block 4)
// Tracks the prompts MyBuildy has suggested so the NEXT analysis can verify whether
// the pasted prompt achieved its intended outcome. This is a companion app, not a
// database: we keep only the most recent 1-2 pending outcomes in memory. Nothing
// here is persisted, and the store is cleared whenever the watch session changes.

export type PromptOutcomeStatus = 'pending' | 'success' | 'failed' | 'partial'

export interface PromptOutcome {
  id: string
  suggestedAt: string          // ISO timestamp when MyBuildy suggested the prompt
  promptText: string           // the nextPrompt the user was told to paste
  expectedOutcome: string      // one-sentence success description
  status: PromptOutcomeStatus
  verifiedAt?: string          // ISO timestamp when a verdict was reached
  note?: string                // plain-English verdict detail
  correctivePrompt?: string    // a better prompt when the previous one failed
}

const MAX_PENDING = 2

// Pending outcomes are namespaced PER PROJECT (in-memory, keyed by project id)
// so a prompt suggested in one project is never verified against another
// project's screen. Switching projects starts the target project with a CLEAN
// pending set — outcomes are transient session state, and anything suggested
// before a switch belongs to a session that no longer exists.
let activeProjectId = 'default'
const pendingByProject = new Map<string, PromptOutcome[]>()

// Monotonic suffix so two outcomes recorded within the same millisecond can
// never share an id (resolveOutcome looks outcomes up by id).
let outcomeCounter = 0

function getPending(): PromptOutcome[] {
  return pendingByProject.get(activeProjectId) ?? []
}

function setPending(outcomes: PromptOutcome[]): void {
  pendingByProject.set(activeProjectId, outcomes)
}

/** Point the verifier at a project. Clears that project's pending set. */
export function setVerifierProject(projectId: string): void {
  activeProjectId = (projectId || '').trim() || 'default'
  pendingByProject.set(activeProjectId, [])
}

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
    id: `outcome:${Date.now()}:${++outcomeCounter}`,
    suggestedAt: new Date().toISOString(),
    promptText: p,
    expectedOutcome: o,
    status: 'pending',
  }
  let pending = [...getPending(), outcome]
  // Keep only the most recent few.
  if (pending.length > MAX_PENDING) pending = pending.slice(-MAX_PENDING)
  setPending(pending)
  return outcome
}

/**
 * Register a prompt the user actually SENT as the single pending outcome,
 * REPLACING everything tracked so far. Suggested prompts pile up every cycle
 * whether or not the user runs them; once one is genuinely sent, it is the only
 * thing worth verifying. Works for any displayed prompt — the first suggestion,
 * a grader-improved version, or a verifier corrective prompt.
 */
export function replacePendingOutcome(promptText: string, expectedOutcome: string): PromptOutcome | null {
  const p = (promptText || '').trim()
  const o = (expectedOutcome || '').trim()
  if (!p || !o) return null
  setPending([])
  return recordPendingOutcome(p, o)
}

/**
 * The most recent still-pending outcome to verify against the next analysis, or
 * null if there is nothing awaiting verification.
 */
export function getMostRecentPending(): PromptOutcome | null {
  const pending = getPending()
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].status === 'pending') return pending[i]
  }
  return null
}

/** All tracked outcomes for the ACTIVE project (mostly for tests / diagnostics). */
export function getOutcomes(): readonly PromptOutcome[] {
  return getPending()
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
  const pending = getPending()
  const found = pending.find((o) => o.id === id)
  if (!found) return
  found.status = status
  found.verifiedAt = new Date().toISOString()
  found.note = note
  found.correctivePrompt = correctivePrompt
  if (status !== 'pending') {
    setPending(pending.filter((o) => o.id !== id))
  }
}

/**
 * Drop a tracked outcome WITHOUT recording a verdict (Phase 3B). Used when the
 * quality grader retracts a suggestion (human-directed → hand-off, or blanked):
 * the prompt was recorded as pending before grading, but it was never kept on
 * screen, so verifying it next cycle would write a spurious result into memory.
 * A stale/unknown/null id is a no-op — in particular, after a real send the
 * suggestion was REPLACED by a new outcome (replacePendingOutcome), so removing
 * the original suggestion's id never touches the sent prompt's outcome.
 */
export function removePendingOutcome(id: string | null | undefined): void {
  if (!id) return
  setPending(getPending().filter((o) => o.id !== id))
}

/** Clear the active project's outcomes (called on watch start / stop / window switch). */
export function clearOutcomes(): void {
  setPending([])
}
