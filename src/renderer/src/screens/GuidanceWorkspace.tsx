// GuidanceWorkspace.tsx
// The main analysis screen. User clicks "Analyze Now" (or enables auto),
// Buildy captures the Claude Code window and returns 7-section guidance.
//
// State flow:
//   idle → listing-windows → awaiting-window-selection → capturing → analyzing → done

import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { GuidanceSections } from '../components/GuidanceSections'
import { PromptCard } from '../components/PromptCard'
import { WindowPicker } from '../components/WindowPicker'

const AUTO_ANALYSIS_INTERVAL_SECONDS = 30

export function GuidanceWorkspace(): React.ReactElement {
  const {
    project,
    settings,
    analysisPhase,
    availableWindows,
    selectedWindowSourceId,
    latestAnalysis,
    analysisErrorMessage,
    autoAnalysisEnabled,
    secondsUntilNextAutoAnalysis,
    setAnalysisPhase,
    setAvailableWindows,
    setSelectedWindowSourceId,
    setLatestAnalysis,
    setAnalysisError,
    setAutoAnalysisEnabled,
    setSecondsUntilNextAutoAnalysis,
    setCurrentScreen,
  } = useAppStore()

  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [windowPickerVisible, setWindowPickerVisible] = useState(false)
  const [pendingWindowId, setPendingWindowId] = useState<string | null>(null)

  const apiIsConfigured = settings.apiKey || settings.baseUrl || (settings.useProxy && settings.proxyUrl)
  const isAnalyzing = analysisPhase === 'capturing' || analysisPhase === 'analyzing'
  const projectIsConfigured = project.projectName.trim().length > 0

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearAutoTimers()
    }
  }, [])

  // ─── Analysis flow ──────────────────────────────────────────────────────────

  async function startAnalysis(sourceId: string | null): Promise<void> {
    if (isAnalyzing) return

    setAnalysisError(null)

    try {
      // Step 1: Capture the window
      setAnalysisPhase('capturing')
      const capture = await window.buildy.captureWindow(sourceId)

      // Step 2: Send to Claude
      setAnalysisPhase('analyzing')
      const result = await window.buildy.analyze(capture, project, settings)

      // Step 3: Show results
      setLatestAnalysis(result)
      setAnalysisPhase('done')
    } catch (error) {
      setAnalysisError(String(error))
      setAnalysisPhase('error')
    }
  }

  async function handleAnalyzeNowClick(): Promise<void> {
    if (!apiIsConfigured) {
      setCurrentScreen('settings')
      return
    }

    // If user has previously selected a window, reuse it
    if (selectedWindowSourceId) {
      await startAnalysis(selectedWindowSourceId)
      return
    }

    // Otherwise, show the window picker
    setAnalysisPhase('listing-windows')
    try {
      const windows = await window.buildy.listWindows()
      setAvailableWindows(windows)

      // If Buildy auto-detected exactly one Claude Code window, use it directly
      const autoDetected = windows.filter((w) => w.isClaudeCode)
      if (autoDetected.length === 1) {
        setSelectedWindowSourceId(autoDetected[0].id)
        setAnalysisPhase('idle')
        await startAnalysis(autoDetected[0].id)
        return
      }

      // Multiple or zero detected — show the picker
      setPendingWindowId(autoDetected[0]?.id ?? windows[0]?.id ?? null)
      setWindowPickerVisible(true)
      setAnalysisPhase('awaiting-window-selection')
    } catch (error) {
      setAnalysisError(String(error))
      setAnalysisPhase('error')
    }
  }

  function handleWindowPickerConfirm(): void {
    if (!pendingWindowId) return
    setSelectedWindowSourceId(pendingWindowId)
    setWindowPickerVisible(false)
    setAnalysisPhase('idle')
    startAnalysis(pendingWindowId)
  }

  function handleWindowPickerCancel(): void {
    setWindowPickerVisible(false)
    setAnalysisPhase('idle')
  }

  // ─── Auto-analysis ──────────────────────────────────────────────────────────

  function enableAutoAnalysis(): void {
    setAutoAnalysisEnabled(true)
    setSecondsUntilNextAutoAnalysis(AUTO_ANALYSIS_INTERVAL_SECONDS)
    scheduleNextAutoAnalysis()
  }

  function disableAutoAnalysis(): void {
    setAutoAnalysisEnabled(false)
    clearAutoTimers()
    setSecondsUntilNextAutoAnalysis(0)
  }

  function scheduleNextAutoAnalysis(): void {
    clearAutoTimers()

    setSecondsUntilNextAutoAnalysis(AUTO_ANALYSIS_INTERVAL_SECONDS)

    // Countdown display
    countdownTimerRef.current = setInterval(() => {
      setSecondsUntilNextAutoAnalysis(
        (prev) => (prev > 0 ? prev - 1 : 0)
      )
    }, 1000)

    // Actual analysis trigger
    autoTimerRef.current = setTimeout(async () => {
      await startAnalysis(selectedWindowSourceId)
      // Re-schedule if still enabled
      if (autoAnalysisEnabled) {
        scheduleNextAutoAnalysis()
      }
    }, AUTO_ANALYSIS_INTERVAL_SECONDS * 1000)
  }

  function clearAutoTimers(): void {
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current)
      autoTimerRef.current = null
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>
      {/* Window picker overlay */}
      {windowPickerVisible && (
        <WindowPicker
          windows={availableWindows}
          selectedId={pendingWindowId}
          onSelect={setPendingWindowId}
          onConfirm={handleWindowPickerConfirm}
          onCancel={handleWindowPickerCancel}
        />
      )}

      {/* Current goal — always visible during the build session */}
      <CurrentGoalCard
        goalPurpose={project.goal?.purpose ?? null}
        onEdit={() => setCurrentScreen('goal')}
      />

      {/* Controls */}
      <div style={styles.controls}>
        <button
          className="btn-primary"
          onClick={handleAnalyzeNowClick}
          disabled={isAnalyzing || analysisPhase === 'listing-windows'}
          style={styles.analyzeButton}
        >
          {phaseButtonLabel(analysisPhase)}
        </button>

        <div style={styles.rightControls}>
          {/* Change window button */}
          {selectedWindowSourceId && (
            <button
              className="btn-ghost"
              onClick={() => {
                setSelectedWindowSourceId(null)
                handleAnalyzeNowClick()
              }}
              style={styles.smallButton}
              title="Change which window to analyze"
            >
              🖥️
            </button>
          )}

          {/* Auto-analysis toggle */}
          <button
            className={autoAnalysisEnabled ? 'btn-secondary' : 'btn-ghost'}
            onClick={() => (autoAnalysisEnabled ? disableAutoAnalysis() : enableAutoAnalysis())}
            style={styles.autoButton}
            disabled={!apiIsConfigured}
          >
            {autoAnalysisEnabled
              ? `⏸ Auto (${secondsUntilNextAutoAnalysis}s)`
              : '▶ Auto'}
          </button>
        </div>
      </div>

      {/* No project warning */}
      {!projectIsConfigured && (
        <div style={styles.setupNudge}>
          <span>💡 Set up your project in</span>
          <button
            style={styles.nudgeLink}
            onClick={() => setCurrentScreen('brainstorm')}
          >
            Brainstorm
          </button>
          <span>for better guidance.</span>
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {/* Error state */}
        {analysisPhase === 'error' && analysisErrorMessage && (
          <ErrorCard message={analysisErrorMessage} onRetry={handleAnalyzeNowClick} />
        )}

        {/* Analyzing in-progress */}
        {isAnalyzing && (
          <LoadingCard phase={analysisPhase} />
        )}

        {/* Results */}
        {(analysisPhase === 'done' || (latestAnalysis && analysisPhase === 'idle')) &&
          latestAnalysis && (
            <>
              <GuidanceSections result={latestAnalysis} />
              {latestAnalysis.nextPrompt && (
                <PromptCard promptText={latestAnalysis.nextPrompt} />
              )}
            </>
          )}

        {/* Empty state */}
        {!latestAnalysis &&
          !isAnalyzing &&
          analysisPhase !== 'error' && (
            <EmptyState onAnalyze={handleAnalyzeNowClick} apiConfigured={!!apiIsConfigured} />
          )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CurrentGoalCard({
  goalPurpose,
  onEdit,
}: {
  goalPurpose: string | null
  onEdit: () => void
}): React.ReactElement {
  const hasGoal = !!(goalPurpose && goalPurpose.trim())
  return (
    <div style={styles.goalCard}>
      <div style={styles.goalCardMain}>
        <div style={styles.goalCardLabel}>🎯 Current goal</div>
        {hasGoal ? (
          <div style={styles.goalCardText}>{goalPurpose}</div>
        ) : (
          <div style={styles.goalCardEmpty}>No goal set yet — set one so Buildy can keep you on track.</div>
        )}
      </div>
      <button
        onClick={onEdit}
        style={styles.goalEditBtn}
        title={hasGoal ? 'Edit your goal' : 'Set your goal'}
        aria-label={hasGoal ? 'Edit goal' : 'Set goal'}
      >
        ✏️
      </button>
    </div>
  )
}

function EmptyState({
  onAnalyze,
  apiConfigured,
}: {
  onAnalyze: () => void
  apiConfigured: boolean
}): React.ReactElement {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyStateIcon}>👁️</div>
      <div style={styles.emptyStateTitle}>Ready to watch Claude Code</div>
      <p style={styles.emptyStateText}>
        Open Claude Code, start working, then click Analyze Now. Buildy will look at your
        screen and tell you exactly what's happening and what to do next.
      </p>
      {apiConfigured ? (
        <button className="btn-primary" onClick={onAnalyze} style={{ marginTop: 16 }}>
          Analyze Now
        </button>
      ) : (
        <p style={{ ...styles.emptyStateText, marginTop: 12, color: 'var(--color-warning)' }}>
          ⚠️ Add your API key in Settings first.
        </p>
      )}
    </div>
  )
}

function LoadingCard({ phase }: { phase: string }): React.ReactElement {
  const message =
    phase === 'capturing'
      ? '📸 Taking a screenshot of Claude Code…'
      : '🤖 Buildy is reading your screen and thinking…'

  return (
    <div style={styles.loadingCard}>
      <div style={styles.loadingDot} />
      <span style={styles.loadingText}>{message}</span>
    </div>
  )
}

function ErrorCard({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}): React.ReactElement {
  return (
    <div style={styles.errorCard}>
      <div style={styles.errorHeader}>
        <span>⚠️</span>
        <span style={{ fontWeight: 600 }}>Something went wrong</span>
      </div>
      <p style={styles.errorText}>{message}</p>
      <button className="btn-secondary" onClick={onRetry} style={{ marginTop: 8 }}>
        Try again
      </button>
    </div>
  )
}

function phaseButtonLabel(phase: string): string {
  switch (phase) {
    case 'listing-windows':  return 'Finding windows…'
    case 'capturing':        return 'Capturing screen…'
    case 'analyzing':        return 'Analyzing…'
    default:                 return '📸 Analyze Now'
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  goalCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '10px 16px',
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  goalCardMain: {
    flex: 1,
    minWidth: 0,
  },
  goalCardLabel: {
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
    marginBottom: 2,
  },
  goalCardText: {
    fontSize: 13,
    color: 'var(--color-text)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  goalCardEmpty: {
    fontSize: 12,
    color: 'var(--color-text-dim)',
    lineHeight: 1.4,
    fontStyle: 'italic' as const,
  },
  goalEditBtn: {
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: 2,
    lineHeight: 1,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  analyzeButton: {
    flex: 1,
    justifyContent: 'center',
  },
  rightControls: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  smallButton: {
    padding: '6px',
    fontSize: 14,
  },
  autoButton: {
    fontSize: 12,
    padding: '6px 10px',
    whiteSpace: 'nowrap' as const,
  },
  setupNudge: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 16px',
    fontSize: 12,
    color: 'var(--color-text-muted)',
    background: 'var(--color-surface)',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  nudgeLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: 12,
    padding: '0 2px',
    textDecoration: 'underline',
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    textAlign: 'center' as const,
    padding: '32px 24px',
  },
  emptyStateIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.55,
    maxWidth: 320,
  },
  loadingCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border)',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--color-accent)',
    animation: 'pulse 1.2s ease-in-out infinite',
    flexShrink: 0,
  },
  loadingText: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
  },
  errorCard: {
    padding: '12px',
    background: 'var(--color-danger-muted)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-danger)30',
  },
  errorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: 'var(--color-danger)',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
  },
}
