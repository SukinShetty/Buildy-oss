// semantic-dedup.test.ts
import { describe, it, expect } from 'vitest'
import { isSemanticDuplicate, RecentTopics, normalizeTokens, subjectKey } from './semantic-dedup'

const VARIANTS = [
  'All 6 AI models fully downloaded and installed is done',
  'All 6 target AI models fully installed with no incomplete downloads is done',
  'All 6 AI models confirmed installed (qwen3:1.7b, llama3) is done',
  'All 6 target AI models confirmed fully installed with no incomplete downloads is done',
]

describe('isSemanticDuplicate', () => {
  it('treats the 4 "6 models installed" variants as duplicates of each other', () => {
    for (let i = 1; i < VARIANTS.length; i++) {
      expect(isSemanticDuplicate(VARIANTS[0], VARIANTS[i])).toBe(true)
    }
  })

  it('does NOT treat genuinely different completions as duplicates', () => {
    expect(isSemanticDuplicate(VARIANTS[0], 'Test chart image created for the report')).toBe(false)
    expect(isSemanticDuplicate(VARIANTS[0], '589 GB of disk space is available')).toBe(false)
    expect(isSemanticDuplicate('589 GB disk space available', 'The per-session hook fix is working')).toBe(false)
  })

  it('normalizes away the called-out filler words', () => {
    expect(normalizeTokens('All 6 target AI models fully confirmed installed').sort())
      .toEqual(['6', 'ai', 'installed', 'models'])
    expect(subjectKey(VARIANTS[0])).toBe(subjectKey(VARIANTS[1]))
  })
})

describe('RecentTopics (time-windowed)', () => {
  it('speaks the FIRST of 4 near-duplicates and skips the other 3 within the window', () => {
    const topics = new RecentTopics(180_000)
    const spoken: string[] = []
    let now = 0
    for (const v of VARIANTS) {
      now += 30_000 // 30s apart → all within 3 min
      if (!topics.isDuplicate(v, now)) {
        spoken.push(v)
        topics.record(v, now)
      }
    }
    expect(spoken).toEqual([VARIANTS[0]])
  })

  it('speaks a genuinely different completion even within the window', () => {
    const topics = new RecentTopics(180_000)
    const spoken: string[] = []
    let now = 0
    for (const v of [...VARIANTS, '589 GB of disk space is available']) {
      now += 20_000
      if (!topics.isDuplicate(v, now)) { spoken.push(v); topics.record(v, now) }
    }
    expect(spoken).toEqual([VARIANTS[0], '589 GB of disk space is available'])
  })

  it('allows the same fact again after the 3-minute window elapses', () => {
    const topics = new RecentTopics(180_000)
    topics.record(VARIANTS[0], 0)
    expect(topics.isDuplicate(VARIANTS[1], 60_000)).toBe(true)       // within window → dup
    expect(topics.isDuplicate(VARIANTS[1], 200_000)).toBe(false)     // after window → allowed
  })
})
