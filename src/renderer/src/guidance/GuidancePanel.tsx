// GuidancePanel.tsx
// The guidance content, rendered in its OWN floating window (see
// main/guidance-window.ts) so it can never overflow or push the mascot.
//
// Renders one of two payloads pushed from the main process:
//   - kind 'analysis' — alignment pill + note + best next move + prompt-to-paste
//   - kind 'answer'   — the user's spoken question + Buildy's answer
//
// Self-managing behaviour:
//   - Reports its content height to main so the window resizes to fit (capped at
//     80% screen; scrolls internally beyond that).
//   - Auto-hides 60s after the user last interacted with it.
//   - Dismiss (X) hides the window immediately.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { GuidancePayload, GoalAlignment, AnalysisResult, QuestionAnswer } from '../types'

const AUTO_HIDE_MS = 60_000

export function GuidancePanel(): React.ReactElement | null {
  const [payload, setPayload] = useState<GuidancePayload | null>(null)
  const [renderKey, setRenderKey] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Auto-hide timer (resets on every interaction / new payload) ────────────

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      window.buildy.hideGuidance()
    }, AUTO_HIDE_MS)
  }, [])

  // ─── Receive payloads from main ─────────────────────────────────────────────

  useEffect(() => {
    const unsub = window.buildy.onGuidanceData((_: unknown, p: GuidancePayload) => {
      setPayload(p)
      setRenderKey((k) => k + 1) // re-trigger the entrance animation
      resetHideTimer()
    })
    return () => {
      unsub()
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [resetHideTimer])

  // ─── Report content height to main so the window fits the panel ─────────────

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const report = (): void => {
      // scrollHeight includes padding and full content even when scrolling.
      window.buildy.resizeGuidance(el.scrollHeight + 16)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [payload, renderKey])

  if (!payload) return null

  function onInteract(): void {
    resetHideTimer()
  }

  return (
    <div style={S.root} onMouseMove={onInteract} onClick={onInteract}>
      <div ref={panelRef} style={S.panel} key={renderKey} className="guidance-appear">
        <button
          onClick={() => window.buildy.hideGuidance()}
          style={S.close}
          title="Dismiss"
          aria-label="Dismiss"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="5" x2="19" y2="19" />
            <line x1="19" y1="5" x2="5" y2="19" />
          </svg>
        </button>

        {payload.kind === 'analysis' && <AnalysisBody analysis={payload.analysis} />}
        {payload.kind === 'answer' && <AnswerBody answer={payload.answer} />}
        {payload.kind === 'message' && <div style={S.message}>{payload.message}</div>}
      </div>

      <PanelStyle />
    </div>
  )
}

// ─── Analysis body ─────────────────────────────────────────────────────────────

function AnalysisBody({ analysis }: { analysis: AnalysisResult }): React.ReactElement {
  const [copied, setCopied] = useState(false)

  async function copyPrompt(): Promise<void> {
    if (!analysis.nextPrompt) return
    try {
      // Route through main — this window is non-focusable, so navigator.clipboard
      // would reject with "Document is not focused".
      await window.buildy.copyText(analysis.nextPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      console.warn('[GuidancePanel] Copy failed:', e)
    }
  }

  return (
    <>
      {analysis.goalAlignment && (
        <AlignmentPill alignment={analysis.goalAlignment} note={analysis.alignmentNote} />
      )}

      {analysis.whatIsHappening && (
        <div style={S.context}>{analysis.whatIsHappening}</div>
      )}

      {analysis.bestNextMove && (
        <div style={S.guidance}>{analysis.bestNextMove}</div>
      )}

      {analysis.nextPrompt && (
        <div style={S.promptCard}>
          <div style={S.promptHeader}>
            <span style={S.promptLabel}>Prompt to paste</span>
            <button onClick={copyPrompt} style={S.copyBtn} title="Copy prompt">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div style={S.promptText} data-selectable>{analysis.nextPrompt}</div>
        </div>
      )}
    </>
  )
}

// ─── Answer body (spoken Q&A) ───────────────────────────────────────────────────

function AnswerBody({ answer }: { answer: QuestionAnswer }): React.ReactElement {
  const [copied, setCopied] = useState(false)

  async function copyAnswer(): Promise<void> {
    try {
      await window.buildy.copyText(answer.answer)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch (e) {
      console.warn('[GuidancePanel] Copy failed:', e)
    }
  }

  return (
    <>
      <div style={S.questionLabel}>You asked</div>
      <div style={S.questionText}>{answer.question}</div>
      <div style={S.guidance}>{answer.answer}</div>
      <div style={S.answerFooter}>
        <button onClick={copyAnswer} style={S.copyBtn} title="Copy answer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
    </>
  )
}

// ─── Alignment pill ─────────────────────────────────────────────────────────────

const ALIGNMENT: Record<GoalAlignment, { label: string; color: string; gradient: string }> = {
  'on-track': {
    label: 'ON TRACK',
    color: '#10B981',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(16,185,129,0.08))',
  },
  drift: {
    label: 'DRIFTING',
    color: '#FBBF24',
    gradient: 'linear-gradient(135deg, rgba(251,191,36,0.18), rgba(251,191,36,0.08))',
  },
  blocked: {
    label: 'BLOCKED',
    color: '#EF4444',
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08))',
  },
}

