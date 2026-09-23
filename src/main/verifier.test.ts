import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  recordPendingOutcome, getMostRecentPending, resolveOutcome, clearOutcomes, getOutcomes,
  replacePendingOutcome, setVerifierProject,
} from './verifier'

describe('verifier — pending prompt-outcome tracking', () => {
  beforeEach(() => clearOutcomes())

  it('records a pending outcome only when both prompt and expected outcome exist', () => {
    expect(recordPendingOutcome('', 'something')).toBeNull()
    expect(recordPendingOutcome('do a thing', '')).toBeNull()
    const o = recordPendingOutcome('Build the /dashboard route', 'A table of customers renders')
    expect(o).not.toBeNull()
    expect(o!.status).toBe('pending')
    expect(getMostRecentPending()?.id).toBe(o!.id)
  })

  it('assigns unique ids even for outcomes recorded in the same millisecond', () => {
    const a = recordPendingOutcome('p1', 'o1')!
    const b = recordPendingOutcome('p2', 'o2')!
    expect(a.id).not.toBe(b.id)
  })

  it('keeps only the most recent two pending outcomes', () => {
    recordPendingOutcome('p1', 'o1')
    recordPendingOutcome('p2', 'o2')
    const third = recordPendingOutcome('p3', 'o3')
    const outcomes = getOutcomes()
    expect(outcomes).toHaveLength(2)
    expect(getMostRecentPending()?.id).toBe(third!.id)
  })

  it('resolving a terminal verdict drops it from the pending set', () => {
    const o = recordPendingOutcome('p', 'o')!
    resolveOutcome(o.id, 'success', 'It worked')
    expect(getMostRecentPending()).toBeNull()
    expect(getOutcomes()).toHaveLength(0)
  })

  it('a still-pending resolution leaves the outcome in place to retry', () => {
    const o = recordPendingOutcome('p', 'o')!
    resolveOutcome(o.id, 'pending', 'not sure yet')
    expect(getMostRecentPending()?.id).toBe(o.id)
  })

  it('clearOutcomes wipes everything (called on watch start/stop/switch)', () => {
    recordPendingOutcome('p', 'o')
    clearOutcomes()
    expect(getOutcomes()).toHaveLength(0)
    expect(getMostRecentPending()).toBeNull()
  })

  it('replacePendingOutcome replaces rather than stacks (a SENT prompt is the only pending outcome)', () => {
    recordPendingOutcome('suggested but never pasted', 'o1')
    recordPendingOutcome('another unsent suggestion', 'o2')
    const sent = replacePendingOutcome('the prompt actually sent', 'the dashboard renders')
    expect(sent).not.toBeNull()
    expect(getOutcomes()).toHaveLength(1)
    expect(getMostRecentPending()?.id).toBe(sent!.id)
    expect(getMostRecentPending()?.promptText).toBe('the prompt actually sent')
  })

  it('replacePendingOutcome keeps existing outcomes when there is nothing to register', () => {
    const kept = recordPendingOutcome('p1', 'o1')!
    expect(replacePendingOutcome('', 'outcome')).toBeNull()
    expect(replacePendingOutcome('prompt', '')).toBeNull()
    expect(getMostRecentPending()?.id).toBe(kept.id)
  })
})

describe('verifier — per-project namespacing', () => {
  afterAll(() => setVerifierProject('default'))

  it('an outcome recorded in project A is not visible after switching to project B', () => {
    setVerifierProject('proj-a')
    recordPendingOutcome('prompt for project A', 'outcome for project A')
    expect(getMostRecentPending()).not.toBeNull()

    setVerifierProject('proj-b')
    expect(getMostRecentPending()).toBeNull()
    expect(getOutcomes()).toHaveLength(0)
  })

  it('switching projects starts a clean pending set (cleared on switch)', () => {
    setVerifierProject('proj-a')
    recordPendingOutcome('prompt one', 'outcome one')
    setVerifierProject('proj-b')
    recordPendingOutcome('prompt two', 'outcome two')
    // Coming back to A after a switch starts clean — stale pre-switch outcomes
    // are never verified against a different session.
    setVerifierProject('proj-a')
    expect(getMostRecentPending()).toBeNull()
    expect(getOutcomes()).toHaveLength(0)
  })
})
