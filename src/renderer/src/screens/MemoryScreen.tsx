// MemoryScreen.tsx
// Shows the current project memory and lets the user edit it.
// The memory feeds into every Claude analysis — better context = better guidance.

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { ExplanationStyle } from '../types'

export function MemoryScreen(): React.ReactElement {
  const { project, patchProject, setCurrentScreen } = useAppStore()

  // Local form state — synced from store on mount, saved on change
  const [projectName, setProjectName] = useState(project.projectName)
  const [productSummary, setProductSummary] = useState(project.productSummary)
  const [targetUser, setTargetUser] = useState(project.targetUser)
  const [coreProblem, setCoreProblem] = useState(project.coreProblem)
  const [explanationStyle, setExplanationStyle] = useState<ExplanationStyle>(
    project.explanationStyle
  )
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Sync form if the project changes externally (e.g. after brainstorm)
  useEffect(() => {
    setProjectName(project.projectName)
    setProductSummary(project.productSummary)
    setTargetUser(project.targetUser)
    setCoreProblem(project.coreProblem)
    setExplanationStyle(project.explanationStyle)
  }, [project.updatedAt])

  function handleSave(): void {
    const updatedProject = {
      ...project,
      projectName,
      productSummary,
      targetUser,
      coreProblem,
      explanationStyle,
    }
    patchProject(updatedProject)
    window.buildy.saveProject(updatedProject)
    setSavedAt(new Date().toLocaleTimeString())
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerRow}>
          <div style={styles.headerTitle}>📋 Project Memory</div>
          <button
            className="btn-ghost"
            onClick={() => setCurrentScreen('goal')}
            style={styles.newProjectBtn}
            title="State a fresh goal for a new project"
          >
            🎯 New project
          </button>
        </div>
        <div style={styles.headerSub}>
          This is what Buildy knows about your product. Better context = better guidance.
        </div>
      </div>

      <div style={styles.form}>
        {/* Product name */}
        <FormField
          label="Product name"
          hint="What's it called?"
        >
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. TaskFlow, ShopBot, FitTracker…"
          />
        </FormField>

        {/* Product summary */}
        <FormField
          label="What it does"
          hint="1–2 sentences"
        >
          <textarea
            value={productSummary}
            onChange={(e) => setProductSummary(e.target.value)}
            placeholder="e.g. A web app that helps freelancers track their invoices and get paid faster."
            rows={3}
          />
        </FormField>

        {/* Target user */}
        <FormField
          label="Who it's for"
          hint="Your target user"
        >
          <input
            type="text"
            value={targetUser}
            onChange={(e) => setTargetUser(e.target.value)}
            placeholder="e.g. Freelancers, small business owners, parents…"
          />
        </FormField>

        {/* Core problem */}
        <FormField
          label="Problem it solves"
          hint="The main pain point"
        >
          <textarea
            value={coreProblem}
            onChange={(e) => setCoreProblem(e.target.value)}
            placeholder="e.g. Freelancers forget to follow up on invoices and lose money."
            rows={2}
          />
        </FormField>

        {/* Explanation style */}
        <FormField
          label="How technical are you?"
          hint="Affects how Buildy explains things"
        >
          <div style={styles.styleOptions}>
            {EXPLANATION_STYLES.map(({ value, label, description }) => (
              <button
                key={value}
                onClick={() => setExplanationStyle(value)}
                style={{
                  ...styles.styleOption,
                  ...(explanationStyle === value
                    ? styles.styleOptionSelected
                    : styles.styleOptionDefault),
                }}
              >
                <div style={styles.styleOptionLabel}>{label}</div>
                <div style={styles.styleOptionDesc}>{description}</div>
              </button>
            ))}
          </div>
        </FormField>

        {/* What's built (read-only — populated by analysis) */}
        {project.completedFeatures.length > 0 && (
          <FormField label="What Buildy thinks is built" hint="Auto-detected from analysis">
            <FeatureList items={project.completedFeatures} color="var(--color-success)" />
          </FormField>
        )}

        {/* What's missing (read-only) */}
        {project.missingFeatures.length > 0 && (
          <FormField label="What Buildy thinks is still missing" hint="Auto-detected from analysis">
            <FeatureList items={project.missingFeatures} color="var(--color-warning)" />
          </FormField>
        )}

        {/* Save button */}
        <div style={styles.saveRow}>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1, justifyContent: 'center' }}>
            Save Memory
          </button>
          {savedAt && (
            <span style={styles.savedAt}>✓ Saved at {savedAt}</span>
          )}
        </div>

        {/* Brainstorm nudge if no project */}
        {!project.projectName && (
          <div style={styles.brainstormNudge}>
            No project yet.{' '}
            <button
              style={styles.nudgeLink}
              onClick={() => setCurrentScreen('brainstorm')}
            >
              Chat with Buildy in Brainstorm →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div style={styles.field}>
      <div style={styles.fieldHeader}>
        <span style={styles.fieldLabel}>{label}</span>
        {hint && <span style={styles.fieldHint}>{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function FeatureList({ items, color }: { items: string[]; color: string }): React.ReactElement {
  return (
    <div style={styles.featureList}>
      {items.map((item, i) => (
        <div key={i} style={styles.featureItem}>
          <span style={{ ...styles.featureDot, background: color }} />
          <span style={styles.featureText}>{item}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const EXPLANATION_STYLES: Array<{
  value: ExplanationStyle
  label: string
  description: string
}> = [
  {
    value: 'very_simple',
    label: '🟢 Keep it simple',
    description: 'No tech words. Use everyday language.',
  },
  {
    value: 'balanced',
    label: '🟡 Middle ground',
    description: 'Mostly plain, some tech terms explained.',
  },
  {
    value: 'technical',
    label: '🔵 I know some tech',
    description: 'Tech terms are fine. Assume basic coding literacy.',
  },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  newProjectBtn: {
    fontSize: 12,
    padding: '4px 10px',
    whiteSpace: 'nowrap' as const,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  headerSub: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    marginTop: 2,
  },
  form: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
  },
  fieldHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  fieldHint: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
  },
  styleOptions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  styleOption: {
    padding: '8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
  },
  styleOptionDefault: {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  styleOptionSelected: {
    background: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-text)',
  },
  styleOptionLabel: {
    fontSize: 13,
    fontWeight: 500,
  },
  styleOptionDesc: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
    marginTop: 1,
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    padding: '8px 10px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    marginTop: 5,
    flexShrink: 0,
  },
  featureText: {
    fontSize: 12,
    color: 'var(--color-text)',
    lineHeight: 1.4,
  },
  saveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  savedAt: {
    fontSize: 11,
    color: 'var(--color-success)',
  },
  brainstormNudge: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    textAlign: 'center' as const,
    padding: '8px 0',
  },
  nudgeLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: 12,
    textDecoration: 'underline',
  },
}
