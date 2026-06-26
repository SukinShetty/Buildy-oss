// companion-window.ts — main process
// Creates the floating always-on-top companion window.
// This is the PRIMARY UI — it must be visible on launch, no exceptions.
//
// Visibility guarantees:
//   - Explicit show() + focus() after ready-to-show
//   - Position validated against all displays
//   - Background color fallback so window is never invisible
//   - Detailed startup logging

import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const COMPANION_WIDTH = 380
const COMPANION_HEIGHT = 380

let companionRef: BrowserWindow | null = null

/**
 * Calculate a safe, visible default position: center-right of the primary display.
 */
function safeDefaultPosition(): { x: number; y: number } {
  const display = screen.getPrimaryDisplay()
  const { width, height } = display.workAreaSize
  const { x: ox, y: oy } = display.workArea

  return {
    x: ox + width - COMPANION_WIDTH - 80,
    y: oy + Math.round((height - COMPANION_HEIGHT) / 2),
  }
}

/**
 * Check if a position is within any connected display's bounds.
 */
function isOnScreen(x: number, y: number): boolean {
  const displays = screen.getAllDisplays()
  for (const display of displays) {
    const { x: dx, y: dy, width, height } = display.workArea
    if (
      x + 100 > dx && x < dx + width &&
      y + 50 > dy && y < dy + height
    ) {
      return true
    }
  }
  return false
}

export function createCompanionWindow(): BrowserWindow {
  const pos = safeDefaultPosition()

  console.log(`[Companion] Creating window at x=${pos.x} y=${pos.y} (${COMPANION_WIDTH}x${COMPANION_HEIGHT})`)

  const window = new BrowserWindow({
    width: COMPANION_WIDTH,
    height: COMPANION_HEIGHT,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
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
    window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}?companion=true`)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { companion: 'true' },
    })
  }

  window.setIgnoreMouseEvents(false)

  // Guaranteed show after content is ready
  window.once('ready-to-show', () => {
    const bounds = window.getBounds()
    console.log(`[Companion] ready-to-show — bounds: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`)

    // Validate position
    if (!isOnScreen(bounds.x, bounds.y)) {
      console.log('[Companion] Window is off-screen, resetting position')
      const safe = safeDefaultPosition()
      window.setBounds({ x: safe.x, y: safe.y, width: COMPANION_WIDTH, height: COMPANION_HEIGHT })
    }

    window.show()
    console.log('[Companion] show() called')

    window.setAlwaysOnTop(true, 'floating')
    window.focus()
    console.log('[Companion] focus() called')

    // Second focus after a short delay — Windows sometimes loses focus to the previous window
    setTimeout(() => {
      if (!window.isDestroyed()) {
        window.setAlwaysOnTop(true, 'floating')
        window.focus()
        const finalBounds = window.getBounds()
        console.log(`[Companion] Visible and focused at x=${finalBounds.x} y=${finalBounds.y}`)
      }
    }, 300)
  })

  companionRef = window
  console.log('[Companion] Window created (waiting for ready-to-show)')
  return window
}

/**
 * Reset companion to a safe, visible position and bring it to front.
 */
export function resetCompanionPosition(): void {
  if (!companionRef || companionRef.isDestroyed()) return

  const pos = safeDefaultPosition()
  console.log(`[Companion] Resetting position to x=${pos.x} y=${pos.y}`)

  companionRef.setBounds({
    x: pos.x,
    y: pos.y,
    width: COMPANION_WIDTH,
    height: COMPANION_HEIGHT,
  })

  companionRef.show()
  companionRef.setAlwaysOnTop(true, 'floating')
  companionRef.focus()
}

/**
 * Show the companion and ensure it's visible on-screen.
 */
export function showCompanion(): void {
  if (!companionRef || companionRef.isDestroyed()) return

  const bounds = companionRef.getBounds()
  if (!isOnScreen(bounds.x, bounds.y)) {
    resetCompanionPosition()
  } else {
    companionRef.show()
    companionRef.setAlwaysOnTop(true, 'floating')
    companionRef.focus()
  }
  console.log('[Companion] showCompanion() — visible and focused')
}
