import { designWorktopEligible } from './catalog/registry'
import {
  frontDirection,
  intersectRects,
  intervalsOverlapMm,
  placedCabinetRect,
  placedVerticalInterval,
  rectsOverlap,
  unionRect,
  OVERLAP_EPSILON_MM,
  type FloorRect
} from './footprint'
import { roomInteriorRect } from './room'
import { cabinetNumberOf, type PlacedCabinet, type SceneDesign } from './scene'
import { connectedRuns, FLUSH_TOLERANCE_MM, type ConnectedRun } from './snap'
import type { WorktopSettings } from './worktop'

/**
 * Worktop layout: the GEOMETRY side of worktops (Phase 7). Slabs are
 * DERIVED from the scene and the settings by `computeWorktops` on every
 * change and stored nowhere — the renderer draws them and the scene quote
 * prices them from this one list, the way both read a cabinet's generated
 * panel list (architecture rule 2, applied to the scene).
 *
 * The rules, in the order the pipeline applies them:
 *  1. Only cabinets whose kind declares `worktopEligible` count (the registry
 *     owns that fact; a custom piece answers no). Runs are formed over those
 *     alone, so a tall cabinet standing inside a base run splits the worktop.
 *  2. A run is cut into STRETCHES at every step in carcass top height
 *     (> FLUSH_TOLERANCE_MM); each stretch gets one slab resting on its
 *     highest top. Mixed depths within a stretch are bridged: the slab spans
 *     from the deepest back to the common front.
 *  3. The slab's floor rect is the stretch's carcass union pushed forward by
 *     `frontOverhangMm` (from the CARCASS front, like the placement model),
 *     with flush ends (no end overhang), clipped to the room interior.
 *  4. Slabs never intersect. Two slabs intersect when their rects overlap
 *     AND their vertical intervals overlap (the cabinets' own rule, so a low
 *     run's lip disappearing inside a taller run's carcass is not a
 *     conflict). Every intersection is a butt joint decided by geometry:
 *     the slab that would lose LESS area is cut — perpendicular slabs across
 *     their run (the end stops at the other's edge), parallel slabs along it
 *     (the lip retreats); on a tie the stretch holding the lower cabinet
 *     number runs through. The two ways an L-corner is built both yield the
 *     textbook joint: the through slab keeps its lip, the butting slab is
 *     shortened by exactly the overhang.
 *  5. Ids are positional (`worktop-<n>` by the stretch's lowest cabinet
 *     number, then position): React keys and test handles, never identity.
 */

export type RunAxis = ConnectedRun['axis']

export interface WorktopSlab {
  /** `worktop-<n>`, positional (see above). */
  readonly id: string
  readonly materialId: string
  /** World mm, axis-aligned (rotations are multiples of 90°). */
  readonly rect: FloorRect
  /** The stretch's highest carcass top: the slab rests on it. */
  readonly bottomMm: number
  /** `bottomMm + thicknessMm`. */
  readonly topMm: number
  /** The run's axis: the slab's length runs along it. */
  readonly axis: RunAxis
  readonly lengthMm: number
  /** Across the run: carcass depth + overhang, minus whatever the room or a joint took. */
  readonly depthMm: number
  /** The cabinets still under the slab, in order along the axis. */
  readonly memberIds: readonly string[]
}

/** A slab under construction: the same box, with its members and its sort key. */
interface Piece {
  readonly rect: FloorRect
  readonly bottomMm: number
  readonly topMm: number
  readonly axis: RunAxis
  readonly members: readonly PlacedCabinet[]
  /** The lowest `cab-<n>` among the stretch's members (Infinity for ids of another shape). */
  readonly orderNumber: number
  readonly orderId: string
}

function across(axis: RunAxis): RunAxis {
  return axis === 'x' ? 'z' : 'x'
}

function extent(rect: FloorRect, axis: RunAxis): number {
  return axis === 'x' ? rect.maxX - rect.minX : rect.maxZ - rect.minZ
}

function range(rect: FloorRect, axis: RunAxis): readonly [number, number] {
  return axis === 'x' ? [rect.minX, rect.maxX] : [rect.minZ, rect.maxZ]
}

function withRange(rect: FloorRect, axis: RunAxis, from: number, to: number): FloorRect {
  return axis === 'x'
    ? { ...rect, minX: from, maxX: to }
    : { ...rect, minZ: from, maxZ: to }
}

