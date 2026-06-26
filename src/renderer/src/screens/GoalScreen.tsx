// GoalScreen.tsx
// Captures the user's goal — their stated purpose for what they're building.
// Shown on first launch, from the "Set Goal" nav tab, and when starting a new
// project. The goal is stored locally (project memory) and injected into every
// analysis so Buildy can tell the user whether each step moves toward the goal.

import React, { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

const PLACEHOLDER =
  'Example: I want to build a simple CRM for my small business to track customers and follow-ups. The main users are me and 2 employees who are not technical.'

export function GoalScreen(): React.ReactElement {
  const { project, patchProject, setCurrentScreen } = useAppStore()

  const existing = project.goal
  const [purpose, setPurpose] = useState(existing?.purpose ?? '')
  const [audience, setAudience] = useState(existing?.audience ?? '')
  const [mostImportant, setMostImportant] = useState(existing?.mostImportant ?? '')
  const [successCriteria, setSuccessCriteria] = useState(existing?.successCriteria ?? '')
  // Expand the optional fields by default if any were already filled in (editing)
  const [showMore, setShowMore] = useState(
    !!(existing?.audience || existing?.mostImportant || existing?.successCriteria)
  )
  const [saving, setSaving] = useState(false)

  const canSave = purpose.trim().length > 0

  async function handleSave(): Promise<void> {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const goal = await window.buildy.goal.set({
        purpose: purpose.trim(),
        audience: audience.trim() || undefined,
        mostImportant: mostImportant.trim() || undefined,
        successCriteria: successCriteria.trim() || undefined,
      })
      // Keep the in-memory project in sync (main process already persisted it)
      patchProject({ goal, goalPromptSeen: true })
      setCurrentScreen('guidance')
    } catch (e) {
      console.error('[GoalScreen] Failed to save goal:', e)
      setSaving(false)
    }
  }

  function handleSkip(): void {
    // Skipping is allowed — record that the prompt was seen so it won't auto-show again.
    const updated = { ...project, goalPromptSeen: true }
    patchProject({ goalPromptSeen: true })
    window.buildy.saveProject(updated).catch((e) =>
      console.warn('[GoalScreen] Failed to persist skip:', e)
    )
    setCurrentScreen('guidance')
  }

  return (
    <div style={styles.container}>
      <div style={styles.inner}>
        <h1 style={styles.heading}>What are you building?</h1>
        <p style={styles.subheading}>
          Tell me in plain English. I will remember this and use it to guide every step.
        </p>

        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={8}
          style={styles.textarea}
          autoFocus
        />

        {/* Optional follow-up details — collapsed by default */}
        <button
          type="button"
          onClick={() => setShowMore((s) => !s)}
          style={styles.moreToggle}
        >
          {showMore ? '▾ Hide extra detail' : '▸ Add more detail'}
        </button>

        {showMore && (
          <div style={styles.moreFields}>
            <Field label="Who is this for?">
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. me and 2 non-technical employees"
              />
            </Field>
            <Field label="What is the single most important thing it should do?">
              <input
                type="text"
                value={mostImportant}
                onChange={(e) => setMostImportant(e.target.value)}
                placeholder="e.g. never lose track of a customer follow-up"
              />
            </Field>
            <Field label="What does success look like in one month?">
              <input
                type="text"
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                placeholder="e.g. my team logs every call without me reminding them"
              />
            </Field>
          </div>
        )}

        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...styles.saveButton, opacity: canSave && !saving ? 1 : 0.5 }}
        >
          {saving ? 'Saving…' : 'Save and start building'}
        </button>

        <button type="button" onClick={handleSkip} style={styles.skipLink}>
          Skip for now
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={styles.field}>
      <div style={styles.fieldLabel}>{label}</div>
      {children}
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflowY: 'auto' as const,
    padding: '24px 20px 32px',
  },
  inner: {
    width: '100%',
    maxWidth: 420,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--color-text)',
    letterSpacing: '-0.02em',
    margin: 0,
  },
  subheading: {
    fontSize: 14,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    margin: '8px 0 18px',
  },
  textarea: {
    width: '100%',
    resize: 'vertical' as const,
    lineHeight: 1.5,
    fontSize: 14,
  },
  moreToggle: {
    alignSelf: 'flex-start' as const,
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    padding: '10px 0',
  },
  moreFields: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    marginBottom: 4,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
  },
  saveButton: {
    marginTop: 18,
    justifyContent: 'center',
    width: '100%',
  },
  skipLink: {
    marginTop: 12,
    alignSelf: 'center' as const,
    background: 'none',
    border: 'none',
    color: 'var(--color-text-dim)',
    cursor: 'pointer',
    fontSize: 12,
    textDecoration: 'underline',
  },
}
