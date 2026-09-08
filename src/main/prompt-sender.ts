// prompt-sender.ts — main process
// Executes an approved "Send to Claude Code": puts the sanitized prompt on the
// clipboard, then runs the FIXED PowerShell script (see prompt-sender-core.ts)
// that activates the watched window and sends Ctrl+V + Enter. The prompt text
// and the window title are never part of the command string — text travels via
// the clipboard, the title via the BUILDY_TARGET_TITLE environment variable.
//
// Serialized: one send at a time. A second send while one is in flight is
// rejected (not queued) by the caller via isSendInFlight().

import { clipboard, desktopCapturer } from 'electron'
import { spawn } from 'child_process'
import type { SendPromptResult } from '../renderer/src/types'
import { sanitizePromptForSend, buildSendCommand } from './prompt-sender-core'
import { findWatchedSource } from './capture-guard'
import { debugLog } from './debug-log'

const SEND_TIMEOUT_MS = 5_000

let sendInFlight = false

export function isSendInFlight(): boolean {
  return sendInFlight
}

/**
 * True if the watched window (id + selection-time name, see findWatchedSource)
 * is still present in the live window list. Used by send eligibility.
 */
export async function isWatchedWindowPresent(
  watchedId: string | null,
  watchedName: string | null
): Promise<boolean> {
  if (!watchedId) return false
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    })
    return findWatchedSource(sources, watchedId, watchedName) !== null
  } catch (error) {
    console.warn('[Send] window presence check failed:', error)
    return false
  }
}

/**
 * Execute the send sequence: sanitize → clipboard → PowerShell activate + paste
 * + Enter. On any failure the sanitized text is left on the clipboard so the
 * user can paste manually. Resolves, never rejects.
 */
export async function executeSend(
  promptText: string,
  targetWindowTitle: string
): Promise<SendPromptResult> {
  if (sendInFlight) {
    console.log('[Send] rejected: a send is already in flight')
    return { sent: false, reason: 'not_eligible' }
  }
  sendInFlight = true
  try {
    const sanitized = sanitizePromptForSend(promptText)
    if (!sanitized) {
      console.log('[Send] rejected: prompt empty after sanitize')
      return { sent: false, reason: 'not_eligible' }
    }

    clipboard.writeText(sanitized)
    console.log(`[Send] clipboard set (${sanitized.length} chars)`)

    const exitCode = await runSendScript(targetWindowTitle)
    if (exitCode === 0) {
      console.log('[Send] keystrokes delivered (exit 0)')
      return { sent: true }
    }
    if (exitCode === 2) {
      console.log('[Send] target window not in foreground (exit 2) — text left on clipboard')
      return { sent: false, reason: 'window_not_in_front' }
    }
    if (exitCode === null) {
      console.log('[Send] PowerShell timed out — killed, text left on clipboard')
      return { sent: false, reason: 'timeout' }
    }
    console.log(`[Send] PowerShell exited ${exitCode} — text left on clipboard`)
    return { sent: false, reason: 'unknown' }
  } catch (error) {
    console.error('[Send] failed:', error)
    return { sent: false, reason: 'unknown' }
  } finally {
    sendInFlight = false
  }
}

/**
 * Spawn the fixed PowerShell script and resolve with its exit code, or null on
 * timeout (the process is killed after SEND_TIMEOUT_MS).
 */
function runSendScript(targetWindowTitle: string): Promise<number | null> {
  const { exe, args, env } = buildSendCommand('', targetWindowTitle)
  // Window titles can contain user content — gate behind BUILDY_DEBUG.
  debugLog(`[Send] activating target window "${targetWindowTitle}"`)
  console.log('[Send] spawning powershell (fixed script, title via env)')

  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      env: { ...process.env, ...env },
      windowsHide: true,
      stdio: 'ignore',
    })

    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch { /* already gone */ }
      resolve(null)
    }, SEND_TIMEOUT_MS)

    child.on('exit', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(code)
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      console.error('[Send] spawn error:', error)
      resolve(1)
    })
  })
}