/** Rect AND interval, exactly as `placedCabinetsCollide`; the invariant every layout satisfies. */
export function worktopSlabsIntersect(a: WorktopSlab, b: WorktopSlab): boolean {
  return (
    rectsOverlap(a.rect, b.rect) &&
    intervalsOverlapMm(
      { bottomMm: a.bottomMm, topMm: a.topMm },
      { bottomMm: b.bottomMm, topMm: b.topMm }
    )
  )
}

export function worktopSlabAreaM2(slab: WorktopSlab): number {
  return (slab.lengthMm * slab.depthMm) / 1_000_000
}

/**
 * Cuts a run (members sorted along its axis) into maximal contiguous groups
 * whose carcass tops all lie within FLUSH_TOLERANCE_MM of each other; a step
 * between two neighbours starts a new stretch.
 */
function splitAtHeightSteps(members: readonly PlacedCabinet[]): readonly (readonly PlacedCabinet[])[] {
  const stretches: PlacedCabinet[][] = []
  let current: PlacedCabinet[] = []
  let lowest = 0
  let highest = 0
  for (const member of members) {
    const top = placedVerticalInterval(member).topMm
    const fits =
      current.length > 0 &&
      Math.max(highest, top) - Math.min(lowest, top) <= FLUSH_TOLERANCE_MM
    if (fits) {
      current.push(member)
      lowest = Math.min(lowest, top)
      highest = Math.max(highest, top)
    } else {
      if (current.length > 0) {
        stretches.push(current)
      }
      current = [member]
      lowest = top
      highest = top
    }
  }
  if (current.length > 0) {
    stretches.push(current)
  }
  return stretches
}

function orderNumberOf(members: readonly PlacedCabinet[]): number {
  return Math.min(...members.map((member) => cabinetNumberOf(member.id) ?? Number.POSITIVE_INFINITY))
}

function orderIdOf(members: readonly PlacedCabinet[]): string {
  return members.map((member) => member.id).sort((a, b) => a.localeCompare(b))[0] ?? ''
}

/** One stretch → its slab box: carcass union + front overhang, clipped to the room. */
function stretchPiece(
  members: readonly PlacedCabinet[],
  run: ConnectedRun,
  settings: WorktopSettings,
  interior: FloorRect
): Piece | null {
  const carcass = unionRect(members.map((member) => placedCabinetRect(member)))
  if (carcass === null) {
    return null
  }
  const front = frontDirection(run.rotationDeg)
  const overhang = settings.frontOverhangMm
  const pushed: FloorRect = {
    minX: front.x < 0 ? carcass.minX - overhang : carcass.minX,
    maxX: front.x > 0 ? carcass.maxX + overhang : carcass.maxX,
    minZ: front.z < 0 ? carcass.minZ - overhang : carcass.minZ,
    maxZ: front.z > 0 ? carcass.maxZ + overhang : carcass.maxZ
  }
  // The carcass is inside the room by invariant, so only the lip can be cut off here.
  const rect = intersectRects(pushed, interior)
  if (rect === null) {
    return null
  }
  const bottomMm = Math.max(...members.map((member) => placedVerticalInterval(member).topMm))
  return {
    rect,
    bottomMm,
    topMm: bottomMm + settings.thicknessMm,
    axis: run.axis,
    members,
    orderNumber: orderNumberOf(members),
    orderId: orderIdOf(members)
  }
}

function comparePieces(a: Piece, b: Piece): number {
  if (a.orderNumber !== b.orderNumber) {
    return a.orderNumber - b.orderNumber
  }
  if (a.orderId !== b.orderId) {
    return a.orderId.localeCompare(b.orderId)
  }
  return a.rect.minX - b.rect.minX || a.rect.minZ - b.rect.minZ
}

interface Intersection {
  readonly i: number
  readonly j: number
  readonly overlap: FloorRect
}

function firstIntersection(pieces: readonly Piece[]): Intersection | null {
  for (let i = 0; i < pieces.length; i += 1) {
    for (let j = i + 1; j < pieces.length; j += 1) {
      const a = pieces[i]
      const b = pieces[j]
      if (!intervalsOverlapMm(a, b)) {
        continue
      }
      const overlap = intersectRects(a.rect, b.rect)
      if (overlap !== null) {
        return { i, j, overlap }
      }
    }
  }
  return null
}

interface Strip {
  readonly axis: RunAxis
  readonly from: number
  readonly to: number
  readonly areaMm2: number
}

