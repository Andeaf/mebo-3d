import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import {
  mergeShippedMaterials,
  PriceListMergeError,
  serializeOfferedIds
} from '../core/priceListMerge'
import { atomicWrite } from './atomicWrite'

/**
 * The firm's price list in the user's data folder (Phase 11, packaged app).
 *
 *   <userData>/materials.json          the list the app prices with — the ONLY file it reads
 *   <userData>/materials.backup.json   the user's file, exact bytes, before the last merge write
 *   <userData>/materials.offered.json  sidecar: every shipped id ever offered to this file
 *   <resources>/data/materials.json    the shipped list; read only to seed and to merge
 *
 * Every load: a missing user file is seeded with the shipped bytes verbatim;
 * then the shipped ids the user's file lacks and was never offered are
 * appended (`mergeShippedMaterials`, pure). An invalid user file is returned
 * untouched — the renderer shows the load error, nothing is "repaired" or
 * replaced. A missing or invalid shipped file skips the merge. Node fs only,
 * no Electron, so the whole thing runs under vitest against a temp dir.
 */
export interface PriceListPaths {
  readonly user: string
  readonly backup: string
  readonly offered: string
  readonly shipped: string
}

export const PRICE_LIST_FILE = 'materials.json'
export const PRICE_LIST_BACKUP_FILE = 'materials.backup.json'
export const PRICE_LIST_OFFERED_FILE = 'materials.offered.json'

export function priceListPaths(userDataDir: string, shipped: string): PriceListPaths {
  return {
    user: join(userDataDir, PRICE_LIST_FILE),
    backup: join(userDataDir, PRICE_LIST_BACKUP_FILE),
    offered: join(userDataDir, PRICE_LIST_OFFERED_FILE),
    shipped
  }
}

/** What one load did, for the log and the tests; the text is what the renderer parses. */
export interface PriceListLoad {
  readonly text: string
  readonly seeded: boolean
  readonly appendedIds: readonly string[]
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

/** The file's text, or null when it does not exist (any other failure throws). */
async function readOptional(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8')
  } catch (error) {
    if (isNotFound(error)) {
      return null
    }
    throw error
  }
}

/** JSON.parse that yields `null` for text that is not JSON (the merge treats null as invalid). */
function parseLoosely(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

/**
 * Seeds, merges and returns the user's price-list text. Throws only when the
 * user file is missing AND the shipped one cannot be read (nothing to
 * price with), or on an I/O failure writing the seed — the same "load error
 * at startup" the renderer has always shown.
 */
export async function loadPriceList(paths: PriceListPaths): Promise<PriceListLoad> {
  let userText = await readOptional(paths.user)
  let seeded = false
  if (userText === null) {
    // First run: the shipped bytes, verbatim. The merge below then finds
    // nothing to append and writes the sidecar.
    userText = await fs.readFile(paths.shipped, 'utf-8')
    await atomicWrite(paths.user, userText)
    seeded = true
  }

  const shippedText = await readOptional(paths.shipped)
  if (shippedText === null) {
    return { text: userText, seeded, appendedIds: [] }
  }

  // An unparsable user file must reach the renderer as-is (it names the
  // error); the merge would throw, so skip it and touch nothing.
  let userRaw: unknown
  try {
    userRaw = JSON.parse(userText) as unknown
  } catch {
    return { text: userText, seeded, appendedIds: [] }
  }

  const offeredText = await readOptional(paths.offered)
  const offeredRaw = offeredText === null ? undefined : parseLoosely(offeredText)

  let merged
  try {
    merged = mergeShippedMaterials(userRaw, parseLoosely(shippedText), offeredRaw)
  } catch (error) {
    if (error instanceof PriceListMergeError) {
      // Invalid user list → the renderer reports it, the file stays as it is.
      // Invalid shipped list → nothing to offer; the user's list still loads.
      return { text: userText, seeded, appendedIds: [] }
    }
    throw error
  }

  if (merged.text !== null) {
    // Backup first, then the list, then the sidecar: a crash between any two
    // leaves a file set the next run merges to the same result.
    await atomicWrite(paths.backup, userText)
    await atomicWrite(paths.user, merged.text)
    userText = merged.text
  }
  const offeredNext = serializeOfferedIds(merged.offeredIds)
  if (offeredNext !== offeredText) {
    await atomicWrite(paths.offered, offeredNext)
  }
  return { text: userText, seeded, appendedIds: merged.appendedIds }
}
