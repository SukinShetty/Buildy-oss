// e2e-packaged.mjs — run the Playwright Electron suite against the PACKAGED app
// (dist/win-unpacked/Buildy.exe, produced by `npm run package` in Phase 9).
// Dev-only tests (screenshots + fixture hook) self-skip via BUILDY_E2E_EXE.

import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const exe = resolve('dist', 'win-unpacked', 'Buildy.exe')

if (!existsSync(exe)) {
  console.error(
    `[test:e2e:packaged] Packaged app not found: ${exe}\n` +
    'Build it first with `npm run package`, then re-run npm run test:e2e:packaged.'
  )
  process.exit(1)
}

const result = spawnSync('npx', ['playwright', 'test'], {
  stdio: 'inherit',
  env: { ...process.env, BUILDY_E2E_EXE: exe },
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
