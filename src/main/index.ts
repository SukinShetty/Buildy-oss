// index.ts — main process entry point
// Creates the main panel window, the floating companion window,
// system tray, and registers all IPC handlers.
//
// Lifecycle:
//   - Closing the main window QUITS the app (no hidden background processes)
//   - Companion window closes with the main window
//   - All speech and analysis stop on quit
//   - Tray provides Open/Quit shortcuts but the app does NOT hide to tray by default

import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { IPC } from '../renderer/src/types'
import { registerIpcHandlers } from './ipc-handlers'
import { createCompanionWindow, showCompanion, hideCompanion, resetCompanionPosition } from './companion-window'
import { createGuidanceWindow, destroyGuidanceWindow, showLastGuidance } from './guidance-window'
import { stopAnalysisLoop } from './analysis-loop'
import { init as initNempMemory } from './nemp-bridge'
import { createVoicePlayerWindow, destroyVoicePlayer } from './voice-player'

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let guidanceWindow: BrowserWindow | null = null
let voicePlayerWindow: BrowserWindow | null = null
let tray: Tray | null = null

// App / tray icon — Buildy mascot logo. Resolved relative to the built main
// process output (out/main → project root → renderer assets).
const LOGO_PATH = join(__dirname, '../../src/renderer/src/assets/buildy-logo.png')

// ─── Shutdown ────────────────────────────────────────────────────────────────

/**
 * Clean shutdown: stop analysis, stop speech, close all windows, quit.
 * Called from every exit path to guarantee no orphaned processes.
 */
function shutdownApp(): void {
  ;(app as any).isQuitting = true

  // 1. Stop the background analysis loop
  stopAnalysisLoop()

  // 2. Tell the companion renderer to stop TTS immediately
  if (companionWindow && !companionWindow.isDestroyed()) {
    try {
      companionWindow.webContents.send(IPC.COMPANION_SHUTDOWN)
    } catch {
      // Window may already be gone
    }
  }

  // 3. Destroy companion + guidance windows
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.destroy()
  }
  companionWindow = null

  destroyGuidanceWindow()
  guidanceWindow = null

  destroyVoicePlayer()
  voicePlayerWindow = null

  // 4. Destroy main window (allow it to close for real)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
  }
  mainWindow = null

  // 5. Destroy tray
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null

  // 6. Quit the process
  app.quit()
}

// ─── Main panel window (hidden by default — companion is primary UI) ─────────

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    title: 'Buildy Settings',
    icon: LOGO_PATH,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#1C1C1E',
    show: false,
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL'])
    if (process.env['BUILDY_DEBUG']) {
      window.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Panel stays hidden on launch — companion is the primary UI.
  // User opens it from companion gear icon or system tray.

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Closing the panel just hides it — companion keeps running.
  // Quitting the app is done via tray or closing the companion.
  window.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault()
      window.hide()
    }
  })

  return window
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createSystemTray(): Tray {
  // Tray icon from the Buildy logo, scaled down to a tray-appropriate size.
  // Falls back to an empty image if the file can't be loaded.
  const loadedIcon = nativeImage.createFromPath(LOGO_PATH)
  const trayIcon = loadedIcon.isEmpty()
    ? nativeImage.createEmpty()
    : loadedIcon.resize({ width: 18, height: 18 })
  const newTray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Buildy',
      click: () => {
        // showCompanion() re-asserts the screen-saver always-on-top level.
        showCompanion()
      },
    },
    {
      label: 'Hide Buildy',
      click: () => {
        hideCompanion()
      },
    },
    {
      label: 'Show last guidance',
      click: () => {
        showLastGuidance()
      },
    },
    {
      label: 'Reset Position',
      click: () => {
        resetCompanionPosition()
      },
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Buildy',
      click: () => {
        shutdownApp()
      },
    },
  ])

  newTray.setToolTip('Buildy — your builder buddy')
  newTray.setContextMenu(contextMenu)

  newTray.on('double-click', () => {
    showCompanion()
  })

  return newTray
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

// Track quit intent so panel close handler knows to actually close
;(app as any).isQuitting = false

// Single-instance lock: if a second launch happens (e.g. user clicks the taskbar
// icon / re-runs the app), Electron fires 'second-instance' on the FIRST instance
// instead of starting a new one. We use that to re-summon the companion.
const gotInstanceLock = app.requestSingleInstanceLock()
if (!gotInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    console.log('[App] second-instance — summoning companion')
    showCompanion()
  })
}

app.whenReady().then(() => {
  if (!gotInstanceLock) return  // second instance is quitting — don't create windows

  mainWindow = createMainWindow()
  companionWindow = createCompanionWindow()
  guidanceWindow = createGuidanceWindow(companionWindow)
  voicePlayerWindow = createVoicePlayerWindow()
  tray = createSystemTray()

  registerIpcHandlers(mainWindow, companionWindow)

  // Initialise the Nemp memory layer (local-only). Non-fatal if it can't load.
  initNempMemory('default').catch((e) => console.error('[Nemp] init failed:', e))

  console.log('Buildy launched — companion only (panel hidden)')
})

// macOS: re-open when dock icon is clicked — show the companion, not the panel
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    companionWindow = createCompanionWindow()
    guidanceWindow = createGuidanceWindow(companionWindow)
    voicePlayerWindow = createVoicePlayerWindow()
    registerIpcHandlers(mainWindow, companionWindow)
  } else {
    showCompanion()
  }
})

// Safety net: if all windows close for any reason, quit
app.on('window-all-closed', () => {
  stopAnalysisLoop()
  app.quit()
})

// Safety net: clean up on quit signal (Cmd+Q, etc.)
app.on('before-quit', () => {
  stopAnalysisLoop()
})
