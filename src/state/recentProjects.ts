/**
 * The File › Open Recent list. Persisted in localStorage with the same
 * best-effort discipline as the language choice: a missing or corrupt value
 * simply means an empty list.
 *
 * Entries are never pre-checked against the disk. One whose file has gone is
 * dropped the moment opening it fails (with the message shown in-app), so a
 * file on a USB stick or a network share that comes back keeps working.
 */
export interface RecentProject {
  readonly path: string
  /** Display name at the time it was opened or saved (the file name). */
  readonly name: string
  /** ISO 8601. */
  readonly openedAt: string
}

export const MAX_RECENT_PROJECTS = 8

const STORAGE_KEY = 'mebo.recentProjects'

/** Puts `entry` in front, dropping any older entry for the same path, capped at MAX_RECENT_PROJECTS. */
export function pushRecent(
  list: readonly RecentProject[],
  entry: RecentProject
): readonly RecentProject[] {
  return [entry, ...list.filter((existing) => existing.path !== entry.path)].slice(
    0,
    MAX_RECENT_PROJECTS
  )
}

export function removeRecent(list: readonly RecentProject[], path: string): readonly RecentProject[] {
  return list.filter((existing) => existing.path !== path)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRecentProject(value: unknown): value is RecentProject {
  return (
    isRecord(value) &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    typeof value.name === 'string' &&
    typeof value.openedAt === 'string'
  )
}

/** Untrusted stored JSON → a clean list; malformed entries are dropped, not fatal. */
export function parseRecentProjects(raw: unknown): readonly RecentProject[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const entries: RecentProject[] = []
  for (const candidate of raw) {
    if (isRecentProject(candidate) && !entries.some((entry) => entry.path === candidate.path)) {
      entries.push({ path: candidate.path, name: candidate.name, openedAt: candidate.openedAt })
    }
  }
  return entries.slice(0, MAX_RECENT_PROJECTS)
}

export function loadRecentProjects(): readonly RecentProject[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === null ? [] : parseRecentProjects(JSON.parse(stored))
  } catch {
    return []
  }
}

export function storeRecentProjects(list: readonly RecentProject[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Persistence is best-effort; the in-memory list still applies.
  }
}
