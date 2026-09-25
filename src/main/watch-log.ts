// watch-log.ts — main process. A small local diagnostic log of watch and send
// state changes, so a tester's report comes with evidence.
//
// Written to <userData>/logs/watch.log (Settings → "Open log folder"). One line
// per event: ISO time, event, then key=value details (why a watch halted, what
// the OS said about the window, why a send was refused). Window titles and any
// screen text are left out unless debug mode (MYBUILDY_DEBUG) is on — pass them
// as `titles` and they are written only then. Stays on this computer; never
// uploaded. Rotates at 1 MB (one previous file kept). Never throws.

import { appendFileSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'
import { isDebug } from './debug-log'

const MAX_BYTES = 1024 * 1024

let logDir: string | null = null

/** Point the log at <userData>/logs. Called once at startup. */
export function initWatchLog(userDataDir: string): void {
  logDir = join(userDataDir, 'logs')
}

export function watchLogDir(): string | null {
  return logDir
}

type Detail = string | number | boolean | null | undefined

/** Pure: format one log line. Titles only when debug is on. */
export function formatWatchLogLine(
  nowIso: string,
  event: string,
  details: Record<string, Detail> = {},
  titles: Record<string, string> = {},
  debug = false
): string {
  const parts = [nowIso, event]
  for (const [k, v] of Object.entries(details)) {
    if (v === undefined) continue
    parts.push(`${k}=${String(v).replace(/\s+/g, '_')}`)
  }
  if (debug) {
    for (const [k, v] of Object.entries(titles)) parts.push(`${k}=${JSON.stringify(v)}`)
  }
  return parts.join(' ')
}

/** Append one event (see the header for what may go in it). */
export function logWatchEvent(event: string, details: Record<string, Detail> = {}, titles: Record<string, string> = {}): void {
  if (!logDir) return
  try {
    mkdirSync(logDir, { recursive: true })
    const file = join(logDir, 'watch.log')
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, join(logDir, 'watch.log.1'))
    } catch { /* no file yet */ }
    appendFileSync(file, formatWatchLogLine(new Date().toISOString(), event, details, titles, isDebug()) + '\n', 'utf8')
  } catch {
    // Diagnostics must never affect the watch.
  }
}
