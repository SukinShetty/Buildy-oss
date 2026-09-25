// projects.ts — main process
// Electron-side owner of project-scoped memory. Thin wrapper over the pure
// logic in projects-core.ts (naming / migration / projects.json CRUD), plus the
// side-effects a project switch requires:
//   - STOP any active watch first (see stopWatchForProjectSwitch — an old
//     window's session must never write into the new project's store)
//   - point memory.ts at the project's store dir (project-memory.json + goal)
//   - re-init the Nemp bridge on userData/mybuildy-memory/<projectId>
//   - reset the Verifier's pending outcomes to the project's namespace
// The ACTIVE project is the only one any analysis context ever reads.

import { app } from 'electron'
import type { DeleteProjectResult, ProjectRecord, ProjectSummary } from '../renderer/src/types'
import * as core from './projects-core'
import { init as initNemp } from './nemp-bridge'
import { setVerifierProject } from './verifier'
import { setActiveMemoryDir } from './memory'
import { stopWatchForProjectSwitch, isWatching } from './analysis-loop'
import { logWatchEvent } from './watch-log'

let projectsFile: core.ProjectsFile | null = null

function userDataDir(): string {
  return app.getPath('userData')
}

function currentFile(): core.ProjectsFile | null {
  return projectsFile ?? core.loadProjectsFile(userDataDir())
}

/** Point every memory subsystem at `project`. The store dir is resolved HERE
 *  (projects-core.projectStoreDir) and handed to the Nemp bridge so there is
 *  exactly one path derivation for stores, migration, and feature counts. */
async function activate(project: ProjectRecord): Promise<void> {
  const storeDir = core.projectStoreDir(userDataDir(), project.id)
  setActiveMemoryDir(storeDir)
  setVerifierProject(project.id)
  await initNemp(project.id, storeDir)
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
  // Stop the watch BEFORE re-pointing memory: the analysis loop's session token
  // is not bumped by a project switch, so an old-window cycle would otherwise
  // write into the new project's store.
  stopWatchForProjectSwitch()
  const { file, project } = core.createProject(userDataDir(), input)
  projectsFile = file
  await activate(project)
  console.log(`[Projects] created + switched to "${project.name}" (${project.id})`)
  return project
}

/** Switch the active project (memory, goal, Nemp store, verifier all follow). */
export async function switchProject(projectId: string): Promise<ProjectRecord> {
  const file = currentFile()
  if (!file || !file.projects.some((p) => p.id === projectId)) {
    throw new Error('Unknown project id') // validate BEFORE stopping the watch
  }
  // Stop the watch BEFORE re-pointing memory (see createProjectAndSwitch).
  stopWatchForProjectSwitch()
  projectsFile = core.setActiveProjectRecord(userDataDir(), projectId)
  const active = getActiveProject()
  if (!active || active.id !== projectId) throw new Error('Unknown project id')
  await activate(active)
  console.log(`[Projects] switched to "${active.name}" (${active.id})`)
  return active
}

/**
 * Delete a project: its record in projects.json and its memory folder
 * (userData/mybuildy-memory/<projectId>) — nothing of any other project.
 * Refused for an unknown id, the last remaining project, and the project being
 * watched. Deleting the active project first switches to another one (the
 * normal switch path), so no memory write can land in a folder being removed.
 */
export async function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  const file = currentFile()
  if (!file) return { deleted: false, reason: 'unknown' }
  const plan = core.planProjectDeletion(file, projectId, isWatching())
  const record = file.projects.find((p) => p.id === projectId)
  if (!plan.ok) {
    logWatchEvent('project-delete-refused', { project: projectId, reason: plan.reason })
    return { deleted: false, reason: plan.reason }
  }
  if (plan.nextActiveId) await switchProject(plan.nextActiveId)
  projectsFile = core.removeProjectRecord(userDataDir(), projectId)
  core.deleteProjectStore(userDataDir(), projectId)
  const active = projectsFile.activeProjectId
  // Ids only; the project's name (user content) only in debug mode.
  logWatchEvent('project-deleted', { project: projectId, wasActive: plan.wasActive, active }, { name: record?.name ?? '' })
  console.log(`[Projects] deleted project ${projectId}${plan.wasActive ? ` — switched to ${active}` : ''}`)
  return { deleted: true, activeProjectId: active, switched: plan.wasActive }
}

/** Rename a project. Renaming never touches its memory. */
export function renameProject(projectId: string, name: string): ProjectRecord {
  projectsFile = core.renameProjectRecord(userDataDir(), projectId, name)
  const record = projectsFile.projects.find((p) => p.id === projectId)
  if (!record) throw new Error('Unknown project id')
  return record
}

/**
 * Called when a goal save finishes: keep THAT project's record in sync (and
 * auto-name a brand-new default-named project from its first goal). `projectId`
 * is captured when the save started, so a save that finishes after a switch
 * never touches the newly active project. Editing the goal NEVER creates a
 * project or wipes memory.
 */
export function noteGoalSaved(projectId: string, goalText: string): void {
  try {
    projectsFile = core.updateProjectGoal(userDataDir(), projectId, goalText)
  } catch (error) {
    console.warn('[Projects] could not sync goal text onto project record:', error)
  }
}
