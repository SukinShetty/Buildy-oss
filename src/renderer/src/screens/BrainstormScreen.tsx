// BrainstormScreen.tsx
// The first screen the user sees. A chat interface where Buildy helps them
// define their product idea: what to build, who it's for, and what the MVP should be.
//
// Once Buildy extracts enough context, it generates a structured project summary
// that auto-populates the Memory screen.

import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { ChatMessage, ExtractedProjectData } from '../types'

export function BrainstormScreen(): React.ReactElement {
  const {
    brainstormMessages,
    brainstormPhase,
    brainstormStreamingBuffer,
    brainstormErrorMessage,
    lastExtractedProjectData,
    settings,
    project,
    setCurrentScreen,
    patchProject,
    addBrainstormUserMessage,
    appendBrainstormStreamChunk,
    finalizeBrainstormAssistantMessage,
    setBrainstormPhase,
    setBrainstormError,
    clearBrainstormMessages,
  } = useAppStore()

  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const isStreaming = brainstormPhase === 'streaming' || brainstormPhase === 'waiting-for-response'

  // Auto-scroll to bottom as messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [brainstormMessages.length, brainstormStreamingBuffer])

  // Register streaming event listeners once on mount
  useEffect(() => {
    const unsubChunk = window.buildy.onBrainstormChunk((chunk) => {
      appendBrainstormStreamChunk(chunk)
    })

    const unsubDone = window.buildy.onBrainstormDone(({ fullText, extractedProjectData }) => {
      finalizeBrainstormAssistantMessage(fullText, extractedProjectData)
      // If Buildy extracted project data, offer to save it
    })

    const unsubError = window.buildy.onBrainstormError((errorMessage) => {
      setBrainstormError(errorMessage)
    })

    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
    }
  }, [])

  // Check if API is configured
  const apiIsConfigured = settings.apiKey || settings.baseUrl || (settings.useProxy && settings.proxyUrl)

  async function handleSendMessage(): Promise<void> {
    const trimmedInput = inputText.trim()
    if (!trimmedInput || isStreaming) return

    setInputText('')
    addBrainstormUserMessage(trimmedInput)

    try {
      await window.buildy.startBrainstorm(
        trimmedInput,
        brainstormMessages,
        settings
      )
    } catch (error) {
      setBrainstormError(String(error))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    // Cmd+Enter or Ctrl+Enter to send (Enter alone adds a newline)
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      handleSendMessage()
    }
  }

  function handleSaveProjectData(data: ExtractedProjectData): void {
    patchProject({
      projectName: data.projectName,
      productSummary: data.productSummary,
      targetUser: data.targetUser,
      coreProblem: data.coreProblem,
      brainstormSummary: data.brainstormSummary,
    })
    // Persist to disk
    window.buildy.saveProject({ ...project, ...data })
    setCurrentScreen('guidance')
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>💡 Let's figure out what you're building</div>
        <div style={styles.headerSub}>
          Chat with Buildy to define your product. Then go to Guidance to start building.
        </div>
        {brainstormMessages.length > 0 && (
          <button className="btn-ghost" style={styles.clearButton} onClick={clearBrainstormMessages}>
            Start over
          </button>
        )}
      </div>

      {/* No API key warning */}
      {!apiIsConfigured && (
        <div style={styles.warningBanner}>
          <span>⚠️</span>
          <span>
            Add your Anthropic API key in{' '}
            <button
              style={styles.inlineLink}
              onClick={() => setCurrentScreen('settings')}
            >
              Settings
            </button>{' '}
            to use Buildy.
          </span>
        </div>
      )}

      {/* Chat messages */}
      <div style={styles.messageList}>
        {brainstormMessages.length === 0 && (
          <WelcomeMessage />
        )}

        {brainstormMessages.map((msg, index) => (
          <ChatBubble key={index} message={msg} />
        ))}

        {/* Streaming in-progress bubble */}
        {isStreaming && brainstormStreamingBuffer && (
          <ChatBubble
            message={{
              role: 'assistant',
              content: brainstormStreamingBuffer,
              timestamp: new Date().toISOString(),
            }}
            isStreaming
          />
        )}

        {/* Waiting indicator */}
        {brainstormPhase === 'waiting-for-response' && !brainstormStreamingBuffer && (
          <div style={styles.typingIndicator}>
            <span>🔨</span>
            <span style={styles.typingDots}>Buildy is thinking…</span>
          </div>
        )}

        {/* Error */}
        {brainstormErrorMessage && (
          <div style={styles.errorBubble}>⚠️ {brainstormErrorMessage}</div>
        )}

        {/* Extracted project data — offer to save */}
        {lastExtractedProjectData && (
          <ExtractedDataCard
            data={lastExtractedProjectData}
            onSave={handleSaveProjectData}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputRow}>
        <textarea
          ref={inputRef}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe your idea, or answer Buildy's question…"
          style={styles.input}
          rows={2}
          disabled={isStreaming || !apiIsConfigured}
        />
        <button
          className="btn-primary"
          onClick={handleSendMessage}
          disabled={!inputText.trim() || isStreaming || !apiIsConfigured}
          style={styles.sendButton}
          title="Send (Ctrl+Enter)"
        >
          ↑
        </button>
      </div>
      <div style={styles.inputHint}>Ctrl+Enter to send</div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function WelcomeMessage(): React.ReactElement {
  return (
    <div style={styles.welcomeMessage}>
      <div style={styles.welcomeIcon}>🔨</div>
      <div style={styles.welcomeTitle}>Hey! I'm Buildy, your builder buddy.</div>
      <div style={styles.welcomeText}>
        Tell me what you want to build. No need to be technical — just describe your idea
        in plain words and I'll help you figure out what to make first.
      </div>
    </div>
  )
}

function ChatBubble({
  message,
  isStreaming = false,
}: {
  message: ChatMessage
  isStreaming?: boolean
}): React.ReactElement {
  const isUser = message.role === 'user'

  // Strip the BUILDY_PROJECT_SUMMARY block from the display — it's internal
  const displayContent = message.content
    .replace(/---BUILDY_PROJECT_SUMMARY---[\s\S]*?---END_BUILDY_PROJECT_SUMMARY---/, '')
    .trim()

  return (
    <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.assistantBubble) }}>
      {!isUser && <span style={styles.bubbleIcon}>🔨</span>}
      <div
        style={{
          ...styles.bubbleContent,
          ...(isUser ? styles.userBubbleContent : styles.assistantBubbleContent),
        }}
        data-selectable
      >
        {displayContent}
        {isStreaming && <span style={styles.streamingCursor}>▋</span>}
      </div>
    </div>
  )
}

