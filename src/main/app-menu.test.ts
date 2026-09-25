import { describe, it, expect, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { macAppMenuTemplate, macDockMenuTemplate } from './app-menu'

const actions = { openSettings: vi.fn(), showRobot: vi.fn(), hideRobot: vi.fn(), quit: vi.fn() }

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? flatten(i.submenu) : [])])
}

describe('macOS application menu', () => {
  const menu = macAppMenuTemplate(actions)
  const all = flatten(menu)

  it('has the app menu, Edit and Window', () => {
    expect(menu.map((m) => m.label ?? m.role)).toEqual(['MyBuildy', 'editMenu', 'Window'])
  })

  it('Quit MyBuildy is Cmd+Q and runs the full shutdown; Settings… is Cmd+,', () => {
    const quit = all.find((i) => i.label === 'Quit MyBuildy')!
    expect(quit.accelerator).toBe('Cmd+Q')
    ;(quit.click as () => void)()
    expect(actions.quit).toHaveBeenCalledTimes(1)
    expect(all.find((i) => i.label === 'Settings…')!.accelerator).toBe('Cmd+,')
  })

  it('can show and hide the robot, and never offers Reload or DevTools', () => {
    expect(all.map((i) => i.label)).toEqual(expect.arrayContaining(['Show robot', 'Hide robot']))
    const roles = all.map((i) => String(i.role ?? '').toLowerCase())
    for (const forbidden of ['reload', 'forcereload', 'toggledevtools', 'viewmenu']) expect(roles).not.toContain(forbidden)
  })

  it('the Dock menu offers the robot and Settings', () => {
    expect(macDockMenuTemplate(actions).map((i) => i.label)).toEqual(['Show robot', 'Hide robot', 'Settings…'])
  })
})
