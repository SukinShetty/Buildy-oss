// capture-notice.spec.ts — the one-time capture disclosure is enforced in MAIN.
// On a fresh profile (notice never accepted) every capture/upload channel is
// refused, even when a renderer calls it directly and skips the notice UI.

import { test, expect } from '@playwright/test'
import { launchMyBuildy, type MyBuildyApp } from './helpers'
import { CAPTURE_NOTICE_REQUIRED_MESSAGE } from '../src/renderer/src/types'

let mybuildy: MyBuildyApp

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterAll(async () => {
  await mybuildy?.close()
})

type Api = {
  mybuildy: {
    captureWindow(sourceId: string | null, name: string | null): Promise<unknown>
    analyze(capture: unknown, project: unknown, settings: unknown): Promise<unknown>
    loadSettings(): Promise<unknown>
    loadProject(): Promise<unknown>
    transcribeAudio(audio: ArrayBuffer): Promise<{ success: boolean; error?: string }>
  }
}

test('Guidance capture is refused until the notice is accepted', async () => {
  const error = await mybuildy.main.evaluate(async () => {
    const api = (window as unknown as Api).mybuildy
    try {
      await api.captureWindow('window:1:0', 'Sample Window')
      return null
    } catch (e) {
      return String(e)
    }
  })
  expect(error).toContain(CAPTURE_NOTICE_REQUIRED_MESSAGE)
})

test('manual analysis (image upload) is refused until the notice is accepted', async () => {
  const error = await mybuildy.main.evaluate(async () => {
    const api = (window as unknown as Api).mybuildy
    const settings = (await api.loadSettings()) as Record<string, unknown>
    const project = await api.loadProject()
    const nonSecret = { ...settings }
    for (const k of ['hasApiKey', 'secretFlags']) delete nonSecret[k]
    try {
      await api.analyze({ imageBase64: 'AAAA', windowTitle: 'Sample Window', sourceId: 'window:1:0', capturedAt: new Date().toISOString() }, project, nonSecret)
      return null
    } catch (e) {
      return String(e)
    }
  })
  expect(error).toContain(CAPTURE_NOTICE_REQUIRED_MESSAGE)
})

test('spoken-question audio is not uploaded until the notice is accepted', async () => {
  const result = await mybuildy.companion.evaluate(async () => {
    const api = (window as unknown as Api).mybuildy
    return api.transcribeAudio(new Uint8Array(2048).buffer)
  })
  expect(result.success).toBe(false)
  expect(result.error).toBe(CAPTURE_NOTICE_REQUIRED_MESSAGE)
})
