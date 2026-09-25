// A SUCCESSFUL (HTTP 200) response whose body can't be parsed must not leak its
// text: JSON.parse errors quote the body, so a key echoed in a 200 body would
// otherwise reach logs, exceptions and IPC.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => { throw new Error('no userData in unit tests') } },
  safeStorage: { isEncryptionAvailable: () => false },
}))

import { defaultSettings, emptyProjectMemory, type AppSettings } from '../../renderer/src/types'
import { fetchModelsForProvider } from './model-fetch'
import { getProvider } from './provider-registry'
import { callTextCompletion } from './text-completion'
import { readJson, ProviderResponseError } from './provider-errors'

const FAKE_KEY = 'sk-proj-PARSETESTPARSETEST0123456789abcdef'
// JSON.parse quotes the first 10 characters of what it fails on, so a body
// that STARTS with a secret is the case that leaks.
const body = `${FAKE_KEY} is your session token`
const FRAGMENT = FAKE_KEY.slice(0, 10) // what JSON.parse would quote

let logged: string[] = []
beforeEach(() => {
  logged = []
  for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '))
    })
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const settings = (over: Partial<AppSettings> = {}): AppSettings => ({
  ...defaultSettings(), provider: 'openai', modelId: 'gpt-test', apiKey: 'sk-test-00000000000000000000', ...over,
})

async function thrownBy(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a failure')
}

describe('unparseable 200 responses become a plain error code', () => {
  it('readJson reports a code and never the body', async () => {
    const err = await thrownBy(() => readJson(new Response(body, { status: 200 }), 'OpenAI'))
    expect(err).toBeInstanceOf(ProviderResponseError)
    expect(err.message).toContain('BAD_JSON')
    expect(`${err.message} ${err.stack}`).not.toContain(FRAGMENT)
  })

  it('model list: IPC payload and logs are clean', async () => {
    const result = await fetchModelsForProvider(settings())
    expect(JSON.stringify(result)).not.toContain(FRAGMENT)
    expect(logged.join('\n')).not.toContain(FRAGMENT)
  })

  for (const provider of ['anthropic', 'openai', 'gemini', 'ollama'] as const) {
    it(`screen analysis on ${provider}: exception and logs are clean`, async () => {
      const capture = { imageBase64: 'AAAA', windowTitle: 'Terminal', sourceId: 'window:1:0', capturedAt: '2026-01-01T00:00:00Z' }
      const err = await thrownBy(() => getProvider(provider).analyzeScreen(capture, emptyProjectMemory(), settings({ provider })))
      expect(`${err.message} ${err.stack}`).not.toContain(FRAGMENT)
      expect(logged.join('\n')).not.toContain(FRAGMENT)
    })
  }

  it('text completion (grader / verifier path): exception and logs are clean', async () => {
    const err = await thrownBy(() => callTextCompletion({ system: 'system', user: 'user', settings: settings() }))
    expect(`${err.message} ${err.stack}`).not.toContain(FRAGMENT)
    expect(logged.join('\n')).not.toContain(FRAGMENT)
  })
})
