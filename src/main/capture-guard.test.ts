import { describe, it, expect } from 'vitest'
import { captureHaltReason, isStaleSession, findWatchedSource } from './capture-guard'

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

describe('findWatchedSource — never watch a window the user did not pick', () => {
  const CIVITAS = { id: 'window:42:0', name: 'CIVITAS' }
  const POWERSHELL = { id: 'window:99:0', name: 'Windows PowerShell' }

  it('returns the watched window when its id AND name are both present', () => {
    const live = [CIVITAS, POWERSHELL]
    expect(findWatchedSource(live, 'window:42:0', 'CIVITAS')).toEqual(CIVITAS)
  })

  it('HALTS (returns null) when the stored id is NOT in the current window list', () => {
    const live = [POWERSHELL] // CIVITAS closed, id gone entirely
    expect(findWatchedSource(live, 'window:42:0', 'CIVITAS')).toBeNull()
  })

  it('HALTS when the id was reused by a DIFFERENT window (HWND reuse)', () => {
    // CIVITAS closed; Windows handed its HWND (→ same source id) to PowerShell.
    // A bare id match would return PowerShell and silently watch it. It must not.
    const live = [{ id: 'window:42:0', name: 'Windows PowerShell' }]
    const result = findWatchedSource(live, 'window:42:0', 'CIVITAS')
    expect(result).toBeNull()
    expect(result).not.toEqual(expect.objectContaining({ name: 'Windows PowerShell' }))
  })

  it('HALTS when nothing is selected', () => {
    expect(findWatchedSource([CIVITAS], null, null)).toBeNull()
    expect(findWatchedSource([CIVITAS], null, 'CIVITAS')).toBeNull()
  })

  it('HALTS when the watched window title changed (ambiguous — reselect, never guess)', () => {
    const live = [{ id: 'window:42:0', name: 'CIVITAS — edited' }]
    expect(findWatchedSource(live, 'window:42:0', 'CIVITAS')).toBeNull()
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