function AlignmentPill({
  alignment,
  note,
}: {
  alignment: GoalAlignment
  note?: string
}): React.ReactElement {
  const cfg = ALIGNMENT[alignment]
  const showNote = alignment !== 'on-track' && !!note
  return (
    <>
      <div style={S.pillRow}>
        <span
          style={{
            ...S.pill,
            color: cfg.color,
            background: cfg.gradient,
            border: `1px solid ${cfg.color}55`,
          }}
        >
          <span style={{ ...S.pillDot, background: cfg.color }} />
          {cfg.label}
        </span>
      </div>
      {showNote && <div style={S.alignmentNote}>{note}</div>}
    </>
  )
}

// ─── Entrance + scrollbar styles ────────────────────────────────────────────────

function PanelStyle(): React.ReactElement {
  return (
    <style>{`
      .guidance-appear {
        animation: guidanceIn 0.25s ease-out;
      }
      @keyframes guidanceIn {
        from { opacity: 0; transform: translateX(-12px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .guidance-appear::-webkit-scrollbar { width: 6px; }
      .guidance-appear::-webkit-scrollbar-track { background: transparent; }
      .guidance-appear::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 3px;
      }
      .guidance-appear::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.25);
      }
    `}</style>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────────

const FONT = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = '"JetBrains Mono", "SF Mono", "Cascadia Code", Consolas, monospace'

const S = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    fontFamily: FONT,
  },
  panel: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: 380,
    maxHeight: '100vh',
    overflowY: 'auto' as const,
    boxSizing: 'border-box' as const,
    background: 'rgba(20, 20, 22, 0.92)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: 20,
    border: '1px solid rgba(255, 255, 255, 0.08)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
    padding: 20,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  close: {
    position: 'absolute' as const,
    top: 14,
    right: 14,
    width: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    background: 'transparent',
    color: 'rgba(255,255,255,0.4)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s, background 0.15s',
  },
  pillRow: {
    display: 'flex',
    alignItems: 'center',
    paddingRight: 24, // leave room for the close button
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    padding: '4px 10px',
    borderRadius: 999,
  },
  pillDot: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    flexShrink: 0,
  },
  alignmentNote: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: 400,
    fontStyle: 'italic' as const,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.55,
  },
  context: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.5,
  },
  guidance: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 1.6,
  },
  promptCard: {
    marginTop: 16,
    background: 'rgba(16,185,129,0.06)',
    border: '1px solid rgba(16,185,129,0.2)',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  promptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  promptLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    color: 'rgba(16,185,129,0.7)',
  },
  promptText: {
    fontSize: 13,
    color: '#10B981',
    lineHeight: 1.55,
    fontFamily: MONO,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    userSelect: 'text' as const,
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 600,
    padding: '4px 9px',
    borderRadius: 7,
    background: 'rgba(16,185,129,0.12)',
    color: '#10B981',
    border: '1px solid rgba(16,185,129,0.3)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    flexShrink: 0,
  },
  questionLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.4)',
    paddingRight: 24,
  },
  questionText: {
    marginTop: 8,
    fontSize: 13,
    fontStyle: 'italic' as const,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.5,
  },
  answerFooter: {
    marginTop: 14,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  message: {
    fontSize: 14,
    fontWeight: 400,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.6,
    paddingRight: 24, // clear the close button
  },
}
