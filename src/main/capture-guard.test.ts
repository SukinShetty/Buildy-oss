import { describe, it, expect } from 'vitest'
import { captureHaltReason, isStaleSession } from './capture-guard'

describe('captureHaltReason — no silent full-screen fallback', () => {
  it('halts with no-source when nothing is selected', () => {
    expect(captureHaltReason(null, false)).toBe('no-source')
    expect(captureHaltReason(null, true)).toBe('no-source')
  })

  it('halts with window-missing when the selected window is gone', () => {
    expect(captureHaltReason('window:42', false)).toBe('window-missing')
  })

  it('proceeds (null) only when a selected window is found', () => {
    expect(captureHaltReason('window:42', true)).toBeNull()
  })
})

describe('isStaleSession — discard wrong-window results', () => {
  it('keeps a result from the current session', () => {
    expect(isStaleSession(5, 5)).toBe(false)
  })

  it('discards a result whose session has advanced (window switched/stopped)', () => {
    expect(isStaleSession(5, 6)).toBe(true)
    expect(isStaleSession(5, 0)).toBe(true)
  })
})
