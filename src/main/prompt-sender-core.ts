// prompt-sender-core.ts — main process (ELECTRON-FREE, unit-tested)
// Pure building blocks for "Send to Claude Code" (approve-and-send):
//   - sanitizePromptForSend: make the displayed prompt safe to paste as ONE line
//   - evaluateSendEligibility: the single decision point for whether sending is
//     allowed right now (the renderer only renders the result, never decides)
//   - buildSendCommand: the FIXED PowerShell invocation. The prompt text and the
//     window title are NEVER interpolated into the command string — the prompt
//     travels via the clipboard only, and the title travels as an environment
//     variable (MYBUILDY_TARGET_TITLE) read inside the script.

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

// ─── Destructive-prompt guard ────────────────────────────────────────────────
// A SPEED BUMP, NOT A SANDBOX: this scan cannot catch every dangerous phrasing
// and is trivially bypassable by rewording. Its only job is to make the user
// pause and read before one click sends a destructive or exfiltrating
// instruction into a coding agent. Matching errs slightly toward caution, but
// normal build prompts must always pass without friction.

interface DestructivePromptRule {
  reason: string
  patterns: RegExp[]
}

const DESTRUCTIVE_PROMPT_RULES: DestructivePromptRule[] = [
  {
    reason: 'This prompt recursively deletes files (rm -rf / Remove-Item -Recurse / del /s).',
    patterns: [
      /\brm\s+(-[a-z]+\s+)*-[a-z]*(rf|fr)[a-z]*\b/i,   // rm -rf, rm -fr, rm -Rf, rm -v -rf
      /\brm\s+(-[a-z]+\s+)*-r\s+(-[a-z]+\s+)*-f\b/i,   // rm -r -f (split flags)
      /\brm\s+(-[a-z]+\s+)*-f\s+(-[a-z]+\s+)*-r\b/i,   // rm -f -r
      /\bremove-item\b[^\n]{0,80}-recurse\b/i,          // PowerShell recursive delete
      /\bdel\s+(\/[a-z]+\s+)*\/s\b/i,                   // cmd.exe del /s (subdirectories)
    ],
  },
  {
    reason: 'This prompt formats (wipes) a drive or filesystem.',
    patterns: [
      /\bformat\s+[a-z]:/i,   // format c:
      /\bmkfs\b/i,            // mkfs, mkfs.ext4 ("\b" matches before the dot)
    ],
  },
  {
    reason: 'This prompt force-pushes to git, overwriting remote history.',
    patterns: [/\bgit\s+push\b[^\n]{0,80}--force\b/i, /\bgit\s+push\b[^\n]{0,80}\s-f\b/i],
  },
  {
    reason: 'This prompt hard-resets git, discarding local work.',
    patterns: [/\bgit\s+reset\b[^\n]{0,40}--hard\b/i],
  },
  {
    reason: 'This prompt runs git clean, deleting untracked files.',
    patterns: [/\bgit\s+clean\b[^\n]{0,40}-[a-z]*f[a-z]*\b/i],
  },
  {
    reason: 'This prompt drops or deletes a database or table.',
    patterns: [
      /\bdrop\s+(the\s+)?(table|database|schema)s?\b/i,
      /\bdelet(e|ing|es)\s+(the\s+|this\s+)?(entire\s+|whole\s+|production\s+)?database\b/i,
    ],
  },
  {
    reason: 'This prompt deletes all files.',
    patterns: [/\bdelet(e|ing|es)\s+all\s+(the\s+|of\s+the\s+)?files\b/i],
  },
  {
    reason: 'This prompt skips, disables, or deletes tests instead of fixing them.',
    patterns: [
      /\bskip(s|ping)?\s+(the\s+|all\s+)?tests?\b/i,
      /\bdelet(e|ing|es)\s+(the\s+|all\s+)?tests?\b/i,
      /\bdisabl(e|ing|es)\s+(the\s+|all\s+)?tests?\b/i,
      /\bremov(e|ing|es)\s+(the\s+|all\s+)?tests?\b/i,
      /\.skip\b/,                                      // describe.skip / it.skip / test.skip
    ],
  },
  {
    reason: 'This prompt pipes a downloaded script straight into a shell.',
    patterns: [
      /\b(curl|wget)\b[^\n|]{0,200}\|\s*(sudo\s+)?(sh|bash|zsh|pwsh|powershell)\b/i,
      /\b(iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\n|]{0,200}\|\s*(iex|invoke-expression)\b/i,
    ],
  },
  {
    reason: 'This prompt exposes .env contents (secrets/credentials).',
    patterns: [
      /\b(cat|type|print|echo|show|display|dump|upload|send|post|email|paste|read\s+out)\b[^\n]{0,60}\.env\b/i,
    ],
  },
  {
    reason: 'This prompt prints or sends API keys, tokens, secrets, or credentials.',
    patterns: [
      /\b(print|show|display|dump|reveal|echo|log|output|upload|send|post|email|paste|leak|share|exfiltrate)\b[^\n]{0,60}\b(api[\s_-]?keys?|secret\s+keys?|secrets|access\s+tokens?|auth\s+tokens?|tokens?|credentials?)\b/i,
    ],
  },
]

