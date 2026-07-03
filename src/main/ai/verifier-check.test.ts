import { describe, it, expect } from 'vitest'
import { parseVerifierResponse } from './verifier-check'

describe('parseVerifierResponse — verdict on the previous prompt', () => {
  it('reads a clean success verdict', () => {
    const r = parseVerifierResponse('{"status":"success","note":"The /dashboard route now shows the customer table."}')
    expect(r.status).toBe('success')
    expect(r.note).toContain('customer table')
    expect(r.correctivePrompt).toBeUndefined()
  })

  it('reads a failed verdict and keeps the corrective prompt', () => {
    const r = parseVerifierResponse('{"status":"failed","note":"A build error appeared.","correctivePrompt":"Fix the missing import of Table in App.tsx"}')
    expect(r.status).toBe('failed')
    expect(r.correctivePrompt).toBe('Fix the missing import of Table in App.tsx')
  })

  it('reads a partial verdict with a follow-up prompt', () => {
    const r = parseVerifierResponse('{"status":"partial","note":"The table renders but search is missing.","correctivePrompt":"Add a search box that filters by name"}')
    expect(r.status).toBe('partial')
    expect(r.correctivePrompt).toContain('search box')
  })

  it('reads still_pending when the screen cannot confirm yet', () => {
    const r = parseVerifierResponse('{"status":"still_pending","note":"The command is still running."}')
    expect(r.status).toBe('still_pending')
    expect(r.correctivePrompt).toBeUndefined()
  })

  it('ignores a corrective prompt on success (only failed/partial carry one)', () => {
    const r = parseVerifierResponse('{"status":"success","note":"Done.","correctivePrompt":"should be dropped"}')
    expect(r.status).toBe('success')
    expect(r.correctivePrompt).toBeUndefined()
  })

  it('tolerates prose + markdown fences around the JSON', () => {
    const raw = 'Here is my verdict:\n```json\n{"status":"success","note":"Login works now."}\n```\nHope that helps!'
    const r = parseVerifierResponse(raw)
    expect(r.status).toBe('success')
    expect(r.note).toBe('Login works now.')
  })

  it('normalizes loose status spellings', () => {
    expect(parseVerifierResponse('{"status":"SUCCEEDED"}').status).toBe('success')
    expect(parseVerifierResponse('{"status":"Fail"}').status).toBe('failed')
    expect(parseVerifierResponse('{"status":"partially","correctivePrompt":"x"}').status).toBe('partial')
  })

  it('falls back to still_pending on unparseable / unknown output', () => {
    expect(parseVerifierResponse('not json at all').status).toBe('still_pending')
    expect(parseVerifierResponse('{"status":"weird"}').status).toBe('still_pending')
  })
})
