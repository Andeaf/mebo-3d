import {
  app,
  dialog,
  ipcMain,
  shell,
  BrowserWindow,
  Menu,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions
} from 'electron'
import { existsSync, promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { atomicWrite } from './atomicWrite'
import { loadPriceList, priceListPaths } from './priceList'
import type {
  MenuAction,
  MenuModel,
  ProjectReadResult,
  ProjectWriteResult,
  SaveDialogOptions,
  UnsavedChoice,
  UnsavedDialogLabels
} from '../preload/api'
import { PROJECT_EXTENSION, projectPathFromArgv } from './launchArgs'

// ---------------------------------------------------------------------------
// The price list.
//
// Packaged: the firm's list is `<userData>/materials.json` (%APPDATA%\mebo-3d),
// seeded from the shipped `resources/data/materials.json` on first run and
// never overwritten afterwards; every load appends the shipped ids it lacks
// and was never offered (priceList.ts). In DEV the repo's data/materials.json
// is read as-is, with no seed and no merge: dev and the installed app share
// the same userData folder on one machine, so a dev run must not write into
// the installed app's price list. The repo file is the shipped source the
// developer edits (edit + restart, as always).

/** The shipped list: beside the asar when packaged, the repo's data folder in dev. */
function shippedMaterialsPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath()
  return join(base, 'data', 'materials.json')
}

/** The file the app prices with — what Prices › Open shows. */
function priceListFilePath(): string {
  return app.isPackaged ? priceListPaths(app.getPath('userData'), shippedMaterialsPath()).user : shippedMaterialsPath()
}

// Loads are serialized: a reload during the start-up load must not run two
// merges over the same files.
let priceListQueue: Promise<unknown> = Promise.resolve()

function readPriceList(): Promise<string> {
  const next = priceListQueue.then(async () => {
    if (!app.isPackaged) {
      return fs.readFile(shippedMaterialsPath(), 'utf-8')
    }
    const load = await loadPriceList(priceListPaths(app.getPath('userData'), shippedMaterialsPath()))
    if (load.seeded || load.appendedIds.length > 0) {
      console.log(
        `price list: ${load.seeded ? 'seeded' : 'merged'} ${priceListFilePath()}` +
          (load.appendedIds.length > 0 ? ` (+ ${load.appendedIds.join(', ')})` : '')
      )
    }
    return load.text
  })
  priceListQueue = next.catch(() => undefined)
  return next
}

/** Prices › Open price list: the file selected in Explorer, or its folder when it does not exist yet. */
function revealPriceList(): void {
  const path = priceListFilePath()
  if (existsSync(path)) {
    shell.showItemInFolder(path)
  } else {
    void shell.openPath(dirname(path))
  }
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

// ---------------------------------------------------------------------------
// Launch with a project file (the .mebo association) and the single instance.
// Main never opens a file itself: it hands the path to the renderer, which
// owns the open flow and the unsaved-changes guard. The first launch's path
// waits until the renderer PULLS it (`launch:project-path`) — a push could
// fire before the renderer's listener exists. Once pulled, later paths (a
// double-click while the app runs) are PUSHED as `project:open-request`.

/** The launch's project file as an absolute path; null when the launch carries none. */
function launchProjectPath(argv: readonly string[], workingDirectory: string): string | null {
  const path = projectPathFromArgv(argv)
  return path === null ? null : resolve(workingDirectory, path)
}

let pendingProjectPath: string | null = launchProjectPath(process.argv, process.cwd())
let rendererPulled = false

function deliverProjectPath(path: string): void {
  const window = BrowserWindow.getAllWindows()[0]
  if (!rendererPulled || window === undefined) {
    pendingProjectPath = path
    return
  }
  window.webContents.send('project:open-request', path)
}

function focusMainWindow(): void {
  const window = BrowserWindow.getAllWindows()[0]
  if (window === undefined) {
    return
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.focus()
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

/**
 * Edit › Undo / Redo. The accelerators are DISPLAYED but not registered
 * (`registerAccelerator: false`): the renderer owns Ctrl+Z / Ctrl+Y so it
 * can leave them to a text field's own undo while one has focus. A
 * natively registered accelerator would fire the scene undo instead.
 */
function editMenu(model: MenuModel): MenuItemConstructorOptions {
  const { labels } = model
  return {
    label: menuLabel(labels.edit),
    submenu: [
      {
        label: menuLabel(labels.undo),
        accelerator: 'CmdOrCtrl+Z',
        registerAccelerator: false,
        enabled: model.canUndo,
        click: () => sendMenuAction('undo')
      },
      {
        label: menuLabel(labels.redo),
        accelerator: 'CmdOrCtrl+Y',
        registerAccelerator: false,
        enabled: model.canRedo,
        click: () => sendMenuAction('redo')
      }
    ]
  }
}

/**
 * Prices › Open price list / Reload prices. Its own menu: the price list is
 * not a project file. Open is served here (a shell call, no renderer state);
 * Reload goes to the renderer, which owns the loaded database.
 */
function pricesMenu(model: MenuModel): MenuItemConstructorOptions {
  const { labels } = model
  return {
    label: menuLabel(labels.prices),
    submenu: [
      { label: menuLabel(labels.openPriceList), click: () => revealPriceList() },
      { label: menuLabel(labels.reloadPrices), click: () => sendMenuAction('reload-prices') }
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
  const template = [
    ...(model === null ? [] : [fileMenu(model), editMenu(model), pricesMenu(model)]),
    ...devMenu()
  ]
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
  try {
    await atomicWrite(path, text)
    return { ok: true }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

function registerIpc(): void {
  ipcMain.handle('materials:load', () => readPriceList())

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

  ipcMain.handle('launch:project-path', (): string | null => {
    rendererPulled = true
    const path = pendingProjectPath
    pendingProjectPath = null
    return path
  })
}

// One instance: a second launch (a double-clicked .mebo while the app runs)
// hands its arguments to the running one and quits at once.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    focusMainWindow()
    const path = launchProjectPath(argv, workingDirectory)
    if (path !== null) {
      deliverProjectPath(path)
    }
  })

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
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