// Sending data to an external URL: tool + POST/data flag + http(s) URL must all
// be present (checked separately so flag order doesn't matter).
const EXTERNAL_SEND_TOOL = /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b/i
const EXTERNAL_SEND_POSTISH =
  /(-x\s*post|--data\b|--data-raw\b|--data-binary\b|--data-urlencode\b|-d\s|--form\b|--upload-file\b|--post-data\b|--post-file\b|-method\s+post|-body\b|-infile\b)/i
const EXTERNAL_SEND_URL = /https?:\/\//i

/**
 * Scan a displayed prompt for destructive or exfiltrating instructions before
 * it is sent into a coding agent. Returns null when the prompt looks like a
 * normal build instruction, or { reason } describing the FIRST matched hazard.
 *
 * This is a speed bump, not a sandbox (see the note above the rule table): the
 * UI uses a non-null result to demand a second, deliberate click — it never
 * makes sending impossible.
 */
export function detectDestructivePrompt(promptText: string): { reason: string } | null {
  const text = promptText || ''
  if (!text.trim()) return null

  for (const rule of DESTRUCTIVE_PROMPT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return { reason: rule.reason }
    }
  }

  if (
    EXTERNAL_SEND_TOOL.test(text) &&
    EXTERNAL_SEND_POSTISH.test(text) &&
    EXTERNAL_SEND_URL.test(text)
  ) {
    return { reason: 'This prompt uploads (POSTs) data to an external URL.' }
  }

  return null
}

// ─── Fixed PowerShell send script ────────────────────────────────────────────

// Exit codes: 0 = sent; 2 = target window is not in the foreground; 3 = no
// target title in the environment. The script contains NO user content: it
// reads the target title from $env:MYBUILDY_TARGET_TITLE and sends only the
// fixed keystrokes Ctrl+V then Enter (the prompt is already on the clipboard).
// Foreground title matching mirrors AppActivate: case-insensitive exact, then
// prefix, then suffix.
export const POWERSHELL_SEND_SCRIPT = `
$target = $env:MYBUILDY_TARGET_TITLE
if (-not $target) { exit 3 }
$wshell = New-Object -ComObject WScript.Shell
try { [void]$wshell.AppActivate($target) } catch { }
Start-Sleep -Milliseconds 200
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MyBuildyForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@
$sb = New-Object System.Text.StringBuilder 1024
[void][MyBuildyForeground]::GetWindowText([MyBuildyForeground]::GetForegroundWindow(), $sb, 1024)
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
  env: { MYBUILDY_TARGET_TITLE: string }
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
    env: { MYBUILDY_TARGET_TITLE: targetWindowTitle },
  }
}
