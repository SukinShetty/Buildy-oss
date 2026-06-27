// capture-guard.ts — main process (ELECTRON-FREE, unit-tested)
// Pure decision helpers for two safety-critical behaviours:
//   1. Screen capture must NEVER silently fall back to the full desktop. When the
//      selected window is missing, capture halts with a reason.
//   2. The analysis loop must discard results from a stale watching session (the
//      user switched/stopped the watched window while a cycle was in flight), so
//      guidance for the wrong window is never shown or spoken.

export type CaptureHalt = 'no-source' | 'window-missing'

/**
 * Decide whether a capture should halt (and why) instead of producing an image.
 * Returns null only when there IS a selected source AND it was found.
 * There is intentionally no "fall back to full screen" branch.
 */
export function captureHaltReason(sourceId: string | null, windowFound: boolean): CaptureHalt | null {
  if (!sourceId) return 'no-source'
  if (!windowFound) return 'window-missing'
  return null
}

/**
 * True if a cycle that started in `cycleSession` is now stale because the current
 * session has advanced (window switched / watch stopped+restarted). Stale results
 * must be discarded: do not mutate state, send guidance, or speak.
 */
export function isStaleSession(cycleSession: number, currentSession: number): boolean {
  return cycleSession !== currentSession
}
