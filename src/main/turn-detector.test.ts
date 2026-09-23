import { describe, it, expect } from 'vitest'
import {
  TurnDetector,
  TURN_POLL_INTERVAL_MS,
  DEFAULT_TURN_CONFIG,
  shouldAnnouncePermission,
  permissionAlertLine,
} from './turn-detector'

const T0 = 1_000_000
const STEP = TURN_POLL_INTERVAL_MS // 5s poll cadence

/** Feed one poll event; returns the action. */
function poll(d: TurnDetector, t: number, changeFraction: number): string {
  return d.onPoll({ timestamp: t, changeFraction })
}

describe('working mode — when the normal 10s timer must NOT call the AI', () => {
  it('is not working before any analysis or send', () => {
    const d = new TurnDetector()
    expect(d.isWorking(T0)).toBe(false)
  })

  it('entering working mode (terminalState "working") stops timer analyses', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    expect(d.isWorking(T0 + 1_000)).toBe(true)
    // Stays working until a later analysis says otherwise — no time-based decay.
    expect(d.isWorking(T0 + 10 * 60_000)).toBe(true)
  })

  it('leaving working mode restores the normal cycle', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    d.noteAnalysis(T0 + 30_000, 'awaiting_prompt')
    expect(d.isWorking(T0 + 31_000)).toBe(false)
  })

  it('the 3 minutes after a Send count as working mode', () => {
    const d = new TurnDetector()
    d.noteSend(T0)
    expect(d.isWorking(T0 + 1_000)).toBe(true)
    expect(d.isWorking(T0 + DEFAULT_TURN_CONFIG.sendWorkingWindowMs - 1_000)).toBe(true)
    expect(d.isWorking(T0 + DEFAULT_TURN_CONFIG.sendWorkingWindowMs + 1_000)).toBe(false)
  })

  it('send window ends but a "working" analysis keeps working mode on', () => {
    const d = new TurnDetector()
    d.noteSend(T0)
    d.noteAnalysis(T0 + 5_000, 'working')
    expect(d.isWorking(T0 + DEFAULT_TURN_CONFIG.sendWorkingWindowMs + 60_000)).toBe(true)
  })

  it('reset() clears everything (new watch session starts in normal mode)', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    d.noteSend(T0)
    d.reset()
    expect(d.isWorking(T0 + 1_000)).toBe(false)
  })
})

describe('turn-end trigger — changed, then stable twice', () => {
  it('changed → stable → stable triggers exactly one analyze-now', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    expect(poll(d, T0 + STEP, 0.4)).toBe('wait') // changed
    expect(poll(d, T0 + 2 * STEP, 0.0)).toBe('wait') // stable ×1
    expect(poll(d, T0 + 3 * STEP, 0.0)).toBe('analyze-now') // stable ×2 → fire
    // No re-fire while the screen stays quiet.
    expect(poll(d, T0 + 4 * STEP, 0.0)).toBe('wait')
    expect(poll(d, T0 + 5 * STEP, 0.0)).toBe('wait')
  })

  it('an unchanged screen mid-turn triggers nothing', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    for (let i = 1; i <= 20; i++) {
      expect(poll(d, T0 + i * STEP, 0.0)).toBe('wait')
    }
  })

  it('a new change resets the stable count (changed→stable→changed→stable→stable)', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    expect(poll(d, T0 + STEP, 0.3)).toBe('wait') // changed
    expect(poll(d, T0 + 2 * STEP, 0.0)).toBe('wait') // stable ×1
    expect(poll(d, T0 + 3 * STEP, 0.5)).toBe('wait') // changed again — streak resets
    expect(poll(d, T0 + 4 * STEP, 0.0)).toBe('wait') // stable ×1
    expect(poll(d, T0 + 5 * STEP, 0.0)).toBe('analyze-now') // stable ×2 → fire
  })

  it('a change below the threshold counts as stable', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    expect(poll(d, T0 + STEP, 0.4)).toBe('wait') // changed
    expect(poll(d, T0 + 2 * STEP, 0.01)).toBe('wait') // sub-threshold = stable ×1
    expect(poll(d, T0 + 3 * STEP, 0.02)).toBe('analyze-now') // stable ×2 → fire
  })

  it('after the triggered analysis, a fresh changed→stable→stable is required again', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    poll(d, T0 + STEP, 0.4)
    poll(d, T0 + 2 * STEP, 0.0)
    expect(poll(d, T0 + 3 * STEP, 0.0)).toBe('analyze-now')
    d.noteAnalysis(T0 + 3 * STEP + 2_000, 'working') // still mid-turn per the AI
    // Stability alone must not re-fire — a new change is required first.
    expect(poll(d, T0 + 4 * STEP, 0.0)).toBe('wait')
    expect(poll(d, T0 + 5 * STEP, 0.0)).toBe('wait')
    expect(poll(d, T0 + 6 * STEP, 0.3)).toBe('wait') // changed
    expect(poll(d, T0 + 7 * STEP, 0.0)).toBe('wait') // stable ×1
    expect(poll(d, T0 + 8 * STEP, 0.0)).toBe('analyze-now') // stable ×2
  })

  it('polls outside working mode never trigger', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'awaiting_prompt')
    expect(poll(d, T0 + STEP, 0.9)).toBe('wait')
    expect(poll(d, T0 + 2 * STEP, 0.0)).toBe('wait')
    expect(poll(d, T0 + 3 * STEP, 0.0)).toBe('wait')
  })

  it('the 3-minutes-after-send window can trigger a turn-end analysis', () => {
    const d = new TurnDetector()
    d.noteSend(T0)
    expect(poll(d, T0 + STEP, 0.4)).toBe('wait')
    expect(poll(d, T0 + 2 * STEP, 0.0)).toBe('wait')
    expect(poll(d, T0 + 3 * STEP, 0.0)).toBe('analyze-now')
  })
})

