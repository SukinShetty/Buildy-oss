// window-presence.ts — main process, Windows only.
// Asks Windows whether a watched window still exists, for the continuity rules
// in capture-guard.ts.
//
// Why: on Windows, Electron's window list (desktopCapturer) leaves out a
// window while it is MINIMIZED or hidden, and lists it again under the same id
// when it is restored (measured on this build). Without this check a minimized
// terminal looked closed: after 60 s, or on restore after 15 s with the new
// title Claude Code gives the terminal every turn, the watch was dropped.
//
// The probe is only run at decision points (a window going missing, or the
// rules about to declare it lost), never on every 2 s poll. It runs a FIXED
// PowerShell script; the only input, the window handle, is validated as digits
// and passed through an environment variable, never spliced into the script.

import { execFile } from 'child_process'
import type { WindowPresence } from './capture-guard'

const PROBE_TIMEOUT_MS = 8000

const PROBE_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class MyBuildyWindowPresence {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$h = [IntPtr][Int64]$env:MYBUILDY_HWND
if (-not [MyBuildyWindowPresence]::IsWindow($h)) { 'exists=0'; exit 0 }
$ownerPid = [uint32]0
[void][MyBuildyWindowPresence]::GetWindowThreadProcessId($h, [ref]$ownerPid)
'exists=1 minimized=' + [int][MyBuildyWindowPresence]::IsIconic($h) + ' pid=' + $ownerPid
`

/** The HWND in a Windows desktopCapturer id ("window:<HWND>:<n>"), or null. */
export function hwndFromSourceId(sourceId: string): string | null {
  const m = /^window:(\d{1,20}):\d+$/.exec(sourceId)
  return m ? m[1] : null
}

/** Parse the probe's one-line output; null when it is not recognisable. */
export function parsePresenceOutput(output: string): WindowPresence | null {
  const line = output.trim().split(/\r?\n/).pop() || ''
  if (line === 'exists=0') return { exists: false, minimized: false, ownerPid: null }
  const m = /^exists=1 minimized=([01]) pid=(\d+)$/.exec(line)
  if (!m) return null
  const pid = Number(m[2])
  return { exists: true, minimized: m[1] === '1', ownerPid: pid > 0 ? pid : null }
}

/**
 * Presence of the window behind a source id. Null when it cannot be known (not
 * Windows, not a window id, or the probe failed) — the caller then applies the
 * continuity rules unchanged.
 */
export function probeWindowPresence(sourceId: string): Promise<WindowPresence | null> {
  if (process.platform !== 'win32') return Promise.resolve(null)
  const hwnd = hwndFromSourceId(sourceId)
  if (!hwnd) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PROBE_SCRIPT],
      { env: { ...process.env, MYBUILDY_HWND: hwnd }, timeout: PROBE_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (error) { console.warn('[Watch] window presence probe failed'); resolve(null); return }
        resolve(parsePresenceOutput(String(stdout)))
      }
    )
  })
}
