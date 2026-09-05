import { PROJECT_FILE_EXTENSION } from '@core/project'

/**
 * Where the open project lives and whether it has unsaved changes. Pure
 * transitions over a small value; the store holds one and the renderer's
 * project commands drive it. Tested without Electron or zustand.
 *
 * The project NAME is always the file name (basename without `.mebo`), never
 * something typed in: renaming the file in Explorer is reflected on the next
 * open, and the two can never disagree. A never-saved project has no name;
 * the UI shows its translated "Untitled".
 */
export interface ProjectStatus {
  /** Absolute file path; null until the first save. */
  readonly path: string | null
  /** Basename without extension; null until the first save. */
  readonly name: string | null
  /** True when the scene differs from what the file holds. */
  readonly dirty: boolean
  /** The file's creation stamp (ISO 8601), preserved across saves; null until the first save. */
  readonly createdAt: string | null
}

export const NEW_PROJECT: ProjectStatus = { path: null, name: null, dirty: false, createdAt: null }

/** Idempotent: an already dirty status is returned as the same object. */
export function markDirty(status: ProjectStatus): ProjectStatus {
  return status.dirty ? status : { ...status, dirty: true }
}

/** After a successful write: clean, at that path, keeping the original creation stamp. */
export function markSaved(status: ProjectStatus, path: string, savedAt: string): ProjectStatus {
  return {
    path,
    name: projectNameFromPath(path),
    dirty: false,
    createdAt: status.createdAt ?? savedAt
  }
}

/** After a successful open: clean, at that path, with the file's own creation stamp. */
export function markOpened(path: string, createdAt: string): ProjectStatus {
  return { path, name: projectNameFromPath(path), dirty: false, createdAt }
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
