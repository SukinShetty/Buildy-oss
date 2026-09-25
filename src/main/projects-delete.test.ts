// projects-delete.test.ts — deleting a project.
// Rules: confirmation happens in the UI (ProjectManager); main then refuses the
// last project and the project being watched, removes ONLY that project's
// record and memory folder (userData/mybuildy-memory/<id>), switches cleanly to
// another project when the active one is deleted, and logs every deletion.
// Real temp directories; Electron and the memory side-effect modules mocked.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

const h = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  return {
    userDataDir: mkdtempSync(join(tmpdir(), 'mybuildy-delete-')),
    watching: false,
    log: [] as Array<{ event: string; details: Record<string, unknown>; titles: Record<string, string> }>,
    memoryDirs: [] as string[],
  }
})

vi.mock('electron', () => ({ app: { getPath: (): string => h.userDataDir } }))
vi.mock('./analysis-loop', () => ({ stopWatchForProjectSwitch: () => {}, isWatching: () => h.watching }))
vi.mock('./nemp-bridge', () => ({ init: async () => {} }))
vi.mock('./verifier', () => ({ setVerifierProject: () => {} }))
vi.mock('./memory', () => ({ setActiveMemoryDir: (d: string) => { h.memoryDirs.push(d) } }))
vi.mock('./watch-log', () => ({
  logWatchEvent: (event: string, details: Record<string, unknown> = {}, titles: Record<string, string> = {}) => {
    h.log.push({ event, details, titles })
  },
}))

import { initProjects, createProjectAndSwitch, switchProject, deleteProject, getActiveProject, listProjectSummaries } from './projects'
import {
  projectStoreDir, planProjectDeletion, deleteProjectStore, loadProjectsFile, type ProjectsFile,
} from './projects-core'

afterAll(() => rmSync(h.userDataDir, { recursive: true, force: true }))

/** A fresh store with three projects A, B, C (C active), each with memory on disk. */
async function threeProjects(): Promise<{ a: string; b: string; c: string }> {
  rmSync(h.userDataDir, { recursive: true, force: true })
  mkdirSync(h.userDataDir, { recursive: true })
  const first = await initProjects()
  const b = (await createProjectAndSwitch({ name: 'Recipe box' })).id
  const c = (await createProjectAndSwitch({ name: 'Habit tracker' })).id
  for (const id of [first.id, b, c]) {
    mkdirSync(join(projectStoreDir(h.userDataDir, id), '.nemp'), { recursive: true })
    writeFileSync(join(projectStoreDir(h.userDataDir, id), 'project-memory.json'), JSON.stringify({ projectName: id }))
    writeFileSync(join(projectStoreDir(h.userDataDir, id), '.nemp', 'memories.json'), '[]')
  }
  return { a: first.id, b, c }
}

beforeEach(() => {
  h.watching = false
  h.log.length = 0
  h.memoryDirs.length = 0
})

