// secrets.spec.ts — save a fake API key through the real IPC path and assert
// the raw key never comes back in ANY renderer-bound payload (settings, project
// memory, provider infos, projects, memory snapshot) and never lands on disk
// in plain text. Uses the throwaway profile only — see helpers.ts.

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { launchMyBuildy, type MyBuildyApp } from './helpers'

// Obviously-fake marker string; never a real credential.
const FAKE_KEY = 'sk-e2e-fake-key-STANDIN-000000000000'

let mybuildy: MyBuildyApp

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterAll(async () => {
  await mybuildy?.close()
})

test('a stored key is redacted from every renderer-bound payload', async () => {
  type MyBuildyWindow = { mybuildy: Record<string, (...args: unknown[]) => Promise<unknown>> }

  // Store the fake key via the real one-way IPC (main window only may do this).
  await mybuildy.main.evaluate(async (key) => {
    const api = (window as unknown as { mybuildy: { setSecret(name: string, value: string): Promise<void> } }).mybuildy
    await api.setSecret('anthropicApiKey', key)
  }, FAKE_KEY)

  // Read back every renderer-facing payload and scan the raw JSON for the key.
  const payloads = await mybuildy.main.evaluate(async () => {
    const api = (window as unknown as MyBuildyWindow).mybuildy as unknown as {
      loadSettings(): Promise<unknown>
      loadProject(): Promise<unknown>
      getProviderInfos(): Promise<unknown>
      projects: { list(): Promise<unknown> }
      memory: { get(): Promise<unknown> }
    }
    const [settings, project, providerInfos, projects, memorySnapshot] = await Promise.all([
      api.loadSettings(),
      api.loadProject(),
      api.getProviderInfos(),
      api.projects.list(),
      api.memory.get(),
    ])
    return { settings, project, providerInfos, projects, memorySnapshot }
  })

  const serialized = JSON.stringify(payloads)
  expect(serialized).not.toContain(FAKE_KEY)

  // The redacted view still reports that a key exists.
  const settings = payloads.settings as {
    provider: string
    hasApiKey: boolean
    secretFlags: Record<string, boolean>
  }
  expect(settings.provider).toBe('anthropic')
  expect(settings.hasApiKey).toBe(true)
  expect(settings.secretFlags.anthropicApiKey).toBe(true)

  // And on disk (throwaway profile) the key is encrypted, not plain text.
  const secretsFile = path.join(mybuildy.profileDir, 'secrets.enc')
  expect(fs.existsSync(secretsFile)).toBe(true)
  expect(fs.readFileSync(secretsFile, 'latin1')).not.toContain(FAKE_KEY)
})
