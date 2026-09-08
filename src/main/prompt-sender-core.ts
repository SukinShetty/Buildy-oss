// prompt-sender-core.ts — main process (ELECTRON-FREE, unit-tested)
// Pure building blocks for "Send to Claude Code" (approve-and-send):
//   - sanitizePromptForSend: make the displayed prompt safe to paste as ONE line
//   - evaluateSendEligibility: the single decision point for whether sending is
//     allowed right now (the renderer only renders the result, never decides)
//   - buildSendCommand: the FIXED PowerShell invocation. The prompt text and the
//     window title are NEVER interpolated into the command string — the prompt
//     travels via the clipboard only, and the title travels as an environment
//     variable (BUILDY_TARGET_TITLE) read inside the script.

import type { SendEligibility, TerminalState } from '../renderer/src/types'

// ─── Sanitize ────────────────────────────────────────────────────────────────

/**
 * Sanitize the displayed prompt for keystroke-sending: collapse every newline
 * run to a single space, strip remaining control characters, trim. The card's
 * DISPLAY text is unchanged — this only affects what is pasted. (Windows
 * Terminal shows a warning dialog on multi-line paste by default; a single
 * line avoids it.)
 */
export function sanitizePromptForSend(promptText: string): string {
  return (promptText || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(new RegExp('[\\u0000-\\u001F\\u007F]', 'g'), '')
    .trim()
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

export interface SendEligibilityInput {
  platform: string                         // process.platform
  watchActive: boolean                     // analysis loop running on a watched window
  windowFound: boolean                     // findWatchedSource still resolves the watched window
  terminalState: TerminalState | undefined // from the LATEST analysis
  hasDisplayedPrompt: boolean              // a non-empty prompt is currently displayed
  sendInFlight: boolean                    // a previous send has not finished yet
}

/**
 * Sending is allowed only when ALL conditions hold. Returns the first blocking
 * reason (as tooltip-ready text) so the renderer can explain the disabled button.
 */
export function evaluateSendEligibility(input: SendEligibilityInput): SendEligibility {
  if (input.platform !== 'win32') {
    return { canSend: false, sendBlockedReason: 'Sending is only supported on Windows — use Copy instead' }
  }
  if (!input.watchActive) {
    return { canSend: false, sendBlockedReason: 'Not watching a window' }
  }
  if (!input.windowFound) {
    return { canSend: false, sendBlockedReason: 'The watched window is no longer available' }
  }
  if (input.terminalState !== 'awaiting_prompt') {
    return { canSend: false, sendBlockedReason: "The coding agent isn't awaiting a prompt yet" }
  }
  if (!input.hasDisplayedPrompt) {
    return { canSend: false, sendBlockedReason: 'No prompt to send yet' }
  }
  if (input.sendInFlight) {
    return { canSend: false, sendBlockedReason: 'A send is already in progress' }
  }
  return { canSend: true, sendBlockedReason: '' }
}

// ─── Fixed PowerShell send script ────────────────────────────────────────────

// Exit codes: 0 = sent; 2 = target window is not in the foreground; 3 = no
// target title in the environment. The script contains NO user content: it
// reads the target title from $env:BUILDY_TARGET_TITLE and sends only the
// fixed keystrokes Ctrl+V then Enter (the prompt is already on the clipboard).
// Foreground title matching mirrors AppActivate: case-insensitive exact, then
// prefix, then suffix.
export const POWERSHELL_SEND_SCRIPT = `
$target = $env:BUILDY_TARGET_TITLE
if (-not $target) { exit 3 }
$wshell = New-Object -ComObject WScript.Shell
try { [void]$wshell.AppActivate($target) } catch { }
Start-Sleep -Milliseconds 200
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class BuildyForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$sb = New-Object System.Text.StringBuilder 1024
[void][BuildyForeground]::GetWindowText([BuildyForeground]::GetForegroundWindow(), $sb, 1024)
$fg = $sb.ToString().ToLowerInvariant()
$t = $target.ToLowerInvariant()
if (-not (($fg -eq $t) -or $fg.StartsWith($t) -or $fg.EndsWith($t))) { exit 2 }
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 150
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
exit 0
`.trim()

export interface SendCommand {
  exe: string
  args: string[]
  env: { BUILDY_TARGET_TITLE: string }
}

/**
 * Build the powershell.exe invocation for a send. Takes the prompt and title so
 * the call site mirrors the real send, but NEITHER may appear in the command
 * string: the prompt travels via the clipboard, the title via the environment.
 */
export function buildSendCommand(_promptText: string, targetWindowTitle: string): SendCommand {
  return {
    exe: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_SEND_SCRIPT],
    env: { BUILDY_TARGET_TITLE: targetWindowTitle },
  }
}
