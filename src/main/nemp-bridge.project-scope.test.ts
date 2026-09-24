// nemp-bridge.project-scope.test.ts
// Verifies A2: everything memory-related is namespaced by project id.
// Runs the REAL nemp-bridge (and the real nemp core modules from node_modules)
// against a temp userData directory, with only Electron and the project-memory
// file layer mocked. Neutral sample data only.

import { describe, it, expect, afterAll, vi } from 'vitest'
import { rmSync, readFileSync } from 'fs'
import { join } from 'path'

const tmp = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  return { userDataDir: mkdtempSync(join(tmpdir(), 'mybuildy-nemp-scope-')) }
})

vi.mock('electron', () => ({
  app: { getPath: (): string => tmp.userDataDir },
}))

vi.mock('./memory', () => ({
  loadProjectMemory: async () => ({
    projectName: 'Project A',
    productSummary: '',
    targetUser: '',
    coreProblem: '',
    completedFeatures: [],
    missingFeatures: [],
    activeBlockers: [],
    explanationStyle: 'very_simple',
    brainstormSummary: '',
    goal: null,
    goalPromptSeen: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }),
  loadGoal: async () => null,
}))

import * as nemp from './nemp-bridge'

afterAll(() => {
  rmSync(tmp.userDataDir, { recursive: true, force: true })
})

describe('nemp-bridge — per-project memory scope', () => {
  it('a feature written in project A is absent from project B analysis context', async () => {
    await nemp.init('project-a')
    await nemp.recordCompletion('Login screen finished')

    const contextA = await nemp.getContextSummary()
    expect(contextA).toContain('Login screen finished')

    await nemp.init('project-b')
    const contextB = await nemp.getContextSummary()
    expect(contextB).not.toContain('Login screen finished')
  })

  it('export and reset act only on the ACTIVE project', async () => {
    // Seed project B with its own completion.
    await nemp.init('project-b')
    await nemp.recordCompletion('Signup flow finished')

    // Export from A → contains A's memory only.
    await nemp.init('project-a')
    const exportPath = join(tmp.userDataDir, 'export-a.md')
    await nemp.exportToMyBuildyMd(exportPath)
    const md = readFileSync(exportPath, 'utf-8')
    expect(md).toContain('Login screen finished')
    expect(md).not.toContain('Signup flow finished')

    // Reset A → A empty, B untouched.
    await nemp.resetMemory()
    expect(await nemp.getContextSummary()).not.toContain('Login screen finished')

    await nemp.init('project-b')
    expect(await nemp.getContextSummary()).toContain('Signup flow finished')
  })
})
