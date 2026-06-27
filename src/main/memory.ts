// memory.ts — main process
// Local JSON persistence for project memory and app settings.
// Stored in the Electron userData directory so it survives app updates.
//
// On Windows: C:\Users\<user>\AppData\Roaming\Buildy\
// On macOS:   ~/Library/Application Support/Buildy/

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  ProjectMemory,
  AppSettings,
  NonSecretSettings,
  RedactedSettings,
  Goal,
} from '../renderer/src/types'
import { emptyProjectMemory, defaultNonSecretSettings } from '../renderer/src/types'
import { getSecret, hasSecret, secretKeyForProvider, getAllRedacted } from './secure-store'

const userDataDirectory = app.getPath('userData')
const projectMemoryFilePath = join(userDataDirectory, 'project-memory.json')
export const settingsFilePath = join(userDataDirectory, 'settings.json')

// ─── Project memory ───────────────────────────────────────────────────────────

export async function loadProjectMemory(): Promise<ProjectMemory> {
  try {
    const fileContent = await fs.readFile(projectMemoryFilePath, 'utf-8')
    const raw = JSON.parse(fileContent) as Partial<ProjectMemory>
    // Merge over defaults so files written by older versions gain new fields
    // (goal, goalPromptSeen) without breaking.
    return { ...emptyProjectMemory(), ...raw }
  } catch {
    // File doesn't exist yet or is corrupt — return a blank project
    return emptyProjectMemory()
  }
}

export async function saveProjectMemory(projectMemory: ProjectMemory): Promise<void> {
  await ensureUserDataDirectoryExists()
  const updatedMemory: ProjectMemory = {
    ...projectMemory,
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(
    projectMemoryFilePath,
    JSON.stringify(updatedMemory, null, 2),
    'utf-8'
  )
}

// ─── Goal ───────────────────────────────────────────────────────────────────
// The goal lives on the project memory file (same local JSON, nothing leaves the device).

export async function loadGoal(): Promise<Goal | null> {
  const project = await loadProjectMemory()
  return project.goal ?? null
}

/**
 * Create or replace the goal. Stamps createdAt + lastReviewedAt and marks the
 * goal prompt as seen so the first-launch screen won't reappear.
 */
export async function setGoal(input: Partial<Goal>): Promise<Goal> {
  const project = await loadProjectMemory()
  const now = new Date().toISOString()
  const goal: Goal = {
    purpose: (input.purpose ?? '').trim(),
    audience: input.audience?.trim() || undefined,
    mostImportant: input.mostImportant?.trim() || undefined,
    successCriteria: input.successCriteria?.trim() || undefined,
    createdAt: project.goal?.createdAt ?? now,
    lastReviewedAt: now,
  }
  await saveProjectMemory({ ...project, goal, goalPromptSeen: true })
  return goal
}

/**
 * Merge a partial update into the existing goal (e.g. bumping lastReviewedAt).
 * No-op (returns null) if no goal exists yet.
 */
export async function updateGoal(partial: Partial<Goal>): Promise<Goal | null> {
  const project = await loadProjectMemory()
  if (!project.goal) return null
  const goal: Goal = { ...project.goal, ...partial }
  await saveProjectMemory({ ...project, goal })
  return goal
}

// ─── Settings ─────────────────────────────────────────────────────────────────
// Secrets (API keys) are NOT stored here — they live encrypted in secure-store.
// settings.json holds only NON-SECRET fields. Three views:
//   - loadNonSecretSettings(): what's on disk (no secrets)
//   - loadSettings(): main-internal full settings (secrets injected) — never sent to renderer
//   - loadRedactedSettings(): what the renderer gets (non-secret + has* booleans)

/** Read the non-secret settings from disk, tolerant of old/missing fields. */
export async function loadNonSecretSettings(): Promise<NonSecretSettings> {
  const d = defaultNonSecretSettings()
  try {
    const raw = JSON.parse(await fs.readFile(settingsFilePath, 'utf-8')) as Record<string, unknown>
    return {
      provider: (raw.provider as NonSecretSettings['provider']) ?? d.provider,
      modelId: String(raw.modelId ?? d.modelId),
      baseUrl: String(raw.baseUrl ?? ''),
      autoAnalysisIntervalSeconds: Number(raw.autoAnalysisIntervalSeconds ?? d.autoAnalysisIntervalSeconds),
      elevenLabsVoiceId: String(raw.elevenLabsVoiceId ?? d.elevenLabsVoiceId),
    }
  } catch {
    return d
  }
}

/** Inject secrets from the encrypted store → main-internal full settings. */
export function resolveSettings(nonSecret: NonSecretSettings): AppSettings {
  const providerSecret = secretKeyForProvider(nonSecret.provider)
  return {
    ...nonSecret,
    apiKey: providerSecret ? getSecret(providerSecret) : '',
    elevenLabsApiKey: getSecret('elevenLabsApiKey'),
  }
}

/** Build the redacted view (booleans only) for the renderer. */
export function redactSettings(nonSecret: NonSecretSettings): RedactedSettings {
  const providerSecret = secretKeyForProvider(nonSecret.provider)
  return {
    ...nonSecret,
    hasApiKey: providerSecret ? hasSecret(providerSecret) : false,
    hasElevenLabsKey: hasSecret('elevenLabsApiKey'),
    secretFlags: getAllRedacted(),
  }
}

/** MAIN-internal: full settings with secrets injected. NEVER send this to the renderer. */
export async function loadSettings(): Promise<AppSettings> {
  return resolveSettings(await loadNonSecretSettings())
}

/** Renderer-safe redacted settings. */
export async function loadRedactedSettings(): Promise<RedactedSettings> {
  return redactSettings(await loadNonSecretSettings())
}

/** Persist ONLY non-secret fields. Any stray secret/proxy fields are dropped. */
export async function saveNonSecretSettings(s: NonSecretSettings): Promise<void> {
  await ensureUserDataDirectoryExists()
  const clean: NonSecretSettings = {
    provider: s.provider,
    modelId: s.modelId,
    baseUrl: s.baseUrl,
    autoAnalysisIntervalSeconds: s.autoAnalysisIntervalSeconds,
    elevenLabsVoiceId: s.elevenLabsVoiceId,
  }
  await fs.writeFile(settingsFilePath, JSON.stringify(clean, null, 2), 'utf-8')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUserDataDirectoryExists(): Promise<void> {
  try {
    await fs.mkdir(userDataDirectory, { recursive: true })
  } catch {
    // Already exists — fine
  }
}
