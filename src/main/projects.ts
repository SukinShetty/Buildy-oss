// projects.ts — main process
// Electron-side owner of project-scoped memory. Thin wrapper over the pure
// logic in projects-core.ts (naming / migration / projects.json CRUD), plus the
// side-effects a project switch requires:
//   - point memory.ts at the project's store dir (project-memory.json + goal)
//   - re-init the Nemp bridge on userData/buildy-memory/<projectId>
//   - reset the Verifier's pending outcomes to the project's namespace
// The ACTIVE project is the only one any analysis context ever reads.

import { app } from 'electron'
import type { ProjectRecord, ProjectSummary } from '../renderer/src/types'
import * as core from './projects-core'
import { init as initNemp } from './nemp-bridge'
import { setVerifierProject } from './verifier'
import { setActiveMemoryDir } from './memory'

let projectsFile: core.ProjectsFile | null = null

function userDataDir(): string {
  return app.getPath('userData')
}

function currentFile(): core.ProjectsFile | null {
  return projectsFile ?? core.loadProjectsFile(userDataDir())
}

/** Point every memory subsystem at `project`. */
async function activate(project: ProjectRecord): Promise<void> {
  setActiveMemoryDir(core.projectStoreDir(userDataDir(), project.id))
  setVerifierProject(project.id)
  await initNemp(project.id)
}

/**
 * Startup entry point: run the one-time legacy migration if needed (idempotent,
 * copies — never deletes), then activate the persisted active project.
 */
export async function initProjects(): Promise<ProjectRecord> {
  projectsFile = core.ensureProjectsInitialized(userDataDir())
  const active = getActiveProject()
  if (!active) throw new Error('[Projects] no active project after initialisation')
  await activate(active)
  console.log(`[Projects] active project "${active.name}" (${active.id})`)
  return active
}

export function getActiveProject(): ProjectRecord | null {
  const file = currentFile()
  if (!file) return null
  return file.projects.find((p) => p.id === file.activeProjectId) ?? null
}

/** All projects with their per-project completed-feature counts (switcher UI). */
export function listProjectSummaries(): ProjectSummary[] {
  const file = currentFile()
  if (!file) return []
  return file.projects.map((p) => ({
    ...p,
    featureCount: core.readCompletionCount(userDataDir(), p.id),
  }))
}

/** Create a new (empty-memory) project and make it active. */
export async function createProjectAndSwitch(
  input: { name?: string; goalText?: string }
): Promise<ProjectRecord> {
  const { file, project } = core.createProject(userDataDir(), input)
  projectsFile = file
  await activate(project)
  console.log(`[Projects] created + switched to "${project.name}" (${project.id})`)
  return project
}

/** Switch the active project (memory, goal, Nemp store, verifier all follow). */
export async function switchProject(projectId: string): Promise<ProjectRecord> {
  projectsFile = core.setActiveProjectRecord(userDataDir(), projectId)
  const active = getActiveProject()
  if (!active || active.id !== projectId) throw new Error('Unknown project id')
  await activate(active)
  console.log(`[Projects] switched to "${active.name}" (${active.id})`)
  return active
}

/** Rename a project. Renaming never touches its memory. */
export function renameProject(projectId: string, name: string): ProjectRecord {
  projectsFile = core.renameProjectRecord(userDataDir(), projectId, name)
  const record = projectsFile.projects.find((p) => p.id === projectId)
  if (!record) throw new Error('Unknown project id')
  return record
}

/**
 * Called when the goal is saved: keep the active record's goalText in sync
 * (and auto-name a brand-new default-named project from its first goal).
 * Editing the goal NEVER creates a project or wipes memory.
 */
export function noteGoalSaved(goalText: string): void {
  try {
    projectsFile = core.updateActiveProjectGoal(userDataDir(), goalText)
  } catch (error) {
    console.warn('[Projects] could not sync goal text onto project record:', error)
  }
}
