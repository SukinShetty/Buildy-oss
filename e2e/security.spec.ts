// security.spec.ts — Phase 7 security invariants, verified per window:
// sandbox on, contextIsolation on, nodeIntegration off, no Node globals in the
// page, window.mybuildy present, strict CSP meta, navigation + window.open
// blocked, no application menu, DevTools closed.

import { test, expect, type Page } from '@playwright/test'
import { launchMyBuildy, type MyBuildyApp } from './helpers'

let mybuildy: MyBuildyApp

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterAll(async () => {
  await mybuildy?.close()
})

function allPages(): Array<[string, Page]> {
  return [
    ['main', mybuildy.main],
    ['companion', mybuildy.companion],
    ['guidance', mybuildy.guidance],
    ['voice', mybuildy.voice],
  ]
}

test('every window has sandbox + contextIsolation on and nodeIntegration off', async () => {
  const prefs = await mybuildy.app.evaluate(({ BrowserWindow }) =>
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

test('no Node globals leak into any renderer; window.mybuildy is present', async () => {
  for (const [name, page] of allPages()) {
    const probe = await page.evaluate(() => ({
      hasRequire: typeof (window as unknown as Record<string, unknown>).require !== 'undefined',
      hasProcess: typeof (window as unknown as Record<string, unknown>).process !== 'undefined',
      hasMyBuildy: typeof (window as unknown as Record<string, unknown>).mybuildy === 'object',
    }))
    expect(probe.hasRequire, `window.require leaked in ${name}`).toBe(false)
    expect(probe.hasProcess, `window.process leaked in ${name}`).toBe(false)
    expect(probe.hasMyBuildy, `window.mybuildy missing in ${name}`).toBe(true)
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
  const before = mybuildy.main.url()
  await mybuildy.main.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await mybuildy.main.waitForTimeout(1000)
  expect(mybuildy.main.url()).toBe(before)
  expect(mybuildy.main.url()).not.toContain('example.com')
})

test('window.open is denied (no new window is created)', async () => {
  const windowsBefore = mybuildy.app.windows().length
  // Deliberately NOT an https URL: safe externals are forwarded to the OS
  // browser, and a test must never pop the user's browser.
  await mybuildy.main.evaluate(() => {
    window.open('notasafescheme://blocked-by-mybuildy-e2e')
  })
  await mybuildy.main.waitForTimeout(750)
  expect(mybuildy.app.windows().length).toBe(windowsBefore)
})

test('application menu is null (Windows / Linux)', async () => {
  test.skip(process.platform === 'darwin', 'macOS has its own app menu — covered by the macOS menu test')
  const menuIsNull = await mybuildy.app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)
  expect(menuIsNull).toBe(true)
})

test('application menu on macOS is app + Edit + Window with Quit (Cmd+Q), and no Reload or DevTools', async () => {
  test.skip(process.platform !== 'darwin', 'macOS-only: Windows and Linux have no application menu at all')
  const menu = await mybuildy.app.evaluate(({ Menu }) => {
    const appMenu = Menu.getApplicationMenu()
    const collect = (items: Electron.MenuItem[]): string[] =>
      items.flatMap((item) => [String(item.role ?? item.label ?? ''), ...(item.submenu ? collect(item.submenu.items) : [])])
    return appMenu
      ? { topLevel: appMenu.items.map((item) => String(item.role ?? item.label)), all: collect(appMenu.items) }
      : null
  })
  expect(menu, 'macOS needs an Edit menu for copy/paste in inputs').not.toBeNull()
  expect(menu!.topLevel).toHaveLength(3)
  expect(menu!.all.map((r) => r.toLowerCase())).toContain('paste')
  expect(menu!.all).toContain('Quit MyBuildy')
  for (const forbidden of ['reload', 'forcereload', 'toggledevtools']) {
    expect(menu!.all.map((r) => r.toLowerCase())).not.toContain(forbidden)
  }
})

test('DevTools are closed in every window', async () => {
  const devtoolsOpen = await mybuildy.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => w.webContents.isDevToolsOpened())
  )
  for (const open of devtoolsOpen) expect(open).toBe(false)
})
