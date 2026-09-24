// mac-permissions-core.ts — main process (ELECTRON-FREE, unit-tested)
// Pure decisions behind the macOS privacy-permission checks:
//   - Screen Recording: without it macOS hands back window captures with no
//     content, so watching would silently analyse nothing. Checked at watch
//     start from the reported status AND from the first captured frame.
//   - Accessibility / Automation: needed to press Cmd+V and Return for Send
//     (see prompt-sender-core.ts).
// The System Settings URLs are FIXED here; the renderer only ever names a
// permission kind, never a URL.

import type { MacPermission } from '../renderer/src/types'

const PRIVACY_PANE = 'x-apple.systempreferences:com.apple.preference.security'

const SETTINGS_ANCHORS: Record<MacPermission, string> = {
  screen: 'Privacy_ScreenCapture',
  accessibility: 'Privacy_Accessibility',
  automation: 'Privacy_Automation',
}

/** The System Settings > Privacy & Security pane for a permission. */
export function permissionSettingsUrl(permission: MacPermission): string {
  return `${PRIVACY_PANE}?${SETTINGS_ANCHORS[permission]}`
}

/**
 * Should watching be refused because Screen Recording is not granted?
 * `status` is systemPreferences.getMediaAccessStatus('screen'). Only macOS is
 * gated; 'unknown' (older macOS without the API) is let through and left to
 * the blank-frame check, so a status quirk never blocks a working setup.
 */
export function screenPermissionMissing(platform: string, status: string): boolean {
  if (platform !== 'darwin') return false
  return status !== 'granted' && status !== 'unknown'
}

/**
 * Is a captured frame blank — empty, or one flat colour with no detail at all?
 * That is what macOS returns for another app's window without Screen Recording.
 * Deliberately strict (every pixel identical, ignoring alpha) so a real dark
 * terminal with even one glyph on it is never mistaken for a missing permission.
 * `bitmap` is BGRA, row-major (nativeImage.toBitmap()).
 */
export function isBlankFrame(bitmap: Uint8Array, width: number, height: number): boolean {
  const pixels = width * height
  if (pixels <= 0 || bitmap.length < pixels * 4) return true
  const b = bitmap[0], g = bitmap[1], r = bitmap[2]
  for (let i = 4; i < pixels * 4; i += 4) {
    if (bitmap[i] !== b || bitmap[i + 1] !== g || bitmap[i + 2] !== r) return false
  }
  return true
}
