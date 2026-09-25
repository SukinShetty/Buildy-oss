// Stop must actually stop: the in-flight provider request is cancelled, and no
// capture or provider call happens afterwards. Drives the real analysis loop with
// its Electron-bound neighbours mocked.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '.' }, screen: {}, BrowserWindow: class {} }))

const { captureWatchedWindow, listLiveWindowSources, capturePollThumbnail, analyzeScreen } = vi.hoisted(() => {
  const capture = { imageBase64: 'AAAA', windowTitle: 'Terminal', sourceId: 'window:1:0', capturedAt: '2026-01-01T00:00:00Z' }
  return {
    captureWatchedWindow: vi.fn(async () => capture),
    listLiveWindowSources: vi.fn(async () => [{ id: 'window:1:0', name: 'Terminal' }]),
    capturePollThumbnail: vi.fn(async () => 'AAAA'),
    // A real provider request through the shared helper, left hanging so it is
    // still in flight when Stop is pressed.
    analyzeScreen: vi.fn(async () => {
      const { providerFetch } = await import('./ai/fetch-with-timeout')
      const response = await providerFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' })
      return (await response.json()) as never
    }),
  }
})
vi.mock('./capturer', () => ({ captureWatchedWindow, listLiveWindowSources, capturePollThumbnail }))

let inFlightSignal: AbortSignal | undefined
vi.mock('./ai/provider-registry', () => ({ getProvider: () => ({ analyzeScreen }) }))

vi.mock('./guidance-window', () => ({ showGuidanceWindow: vi.fn(), sendGuidanceSendState: vi.fn(), hideGuidanceWindow: vi.fn() }))
vi.mock('./voice-player', () => ({ enqueueSpeech: vi.fn() }))
vi.mock('./nemp-bridge', () => ({
  getContextSummary: vi.fn(async () => ''),
  memoryScope: () => 'store-A',
  writerFor: () => ({ recordObservation: vi.fn(), recordCompletion: vi.fn(), recordBlocker: vi.fn(), recordDecision: vi.fn(), recordPattern: vi.fn() }),
}))
vi.mock('./projects', () => ({ getActiveProject: () => ({ id: 'proj-A' }) }))
vi.mock('./prompt-sender', () => ({ executeSend: vi.fn(), isSendInFlight: () => false, isWatchedWindowPresent: vi.fn(async () => true) }))
vi.mock('./vision-approvals', () => ({ hasVisionPass: () => true }))
vi.mock('./ai/prompt-quality-check', () => ({ checkPromptQuality: vi.fn(), buildQualityPatch: vi.fn() }))
vi.mock('./ai/verifier-check', () => ({ verifyPromptOutcome: vi.fn() }))

import { startWatching, stopAnalysisLoop } from './analysis-loop'
import { defaultSettings } from '../renderer/src/types'

const fakeWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } } as never
const settings = { ...defaultSettings(), provider: 'openai' as const, modelId: 'gpt-test', apiKey: 'sk-test-0000000000000000' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
    inFlightSignal = init.signal ?? undefined
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Stop', () => {
  it('cancels the in-flight analysis and makes no capture or provider call afterwards', async () => {
    startWatching(fakeWindow, 'window:1:0', 'Terminal', async () => settings, async () => null)

    // Let the first cycle reach the provider request.
    await vi.waitFor(() => expect(analyzeScreen).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(inFlightSignal).toBeDefined())
    expect(inFlightSignal!.aborted).toBe(false)

    stopAnalysisLoop()
    expect(inFlightSignal!.aborted).toBe(true) // the request itself was cancelled

    const counts = () => ({
      captures: captureWatchedWindow.mock.calls.length,
      polls: capturePollThumbnail.mock.calls.length,
      continuity: listLiveWindowSources.mock.calls.length,
      analyses: analyzeScreen.mock.calls.length,
      fetches: (fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length,
    })
    const atStop = counts()

    // Ten minutes of timers: loop cycles, turn polls, continuity polls.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(counts()).toEqual(atStop)
  })
})
