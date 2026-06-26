// SettingsScreen.tsx
// Multi-provider configuration screen.
// Lets the user pick a provider, model, and enter API key / base URL as needed.
// Shows vision warnings, capability badges, and connection status.

import React, { useState, useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { ProviderType } from '../types'

// ─── Provider metadata (static, matches provider-registry on main side) ──────

interface ModelOption {
  id: string
  label: string
  supportsVision: boolean
  qualityTier: 'recommended' | 'best-for-vision' | 'capable' | 'experimental'
  description?: string  // Short capability blurb shown under the model name
}

interface ProviderMeta {
  type: ProviderType
  displayName: string
  description: string
  requiresApiKey: boolean
  requiresBaseUrl: boolean
  defaultBaseUrl: string
  defaultModel: string
  models: ModelOption[]
}

const PROVIDERS: ProviderMeta[] = [
  {
    type: 'anthropic',
    displayName: 'Anthropic',
    description: 'Claude models. Best quality for screen analysis.',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-opus-4-7',
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', supportsVision: true, qualityTier: 'recommended', description: 'Latest and most capable model.' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', supportsVision: true, qualityTier: 'best-for-vision', description: '3x higher image resolution than Opus 4.6, 98.5% visual acuity — ideal for dense terminal screenshots.' },
      { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', supportsVision: true, qualityTier: 'recommended', description: 'Previous flagship. Strong all-round quality.' },
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', supportsVision: true, qualityTier: 'recommended', description: 'Fast and balanced quality for the cost.' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', supportsVision: true, qualityTier: 'capable', description: 'Fastest and most affordable.' },
    ],
  },
  {
    type: 'openai',
    displayName: 'OpenAI',
    description: 'GPT models. Strong vision and reasoning.',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', supportsVision: true, qualityTier: 'recommended' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', supportsVision: true, qualityTier: 'capable' },
      { id: 'gpt-4.1', label: 'GPT-4.1', supportsVision: true, qualityTier: 'recommended' },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', supportsVision: true, qualityTier: 'capable' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', supportsVision: true, qualityTier: 'experimental' },
      { id: 'o3', label: 'o3', supportsVision: true, qualityTier: 'recommended' },
      { id: 'o4-mini', label: 'o4 Mini', supportsVision: true, qualityTier: 'capable' },
    ],
  },
  {
    type: 'gemini',
    displayName: 'Google Gemini',
    description: 'Gemini models. Strong vision and long context.',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-pro-preview-05-06', label: 'Gemini 2.5 Pro', supportsVision: true, qualityTier: 'recommended' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', supportsVision: true, qualityTier: 'recommended' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', supportsVision: true, qualityTier: 'capable' },
    ],
  },
  {
    type: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Hundreds of models, one API. Pay per token.',
    requiresApiKey: true,
    requiresBaseUrl: false,
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    models: [
      { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', supportsVision: true, qualityTier: 'recommended' },
      { id: 'openai/gpt-4o', label: 'GPT-4o', supportsVision: true, qualityTier: 'recommended' },
      { id: 'google/gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro', supportsVision: true, qualityTier: 'recommended' },
      { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', supportsVision: true, qualityTier: 'capable' },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', supportsVision: false, qualityTier: 'capable' },
      { id: 'mistralai/mistral-large-latest', label: 'Mistral Large', supportsVision: true, qualityTier: 'capable' },
    ],
  },
  {
    type: 'ollama',
    displayName: 'Ollama',
    description: 'Local models. Free, private, no API key needed.',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    models: [
      { id: 'llama3.1', label: 'Llama 3.1 8B', supportsVision: false, qualityTier: 'capable' },
      { id: 'llama3.1:70b', label: 'Llama 3.1 70B', supportsVision: false, qualityTier: 'capable' },
      { id: 'llava', label: 'LLaVA (Vision)', supportsVision: true, qualityTier: 'experimental' },
      { id: 'llava-llama3', label: 'LLaVA Llama 3 (Vision)', supportsVision: true, qualityTier: 'experimental' },
      { id: 'gemma3', label: 'Gemma 3', supportsVision: true, qualityTier: 'experimental' },
      { id: 'mistral', label: 'Mistral 7B', supportsVision: false, qualityTier: 'experimental' },
      { id: 'deepseek-r1', label: 'DeepSeek R1', supportsVision: false, qualityTier: 'capable' },
      { id: 'qwen2.5', label: 'Qwen 2.5', supportsVision: false, qualityTier: 'capable' },
    ],
  },
  {
    type: 'lmstudio',
    displayName: 'LM Studio',
    description: 'Local models via LM Studio. Free, private.',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    models: [
      { id: 'local-model', label: 'Currently Loaded Model', supportsVision: false, qualityTier: 'experimental' },
    ],
  },
  {
    type: 'custom',
    displayName: 'Custom Endpoint',
    description: 'Any OpenAI-compatible API. Bring your own URL.',
    requiresApiKey: false,
    requiresBaseUrl: true,
    defaultBaseUrl: 'http://localhost:8080/v1',
    defaultModel: 'custom-model',
    models: [
      { id: 'custom-model', label: 'Custom Model', supportsVision: false, qualityTier: 'experimental' },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProviderMeta(type: ProviderType): ProviderMeta {
  return PROVIDERS.find((p) => p.type === type) ?? PROVIDERS[0]
}

function tierBadge(tier: string): { label: string; color: string } {
  switch (tier) {
    case 'recommended':
      return { label: 'RECOMMENDED', color: 'var(--color-success)' }
    case 'best-for-vision':
      return { label: 'BEST FOR VISION', color: 'var(--color-success)' }
    case 'capable':
      return { label: 'CAPABLE', color: 'var(--color-accent)' }
    case 'experimental':
      return { label: 'EXPERIMENTAL', color: 'var(--color-warning)' }
    default:
      return { label: tier.toUpperCase(), color: 'var(--color-text-muted)' }
  }
}

function isLocalProvider(type: ProviderType): boolean {
  return type === 'ollama' || type === 'lmstudio' || type === 'custom'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SettingsScreen(): React.ReactElement {
  const { settings, setSettings } = useAppStore()

  const [provider, setProvider] = useState<ProviderType>(settings.provider)
  const [modelId, setModelId] = useState(settings.modelId)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl)
  const [useProxy, setUseProxy] = useState(settings.useProxy)
  const [proxyUrl, setProxyUrl] = useState(settings.proxyUrl)
  const [customModelId, setCustomModelId] = useState('')
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState(settings.elevenLabsApiKey ?? '')
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState(settings.elevenLabsVoiceId ?? '21m00Tcm4TlvDq8ikWAM')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const meta = getProviderMeta(provider)
  const selectedModel = meta.models.find((m) => m.id === modelId)
  const showCustomModelInput = isLocalProvider(provider) || provider === 'openrouter'

  // Sync local state when store settings change
  useEffect(() => {
    setProvider(settings.provider)
    setModelId(settings.modelId)
    setApiKey(settings.apiKey)
    setBaseUrl(settings.baseUrl)
    setUseProxy(settings.useProxy)
    setProxyUrl(settings.proxyUrl)
    setElevenLabsApiKey(settings.elevenLabsApiKey ?? '')
    setElevenLabsVoiceId(settings.elevenLabsVoiceId ?? '21m00Tcm4TlvDq8ikWAM')
  }, [settings])

  function handleProviderChange(newProvider: ProviderType): void {
    const newMeta = getProviderMeta(newProvider)
    setProvider(newProvider)
    setModelId(newMeta.defaultModel)
    setBaseUrl(newMeta.requiresBaseUrl ? newMeta.defaultBaseUrl : '')
    setCustomModelId('')
  }

  async function handleTestConnection(): Promise<void> {
    setIsTesting(true)
    setTestResult(null)
    // Save first so the main process has the latest settings
    handleSave()
    try {
      const result = await window.buildy.testConnection({
        ...settings,
        provider,
        modelId: customModelId.trim() || modelId,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        useProxy: provider === 'anthropic' ? useProxy : false,
        proxyUrl: proxyUrl.trim(),
        elevenLabsApiKey: elevenLabsApiKey.trim(),
        elevenLabsVoiceId: elevenLabsVoiceId.trim() || '21m00Tcm4TlvDq8ikWAM',
      })
      setTestResult(result)
    } catch (error) {
      setTestResult({ success: false, message: String(error) })
    } finally {
      setIsTesting(false)
    }
  }

  function handleSave(): void {
    const finalModelId = customModelId.trim() || modelId
    const updatedSettings = {
      ...settings,
      provider,
      modelId: finalModelId,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
      useProxy: provider === 'anthropic' ? useProxy : false,
      proxyUrl: proxyUrl.trim(),
      elevenLabsApiKey: elevenLabsApiKey.trim(),
      elevenLabsVoiceId: elevenLabsVoiceId.trim() || '21m00Tcm4TlvDq8ikWAM',
    }
    setSettings(updatedSettings)
    window.buildy.saveSettings(updatedSettings)
    setSavedAt(new Date().toLocaleTimeString())
  }

  // ─── Validation ──────────────────────────────────────────────────────────

  const hasApiKey = !meta.requiresApiKey || apiKey.trim().length > 0
  const hasBaseUrl = !meta.requiresBaseUrl || baseUrl.trim().startsWith('http')
  const hasProxyIfNeeded = !useProxy || proxyUrl.trim().startsWith('http')
  const configuredCorrectly = hasApiKey && hasBaseUrl && hasProxyIfNeeded

  // Vision warning — warn when the selected model doesn't support vision,
  // or when a custom model ID is typed (vision support is unknown)
  const usingCustomModel = customModelId.trim().length > 0
  const noVision = usingCustomModel
    ? true  // unknown custom model — warn conservatively
    : selectedModel
      ? !selectedModel.supportsVision
      : true  // no model selected at all

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Settings</div>
        <div style={styles.headerSub}>Choose your AI provider and model.</div>
      </div>

      <div style={styles.content}>
        {/* Provider selector */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>AI Provider</div>
          <div style={styles.providerGrid}>
            {PROVIDERS.map((p) => (
              <button
                key={p.type}
                onClick={() => handleProviderChange(p.type)}
                style={{
                  ...styles.providerCard,
                  ...(provider === p.type ? styles.providerCardActive : styles.providerCardInactive),
                }}
              >
                <div style={styles.providerCardTitle}>{p.displayName}</div>
                <div style={styles.providerCardDesc}>{p.description}</div>
                {isLocalProvider(p.type) && (
                  <div style={styles.localBadge}>Local</div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Model selector */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Model</div>
          <div style={styles.modelList}>
            {meta.models.map((m) => {
              const badge = tierBadge(m.qualityTier)
              return (
                <button
                  key={m.id}
                  onClick={() => { setModelId(m.id); setCustomModelId('') }}
                  style={{
                    ...styles.modelRow,
                    ...(modelId === m.id && !customModelId.trim() ? styles.modelRowActive : styles.modelRowInactive),
                  }}
                >
                  <div style={styles.modelTopRow}>
                    <div style={styles.modelRowLeft}>
                      <span style={styles.modelLabel}>{m.label}</span>
                      <span style={{ ...styles.badge, borderColor: badge.color, color: badge.color }}>
                        {badge.label}
                      </span>
                      {m.supportsVision && (
                        <span style={{ ...styles.badge, borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>
                          Vision
                        </span>
                      )}
                    </div>
                    <span style={styles.modelId}>{m.id}</span>
                  </div>
                  {m.description && <div style={styles.modelDescription}>{m.description}</div>}
                </button>
              )
            })}
          </div>
          {/* Custom model ID input for local / openrouter */}
          {showCustomModelInput && (
            <div style={{ marginTop: 6 }}>
              <div style={styles.sectionHint}>
                Or type a custom model name (for models not listed above):
              </div>
              <input
                type="text"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder={provider === 'openrouter' ? 'e.g. meta-llama/llama-4-scout' : 'e.g. my-custom-model'}
                style={styles.textInput}
              />
            </div>
          )}
        </div>

        {/* Vision warning */}
        {noVision && (
          <div style={styles.warningBox}>
            <div style={styles.warningTitle}>Limited vision support</div>
            <div style={styles.warningText}>
              {usingCustomModel
                ? 'Custom model — Buildy cannot verify vision support. Screen analysis may not work. Brainstorming (text-only) will still work fine.'
                : 'This model does not support image input. Screen analysis will not work. Brainstorming (text-only) will still work fine.'}
            </div>
            <div style={styles.warningText}>
              For best screen analysis, use a model marked "Vision" + "Recommended".
            </div>
          </div>
        )}

        {/* API key input */}
        {meta.requiresApiKey && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>API Key</div>
            <div style={styles.sectionHint}>
              {provider === 'anthropic' && 'Get yours at console.anthropic.com.'}
              {provider === 'openai' && 'Get yours at platform.openai.com.'}
              {provider === 'gemini' && 'Get yours at aistudio.google.com.'}
              {provider === 'openrouter' && 'Get yours at openrouter.ai/keys.'}
            </div>
            <div style={styles.inputWrapper}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste your API key here"
                style={styles.textInput}
              />
              <button
                className="btn-icon"
                onClick={() => setShowApiKey(!showApiKey)}
                title={showApiKey ? 'Hide key' : 'Show key'}
              >
                {showApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        )}

        {/* Base URL input */}
        {meta.requiresBaseUrl && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Base URL</div>
            <div style={styles.sectionHint}>
              {provider === 'ollama' && 'Default: http://localhost:11434 — make sure Ollama is running.'}
              {provider === 'lmstudio' && 'Default: http://localhost:1234/v1 — make sure LM Studio server is running.'}
              {provider === 'custom' && 'Enter the base URL of your OpenAI-compatible API endpoint.'}
            </div>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={meta.defaultBaseUrl}
              style={styles.textInput}
            />
          </div>
        )}

        {/* Anthropic proxy mode */}
        {provider === 'anthropic' && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Proxy mode (optional)</div>
            <div style={styles.sectionHint}>
              Use a Cloudflare Worker proxy instead of sending your API key directly.
            </div>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={useProxy}
                onChange={(e) => setUseProxy(e.target.checked)}
              />
              <span style={styles.checkboxLabel}>Use proxy</span>
            </label>
            {useProxy && (
              <input
                type="url"
                value={proxyUrl}
                onChange={(e) => setProxyUrl(e.target.value)}
                placeholder="https://buildy-proxy.your-subdomain.workers.dev"
                style={styles.textInput}
              />
            )}
          </div>
        )}

        {/* ElevenLabs voice (optional) */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Voice (ElevenLabs)</div>
          <div style={styles.sectionHint}>
            Optional. Adds natural, warm voice to Buildy. Falls back to system voice if not set.
          </div>
          <input
            type="password"
            value={elevenLabsApiKey}
            onChange={(e) => setElevenLabsApiKey(e.target.value)}
            placeholder="ElevenLabs API key"
            style={styles.textInput}
          />
          <input
            type="text"
            value={elevenLabsVoiceId}
            onChange={(e) => setElevenLabsVoiceId(e.target.value)}
            placeholder="Voice ID (default: Rachel)"
            style={styles.textInput}
          />
        </div>

        {/* Status */}
        <div style={styles.section}>
          <div style={styles.statusRow}>
            <span
              style={{
                ...styles.statusDot,
                background: configuredCorrectly ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            />
            <span style={styles.statusText}>
              {configuredCorrectly
                ? `Ready — ${meta.displayName} / ${customModelId.trim() || modelId}`
                : 'Fill in the required fields above to use Buildy'}
            </span>
          </div>
        </div>

        {/* Save + Test buttons */}
        <div style={styles.saveRow}>
          <button className="btn-primary" onClick={handleSave} style={{ flex: 1, justifyContent: 'center' }}>
            Save Settings
          </button>
          <button
            className="btn-primary"
            onClick={handleTestConnection}
            disabled={isTesting || !configuredCorrectly}
            style={{ flex: 1, justifyContent: 'center', opacity: isTesting ? 0.6 : 1 }}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
        {savedAt && <span style={styles.savedAt}>Saved at {savedAt}</span>}
        {testResult && (
          <div style={{
            ...styles.statusRow,
            borderLeft: `3px solid ${testResult.success ? 'var(--color-success)' : 'var(--color-danger)'}`,
          }}>
            <span style={{
              ...styles.statusDot,
              background: testResult.success ? 'var(--color-success)' : 'var(--color-danger)',
            }} />
            <span style={styles.statusText}>{testResult.message}</span>
          </div>
        )}

        {/* Info */}
        <div style={styles.infoSection}>
          <div style={styles.infoTitle}>About Buildy</div>
          <div style={styles.infoText}>
            Buildy v2.0.0 — multi-provider builder buddy for Claude Code.
          </div>
          <div style={styles.infoText}>
            {isLocalProvider(provider)
              ? 'Using a local model — your data never leaves your machine.'
              : 'Your API key is stored locally and never leaves your device.'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  providerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: 6,
  },
  providerCard: {
    padding: '10px 12px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background 0.1s, border-color 0.1s',
    position: 'relative' as const,
  },
  providerCardActive: {
    background: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-text)',
  },
  providerCardInactive: {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  providerCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginBottom: 2,
  },
  providerCardDesc: {
    fontSize: 10,
    color: 'var(--color-text-dim)',
    lineHeight: 1.4,
  },
  localBadge: {
    position: 'absolute' as const,
    top: 6,
    right: 8,
    fontSize: 9,
    fontWeight: 600,
    color: 'var(--color-success)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  modelList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  modelRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
    padding: '7px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid transparent',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background 0.1s',
  },
  modelTopRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  modelDescription: {
    fontSize: 10.5,
    color: 'var(--color-text-muted)',
    lineHeight: 1.35,
  },
  modelRowActive: {
    background: 'var(--color-accent-muted)',
    borderColor: 'var(--color-accent)',
  },
  modelRowInactive: {
    background: 'var(--color-surface)',
    borderColor: 'var(--color-border)',
  },
  modelRowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  modelLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text)',
  },
  modelId: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--color-text-dim)',
  },
  badge: {
    fontSize: 9,
    fontWeight: 600,
    padding: '1px 5px',
    borderRadius: 3,
    border: '1px solid',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  warningBox: {
    padding: '10px 12px',
    background: 'rgba(255, 170, 0, 0.08)',
    border: '1px solid var(--color-warning)',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-warning)',
  },
  warningText: {
    fontSize: 11,
    color: 'var(--color-text-dim)',
    lineHeight: 1.4,
  },
  textInput: {
    flex: 1,
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    width: '100%',
  } as React.CSSProperties,
  inputWrapper: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: 12,
    color: 'var(--color-text)',
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
