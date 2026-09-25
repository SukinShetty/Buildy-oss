// Project memory keeps durable facts only. Runs the REAL nemp-bridge and the real
// Nemp storage modules against a temp userData directory (only Electron and the
// project-memory file layer are mocked). Neutral sample data only.
import { describe, it, expect, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { isMomentaryState } from './memory-durability'

const tmp = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  return { userDataDir: mkdtempSync(join(tmpdir(), 'mybuildy-nemp-durable-')) }
})

vi.mock('electron', () => ({ app: { getPath: (): string => tmp.userDataDir } }))
vi.mock('./memory', () => ({
  loadProjectMemory: async () => ({
    projectName: 'Invoices', productSummary: '', targetUser: '', coreProblem: '',
    completedFeatures: [], missingFeatures: [], activeBlockers: [],
    explanationStyle: 'very_simple', brainstormSummary: '', goal: null, goalPromptSeen: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }),
  loadGoal: async () => null,
}))

import * as nemp from './nemp-bridge'
import { projectStoreDir } from './projects-core'

afterAll(() => rmSync(tmp.userDataDir, { recursive: true, force: true }))

const MOMENTARY = [
  'Claude Code is currently reading the existing code',
  'The agent is sitting idle',
  'Claude Code is waiting for a new instruction',
  'Codex is thinking about the next step',
]

async function allValues(): Promise<string[]> {
  const snap = await nemp.getSnapshot()
  return snap.recent.map((m) => m.value)
}

describe('project memory keeps durable facts only', () => {
  it('a momentary-state observation is not persisted; durable facts are', async () => {
    await nemp.init('project-durable')
    for (const text of MOMENTARY) {
      await nemp.recordObservation(text, '2026-01-01T00:00:00.000Z')
      await nemp.recordBlocker(text)
      await nemp.recordCompletion(text)
    }
    await nemp.recordCompletion('Invoices screen saves and lists invoices')
    await nemp.recordBlocker('PDF export fails with a missing font')
    await nemp.recordDecision('Monthly or yearly plans?', 'Monthly')

    const values = await allValues()
    for (const text of MOMENTARY) expect(values).not.toContain(text)
    expect(values).toContain('Invoices screen saves and lists invoices')
    expect(values).toContain('PDF export fails with a missing font')
    expect(values.some((v) => v.includes('Choice: Monthly'))).toBe(true)
    expect(await nemp.getContextSummary()).not.toMatch(/currently reading|sitting idle|waiting for a new instruction/)
  })

  it('entries an earlier version stored are cleared when the project is opened', async () => {
    const storage = (await import('nemp-mcp-server/dist/core/storage.js')) as unknown as {
      writeMemories(m: unknown[], p?: string): void
      readMemories(p?: string): Array<{ key: string; value: string }>
    }
    const dir = projectStoreDir(tmp.userDataDir, 'project-legacy')
    const entry = (key: string, value: string, tags: string[]) =>
      ({ key, value, tags, timestamp: '2026-01-01T00:00:00.000Z', source: 'mybuildy', agent_id: 'mybuildy' })
    storage.writeMemories([
      entry('obs:1:reading', 'Claude Code is currently reading the existing code', ['mybuildy', 'observation', 'analysis:2026-01-01T00:00:00.000Z']),
      entry('obs:2:screen', 'The terminal shows the test run finishing', ['mybuildy', 'observation', 'analysis:2026-01-01T00:01:00.000Z']),
      entry('blocker:idle', 'The agent is sitting idle', ['mybuildy', 'blocker', 'open']),
      entry('completion:invoices', 'Invoices screen', ['mybuildy', 'completion']),
      entry('obs:3:plan', 'Planned first build step: add the Invoices screen', ['mybuildy', 'observation']),
      entry('other-tool', 'Claude Code is currently reading the code', ['someone-else']),
    ], dir)

    await nemp.init('project-legacy')

    const keys = storage.readMemories(dir).map((m) => m.key).sort()
    expect(keys).toEqual(['completion:invoices', 'obs:3:plan', 'other-tool'])
  })
})

describe('isMomentaryState', () => {
  it('flags agent state, keeps durable facts', () => {
    for (const t of MOMENTARY) expect(isMomentaryState(t), t).toBe(true)
    for (const t of [
      'Invoices screen saves and lists invoices',
      'Login currently crashes on submit',
      'Login page ready for you to test',
      'Chose Postgres over SQLite',
      'Idle-timeout logout added',
    ]) expect(isMomentaryState(t), t).toBe(false)
  })
})
