// capture-guard.ts — main process (ELECTRON-FREE, unit-tested)
// Pure decision helpers for safety-critical watch behaviours:
//   1. Screen capture must NEVER silently fall back to the full desktop. When the
//      selected window is missing, capture halts with a reason.
//   2. The analysis loop must discard results from a stale watching session (the
//      user switched/stopped the watched window while a cycle was in flight), so
//      guidance for the wrong window is never shown or spoken.
//   3. Continuity-based watch identity: AI coding agents (Claude Code, Codex)
//      rename the terminal on every state change, so the title is NOT an
//      identity field. On Windows a desktopCapturer source id (window:<HWND>:0)
//      can only be reused after the original window is destroyed — so an id that
//      is present in every consecutive continuity poll since selection is the
//      same window regardless of title. Only when the id DISAPPEARS does reuse
//      become possible; the grace rules below guard that gap.

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
 * Locate the user's watched window in the CURRENT live window list by source id.
 *
 * Identity is the source id ALONE — the title is deliberately not checked,
 * because coding agents legitimately rename their terminal every turn and a
 * title match would halt the watch on every rename. HWND/id reuse (a closed
 * window's id handed to a different window) is guarded by the continuity
 * tracker instead: reuse requires the original window to be destroyed first,
 * which makes the id vanish from at least one 2s continuity poll, and the
 * missing-state rules in pollContinuity decide whether a returning id may be
 * trusted. Returns null to signal "not in the list right now" — the caller
 * NEVER falls through to another window or the full screen.
 */
export function findWatchedSource<T extends { id: string; name: string }>(
  sources: readonly T[],
  watchedId: string | null
): T | null {
  if (!watchedId) return null
  return sources.find((s) => s.id === watchedId) ?? null
}

/**
 * True if a cycle that started in `cycleSession` is now stale because the current
 * session has advanced (window switched / watch stopped+restarted). Stale results
 * must be discarded: do not mutate state, send guidance, or speak.
 */
export function isStaleSession(cycleSession: number, currentSession: number): boolean {
  return cycleSession !== currentSession
}

// ─── Watch continuity (title changes are NOT target loss) ────────────────────

// Missing-id grace rules (see pollContinuity):
//   - back within 15 s → same window even if renamed during the gap → resume
//   - back within 60 s → resume ONLY if the normalized title still matches
//   - absent for 60 s → the window is really gone → halt, user must reselect
export const MISSING_RESUME_ANY_TITLE_MS = 15_000
export const MISSING_LOST_MS = 60_000

export type WatchContinuityState = 'watching' | 'missing' | 'lost'

export interface WatchContinuity {
  sourceId: string
  title: string              // last title seen while confirmed to be the same window
  state: WatchContinuityState
  missingSinceMs: number | null
}

export type ContinuityEvent =
  | { kind: 'none' }
  | { kind: 'title-changed'; from: string; to: string }
  | { kind: 'went-missing' }
  | { kind: 'resumed'; title: string }
  | { kind: 'lost' }

/** Begin tracking the user-selected window (called on watch start). */
export function startContinuity(sourceId: string, title: string): WatchContinuity {
  return { sourceId, title, state: 'watching', missingSinceMs: null }
}

/**
 * Normalize a window title for identity comparison across agent status glyphs:
 * trim, drop leading non-alphanumeric characters (spinners/status marks such as
 * ✳ or ⠋), lowercase, collapse whitespace. "✳ Claude Code", "⠋ Claude Code" and
 * "claude code" all normalize to "claude code".
 */
export function normalizeTitle(title: string): string {
  return (title || '')
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Advance the continuity tracker with a fresh window-source poll. Mutates the
 * tracker and returns the event the caller should react to.
 *
 * Present id  → same window (id reuse requires destruction first, which would
 *               have shown up as a missing poll). A changed title is accepted
 *               and stored — never a halt.
 * Missing id  → grace: within MISSING_RESUME_ANY_TITLE_MS any title resumes;
 *               within MISSING_LOST_MS only a normalized-title match resumes
 *               (a returning id with a different title after a long gap is
 *               indistinguishable from HWND reuse by another window → halt);
 *               after MISSING_LOST_MS the watch is lost.
 */
export function pollContinuity(
  watch: WatchContinuity,
  sources: readonly { id: string; name: string }[],
  nowMs: number
): ContinuityEvent {
  if (watch.state === 'lost') return { kind: 'none' }

  const source = findWatchedSource(sources, watch.sourceId)

  if (!source) {
    if (watch.state === 'watching') {
      watch.state = 'missing'
      watch.missingSinceMs = nowMs
      return { kind: 'went-missing' }
    }
    // Already missing — check whether the grace window has run out.
    if (nowMs - (watch.missingSinceMs ?? nowMs) >= MISSING_LOST_MS) {
      watch.state = 'lost'
      return { kind: 'lost' }
    }
    return { kind: 'none' }
  }

  if (watch.state === 'watching') {
    if (source.name !== watch.title) {
      const from = watch.title
      watch.title = source.name
      return { kind: 'title-changed', from, to: source.name }
    }
    return { kind: 'none' }
  }

  // state === 'missing' and the id is back.
  const missingForMs = nowMs - (watch.missingSinceMs ?? nowMs)
  const sameNormalizedTitle = normalizeTitle(source.name) === normalizeTitle(watch.title)
  if (missingForMs <= MISSING_RESUME_ANY_TITLE_MS || (missingForMs < MISSING_LOST_MS && sameNormalizedTitle)) {
    watch.state = 'watching'
    watch.missingSinceMs = null
    watch.title = source.name
    return { kind: 'resumed', title: source.name }
  }
  // Back too late (≥ 60 s) or with a different identity after the 15 s
  // any-title grace — cannot distinguish from HWND reuse. Halt.
  watch.state = 'lost'
  return { kind: 'lost' }
}