describe('deleting a project', () => {
  it('removes only that project: its record and its memory folder, nothing of any other project', async () => {
    const { a, b, c } = await threeProjects()
    writeFileSync(join(h.userDataDir, 'settings.json'), '{"keep":true}')

    const result = await deleteProject(b)

    expect(result).toEqual({ deleted: true, activeProjectId: c, switched: false })
    expect(existsSync(projectStoreDir(h.userDataDir, b))).toBe(false)
    for (const id of [a, c]) {
      expect(readFileSync(join(projectStoreDir(h.userDataDir, id), 'project-memory.json'), 'utf8')).toContain(id)
      expect(existsSync(join(projectStoreDir(h.userDataDir, id), '.nemp', 'memories.json'))).toBe(true)
    }
    expect(readFileSync(join(h.userDataDir, 'settings.json'), 'utf8')).toBe('{"keep":true}')
    expect(listProjectSummaries().map((p) => p.id)).toEqual([a, c])
    expect(loadProjectsFile(h.userDataDir)!.projects.map((p) => p.id)).toEqual([a, c])
  })

  it('refuses the project being watched, and tells the caller why', async () => {
    const { c } = await threeProjects()
    h.watching = true
    expect(await deleteProject(c)).toEqual({ deleted: false, reason: 'watching' })
    expect(existsSync(projectStoreDir(h.userDataDir, c))).toBe(true)
    expect(getActiveProject()?.id).toBe(c)
  })

  it('while watching, another (not watched) project can still be deleted', async () => {
    const { a, c } = await threeProjects()
    h.watching = true
    expect(await deleteProject(a)).toMatchObject({ deleted: true, activeProjectId: c })
  })

  it('refuses the last remaining project', async () => {
    const { a, b, c } = await threeProjects()
    await deleteProject(a)
    await deleteProject(b)
    expect(await deleteProject(c)).toEqual({ deleted: false, reason: 'last' })
    expect(existsSync(projectStoreDir(h.userDataDir, c))).toBe(true)
  })

  it('deleting the active project switches cleanly to the most recently used other one first', async () => {
    const { a, b, c } = await threeProjects()
    await switchProject(a)
    await switchProject(c) // c active; a used more recently than b
    h.memoryDirs.length = 0

    const result = await deleteProject(c)

    expect(result).toEqual({ deleted: true, activeProjectId: a, switched: true })
    expect(getActiveProject()?.id).toBe(a)
    // Memory was re-pointed to the new project BEFORE anything was removed.
    expect(h.memoryDirs).toEqual([projectStoreDir(h.userDataDir, a)])
    expect(existsSync(projectStoreDir(h.userDataDir, c))).toBe(false)
    expect(existsSync(projectStoreDir(h.userDataDir, b))).toBe(true)
  })

  it('writes a diagnostic log line for each deletion (ids only; the name only as a title)', async () => {
    const { b, c } = await threeProjects()
    await deleteProject(b)
    h.watching = true
    await deleteProject(c)
    expect(h.log.map((l) => l.event)).toEqual(['project-deleted', 'project-delete-refused'])
    expect(h.log[0].details).toMatchObject({ project: b, wasActive: false, active: c })
    expect(JSON.stringify(h.log[0].details)).not.toContain('Recipe box')
    expect(h.log[0].titles).toEqual({ name: 'Recipe box' })
    expect(h.log[1].details).toMatchObject({ project: c, reason: 'watching' })
  })

  it('an unknown id deletes nothing', async () => {
    const { a, b, c } = await threeProjects()
    expect(await deleteProject('no-such-project')).toEqual({ deleted: false, reason: 'unknown' })
    expect(listProjectSummaries().map((p) => p.id)).toEqual([a, b, c])
  })
})

describe('deletion rules and folder safety (pure)', () => {
  const file = (active: string): ProjectsFile => ({
    migratedAt: '2026-01-01T00:00:00Z',
    activeProjectId: active,
    projects: [
      { id: 'p1', name: 'One', goalText: '', createdAt: '', lastActiveAt: '2026-01-01T00:00:00Z' },
      { id: 'p2', name: 'Two', goalText: '', createdAt: '', lastActiveAt: '2026-03-01T00:00:00Z' },
      { id: 'p3', name: 'Three', goalText: '', createdAt: '', lastActiveAt: '2026-02-01T00:00:00Z' },
    ],
  })

  it('plans the switch to the most recently used project', () => {
    expect(planProjectDeletion(file('p1'), 'p1', false)).toEqual({ ok: true, wasActive: true, nextActiveId: 'p2' })
    expect(planProjectDeletion(file('p1'), 'p3', true)).toEqual({ ok: true, wasActive: false, nextActiveId: null })
    expect(planProjectDeletion(file('p1'), 'p1', true)).toEqual({ ok: false, reason: 'watching' })
  })

  it('never deletes a folder outside mybuildy-memory/<id>', () => {
    for (const bad of ['..', '../x', 'a/b', '', '.']) {
      expect(() => deleteProjectStore(h.userDataDir, bad), bad).toThrow(/outside this project/)
    }
    expect(existsSync(h.userDataDir)).toBe(true)
  })
})