/**
 * The strip `piece` would give up to clear `overlap` with `other`: across its
 * run when the two are perpendicular (an end strip — the butt joint), along
 * its run when they are parallel (the lip or rear edge retreats). Either way
 * the strip spans the overlap on one axis and the whole piece on the other,
 * so removing it clears the pair completely.
 */
function stripOf(piece: Piece, other: Piece, overlap: FloorRect): Strip {
  const axis = piece.axis !== other.axis ? piece.axis : across(piece.axis)
  const [from, to] = range(overlap, axis)
  return { axis, from, to, areaMm2: (to - from) * extent(piece.rect, across(axis)) }
}

/** The 0–2 pieces of `rect` left when the band `from..to` along `axis` is removed. */
function removeStrip(rect: FloorRect, strip: Strip): readonly FloorRect[] {
  const [low, high] = range(rect, strip.axis)
  const remaining: FloorRect[] = []
  if (strip.from - low > OVERLAP_EPSILON_MM) {
    remaining.push(withRange(rect, strip.axis, low, strip.from))
  }
  if (high - strip.to > OVERLAP_EPSILON_MM) {
    remaining.push(withRange(rect, strip.axis, strip.to, high))
  }
  return remaining
}

/** `piece` reduced to `rect`, keeping the members still under it; null when none is. */
function cutPiece(piece: Piece, rect: FloorRect): Piece | null {
  const members = piece.members.filter((member) => rectsOverlap(placedCabinetRect(member), rect))
  return members.length === 0 ? null : { ...piece, rect, members }
}

/**
 * Resolves every slab/slab intersection into a butt joint. Each cut removes
 * the whole overlap of one pair from one slab, and a slab only ever shrinks,
 * so no cut creates a new intersection: the number of intersecting pairs
 * strictly decreases and the loop ends after at most n(n−1)/2 cuts.
 */
function resolveIntersections(initial: readonly Piece[]): readonly Piece[] {
  const pieces = [...initial]
  for (;;) {
    const found = firstIntersection(pieces)
    if (found === null) {
      return pieces
    }
    const a = pieces[found.i]
    const b = pieces[found.j]
    const stripA = stripOf(a, b, found.overlap)
    const stripB = stripOf(b, a, found.overlap)
    // Smaller loss is cut; on a tie the later piece (higher lowest cabinet
    // number) gives way, so the corner does not flip while a run is built.
    const cutLater = stripB.areaMm2 <= stripA.areaMm2
    const index = cutLater ? found.j : found.i
    const victim = cutLater ? b : a
    const strip = cutLater ? stripB : stripA
    const remaining = removeStrip(victim.rect, strip)
      .map((rect) => cutPiece(victim, rect))
      .filter((piece): piece is Piece => piece !== null)
    pieces.splice(index, 1, ...remaining)
  }
}

function toSlab(piece: Piece, number: number, materialId: string): WorktopSlab {
  return {
    id: `worktop-${number}`,
    materialId,
    rect: piece.rect,
    bottomMm: piece.bottomMm,
    topMm: piece.topMm,
    axis: piece.axis,
    lengthMm: extent(piece.rect, piece.axis),
    depthMm: extent(piece.rect, across(piece.axis)),
    memberIds: piece.members.map((member) => member.id)
  }
}

/**
 * The worktop slabs of a scene: derived, deterministic (the same cabinets in
 * any array order give the same slabs, ids included), never intersecting.
 * Empty when disabled or when no eligible cabinet stands in the scene.
 */
export function computeWorktops(scene: SceneDesign, settings: WorktopSettings): readonly WorktopSlab[] {
  if (!settings.enabled) {
    return []
  }
  const eligible = scene.cabinets.filter((cabinet) => designWorktopEligible(cabinet.design))
  if (eligible.length === 0) {
    return []
  }
  const byId = new Map(eligible.map((cabinet) => [cabinet.id, cabinet]))
  const interior = roomInteriorRect(scene.room)
  const pieces: Piece[] = []
  for (const run of connectedRuns({ ...scene, cabinets: eligible })) {
    const members = run.memberIds.flatMap((id) => {
      const member = byId.get(id)
      return member === undefined ? [] : [member]
    })
    for (const stretch of splitAtHeightSteps(members)) {
      const piece = stretchPiece(stretch, run, settings, interior)
      if (piece !== null) {
        pieces.push(piece)
      }
    }
  }
  pieces.sort(comparePieces)
  return resolveIntersections(pieces).map((piece, index) =>
    toSlab(piece, index + 1, settings.materialId)
  )
}
