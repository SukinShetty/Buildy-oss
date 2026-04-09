// SettingsScreen.tsx
// API key configuration and app preferences.
// Supports two modes:
//   1. Direct Anthropic API key (user enters their own key)
//   2. Proxy mode (point to a Cloudflare Worker URL — no key in app)

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

export function SettingsScreen(): React.ReactElement {
  const { settings, setSettings } = useAppStore()

  const [apiKey, setApiKey] = useState(settings.anthropicApiKey)
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl)
  const [useProxy, setUseProxy] = useState(settings.useProxy)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    setApiKey(settings.anthropicApiKey)
    setProxyUrl(settings.proxyUrl)
    setUseProxy(settings.useProxy)
  }, [settings.anthropicApiKey, settings.proxyUrl, settings.useProxy])

  function handleSave(): void {
    const updatedSettings = {
      ...settings,
      anthropicApiKey: apiKey.trim(),
      proxyUrl: proxyUrl.trim(),
      useProxy,
    }
    setSettings(updatedSettings)
    window.buildy.saveSettings(updatedSettings)
    setSavedAt(new Date().toLocaleTimeString())
  }

  const configuredCorrectly = useProxy
    ? proxyUrl.trim().startsWith('http')
    : apiKey.trim().startsWith('sk-ant-')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>⚙️ Settings</div>
        <div style={styles.headerSub}>Configure how Buildy connects to Claude.</div>
      </div>

      <div style={styles.content}>
        {/* Mode selector */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Connection mode</div>
          <div style={styles.modeButtons}>
            <button
              onClick={() => setUseProxy(false)}
              style={{
                ...styles.modeButton,
                ...(useProxy ? styles.modeButtonInactive : styles.modeButtonActive),
              }}
            >
              <div style={styles.modeButtonTitle}>🔑 My own API key</div>
              <div style={styles.modeButtonDesc}>
                Use your Anthropic API key directly. Costs billed to your account.
              </div>
            </button>

            <button
              onClick={() => setUseProxy(true)}
              style={{
                ...styles.modeButton,
                ...(useProxy ? styles.modeButtonActive : styles.modeButtonInactive),
              }}
            >
              <div style={styles.modeButtonTitle}>🌐 Use a proxy</div>
              <div style={styles.modeButtonDesc}>
                Point to a Cloudflare Worker that holds the API key. Good for teams.
              </div>
            </button>
          </div>
        </div>

        {/* API key input (direct mode) */}
        {!useProxy && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Anthropic API key</div>
            <div style={styles.sectionHint}>
              Get yours at{' '}
              <span style={styles.link}>console.anthropic.com</span>
              . Starts with <code style={styles.code}>sk-ant-</code>.
            </div>
            <div style={styles.inputWrapper}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-…"
                style={styles.keyInput}
              />
              <button
                className="btn-icon"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide key' : 'Show key'}
              >
                {showApiKey ? '🙈' : '👁️'}
              </button>
            </div>
            {apiKey && !apiKey.startsWith('sk-ant-') && (
              <div style={styles.warningText}>
                ⚠️ This doesn't look like a valid Anthropic API key.
              </div>
            )}
          </div>
        )}

        {/* Proxy URL input (proxy mode) */}
        {useProxy && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Proxy URL</div>
            <div style={styles.sectionHint}>
              Your Cloudflare Worker URL. Ends with <code style={styles.code}>.workers.dev</code>.
              See the worker/ folder in the Buildy repo for setup instructions.
            </div>
            <input
              type="url"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="https://buildy-proxy.your-subdomain.workers.dev"
            />
          </div>
        )}

        {/* Status */}
        <div style={styles.section}>
          <div style={styles.statusRow}>
            <span
              style={{
                ...styles.statusDot,
                background: configuredCorrectly
                  ? 'var(--color-success)'
                  : 'var(--color-danger)',
              }}
            />
            <span style={styles.statusText}>
              {configuredCorrectly
                ? 'Buildy is configured and ready'
                : 'Add a valid API key or proxy URL to use Buildy'}
            </span>
          </div>
        </div>

        {/* Save button */}
        <div style={styles.saveRow}>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1, justifyContent: 'center' }}>
            Save Settings
          </button>
          {savedAt && (
            <span style={styles.savedAt}>✓ Saved at {savedAt}</span>
          )}
        </div>

        {/* Info section */}
        <div style={styles.infoSection}>
          <div style={styles.infoTitle}>About Buildy</div>
          <div style={styles.infoText}>
            Buildy v1.0.0 — cross-platform builder buddy for Claude Code.
          </div>
          <div style={styles.infoText}>
            Your API key is stored locally on your machine and never leaves your device
            (when using direct mode).
          </div>
        </div>
      </div>
    </div>
  )
}

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
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
  },
  sectionHint: {
    fontSize: 12,
    color: 'var(--color-text-dim)',
    lineHeight: 1.4,
  },
  link: {
    color: 'var(--color-accent)',
    cursor: 'pointer',
  },
  code: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    background: 'var(--color-surface-2)',
    padding: '1px 4px',
    borderRadius: 3,
    color: 'var(--color-text)',
  },
  modeButtons: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  modeButton: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background 0.1s, border-color 0.1s',
  },
  modeButtonActive: {
    background: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-text)',
  },
  modeButtonInactive: {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  modeButtonTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 2,
  },
  modeButtonDesc: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
    lineHeight: 1.4,
  },
  inputWrapper: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  keyInput: {
    flex: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  } as React.CSSProperties,
  warningText: {
    fontSize: 11,
    color: 'var(--color-warning)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-sm)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    color: 'var(--color-text-muted)',
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
  infoSection: {
    padding: '12px',
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
    lineHeight: 1.5,
  },
}
