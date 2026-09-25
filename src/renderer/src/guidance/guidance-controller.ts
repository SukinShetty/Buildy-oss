// guidance-controller.ts — the Guidance screen's capture → analyse flow and its
// auto-analysis timer, kept out of React so it can be cancelled from anywhere
// and tested with fake timers.
//
//   - cancelAll() (Stop, or a project switch) bumps a generation: every run that
//     started before it stops at its next await — no further capture, no
//     provider call, nothing stored — and the auto timer is cleared.
//   - Every run is bound to the project active when it STARTED; a result that
//     arrives after a switch is discarded, never stored.
//   - Settings are always read fresh from the store (never a stale closure), so
//     after "Continue" on the capture notice the analysis resumes immediately.

import { useAppStore } from '../store/useAppStore'
import type { AnalysisResult, CaptureOutcome, CaptureResult, ProjectMemory, RedactedSettings } from '../types'

export const AUTO_ANALYSIS_INTERVAL_MS = 30_000

export interface GuidanceApi {
  captureWindow(sourceId: string | null, expectedName: string | null): Promise<CaptureOutcome>
  analyze(capture: CaptureResult, project: ProjectMemory, settings: RedactedSettings): Promise<AnalysisResult>
  acceptCaptureNotice(): Promise<void>
  activeProjectId(): Promise<string | null>
}

export type PendingNotice = { sourceId: string | null; expectedName: string | null }

export class GuidanceController {
  private generation = 0
  private autoTimer: ReturnType<typeof setTimeout> | null = null
  private countdownTimer: ReturnType<typeof setInterval> | null = null
  private countdown = 0

  constructor(
    private readonly api: GuidanceApi,
    private readonly showNotice: (pending: PendingNotice) => void,
  ) {}

  /** Stop / project switch: abandon every run in flight and stop auto-analysis. */
  cancelAll(): void {
    this.generation++
    this.clearTimers()
    const store = useAppStore.getState()
    store.setAutoAnalysisEnabled(false)
    store.setSecondsUntilNextAutoAnalysis(0)
    if (store.analysisPhase === 'capturing' || store.analysisPhase === 'analyzing') store.setAnalysisPhase('idle')
  }

  async analyze(sourceId: string | null, expectedName: string | null): Promise<void> {
    const store = useAppStore.getState
    const phase = store().analysisPhase
    if (phase === 'capturing' || phase === 'analyzing') return
    store().setAnalysisError(null)

    // First capture ever: the one-time notice comes first (main enforces it too).
    if (!store().settings.captureNoticeAccepted) {
      this.showNotice({ sourceId, expectedName })
      return
    }

    const gen = this.generation
    const projectId = await this.api.activeProjectId()
    const current = async (): Promise<boolean> =>
      gen === this.generation && (await this.api.activeProjectId()) === projectId
    if (gen !== this.generation) return

    try {
      store().setAnalysisPhase('capturing')
      const outcome = await this.api.captureWindow(sourceId, expectedName)
      if (!(await current())) return this.abandon(gen)
      if (!outcome.ok) {
        if (outcome.reason === 'window-minimized') {
          // Still open, just minimized or hidden: keep the user's choice.
          store().setAnalysisError('The window you chose is minimized or hidden. Restore it, then analyze again.')
          store().setAnalysisPhase('error')
          return
        }
        store().setSelectedWindow(null, null)
        store().setAnalysisError(
          outcome.reason === 'window-missing'
            ? 'The window you were watching is no longer open. Show MyBuildy your coding agent again.'
            : 'Show MyBuildy your coding agent first.'
        )
        store().setAnalysisPhase('error')
        return
      }

      store().setAnalysisPhase('analyzing')
      const result = await this.api.analyze(outcome.capture, store().project, store().settings)
      if (!(await current())) return this.abandon(gen)

      store().setLatestAnalysis(result)
      store().setAnalysisPhase('done')
    } catch (error) {
      if (gen !== this.generation) return
      if (String(error).includes('Accept the one-time notice first')) {
        store().setAnalysisPhase('idle')
        this.showNotice({ sourceId, expectedName })
        return
      }
      store().setAnalysisError(String(error))
      store().setAnalysisPhase('error')
    }
  }

  /** "Continue" on the notice: persist it, then resume with the FRESH settings. */
  async acceptNotice(pending: PendingNotice | null): Promise<void> {
    await this.api.acceptCaptureNotice()
    const store = useAppStore.getState()
    store.setSettings({ ...store.settings, captureNoticeAccepted: true })
    if (pending) await this.analyze(pending.sourceId, pending.expectedName)
  }

  startAuto(): void {
    useAppStore.getState().setAutoAnalysisEnabled(true)
    this.schedule(this.generation)
  }

  stopAuto(): void {
    useAppStore.getState().setAutoAnalysisEnabled(false)
    useAppStore.getState().setSecondsUntilNextAutoAnalysis(0)
    this.clearTimers()
  }

  private schedule(gen: number): void {
    this.clearTimers()
    const store = useAppStore.getState
    this.countdown = AUTO_ANALYSIS_INTERVAL_MS / 1000
    store().setSecondsUntilNextAutoAnalysis(this.countdown)
    this.countdownTimer = setInterval(() => {
      this.countdown = Math.max(0, this.countdown - 1)
      store().setSecondsUntilNextAutoAnalysis(this.countdown)
    }, 1000)
    this.autoTimer = setTimeout(async () => {
      if (gen !== this.generation || !store().autoAnalysisEnabled) return
      await this.analyze(store().selectedWindowSourceId, store().selectedWindowName)
      if (gen === this.generation && store().autoAnalysisEnabled) this.schedule(gen)
    }, AUTO_ANALYSIS_INTERVAL_MS)
  }

  private clearTimers(): void {
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null }
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null }
  }

  private abandon(gen: number): void {
    // Stopped (the phase was already reset) or the project changed: drop the result.
    if (gen === this.generation) useAppStore.getState().setAnalysisPhase('idle')
  }
}
