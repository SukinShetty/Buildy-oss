// PromptPopup.tsx
// Speech bubble showing either:
//   1. Analysis result (what's happening + next move + prompt to copy)
//   2. Conversational answer to a spoken question
//
// Persistence rules:
//   - NO auto-hide timer. Bubble stays until user dismisses or a new one replaces it.
//   - Copy button always available.
//   - Dismiss = minimize (orb click can reopen).

import React, { useState } from 'react'
import type { AnalysisResult, GoalAlignment } from '../types'

interface Props {
  analysis: AnalysisResult | null
  answer: { question: string; answer: string } | null
  visible: boolean
  onDismiss: () => void
}

export function PromptPopup({ analysis, answer, visible, onDismiss }: Props): React.ReactElement | null {
  const [copied, setCopied] = useState(false)

  // Debug: inspect exactly what analysis fields are passed in (esp. nextPrompt)
  console.log('[PromptPopup] analysis:', JSON.stringify(analysis, null, 2))

  if (!visible) return null

  // Answer mode — show Q&A
  if (answer) {
    async function copyAnswer(): Promise<void> {
      if (!answer) return
      try {
        await navigator.clipboard.writeText(answer.answer)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch (e) {
        console.warn('[PromptPopup] Copy failed:', e)
      }
    }

    return (
      <div style={styles.bubble} className="bubble-appear">
        <div style={styles.pointer} />
        <div style={styles.questionLabel}>You asked:</div>
        <div style={styles.questionText}>{answer.question}</div>
        <div style={styles.answerText}>{answer.answer}</div>
        <div style={styles.footer}>
          <button onClick={copyAnswer} style={styles.copyBtnSmall}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button onClick={onDismiss} style={styles.dismissBtn}>close</button>
        </div>
        <BubbleStyle />
      </div>
    )
  }

  // Analysis mode
  if (!analysis || !analysis.nextPrompt) return null

  async function handleCopy(): Promise<void> {
    if (!analysis) return
    try {
      await navigator.clipboard.writeText(analysis.nextPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.warn('[PromptPopup] Copy failed:', e)
    }
  }

  return (
    <div style={styles.bubble} className="bubble-appear">
      <div style={styles.pointer} />

      {/* Goal alignment — shown only when the user has set a goal */}
      {analysis.goalAlignment && (
        <AlignmentRow alignment={analysis.goalAlignment} note={analysis.alignmentNote} />
      )}

      {analysis.whatIsHappening && (
        <div style={styles.context}>{analysis.whatIsHappening}</div>
      )}

      <div style={styles.nextMove}>{analysis.bestNextMove}</div>

      {/* PROMPT TO PASTE — the most important output: ready to send to Claude Code */}
      <div style={styles.promptCard}>
        <div style={styles.promptHeader}>
          <span style={styles.promptLabel}>Prompt to paste</span>
          <button onClick={handleCopy} style={styles.copyBtn} title="Copy prompt">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div style={styles.promptText} data-selectable>
          {analysis.nextPrompt}
        </div>
      </div>

      <div style={styles.footer}>
        {analysis.builderNote && (
          <span style={styles.builderNote}>{analysis.builderNote}</span>
        )}
        <button onClick={onDismiss} style={styles.dismissBtn}>close</button>
      </div>

      <BubbleStyle />
    </div>
  )
}

// ─── Goal alignment indicator ─────────────────────────────────────────────────

const ALIGNMENT_CONFIG: Record<GoalAlignment, { label: string; color: string; bg: string }> = {
  'on-track': { label: 'ON TRACK', color: '#34C759', bg: 'rgba(52,199,89,0.15)' },
  'drift':    { label: 'DRIFTING', color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)' },
  'blocked':  { label: 'BLOCKED',  color: '#FF453A', bg: 'rgba(255,69,58,0.15)' },
}

function AlignmentRow({
  alignment,
  note,
}: {
  alignment: GoalAlignment
  note?: string
}): React.ReactElement {
  const cfg = ALIGNMENT_CONFIG[alignment]
  // On-track shows just the pill; drift/blocked add the explanation note.
  const showNote = alignment !== 'on-track' && !!note
  return (
    <div style={styles.alignmentRow}>
      <span style={{ ...styles.alignmentPill, color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
        {cfg.label}
      </span>
      {showNote && <span style={styles.alignmentNote}>{note}</span>}
    </div>
  )
}

function BubbleStyle() {
  return (
    <style>{`
      .bubble-appear {
        animation: bubbleIn 0.25s ease-out;
      }
      @keyframes bubbleIn {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `}</style>
  )
}

const styles = {
  bubble: {
    position: 'relative' as const,
    marginTop: 8,
    background: 'linear-gradient(180deg, rgba(38,38,40,0.97) 0%, rgba(28,28,30,0.97) 100%)',
    borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    maxWidth: 284,
    width: '100%',
    backdropFilter: 'blur(24px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3)',
  },
  pointer: {
    position: 'absolute' as const,
    top: -6,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 12,
    height: 6,
    background: 'rgba(38,38,40,0.97)',
    clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
  },
  alignmentRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  alignmentPill: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: '2px 7px',
    borderRadius: 999,
    border: '1px solid',
    flexShrink: 0,
  },
  alignmentNote: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.35,
    flex: 1,
    minWidth: 120,
  },
  context: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    lineHeight: 1.4,
    letterSpacing: '0.01em',
  },
  nextMove: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.4,
  },
  promptCard: {
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 8,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  promptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  promptLabel: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#10B981',
  },
  promptText: {
    fontSize: 11,
    color: '#10B981',
    lineHeight: 1.45,
    fontFamily: '"SF Mono", "Cascadia Code", "Consolas", monospace',
    wordBreak: 'break-word' as const,
    whiteSpace: 'pre-wrap' as const,
    maxHeight: 120,
    overflowY: 'auto' as const,
    userSelect: 'text' as const,
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: 6,
    background: 'rgba(16,185,129,0.15)',
    color: '#10B981',
    border: '1px solid rgba(16,185,129,0.35)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    flexShrink: 0,
  },
  copyBtnSmall: {
    fontSize: 9,
    fontWeight: 600,
    padding: '2px 10px',
    borderRadius: 5,
    background: 'rgba(52,199,89,0.1)',
    color: '#34C759',
    border: '1px solid rgba(52,199,89,0.2)',
    cursor: 'pointer',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  builderNote: {
    fontSize: 9,
    color: 'rgba(255,107,43,0.6)',
    fontStyle: 'italic' as const,
    lineHeight: 1.3,
    flex: 1,
  },
  dismissBtn: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    flexShrink: 0,
  },
  questionLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.02em',
  },
  questionText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontStyle: 'italic' as const,
    lineHeight: 1.4,
  },
  answerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 1.5,
  },
}
