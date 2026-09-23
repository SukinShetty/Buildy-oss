// projects-core.ts — main process (ELECTRON-FREE, unit-tested)
// Pure building blocks for project-scoped memory:
//   - one ProjectRecord per project, persisted in userData/projects.json along
//     with the active project id (A1)
//   - every memory store namespaced by project id under
//     userData/buildy-memory/<projectId> (A2)
//   - a one-time, idempotent migration of legacy un-namespaced memory into an
//     inactive "Previous sessions" project — data is COPIED, never deleted (A3)
//   - goal-derived project naming ("TaskFlow app …" → "TaskFlow", else "My project")
//
// This module never imports Electron: the userData directory is always passed
// in, so everything here is unit-testable with plain temp dirs (same pattern as
// prompt-sender-core.ts).

import {
  mkdirSync, readFileSync, writeFileSync, existsSync, cpSync, copyFileSync,
} from 'fs'
import { join, dirname } from 'path'
import { randomUUID } from 'crypto'
import type { ProjectRecord, Goal } from '../renderer/src/types'
import { emptyProjectMemory } from '../renderer/src/types'

export const DEFAULT_PROJECT_NAME = 'My project'
export const PREVIOUS_SESSIONS_NAME = 'Previous sessions'

/** On-disk shape of userData/projects.json. Its `migratedAt` field doubles as
 *  the migration marker: once the file exists, migration never runs again. */
export interface ProjectsFile {
  projects: ProjectRecord[]
  activeProjectId: string
  migratedAt: string
}

/** Injectable id/clock so tests are deterministic. */
export interface MigrationDeps {
  newId: () => string
  now: () => string
}

const defaultDeps: MigrationDeps = {
  newId: () => randomUUID(),
  now: () => new Date().toISOString(),
}

// ─── Paths ────────────────────────────────────────────────────────────────────

export function projectsFilePath(userDataDir: string): string {
  return join(userDataDir, 'projects.json')
}

/** Per-project store root. The Nemp bridge points here (it writes `.nemp/`
 *  inside), and the project's own project-memory.json lives here too. */
export function projectStoreDir(userDataDir: string, projectId: string): string {
  return join(userDataDir, 'buildy-memory', projectId)
}

export function projectMemoryFilePath(userDataDir: string, projectId: string): string {
  return join(projectStoreDir(userDataDir, projectId), 'project-memory.json')
}

/** Legacy (pre-project-scoping) locations — read-only after migration. */
export function legacyNempStoreDir(userDataDir: string): string {
  return join(userDataDir, 'buildy-memory', 'default')
}

export function legacyProjectMemoryFilePath(userDataDir: string): string {
  return join(userDataDir, 'project-memory.json')
}

// ─── Goal-derived naming ──────────────────────────────────────────────────────

// Words that follow a product name ("TaskFlow app", "Recipe Box website").
const TYPE_KEYWORDS = new Set([
  'app', 'apps', 'application', 'website', 'webapp', 'site', 'tool', 'platform',
  'product', 'dashboard', 'saas', 'crm', 'bot', 'game', 'service', 'store', 'api',
])

// Verbs that can follow a product name ("TaskFlow builds …" is still a name).
const BUILD_VERBS = new Set([
  'build', 'builds', 'building', 'create', 'creates', 'creating', 'make', 'makes',
  'making', 'develop', 'develops', 'developing', 'design', 'designs', 'designing',
])

// Capitalized words that start ordinary sentences, not product names.
const SENTENCE_STARTERS = new Set([
  'i', 'we', 'a', 'an', 'the', 'my', 'our', 'this', 'it', 'its', 'to', 'for',
  'build', 'building', 'create', 'creating', 'make', 'making', 'develop',
  'developing', 'design', 'designing', 'launch', 'launching', 'write', 'writing',
  'help', 'want', 'need', 'please', 'add', 'fix', 'ship', 'start', 'get', 'let',
])

/**
 * Derive a project name from goal text: a QUOTED leading name, or capitalized
 * leading word(s) immediately followed by an app/site keyword or build verb.
 * Ordinary sentences ("I want to build …") fall back to "My project".
 */
