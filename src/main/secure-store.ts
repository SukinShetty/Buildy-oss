// secure-store.ts — main process ONLY
// Encrypted storage for API keys and other secrets, backed by Electron safeStorage
// (OS-level encryption: DPAPI on Windows, Keychain on macOS, libsecret on Linux).
//
// SECURITY MODEL:
//   - Secrets are NEVER persisted in plaintext settings JSON.
//   - Secrets NEVER cross the IPC boundary to the renderer (only `has*` booleans do).
//   - The main process reads a secret only at the moment it makes an API call.
//   - The user can SET a secret once (one-way renderer→main); it is encrypted at rest
//     and never read back to the renderer.
//
// On first run we migrate any pre-existing plaintext keys out of settings.json into
// this encrypted store, then strip them from the plaintext file.

import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import type { ProviderType, SecretName } from '../renderer/src/types'

export type { SecretName }

export const SECRET_NAMES: SecretName[] = [
  'anthropicApiKey',
  'openaiApiKey',
  'geminiApiKey',
  'openrouterApiKey',
  'customApiKey',
  'elevenLabsApiKey',
]

/** Which encrypted secret holds the API key for a given provider (local providers have none). */
export function secretKeyForProvider(provider: ProviderType): SecretName | null {
  switch (provider) {
    case 'anthropic': return 'anthropicApiKey'
    case 'openai': return 'openaiApiKey'
    case 'gemini': return 'geminiApiKey'
    case 'openrouter': return 'openrouterApiKey'
    case 'custom': return 'customApiKey'
    default: return null // ollama / lmstudio — no key
  }
}

type SecretMap = Partial<Record<string, string>>

let cache: SecretMap | null = null

function filePath(): string {
  return join(app.getPath('userData'), 'secrets.enc')
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function load(): SecretMap {
  if (cache) return cache
  try {
    const raw = fs.readFileSync(filePath())
    let json: string
    if (encryptionAvailable()) {
      json = safeStorage.decryptString(raw)
    } else {
      // Fallback path (rare): the file was written unencrypted.
      json = raw.toString('utf8')
    }
    cache = JSON.parse(json) as SecretMap
  } catch {
    cache = {}
  }
  return cache
}

function persist(map: SecretMap): void {
  cache = map
  const json = JSON.stringify(map)
  if (encryptionAvailable()) {
    fs.writeFileSync(filePath(), safeStorage.encryptString(json))
  } else {
    console.warn(
      '[SecureStore] OS encryption is unavailable — storing secrets WITHOUT encryption (fallback). ' +
      'On Linux, install a keyring (e.g. gnome-keyring) for encrypted storage.'
    )
    fs.writeFileSync(filePath(), Buffer.from(json, 'utf8'))
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function getSecret(key: SecretName): string {
  return load()[key] ?? ''
}

export function setSecret(key: SecretName, value: string): void {
  const map = load()
  if (value && value.trim()) {
    map[key] = value.trim()
  } else {
    delete map[key]
  }
  persist(map)
  // NOTE: never log the value.
  console.log(`[SecureStore] secret ${value && value.trim() ? 'set' : 'cleared'}: ${key}`)
}

export function hasSecret(key: SecretName): boolean {
  return !!load()[key]
}

export function deleteSecret(key: SecretName): void {
  setSecret(key, '')
}

/** Redacted view: which secrets exist, never the values. Safe to expose. */
export function getAllRedacted(): Record<SecretName, boolean> {
  const map = load()
  return Object.fromEntries(SECRET_NAMES.map((k) => [k, !!map[k]])) as Record<SecretName, boolean>
}

/**
 * One-time migration: move any plaintext keys from the legacy settings JSON into the
 * encrypted store and strip them from the plaintext file. Idempotent.
 */
export function migratePlaintextSecrets(settingsFilePath: string): void {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8')) as Record<string, unknown>
  } catch {
    return // no settings file yet — nothing to migrate
  }

  const map = load()
  let migrated = 0

  // Legacy settings used a single `apiKey` for the active provider.
  const legacyApiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : ''
  const legacyProvider = (typeof raw.provider === 'string' ? raw.provider : 'anthropic') as ProviderType
  const providerSecret = secretKeyForProvider(legacyProvider)
  if (legacyApiKey && providerSecret && !map[providerSecret]) {
    map[providerSecret] = legacyApiKey
    migrated++
  }

  const legacyEleven = typeof raw.elevenLabsApiKey === 'string' ? raw.elevenLabsApiKey.trim() : ''
  if (legacyEleven && !map.elevenLabsApiKey) {
    map.elevenLabsApiKey = legacyEleven
    migrated++
  }

  // Strip secret + removed (proxy) fields from the plaintext settings file regardless.
  const hadSecretFields =
    'apiKey' in raw || 'elevenLabsApiKey' in raw || 'useProxy' in raw || 'proxyUrl' in raw
  if (migrated > 0) persist(map)
  if (hadSecretFields) {
    delete raw.apiKey
    delete raw.elevenLabsApiKey
    delete raw.useProxy
    delete raw.proxyUrl
    try {
      fs.writeFileSync(settingsFilePath, JSON.stringify(raw, null, 2), 'utf8')
    } catch (e) {
      console.warn('[SecureStore] could not rewrite settings file after migration:', e)
    }
  }

  if (migrated > 0) {
    console.log(`[SecureStore] migrated ${migrated} plaintext key${migrated === 1 ? '' : 's'} to encrypted storage`)
  }
}
