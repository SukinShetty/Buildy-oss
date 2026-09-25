// Project isolation: a write that STARTED for one project never lands in another.
//   - setGoal: the active project switches while the save is in flight
//   - memory: an analysis/verifier write captured under project A arrives after
//     the user switched to project B
// Real memory.ts + nemp-bridge against a temp userData dir; only Electron mocked.
import { describe, it, expect, afterAll, vi } from 'vitest'
import { rmSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const tmp = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')
  return { userDataDir: mkdtempSync(join(tmpdir(), 'mybuildy-isolation-')) }
})

vi.mock('electron', () => ({
  app: { getPath: (): string => tmp.userDataDir },
  safeStorage: { isEncryptionAvailable: () => false },
}))

import { setActiveMemoryDir, setGoal, loadGoal, ProjectChangedError } from './memory'
import * as nemp from './nemp-bridge'

const dirA = join(tmp.userDataDir, 'mybuildy-memory', 'proj-A')
const dirB = join(tmp.userDataDir, 'mybuildy-memory', 'proj-B')
mkdirSync(dirA, { recursive: true })
mkdirSync(dirB, { recursive: true })

afterAll(() => {
  rmSync(tmp.userDataDir, { recursive: true, force: true })
})

describe('goal save race', () => {
  it('rejects a goal save when the project changes mid-operation, writing to neither project', async () => {
    setActiveMemoryDir(dirA)
    const saving = setGoal({ purpose: 'A recipe box for project A' })
    setActiveMemoryDir(dirB) // the user switched projects while the save was in flight
    await expect(saving).rejects.toBeInstanceOf(ProjectChangedError)

    expect(existsSync(join(dirB, 'project-memory.json'))).toBe(false)
    setActiveMemoryDir(dirA)
    expect(await loadGoal()).toBeNull()
  })

  it('an undisturbed save still lands in its own project', async () => {
    setActiveMemoryDir(dirA)
    await setGoal({ purpose: 'A recipe box for project A' })
    expect(JSON.parse(readFileSync(join(dirA, 'project-memory.json'), 'utf8')).goal.purpose).toBe('A recipe box for project A')
  })
})

describe('memory writes are bound to the project they started for', () => {
  it('a write captured under project A is rejected after a switch to project B', async () => {
    await nemp.init('proj-A', dirA)
    const writerForA = nemp.writerFor(nemp.memoryScope())

    await nemp.init('proj-B', dirB) // switch
    await writerForA.recordCompletion('Sample feature built in project A')

    const inB = await nemp.getSnapshot()
    expect(JSON.stringify(inB)).not.toContain('Sample feature built in project A')
    await nemp.init('proj-A', dirA)
    expect(JSON.stringify(await nemp.getSnapshot())).not.toContain('Sample feature built in project A')
  })

  it('a writer for the active project writes normally', async () => {
    await nemp.init('proj-B', dirB)
    await nemp.writerFor(nemp.memoryScope()).recordCompletion('Sample feature for project B')
    expect(JSON.stringify(await nemp.getSnapshot())).toContain('Sample feature for project B')
  })
})