export function deriveProjectNameFromGoal(goalText: string): string {
  const text = (goalText || '').trim()
  if (!text) return DEFAULT_PROJECT_NAME

  // Quoted leading name: "Project A" website … / 'Acme' app …
  const quoted = text.match(/^["'“‘]([^"'”’]{1,60})["'”’]/)
  if (quoted && quoted[1].trim()) return quoted[1].trim()

  // Capitalized leading word(s) followed by a type keyword or build verb.
  const words = text.split(/\s+/)
  const isCapitalized = (w: string): boolean => /^[A-Z][A-Za-z0-9'&.-]*$/.test(w)

  if (!isCapitalized(words[0]) || SENTENCE_STARTERS.has(words[0].toLowerCase())) {
    return DEFAULT_PROJECT_NAME
  }

  const nameWords: string[] = []
  let i = 0
  while (i < words.length && i < 4 && isCapitalized(words[i])) {
    nameWords.push(words[i])
    i++
  }
  const next = (words[i] || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (nameWords.length > 0 && (TYPE_KEYWORDS.has(next) || BUILD_VERBS.has(next))) {
    return nameWords.join(' ')
  }
  return DEFAULT_PROJECT_NAME
}

// ─── projects.json I/O ────────────────────────────────────────────────────────

export function loadProjectsFile(userDataDir: string): ProjectsFile | null {
  try {
    const raw = JSON.parse(readFileSync(projectsFilePath(userDataDir), 'utf-8')) as ProjectsFile
    if (!Array.isArray(raw.projects) || typeof raw.activeProjectId !== 'string') return null
    return raw
  } catch {
    return null
  }
}

export function saveProjectsFile(userDataDir: string, file: ProjectsFile): void {
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(projectsFilePath(userDataDir), JSON.stringify(file, null, 2), 'utf-8')
}

// ─── Per-project store reads ──────────────────────────────────────────────────

interface StoredMemory { tags?: unknown }

/** Number of completed features recorded in a project's Nemp store (for the
 *  project switcher). Reads the store file directly — works for INACTIVE
 *  projects without re-pointing the Nemp bridge. */
export function readCompletionCount(userDataDir: string, projectId: string): number {
  try {
    const memoriesPath = join(projectStoreDir(userDataDir, projectId), '.nemp', 'memories.json')
    const memories = JSON.parse(readFileSync(memoriesPath, 'utf-8')) as StoredMemory[]
    if (!Array.isArray(memories)) return 0
    return memories.filter((m) => Array.isArray(m.tags) && (m.tags as unknown[]).includes('completion')).length
  } catch {
    return 0
  }
}

// ─── Migration (A3) ───────────────────────────────────────────────────────────

function readLegacyGoal(userDataDir: string): Goal | null {
  try {
    const raw = JSON.parse(readFileSync(legacyProjectMemoryFilePath(userDataDir), 'utf-8'))
    const goal = raw?.goal
    return goal && typeof goal.purpose === 'string' ? (goal as Goal) : null
  } catch {
    return null
  }
}

/**
 * One-time initialisation + legacy migration. Idempotent: if projects.json
 * already exists this is a pure read. Legacy data is COPIED into an inactive
 * "Previous sessions" project — the originals are never deleted — and a NEW
 * active project (empty memory, goal carried over) is created, named from the
 * goal text when possible.
 */
export function ensureProjectsInitialized(
  userDataDir: string,
  deps: MigrationDeps = defaultDeps
): ProjectsFile {
  const existing = loadProjectsFile(userDataDir)
  if (existing) return existing // marker: migration already ran (or fresh file exists)

  const now = deps.now()
  const projects: ProjectRecord[] = []

  const legacyNempDir = legacyNempStoreDir(userDataDir)
  const legacyPmPath = legacyProjectMemoryFilePath(userDataDir)
  const hasLegacyNemp = existsSync(join(legacyNempDir, '.nemp'))
  const hasLegacyPm = existsSync(legacyPmPath)
  const legacyGoal = readLegacyGoal(userDataDir)

  if (hasLegacyNemp || hasLegacyPm) {
    const prev: ProjectRecord = {
      id: deps.newId(),
      name: PREVIOUS_SESSIONS_NAME,
      goalText: legacyGoal?.purpose ?? '',
      createdAt: now,
      lastActiveAt: now,
    }
    const prevDir = projectStoreDir(userDataDir, prev.id)
    mkdirSync(prevDir, { recursive: true })
    if (hasLegacyNemp) {
      // COPY (not move) the whole legacy store, .nemp/ included.
      cpSync(legacyNempDir, prevDir, { recursive: true })
    }
    if (hasLegacyPm) {
      copyFileSync(legacyPmPath, projectMemoryFilePath(userDataDir, prev.id))
    }
    projects.push(prev)
  }

  // The active project starts with EMPTY memory; the goal (if any) carries over.
  const active: ProjectRecord = {
    id: deps.newId(),
    name: legacyGoal?.purpose ? deriveProjectNameFromGoal(legacyGoal.purpose) : DEFAULT_PROJECT_NAME,
    goalText: legacyGoal?.purpose ?? '',
    createdAt: now,
    lastActiveAt: now,
  }
  mkdirSync(projectStoreDir(userDataDir, active.id), { recursive: true })
  if (legacyGoal) {
    const pm = { ...emptyProjectMemory(), goal: legacyGoal, goalPromptSeen: true }
    writeProjectMemoryFile(userDataDir, active.id, pm)
  }
  projects.push(active)

  const file: ProjectsFile = { projects, activeProjectId: active.id, migratedAt: now }
  saveProjectsFile(userDataDir, file)
  return file
}

function writeProjectMemoryFile(userDataDir: string, projectId: string, pm: unknown): void {
  const filePath = projectMemoryFilePath(userDataDir, projectId)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(pm, null, 2), 'utf-8')
}

// ─── Project record CRUD ──────────────────────────────────────────────────────

function requireFile(userDataDir: string): ProjectsFile {
  const file = loadProjectsFile(userDataDir)
  if (!file) throw new Error('projects.json missing — call ensureProjectsInitialized first')
  return file
}

/** Create a new project (named explicitly or from its goal text) and make it active. */
export function createProject(
  userDataDir: string,
  input: { name?: string; goalText?: string },
  deps: MigrationDeps = defaultDeps
): { file: ProjectsFile; project: ProjectRecord } {
  const file = requireFile(userDataDir)
  const now = deps.now()
  const goalText = (input.goalText ?? '').trim()
  const project: ProjectRecord = {
    id: deps.newId(),
    name: (input.name ?? '').trim() || deriveProjectNameFromGoal(goalText),
    goalText,
    createdAt: now,
    lastActiveAt: now,
  }
  mkdirSync(projectStoreDir(userDataDir, project.id), { recursive: true })
  const updated: ProjectsFile = {
    ...file,
    projects: [...file.projects, project],
    activeProjectId: project.id,
  }
  saveProjectsFile(userDataDir, updated)
  return { file: updated, project }
}

export function renameProjectRecord(
  userDataDir: string,
  projectId: string,
  newName: string
): ProjectsFile {
  const file = requireFile(userDataDir)
  const name = newName.trim()
  const updated: ProjectsFile = {
    ...file,
    projects: file.projects.map((p) => (p.id === projectId && name ? { ...p, name } : p)),
  }
  saveProjectsFile(userDataDir, updated)
  return updated
}

export function setActiveProjectRecord(
  userDataDir: string,
  projectId: string,
  deps: MigrationDeps = defaultDeps
): ProjectsFile {
  const file = requireFile(userDataDir)
  if (!file.projects.some((p) => p.id === projectId)) return file // unknown id — no-op
  const now = deps.now()
  const updated: ProjectsFile = {
    ...file,
    activeProjectId: projectId,
    projects: file.projects.map((p) => (p.id === projectId ? { ...p, lastActiveAt: now } : p)),
  }
  saveProjectsFile(userDataDir, updated)
  return updated
}

/**
 * PURE: reflect a saved goal onto the active project record. Updates goalText;
 * additionally derives a name ONLY for an untouched project (still default-named
 * with no goal yet). Editing the goal of an established project NEVER renames it
 * — and never creates a new project or wipes memory (A4).
 */
export function applyGoalSaved(file: ProjectsFile, goalText: string): ProjectsFile {
  const text = (goalText || '').trim()
  return {
    ...file,
    projects: file.projects.map((p) => {
      if (p.id !== file.activeProjectId) return p
      const shouldDeriveName = p.name === DEFAULT_PROJECT_NAME && !p.goalText.trim()
      return {
        ...p,
        goalText: text,
        name: shouldDeriveName ? deriveProjectNameFromGoal(text) : p.name,
      }
    }),
  }
}

/** Load-modify-save wrapper around applyGoalSaved for the active project. */
export function updateActiveProjectGoal(userDataDir: string, goalText: string): ProjectsFile {
  const updated = applyGoalSaved(requireFile(userDataDir), goalText)
  saveProjectsFile(userDataDir, updated)
  return updated
}
