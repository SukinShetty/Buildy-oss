import { describe, it, expect } from 'vitest'
import {
  sanitizePromptForSend,
  evaluateSendEligibility,
  buildSendCommand,
  POWERSHELL_SEND_SCRIPT,
} from './prompt-sender-core'
import type { SendEligibilityInput } from './prompt-sender-core'

describe('sanitizePromptForSend', () => {
  it('collapses every newline run to a single space', () => {
    expect(sanitizePromptForSend('line one\nline two\r\nline three')).toBe(
      'line one line two line three'
    )
    expect(sanitizePromptForSend('a\n\n\n\nb\r\n\r\nc')).toBe('a b c')
  })

  it('strips control characters', () => {
    const ctl = String.fromCharCode(0) + 'b' + String.fromCharCode(7) + 'c' + String.fromCharCode(9); expect(sanitizePromptForSend('a' + ctl + 'd')).toBe('abcd')
  })

  it('trims and handles empty input', () => {
    expect(sanitizePromptForSend('  padded  ')).toBe('padded')
    expect(sanitizePromptForSend('\n\n')).toBe('')
    expect(sanitizePromptForSend('')).toBe('')
  })
})

describe('evaluateSendEligibility', () => {
  const allGood: SendEligibilityInput = {
    platform: 'win32',
    watchActive: true,
    windowFound: true,
    terminalState: 'awaiting_prompt',
    hasDisplayedPrompt: true,
    sendInFlight: false,
  }

  it('allows sending when every condition holds', () => {
    const r = evaluateSendEligibility(allGood)
    expect(r.canSend).toBe(true)
    expect(r.sendBlockedReason).toBe('')
  })

  it('blocks on non-Windows platforms', () => {
    for (const platform of ['darwin', 'linux']) {
      const r = evaluateSendEligibility({ ...allGood, platform })
      expect(r.canSend).toBe(false)
      expect(r.sendBlockedReason).not.toBe('')
    }
  })

  it('blocks when the watch is not active', () => {
    const r = evaluateSendEligibility({ ...allGood, watchActive: false })
    expect(r.canSend).toBe(false)
    expect(r.sendBlockedReason).not.toBe('')
  })

  it('blocks when the watched window is no longer found', () => {
    const r = evaluateSendEligibility({ ...allGood, windowFound: false })
    expect(r.canSend).toBe(false)
    expect(r.sendBlockedReason).not.toBe('')
  })

  it('blocks unless the terminal is awaiting a prompt', () => {
    for (const state of ['working', 'permission_prompt', 'not_a_coding_agent', 'unknown', undefined] as const) {
      const r = evaluateSendEligibility({ ...allGood, terminalState: state })
      expect(r.canSend).toBe(false)
      expect(r.sendBlockedReason).not.toBe('')
    }
  })

  it('blocks when there is no displayed prompt', () => {
    const r = evaluateSendEligibility({ ...allGood, hasDisplayedPrompt: false })
    expect(r.canSend).toBe(false)
    expect(r.sendBlockedReason).not.toBe('')
  })

  it('blocks while a send is already in flight', () => {
    const r = evaluateSendEligibility({ ...allGood, sendInFlight: true })
    expect(r.canSend).toBe(false)
    expect(r.sendBlockedReason).not.toBe('')
  })
})

describe('buildSendCommand — no user content in the command string', () => {
  const prompt = 'BUILDY_SECRET_PROMPT: build the /dashboard route with a table'
  const title = 'BUILDY SECRET WINDOW TITLE — claude in ~/my-app'

  it('never interpolates the prompt text or the window title', () => {
    const cmd = buildSendCommand(prompt, title)
    const full = [cmd.exe, ...cmd.args].join(' ')
    expect(full).not.toContain(prompt)
    expect(full).not.toContain('BUILDY_SECRET_PROMPT')
    expect(full).not.toContain(title)
    expect(full).not.toContain('SECRET WINDOW TITLE')
  })

  it('passes the title ONLY via the BUILDY_TARGET_TITLE environment variable', () => {
    const cmd = buildSendCommand(prompt, title)
    expect(cmd.env.BUILDY_TARGET_TITLE).toBe(title)
    expect(POWERSHELL_SEND_SCRIPT).toContain('$env:BUILDY_TARGET_TITLE')
  })

  it('uses the fixed powershell invocation and fixed keystrokes only', () => {
    const cmd = buildSendCommand(prompt, title)
    expect(cmd.exe).toBe('powershell.exe')
    expect(cmd.args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
    expect(cmd.args[3]).toBe(POWERSHELL_SEND_SCRIPT)
    expect(POWERSHELL_SEND_SCRIPT).toContain("SendWait('^v')")
    expect(POWERSHELL_SEND_SCRIPT).toContain("SendWait('{ENTER}')")
  })
})
