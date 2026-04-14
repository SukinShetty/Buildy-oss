// GuidanceSections.tsx
// Renders the 7-section structured guidance output from Claude.
// Each section has a distinct icon, color, and label so non-tech users
// can scan quickly and understand what belongs in each bucket.

import React from 'react'
import type { AnalysisResult } from '../types'

interface Props {
  result: AnalysisResult
}

export function GuidanceSections({ result }: Props): React.ReactElement {
  return (
    <div style={styles.container}>
      {/* Not visible warning */}
      {!result.screenContentVisible && (
        <StatusBanner
          color="var(--color-warning)"
          bg="var(--color-warning-muted)"
          icon="👁️‍🗨️"
          text="The watched screen content wasn't clearly visible. Try analyzing again."
        />
      )}

      {/* 1. What's happening */}
      <GuidanceCard
        icon="🔍"
        iconColor="var(--color-info)"
        title="What's happening right now"
        body={result.whatIsHappening}
      />

      {/* 2. What it means */}
      <GuidanceCard
        icon="💡"
        iconColor="var(--color-warning)"
        title="What this means for your product"
        body={result.whatItMeans}
      />

      {/* 3. What's built */}
      {result.whatIsBuilt.length > 0 && (
        <BulletCard
          icon="✅"
          iconColor="var(--color-success)"
          title="What looks done"
          items={result.whatIsBuilt}
          bulletColor="var(--color-success)"
        />
      )}

      {/* 4. What's missing */}
      {result.whatIsMissing.length > 0 && (
        <BulletCard
          icon="🔧"
          iconColor="var(--color-warning)"
          title="Still needs to be built"
          items={result.whatIsMissing}
          bulletColor="var(--color-warning)"
        />
      )}

      {/* 5. What's broken */}
      {result.whatIsBroken.length > 0 && (
        <BulletCard
          icon="⚠️"
          iconColor="var(--color-danger)"
          title="Broken — fix these first"
          items={result.whatIsBroken}
          bulletColor="var(--color-danger)"
        />
      )}

      {/* 6. Where user is stuck */}
      {result.whereUserIsStuck && (
        <GuidanceCard
          icon="🤔"
          iconColor="var(--color-danger)"
          title="Where you might be stuck"
          body={result.whereUserIsStuck}
          bgColor="var(--color-danger-muted)"
        />
      )}

      {/* 7. Best next move */}
      <GuidanceCard
        icon="⚡"
        iconColor="var(--color-accent)"
        title="Your best next move"
        body={result.bestNextMove}
        bgColor="var(--color-accent-muted)"
      />

      {/* Builder note */}
      {result.builderNote && (
        <div style={styles.builderNote}>
          <span style={styles.builderNoteIcon}>🔨</span>
          <span style={styles.builderNoteText}>{result.builderNote}</span>
        </div>
      )}

      {/* Timestamp */}
      <div style={styles.timestamp}>
        Analyzed {formatRelativeTime(result.analyzedAt)} · {(result.analysisDurationMs / 1000).toFixed(1)}s
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GuidanceCard({
  icon,
  iconColor,
  title,
  body,
  bgColor,
}: {
  icon: string
  iconColor: string
  title: string
  body: string
  bgColor?: string
}): React.ReactElement {
  return (
    <div
      style={{
        ...styles.card,
        background: bgColor || 'var(--color-surface)',
      }}
    >
      <div style={styles.cardHeader}>
        <span style={{ ...styles.cardIcon, color: iconColor }}>{icon}</span>
        <span style={{ ...styles.cardTitle, color: iconColor }}>{title}</span>
      </div>
      <p style={styles.cardBody} data-selectable>{body}</p>
    </div>
  )
}

function BulletCard({
  icon,
  iconColor,
  title,
  items,
  bulletColor,
}: {
  icon: string
  iconColor: string
  title: string
  items: string[]
  bulletColor: string
}): React.ReactElement {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <span style={{ ...styles.cardIcon, color: iconColor }}>{icon}</span>
        <span style={{ ...styles.cardTitle, color: iconColor }}>{title}</span>
      </div>
      <ul style={styles.bulletList}>
        {items.map((item, index) => (
          <li key={index} style={styles.bulletItem}>
            <span
              style={{
                ...styles.bullet,
                background: bulletColor,
              }}
            />
            <span data-selectable>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusBanner({
  color,
  bg,
  icon,
  text,
}: {
  color: string
  bg: string
  icon: string
  text: string
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '10px 12px',
        background: bg,
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}30`,
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12, color, lineHeight: 1.5 }}>{text}</span>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 10) return 'just now'
  if (diffSeconds < 60) return `${diffSeconds}s ago`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  return `${Math.floor(diffMinutes / 60)}h ago`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  card: {
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  cardIcon: {
    fontSize: 13,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  cardBody: {
    fontSize: 13,
    color: 'var(--color-text)',
    lineHeight: 1.55,
  },
  bulletList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 5,
  },
  bulletItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 13,
    color: 'var(--color-text)',
    lineHeight: 1.5,
  },
  bullet: {
    width: 5,
    height: 5,
    borderRadius: '50%',
    marginTop: 6,
    flexShrink: 0,
  },
  builderNote: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
    borderLeft: '3px solid var(--color-accent)',
  },
  builderNoteIcon: {
    fontSize: 14,
    flexShrink: 0,
  },
  builderNoteText: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
    textAlign: 'center' as const,
    paddingTop: 4,
  },
}
