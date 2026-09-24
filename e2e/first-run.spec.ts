// first-run.spec.ts — a completely empty profile behaves like a first launch:
// the Settings screen leads with the four recommended providers and a collapsed
// Advanced section, no model is selected anywhere, and trying to watch a window
// is refused with the exact "Choose a model in Settings" message — proving the
// app is inert (no provider calls possible) until the user configures it.

import { test, expect } from '@playwright/test'
import { launchMyBuildy, type MyBuildyApp } from './helpers'
import { CHOOSE_MODEL_MESSAGE } from '../src/renderer/src/types'

let mybuildy: MyBuildyApp

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterAll(async () => {
  await mybuildy?.close()
})

test('first launch opens Settings with 4 recommended providers and Advanced collapsed', async () => {
  // Unconfigured install routes the main panel straight to the Settings screen.
  await expect(mybuildy.main.getByText('Anthropic', { exact: true })).toBeVisible()
  await expect(mybuildy.main.getByText('OpenAI', { exact: true })).toBeVisible()
  await expect(mybuildy.main.getByText('Google Gemini', { exact: true })).toBeVisible()
  await expect(mybuildy.main.getByText('OpenRouter', { exact: true })).toBeVisible()

  // Advanced (local providers) is collapsed by default: toggle visible, options not.
  await expect(mybuildy.main.getByText('Advanced: run models locally')).toBeVisible()
  await expect(mybuildy.main.getByText('Ollama', { exact: true })).toHaveCount(0)
  await expect(mybuildy.main.getByText('LM Studio', { exact: true })).toHaveCount(0)
})

test('no model is selected and no key is stored on a fresh profile', async () => {
  const settings = await mybuildy.main.evaluate(async () => {
    const api = (window as unknown as { mybuildy: { loadSettings(): Promise<unknown> } }).mybuildy
    return api.loadSettings()
  }) as { modelId: string; hasApiKey: boolean; captureNoticeAccepted: boolean }
  expect(settings.modelId).toBe('')
  expect(settings.hasApiKey).toBe(false)
  expect(settings.captureNoticeAccepted).toBe(false)
})

test('watching is blocked with the "Choose a model in Settings" message', async () => {
  // Drive the real companion flow: pick a (fake) window to watch; main must
  // refuse before any capture or provider call because no model is configured.
  const result = await mybuildy.companion.evaluate(async () => {
    const api = (window as unknown as {
      mybuildy: {
        onWatchedSourceChanged(
          handler: (event: unknown, data: { windowName: string | null; message: string | null }) => void
        ): () => void
        selectWatchSource(sourceId: string, windowName: string): Promise<void>
      }
    }).mybuildy
    return new Promise<{ windowName: string | null; message: string | null }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no watched-source response within 10s')), 10_000)
      const unsubscribe = api.onWatchedSourceChanged((_event, data) => {
        clearTimeout(timer)
        unsubscribe()
        resolve(data)
      })
      void api.selectWatchSource('e2e-fake-source-id', 'Sample Window')
    })
  })
  expect(result.windowName).toBeNull()
  expect(result.message).toBe(CHOOSE_MODEL_MESSAGE)
})
