// GuidanceWorkspace.tsx
// The main analysis screen. User clicks "Analyze Now" (or enables auto),
// MyBuildy captures the Claude Code window and returns 7-section guidance.
//
// State flow:
//   idle → listing-windows → awaiting-window-selection → capturing → analyzing → done

import React, { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { GuidanceSections } from '../components/GuidanceSections'
import { PromptCard } from '../components/PromptCard'
import { WindowPicker } from '../components/WindowPicker'
import { CAPTURE_NOTICE_MESSAGE } from '../types'
import { guidanceController, setGuidanceNoticeHandler } from '../guidance/guidance-instance'

const AUTO_ANALYSIS_INTERVAL_SECONDS = 30

export function GuidanceWorkspace(): React.ReactElement {
  const {
    project,
    settings,
    analysisPhase,
    availableWindows,
    selectedWindowSourceId,
    selectedWindowName,
    latestAnalysis,
    analysisErrorMessage,
    autoAnalysisEnabled,
    secondsUntilNextAutoAnalysis,
    setAnalysisPhase,
    setAvailableWindows,
    setSelectedWindow,
    setLatestAnalysis,
    setAnalysisError,
    setAutoAnalysisEnabled,
    setSecondsUntilNextAutoAnalysis,
    setCurrentScreen,
    setSettings,
  } = useAppStore()

  const [windowPickerVisible, setWindowPickerVisible] = useState(false)
  const [pendingWindowId, setPendingWindowId] = useState<string | null>(null)
  // The one-time capture notice, shown before this screen captures anything.
  const [noticePending, setNoticePending] = useState<{ sourceId: string | null; expectedName: string | null } | null>(null)

  // settings is REDACTED (no raw keys) — check the has* boolean + base URL.
  const apiIsConfigured = settings.hasApiKey || settings.baseUrl.trim().length > 0
  const isAnalyzing = analysisPhase === 'capturing' || analysisPhase === 'analyzing'
  const projectIsConfigured = project.projectName.trim().length > 0

  // The controller owns capture/analysis and the auto timer (so Stop and project
  // switches can cancel it from anywhere); this screen shows the notice it asks for.
  useEffect(() => {
    setGuidanceNoticeHandler(setNoticePending)
    return () => {
      setGuidanceNoticeHandler(() => {})
      guidanceController.stopAuto()
    }
  }, [])

  // ─── Analysis flow ──────────────────────────────────────────────────────────

  function startAnalysis(sourceId: string | null, expectedName: string | null): Promise<void> {
    return guidanceController.analyze(sourceId, expectedName)
  }

  async function acceptNoticeAndContinue(): Promise<void> {
    const pending = noticePending
    setNoticePending(null)
    await guidanceController.acceptNotice(pending)
  }

  async function handleAnalyzeNowClick(): Promise<void> {
    if (!apiIsConfigured) {
      setCurrentScreen('settings')
      return
    }

    // If user has previously selected a window, reuse it
    if (selectedWindowSourceId) {
      await startAnalysis(selectedWindowSourceId, selectedWindowName)
      return
    }

    // Otherwise, show the window picker (the user always chooses — no auto-detect)
    setAnalysisPhase('listing-windows')
    try {
      const windows = await window.mybuildy.listWindows()
      setAvailableWindows(windows)
      setPendingWindowId(windows[0]?.id ?? null)
      setWindowPickerVisible(true)
      setAnalysisPhase('awaiting-window-selection')
    } catch (error) {
      setAnalysisError(String(error))
      setAnalysisPhase('error')
    }
  }

  function handleWindowPickerConfirm(): void {
    if (!pendingWindowId) return
    const pendingName = availableWindows.find((w) => w.id === pendingWindowId)?.name ?? null
    setSelectedWindow(pendingWindowId, pendingName)
    setWindowPickerVisible(false)
    setAnalysisPhase('idle')
    startAnalysis(pendingWindowId, pendingName)
  }

  function handleWindowPickerCancel(): void {
    setWindowPickerVisible(false)
    setAnalysisPhase('idle')
  }

  // ─── Auto-analysis ──────────────────────────────────────────────────────────

  function enableAutoAnalysis(): void {
    guidanceController.startAuto()
  }

  function disableAutoAnalysis(): void {
    guidanceController.stopAuto()
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

      {/* One-time capture notice: nothing is captured until Continue */}
      {noticePending && (
        <div style={styles.noticeCard} role="alertdialog" aria-label="Before MyBuildy looks at your screen">
          <div style={styles.noticeText}>{CAPTURE_NOTICE_MESSAGE}</div>
          <div style={styles.noticeActions}>
            <button className="btn-primary" onClick={() => { void acceptNoticeAndContinue() }}>Continue</button>
            <button className="btn-icon" onClick={() => setNoticePending(null)}>Cancel</button>
          </div>
        </div>
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
                setSelectedWindow(null, null)
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
          <div style={styles.goalCardEmpty}>No goal set yet — set one so MyBuildy can keep you on track.</div>
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
        Open Claude Code, start working, then click Analyze Now. MyBuildy will look at your
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
      : '🤖 MyBuildy is reading your screen and thinking…'

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
  noticeCard: {
    margin: '12px 0',
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid rgba(252, 132, 0, 0.45)',
    background: 'rgba(252, 132, 0, 0.08)',
  } as React.CSSProperties,
  noticeText: {
    fontSize: 13,
    lineHeight: 1.55,
    color: 'var(--color-text)',
  } as React.CSSProperties,
  noticeActions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  } as React.CSSProperties,
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
