// memory-isolation.spec.ts — memory is namespaced per project: an observation
// recorded in project A must be invisible from project B and reappear after
// switching back to A. Exercised through the real IPC surface (projects.* and
// memory.*) from the main window, exactly as the UI does.

import { test, expect } from '@playwright/test'
import { launchBuildy, type BuildyApp } from './helpers'

const OBSERVATION_A = 'Sample observation that belongs only to project A'

interface ProjectsApi {
  projects: {
    create(input: { name?: string; goalText?: string }): Promise<{ id: string; name: string }>
    switch(id: string): Promise<{ id: string; name: string }>
    getActive(): Promise<{ id: string; name: string } | null>
  }
  memory: {
    addObservation(text: string): Promise<void>
    get(): Promise<unknown>
  }
}

let buildy: BuildyApp

test.beforeAll(async () => {
  buildy = await launchBuildy()
})

test.afterAll(async () => {
  await buildy?.close()
})

test('memories recorded in project A never leak into project B', async () => {
  const page = buildy.main

  // Project A: record an observation and see it in the snapshot.
  const projectAId = await page.evaluate(async (text) => {
    const api = (window as unknown as { buildy: ProjectsApi }).buildy
    const projectA = await api.projects.create({ name: 'Isolation Project A' })
    await api.memory.addObservation(text)
    return projectA.id
  }, OBSERVATION_A)

  const snapshotA = await page.evaluate(async () => {
    const api = (window as unknown as { buildy: ProjectsApi }).buildy
    return api.memory.get()
  })
  expect(JSON.stringify(snapshotA)).toContain(OBSERVATION_A)

  // Project B: brand new memory store — the observation must not be there.
  await page.evaluate(async () => {
    const api = (window as unknown as { buildy: ProjectsApi }).buildy
    await api.projects.create({ name: 'Isolation Project B' })
  })
  const snapshotB = await page.evaluate(async () => {
    const api = (window as unknown as { buildy: ProjectsApi }).buildy
    return api.memory.get()
  })
  expect(JSON.stringify(snapshotB)).not.toContain(OBSERVATION_A)

  // Switch back to A: the observation is still there (nothing was lost).
  const snapshotAAgain = await page.evaluate(async (id) => {
    const api = (window as unknown as { buildy: ProjectsApi }).buildy
    await api.projects.switch(id)
    return api.memory.get()
  }, projectAId)
  expect(JSON.stringify(snapshotAAgain)).toContain(OBSERVATION_A)
})
