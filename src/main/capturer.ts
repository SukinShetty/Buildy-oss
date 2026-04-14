// capturer.ts — main process
// Screen and window capture via Electron's desktopCapturer API.
//
// IMPORTANT: Buildy does NOT auto-detect windows.
// The user must explicitly choose which window to watch.
// If the chosen window disappears, capture returns null — Buildy pauses.

import { desktopCapturer } from 'electron'
import type { WindowSource, CaptureResult } from '../renderer/src/types'

// ─── List windows (for user to pick from) ────────────────────────────────────

/**
 * Returns all currently open windows as a list the user can pick from.
 * No auto-detection, no filtering — shows everything.
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
      isClaudeCode: false, // No auto-detection — user decides
    }))
}

// ─── Capture a specific window ───────────────────────────────────────────────

/**
 * Captures a specific window by its source ID.
 * Returns null if the window no longer exists — Buildy should pause, not guess.
 * NEVER falls back to another window or the full screen.
 */
export async function captureWatchedWindow(
  sourceId: string
): Promise<CaptureResult | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1280, height: 800 },
    fetchWindowIcons: false,
  })

  const target = sources.find((s) => s.id === sourceId)
  if (!target) {
    // The watched window is gone — return null, don't guess
    return null
  }

  return {
    imageBase64: target.thumbnail.toJPEG(88).toString('base64'),
    windowTitle: target.name,
    sourceId: target.id,
    wasClaudeCodeAutoDetected: false,
    capturedAt: new Date().toISOString(),
  }
}

// Keep the old function for the manual GuidanceWorkspace (panel mode)
export async function captureWindowForAnalysis(
  sourceId: string | null
): Promise<CaptureResult> {
  if (sourceId) {
    const result = await captureWatchedWindow(sourceId)
    if (result) return result
  }

  // Fallback for panel mode only — capture primary screen
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1280, height: 800 },
    fetchWindowIcons: false,
  })

  const screenSource = sources.find((s) => s.id.startsWith('screen:'))
  if (screenSource) {
    return {
      imageBase64: screenSource.thumbnail.toJPEG(88).toString('base64'),
      windowTitle: 'Full screen',
      sourceId: screenSource.id,
      wasClaudeCodeAutoDetected: false,
      capturedAt: new Date().toISOString(),
    }
  }

  throw new Error('No capture source available.')
}
