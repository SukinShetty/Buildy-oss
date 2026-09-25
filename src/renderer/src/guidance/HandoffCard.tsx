// HandoffCard.tsx
// Hand-off detection UI (loop engineering Block 6). Shown inside the guidance
// panel when an analysis sets needsHumanJudgment — i.e. the next step is a genuine
// decision the user must own (architectural tradeoff, irreversible commitment,
// legal/compliance, a clarification only they can answer, or two equally-valid
// approaches).
//
// Calm, non-alarming card:
//   • "I'll decide"  → opens a small answer box; saving records the user's ANSWER
//                       as a decision in the ACTIVE project via the existing
//                       zod-validated memory:add-decision channel (no new
//                       unvalidated IPC), then dismisses.
//   • "Skip for now" → dismisses without recording.
//
// Focus note: the guidance window is non-focusable by design, so typing needs
// window.mybuildy.setGuidanceFocusable(true) while the answer box is open — it is
// ALWAYS restored to false when the flow ends (save/skip/unmount).

import React, { useEffect, useState } from 'react'

export function HandoffCard({ reason }: { reason?: string }): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [answer, setAnswer] = useState('')
  const [saving, setSaving] = useState(false)

  const question = reason || 'A decision that needs human judgment'

  // The window may only take keyboard focus while the answer box is open; always
  // restore non-focusable when the flow ends or the card unmounts.
  useEffect(() => {
    if (!answering) return
    window.mybuildy.setGuidanceFocusable(true)
    return () => window.mybuildy.setGuidanceFocusable(false)
  }, [answering])

  if (dismissed) return null

  function close(recordDone: boolean): void {
    setAnswering(false)
    if (recordDone) setDismissed(true)
  }

  async function saveDecision(): Promise<void> {
    if (saving) return // double-submit guard while the IPC is in flight
    setSaving(true)
    try {
      // Store the user's hand-off ANSWER as a decision in the active project.
      await window.mybuildy.memory.addDecision(
        question,
        answer.trim() || 'User chose to decide this themselves'
      )
    } catch (e) {
      console.warn('[HandoffCard] recording decision failed:', e)
    }
    setSaving(false)
    close(true)
  }

  return (
    <div style={S.card}>
      <div style={S.title}>🤔 This needs your decision</div>
      {reason && <div style={S.reason}>{reason}</div>}

      {!answering ? (
        <div style={S.buttons}>
          <button onClick={() => setAnswering(true)} style={S.primary} title="Type your answer — MyBuildy remembers it for this project">
            I'll decide
          </button>
          <button onClick={() => setDismissed(true)} style={S.ghost} title="Dismiss without recording">
            Skip for now
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your decision, in your own words…"
            autoFocus
            rows={3}
            style={S.answerBox}
          />
          <div style={S.buttons}>
            <button
              onClick={saveDecision}
              disabled={saving}
              style={{ ...S.primary, ...(saving ? S.disabled : {}) }}
              title="Save this decision to project memory"
            >
              {saving ? 'Saving…' : 'Save decision'}
            </button>
            <button onClick={() => close(false)} disabled={saving} style={S.ghost} title="Back without saving">
              Cancel
            </button>
          </div>
        </>
      )}
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
  answerBox: {
    marginTop: 2,
    width: '100%',
    boxSizing: 'border-box' as const,
    resize: 'none' as const,
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: 'inherit',
    color: 'rgba(255,255,255,0.92)',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(99,102,241,0.35)',
    borderRadius: 8,
    padding: '8px 10px',
    outline: 'none',
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
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
}
