import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ELEVENLABS_VOICES, voiceLabel } from './voice-options'

describe('ElevenLabs voice is chosen by name — the raw voice ID is never shown', () => {
  it('known voices show their name', () => {
    expect(voiceLabel('21m00Tcm4TlvDq8ikWAM')).toBe('Rachel (default)')
    for (const v of ELEVENLABS_VOICES) expect(voiceLabel(v.id)).not.toContain(v.id)
  })

  it('an unknown (custom) saved ID is labelled, never displayed', () => {
    expect(voiceLabel('abcdEFGHijklMNOPqrst')).toBe('Custom voice')
  })
})

describe('Settings wording', () => {
  const settings = readFileSync(join(__dirname, 'screens', 'SettingsScreen.tsx'), 'utf8')

  it('the hourly cap is called "Usage limit" in plain English', () => {
    expect(settings).toContain('Usage limit')
    expect(settings).not.toMatch(/API budget/i)
  })

  it('no text box shows the raw voice ID', () => {
    // A <select> shows voice NAMES; a text <input> would show the raw ID.
    expect(settings).not.toMatch(/<input[^>]*value=\{elevenLabsVoiceId\}/)
    expect(settings).not.toContain('Voice ID')
  })

  it('the About box says what MyBuildy is', () => {
    expect(settings).toContain('MyBuildy — your AI coding agent, explained')
  })
})