describe('progress checkpoint — continuous change for 3 minutes', () => {
  it('continuous change for 3 minutes triggers analyze-now exactly once', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    const fired: number[] = []
    for (let t = T0 + STEP; t <= T0 + DEFAULT_TURN_CONFIG.checkpointMs + STEP; t += STEP) {
      if (poll(d, t, 0.5) === 'analyze-now') fired.push(t)
    }
    expect(fired).toHaveLength(1)
    expect(fired[0]! - T0).toBeGreaterThanOrEqual(DEFAULT_TURN_CONFIG.checkpointMs)
  })

  it('the checkpoint clock restarts after each analysis', () => {
    const d = new TurnDetector()
    d.noteAnalysis(T0, 'working')
    // 2 minutes of continuous change, then an analysis happens (e.g. turn-end
    // elsewhere) — the next checkpoint is 3 minutes from THAT analysis.
    for (let t = T0 + STEP; t <= T0 + 120_000; t += STEP) {
      expect(poll(d, t, 0.5)).toBe('wait')
    }
    d.noteAnalysis(T0 + 121_000, 'working')
    for (let t = T0 + 125_000; t < T0 + 121_000 + DEFAULT_TURN_CONFIG.checkpointMs; t += STEP) {
      expect(poll(d, t, 0.5)).toBe('wait')
    }
    expect(poll(d, T0 + 121_000 + DEFAULT_TURN_CONFIG.checkpointMs, 0.5)).toBe('analyze-now')
  })
})

describe('permission-prompt announcement dedup', () => {
  it('announces when entering permission_prompt', () => {
    expect(shouldAnnouncePermission('working', 'permission_prompt')).toBe(true)
    expect(shouldAnnouncePermission('awaiting_prompt', 'permission_prompt')).toBe(true)
    expect(shouldAnnouncePermission(undefined, 'permission_prompt')).toBe(true)
  })

  it('does NOT re-announce while the state stays permission_prompt', () => {
    expect(shouldAnnouncePermission('permission_prompt', 'permission_prompt')).toBe(false)
  })

  it('never announces for non-permission states', () => {
    expect(shouldAnnouncePermission('permission_prompt', 'working')).toBe(false)
    expect(shouldAnnouncePermission('working', 'awaiting_prompt')).toBe(false)
    expect(shouldAnnouncePermission('working', undefined)).toBe(false)
  })

  it('announces again after leaving and re-entering', () => {
    expect(shouldAnnouncePermission('permission_prompt', 'working')).toBe(false)
    expect(shouldAnnouncePermission('working', 'permission_prompt')).toBe(true)
  })
})

describe('permissionAlertLine — agent name from the window title (heuristic until Task B)', () => {
  it('names Claude Code when the title mentions claude', () => {
    expect(permissionAlertLine('✳ Claude Code')).toBe('Claude Code is asking for your approval.')
    expect(permissionAlertLine('claude — ~/project')).toBe('Claude Code is asking for your approval.')
  })

  it('names other known agents from the title', () => {
    expect(permissionAlertLine('Codex CLI')).toBe('Codex is asking for your approval.')
    expect(permissionAlertLine('gemini session')).toBe('Gemini is asking for your approval.')
    expect(permissionAlertLine('aider: repo')).toBe('Aider is asking for your approval.')
  })

  it('falls back to a generic line when the title identifies no agent', () => {
    // Agents rename the terminal every turn — a task title carries no agent name.
    expect(permissionAlertLine('Set up SQLite database and client management feature'))
      .toBe('Your coding agent is asking for your approval.')
    expect(permissionAlertLine(null)).toBe('Your coding agent is asking for your approval.')
    expect(permissionAlertLine('')).toBe('Your coding agent is asking for your approval.')
  })

  // Phase 5 Task B: the model now reports agentName — prefer it over the title.
  it('prefers the model-reported agentName over the title heuristic', () => {
    expect(permissionAlertLine('Set up SQLite database', 'claude_code'))
      .toBe('Claude Code is asking for your approval.')
    expect(permissionAlertLine('claude — ~/project', 'codex'))
      .toBe('Codex is asking for your approval.')
  })

  it('falls back to the title heuristic when agentName is "other" or absent', () => {
    expect(permissionAlertLine('Codex CLI', 'other')).toBe('Codex is asking for your approval.')
    expect(permissionAlertLine('plain task title', 'other'))
      .toBe('Your coding agent is asking for your approval.')
    expect(permissionAlertLine('aider: repo', undefined)).toBe('Aider is asking for your approval.')
  })
})
