// floating-window.ts — main process. How the mascot and guidance panel float
// above every app, including full-screen ones, without hiding MyBuildy.
//
// macOS: setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) makes
// Electron turn the whole app into a background "UI element" (it hides the
// Dock icon — and with it the menu bar, so Cmd+Q stops working). Instead the
// floating windows are created as type 'panel' (Electron's supported way for a
// window to float over full-screen apps) and the call passes
// skipTransformProcessType, so MyBuildy stays a normal app with a Dock icon
// and an application menu.
//
// Windows / Linux: unchanged — no window type, the same call as before.

import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

const isMac = process.platform === 'darwin'

/** Extra BrowserWindow options for a floating window (macOS: a panel). */
export function floatingWindowOptions(): Partial<BrowserWindowConstructorOptions> {
  return isMac ? { type: 'panel' } : {}
}

/** Show the window on every desktop and above full-screen apps. */
export function floatOnAllWorkspaces(window: BrowserWindow): void {
  if (isMac) window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  else window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
}
