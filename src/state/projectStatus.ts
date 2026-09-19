import { PROJECT_FILE_EXTENSION } from '@core/project'

/**
 * Where the open project lives. Pure transitions over a small value; the
 * store holds one and the renderer's project commands drive it. Tested
 * without Electron or zustand.
 *
 * The project NAME is always the file name (basename without `.mebo`), never
 * something typed in: renaming the file in Explorer is reflected on the next
 * open, and the two can never disagree. A never-saved project has no name;
 * the UI shows its translated "Untitled".
 *
 * Whether the project has unsaved changes is NOT a field here: since Phase 9
 * the store derives it from the scene (`isProjectDirty`: the current scene
 * is not the reference that was last saved, opened or created), which is
 * what lets an undo back to the saved scene clear the flag.
 */
export interface ProjectStatus {
  /** Absolute file path; null until the first save. */
  readonly path: string | null
  /** Basename without extension; null until the first save. */
  readonly name: string | null
  /** The file's creation stamp (ISO 8601), preserved across saves; null until the first save. */
  readonly createdAt: string | null
}

export const NEW_PROJECT: ProjectStatus = { path: null, name: null, createdAt: null }

/** After a successful write: at that path, keeping the original creation stamp. */
export function markSaved(status: ProjectStatus, path: string, savedAt: string): ProjectStatus {
  return {
    path,
    name: projectNameFromPath(path),
    createdAt: status.createdAt ?? savedAt
  }
}

/** After a successful open: at that path, with the file's own creation stamp. */
export function markOpened(path: string, createdAt: string): ProjectStatus {
  return { path, name: projectNameFromPath(path), createdAt }
}

const EXTENSION_SUFFIX = `.${PROJECT_FILE_EXTENSION}`

/** `C:\Klanten\Jansen\Keuken.mebo` and `/home/x/Keuken.mebo` both give `Keuken`. */
export function projectNameFromPath(path: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const base = separator === -1 ? path : path.slice(separator + 1)
  return base.toLowerCase().endsWith(EXTENSION_SUFFIX)
    ? base.slice(0, base.length - EXTENSION_SUFFIX.length)
    : base
}
