// screenshots.spec.ts — README screenshots (Phase 10 links them from docs/assets/).
// DEV BUILD ONLY: the guidance fixture hook exists only under
// BUILDY_E2E=1 && !app.isPackaged (src/main/e2e-hooks.ts), so this whole file
// self-skips in the packaged run. The guidance panel is rendered from a canned
// fixture analysis — no AI provider is ever called.

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { launchBuildy, IS_PACKAGED_RUN, type BuildyApp } from './helpers'

const ASSETS_DIR = path.resolve(__dirname, '..', 'docs', 'assets')

test.skip(IS_PACKAGED_RUN, 'Screenshots + fixture hook are dev-build only')

let buildy: BuildyApp

test.beforeAll(async () => {
  fs.mkdirSync(ASSETS_DIR, { recursive: true })
  buildy = await launchBuildy()
})

test.afterAll(async () => {
  await buildy?.close()
})

test('mascot (companion window)', async () => {
  // Wait for the mascot image to finish loading so the PNG isn't blank.
  await buildy.companion.waitForFunction(() => {
    const images = Array.from(document.querySelectorAll('img'))
    return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0)
  })
  await buildy.companion.waitForTimeout(500)
  await buildy.companion.screenshot({
    path: path.join(ASSETS_DIR, 'mascot.png'),
    omitBackground: true, // transparent floating window
  })
})

test('Settings screen (first-run default)', async () => {
  await expect(buildy.main.getByText('Anthropic', { exact: true })).toBeVisible()
  await buildy.main.screenshot({ path: path.join(ASSETS_DIR, 'settings.png') })
})

test('Set Goal screen', async () => {
  await buildy.main.getByTitle('Set Goal').click()
  await buildy.main.waitForTimeout(400)
  await buildy.main.screenshot({ path: path.join(ASSETS_DIR, 'set-goal.png') })
})

test('Memory screen', async () => {
  await buildy.main.getByTitle('Memory').click()
  await buildy.main.waitForTimeout(400)
  await buildy.main.screenshot({ path: path.join(ASSETS_DIR, 'memory.png') })
})

test('guidance panel rendered from the canned fixture analysis', async () => {
  // Push the neutral fixture through the app's REAL display pathway
  // (showGuidanceWindow -> GUIDANCE_DATA -> GuidancePanel).
  await buildy.app.evaluate(() => {
    const hooks = (globalThis as Record<string, unknown>)['__buildyE2E'] as
      | { showFixtureGuidance(): void }
      | undefined
    if (!hooks) throw new Error('e2e fixture hook missing — is BUILDY_E2E=1 set?')
    hooks.showFixtureGuidance()
  })

  await expect(buildy.guidance.getByText('Prompt to paste')).toBeVisible()
  // Let the window finish its content-height resize animation before capturing.
  await buildy.guidance.waitForTimeout(800)
  await buildy.guidance.screenshot({
    path: path.join(ASSETS_DIR, 'guidance-panel.png'),
    omitBackground: true, // transparent floating window
  })
})

test('all screenshots exist and are non-trivial PNGs', async () => {
  for (const name of ['mascot.png', 'settings.png', 'set-goal.png', 'memory.png', 'guidance-panel.png']) {
    const file = path.join(ASSETS_DIR, name)
    expect(fs.existsSync(file), `${name} missing`).toBe(true)
    expect(fs.statSync(file).size, `${name} suspiciously small`).toBeGreaterThan(5_000)
  }
})
