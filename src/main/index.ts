import {
  app,
  dialog,
  ipcMain,
  BrowserWindow,
  Menu,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions
} from 'electron'
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import type {
  MenuAction,
  MenuModel,
  ProjectReadResult,
  ProjectWriteResult,
  SaveDialogOptions,
  UnsavedChoice,
  UnsavedDialogLabels
} from '../preload/api'

const PROJECT_EXTENSION = 'mebo'

/**
 * The price database is read from disk on every app start so that editing
 * data/materials.json and restarting changes the prices (it is never bundled).
 * Packaged builds should ship the data folder via extraResources.
 */
function resolveMaterialsPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'data', 'materials.json')
}

// ---------------------------------------------------------------------------
// Close guard. Main only mirrors the renderer's dirty flag; the renderer runs
// the save / discard / cancel dialog and calls back when the guard passed.

interface WindowGuard {
  dirty: boolean
  closeApproved: boolean
}

const guards = new WeakMap<BrowserWindow, WindowGuard>()

function guardOf(window: BrowserWindow): WindowGuard {
  let guard = guards.get(window)
  if (guard === undefined) {
    guard = { dirty: false, closeApproved: false }
    guards.set(window, guard)
  }
  return guard
}

function windowOf(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/** Dev only: the window icon from the repo. A packaged exe carries it embedded (electron-builder). */
function windowIcon(): string | undefined {
  return app.isPackaged ? undefined : join(app.getAppPath(), 'build', 'icon.ico')
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Mebo 3D',
    icon: windowIcon(),
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

  window.on('close', (event) => {
    const guard = guardOf(window)
    if (guard.dirty && !guard.closeApproved) {
      event.preventDefault()
      window.webContents.send('window:close-requested')
    }
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ---------------------------------------------------------------------------
// Application menu, rebuilt from renderer-supplied (translated) labels.

/** `&` marks a mnemonic in Windows menu labels; file names must not become one. */
function menuLabel(text: string): string {
  return text.replace(/&/g, '&&')
}

function sendMenuAction(action: MenuAction): void {
  const target = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send('menu:action', action)
}

function fileMenu(model: MenuModel): MenuItemConstructorOptions {
  const { labels, recent } = model
  const recentItems: MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: menuLabel(labels.noRecent), enabled: false }]
      : recent.map((entry) => ({
          label: menuLabel(`${entry.name}    ${dirname(entry.path)}`),
          click: () => sendMenuAction({ openRecent: entry.path })
        }))
  return {
    label: menuLabel(labels.file),
    submenu: [
      { label: menuLabel(labels.new), accelerator: 'CmdOrCtrl+N', click: () => sendMenuAction('new') },
      { label: menuLabel(labels.open), accelerator: 'CmdOrCtrl+O', click: () => sendMenuAction('open') },
      { label: menuLabel(labels.openRecent), submenu: recentItems },
      { type: 'separator' },
      { label: menuLabel(labels.save), accelerator: 'CmdOrCtrl+S', click: () => sendMenuAction('save') },
      {
        label: menuLabel(labels.saveAs),
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => sendMenuAction('save-as')
      },
      { type: 'separator' },
      // Quitting closes every window, so the close guard above still applies.
      { label: menuLabel(labels.exit), role: 'quit' }
    ]
  }
}

/** Development only: keep reload and devtools reachable once the default menu is gone. */
function devMenu(): MenuItemConstructorOptions[] {
  return app.isPackaged
    ? []
    : [{ label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] }]
}

function applyMenu(model: MenuModel | null): void {
  const template = [...(model === null ? [] : [fileMenu(model)]), ...devMenu()]
  Menu.setApplicationMenu(template.length === 0 ? null : Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------------------
// Project files.

function errnoCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function documentsDir(): string {
  try {
    return app.getPath('documents')
  } catch {
    return app.getPath('home')
  }
}

function withProjectExtension(path: string): string {
  return path.toLowerCase().endsWith(`.${PROJECT_EXTENSION}`) ? path : `${path}.${PROJECT_EXTENSION}`
}

async function readProject(path: string): Promise<ProjectReadResult> {
  try {
    return { ok: true, text: await fs.readFile(path, 'utf-8') }
  } catch (error) {
    return {
      ok: false,
      reason: errnoCode(error) === 'ENOENT' ? 'not-found' : 'io',
      message: messageOf(error)
    }
  }
}

/** Temp file in the same directory, then rename: a crash mid-write never leaves a truncated project. */
async function writeProject(path: string, text: string): Promise<ProjectWriteResult> {
  const temp = `${path}.tmp`
  try {
    await fs.writeFile(temp, text, 'utf-8')
    try {
      await fs.rename(temp, path)
    } catch (error) {
      await fs.rm(temp, { force: true })
      throw error
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

function registerIpc(): void {
  ipcMain.handle('materials:load', () => fs.readFile(resolveMaterialsPath(), 'utf-8'))

  ipcMain.handle('project:open-dialog', async (event, filterName: string): Promise<string | null> => {
    const window = windowOf(event)
    const options = {
      defaultPath: documentsDir(),
      filters: [{ name: filterName, extensions: [PROJECT_EXTENSION] }],
      properties: ['openFile' as const]
    }
    const result =
      window === null ? await dialog.showOpenDialog(options) : await dialog.showOpenDialog(window, options)
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(
    'project:save-dialog',
    async (event, { suggestedName, currentDir, filterName }: SaveDialogOptions): Promise<string | null> => {
      const window = windowOf(event)
      const options = {
        defaultPath: join(currentDir ?? documentsDir(), `${suggestedName}.${PROJECT_EXTENSION}`),
        filters: [{ name: filterName, extensions: [PROJECT_EXTENSION] }]
      }
      const result =
        window === null ? await dialog.showSaveDialog(options) : await dialog.showSaveDialog(window, options)
      return result.canceled || result.filePath === undefined || result.filePath === ''
        ? null
        : withProjectExtension(result.filePath)
    }
  )

  ipcMain.handle('project:read', (_event, path: string) => readProject(path))
  ipcMain.handle('project:write', (_event, path: string, text: string) => writeProject(path, text))

  ipcMain.handle(
    'project:confirm-unsaved',
    async (event, labels: UnsavedDialogLabels): Promise<UnsavedChoice> => {
      const window = windowOf(event)
      const choices: readonly UnsavedChoice[] = ['save', 'discard', 'cancel']
      const options = {
        type: 'warning' as const,
        title: labels.title,
        message: labels.message,
        buttons: [labels.save, labels.discard, labels.cancel],
        defaultId: 2,
        cancelId: 2,
        noLink: true
      }
      const result =
        window === null ? await dialog.showMessageBox(options) : await dialog.showMessageBox(window, options)
      return choices[result.response] ?? 'cancel'
    }
  )

  ipcMain.on('project:set-dirty', (event, dirty: boolean) => {
    const window = windowOf(event)
    if (window !== null) {
      guardOf(window).dirty = dirty
    }
  })

  ipcMain.on('project:confirm-close', (event) => {
    const window = windowOf(event)
    if (window !== null) {
      guardOf(window).closeApproved = true
      window.close()
    }
  })

  ipcMain.on('menu:update', (_event, model: MenuModel) => {
    applyMenu(model)
  })
}

app.whenReady().then(() => {
  // No default menu flash: File appears once the renderer sends its labels.
  applyMenu(null)
  registerIpc()
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
