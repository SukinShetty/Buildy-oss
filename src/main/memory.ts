// memory.ts — main process
// Local JSON persistence for project memory and app settings.
// Stored in the Electron userData directory so it survives app updates.
//
// On Windows: C:\Users\<user>\AppData\Roaming\Buildy\
// On macOS:   ~/Library/Application Support/Buildy/

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { ProjectMemory, AppSettings } from '../renderer/src/types'
import { emptyProjectMemory, defaultSettings } from '../renderer/src/types'

const userDataDirectory = app.getPath('userData')
const projectMemoryFilePath = join(userDataDirectory, 'project-memory.json')
const settingsFilePath = join(userDataDirectory, 'settings.json')

// ─── Project memory ───────────────────────────────────────────────────────────

export async function loadProjectMemory(): Promise<ProjectMemory> {
  try {
    const fileContent = await fs.readFile(projectMemoryFilePath, 'utf-8')
    return JSON.parse(fileContent) as ProjectMemory
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

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function loadSettings(): Promise<AppSettings> {
  try {
    const fileContent = await fs.readFile(settingsFilePath, 'utf-8')
    return JSON.parse(fileContent) as AppSettings
  } catch {
    return defaultSettings()
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
