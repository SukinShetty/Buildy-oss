// The verifier must only ever judge prompts the user actually pasted. analysis-loop.ts
// is Electron-bound, so this pins the rule structurally: suggestions are never
// recorded as pending outcomes, and the single registration site is gated by
// shouldRegisterOutcome (a successful paste whose click-time binding still held).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(__dirname, 'analysis-loop.ts'), 'utf8')

describe('verifier outcomes are registered only for pasted prompts', () => {
  it('never records a mere suggestion as a pending outcome', () => {
    expect(source).not.toMatch(/recordPendingOutcome\s*\(/)
  })

  it('registers exactly once, inside the successful-paste branch', () => {
    const calls = source.match(/replacePendingOutcome\s*\(/g) ?? []
    expect(calls).toHaveLength(1)
    const gate = source.indexOf('if (shouldRegisterOutcome(result, changedAfterPaste))')
    const registration = source.search(/replacePendingOutcome\s*\(/)
    expect(gate).toBeGreaterThan(-1)
    expect(registration).toBeGreaterThan(gate)
    // …and before that branch closes (no other code path reaches it).
    expect(source.slice(gate, registration)).not.toMatch(/\n  }\n/)
  })
})
