// PromptCard.tsx
// The "next prompt for Claude Code" section — the single most important UI element.
// Distinctive green-tinted box with a large copy button.

import React, { useState } from 'react'

interface Props {
  promptText: string
  title?: string
  hint?: string
}

export function PromptCard({ promptText, title, hint }: Props): React.ReactElement {
  const [copied, setCopied] = useState(false)

  function handleCopyClick(): void {
    navigator.clipboard.writeText(promptText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerIcon}>📋</span>
        <span style={styles.headerTitle}>{title ?? 'Suggested next action'}</span>
        <span style={styles.headerHint}>{hint ?? 'Copy this and paste it in'}</span>
      </div>

      {/* Prompt text */}
      <div style={styles.promptBox}>
        <p style={styles.promptText} data-selectable>
          {promptText}
        </p>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopyClick}
        style={{
          ...styles.copyButton,
          ...(copied ? styles.copyButtonCopied : styles.copyButtonDefault),
        }}
      >
        {copied ? (
          <>
            <span>✓</span>
            <span>Copied to clipboard!</span>
          </>
        ) : (
          <>
            <span>📋</span>
            <span>Copy Prompt</span>
          </>
        )}
      </button>
    </div>
  )
}

const styles = {
  container: {
    background: 'var(--color-prompt-bg)',
    border: '1px solid var(--color-prompt-border)',
    borderRadius: 'var(--radius-md)',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: {
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-success)',
    flex: 1,
  },
  headerHint: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
  },
  promptBox: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 'var(--radius-sm)',
    padding: '10px 12px',
    border: '1px solid var(--color-prompt-border)',
  },
  promptText: {
    fontSize: 13,
    color: 'var(--color-text)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  copyButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    padding: '9px 16px',
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
    border: 'none',
  },
  copyButtonDefault: {
    background: 'var(--color-success)',
    color: 'white',
  },
  copyButtonCopied: {
    background: 'var(--color-success)',
    color: 'white',
    opacity: 0.8,
  },
}
