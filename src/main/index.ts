import { app, BrowserWindow, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

/**
 * The price database is read from disk on every app start so that editing
 * data/materials.json and restarting changes the prices (it is never bundled).
 * Packaged builds should ship the data folder via extraResources.
 */
function resolveMaterialsPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'data', 'materials.json')
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Mebo 3D',
    backgroundColor: '#16181d',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  window.on('ready-to-show', () => {
    window.show()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('materials:load', () => fs.readFile(resolveMaterialsPath(), 'utf-8'))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
