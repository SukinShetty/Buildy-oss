import { describe, it, expect } from 'vitest'
import {
  permissionSettingsUrl,
  screenPermissionMissing,
  isBlankFrame,
} from './mac-permissions-core'

describe('permissionSettingsUrl', () => {
  it('maps each permission to its fixed Privacy & Security pane', () => {
    expect(permissionSettingsUrl('screen')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
    expect(permissionSettingsUrl('accessibility')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    )
    expect(permissionSettingsUrl('automation')).toBe(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
    )
  })
})

describe('screenPermissionMissing', () => {
  it('never blocks on Windows or Linux', () => {
    for (const platform of ['win32', 'linux']) {
      for (const status of ['denied', 'not-determined', 'restricted', 'unknown', 'granted']) {
        expect(screenPermissionMissing(platform, status)).toBe(false)
      }
    }
  })

  it('blocks on macOS unless the status is granted', () => {
    expect(screenPermissionMissing('darwin', 'granted')).toBe(false)
    for (const status of ['denied', 'not-determined', 'restricted']) {
      expect(screenPermissionMissing('darwin', status)).toBe(true)
    }
  })

  it('does not block on an unknown status (older macOS) — the blank-frame check covers it', () => {
    expect(screenPermissionMissing('darwin', 'unknown')).toBe(false)
  })
})

describe('isBlankFrame', () => {
  /** A BGRA bitmap filled with one colour, optionally with one differing pixel. */
  function bitmap(width: number, height: number, bgra: number[], odd?: { x: number; y: number; bgra: number[] }): Uint8Array {
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) data.set(bgra, i * 4)
    if (odd) data.set(odd.bgra, (odd.y * width + odd.x) * 4)
    return data
  }

  it('treats an empty image as blank', () => {
    expect(isBlankFrame(new Uint8Array(0), 0, 0)).toBe(true)
  })

  it('treats a single flat colour (what macOS returns without permission) as blank', () => {
    expect(isBlankFrame(bitmap(160, 100, [0, 0, 0, 255]), 160, 100)).toBe(true)
    expect(isBlankFrame(bitmap(160, 100, [30, 30, 30, 255]), 160, 100)).toBe(true)
  })

  it('treats any visible detail as NOT blank (a dark terminal with one glyph is real content)', () => {
    const img = bitmap(160, 100, [0, 0, 0, 255], { x: 80, y: 50, bgra: [200, 200, 200, 255] })
    expect(isBlankFrame(img, 160, 100)).toBe(false)
  })

  it('ignores differences in the alpha channel only', () => {
    const img = bitmap(10, 10, [0, 0, 0, 255], { x: 3, y: 3, bgra: [0, 0, 0, 0] })
    expect(isBlankFrame(img, 10, 10)).toBe(true)
  })
})
