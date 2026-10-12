import { parsePriceDatabase } from './materials'

/**
 * Merging a shipped price list into the firm's own (Phase 11).
 *
 * The user's `materials.json` is the only list the app prices with; an
 * update may ship NEW material ids (a future kind, a new piece of
 * hardware) that the user's file lacks, and those are appended so they get
 * a default price. Three rules, in order of importance:
 *
 * 1. NEVER modify an existing entry — the result is built from the user's
 *    RAW JSON value, so an edited price, an extra key the firm added and the
 *    key order all survive; only entries are appended.
 * 2. Never bring back a material the user deliberately deleted — the
 *    sidecar (`offeredIds`) remembers every shipped id ever offered, and an
 *    id that was offered once is never appended again.
 * 3. Idempotent — a second run on the first run's output appends nothing.
 *
 * Pure: raw JSON values in, text out. The caller owns the files.
 */

export interface PriceListMergeResult {
  /** The merged file text, or null when nothing was appended (the user's file is not rewritten). */
  readonly text: string | null
  /** The shipped ids appended to the user's list, in shipped order. */
  readonly appendedIds: readonly string[]
  /** The sidecar's new content: every id offered so far, including this run's. */
  readonly offeredIds: readonly string[]
}

export type PriceListSide = 'user' | 'shipped'

/** One side of the merge is not a valid price database; `side` names which. */
export class PriceListMergeError extends Error {
  constructor(
    readonly side: PriceListSide,
    message: string
  ) {
    super(`${side} price list: ${message}`)
    this.name = 'PriceListMergeError'
  }
}

/**
 * The ids every build before 0.11 shipped (data/materials.json was unchanged
 * from Phase 7 to Phase 10). A user file WITHOUT a sidecar predates the
 * sidecar, so these ids were offered to it: one that is missing was deleted
 * on purpose, one outside the set is new. FROZEN — never the live list.
 */
export const LEGACY_SHIPPED_MATERIAL_IDS: readonly string[] = [
  'melamine-white-18',
  'mdf-18',
  'hpl-18',
  'hdf-back-3',
  'abs-edge',
  'hinge-standard',
  'handle-standard',
  'hanging-bracket',
  'drawer-slide-pair',
  'worktop-hpl-38',
  'worktop-oak-40'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validate(side: PriceListSide, raw: unknown): readonly string[] {
  try {
    return parsePriceDatabase(raw).materials.map((material) => material.id)
  } catch (error) {
    throw new PriceListMergeError(side, error instanceof Error ? error.message : String(error))
  }
}

/**
 * The sidecar's ids. `undefined` = no sidecar yet → the legacy set. Any
 * other shape that is not `{ offeredIds: string[] }` → null, which the
 * merge reads as "everything shipped was offered": it errs towards never
 * resurrecting a deletion, and the sidecar is rewritten cleanly.
 */
export function parseOfferedIds(raw: unknown): readonly string[] | null {
  if (raw === undefined) {
    return LEGACY_SHIPPED_MATERIAL_IDS
  }
  if (!isRecord(raw) || !Array.isArray(raw.offeredIds)) {
    return null
  }
  const ids = raw.offeredIds
  return ids.every((id): id is string => typeof id === 'string') ? ids : null
}

/** The sidecar file's JSON text for a set of offered ids. */
export function serializeOfferedIds(offeredIds: readonly string[]): string {
  return `${JSON.stringify({ offeredIds }, null, 2)}\n`
}

/**
 * @param user     the user's materials.json, parsed (`unknown`)
 * @param shipped  the shipped materials.json, parsed (`unknown`)
 * @param offered  the sidecar, parsed; `undefined` when the file does not exist
 * @throws PriceListMergeError when the user's or the shipped list is invalid
 */
export function mergeShippedMaterials(user: unknown, shipped: unknown, offered: unknown): PriceListMergeResult {
  const userIds = new Set(validate('user', user))
  const shippedIds = validate('shipped', shipped)
  const previouslyOffered = parseOfferedIds(offered)

  // Both validated above, so the shapes hold; this only lets TS narrow.
  if (!isRecord(user) || !Array.isArray(user.materials) || !isRecord(shipped) || !Array.isArray(shipped.materials)) {
    throw new PriceListMergeError('user', 'price database must be an object with a "materials" array')
  }
  const rawUserMaterials: readonly unknown[] = user.materials
  const rawShippedMaterials: readonly unknown[] = shipped.materials

  const offeredSet = new Set(previouslyOffered ?? shippedIds)
  const appended: unknown[] = []
  const appendedIds: string[] = []
  rawShippedMaterials.forEach((entry, index) => {
    const id = shippedIds[index]
    if (!userIds.has(id) && !offeredSet.has(id)) {
      appended.push(entry)
      appendedIds.push(id)
    }
  })

  const offeredIds = [...offeredSet]
  for (const id of shippedIds) {
    if (!offeredSet.has(id)) {
      offeredSet.add(id)
      offeredIds.push(id)
    }
  }

  if (appended.length === 0) {
    return { text: null, appendedIds, offeredIds }
  }
  // The user's raw record, its own keys and their order intact; only `materials` grows.
  const merged = { ...user, materials: [...rawUserMaterials, ...appended] }
  return { text: `${JSON.stringify(merged, null, 2)}\n`, appendedIds, offeredIds }
}
