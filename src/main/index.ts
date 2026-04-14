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
import { createCompanionWindow, showCompanion, resetCompanionPosition } from './companion-window'
import { stopAnalysisLoop } from './analysis-loop'

let mainWindow: BrowserWindow | null = null
let companionWindow: BrowserWindow | null = null
let tray: Tray | null = null

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

  // 3. Destroy companion window
  if (companionWindow && !companionWindow.isDestroyed()) {
    companionWindow.destroy()
  }
  companionWindow = null

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
  const trayIcon = nativeImage.createEmpty()
  const newTray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Buildy',
      click: () => {
        showCompanion()
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

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  companionWindow = createCompanionWindow()
  tray = createSystemTray()

  registerIpcHandlers(mainWindow, companionWindow)

  console.log('Buildy launched — companion only (panel hidden)')
})

// macOS: re-open when dock icon is clicked — show the companion, not the panel
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    companionWindow = createCompanionWindow()
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
