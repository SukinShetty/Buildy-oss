// mac-window-and-projects.spec.ts — the Mac tester's reports, on every OS:
//   1. the title and top-bar controls stay clear of the macOS traffic lights at
//      every window width (macOS layout rules applied via .platform-darwin;
//      Windows keeps its own layout, checked unchanged);
//   2. "New project" creates and switches in the SAME window — no new window;
//   3. Delete project: named confirmation, typed name, explicit Delete button,
//      the last project can't be deleted.
// Dev build and packaged build alike (no fixture hooks needed).

import { test, expect, type Page } from '@playwright/test'
import { launchMyBuildy, type MyBuildyApp } from './helpers'

let m: MyBuildyApp

test.beforeAll(async () => {
  m = await launchMyBuildy()
  // Skip the guided setup so the normal panel (top bar + screens) shows.
  await m.main.evaluate(async () => {
    await (window as unknown as { mybuildy: { setup: { finish(): Promise<void> } } }).mybuildy.setup.finish()
  })
  await m.companion.evaluate(() => (window as unknown as { mybuildy: { openPanel(): void } }).mybuildy.openPanel())
  await m.main.reload()
  await expect(m.main.locator('.app-titlebar')).toBeVisible()
})

test.afterAll(async () => {
  await m?.close()
})

async function setWidth(width: number): Promise<void> {
  await m.app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows().find((b) => b.webContents.getURL().split('?')[1] === undefined)
    win?.setSize(w, 720)
  }, width)
  await expect.poll(() => m.main.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(width)
}

/** Left edges of the title and every tab, the window width, and whether tabs overflow or overlap. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const logo = document.querySelector('.app-titlebar-logo') as HTMLElement | null
    const tabs = [...document.querySelectorAll('.app-titlebar button')].map((b) => b.getBoundingClientRect())
    const logoBox = logo && getComputedStyle(logo).display !== 'none' ? logo.getBoundingClientRect() : null
    return {
      width: document.documentElement.clientWidth,
      logoLeft: logoBox ? logoBox.left : null,
      logoRight: logoBox ? logoBox.right : null,
      firstTabLeft: tabs[0].left,
      lastTabRight: tabs[tabs.length - 1].right,
      tabsOverlap: tabs.some((t, i) => i > 0 && t.left < tabs[i - 1].right - 0.5),
      navPaddingLeft: getComputedStyle(document.querySelector('.app-titlebar')!).paddingLeft,
    }
  })
}

test('macOS: the title and every tab start clear of the traffic lights, at every width', async () => {
  await m.main.evaluate(() => { document.documentElement.classList.remove('platform-win32', 'platform-linux'); document.documentElement.classList.add('platform-darwin') })
  const TRAFFIC_LIGHTS_END = 16 + 3 * 14 + 2 * 8 // x 16, three ~14px buttons, ~8px gaps
  for (const width of [560, 620, 700, 900, 1400]) {
    await setWidth(width)
    const r = await measure(m.main)
    expect(r.firstTabLeft, `first tab at ${width}px`).toBeGreaterThan(TRAFFIC_LIGHTS_END)
    if (r.logoLeft !== null) {
      expect(r.logoLeft, `title at ${width}px`).toBeGreaterThan(TRAFFIC_LIGHTS_END)
      expect(r.logoRight!, `title vs tabs at ${width}px`).toBeLessThanOrEqual(r.firstTabLeft)
    }
    expect(r.lastTabRight, `tabs fit at ${width}px`).toBeLessThanOrEqual(r.width)
    expect(r.tabsOverlap, `tabs overlap at ${width}px`).toBe(false)
  }
})

test('Windows layout is unchanged: 12px padding, title visible at the minimum width', async () => {
  test.skip(process.platform === 'darwin', 'checks the Windows/Linux layout')
  await m.main.evaluate(() => { document.documentElement.classList.remove('platform-darwin'); document.documentElement.classList.add(`platform-${(window as unknown as { mybuildy: { platform: string } }).mybuildy.platform}`) })
  await setWidth(560)
  const r = await measure(m.main)
  expect(r.navPaddingLeft).toBe('12px')
  expect(r.logoLeft).toBe(12)
  expect(r.lastTabRight).toBeLessThanOrEqual(r.width)
})

test('"New project" creates and switches in the same window — no new window', async () => {
  const count = () => m.app.evaluate(({ BrowserWindow }) => ({
    all: BrowserWindow.getAllWindows().length,
    visible: BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length,
  }))
  const before = await count()
  const pagesBefore = m.app.windows().length
  const activeBefore = await m.main.evaluate(() => (window as unknown as { mybuildy: { projects: { getActive(): Promise<{ id: string }> } } }).mybuildy.projects.getActive())

  await m.main.getByTitle('Set Goal').click()
  await m.main.getByRole('button', { name: '+ New project' }).click()

  await expect.poll(async () => (await m.main.evaluate(() => (window as unknown as { mybuildy: { projects: { getActive(): Promise<{ id: string }> } } }).mybuildy.projects.getActive())).id)
    .not.toBe(activeBefore.id)
  await m.main.waitForTimeout(500)
  expect(await count()).toEqual(before)
  expect(m.app.windows().length).toBe(pagesBefore)
  // Still the same main window, now on the new project.
  await expect(m.main.getByText('What are you building?')).toBeVisible()
})

test('Delete project: a named confirmation, the name typed, an explicit Delete button', async () => {
  const page = m.main
  const api = () => page.evaluate(() => (window as unknown as { mybuildy: { projects: { list(): Promise<Array<{ id: string; name: string }>> } } }).mybuildy.projects.list())
  const projects = await api()
  expect(projects.length).toBeGreaterThanOrEqual(2) // the first project + the one made above
  const target = projects[0]

  await page.getByRole('button', { name: 'Manage projects' }).click()
  await expect(page.locator('[data-project-id]')).toHaveCount(projects.length) // the list has settled
  // Two projects can share a name ("My project"): pick the row by id.
  await page.locator(`[data-project-id="${target.id}"]`).getByRole('button', { name: 'Delete', exact: false }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(`Delete “${target.name}”?`)
  const confirm = dialog.getByRole('button', { name: `Delete “${target.name}”` })
  await expect(confirm).toBeDisabled()          // never a bare OK
  await dialog.getByLabel(/Type .* to confirm/).fill('something else')
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel(/Type .* to confirm/).fill(target.name)
  await confirm.click()

  await expect.poll(async () => (await api()).map((p) => p.id)).not.toContain(target.id)
  // Now only one project is left: it can't be deleted.
  const [last] = await api()
  await expect(page.locator(`[data-project-id="${last.id}"]`).getByRole('button')).toBeDisabled()
  await expect(page.getByText("You can't delete your only project.")).toBeVisible()
})
