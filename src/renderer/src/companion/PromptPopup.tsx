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
import type { AnalysisResult } from '../types'

interface Props {
  analysis: AnalysisResult | null
  answer: { question: string; answer: string } | null
  visible: boolean
  onDismiss: () => void
}

export function PromptPopup({ analysis, answer, visible, onDismiss }: Props): React.ReactElement | null {
  const [copied, setCopied] = useState(false)

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
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      console.warn('[PromptPopup] Copy failed:', e)
    }
  }

  return (
    <div style={styles.bubble} className="bubble-appear">
      <div style={styles.pointer} />

      {analysis.whatIsHappening && (
        <div style={styles.context}>{analysis.whatIsHappening}</div>
      )}

      <div style={styles.nextMove}>{analysis.bestNextMove}</div>

      <div style={styles.promptCard}>
        <div style={styles.promptText} data-selectable>
          {analysis.nextPrompt}
        </div>
        <button onClick={handleCopy} style={styles.copyBtn}>
          {copied ? 'Copied' : 'Copy'}
        </button>
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
    background: 'rgba(52,199,89,0.06)',
    border: '1px solid rgba(52,199,89,0.2)',
    borderRadius: 8,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  promptText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.4,
    fontFamily: '"SF Mono", "Cascadia Code", "Consolas", monospace',
    wordBreak: 'break-word' as const,
    maxHeight: 96,
    overflowY: 'auto' as const,
    userSelect: 'text' as const,
  },
  copyBtn: {
    alignSelf: 'flex-end' as const,
    fontSize: 10,
    fontWeight: 600,
    padding: '3px 12px',
    borderRadius: 6,
    background: 'rgba(52,199,89,0.15)',
    color: '#34C759',
    border: '1px solid rgba(52,199,89,0.25)',
    cursor: 'pointer',
    transition: 'background 0.15s',
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
