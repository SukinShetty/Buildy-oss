import { describe, it, expect } from 'vitest'
import { SendAuthorizer, shouldRegisterOutcome, type SendContext } from './send-authorization'

const ctx = (over: Partial<SendContext> = {}): SendContext => ({
  promptId: 'p-1',
  promptText: 'Add a search box to the header',
  projectId: 'proj-A',
  session: 7,
  sourceId: 'window:42:0',
  ...over,
})

describe('SendAuthorizer — bind at click time, revalidate, consume once', () => {
  it('authorizes a click that matches the displayed prompt and binds every field', () => {
    const auth = new SendAuthorizer()
    const r = auth.authorize('p-1', ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.binding).toEqual(ctx())
  })

  it('rejects a click for a prompt id that is no longer displayed', () => {
    const r = new SendAuthorizer().authorize('p-old', ctx())
    expect(r).toEqual({ ok: false, reason: 'The prompt changed before it could be pasted.' })
  })

  it('consumes the authorization only on a successful paste: a second paste is refused', () => {
    const auth = new SendAuthorizer()
    expect(auth.authorize('p-1', ctx()).ok).toBe(true)
    auth.finish('p-1', true)
    expect(auth.authorize('p-1', ctx())).toEqual({ ok: false, reason: 'This prompt was already pasted.' })
  })

  it('a click while the same prompt is still pasting is refused', () => {
    const auth = new SendAuthorizer()
    expect(auth.authorize('p-1', ctx()).ok).toBe(true)
    expect(auth.authorize('p-1', ctx())).toEqual({ ok: false, reason: 'This prompt is already being pasted.' })
  })

  it('a failed attempt (e.g. a missing macOS permission) can be retried for the same prompt', () => {
    const auth = new SendAuthorizer()
    expect(auth.authorize('p-1', ctx()).ok).toBe(true)
    auth.finish('p-1', false) // permission missing / window not in front / timeout
    const retry = auth.authorize('p-1', ctx())
    expect(retry.ok).toBe(true)
    auth.finish('p-1', true)
    expect(auth.authorize('p-1', ctx()).ok).toBe(false)
  })

  it('revalidation passes while nothing changed', () => {
    const auth = new SendAuthorizer()
    const r = auth.authorize('p-1', ctx())
    if (!r.ok) throw new Error('expected ok')
    expect(auth.changed(r.binding, ctx())).toBeNull()
  })

  it('revalidation names exactly what changed after an await', () => {
    const auth = new SendAuthorizer()
    const r = auth.authorize('p-1', ctx())
    if (!r.ok) throw new Error('expected ok')
    const b = r.binding
    expect(auth.changed(b, ctx({ promptText: 'Delete the database' }))).toBe('The prompt changed before it could be pasted.')
    expect(auth.changed(b, ctx({ promptId: 'p-2' }))).toBe('The prompt changed before it could be pasted.')
    expect(auth.changed(b, ctx({ projectId: 'proj-B' }))).toBe('The project changed before the prompt could be pasted.')
    expect(auth.changed(b, ctx({ session: 8 }))).toBe('The watch was restarted before the prompt could be pasted.')
    expect(auth.changed(b, ctx({ sourceId: 'window:99:0' }))).toBe('The watched window changed before the prompt could be pasted.')
    expect(auth.changed(b, ctx({ sourceId: null }))).toBe('The watched window changed before the prompt could be pasted.')
  })

  it('refuses when nothing is displayed', () => {
    expect(new SendAuthorizer().authorize('p-1', ctx({ promptId: null })).ok).toBe(false)
    expect(new SendAuthorizer().authorize('p-1', ctx({ promptText: '  ' })).ok).toBe(false)
  })
})

describe('shouldRegisterOutcome — the verifier only tracks prompts that were actually pasted', () => {
  it('registers only for a successful paste whose binding still holds', () => {
    expect(shouldRegisterOutcome({ sent: true }, null)).toBe(true)
    expect(shouldRegisterOutcome({ sent: false, reason: 'window_not_in_front' }, null)).toBe(false)
    expect(shouldRegisterOutcome({ sent: true }, 'The project changed before the prompt could be pasted.')).toBe(false)
  })
})
