// What the guidance panel and project memory get from one real analysis cycle.
// Drives the real analysis loop (Electron-bound neighbours mocked, no provider
// call) with the checker output and memory text seen in the installed-build
// smoke test.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalysisResult } from '../renderer/src/types'

vi.mock('electron', () => ({ app: { getPath: () => '.' }, screen: {}, BrowserWindow: class {} }))

const CHECKER_REASON =
  "The prompt contains implicit requests for human confirmation ('Should I proceed?'), violating criterion 6. " +
  "Additionally, it is redundant — the project memory states Claude Code is 'currently reading the existing code' and has already run the tests."

const mocks = vi.hoisted(() => {
  const capture = { imageBase64: 'AAAA', windowTitle: 'Terminal', sourceId: 'window:1:0', capturedAt: '2026-01-01T00:00:00Z' }
  const writer = {
    recordObservation: vi.fn(async () => {}),
    recordCompletion: vi.fn(async () => {}),
    recordBlocker: vi.fn(async () => {}),
    recordDecision: vi.fn(async () => {}),
    recordPattern: vi.fn(async () => {}),
  }
  return {
    capture,
    writer,
    analysis: null as unknown as AnalysisResult,
    captureWatchedWindow: vi.fn(async () => capture),
    listLiveWindowSources: vi.fn(async () => [{ id: 'window:1:0', name: 'Terminal' }]),
    capturePollThumbnail: vi.fn(async () => 'AAAA'),
    checkPromptQuality: vi.fn(),
    verifyPromptOutcome: vi.fn(),
    pending: null as null | { id: string; promptText: string; expectedOutcome: string },
  }
})

vi.mock('./capturer', () => ({
  captureWatchedWindow: mocks.captureWatchedWindow,
  listLiveWindowSources: mocks.listLiveWindowSources,
  capturePollThumbnail: mocks.capturePollThumbnail,
}))
vi.mock('./ai/provider-registry', () => ({
  getProvider: () => ({ analyzeScreen: vi.fn(async () => ({ ...mocks.analysis })) }),
}))
vi.mock('./guidance-window', () => ({ showGuidanceWindow: vi.fn(), sendGuidanceSendState: vi.fn(), hideGuidanceWindow: vi.fn() }))
vi.mock('./voice-player', () => ({ enqueueSpeech: vi.fn() }))
vi.mock('./nemp-bridge', () => ({
  getContextSummary: vi.fn(async () => 'Recent activity:\n- Claude Code is currently reading the existing code'),
  memoryScope: () => 'store-A',
  writerFor: () => mocks.writer,
}))
vi.mock('./projects', () => ({ getActiveProject: () => ({ id: 'proj-A' }) }))
vi.mock('./prompt-sender', () => ({ executeSend: vi.fn(), isSendInFlight: () => false, isWatchedWindowPresent: vi.fn(async () => true) }))
vi.mock('./vision-approvals', () => ({ hasVisionPass: () => true }))
// The REAL buildQualityPatch policy; only the grader's AI call is mocked.
vi.mock('./ai/prompt-quality-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ai/prompt-quality-check')>()),
  checkPromptQuality: mocks.checkPromptQuality,
}))
vi.mock('./ai/verifier-check', () => ({ verifyPromptOutcome: mocks.verifyPromptOutcome }))
vi.mock('./verifier', () => ({
  getMostRecentPending: () => mocks.pending,
  resolveOutcome: vi.fn(),
  clearOutcomes: vi.fn(),
  replacePendingOutcome: vi.fn(),
}))

import { startWatching, stopAnalysisLoop } from './analysis-loop'
import { defaultSettings, IPC } from '../renderer/src/types'
import { claimsGoalReached } from './display-consistency'

const send = vi.fn()
const fakeWindow = { isDestroyed: () => false, webContents: { send } } as never
const settings = { ...defaultSettings(), provider: 'openai' as const, modelId: 'gpt-test', apiKey: 'sk-test-0000000000000000' }

