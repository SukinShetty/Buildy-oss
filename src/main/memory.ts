// memory.ts — main process
// Local JSON persistence for project memory and app settings.
// Stored in the Electron userData directory so it survives app updates.
//
// On Windows: C:\Users\<user>\AppData\Roaming\Buildy\
// On macOS:   ~/Library/Application Support/Buildy/

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { ProjectMemory, AppSettings, Goal } from '../renderer/src/types'
import { emptyProjectMemory, defaultSettings } from '../renderer/src/types'

const userDataDirectory = app.getPath('userData')
const projectMemoryFilePath = join(userDataDirectory, 'project-memory.json')
const settingsFilePath = join(userDataDirectory, 'settings.json')

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

export async function loadSettings(): Promise<AppSettings> {
  try {
    const fileContent = await fs.readFile(settingsFilePath, 'utf-8')
    const raw = JSON.parse(fileContent) as Record<string, unknown>
    return migrateSettings(raw)
  } catch {
    return defaultSettings()
  }
}

/**
 * Migrate settings from older versions.
 * v1 had: { anthropicApiKey, proxyUrl, useProxy, autoAnalysisIntervalSeconds }
 * v2 has: { provider, modelId, apiKey, baseUrl, useProxy, proxyUrl, autoAnalysisIntervalSeconds }
 */
function migrateSettings(raw: Record<string, unknown>): AppSettings {
  const defaults = defaultSettings()

  // v1 → v2: anthropicApiKey was renamed to apiKey, provider/modelId were added
  if ('anthropicApiKey' in raw && !('provider' in raw)) {
    return {
      provider: 'anthropic',
      modelId: 'claude-opus-4-7',
      apiKey: String(raw.anthropicApiKey ?? ''),
      baseUrl: '',
      useProxy: Boolean(raw.useProxy ?? false),
      proxyUrl: String(raw.proxyUrl ?? ''),
      autoAnalysisIntervalSeconds: Number(raw.autoAnalysisIntervalSeconds ?? 30),
      elevenLabsApiKey: '',
      elevenLabsVoiceId: defaults.elevenLabsVoiceId,
    }
  }

  // Already v2+ shape — fill in any missing fields with defaults
  return {
    provider: (raw.provider as AppSettings['provider']) ?? defaults.provider,
    modelId: String(raw.modelId ?? defaults.modelId),
    apiKey: String(raw.apiKey ?? ''),
    baseUrl: String(raw.baseUrl ?? ''),
    useProxy: Boolean(raw.useProxy ?? false),
    proxyUrl: String(raw.proxyUrl ?? ''),
    autoAnalysisIntervalSeconds: Number(raw.autoAnalysisIntervalSeconds ?? 30),
    elevenLabsApiKey: String(raw.elevenLabsApiKey ?? ''),
    elevenLabsVoiceId: String(raw.elevenLabsVoiceId ?? defaults.elevenLabsVoiceId),
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await ensureUserDataDirectoryExists()
  await fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureUserDataDirectoryExists(): Promise<void> {
  try {
    await fs.mkdir(userDataDirectory, { recursive: true })
  } catch {
    // Already exists — fine
  }
}
