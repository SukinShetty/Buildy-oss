// index.ts — main process entry point
// Creates the main window, system tray, and registers all IPC handlers.

import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'

// electron-vite sets these globals to the correct paths for dev/production
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// ─── Window ───────────────────────────────────────────────────────────────────

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 480,
    minHeight: 600,
    title: 'Buildy',
    // On macOS, this gives a clean look with the traffic lights inside the window
    // On Windows, this shows the standard title bar
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,   // Security: renderer can't access Node.js directly
      nodeIntegration: false,   // Security: renderer can't run Node.js code
      sandbox: false,           // Needed for desktopCapturer access via preload
    },
    backgroundColor: '#1C1C1E', // Matches --color-bg in global.css — prevents white flash on load
    show: false,                // Don't show until 'ready-to-show' event fires
  })

  // Load the renderer — dev server URL in development, built file in production
  if (process.env.NODE_ENV === 'development') {
    window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    window.webContents.openDevTools({ mode: 'detach' })
  } else {
    window.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  // Show window once the page has rendered to avoid a white flash
  window.once('ready-to-show', () => {
    window.show()
  })

  // Open external links in the system browser, not inside the Electron window
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  return window
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createSystemTray(): Tray {
  // Use a simple template image (works on both Windows and macOS)
  // In production, replace this with a real icon file from the assets folder
  const trayIcon = nativeImage.createEmpty()
  const newTray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Buildy',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Buildy',
      click: () => {
        app.quit()
      },
    },
  ])

  newTray.setToolTip('Buildy — your builder buddy')
  newTray.setContextMenu(contextMenu)

  // On macOS, double-clicking the tray icon opens the window
  newTray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })

  return newTray
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  tray = createSystemTray()

  // Register all IPC handlers — must happen after window is created
  // because some handlers (brainstorm streaming) push back to the window
  registerIpcHandlers(mainWindow)

  console.log('🔨 Buildy launched')
})

// On macOS: re-open the window when the dock icon is clicked and no windows are open
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createMainWindow()
    registerIpcHandlers(mainWindow)
  } else {
    mainWindow?.show()
    mainWindow?.focus()
  }
})

// On Windows/Linux: quit when all windows are closed
// On macOS: keep the app running (standard macOS behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
