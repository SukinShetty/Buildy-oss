// main-process.spec.ts — capabilities the app depends on, checked in the main
// process via electronApp.evaluate: window capture sources exist and OS-level
// secret encryption is available on this machine.

import { test, expect } from '@playwright/test'
import { launchBuildy, type BuildyApp } from './helpers'

let buildy: BuildyApp

test.beforeAll(async () => {
  buildy = await launchBuildy()
})

test.afterAll(async () => {
  await buildy?.close()
})

test('desktopCapturer sees at least one window source', async () => {
  const sourceCount = await buildy.app.evaluate(async ({ desktopCapturer }) => {
    const sources = await desktopCapturer.getSources({ types: ['window'] })
    return sources.length
  })
  expect(sourceCount).toBeGreaterThanOrEqual(1)
})

test('safeStorage encryption is available (keys are never stored in plain text)', async () => {
  const available = await buildy.app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable())
  expect(available).toBe(true)
})
