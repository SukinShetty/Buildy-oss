// speech-formatter.test.ts
// Guards against the real "voice cutoff" root cause: the formatter truncating
// sentences (old 60/50-char caps) before TTS, so the audio spoke fragments.

import { describe, it, expect } from 'vitest'
import { formatSpokenGuidance } from './speech-formatter'

const WHAT_HAPPENED =
  'Claude Code just finished fixing a bug where a stop hook suspended audio playback.'
const WHAT_TO_DO_NEXT =
  'Run the demo preparation script to get CIVITAS into a clean, demo-ready state, then record the walkthrough.'

describe('formatSpokenGuidance — no truncation', () => {
  it('keeps the COMPLETE text of both fields (new_step)', () => {
    const tts = formatSpokenGuidance(WHAT_HAPPENED, WHAT_TO_DO_NEXT, 'new_step')

    // Full content of whatHappened survives (not cut at ~60 chars / "stop hook.").
    expect(tts).toContain('suspended audio playback')
    // Full content of whatToDoNext survives (not cut at ~50 chars / "run the.").
    expect(tts).toContain('demo-ready state')
    expect(tts).toContain('record the walkthrough')

    // And it must NOT be the truncated fragment that ended in "run the.".
    expect(tts).not.toMatch(/run the\.?$/)
    expect(tts.endsWith('run the.')).toBe(false)
  })

  it('does not truncate for any change type', () => {
    for (const type of ['new_step', 'completion', 'progress', 'blocker', 'error', null]) {
      const tts = formatSpokenGuidance(WHAT_HAPPENED, WHAT_TO_DO_NEXT, type)
      expect(tts).toContain('record the walkthrough')
    }
  })

  it('still strips a long path but keeps the surrounding sentence', () => {
    const tts = formatSpokenGuidance(
      'It edited the file and saved your changes successfully.',
      'Now run the build to confirm everything compiles.',
      'progress'
    )
    expect(tts).toContain('saved your changes successfully')
    expect(tts).toContain('confirm everything compiles')
  })
})
