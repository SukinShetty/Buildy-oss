// main-process.spec.ts — capabilities the app depends on, checked in the main
// process via electronApp.evaluate: window capture sources exist, OS-level
// secret encryption is available on this machine, and the app/tray icon
// resolves (from resources/ when packaged, from the repo in dev).

import * as path from 'path'
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

test('tray was created with a real icon; the icon file resolves in this mode', async () => {
  // Same resolution rule as src/main/index.ts: packaged -> resources/icon.png
  // (shipped by electron-builder extraResources), dev -> repo build/icon.png.
  const devIconPath = path.resolve(__dirname, '..', 'build', 'icon.png')
  const info = await buildy.app.evaluate(({ app, nativeImage }, devIcon) => {
    const iconPath = app.isPackaged ? `${process.resourcesPath}\\icon.png` : devIcon
    const image = nativeImage.createFromPath(iconPath)
    const health = (globalThis as Record<string, unknown>)['__buildyTrayHealth'] as
      | { created: boolean; iconLoaded: boolean }
      | undefined
    return { iconPath, empty: image.isEmpty(), size: image.getSize(), health }
  }, devIconPath)

  // The icon file ships and decodes to a real square image.
  expect(info.empty, `icon missing or unreadable at ${info.iconPath}`).toBe(false)
  expect(info.size.width).toBeGreaterThanOrEqual(256)
  expect(info.size.width).toBe(info.size.height)

  // The tray itself came up with that icon (health flags set by createSystemTray).
  expect(info.health?.created).toBe(true)
  expect(info.health?.iconLoaded).toBe(true)
})
