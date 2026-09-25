// The robot bar: size setting, hidden state, the bring-back shortcut, and Quit
// shutting everything down. Electron and the window modules are mocked.
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AnalysisResult } from '../renderer/src/types'

const h = vi.hoisted(() => ({
  notifications: [] as Array<{ title: string; body: string }>,
  shown: 0,
  hidden: 0,
  guidanceHidden: 0,
  suppressed: [] as boolean[],
}))

vi.mock('electron', () => ({
  Notification: class {
    static isSupported(): boolean { return true }
    constructor(private readonly opts: { title: string; body: string }) {}
    on(): void {}
    show(): void { h.notifications.push({ title: this.opts.title, body: this.opts.body }) }
  },
}))
vi.mock('./companion-window', () => ({ showCompanion: () => { h.shown++ }, hideCompanion: () => { h.hidden++ } }))
vi.mock('./guidance-window', () => ({
  hideGuidanceWindow: () => { h.guidanceHidden++ },
  setGuidanceSuppressed: (v: boolean) => { h.suppressed.push(v) },
}))

import {
  ROBOT_SIZES, robotWindowSize, clampRobotScale, zoomedRobotScale, robotSizeText, robotSizeName,
} from '../renderer/src/robot-size'
import { loadRobotScale, saveRobotScale } from './robot-prefs'
import { ROBOT_SHORTCUT, robotShortcutLabel, registerRobotShortcut, pressRobotShortcut } from './robot-shortcut'
import { createShutdown, type ShutdownSteps } from './app-shutdown'
import { hideRobot, showRobot, isRobotHidden, noteAnalysisForRobot, hiddenAlertFor } from './robot-visibility'

const dir = mkdtempSync(join(tmpdir(), 'mybuildy-robot-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function analysis(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    screenContentVisible: true, whatIsHappening: '', whatItMeans: '', whatIsBuilt: [], whatIsMissing: [], whatIsBroken: [],
    whereUserIsStuck: null, bestNextMove: '', nextPrompt: '', builderNote: '', goalAlignment: 'on-track',
    analyzedAt: new Date().toISOString(), analysisDurationMs: 1, ...over,
  }
}

describe('robot size setting', () => {
  it('Medium is today\'s size (300 tall, wide enough for the whole bar); Large is 1.5×; Small is smaller', () => {
    expect(robotWindowSize(ROBOT_SIZES.medium)).toEqual({ width: 340, height: 300 })
    expect(robotWindowSize(ROBOT_SIZES.large)).toEqual({ width: 510, height: 450 })
    expect(robotWindowSize(ROBOT_SIZES.small).height).toBeLessThan(300)
  })
  it('Ctrl/Cmd + scroll steps 10% at a time, within limits', () => {
    expect(zoomedRobotScale(1, 'in')).toBe(1.1)
    expect(zoomedRobotScale(1, 'out')).toBe(0.9)
    expect(zoomedRobotScale(1.6, 'in')).toBe(1.6)
    expect(zoomedRobotScale(0.8, 'out')).toBe(0.8)
    expect(clampRobotScale('huge')).toBe(1)
  })
  it('names the size while zooming', () => {
    expect(robotSizeText(1.5)).toBe('Robot size: Large')
    expect(robotSizeText(1.2)).toBe('Robot size: 120%')
    expect(robotSizeName(0.85)).toBe('small')
  })
  it('is remembered across launches; a missing or broken file means Medium', () => {
    expect(loadRobotScale(dir)).toBe(1)
    saveRobotScale(dir, 1.5)
    expect(loadRobotScale(dir)).toBe(1.5)
    writeFileSync(join(dir, 'robot-prefs.json'), '{"scale": 99}')
    expect(loadRobotScale(dir)).toBe(1.6)
    writeFileSync(join(dir, 'robot-prefs.json'), 'nope')
    expect(loadRobotScale(dir)).toBe(1)
  })
})

