// memory.ts — main process
// Local JSON persistence for project memory and app settings.
// Stored in the Electron userData directory so it survives app updates.
//
// On Windows: C:\Users\<user>\AppData\Roaming\Buildy\
// On macOS:   ~/Library/Application Support/Buildy/

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import type {
  ProjectMemory,
  AppSettings,
  NonSecretSettings,
  RedactedSettings,
  Goal,
} from '../renderer/src/types'
import {
  emptyProjectMemory, defaultNonSecretSettings,
  HOURLY_CALL_CAP_MIN, HOURLY_CALL_CAP_MAX,
} from '../renderer/src/types'
import { getSecret, hasSecret, secretKeyForProvider, getAllRedacted } from './secure-store'

const userDataDirectory = app.getPath('userData')
export const settingsFilePath = join(userDataDirectory, 'settings.json')

// ─── Project memory ───────────────────────────────────────────────────────────
// Project memory (and the goal stored on it) is NAMESPACED PER PROJECT: after
// projects.ts activates a project, reads/writes go to that project's store dir
// (userData/buildy-memory/<projectId>/project-memory.json). The legacy
// un-namespaced userData/project-memory.json is only used as a fallback before
// initialisation and is never written to after migration.

let activeMemoryDirectory: string | null = null

/** Point project-memory persistence at the ACTIVE project's store directory.
 *  Called by projects.ts on startup and on every project switch. */
export function setActiveMemoryDir(directory: string): void {
  activeMemoryDirectory = directory
}

function projectMemoryFilePath(): string {
  return activeMemoryDirectory
    ? join(activeMemoryDirectory, 'project-memory.json')
    : join(userDataDirectory, 'project-memory.json') // pre-init legacy fallback
}

export async function loadProjectMemory(): Promise<ProjectMemory> {
  try {
    const fileContent = await fs.readFile(projectMemoryFilePath(), 'utf-8')
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
  const filePath = projectMemoryFilePath()
  await fs.mkdir(dirname(filePath), { recursive: true })
  const updatedMemory: ProjectMemory = {
    ...projectMemory,
    updatedAt: new Date().toISOString(),
  }
  await fs.writeFile(filePath, JSON.stringify(updatedMemory, null, 2), 'utf-8')
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
    const rawCap = Number(raw.hourlyCallCap ?? d.hourlyCallCap)
    const hourlyCallCap = Number.isFinite(rawCap)
      ? Math.min(HOURLY_CALL_CAP_MAX, Math.max(HOURLY_CALL_CAP_MIN, Math.round(rawCap)))
      : d.hourlyCallCap
    return {
      provider: (raw.provider as NonSecretSettings['provider']) ?? d.provider,
      modelId: String(raw.modelId ?? d.modelId),
      baseUrl: String(raw.baseUrl ?? ''),
      autoAnalysisIntervalSeconds: Number(raw.autoAnalysisIntervalSeconds ?? d.autoAnalysisIntervalSeconds),
      elevenLabsVoiceId: String(raw.elevenLabsVoiceId ?? d.elevenLabsVoiceId),
      hourlyCallCap,
      captureNoticeAccepted: raw.captureNoticeAccepted === true,
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
  // captureNoticeAccepted is STICKY-TRUE: once the user has accepted the
  // one-time disclosure, a stale settings save from another window can't
  // silently reset it. Only "Delete all Buildy data" clears it (fresh file).
  const onDisk = await loadNonSecretSettings()
  const clean: NonSecretSettings = {
    provider: s.provider,
    modelId: s.modelId,
    baseUrl: s.baseUrl,
    autoAnalysisIntervalSeconds: s.autoAnalysisIntervalSeconds,
    elevenLabsVoiceId: s.elevenLabsVoiceId,
    hourlyCallCap: s.hourlyCallCap,
    captureNoticeAccepted: s.captureNoticeAccepted || onDisk.captureNoticeAccepted,
  }
  await fs.writeFile(settingsFilePath, JSON.stringify(clean, null, 2), 'utf-8')
}

// ─── Delete all Buildy data (Settings → restart to first run) ─────────────────
// Deletes ONLY Buildy's own files inside its userData directory: encrypted
// keys, settings, project records, every project's memory (buildy-memory/*,
// including each project's Nemp store), the legacy un-namespaced memory file,
// and the vision-check approvals. Nothing outside userData is ever touched.
// The caller relaunches the app afterwards (first-run experience).
export async function deleteAllBuildyData(): Promise<void> {
  const targets = [
    'secrets.enc',           // encrypted API keys
    'settings.json',         // non-secret settings (incl. captureNoticeAccepted)
    'projects.json',         // project records + active project id
    'project-memory.json',   // legacy un-namespaced project memory
    'vision-approvals.json', // vision-check passes (keyed to key fingerprints)
    'buildy-memory',         // every project's memory + Nemp stores (recursive)
  ]
  const failed: string[] = []
  for (const name of targets) {
    const target = join(userDataDirectory, name)
    try {
      // maxRetries: Windows can transiently lock files (AV scans, open handles).
      await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    } catch (error) {
      console.warn(`[DataWipe] could not delete ${name}:`, error)
      failed.push(name)
    }
  }
  if (failed.length > 0) {
    // Rethrow so the caller does NOT relaunch as "fresh" after a partial wipe —
    // the Settings UI surfaces this instead of pretending everything is gone.
    throw new Error(
      `Could not delete: ${failed.join(', ')}. Close other programs using these files and try again.`
    )
  }
  console.log('[DataWipe] Buildy data deleted (keys, settings, all project memory)')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUserDataDirectoryExists(): Promise<void> {
  try {
    await fs.mkdir(userDataDirectory, { recursive: true })
  } catch {
    // Already exists — fine
  }
}
