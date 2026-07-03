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
 * Locate the user's watched window in the CURRENT live window list.
 *
 * The watched target is identified by BOTH its source id AND the exact name the
 * window had when the user picked it. Matching on the source id ALONE is unsafe:
 * on Windows a desktopCapturer window id is `window:<HWND>:0`, and when the
 * watched window closes its HWND — and therefore its source id — can be reused
 * immediately by a DIFFERENT window. A bare id match would then resolve to that
 * unrelated window and Buildy would silently start watching it (the observed
 * "CIVITAS closed → PowerShell watched" reattach). Requiring the name to match
 * as well means a reused id resolves to a different name and is correctly treated
 * as "target lost".
 *
 * Returns the matching source, or null to signal "halt and ask the user to
 * reselect" — we NEVER fall through to another window or the full screen.
 *
 * Trade-off: if the watched window's own title changes, its (id, name) pair no
 * longer matches and it is treated as lost, prompting reselection. That is the
 * intended, safe posture — a title change is ambiguous (same window vs. reused
 * HWND) and Buildy must never guess which window to watch.
 */
export function findWatchedSource<T extends { id: string; name: string }>(
  sources: readonly T[],
  watchedId: string | null,
  watchedName: string | null
): T | null {
  if (!watchedId) return null
  return sources.find((s) => s.id === watchedId && s.name === watchedName) ?? null
}

/**
 * True if a cycle that started in `cycleSession` is now stale because the current
 * session has advanced (window switched / watch stopped+restarted). Stale results
 * must be discarded: do not mutate state, send guidance, or speak.
 */
export function isStaleSession(cycleSession: number, currentSession: number): boolean {
  return cycleSession !== currentSession
}
