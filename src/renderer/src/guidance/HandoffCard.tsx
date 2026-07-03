// HandoffCard.tsx
// Hand-off detection UI (loop engineering Block 6). Shown inside the guidance
// panel when an analysis sets needsHumanJudgment — i.e. the next step is a genuine
// decision the user must own (architectural tradeoff, irreversible commitment,
// legal/compliance, or two equally-valid approaches).
//
// Calm, non-alarming card with two choices:
//   • "I'll decide"  → records a decision entry in Nemp (reuses the zod-validated
//                       memory:add-decision channel — no new unvalidated IPC), then dismisses.
//   • "Skip for now" → dismisses without recording.

import React, { useState } from 'react'

export function HandoffCard({ reason }: { reason?: string }): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  async function decide(): Promise<void> {
    try {
      await window.buildy.memory.addDecision(
        reason || 'A decision that needs human judgment',
        'User chose to decide this themselves'
      )
    } catch (e) {
      console.warn('[HandoffCard] recording decision failed:', e)
    }
    setDismissed(true)
  }

  return (
    <div style={S.card}>
      <div style={S.title}>🤔 This needs your decision</div>
      {reason && <div style={S.reason}>{reason}</div>}
      <div style={S.buttons}>
        <button onClick={decide} style={S.primary} title="Record this decision and continue">
          I'll decide
        </button>
        <button onClick={() => setDismissed(true)} style={S.ghost} title="Dismiss without recording">
          Skip for now
        </button>
      </div>
    </div>
  )
}

const S = {
  card: {
    marginBottom: 14,
    background: 'rgba(99,102,241,0.08)',
    border: '1px solid rgba(99,102,241,0.28)',
    borderRadius: 12,
    padding: 14,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(199,201,255,0.95)',
    paddingRight: 20,
  },
  reason: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.55,
  },
  buttons: {
    display: 'flex',
    gap: 8,
    marginTop: 4,
  },
  primary: {
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: 8,
    background: 'rgba(99,102,241,0.85)',
    color: '#fff',
    border: '1px solid rgba(99,102,241,0.5)',
    cursor: 'pointer',
  },
  ghost: {
    fontSize: 12,
    fontWeight: 500,
    padding: '6px 14px',
    borderRadius: 8,
    background: 'transparent',
    color: 'rgba(255,255,255,0.55)',
    border: '1px solid rgba(255,255,255,0.15)',
    cursor: 'pointer',
  },
}
