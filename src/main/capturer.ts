// capturer.ts — main process
// Screen and window capture via Electron's desktopCapturer API.
//
// SAFETY: Buildy does NOT auto-detect windows and NEVER falls back to capturing
// the full desktop. The user explicitly chooses which window to watch. If that
// window disappears, capture HALTS (returns null / a halt outcome) so we never
// silently send the user's whole screen to an AI provider.
//
// The picker thumbnails are deliberately LOW-RESOLUTION (so other apps aren't
// captured in high fidelity); only the SELECTED window is captured full-res.

import { desktopCapturer } from 'electron'
import type { WindowSource, CaptureResult, CaptureOutcome } from '../renderer/src/types'
import { captureHaltReason, findWatchedSource } from './capture-guard'

// Picker thumbnails: small + lower quality to minimise exposure of other windows.
const THUMB_SIZE = { width: 160, height: 100 }
const THUMB_QUALITY = 40
// Full-res capture of the SELECTED window only.
const CAPTURE_SIZE = { width: 1280, height: 800 }
const CAPTURE_QUALITY = 88

// ─── List windows (for user to pick from) ────────────────────────────────────

/**
 * Returns all currently open windows as a list the user can pick from.
 * Thumbnails are low-resolution to reduce exposure of other apps' contents.
 */
export async function listOpenWindows(): Promise<WindowSource[]> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: THUMB_SIZE,
    fetchWindowIcons: false,
  })

  return sources
    .filter((source) => source.name.trim().length > 0)
    .map((source) => ({
      id: source.id,
      name: source.name,
      thumbnailBase64: source.thumbnail.toJPEG(THUMB_QUALITY).toString('base64'),
    }))
}

// ─── Capture a specific window ───────────────────────────────────────────────

/**
 * Captures a specific window by its source ID + selection-time name at full
 * resolution. Returns null if that exact window is no longer in the live list —
 * Buildy halts, never guesses. NEVER falls back to another window (including one
 * that reused the closed window's HWND/id) or the full screen. See
 * findWatchedSource for why the name must match, not just the id.
 */
export async function captureWatchedWindow(
  sourceId: string,
  expectedName: string | null
): Promise<CaptureResult | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: CAPTURE_SIZE,
    fetchWindowIcons: false,
  })

  const target = findWatchedSource(sources, sourceId, expectedName)
  if (!target) {
    return null // watched window gone (or its id reused by another window) — halt, don't guess
  }

  return {
    imageBase64: target.thumbnail.toJPEG(CAPTURE_QUALITY).toString('base64'),
    windowTitle: target.name,
    sourceId: target.id,
    capturedAt: new Date().toISOString(),
  }
}

/**
 * Manual capture for the GuidanceWorkspace panel. Returns a discriminated outcome
 * — NO full-screen fallback. If the selected window is missing the caller must
 * prompt the user to reselect rather than capturing the desktop.
 */
export async function captureWindowForAnalysis(
  sourceId: string | null,
  expectedName: string | null
): Promise<CaptureOutcome> {
  if (!sourceId) {
    console.log('[Capture] no window selected — analysis halted, reselection required')
    return { ok: false, reason: captureHaltReason(null, false)! }
  }
  const capture = await captureWatchedWindow(sourceId, expectedName)
  if (captureHaltReason(sourceId, !!capture)) {
    console.log(`[Capture] watched window ${sourceId} no longer exists — analysis halted, awaiting reselection`)
    return { ok: false, reason: 'window-missing' }
  }
  return { ok: true, capture: capture! }
}
