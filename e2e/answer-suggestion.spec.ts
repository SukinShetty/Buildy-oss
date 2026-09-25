// answer-suggestion.spec.ts — a spoken-question answer with a suggested goal:
// the answer text is selectable, the goal sits in its own box, and that box's
// Copy button copies ONLY the goal (with its Done-when line), not the reply.
// DEV BUILD ONLY (gated e2e fixture hook, src/main/e2e-hooks.ts). No AI call.
// The user's clipboard is saved before and restored after.

import { test, expect } from '@playwright/test'
import { launchMyBuildy, IS_PACKAGED_RUN, type MyBuildyApp } from './helpers'

test.skip(IS_PACKAGED_RUN, 'The fixture hook is dev-build only')

const GOAL = 'Let people add a photo to each recipe and show it at the top of the recipe page.'
const DONE_WHEN = 'Done when a saved recipe with a photo shows that photo at the top of its page after a restart'
const REPLY = "Here's a goal you can use for recipe photos."

let mybuildy: MyBuildyApp
let savedClipboard = ''

test.beforeAll(async () => {
  mybuildy = await launchMyBuildy()
  savedClipboard = await mybuildy.app.evaluate(({ clipboard }) => clipboard.readText())
})

test.afterAll(async () => {
  await mybuildy?.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard)
  await mybuildy?.close()
})

test('the suggested goal has its own box, and its Copy button copies only the goal', async () => {
  await mybuildy.app.evaluate(() => {
    const hooks = (globalThis as Record<string, unknown>)['__mybuildyE2E'] as { showFixtureAnswer(): void } | undefined
    if (!hooks) throw new Error('e2e fixture hook missing — is MYBUILDY_E2E=1 set?')
    hooks.showFixtureAnswer()
  })

  const g = mybuildy.guidance
  const box = g.getByTestId('answer-suggestion')
  await expect(box).toBeVisible()
  await expect(box).toContainText('Suggested goal')
  await expect(box).toContainText(GOAL)
  await expect(box).toContainText(DONE_WHEN)
  // The reply is its own text, and does not carry the goal.
  const reply = g.getByText(REPLY, { exact: true })
  await expect(reply).toBeVisible()
  await expect(reply).not.toContainText(GOAL)

  // Every piece of answer text can be selected with the mouse.
  for (const el of [reply, g.getByText('Give me a goal for the recipe photos', { exact: true }), box.getByText(GOAL)]) {
    expect(await el.evaluate((node) => getComputedStyle(node).userSelect)).toBe('text')
  }

  await mybuildy.app.evaluate(({ clipboard }) => clipboard.writeText('before'))
  await box.getByRole('button', { name: /Copy/ }).click()
  await expect(box.getByRole('button', { name: /Copied!/ })).toBeVisible()
  const copied = await mybuildy.app.evaluate(({ clipboard }) => clipboard.readText())
  expect(copied).toBe(`${GOAL}\n${DONE_WHEN}`)
})
