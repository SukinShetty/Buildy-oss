// bootstrap.ts — the REAL main-process entry point (see electron.vite.config.ts,
// which names this chunk `index` so out/main/index.js stays the package.json main).
//
// Why this file exists: the e2e suite isolates every run in a throwaway profile
// by overriding Electron's userData path. But memory.ts computes
// app.getPath('userData') AT IMPORT TIME, so the override must run before any
// app module is evaluated. A static `import './index'` could NOT guarantee that
// (ES imports are hoisted and evaluated before this module's body). Instead the
// app is pulled in with a DYNAMIC import below, which in the CJS bundle
// compiles to a deferred `require()` that runs strictly AFTER the override.
// The ordering is asserted by e2e/launch.spec.ts, which checks that a fresh
// profile dir receives the app's files while the real userData stays untouched.
//
// The override is honoured ONLY under BUILDY_E2E=1 so a stray environment
// variable can never redirect a real user's data.

import { app } from 'electron'

if (process.env['BUILDY_E2E'] === '1' && process.env['BUILDY_USER_DATA_DIR']) {
  app.setPath('userData', process.env['BUILDY_USER_DATA_DIR'])
  // sessionData (Chromium caches etc.) defaults to userData but is re-pointed
  // explicitly so nothing from a test run can leak outside the throwaway dir.
  app.setPath('sessionData', process.env['BUILDY_USER_DATA_DIR'])
  console.log(`[E2E] userData overridden -> ${process.env['BUILDY_USER_DATA_DIR']}`)
}

// Deferred on purpose — see the header comment. Never convert to a static import.
import('./index').catch((error) => {
  console.error('[Bootstrap] failed to load the app:', error)
  process.exit(1)
})