function ExtractedDataCard({
  data,
  onSave,
}: {
  data: ExtractedProjectData
  onSave: (data: ExtractedProjectData) => void
}): React.ReactElement {
  return (
    <div style={styles.extractedCard}>
      <div style={styles.extractedCardTitle}>✅ Buildy understands your product</div>
      <div style={styles.extractedField}>
        <span style={styles.extractedLabel}>Product name</span>
        <span style={styles.extractedValue}>{data.projectName}</span>
      </div>
      <div style={styles.extractedField}>
        <span style={styles.extractedLabel}>What it does</span>
        <span style={styles.extractedValue}>{data.productSummary}</span>
      </div>
      <div style={styles.extractedField}>
        <span style={styles.extractedLabel}>Who it's for</span>
        <span style={styles.extractedValue}>{data.targetUser}</span>
      </div>
      <div style={styles.extractedField}>
        <span style={styles.extractedLabel}>Problem it solves</span>
        <span style={styles.extractedValue}>{data.coreProblem}</span>
      </div>
      <button
        className="btn-primary"
        style={{ width: '100%', marginTop: 10, justifyContent: 'center' }}
        onClick={() => onSave(data)}
      >
        Save project and go to Guidance →
      </button>
    </div>
  )
}

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
  clearButton: {
    fontSize: 11,
    padding: '2px 6px',
    marginTop: 4,
    color: 'var(--color-text-dim)',
  },
  warningBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: 'var(--color-warning-muted)',
    borderBottom: '1px solid var(--color-border)',
    fontSize: 12,
    color: 'var(--color-warning)',
    flexShrink: 0,
  },
  inlineLink: {
    background: 'none',
    border: 'none',
    color: 'var(--color-accent)',
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
    textDecoration: 'underline',
  },
  messageList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  welcomeMessage: {
    textAlign: 'center' as const,
    padding: '24px 8px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
  },
  welcomeIcon: {
    fontSize: 32,
  },
  welcomeTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  welcomeText: {
    fontSize: 13,
    color: 'var(--color-text-muted)',
    lineHeight: 1.5,
    maxWidth: 340,
  },
  bubble: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
  },
  userBubble: {
    flexDirection: 'row-reverse' as const,
  },
  assistantBubble: {
    flexDirection: 'row' as const,
  },
  bubbleIcon: {
    fontSize: 18,
    flexShrink: 0,
    marginTop: 2,
  },
  bubbleContent: {
    maxWidth: '85%',
    padding: '8px 12px',
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  userBubbleContent: {
    background: 'var(--color-accent)',
    color: 'white',
    borderBottomRightRadius: 3,
  },
  assistantBubbleContent: {
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    borderBottomLeftRadius: 3,
  },
  streamingCursor: {
    display: 'inline',
    animation: 'blink 1s step-end infinite',
    marginLeft: 2,
  },
  typingIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
  },
  typingDots: {
    fontSize: 12,
    color: 'var(--color-text-dim)',
    fontStyle: 'italic',
  },
  errorBubble: {
    padding: '8px 12px',
    background: 'var(--color-danger-muted)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 12,
    color: 'var(--color-danger)',
    border: '1px solid var(--color-danger)30',
  },
  extractedCard: {
    background: 'var(--color-success-muted)',
    border: '1px solid var(--color-prompt-border)',
    borderRadius: 'var(--radius-md)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  extractedCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-success)',
    marginBottom: 4,
  },
  extractedField: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
  },
  extractedLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-dim)',
  },
  extractedValue: {
    fontSize: 12,
    color: 'var(--color-text)',
    lineHeight: 1.4,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '8px 16px',
    borderTop: '1px solid var(--color-border)',
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    resize: 'none' as const,
    fontSize: 13,
    lineHeight: 1.4,
  },
  sendButton: {
    width: 36,
    height: 36,
    padding: 0,
    justifyContent: 'center',
    fontSize: 16,
    flexShrink: 0,
    borderRadius: 'var(--radius-sm)',
  },
  inputHint: {
    fontSize: 10,
    color: 'var(--color-text-dim)',
    textAlign: 'center' as const,
    paddingBottom: 6,
  },
}
