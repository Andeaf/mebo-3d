/**
 * The piece editor's dimension chains (Phase 12) are a VIEW preference like
 * the language: on by default, toggled with M or the toolbar button, kept
 * in localStorage, never part of the document or the history.
 */
const STORAGE_KEY = 'mebo.dimensions'

export const DEFAULT_SHOW_DIMENSIONS = true

/** Restores the persisted choice; on when unavailable or unreadable. */
export function loadStoredShowDimensions(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === null ? DEFAULT_SHOW_DIMENSIONS : stored === 'on'
  } catch {
    return DEFAULT_SHOW_DIMENSIONS
  }
}

export function storeShowDimensions(show: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, show ? 'on' : 'off')
  } catch {
    // Persistence is best-effort; the in-memory choice still applies.
  }
}