describe('hidden robot', () => {
  beforeEach(() => {
    showRobot()
    Object.assign(h, { notifications: [], shown: 0, hidden: 0, guidanceHidden: 0, suppressed: [] })
  })

  it('Hide hides the robot and the guidance panel, and suppresses new guidance; watching is untouched', () => {
    hideRobot()
    expect(isRobotHidden()).toBe(true)
    expect(h.hidden).toBe(1)
    expect(h.guidanceHidden).toBe(1)
    expect(h.suppressed).toEqual([true])
    showRobot()
    expect(isRobotHidden()).toBe(false)
    expect(h.shown).toBe(1)
    expect(h.suppressed).toEqual([true, false])
  })

  it('while hidden, a new hand-off or alert shows a system notification — once, never while visible', () => {
    noteAnalysisForRobot(analysis({ needsHumanJudgment: true, humanJudgmentReason: 'Monthly or yearly plans?' }))
    expect(h.notifications).toHaveLength(0) // visible: the robot's "!" badge handles it

    noteAnalysisForRobot(analysis())
    hideRobot()
    noteAnalysisForRobot(analysis({ needsHumanJudgment: true, humanJudgmentReason: 'Monthly or yearly plans?' }))
    noteAnalysisForRobot(analysis({ needsHumanJudgment: true, humanJudgmentReason: 'Monthly or yearly plans?' }))
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].title).toBe('MyBuildy needs your decision')
    expect(h.notifications[0].body).toContain('Monthly or yearly plans?')
  })

  it('alerts: blocked, and the agent asking a question; the notification says how to bring the robot back', () => {
    const blocked = hiddenAlertFor(analysis({ goalAlignment: 'blocked' }), analysis(), 'win32')
    expect(blocked?.title).toMatch(/stuck/)
    expect(blocked?.body).toContain('Ctrl+Shift+B')
    const asking = hiddenAlertFor(analysis({ terminalState: 'permission_prompt' }), analysis(), 'darwin')
    expect(asking?.title).toMatch(/asking you something/)
    expect(asking?.body).toContain('Cmd+Shift+B')
    expect(hiddenAlertFor(analysis(), analysis(), 'win32')).toBeNull()
  })
})

describe('bring-back shortcut', () => {
  it('is Ctrl+Shift+B on Windows and Cmd+Shift+B on Mac', () => {
    expect(ROBOT_SHORTCUT).toBe('CommandOrControl+Shift+B')
    expect(robotShortcutLabel('win32')).toBe('Ctrl+Shift+B')
    expect(robotShortcutLabel('darwin')).toBe('Cmd+Shift+B')
  })
  it('registers globally and brings the robot back when pressed', () => {
    const registered = new Map<string, () => void>()
    const registry = {
      register: (acc: string, cb: () => void) => { registered.set(acc, cb); return true },
      isRegistered: (acc: string) => registered.has(acc),
    }
    const bringBack = vi.fn()
    expect(registerRobotShortcut(registry, bringBack)).toBe(true)
    registered.get(ROBOT_SHORTCUT)!()
    pressRobotShortcut()
    expect(bringBack).toHaveBeenCalledTimes(2)
  })
  it('reports when another app owns the shortcut', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(registerRobotShortcut({ register: () => false, isRegistered: () => false }, vi.fn())).toBe(false)
    warn.mockRestore()
  })
})

describe('Quit shuts everything down', () => {
  function steps(): ShutdownSteps & { order: string[] } {
    const order: string[] = []
    const step = (name: string) => () => { order.push(name) }
    return {
      order,
      markQuitting: step('markQuitting'),
      stopWatching: step('stopWatching'),
      stopVoice: step('stopVoice'),
      tellRobot: step('tellRobot'),
      destroyRobot: step('destroyRobot'),
      destroyGuidance: step('destroyGuidance'),
      destroyVoicePlayer: step('destroyVoicePlayer'),
      destroyMainWindow: step('destroyMainWindow'),
      destroyTray: step('destroyTray'),
      releaseShortcuts: step('releaseShortcuts'),
    }
  }

  it('stops watching and the voice queue, and closes the main window, robot, guidance panel and tray', () => {
    const s = steps()
    createShutdown(s)()
    expect(s.order).toEqual([
      'markQuitting', 'stopWatching', 'stopVoice', 'tellRobot', 'destroyRobot', 'destroyGuidance',
      'destroyVoicePlayer', 'destroyMainWindow', 'destroyTray', 'releaseShortcuts',
    ])
  })

  it('runs once, however many quit paths call it', () => {
    const s = steps()
    const cleanUp = createShutdown(s)
    cleanUp(); cleanUp(); cleanUp()
    expect(s.order.filter((n) => n === 'stopWatching')).toHaveLength(1)
  })

  it('one failing step does not stop the rest', () => {
    const s = steps()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    s.destroyRobot = () => { throw new Error('already gone') }
    createShutdown(s)()
    expect(s.order).toContain('destroyMainWindow')
    expect(s.order).toContain('releaseShortcuts')
    warn.mockRestore()
  })
})
