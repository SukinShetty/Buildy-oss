// app-menu.ts — main process. The application menu.
//
// Windows / Linux: no menu at all (the stock one exposes Reload and Toggle
// Developer Tools). macOS: a proper app menu — About, Settings… (Cmd+,), Hide,
// Quit MyBuildy (Cmd+Q) — plus Edit (copy/paste in text fields) and Window
// (minimize, show or hide the robot). Never Reload or DevTools.
// The template is pure (unit-tested in app-menu.test.ts).

import type { MenuItemConstructorOptions } from 'electron'

export interface MenuActions {
  openSettings: () => void
  showRobot: () => void
  hideRobot: () => void
  quit: () => void
}

export function macAppMenuTemplate(actions: MenuActions): MenuItemConstructorOptions[] {
  return [
    {
      label: 'MyBuildy',
      submenu: [
        { role: 'about', label: 'About MyBuildy' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: actions.openSettings },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Hide MyBuildy' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        // Our own item (not role 'quit') so it runs the full shutdown directly.
        { label: 'Quit MyBuildy', accelerator: 'Cmd+Q', click: actions.quit },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { label: 'Show robot', click: actions.showRobot },
        { label: 'Hide robot', click: actions.hideRobot },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
}

/** The Dock icon's right-click menu (macOS). Quit is added by macOS itself. */
export function macDockMenuTemplate(actions: MenuActions): MenuItemConstructorOptions[] {
  return [
    { label: 'Show robot', click: actions.showRobot },
    { label: 'Hide robot', click: actions.hideRobot },
    { label: 'Settings…', click: actions.openSettings },
  ]
}
