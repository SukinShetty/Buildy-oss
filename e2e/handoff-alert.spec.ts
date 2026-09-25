// handoff-alert.spec.ts — the mascot's "!" alert clears when the user clicks
// either hand-off button, and does not come back for that same hand-off.
// DEV BUILD ONLY (uses the gated e2e fixture hook, src/main/e2e-hooks.ts): the
// hand-off analysis goes through the app's real path — companion window →
// guidance window → HandoffCard buttons → main → companion. No AI call.

import { test, expect } from '@playwright/test'
import { launchMyBuildy, IS_PACKAGED_RUN, type MyBuildyApp } from './helpers'

test.skip(IS_PACKAGED_RUN, 'The fixture hook is dev-build only')

let mybuildy: MyBuildyApp

test.beforeEach(async () => {
  mybuildy = await launchMyBuildy()
})

test.afterEach(async () => {
  await mybuildy?.close()
})

async function sendHandoff(analyzedAt?: string): Promise<string> {
  return mybuildy.app.evaluate((_electron, at) => {
    const hooks = (globalThis as Record<string, unknown>)['__mybuildyE2E'] as
      | { sendFixtureHandoff(at?: string): string }
      | undefined
    if (!hooks) throw new Error('e2e fixture hook missing — is MYBUILDY_E2E=1 set?')
    return hooks.sendFixtureHandoff(at)
  }, analyzedAt)
}

for (const button of ["I'll decide", 'Skip for now']) {
  test(`"${button}" clears the "!" alert, and it does not come back for that hand-off`, async () => {
    const badge = mybuildy.companion.getByTestId('mascot-alert-badge')
    const at = await sendHandoff()
    await expect(badge).toBeVisible()
    await expect(mybuildy.guidance.getByText('This needs your decision')).toBeVisible()

    await mybuildy.guidance.getByRole('button', { name: button }).click()
    await expect(badge).toHaveCount(0) // cleared at once

    // Main re-sends the same analysis when a background pass patches it…
    await sendHandoff(at)
    // …and a later cycle may ask the same question again.
    await sendHandoff(new Date(Date.parse(at) + 60_000).toISOString())
    await mybuildy.companion.waitForTimeout(700)
    await expect(badge).toHaveCount(0)
  })
}
