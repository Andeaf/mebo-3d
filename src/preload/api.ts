/**
 * The contract between the renderer and the Electron main process — types
 * only, shared by main (which serves the channels), the preload (which
 * exposes `window.api`) and the renderer (which calls it). No runtime code.
 *
 * Reads and writes return result objects instead of throwing: an error that
 * crosses IPC keeps only its message, and the renderer needs to tell a
 * missing file (drop it from the recent list) from any other failure.
 */

export type ProjectReadResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'not-found' | 'io'; readonly message: string }

export type ProjectWriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export interface SaveDialogOptions {
  /** File name without extension to propose. */
  readonly suggestedName: string
  /** Directory to open in; null means the user's Documents folder. */
  readonly currentDir: string | null
  /** Translated name of the `.mebo` filter. */
  readonly filterName: string
}

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

/** Translated strings for the native "unsaved changes" dialog. */
export interface UnsavedDialogLabels {
  readonly title: string
  readonly message: string
  readonly save: string
  readonly discard: string
  readonly cancel: string
}

/** Translated labels for the native application menu. */
export interface MenuLabels {
  readonly file: string
  readonly new: string
  readonly open: string
  readonly openRecent: string
  readonly noRecent: string
  readonly save: string
  readonly saveAs: string
  readonly exit: string
  readonly edit: string
  readonly undo: string
  readonly redo: string
  readonly prices: string
  readonly openPriceList: string
  readonly reloadPrices: string
}

export interface MenuRecentEntry {
  readonly path: string
  readonly name: string
}

export interface MenuModel {
  readonly labels: MenuLabels
  readonly recent: readonly MenuRecentEntry[]
  /** Enabled states of Edit › Undo / Redo (the renderer owns the history). */
  readonly canUndo: boolean
  readonly canRedo: boolean
}

export type MenuAction =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  /** Prices › Reload: the renderer re-reads the price list; the scene re-prices live. */
  | 'reload-prices'
  | { readonly openRecent: string }

export interface MeboApi {
  /**
   * Raw text of the price list — the user's `<userData>/materials.json` when
   * packaged (seeded and merged from the shipped list first, see
   * main/priceList.ts), the repo's data/materials.json in dev; parsing and
   * validation happen in the core.
   */
  readonly loadMaterialsFile: () => Promise<string>

  /** Native open dialog filtered to `.mebo`; null when cancelled. */
  readonly showOpenProjectDialog: (filterName: string) => Promise<string | null>
  /** Native save dialog; the returned path always ends in `.mebo`; null when cancelled. */
  readonly showSaveProjectDialog: (options: SaveDialogOptions) => Promise<string | null>
  readonly readProjectFile: (path: string) => Promise<ProjectReadResult>
  /** Atomic: written to a temp file and renamed over the target. */
  readonly writeProjectFile: (path: string, text: string) => Promise<ProjectWriteResult>
  /** Native save / discard / cancel question; Cancel is the default and Escape. */
  readonly confirmUnsaved: (labels: UnsavedDialogLabels) => Promise<UnsavedChoice>

  /** Mirrors the dirty flag into main so the window's close event can ask first. */
  readonly setProjectDirty: (dirty: boolean) => void
  /** The close guard passed (saved or discarded): main closes the window for real. */
  readonly confirmClose: () => void

  /** Rebuilds the application menu from translated labels and the recent list. */
  readonly updateMenu: (menu: MenuModel) => void
  /** Menu / accelerator events; returns the unsubscribe function. */
  readonly onMenuAction: (listener: (action: MenuAction) => void) => () => void
  /** Fired when a dirty window is being closed; returns the unsubscribe function. */
  readonly onCloseRequested: (listener: () => void) => () => void

  /** The `.mebo` file this launch was started with (file association), handed out once; null when none. */
  readonly getLaunchProjectPath: () => Promise<string | null>
  /** A `.mebo` file opened while the app runs (second instance); returns the unsubscribe function. */
  readonly onOpenFileRequested: (listener: (path: string) => void) => () => void
}
