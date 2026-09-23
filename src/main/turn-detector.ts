// turn-detector.ts — main process (ELECTRON-FREE, pure decision logic)
// Turn-end detection: while the coding agent is mid-turn, Buildy must spend
// nothing — no AI calls on the normal 10s timer. Instead the loop takes a cheap
// LOW-RESOLUTION local capture every 5s (never sent anywhere) and feeds the
// change fraction into this state machine, which decides when ONE analysis is
// worth running:
//
//   • Working mode = last analysis said terminalState "working", OR we are
//     within 3 minutes of a Send (the agent is presumably chewing on it).
//   • Turn end   = the screen changed since the last analysis and then stayed
//     unchanged for two consecutive polls (changed → stable → stable). The
//     agent most likely finished — analyze now (within ~10s of it stopping).
//   • Checkpoint = the screen has kept changing for 3 minutes straight — run
//     one progress analysis anyway, then restart the clock.
//
// No timers, no Electron, no Date.now() — callers pass timestamps. This keeps
// the whole policy unit-testable (see turn-detector.test.ts).

import type { TerminalState } from '../renderer/src/types'
import { IMAGE_CHANGE_THRESHOLD } from './change-detector'

/** Cadence of the low-res local poll while the agent is working. */
export const TURN_POLL_INTERVAL_MS = 5_000

export interface TurnDetectorConfig {
  /** A poll's changeFraction at/above this counts as "the screen changed". */
  changeThreshold: number
  /** How long after a Send the loop treats the agent as working. */
  sendWorkingWindowMs: number
  /** Continuous change for this long forces one progress analysis. */
  checkpointMs: number
  /** Consecutive stable polls (after a change) that mean the turn ended. */
  stablePollsToTrigger: number
}

export const DEFAULT_TURN_CONFIG: TurnDetectorConfig = {
  changeThreshold: IMAGE_CHANGE_THRESHOLD,
  sendWorkingWindowMs: 180_000,
  checkpointMs: 180_000,
  stablePollsToTrigger: 2,
}

export type TurnAction = 'analyze-now' | 'wait'

export interface PollEvent {
  timestamp: number
  /** Output of computeImageChangeFraction vs the PREVIOUS poll thumbnail. */
  changeFraction: number
}

export class TurnDetector {
  private readonly config: TurnDetectorConfig
  private lastTerminalState: TerminalState | undefined
  private lastSendAt: number | null = null
  /** Start of the current observation window (last analysis / send / fire). */
  private anchorAt: number | null = null
  private changedSinceAnalysis = false
  private stableStreak = 0

  constructor(config?: Partial<TurnDetectorConfig>) {
    this.config = { ...DEFAULT_TURN_CONFIG, ...config }
  }

  /** New watch session — back to normal mode with no history. */
  reset(): void {
    this.lastTerminalState = undefined
    this.lastSendAt = null
    this.anchorAt = null
    this.changedSinceAnalysis = false
    this.stableStreak = 0
  }

  /** Record the terminalState of an analysis that just completed. */
  noteAnalysis(timestamp: number, terminalState: TerminalState | undefined): void {
    this.lastTerminalState = terminalState
    this.resetObservation(timestamp)
  }

  /** Record that a prompt was just sent into the watched window. */
  noteSend(timestamp: number): void {
    this.lastSendAt = timestamp
    if (this.anchorAt === null || timestamp > this.anchorAt) this.anchorAt = timestamp
  }

  /**
   * True while the agent is mid-turn: the normal 10s timer must NOT run AI
   * analyses; the 5s local poll watches for the turn to end instead.
   */
  isWorking(timestamp: number): boolean {
    if (this.lastTerminalState === 'working') return true
    return this.lastSendAt !== null &&
      timestamp - this.lastSendAt < this.config.sendWorkingWindowMs
  }

  /** Feed one low-res poll result; decide whether to run an analysis NOW. */
  onPoll(event: PollEvent): TurnAction {
    if (!this.isWorking(event.timestamp)) return 'wait'
    if (this.anchorAt === null) this.anchorAt = event.timestamp

    const changed = event.changeFraction >= this.config.changeThreshold
    if (changed) {
      this.changedSinceAnalysis = true
      this.stableStreak = 0
    } else if (this.changedSinceAnalysis) {
      this.stableStreak++
    }

    // Nothing has happened on screen since the last analysis — the agent is
    // idle-looking mid-turn (long tool run, network wait): trigger nothing.
    if (!this.changedSinceAnalysis) return 'wait'

    // Turn end: changed → stable → stable.
    if (this.stableStreak >= this.config.stablePollsToTrigger) {
      this.resetObservation(event.timestamp)
      return 'analyze-now'
    }

    // Progress checkpoint: continuously changing for 3 minutes.
    if (event.timestamp - this.anchorAt >= this.config.checkpointMs) {
      this.resetObservation(event.timestamp)
      return 'analyze-now'
    }

    return 'wait'
  }

  /**
   * Consume the current observation window. Called on every analysis AND when a
   * trigger fires, so a fired trigger can never double-fire — and if the
   * triggered analysis fails, a fresh changed→stable→stable self-heals.
   */
  private resetObservation(timestamp: number): void {
    this.anchorAt = timestamp
    this.changedSinceAnalysis = false
    this.stableStreak = 0
  }
}

// ─── Permission-prompt alert (spec item 2) ───────────────────────────────────

/**
 * Speak the alert only on the TRANSITION into permission_prompt — never
 * re-announce while the same continuous permission prompt stays on screen.
 */
export function shouldAnnouncePermission(
  previous: TerminalState | undefined,
  current: TerminalState | undefined
): boolean {
  return current === 'permission_prompt' && previous !== 'permission_prompt'
}

/**
 * One short spoken line for a permission prompt. Until Task B adds real
 * agentName detection, the agent is derived heuristically from the window
 * title; agents rename the terminal every turn, so the generic fallback is
 * common and fine.
 */
export function permissionAlertLine(windowTitle: string | null | undefined): string {
  const title = (windowTitle || '').toLowerCase()
  if (title.includes('claude')) return 'Claude Code is asking for your approval.'
  if (title.includes('codex')) return 'Codex is asking for your approval.'
  if (title.includes('gemini')) return 'Gemini is asking for your approval.'
  if (title.includes('aider')) return 'Aider is asking for your approval.'
  return 'Your coding agent is asking for your approval.'
}
