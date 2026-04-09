// capturer.ts — main process
// Screen and window capture via Electron's desktopCapturer API.
// Works on both Windows and macOS with no extra permissions library.
//
// On macOS: first call triggers the OS Screen Recording permission prompt.
// On Windows: no special permission is needed.

import { desktopCapturer } from 'electron'
import type { WindowSource, CaptureResult } from '../renderer/src/types'

// Keywords in window titles that indicate Claude Code is running.
// We check case-insensitively.
const CLAUDE_CODE_TITLE_KEYWORDS = ['claude', 'Claude Code']

// Bundle IDs / process names of apps that commonly host Claude Code.
// On Windows these are exe names; on macOS these are app names.
const CLAUDE_CODE_HOST_APP_NAMES = [
  'Terminal',        // macOS Terminal.app
  'iTerm2',          // macOS iTerm2
  'Warp',            // macOS Warp
  'WezTerm',         // cross-platform
  'Kitty',           // cross-platform
  'Windows Terminal',// Windows
  'PowerShell',      // Windows
  'Command Prompt',  // Windows
  'cmd',
  'Hyper',
]

// ─── List windows ─────────────────────────────────────────────────────────────

/**
 * Returns all currently open windows as a list the user can pick from.
 * Includes a thumbnail screenshot of each window.
 * The thumbnail resolution is intentionally kept at 320×200 for the picker UI —
 * we use a higher resolution only for the actual analysis capture.
 */
export async function listOpenWindows(): Promise<WindowSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 320, height: 200 },
    fetchWindowIcons: false,
  })

  return sources
    .filter((source) => source.name.trim().length > 0)
    .map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailBase64: source.thumbnail.toJPEG(70).toString('base64'),
      isClaudeCode: isLikelyClaudeCodeWindow(source.name),
    }))
}

// ─── Capture specific window ──────────────────────────────────────────────────

/**
 * Captures a specific window by source ID at full analysis resolution (1280px wide).
 * If sourceId is null or the window is no longer open, falls back to the
 * auto-detected Claude Code window or the primary screen.
 */
export async function captureWindowForAnalysis(
  sourceId: string | null
): Promise<CaptureResult> {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1280, height: 800 },
    fetchWindowIcons: false,
  })

  const capturedAt = new Date().toISOString()

  // If the caller specified a window ID, try that first
  if (sourceId) {
    const targetSource = sources.find((s) => s.id === sourceId)
    if (targetSource) {
      return {
        imageBase64: targetSource.thumbnail.toJPEG(88).toString('base64'),
        windowTitle: targetSource.name,
        sourceId: targetSource.id,
        wasClaudeCodeAutoDetected: false,
        capturedAt,
      }
    }
  }

  // Auto-detect: look for a Claude Code window
  const claudeCodeSource = sources.find(
    (s) => s.id.startsWith('window:') && isLikelyClaudeCodeWindow(s.name)
  )
  if (claudeCodeSource) {
    return {
      imageBase64: claudeCodeSource.thumbnail.toJPEG(88).toString('base64'),
      windowTitle: claudeCodeSource.name,
      sourceId: claudeCodeSource.id,
      wasClaudeCodeAutoDetected: true,
      capturedAt,
    }
  }

  // Fall back to the primary screen
  const screenSource = sources.find((s) => s.id.startsWith('screen:'))
  if (screenSource) {
    return {
      imageBase64: screenSource.thumbnail.toJPEG(88).toString('base64'),
      windowTitle: 'Full screen (Claude Code window not found)',
      sourceId: screenSource.id,
      wasClaudeCodeAutoDetected: false,
      capturedAt,
    }
  }

  throw new Error(
    'No capture source available. Make sure at least one window or display is open.'
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the window title suggests Claude Code is running inside it.
 * We check for "claude" in the title (case-insensitive) first.
 * If not found, we check if the app is a known terminal that could host Claude Code.
 */
function isLikelyClaudeCodeWindow(windowTitle: string): boolean {
  const titleLower = windowTitle.toLowerCase()

  // Direct match: "claude" anywhere in the title
  if (titleLower.includes('claude')) {
    return true
  }

  // Check if the app name matches a known Claude Code host
  const matchesKnownHostApp = CLAUDE_CODE_HOST_APP_NAMES.some((appName) =>
    titleLower.includes(appName.toLowerCase())
  )

  return matchesKnownHostApp
}
