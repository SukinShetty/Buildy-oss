// projects.test.ts
// Wiring tests for the Electron-side project switcher (projects.ts) with the
// side-effect modules mocked. The critical property under test: a project
// switch STOPS any active watch BEFORE re-pointing the memory layer, so a
// session started under the old project can never write the old window's
// observations/outcomes into the new project's store.

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'

// Hand-rolled spies (vi.fn is unavailable inside vi.hoisted): each records its
// args and a GLOBAL invocation order so call ordering across spies is testable.
const tmp = vi.hoisted(() => {
  const { mkdtempSync } = require('fs') as typeof import('fs')
  const { tmpdir } = require('os') as typeof import('os')
  const { join } = require('path') as typeof import('path')

  let globalOrder = 0
  interface Spy {
    (...args: unknown[]): unknown
    calls: unknown[][]
    orders: number[]
    clear: () => void
  }
  function makeSpy(impl?: (...args: unknown[]) => unknown): Spy {
    const spy = ((...args: unknown[]): unknown => {
      spy.calls.push(args)
      spy.orders.push(++globalOrder)
      return impl ? impl(...args) : undefined
    }) as Spy
    spy.calls = []
    spy.orders = []
    spy.clear = () => { spy.calls.length = 0; spy.orders.length = 0 }
    return spy
  }

  return {
    userDataDir: mkdtempSync(join(tmpdir(), 'mybuildy-projects-wiring-')),
    stopWatchForProjectSwitch: makeSpy(),
    initNemp: makeSpy(async () => {}),
    setVerifierProject: makeSpy(),
    setActiveMemoryDir: makeSpy(),
  }
})

vi.mock('electron', () => ({ app: { getPath: (): string => tmp.userDataDir } }))
vi.mock('./analysis-loop', () => ({ stopWatchForProjectSwitch: tmp.stopWatchForProjectSwitch }))
vi.mock('./nemp-bridge', () => ({ init: tmp.initNemp }))
vi.mock('./verifier', () => ({ setVerifierProject: tmp.setVerifierProject }))
vi.mock('./memory', () => ({ setActiveMemoryDir: tmp.setActiveMemoryDir }))

import { initProjects, switchProject, createProjectAndSwitch, getActiveProject } from './projects'
import { projectStoreDir } from './projects-core'

afterAll(() => {
  rmSync(tmp.userDataDir, { recursive: true, force: true })
})

beforeEach(() => {
  tmp.stopWatchForProjectSwitch.clear()
  tmp.initNemp.clear()
  tmp.setVerifierProject.clear()
  tmp.setActiveMemoryDir.clear()
})

describe('projects.ts — switch side-effects', () => {
  it('createProjectAndSwitch stops the watch BEFORE re-pointing the memory layer', async () => {
    await initProjects()
    tmp.stopWatchForProjectSwitch.clear()
    tmp.initNemp.clear()
    tmp.setVerifierProject.clear()
    tmp.setActiveMemoryDir.clear()

    const project = await createProjectAndSwitch({ name: 'Project B' })

    expect(tmp.stopWatchForProjectSwitch.calls).toHaveLength(1)
    const stopAt = tmp.stopWatchForProjectSwitch.orders[0]
    expect(stopAt).toBeLessThan(tmp.setActiveMemoryDir.orders[0])
    expect(stopAt).toBeLessThan(tmp.setVerifierProject.orders[0])
    expect(stopAt).toBeLessThan(tmp.initNemp.orders[0])
    expect(getActiveProject()?.id).toBe(project.id)
  })

  it('switchProject stops the watch first and passes the resolved store dir to the Nemp init', async () => {
    const first = await initProjects()
    await createProjectAndSwitch({ name: 'Project C' })
    tmp.stopWatchForProjectSwitch.clear()
    tmp.initNemp.clear()
    tmp.setActiveMemoryDir.clear()

    await switchProject(first.id)

    expect(tmp.stopWatchForProjectSwitch.calls).toHaveLength(1)
    expect(tmp.stopWatchForProjectSwitch.orders[0]).toBeLessThan(tmp.initNemp.orders[0])
    // Exactly ONE path derivation: projects.ts hands nemp the projects-core dir.
    expect(tmp.initNemp.calls[0]).toEqual([first.id, projectStoreDir(tmp.userDataDir, first.id)])
    expect(getActiveProject()?.id).toBe(first.id)
  })

  it('switchProject with an unknown id throws and does not stop the watch or re-point memory', async () => {
    await initProjects()
    tmp.stopWatchForProjectSwitch.clear()
    tmp.initNemp.clear()

    await expect(switchProject('does-not-exist')).rejects.toThrow('Unknown project id')
    expect(tmp.stopWatchForProjectSwitch.calls).toHaveLength(0)
    expect(tmp.initNemp.calls).toHaveLength(0)
  })
})
