// playwright.config.ts — Electron e2e suite (Windows and macOS).
//
// Install note: playwright/@playwright/test were installed with
// PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 — Electron ships its own Chromium, so no
// Playwright browser download is needed (keep the env var set when running
// `npm install` fresh).
//
// Run modes:
//   npm run test:e2e           — dev build (out/main/index.js; builds first)
//   npm run test:e2e:packaged  — packaged app (dist/win-unpacked/MyBuildy.exe, or on
//                                macOS dist/mac*/MyBuildy.app/.../MyBuildy, via
//                                MYBUILDY_E2E_EXE); dev-only tests self-skip.
//
// Isolation: every launch uses a throwaway profile (MYBUILDY_USER_DATA_DIR,
// honoured only under MYBUILDY_E2E=1 — see src/main/bootstrap.ts) and the shared
// helper asserts the REAL userData folder is byte-untouched after every run.
// No e2e test ever calls an AI provider.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // One Electron app at a time — parallel instances would fight over screen
  // real estate and the desktopCapturer, and give no meaningful speedup.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list']],
  forbidOnly: !!process.env.CI,
})
