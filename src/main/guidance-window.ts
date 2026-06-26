// guidance-window.ts — main process
// Creates the SECONDARY floating window that shows guidance content (analysis or
// spoken-question answers). It is deliberately separate from the mascot window so
// guidance can never overflow the mascot or push it out of view.
//
// Behaviour:
//   - Transparent, frameless, always-on-top, NON-focusable (never steals focus
//     from whatever the user is building in).
//   - Anchored to the right of the mascot window with an 8px gap. If there isn't
//     room on the right (mascot near the screen edge), it flips to the left.
//   - Vertically centered on the mascot, clamped to the work area.
//   - Height tracks the panel's content height, capped at 80% of the screen; the
//     panel scrolls internally when taller. Tracking content height keeps the
//     window from leaving a large transparent dead-zone that would eat clicks.
//   - Hidden until the first guidance arrives (never shown on launch).

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { IPC } from '../renderer/src/types'
import type { GuidancePayload } from '../renderer/src/types'

const GUIDANCE_WIDTH = 420
const GAP = 8
const MIN_HEIGHT = 80

let guidanceRef: BrowserWindow | null = null
let companionRef: BrowserWindow | null = null
let isReady = false
let pendingPayload: GuidancePayload | null = null
let currentHeight = 300

function maxHeight(): number {
  const display = screen.getPrimaryDisplay()
  return Math.round(display.workAreaSize.height * 0.8)
}

/**
 * Compute the guidance window position relative to the mascot window.
 * Prefers the right of the mascot; flips to the left when off-screen.
 */
function computePosition(height: number): { x: number; y: number } {
  const fallback = screen.getPrimaryDisplay().workArea
  const compBounds =
    companionRef && !companionRef.isDestroyed() ? companionRef.getBounds() : null

  if (!compBounds) {
    return { x: fallback.x + 40, y: fallback.y + 40 }
  }

  // The display the mascot currently lives on (multi-monitor aware).
  const display = screen.getDisplayMatching(compBounds)
  const { x: wax, y: way, width: waw, height: wah } = display.workArea

  // Horizontal: right of the mascot, else left.
  let x = compBounds.x + compBounds.width + GAP
  if (x + GUIDANCE_WIDTH > wax + waw) {
    x = compBounds.x - GAP - GUIDANCE_WIDTH
  }
  // Final clamp so it's always on-screen horizontally.
  x = Math.max(wax, Math.min(x, wax + waw - GUIDANCE_WIDTH))

  // Vertical: centered on the mascot, clamped to the work area.
  let y = Math.round(compBounds.y + compBounds.height / 2 - height / 2)
  y = Math.max(way, Math.min(y, way + wah - height))

  return { x, y }
}

export function createGuidanceWindow(companionWindow: BrowserWindow): BrowserWindow {
  companionRef = companionWindow

  const window = new BrowserWindow({
    width: GUIDANCE_WIDTH,
    height: currentHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?guidance=true`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { guidance: 'true' },
    })
  }

  window.webContents.once('did-finish-load', () => {
    isReady = true
    if (pendingPayload) {
      const payload = pendingPayload
      pendingPayload = null
      showGuidanceWindow(payload)
    }
  })

  guidanceRef = window
  console.log('[Guidance] Window created (hidden until first guidance)')
  return window
}

/**
 * Show the guidance window with the given payload, positioned next to the mascot.
 */
export function showGuidanceWindow(payload: GuidancePayload): void {
  if (!guidanceRef || guidanceRef.isDestroyed()) return

  // Renderer not loaded yet — remember and replay once it's ready.
  if (!isReady) {
    pendingPayload = payload
    return
  }

  guidanceRef.webContents.send(IPC.GUIDANCE_DATA, payload)

  const pos = computePosition(currentHeight)
  guidanceRef.setBounds({ x: pos.x, y: pos.y, width: GUIDANCE_WIDTH, height: currentHeight })

  // showInactive so the panel never steals focus from the user's work.
  guidanceRef.showInactive()
  guidanceRef.setAlwaysOnTop(true, 'floating')
}

export function hideGuidanceWindow(): void {
  if (!guidanceRef || guidanceRef.isDestroyed()) return
  if (guidanceRef.isVisible()) guidanceRef.hide()
}

/**
 * Re-anchor the guidance window to the mascot. Called on every mascot 'move'.
 */
export function repositionGuidanceWindow(): void {
  if (!guidanceRef || guidanceRef.isDestroyed()) return
  if (!guidanceRef.isVisible()) return
  const pos = computePosition(currentHeight)
  guidanceRef.setBounds({ x: pos.x, y: pos.y, width: GUIDANCE_WIDTH, height: currentHeight })
}

/**
 * Resize the window to fit the panel's content height (capped at 80% screen),
 * then keep it anchored to the mascot.
 */
export function resizeGuidanceWindow(contentHeight: number): void {
  if (!guidanceRef || guidanceRef.isDestroyed()) return
  const clamped = Math.max(MIN_HEIGHT, Math.min(Math.round(contentHeight), maxHeight()))
  currentHeight = clamped
  const pos = computePosition(clamped)
  guidanceRef.setBounds({ x: pos.x, y: pos.y, width: GUIDANCE_WIDTH, height: clamped })
}

export function destroyGuidanceWindow(): void {
  if (guidanceRef && !guidanceRef.isDestroyed()) guidanceRef.destroy()
  guidanceRef = null
  companionRef = null
  isReady = false
  pendingPayload = null
}
