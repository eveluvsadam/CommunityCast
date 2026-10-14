import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { getDb, closeDb } from './db'
import { startServer, type CommunityCastServer } from './server'
import { startPublicStreamServer, type PublicStreamServer } from './server/publicStreamServer'
import { registerDialogHandlers } from './ipc/dialogs'
import { ensureLibraryDirs } from './library/paths'

let mainWindow: BrowserWindow | null = null
let server: CommunityCastServer | null = null
let publicStreamServer: PublicStreamServer | null = null
let isQuitting = false

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#08090b', // matches --cc-bg, avoids a white flash on load
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Keep external links out of the app's own window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // electron-vite dev server
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  const db = getDb()
  ensureLibraryDirs()
  server = startServer(db)
  publicStreamServer = startPublicStreamServer()
  registerDialogHandlers()

  // The other half of "comes back on its own": auto-launch (below) gets the
  // app open again after a reboot, but by itself that just leaves it sitting
  // idle — this is what actually resumes broadcasting, and only if it was
  // genuinely interrupted (crash, power loss) rather than deliberately
  // stopped. See PlayoutController.resumeIfInterrupted / stop().
  server.playoutController.resumeIfInterrupted()

  // Only in a packaged build (npm run dist:mac) — in dev mode this would
  // register the temporary dev process as a login item, which breaks the
  // moment the dev session ends. A dedicated always-on box (Mac Mini
  // running this as its one job) should come back up on its own after a
  // reboot or power blip, not wait for someone to notice and open it.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true })
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Standard macOS convention: closing the window does NOT quit the app —
  // it keeps running (visible in the Dock), reachable again via the Dock
  // icon (the 'activate' handler above recreates the window). This matters
  // far more here than in a typical app: quitting on window-close would
  // silently kill an active 24/7 broadcast the moment someone closed the
  // window, which is not what "runs unattended" means. Only fully quit on
  // other platforms, which don't have a dock-icon convention to fall back on.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Actual full quit (Cmd+Q, or app.quit() from non-mac window-all-closed
// above) needs async cleanup — server/recorder/streamer teardown — before
// the process can safely exit. preventDefault + a re-entrant app.quit()
// once cleanup finishes is the standard Electron pattern for this.
app.on('before-quit', (event) => {
  if (isQuitting) return
  event.preventDefault()
  isQuitting = true
  void (async () => {
    await server?.close()
    await publicStreamServer?.close()
    closeDb()
    app.quit()
  })()
})
