import { describe, it, expect, vi, afterEach } from 'vitest'
import { providerFetch, fetchWithTimeout, withCancellation, CancelledError } from './fetch-with-timeout'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(impl?: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, init })
    return impl ? impl(url, init) : Promise.resolve(new Response('{}', { status: 200 }))
  }))
  return calls
}

describe('providerFetch — credential-bearing requests never follow redirects', () => {
  it('always sends redirect: "error" (fetchWithTimeout included)', async () => {
    const calls = stubFetch()
    await providerFetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer x' } })
    await fetchWithTimeout('https://api.anthropic.com/v1/messages', { method: 'POST', redirect: 'follow' })
    expect(calls.map((c) => c.init.redirect)).toEqual(['error', 'error'])
  })
})

describe('withCancellation — Stop cancels in-flight and future provider calls', () => {
  it('does not call fetch at all once the scope is cancelled', async () => {
    const calls = stubFetch()
    const stop = new AbortController()
    stop.abort()
    await expect(withCancellation(stop.signal, () => providerFetch('https://api.openai.com/v1/x', {}))).rejects.toBeInstanceOf(CancelledError)
    expect(calls).toHaveLength(0)
  })

  it('aborts a request that is already in flight when the scope is cancelled', async () => {
    let seen: AbortSignal | undefined
    stubFetch((_url, init) => {
      seen = init.signal ?? undefined
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    const stop = new AbortController()
    const pending = withCancellation(stop.signal, () => providerFetch('https://api.openai.com/v1/x', {}))
    await Promise.resolve()
    stop.abort()
    await expect(pending).rejects.toBeInstanceOf(CancelledError)
    expect(seen?.aborted).toBe(true)
  })

  it('reaches calls made deep inside the scope, across awaits', async () => {
    const calls = stubFetch()
    const stop = new AbortController()
    const run = withCancellation(stop.signal, async () => {
      await new Promise((r) => setTimeout(r, 5))
      stop.abort() // e.g. the user pressed Stop while this cycle was working
      await new Promise((r) => setTimeout(r, 5))
      return providerFetch('https://api.openai.com/v1/x', {})
    })
    await expect(run).rejects.toBeInstanceOf(CancelledError)
    expect(calls).toHaveLength(0)
  })

  it('leaves calls outside any scope alone', async () => {
    const calls = stubFetch()
    await providerFetch('https://api.openai.com/v1/x', {})
    expect(calls).toHaveLength(1)
  })
})
