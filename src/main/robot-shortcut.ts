// robot-shortcut.ts — main process. The keyboard shortcut that brings the
// robot back after "Hide": Ctrl+Shift+B on Windows, Cmd+Shift+B on macOS.
// Global (it works while another app is in front), registered once at start.

export const ROBOT_SHORTCUT = 'CommandOrControl+Shift+B'

/** How the shortcut is written for people on this platform (tray menu, tooltips). */
export function robotShortcutLabel(platform: string): string {
  return platform === 'darwin' ? 'Cmd+Shift+B' : 'Ctrl+Shift+B'
}

export interface ShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean
  isRegistered(accelerator: string): boolean
}

let onPress: (() => void) | null = null

/** Register the shortcut; false (and a log line) when another app already owns it. */
export function registerRobotShortcut(registry: ShortcutRegistry, bringBack: () => void): boolean {
  onPress = bringBack
  const ok = registry.register(ROBOT_SHORTCUT, bringBack)
  if (!ok || !registry.isRegistered(ROBOT_SHORTCUT)) {
    console.warn(`[Robot] ${ROBOT_SHORTCUT} is taken by another app — use the tray icon to bring the robot back`)
    return false
  }
  return true
}

/** The same action the shortcut runs (e2e presses it through this). */
export function pressRobotShortcut(): void {
  onPress?.()
}