function baseAnalysis(): AnalysisResult {
  return {
    screenContentVisible: true,
    whatIsHappening: 'Claude Code is currently reading the existing code.',
    whatItMeans: 'The invoices work is being checked.',
    whatIsBuilt: ['Invoices screen'],
    whatIsMissing: [],
    whatIsBroken: [],
    whereUserIsStuck: null,
    bestNextMove: 'Let the tests finish.',
    nextPrompt: 'Run the invoice tests. Should I proceed?',
    expectedOutcome: 'Tests run.',
    builderNote: 'Nice work.',
    goalAlignment: 'on-track',
    alignmentNote: '',
    terminalState: 'awaiting_prompt',
    agentName: 'claude_code',
    analyzedAt: '2026-01-01T00:00:05.000Z',
    analysisDurationMs: 10,
  }
}

/** Every analysis the companion (and so the guidance panel) was sent. */
function shown(): AnalysisResult[] {
  return send.mock.calls.filter((c) => c[0] === IPC.COMPANION_ANALYSIS).map((c) => c[1] as AnalysisResult)
}

beforeEach(() => {
  send.mockClear()
  for (const fn of Object.values(mocks.writer)) fn.mockClear()
  mocks.checkPromptQuality.mockReset()
  mocks.verifyPromptOutcome.mockReset()
  mocks.pending = null
  mocks.analysis = baseAnalysis()
  mocks.checkPromptQuality.mockResolvedValue({ valid: true })
})

afterEach(() => {
  stopAnalysisLoop()
})

describe('analysis cycle → guidance panel', () => {
  it('a hand-off from the checker shows a short question, never the checker reasoning', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete process.env['MYBUILDY_DEBUG']
    // The exact checker output from the smoke test; no separate user question.
    mocks.checkPromptQuality.mockResolvedValue({ valid: false, humanDirected: true, reason: CHECKER_REASON })

    startWatching(fakeWindow, 'window:1:0', 'Terminal', async () => settings, async () => null)
    await vi.waitFor(() => expect(shown().some((a) => a.needsHumanJudgment)).toBe(true))

    const card = shown().find((a) => a.needsHumanJudgment)!.humanJudgmentReason || ''
    expect(card).not.toMatch(/criterion/i)
    expect(card).not.toContain('currently reading the existing code')
    expect(card).not.toMatch(/['"“”‘’]/)
    expect(card.split(/(?<=[.!?])\s+/).filter(Boolean).length).toBeLessThanOrEqual(2)
    // The checker's reasoning reaches no log without MYBUILDY_DEBUG.
    const logged = [...log.mock.calls, ...warn.mock.calls].flat().map(String).join('\n')
    expect(logged).not.toContain('criterion 6')
    log.mockRestore(); warn.mockRestore()
  })

  it('a partial verdict never sits next to a "goal reached" headline', async () => {
    mocks.analysis = {
      ...baseAnalysis(),
      whatIsHappening: 'You have reached your goal — the Invoices screen saves and lists invoices.',
      bestNextMove: 'Goal reached. Save your work.',
      builderNote: 'Great job, you hit your goal!',
    }
    mocks.pending = { id: 'p1', promptText: 'Add invoice saving', expectedOutcome: 'Invoices save and export to PDF' }
    mocks.verifyPromptOutcome.mockResolvedValue({ status: 'partial', note: 'Invoices save, but PDF export is missing.' })

    startWatching(fakeWindow, 'window:1:0', 'Terminal', async () => settings, async () => null)
    await vi.waitFor(() => expect(shown().some((a) => a.verification?.status === 'partial')).toBe(true))

    const withBadge = shown().filter((a) => a.verification?.status === 'partial')
    for (const a of withBadge) {
      for (const text of [a.whatIsHappening, a.whatItMeans, a.bestNextMove, a.builderNote, a.alignmentNote]) {
        expect(claimsGoalReached(text), String(text)).toBe(false)
      }
      expect(a.goalAlignment).toBe('on-track') // the pill: progress, not "reached"
    }
  })

  it('momentary agent state is never saved to project memory; durable facts are', async () => {
    startWatching(fakeWindow, 'window:1:0', 'Terminal', async () => settings, async () => null)
    await vi.waitFor(() => expect(mocks.writer.recordCompletion).toHaveBeenCalled())

    const saved = Object.values(mocks.writer).flatMap((fn) => fn.mock.calls.flat().map(String))
    expect(saved.join('\n')).not.toContain('currently reading')
    expect(mocks.writer.recordObservation).not.toHaveBeenCalled()
    expect(mocks.writer.recordCompletion).toHaveBeenCalledWith('Invoices screen')
  })
})
