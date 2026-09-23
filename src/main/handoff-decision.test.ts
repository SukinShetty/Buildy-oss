// handoff-decision.test.ts
// Phase 3B: the user's answer to a hand-off (Block 6) is stored as a DECISION in
// the ACTIVE project's memory. The HandoffCard answer flow calls the existing
// memory:add-decision IPC, which lands on nemp-bridge.recordDecision — so this
// verifies that path with the Nemp storage layer MOCKED (no real disk writes).
// Neutral sample data only.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

const state = vi.hoisted(() => ({
  upserts: [] as Array<{ memory: Record<string, unknown>; projectPath: string | undefined }>,
  userDataDir: 'C:\\fake-user-data',
}))

vi.mock('electron', () => ({
  app: { getPath: (): string => state.userDataDir },
}))

// Mock the Nemp core layer (loaded by nemp-bridge via dynamic import).
vi.mock('nemp-mcp-server/dist/core/storage.js', () => ({
  readMemories: (): unknown[] => [],
  writeMemories: (): void => {},
  upsertMemory: (memory: Record<string, unknown>, projectPath?: string): void => {
    state.upserts.push({ memory, projectPath })
  },
  deleteMemory: (): boolean => true,
  updateMemoryIndex: (): void => {},
}))
vi.mock('nemp-mcp-server/dist/core/search.js', () => ({
  searchMemories: (): unknown[] => [],
}))

import * as nemp from './nemp-bridge'
import { projectStoreDir } from './projects-core'

beforeEach(() => {
  state.upserts.length = 0
})

describe('hand-off answer → decision in the ACTIVE project (Phase 3B)', () => {
  it('records the answer as a decision-tagged memory in the active project store', async () => {
    await nemp.init('active-project')
    await nemp.recordDecision(
      'Should the notes app store data locally or in the cloud?',
      'Store notes locally for the first version'
    )

    expect(state.upserts).toHaveLength(1)
    const { memory, projectPath } = state.upserts[0]
    expect(projectPath).toBe(projectStoreDir(state.userDataDir, 'active-project'))
    expect(memory.key).toMatch(/^decision:/)
    expect(memory.tags).toContain('decision')
    expect(String(memory.value)).toContain('Should the notes app store data locally or in the cloud?')
    expect(String(memory.value)).toContain('Store notes locally for the first version')
  })

  it('writes to whichever project is active at answer time (not a previous one)', async () => {
    await nemp.init('project-one')
    await nemp.init('project-two')
    await nemp.recordDecision('Which page should load first?', 'The task list page')

    expect(state.upserts).toHaveLength(1)
    expect(state.upserts[0].projectPath).toBe(projectStoreDir(state.userDataDir, 'project-two'))
    expect(state.upserts[0].projectPath).not.toBe(join(state.userDataDir, 'buildy-memory', 'project-one'))
  })

  it('ignores an empty answer (no decision written)', async () => {
    await nemp.init('active-project')
    await nemp.recordDecision('Which page should load first?', '   ')
    expect(state.upserts).toHaveLength(0)
  })
})
