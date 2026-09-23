// security.spec.ts — Phase 7 security invariants, verified per window:
// sandbox on, contextIsolation on, nodeIntegration off, no Node globals in the
// page, window.buildy present, strict CSP meta, navigation + window.open
// blocked, no application menu, DevTools closed.

import { test, expect, type Page } from '@playwright/test'
import { launchBuildy, type BuildyApp } from './helpers'

let buildy: BuildyApp

test.beforeAll(async () => {
  buildy = await launchBuildy()
})

test.afterAll(async () => {
  await buildy?.close()
})

function allPages(): Array<[string, Page]> {
  return [
    ['main', buildy.main],
    ['companion', buildy.companion],
    ['guidance', buildy.guidance],
    ['voice', buildy.voice],
  ]
}

test('every window has sandbox + contextIsolation on and nodeIntegration off', async () => {
  const prefs = await buildy.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((win) => {
      // getLastWebPreferences (undocumented API): the WebPreferences the
      // renderer was created with.
      const wc = win.webContents as unknown as {
        getURL(): string
        getLastWebPreferences?: () => {
          sandbox?: boolean
          contextIsolation?: boolean
          nodeIntegration?: boolean
        }
      }
      const p = wc.getLastWebPreferences ? wc.getLastWebPreferences() : null
      return {
        url: wc.getURL(),
        available: p !== null,
        sandbox: p?.sandbox,
        contextIsolation: p?.contextIsolation,
        nodeIntegration: p?.nodeIntegration,
      }
    })
  )
  expect(prefs.length).toBeGreaterThanOrEqual(4)
  for (const p of prefs) {
    expect(p.available, `getLastWebPreferences unavailable for ${p.url}`).toBe(true)
    expect(p.sandbox, `sandbox off in ${p.url}`).toBe(true)
    expect(p.contextIsolation, `contextIsolation off in ${p.url}`).toBe(true)
    expect(p.nodeIntegration ?? false, `nodeIntegration on in ${p.url}`).toBe(false)
  }
})

test('no Node globals leak into any renderer; window.buildy is present', async () => {
  for (const [name, page] of allPages()) {
    const probe = await page.evaluate(() => ({
      hasRequire: typeof (window as unknown as Record<string, unknown>).require !== 'undefined',
      hasProcess: typeof (window as unknown as Record<string, unknown>).process !== 'undefined',
      hasBuildy: typeof (window as unknown as Record<string, unknown>).buildy === 'object',
    }))
    expect(probe.hasRequire, `window.require leaked in ${name}`).toBe(false)
    expect(probe.hasProcess, `window.process leaked in ${name}`).toBe(false)
    expect(probe.hasBuildy, `window.buildy missing in ${name}`).toBe(true)
  }
})

test('strict CSP meta tag is present in every window', async () => {
  for (const [name, page] of allPages()) {
    const csp = await page.evaluate(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
      return meta ? meta.getAttribute('content') : null
    })
    expect(csp, `CSP meta missing in ${name}`).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
  }
})

test('navigating a window to https://example.com is blocked', async () => {
  const before = buildy.main.url()
  await buildy.main.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await buildy.main.waitForTimeout(1000)
  expect(buildy.main.url()).toBe(before)
  expect(buildy.main.url()).not.toContain('example.com')
})

test('window.open is denied (no new window is created)', async () => {
  const windowsBefore = buildy.app.windows().length
  // Deliberately NOT an https URL: safe externals are forwarded to the OS
  // browser, and a test must never pop the user's browser.
  await buildy.main.evaluate(() => {
    window.open('notasafescheme://blocked-by-buildy-e2e')
  })
  await buildy.main.waitForTimeout(750)
  expect(buildy.app.windows().length).toBe(windowsBefore)
})

test('application menu is null (Windows) and DevTools are closed everywhere', async () => {
  const state = await buildy.app.evaluate(({ Menu, BrowserWindow }) => ({
    platform: process.platform,
    menuIsNull: Menu.getApplicationMenu() === null,
    devtoolsOpen: BrowserWindow.getAllWindows().map((w) => w.webContents.isDevToolsOpened()),
  }))
  if (state.platform === 'win32') expect(state.menuIsNull).toBe(true)
  for (const open of state.devtoolsOpen) expect(open).toBe(false)
})
