// e2e-hooks.ts — main process, e2e/dev ONLY.
// A tiny test hook used by the Playwright suite (e2e/screenshots.spec.ts) to
// render the guidance panel from a canned fixture analysis WITHOUT calling any
// AI provider. Registered ONLY when BUILDY_E2E=1 AND the app is not packaged —
// packaged builds never expose it, and normal dev runs (no BUILDY_E2E) don't
// either.
//
// The hook is a main-process global invoked via Playwright's
// electronApp.evaluate(); it deliberately reuses the app's real display
// pathway (showGuidanceWindow -> GUIDANCE_DATA -> GuidancePanel), so the
// screenshot exercises the exact code a live analysis would.
//
// The fixture uses NEUTRAL sample data only (a generic recipe-box app).

import { app } from 'electron'
import { showGuidanceWindow } from './guidance-window'
import type { AnalysisResult } from '../renderer/src/types'

const FIXTURE_ANALYSIS: AnalysisResult = {
  screenContentVisible: true,
  whatIsHappening:
    'The terminal just finished adding the "save recipe" form — the dev server reloaded and all 12 checks passed.',
  whatItMeans: 'Visitors can now type in a recipe and keep it. The core loop of the app works end to end.',
  whatIsBuilt: ['Recipe list page', 'Save-recipe form', 'Search by ingredient'],
  whatIsMissing: ['Photo upload for each recipe', 'A way to share a recipe with a friend'],
  whatIsBroken: [],
  whereUserIsStuck: null,
  bestNextMove: 'Add photo upload next — recipes without pictures are much harder to browse.',
  nextPrompt:
    'Add a photo upload field to the save-recipe form. Store the image locally and show it at the top of the recipe page.',
  expectedOutcome: 'The save-recipe form shows a photo picker and a saved recipe displays its photo.',
  builderNote: "Nice progress — the app already does the one thing it promised. Photos will make it feel real.",
  goalAlignment: 'on-track',
  alignmentNote: 'Everything on screen moves the recipe box closer to something a friend could use.',
  projectUnderstandingNote: 'a simple recipe box where anyone can save and find home recipes',
  verification: { status: 'success', note: 'The save-recipe form from the last prompt now works.' },
  terminalState: 'awaiting_prompt',
  agentName: 'claude_code',
  sendGuard: null,
  callsThisHour: 3,
  promptId: 'e2e-fixture-prompt',
  analyzedAt: new Date().toISOString(),
  analysisDurationMs: 1234,
}

interface E2eHooks {
  showFixtureGuidance(): void
}

/** Register the gated e2e test hooks. No-op outside BUILDY_E2E=1 dev runs. */
export function registerE2eTestHooks(): void {
  if (process.env['BUILDY_E2E'] !== '1' || app.isPackaged) return
  const hooks: E2eHooks = {
    showFixtureGuidance(): void {
      showGuidanceWindow({
        kind: 'analysis',
        analysis: { ...FIXTURE_ANALYSIS, analyzedAt: new Date().toISOString() },
      })
    },
  }
  ;(globalThis as Record<string, unknown>)['__buildyE2E'] = hooks
  console.log('[E2E] test hooks registered (BUILDY_E2E dev run only)')
}
