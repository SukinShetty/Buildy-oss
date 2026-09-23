// launch.spec.ts — smoke: every window loads, no renderer console errors,
// no uncaught main-process errors, and the throwaway profile actually receives
// the app's files (proving the BUILDY_USER_DATA_DIR override took effect).

import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { launchBuildy, IS_PACKAGED_RUN, type BuildyApp } from './helpers'

let buildy: BuildyApp

test.beforeAll(async () => {
  buildy = await launchBuildy()
})

test.afterAll(async () => {
  await buildy?.close()
})

test('all four windows load their routed renderer', async () => {
  expect(buildy.main.url()).not.toContain('companion=true')
  expect(buildy.companion.url()).toContain('companion=true')
  expect(buildy.guidance.url()).toContain('guidance=true')
  expect(buildy.voice.url()).toContain('voice=true')

  for (const page of [buildy.main, buildy.companion, buildy.guidance, buildy.voice]) {
    expect(await page.evaluate(() => document.readyState)).toBe('complete')
    expect(await page.evaluate(() => !!document.getElementById('root'))).toBe(true)
  }

  // The two visible UIs actually rendered content.
  expect(await buildy.main.evaluate(() => document.getElementById('root')!.childElementCount)).toBeGreaterThan(0)
  expect(await buildy.companion.evaluate(() => document.getElementById('root')!.childElementCount)).toBeGreaterThan(0)
})

test('app runs in the expected packaging mode with the overridden profile', async () => {
  const info = await buildy.app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
  }))
  expect(info.isPackaged).toBe(IS_PACKAGED_RUN)
  expect(path.resolve(info.userData)).toBe(path.resolve(buildy.profileDir))

  // The override provably took effect: the app wrote its first-run files into
  // the throwaway profile (settings/projects are created by startup).
  expect(fs.existsSync(path.join(buildy.profileDir, 'projects.json'))).toBe(true)
})

test('no renderer console errors in any window', async () => {
  // Small settle so late async renderer work (settings/memory loads) surfaces.
  await buildy.main.waitForTimeout(1500)
  expect(buildy.rendererErrors).toEqual([])
})

test('no uncaught main-process errors', async () => {
  expect(await buildy.mainErrors()).toEqual([])
})
