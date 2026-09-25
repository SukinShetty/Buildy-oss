import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppStore } from '../store/useAppStore'
import { GuidanceController, AUTO_ANALYSIS_INTERVAL_MS, type GuidanceApi } from './guidance-controller'

const capture = { imageBase64: 'AAAA', windowTitle: 'Terminal', sourceId: 'window:1:0', capturedAt: '2026-01-01T00:00:00Z' }

type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? ReturnType<typeof vi.fn<(...a: A) => R>> : T[K] }

function fakeApi(over: Partial<Mocked<GuidanceApi>> = {}) {
  let activeProject = 'proj-A'
  const api: Mocked<GuidanceApi> = {
    captureWindow: vi.fn<GuidanceApi['captureWindow']>(async () => ({ ok: true as const, capture })),
    analyze: vi.fn<GuidanceApi['analyze']>(async () => ({ whatIsHappening: 'result' }) as never),
    acceptCaptureNotice: vi.fn<GuidanceApi['acceptCaptureNotice']>(async () => {}),
    activeProjectId: vi.fn<GuidanceApi['activeProjectId']>(async () => activeProject),
    ...over,
  }
  return { api, switchTo: (id: string) => { activeProject = id } }
}

function resetStore(noticeAccepted = true) {
  useAppStore.getState().resetForProjectSwitch()
  useAppStore.setState({
    settings: { ...useAppStore.getState().settings, captureNoticeAccepted: noticeAccepted },
    selectedWindowSourceId: 'window:1:0',
    selectedWindowName: 'Terminal',
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  resetStore()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('Stop cancels the Guidance screen', () => {
  it('with auto-analysis on: no capture and no provider call for ten simulated minutes', async () => {
    const { api } = fakeApi()
    const controller = new GuidanceController(api, () => {})
    controller.startAuto()
    await vi.advanceTimersByTimeAsync(AUTO_ANALYSIS_INTERVAL_MS) // one scheduled run happens
    expect(api.captureWindow).toHaveBeenCalledTimes(1)

    controller.cancelAll() // Stop
    const captures = api.captureWindow.mock.calls.length
    const analyses = api.analyze.mock.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(api.captureWindow.mock.calls.length).toBe(captures)
    expect(api.analyze.mock.calls.length).toBe(analyses)
    expect(useAppStore.getState().autoAnalysisEnabled).toBe(false)
  })

  it('a manual analysis in flight is abandoned: no provider call, nothing stored', async () => {
    let finishCapture: (v: unknown) => void = () => {}
    const { api } = fakeApi({ captureWindow: vi.fn<GuidanceApi['captureWindow']>(() => new Promise((r) => { finishCapture = r as (v: unknown) => void })) })
    const controller = new GuidanceController(api, () => {})
    const run = controller.analyze('window:1:0', 'Terminal')
    await vi.advanceTimersByTimeAsync(0)
    controller.cancelAll() // Stop while capturing
    finishCapture({ ok: true, capture })
    await run
    expect(api.analyze).not.toHaveBeenCalled()
    expect(useAppStore.getState().latestAnalysis).toBeNull()
  })
})

describe('a Guidance capture started in project A completing in project B', () => {
  it('is discarded, not stored', async () => {
    const { api, switchTo } = fakeApi()
    api.captureWindow.mockImplementation(async () => {
      switchTo('proj-B') // the user switched while the capture was running
      return { ok: true as const, capture }
    })
    const controller = new GuidanceController(api, () => {})
    await controller.analyze('window:1:0', 'Terminal')
    expect(api.analyze).not.toHaveBeenCalled()
    expect(useAppStore.getState().latestAnalysis).toBeNull()
  })

  it('an analysis that returns after a switch is discarded too', async () => {
    const { api, switchTo } = fakeApi()
    api.analyze.mockImplementation(async () => { switchTo('proj-B'); return { whatIsHappening: 'for A' } as never })
    const controller = new GuidanceController(api, () => {})
    await controller.analyze('window:1:0', 'Terminal')
    expect(useAppStore.getState().latestAnalysis).toBeNull()
  })

  it('an undisturbed analysis is stored', async () => {
    const { api } = fakeApi()
    await new GuidanceController(api, () => {}).analyze('window:1:0', 'Terminal')
    expect(useAppStore.getState().latestAnalysis).toEqual({ whatIsHappening: 'result' })
  })
})

describe('capture notice: Continue resumes with the newly accepted settings', () => {
  it('shows the notice once, then analyses after Continue without asking again', async () => {
    resetStore(false)
    const notices: unknown[] = []
    const { api } = fakeApi()
    const controller = new GuidanceController(api, (pending) => notices.push(pending))
    await controller.analyze('window:1:0', 'Terminal')
    expect(notices).toHaveLength(1)
    expect(api.captureWindow).not.toHaveBeenCalled()

    await controller.acceptNotice({ sourceId: 'window:1:0', expectedName: 'Terminal' })
    expect(notices).toHaveLength(1) // not shown a second time
    expect(api.acceptCaptureNotice).toHaveBeenCalledTimes(1)
    expect(api.captureWindow).toHaveBeenCalledTimes(1)
    expect(api.analyze.mock.calls[0][2]).toMatchObject({ captureNoticeAccepted: true })
  })
})

describe('Guidance screen capture: a minimized window is not a closed one', () => {
  it('minimized (still open): the chosen window is kept and nothing is sent', async () => {
    const { api } = fakeApi({ captureWindow: vi.fn<GuidanceApi['captureWindow']>(async () => ({ ok: false as const, reason: 'window-minimized' as const })) })
    await new GuidanceController(api, () => {}).analyze('window:1:0', 'Terminal')
    const s = useAppStore.getState()
    expect(s.selectedWindowSourceId).toBe('window:1:0')
    expect(s.analysisErrorMessage).toMatch(/minimized/)
    expect(s.analysisErrorMessage).not.toMatch(/no longer open/)
    expect(api.analyze).not.toHaveBeenCalled()
  })

  it('really closed: the choice is cleared and the user picks again', async () => {
    const { api } = fakeApi({ captureWindow: vi.fn<GuidanceApi['captureWindow']>(async () => ({ ok: false as const, reason: 'window-missing' as const })) })
    await new GuidanceController(api, () => {}).analyze('window:1:0', 'Terminal')
    expect(useAppStore.getState().selectedWindowSourceId).toBeNull()
    expect(useAppStore.getState().analysisErrorMessage).toMatch(/no longer open/)
  })
})
