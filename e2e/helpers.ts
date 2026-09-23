// e2e/helpers.ts — shared launch/teardown for the Buildy Electron e2e suite.
//
// Every launch:
//   - creates a FRESH throwaway profile dir and passes it as
//     BUILDY_USER_DATA_DIR (honoured only under BUILDY_E2E=1 — bootstrap.ts)
//   - snapshots the REAL userData folder (path + mtime + size of every file,
//     recursively) and asserts after close that nothing changed — the whole
//     point of the isolation
//   - waits for all four windows (main / companion / guidance / voice) and
//     collects renderer console errors + uncaught main-process errors
//
// No test in this suite ever calls an AI provider: the fresh profile has no
// key and no model, so every analysis path refuses by design.

import { _electron, type ElectronApplication, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const DEV_MAIN_ENTRY = path.join(ROOT, 'out', 'main', 'index.js')

/** Packaged-exe mode: set by scripts/e2e-packaged.mjs (npm run test:e2e:packaged). */
export const PACKAGED_EXE = process.env.BUILDY_E2E_EXE || null
export const IS_PACKAGED_RUN = !!PACKAGED_EXE

/** The REAL Buildy profile on this machine — must never be touched by e2e. */
export function realUserDataDir(): string {
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'buildy')
}

type DirSnapshot = Map<string, string>

/** Recursive listing of path -> "mtimeMs:size" for every file under dir. */
function snapshotDir(dir: string): DirSnapshot {
  const snapshot: DirSnapshot = new Map()
  if (!fs.existsSync(dir)) return snapshot
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      try {
        if (entry.isDirectory()) walk(full)
        else {
          const st = fs.statSync(full)
          snapshot.set(full, `${st.mtimeMs}:${st.size}`)
        }
      } catch {
        // A file vanishing mid-walk (unrelated process) — record its absence.
        snapshot.set(full, 'unreadable')
      }
    }
  }
  walk(dir)
  return snapshot
}

function diffSnapshots(before: DirSnapshot, after: DirSnapshot): string[] {
  const diffs: string[] = []
  for (const [file, sig] of after) {
    const prev = before.get(file)
    if (prev === undefined) diffs.push(`created: ${file}`)
    else if (prev !== sig) diffs.push(`modified: ${file}`)
  }
  for (const file of before.keys()) {
    if (!after.has(file)) diffs.push(`deleted: ${file}`)
  }
  return diffs
}

export interface BuildyApp {
  app: ElectronApplication
  profileDir: string
  main: Page
  companion: Page
  guidance: Page
  voice: Page
  /** Renderer console errors + page errors collected since launch. */
  rendererErrors: string[]
  /** Uncaught main-process exceptions / unhandled rejections since launch. */
  mainErrors(): Promise<string[]>
  /** Close the app and assert the real userData folder is untouched. */
  close(): Promise<void>
}

function windowKind(url: string): 'main' | 'companion' | 'guidance' | 'voice' {
  if (url.includes('companion=true')) return 'companion'
  if (url.includes('guidance=true')) return 'guidance'
  if (url.includes('voice=true')) return 'voice'
  return 'main'
}

export async function launchBuildy(): Promise<BuildyApp> {
  if (IS_PACKAGED_RUN) {
    if (!fs.existsSync(PACKAGED_EXE!)) {
      throw new Error(
        `Packaged exe not found: ${PACKAGED_EXE}\n` +
        'Build it first with `npm run package` (Phase 9), then re-run npm run test:e2e:packaged.'
      )
    }
  } else if (!fs.existsSync(DEV_MAIN_ENTRY)) {
    throw new Error(
      `Dev build not found: ${DEV_MAIN_ENTRY}\nRun \`npm run build\` first (npm run test:e2e does this automatically).`
    )
  }

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildy-e2e-'))
  const realDirBefore = snapshotDir(realUserDataDir())

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    BUILDY_E2E: '1',
    BUILDY_USER_DATA_DIR: profileDir,
    // Never inherit a debug/dev-server environment into the tested app.
    BUILDY_DEBUG: '',
    ELECTRON_RENDERER_URL: '',
  }

  const app = await _electron.launch(
    IS_PACKAGED_RUN
      ? { executablePath: PACKAGED_EXE!, env }
      : { args: [DEV_MAIN_ENTRY], env }
  )

  // Collect renderer console errors / uncaught page errors for every window,
  // including windows that appear later.
  const rendererErrors: string[] = []
  const attach = (page: Page): void => {
    const kind = windowKind(page.url())
    page.on('console', (message) => {
      if (message.type() === 'error') rendererErrors.push(`[${kind}] console.error: ${message.text()}`)
    })
    page.on('pageerror', (error) => rendererErrors.push(`[${kind}] pageerror: ${error.message}`))
  }
  app.on('window', attach)
  for (const page of app.windows()) attach(page)

  // Main-process error collector. Registered as early as evaluate() can reach;
  // a crash before this point would fail the launch itself.
  await app.evaluate(() => {
    const errors: string[] = []
    ;(globalThis as Record<string, unknown>)['__e2eMainErrors'] = errors
    process.on('uncaughtException', (error) => errors.push(`uncaughtException: ${String(error)}`))
    process.on('unhandledRejection', (reason) => errors.push(`unhandledRejection: ${String(reason)}`))
  })

  // Wait for all four windows to exist and finish loading.
  const deadline = Date.now() + 30_000
  const pages: Partial<Record<'main' | 'companion' | 'guidance' | 'voice', Page>> = {}
  for (;;) {
    for (const page of app.windows()) {
      const kind = windowKind(page.url())
      if (page.url() && !pages[kind]) pages[kind] = page
    }
    if (pages.main && pages.companion && pages.guidance && pages.voice) break
    if (Date.now() > deadline) {
      const seen = app.windows().map((w) => w.url()).join(', ')
      await app.close().catch(() => undefined)
      throw new Error(`Not all four windows appeared within 30s. Seen: [${seen}]`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await Promise.all(
    Object.values(pages).map((page) => page!.waitForLoadState('domcontentloaded'))
  )

  const wrapped: BuildyApp = {
    app,
    profileDir,
    main: pages.main!,
    companion: pages.companion!,
    guidance: pages.guidance!,
    voice: pages.voice!,
    rendererErrors,
    mainErrors: async () =>
      app.evaluate(() => ((globalThis as Record<string, unknown>)['__e2eMainErrors'] as string[]) ?? []),
    close: async () => {
      // The main window's close handler hides instead of closing (tray app), so
      // ask the main process to exit outright — same guarantee the spec wants:
      // never leave Electron processes running.
      try {
        await app.evaluate(({ app: electronApp }) => {
          setTimeout(() => electronApp.exit(0), 100)
        })
      } catch {
        // Evaluate can fail if the app already died — the kill below covers it.
      }
      try {
        await app.close()
      } catch {
        // Fall through to the hard kill below.
      }
      try {
        app.process().kill()
      } catch {
        // Already exited — good.
      }
      // Give any straggling file handles a moment, then verify isolation:
      await new Promise((resolve) => setTimeout(resolve, 500))
      const diffs = diffSnapshots(realDirBefore, snapshotDir(realUserDataDir()))
      if (diffs.length > 0) {
        throw new Error(
          `ISOLATION FAILURE — the real userData folder changed during the e2e run:\n${diffs.join('\n')}`
        )
      }
      // Best-effort cleanup of the throwaway profile (Windows may keep locks briefly).
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 })
    },
  }
  return wrapped
}
