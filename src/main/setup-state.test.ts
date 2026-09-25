import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { loadSetupState, saveSetupState, needsSetup, SETUP_STATE_FILE } from './setup-state'

const dir = mkdtempSync(join(tmpdir(), 'mybuildy-setup-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('when the setup wizard shows', () => {
  it('a fresh install (no state, nothing configured) runs setup', () => {
    expect(needsSetup(null, false, false)).toBe(true)
  })
  it('an install from before the wizard that is fully set up is not sent back through it', () => {
    expect(needsSetup(null, true, true)).toBe(false)
  })
  it('an older install that never finished (no goal, or no model) gets the wizard', () => {
    expect(needsSetup(null, true, false)).toBe(true)
    expect(needsSetup(null, false, true)).toBe(true)
  })
  it('a saved state decides: unfinished → setup, finished → not (even with nothing configured)', () => {
    expect(needsSetup({ completed: false, step: 'goal' }, true, true)).toBe(true)
    expect(needsSetup({ completed: true, step: null }, false, false)).toBe(false)
  })
})

describe('setup state on disk (resume after a restart)', () => {
  it('saves and reloads the step', () => {
    saveSetupState(dir, { completed: false, step: 'screen' })
    expect(loadSetupState(dir)).toEqual({ completed: false, step: 'screen' })
  })
  it('ignores a malformed file or step', () => {
    writeFileSync(join(dir, SETUP_STATE_FILE), JSON.stringify({ completed: 'yes', step: 'x'.repeat(100) }))
    expect(loadSetupState(dir)).toEqual({ completed: false, step: null })
    writeFileSync(join(dir, SETUP_STATE_FILE), 'not json')
    expect(loadSetupState(dir)).toBeNull()
  })
})
