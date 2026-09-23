// cost-guard.test.ts
// Rolling-hour cost cap: provider calls (analysis + grader + verifier) are
// counted in a sliding 60-minute window. At the cap, watching pauses; as the
// window slides past old calls, capacity frees up again.

import { describe, it, expect } from 'vitest'
import { recordCall, callsInWindow, atCap, HOUR_MS } from './cost-guard'
import type { RollingWindow } from './cost-guard'

const T0 = 1_700_000_000_000 // fixed fake epoch

function makeWindow(): RollingWindow {
  return { timestamps: [] }
}

describe('rolling hour window', () => {
  it('counts calls inside the window', () => {
    const w = makeWindow()
    recordCall(w, T0)
    recordCall(w, T0 + 1000)
    recordCall(w, T0 + 2000)
    expect(callsInWindow(w, T0 + 2000)).toBe(3)
  })

  it('reaches the cap exactly at the configured number of calls', () => {
    const w = makeWindow()
    for (let i = 0; i < 119; i++) recordCall(w, T0 + i)
    expect(atCap(w, 120, T0 + 200)).toBe(false)
    recordCall(w, T0 + 200)
    expect(atCap(w, 120, T0 + 201)).toBe(true)
  })

  it('slides: calls older than one hour drop out of the count', () => {
    const w = makeWindow()
    for (let i = 0; i < 120; i++) recordCall(w, T0 + i * 1000)
    expect(atCap(w, 120, T0 + 120_000)).toBe(true)
    // Advance the fake clock just past one hour after the first 60 calls.
    const later = T0 + 59 * 1000 + HOUR_MS + 1
    expect(callsInWindow(w, later)).toBe(60)
    expect(atCap(w, 120, later)).toBe(false)
  })

  it('a full hour of silence resets the window completely', () => {
    const w = makeWindow()
    for (let i = 0; i < 500; i++) recordCall(w, T0 + i)
    expect(callsInWindow(w, T0 + 500 + HOUR_MS)).toBe(0)
  })

  it('respects a custom cap (settings-editable, 20–600)', () => {
    const w = makeWindow()
    for (let i = 0; i < 20; i++) recordCall(w, T0 + i)
    expect(atCap(w, 20, T0 + 100)).toBe(true)
    expect(atCap(w, 600, T0 + 100)).toBe(false)
  })
})
