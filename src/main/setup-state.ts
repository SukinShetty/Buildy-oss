// setup-state.ts — main process. Where the first-run setup wizard is up to.
//
// Stored in <userData>/setup-state.json as { completed, step }. `step` is saved
// on every step change, so a restart (the macOS Screen Recording step needs
// one) resumes exactly where the user was. Delete all data removes the file.
//
// The rule for whether setup still needs to run (needsSetup) is pure and
// unit-tested (setup-state.test.ts).

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

export interface SetupState {
  completed: boolean
  step: string | null
}

export const SETUP_STATE_FILE = 'setup-state.json'

export function loadSetupState(userDataDir: string): SetupState | null {
  try {
    const raw = JSON.parse(readFileSync(join(userDataDir, SETUP_STATE_FILE), 'utf8')) as Partial<SetupState>
    return {
      completed: raw.completed === true,
      step: typeof raw.step === 'string' && raw.step.length <= 40 ? raw.step : null,
    }
  } catch {
    return null // no file yet (first launch) or unreadable
  }
}

export function saveSetupState(userDataDir: string, state: SetupState): void {
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, SETUP_STATE_FILE), JSON.stringify(state, null, 2), 'utf8')
}

/**
 * Does the setup wizard need to run?
 *   - a saved state decides: not completed → yes;
 *   - no saved state (a fresh install, or one from before the wizard existed):
 *     yes unless MyBuildy is already fully set up — a model that is configured
 *     AND a goal — so people already using it are not sent back through setup.
 */
export function needsSetup(state: SetupState | null, modelConfigured: boolean, hasGoal: boolean): boolean {
  if (state) return !state.completed
  return !(modelConfigured && hasGoal)
}
