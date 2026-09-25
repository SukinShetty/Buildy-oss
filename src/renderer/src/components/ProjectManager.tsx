// ProjectManager.tsx — the project list with a Delete button next to each
// project (Goal screen → "Manage projects").
//
// Deleting asks for confirmation in a dialog that names the project: the name
// must be typed, then an explicit "Delete <name>" button clicked — never a bare
// OK. Main applies every rule (projects-core.planProjectDeletion): the last
// project can't be deleted, nor the one being watched; deleting the active one
// switches to another project first.

import React, { useState } from 'react'
import type { ProjectSummary } from '../types'

const REFUSAL: Record<'unknown' | 'last' | 'watching', string> = {
  watching: 'MyBuildy is watching this project. Click Stop on the robot first, then delete it.',
  last: "You can't delete your only project.",
  unknown: 'That project no longer exists.',
}

export function ProjectManager({
  projects,
  activeId,
  onChanged,
}: {
  projects: ProjectSummary[]
  activeId: string | null
  /** Called after a deletion; `switched` when the active project changed. */
  onChanged: (switched: boolean) => Promise<void>
}): React.ReactElement {
  const [confirming, setConfirming] = useState<ProjectSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onlyOne = projects.length <= 1

  return (
    <div style={S.list} data-testid="project-manager">
      {projects.map((p) => (
        <div key={p.id} style={S.row} data-project-id={p.id}>
          <span style={S.name}>
            {p.name}
            {p.id === activeId && <span style={S.current}> (current)</span>}
          </span>
          <button
            type="button"
            style={{ ...S.deleteBtn, ...(onlyOne ? S.disabled : {}) }}
            disabled={onlyOne}
            title={onlyOne ? "You can't delete your only project" : `Delete ${p.name}`}
            aria-label={`Delete ${p.name}`}
            onClick={() => { setError(null); setConfirming(p) }}
          >
            Delete
          </button>
        </div>
      ))}
      {onlyOne && <div style={S.hint}>You can&apos;t delete your only project.</div>}
      {error && <div style={S.error} role="alert">{error}</div>}
      {confirming && (
        <DeleteProjectDialog
          project={confirming}
          onCancel={() => setConfirming(null)}
          onDeleted={async (switched) => { setConfirming(null); await onChanged(switched) }}
          onRefused={(message) => { setConfirming(null); setError(message) }}
        />
      )}
    </div>
  )
}

function DeleteProjectDialog({
  project,
  onCancel,
  onDeleted,
  onRefused,
}: {
  project: ProjectSummary
  onCancel: () => void
  onDeleted: (switched: boolean) => Promise<void>
  onRefused: (message: string) => void
}): React.ReactElement {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = typed.trim() === project.name.trim()

  async function remove(): Promise<void> {
    if (!matches || busy) return
    setBusy(true)
    try {
      const result = await window.mybuildy.projects.delete(project.id)
      if (result.deleted) await onDeleted(result.switched)
      else onRefused(REFUSAL[result.reason])
    } catch (e) {
      onRefused(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.overlay} role="dialog" aria-modal="true" aria-labelledby="delete-project-title">
      <div style={S.card}>
        <div id="delete-project-title" style={S.title}>Delete &ldquo;{project.name}&rdquo;?</div>
        <p style={S.text}>
          This deletes the project&apos;s goal and everything MyBuildy remembers about it. Your other projects are not
          affected. This can&apos;t be undone.
        </p>
        <label style={S.label} htmlFor="delete-project-name">
          Type <strong>{project.name}</strong> to confirm
        </label>
        <input
          id="delete-project-name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void remove() }}
          autoFocus
          style={S.input}
          autoComplete="off"
        />
        <div style={S.buttons}>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={!matches || busy}
            style={{ ...S.danger, ...(!matches || busy ? S.disabled : {}) }}
          >
            {busy ? 'Deleting…' : `Delete “${project.name}”`}
          </button>
        </div>
      </div>
    </div>
  )
}

const S = {
  list: { display: 'flex', flexDirection: 'column' as const, gap: 6, marginTop: 8 },
  row: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    padding: '6px 10px', background: 'var(--color-surface-2)', borderRadius: 'var(--radius-sm)',
  },
  name: { fontSize: 13, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  current: { color: 'var(--color-text-dim)' },
  deleteBtn: {
    fontSize: 12, padding: '3px 10px', background: 'transparent', color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)', borderRadius: 'var(--radius-sm)', flexShrink: 0,
  },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
  hint: { fontSize: 12, color: 'var(--color-text-dim)' },
  error: { fontSize: 12.5, color: 'var(--color-danger)', lineHeight: 1.45 },
  overlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24,
  },
  card: {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
    padding: 20, maxWidth: 380, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    display: 'flex', flexDirection: 'column' as const, gap: 10,
  },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--color-text)' },
  text: { fontSize: 13, lineHeight: 1.5, color: 'var(--color-text-muted)', margin: 0 },
  label: { fontSize: 12.5, color: 'var(--color-text)' },
  input: { fontSize: 13, padding: '8px 10px' },
  buttons: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  danger: {
    background: 'var(--color-danger)', color: '#fff', padding: '8px 14px', fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
  },
}
