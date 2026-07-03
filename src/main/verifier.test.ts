import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordPendingOutcome, getMostRecentPending, resolveOutcome, clearOutcomes, getOutcomes,
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
})
