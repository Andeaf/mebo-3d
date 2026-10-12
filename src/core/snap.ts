import {
  cabinetFootprintSize,
  cabinetOverlapsOthers,
  frontDirection,
  frontFaceCoordinate,
  intervalsOverlapMm,
  placedCabinetRect,
  placedVerticalInterval,
  rotatedFootprintSize,
  unionRect,
  type FloorPosition,
  type FloorRect
} from './footprint'
import type { CabinetDesign } from './cabinet'
import {
  clampCenterIntoRoom,
  roomContainsRect,
  roomInteriorRect,
  roomWallSegments,
  wallInteriorNormal,
  type RoomDesign,
  type WallSegment
} from './room'
import { findPlacedCabinet, type PlacedCabinet, type RotationDegrees, type SceneDesign } from './scene'

/** A side within this distance of another cabinet's side snaps flush. */
export const SNAP_DISTANCE_MM = 30
/** Edges/fronts within this tolerance count as flush/aligned (run detection). */
export const FLUSH_TOLERANCE_MM = 1

export interface SnapResult {
  readonly positionX: number
  readonly positionZ: number
  readonly snapped: boolean
}

// Lives with the other floor-plane geometry; re-exported so the placement API
// stays one import site.
export type { FloorPosition } from './footprint'

function facesAlongZ(rotationDeg: RotationDegrees): boolean {
  return rotationDeg === 0 || rotationDeg === 180
}

/** Unit vector towards the cabinet's own right-hand side (seen from above). */
function rightDirection(rotationDeg: RotationDegrees): { x: number; z: number } {
  const front = frontDirection(rotationDeg)
  return { x: front.z, z: -front.x }
}

/**
 * The vertical gate in front of all the 2D math below: only cabinets whose
 * height interval overlaps the moving one can block it, snap to it or share a
 * run with it. A wall cabinet therefore ignores the base cabinets underneath
 * it entirely — including for alignment (documented simplification).
 */
export function verticallyRelevant(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[]
): PlacedCabinet[] {
  const interval = placedVerticalInterval(moving)
  return others.filter(
    (other) =>
      other.id !== moving.id && intervalsOverlapMm(interval, placedVerticalInterval(other))
  )
}

/**
 * Signed shift along the wall's own axis that puts the cabinet's near face
 * flush against that wall's inner face.
 */
export function wallFlushDelta(wall: WallSegment, rect: FloorRect): number {
  if (wall.axis === 'x') {
    return wall.interiorSign === 1 ? wall.faceMm - rect.minX : wall.faceMm - rect.maxX
  }
  return wall.interiorSign === 1 ? wall.faceMm - rect.minZ : wall.faceMm - rect.maxZ
}

/**
 * Does the cabinet sit across the wall segment, along the segment's own
 * length? Same tolerance as the cabinet snap — and the reason a polygon room
 * needs no new code: a segment only attracts cabinets standing in front of it.
 */
export function wallSpanOverlaps(wall: WallSegment, rect: FloorRect): boolean {
  const min = wall.axis === 'x' ? rect.minZ : rect.minX
  const max = wall.axis === 'x' ? rect.maxZ : rect.maxX
  return Math.min(max, wall.toMm) - Math.max(min, wall.fromMm) > -SNAP_DISTANCE_MM
}

/**
 * The rotation that puts the cabinet's BACK against this wall: its front then
 * points along the wall's interior normal, into the room.
 */
export function rotationFacingAwayFrom(wall: WallSegment): RotationDegrees {
  const normal = wallInteriorNormal(wall)
  if (normal.z === 1) {
    return 0
  }
  if (normal.x === 1) {
    return 90
  }
  if (normal.z === -1) {
    return 180
  }
  return 270
}

/**
 * Edge snapping while dragging: when one of the moving cabinet's sides comes
 * within SNAP_DISTANCE_MM of another cabinet's side (and they roughly face
 * each other on the perpendicular axis), shift flush edge-to-edge. A side
 * snap against a parallel (same-rotation) neighbor also aligns the front
 * faces when they are within snapping distance. The smallest total
 * displacement wins. `others` must not contain the moving cabinet itself.
 */
export function resolveSnap(moving: PlacedCabinet, others: readonly PlacedCabinet[]): SnapResult {
  const movingRect = placedCabinetRect(moving)
  let best: { dx: number; dz: number } | null = null
  let bestDistSq = Infinity

  const consider = (dx: number, dz: number): void => {
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      best = { dx, dz }
    }
  }

  for (const other of verticallyRelevant(moving, others)) {
    const otherRect = placedCabinetRect(other)
    const overlapX =
      Math.min(movingRect.maxX, otherRect.maxX) - Math.max(movingRect.minX, otherRect.minX)
    const overlapZ =
      Math.min(movingRect.maxZ, otherRect.maxZ) - Math.max(movingRect.minZ, otherRect.minZ)
    const parallel = moving.rotationDeg === other.rotationDeg

    // Side-to-side snap along X (needs rough overlap on Z).
    if (overlapZ > -SNAP_DISTANCE_MM) {
      for (const dx of [otherRect.minX - movingRect.maxX, otherRect.maxX - movingRect.minX]) {
        if (Math.abs(dx) <= SNAP_DISTANCE_MM) {
          let dz = 0
          if (parallel && facesAlongZ(moving.rotationDeg)) {
            const alignDz =
              moving.rotationDeg === 0
                ? otherRect.maxZ - movingRect.maxZ
                : otherRect.minZ - movingRect.minZ
            if (Math.abs(alignDz) <= SNAP_DISTANCE_MM) {
              dz = alignDz
            }
          }
          consider(dx, dz)
        }
      }
    }

    // Front-to-back snap along Z (needs rough overlap on X).
    if (overlapX > -SNAP_DISTANCE_MM) {
      for (const dz of [otherRect.minZ - movingRect.maxZ, otherRect.maxZ - movingRect.minZ]) {
        if (Math.abs(dz) <= SNAP_DISTANCE_MM) {
          let dx = 0
          if (parallel && !facesAlongZ(moving.rotationDeg)) {
            const alignDx =
              moving.rotationDeg === 90
                ? otherRect.maxX - movingRect.maxX
                : otherRect.minX - movingRect.minX
            if (Math.abs(alignDx) <= SNAP_DISTANCE_MM) {
              dx = alignDx
            }
          }
          consider(dx, dz)
        }
      }
    }
  }

  if (best === null) {
    return { positionX: moving.positionX, positionZ: moving.positionZ, snapped: false }
  }
  const chosen: { dx: number; dz: number } = best
  return {
    positionX: moving.positionX + chosen.dx,
    positionZ: moving.positionZ + chosen.dz,
    snapped: true
  }
}

/** A pose offered to the snap competition: a shift plus the rotation it assumes. */
interface PoseOption {
  readonly dx: number
  readonly dz: number
  readonly rotationDeg: RotationDegrees
}

/**
 * How good a resulting pose is, compared field by field in this order:
 *
 * 1. `sideWalls` — how many walls it meets with a side instead of its back.
 *    Fewer is better: "back to the wall" is what a kitchen looks like, so a
 *    pose that turns to face the room beats one that merely touches.
 * 2. `contacts` — how many walls and neighbours it ends up flush with. More is
 *    better, so landing in a corner beats landing along one wall, and going
 *    flush against a wall AND a neighbour beats either alone.
 * 3. `distanceSq` — how far the cabinet had to move. Smaller is better: this
 *    is the rule that decides between a wall and a neighbour competing for the
 *    same spot.
 * 4. `rotating` — a turn only happens when it earned its place above.
 */
interface PoseScore {
  readonly sideWalls: number
  readonly contacts: number
  readonly distanceSq: number
  readonly rotating: boolean
}

function isBetterPose(candidate: PoseScore, incumbent: PoseScore | null): boolean {
  if (incumbent === null) {
    return true
  }
  if (candidate.sideWalls !== incumbent.sideWalls) {
    return candidate.sideWalls < incumbent.sideWalls
  }
  if (candidate.contacts !== incumbent.contacts) {
    return candidate.contacts > incumbent.contacts
  }
  if (candidate.distanceSq !== incumbent.distanceSq) {
    return candidate.distanceSq < incumbent.distanceSq
  }
  return incumbent.rotating && !candidate.rotating
}

/** Two footprints standing side by side with no gap worth mentioning. */
function rectsAreFlush(a: FloorRect, b: FloorRect): boolean {
  const gapX = Math.max(b.minX - a.maxX, a.minX - b.maxX)
  const gapZ = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ)
  const overlapX = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
  const overlapZ = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ)
  return (
    (Math.abs(gapX) <= FLUSH_TOLERANCE_MM && overlapZ > FLUSH_TOLERANCE_MM) ||
    (Math.abs(gapZ) <= FLUSH_TOLERANCE_MM && overlapX > FLUSH_TOLERANCE_MM)
  )
}

/**
 * The one snap competition. For each rotation on offer it collects the
 * candidate shifts per axis — flush to a wall, flush to a neighbour (via the
 * unchanged `resolveSnap`), or back inside the room — and offers every
 * combination of them. Smallest total displacement wins, and only FREE
 * candidates (overlap-free and inside the room) may win at all, so a drag
 * never sticks to a blocked snap while a slightly farther legal one exists.
 *
 * Corners come out of the (wall-X, wall-Z) combination, and "against the wall,
 * beside a neighbour" out of (cabinet-X, wall-Z) — no special cases.
 */
function bestFreePose(
  moving: PlacedCabinet,
  relevant: readonly PlacedCabinet[],
  room: RoomDesign,
  rotations: readonly RotationDegrees[]
): PoseOption | null {
  const walls = roomWallSegments(room)
  let best: PoseOption | null = null
  let bestScore: PoseScore | null = null

  const consider = (dx: number, dz: number, rotationDeg: RotationDegrees): void => {
    const rotating = rotationDeg !== moving.rotationDeg
    if (dx === 0 && dz === 0 && !rotating) {
      return // the attempted pose itself is not a snap
    }
    const candidate: PlacedCabinet = {
      ...moving,
      positionX: moving.positionX + dx,
      positionZ: moving.positionZ + dz,
      rotationDeg
    }
    const rect = placedCabinetRect(candidate)
    // Only FREE candidates may win, so a drag never sticks to a blocked snap
    // while a slightly farther legal one exists.
    if (!roomContainsRect(room, rect) || cabinetOverlapsOthers(candidate, relevant)) {
      return
    }

    // Score the RESULTING pose, not the option that produced it: whether the
    // cabinet ends up backed onto a wall is a fact about where it stands.
    let sideWalls = 0
    let contacts = 0
    for (const wall of walls) {
      if (
        !wallSpanOverlaps(wall, rect) ||
        Math.abs(wallFlushDelta(wall, rect)) > FLUSH_TOLERANCE_MM
      ) {
        continue
      }
      contacts += 1
      if (rotationDeg !== rotationFacingAwayFrom(wall)) {
        sideWalls += 1
      }
    }
    for (const other of relevant) {
      if (rectsAreFlush(rect, placedCabinetRect(other))) {
        contacts += 1
      }
    }

    const score: PoseScore = { sideWalls, contacts, distanceSq: dx * dx + dz * dz, rotating }
    if (isBetterPose(score, bestScore)) {
      bestScore = score
      best = { dx, dz, rotationDeg }
    }
  }

  for (const rotationDeg of rotations) {
    const size = rotatedFootprintSize(cabinetFootprintSize(moving.design), rotationDeg)
    // Staying inside the room comes first: a cabinet pushed past a wall glides
    // along it instead of freezing, and every snap below starts from there.
    const base = clampCenterIntoRoom(room, moving, size)
    const baseDx = base.positionX - moving.positionX
    const baseDz = base.positionZ - moving.positionZ
    const rotated: PlacedCabinet = {
      ...moving,
      positionX: base.positionX,
      positionZ: base.positionZ,
      rotationDeg
    }
    const rect = placedCabinetRect(rotated)

    // Nearest flush shift towards a wall, independently per axis — this is
    // what makes a corner just the combination of two of them.
    let wallDx: number | null = null
    let wallDz: number | null = null
    for (const wall of walls) {
      if (!wallSpanOverlaps(wall, rect)) {
        continue
      }
      const delta = wallFlushDelta(wall, rect)
      if (Math.abs(delta) > SNAP_DISTANCE_MM) {
        continue
      }
      if (wall.axis === 'x') {
        wallDx = wallDx === null || Math.abs(delta) < Math.abs(wallDx) ? delta : wallDx
      } else {
        wallDz = wallDz === null || Math.abs(delta) < Math.abs(wallDz) ? delta : wallDz
      }
    }

    // The neighbour snap stays ATOMIC: its side flush and its front alignment
    // are one solution, and offering the alignment on its own would let a 5 mm
    // nudge outrank the 20 mm flush it belongs to.
    const neighbour = resolveSnap(rotated, relevant)
    const cabDx = neighbour.snapped ? neighbour.positionX - base.positionX : null
    const cabDz = neighbour.snapped ? neighbour.positionZ - base.positionZ : null

    const options: (readonly [number, number])[] = []
    // Staying inside the room, with no snap on top, is only an option at the
    // rotation the cabinet already has — turning is never a no-op.
    if (rotationDeg === moving.rotationDeg) {
      options.push([0, 0])
    }
    if (cabDx !== null && cabDz !== null) {
      options.push([cabDx, cabDz])
    }
    if (wallDx !== null) {
      options.push([wallDx, 0])
    }
    if (wallDz !== null) {
      options.push([0, wallDz])
    }
    if (wallDx !== null && wallDz !== null) {
      options.push([wallDx, wallDz]) // the corner
    }
    // One axis from a wall, the other from a neighbour.
    if (wallDx !== null && cabDz !== null) {
      options.push([wallDx, cabDz])
    }
    if (cabDx !== null && wallDz !== null) {
      options.push([cabDx, wallDz])
    }

    for (const [dx, dz] of options) {
      consider(baseDx + dx, baseDz + dz, rotationDeg)
    }
  }

  return best
}

/**
 * Rotations worth offering: the current one, plus any wall the back could go
 * against. Proximity is measured from the position clamped into the room for
 * that rotation — a pointer dragged well past a wall is still "at" it.
 */
function candidateRotations(moving: PlacedCabinet, room: RoomDesign): RotationDegrees[] {
  const rotations: RotationDegrees[] = [moving.rotationDeg]
  for (const wall of roomWallSegments(room)) {
    const rotationDeg = rotationFacingAwayFrom(wall)
    if (rotations.includes(rotationDeg)) {
      continue
    }
    const size = rotatedFootprintSize(cabinetFootprintSize(moving.design), rotationDeg)
    const base = clampCenterIntoRoom(room, moving, size)
    const rect = placedCabinetRect({ ...moving, ...base, rotationDeg })
    if (wallSpanOverlaps(wall, rect) && Math.abs(wallFlushDelta(wall, rect)) <= SNAP_DISTANCE_MM) {
      rotations.push(rotationDeg)
    }
  }
  return rotations
}

/**
 * Position-only snapping against neighbours AND walls at the cabinet's current
 * rotation. Used by every programmatic placement, which must never rotate.
 */
export function resolveSnapInRoom(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[],
  room: RoomDesign
): SnapResult {
  const pose = bestFreePose(moving, verticallyRelevant(moving, others), room, [moving.rotationDeg])
  if (pose === null) {
    return { positionX: moving.positionX, positionZ: moving.positionZ, snapped: false }
  }
  return {
    positionX: moving.positionX + pose.dx,
    positionZ: moving.positionZ + pose.dz,
    snapped: true
  }
}

export interface DragPose extends FloorPosition {
  readonly rotationDeg: RotationDegrees
  readonly snapped: boolean
}

/**
 * The live-drag pose: like `resolveSnapInRoom`, but a wall may also turn the
 * cabinet so its back goes against that wall — the one place in the codebase
 * where snapping changes rotation, and only while the user is dragging.
 */
export function resolveDragPose(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[],
  room: RoomDesign
): DragPose {
  const pose = bestFreePose(
    moving,
    verticallyRelevant(moving, others),
    room,
    candidateRotations(moving, room)
  )
  if (pose === null) {
    return {
      positionX: moving.positionX,
      positionZ: moving.positionZ,
      rotationDeg: moving.rotationDeg,
      snapped: false
    }
  }
  return {
    positionX: moving.positionX + pose.dx,
    positionZ: moving.positionZ + pose.dz,
    rotationDeg: pose.rotationDeg,
    snapped: true
  }
}

/**
 * Resolves a drop/programmatic placement to the nearest FREE position, where
 * free means overlap-free AND inside the room: the attempted position is first
 * pulled into the room, then snapped; failing that, the nearest free flush
 * position along a neighbor's sides (with a final resolveSnap pass so
 * near-aligned fronts click into line), then flush to the right of everything
 * at this height. Returns null when the room holds no free spot at all — the
 * caller then rejects the whole update rather than break the invariant.
 *
 * Position only: a programmatic placement never changes rotation (see
 * resolveDragPose for the live drag). `others` must not contain the moving
 * cabinet itself.
 */
export function resolveNonOverlapping(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[],
  room: RoomDesign
): FloorPosition | null {
  const at = (position: FloorPosition): PlacedCabinet => ({
    ...moving,
    positionX: position.positionX,
    positionZ: position.positionZ
  })

  // Everything below sees only the cabinets at the moving cabinet's own
  // height; the rest cannot collide with it, so they must not push it around.
  const relevant = verticallyRelevant(moving, others)

  const size = rotatedFootprintSize(cabinetFootprintSize(moving.design), moving.rotationDeg)
  const halfW = size.widthMm / 2
  const halfD = size.depthMm / 2

  const free = (position: FloorPosition): boolean =>
    roomContainsRect(room, placedCabinetRect(at(position))) &&
    !cabinetOverlapsOthers(at(position), relevant)

  // The attempt itself can never leave the room; everything downstream
  // measures its distance from there.
  const attempted = clampCenterIntoRoom(room, moving, size)

  const snapped = resolveSnapInRoom(at(attempted), relevant, room)
  if (free(snapped)) {
    return { positionX: snapped.positionX, positionZ: snapped.positionZ }
  }
  if (free(attempted)) {
    return attempted
  }

  const candidates: FloorPosition[] = []
  const addCandidate = (position: FloorPosition): void => {
    candidates.push(clampCenterIntoRoom(room, position, size))
  }

  for (const other of relevant) {
    const rect = placedCabinetRect(other)
    const parallel = other.rotationDeg === moving.rotationDeg

    // Flush left/right of the neighbor.
    for (const x of [rect.minX - halfW, rect.maxX + halfW]) {
      addCandidate({ positionX: x, positionZ: attempted.positionZ })
      if (parallel && facesAlongZ(moving.rotationDeg)) {
        const z = moving.rotationDeg === 0 ? rect.maxZ - halfD : rect.minZ + halfD
        addCandidate({ positionX: x, positionZ: z })
      }
    }
    // Flush behind/in front of the neighbor.
    for (const z of [rect.minZ - halfD, rect.maxZ + halfD]) {
      addCandidate({ positionX: attempted.positionX, positionZ: z })
      if (parallel && !facesAlongZ(moving.rotationDeg)) {
        const x = moving.rotationDeg === 90 ? rect.maxX - halfW : rect.minX + halfW
        addCandidate({ positionX: x, positionZ: z })
      }
    }
  }

  // Flush against each wall, and in each corner: a cabinet pushed off its spot
  // should end up along a wall rather than adrift in the middle of the room.
  const interior = roomInteriorRect(room)
  const wallX = [interior.minX + halfW, interior.maxX - halfW]
  const wallZ = [interior.minZ + halfD, interior.maxZ - halfD]
  for (const x of wallX) {
    addCandidate({ positionX: x, positionZ: attempted.positionZ })
    for (const z of wallZ) {
      addCandidate({ positionX: x, positionZ: z })
    }
  }
  for (const z of wallZ) {
    addCandidate({ positionX: attempted.positionX, positionZ: z })
  }

  // Flush to the right of everything at this height, still inside the room.
  const bounds = unionRect(relevant.map(placedCabinetRect))
  if (bounds !== null) {
    addCandidate({ positionX: bounds.maxX + halfW, positionZ: attempted.positionZ })
  }

  let bestCandidate: FloorPosition | null = null
  let bestDistSq = Infinity
  for (const candidate of candidates) {
    if (!free(candidate)) {
      continue
    }
    const dx = candidate.positionX - attempted.positionX
    const dz = candidate.positionZ - attempted.positionZ
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestCandidate = candidate
    }
  }
  if (bestCandidate === null) {
    return null
  }
  // Let near-aligned fronts and walls click into line, never at the cost of freeness.
  const refined = resolveSnapInRoom(at(bestCandidate), relevant, room)
  return free(refined) ? { positionX: refined.positionX, positionZ: refined.positionZ } : bestCandidate
}

/**
 * The single gate through which the state layer mutates placements: inserts
 * or replaces `updated` in the scene with its position resolved to a free
 * spot, so scene state can never contain overlapping cabinets. Returns
 * `null` when the room holds no free spot — the whole update is refused
 * rather than a cabinet left overlapping or outside — so the caller can
 * tell a refusal from an update that resolved to where it already was.
 */
export function tryPlaceWithoutOverlap(scene: SceneDesign, updated: PlacedCabinet): SceneDesign | null {
  const others = scene.cabinets.filter((cabinet) => cabinet.id !== updated.id)
  const resolved = resolveNonOverlapping(updated, others, scene.room)
  if (resolved === null) {
    return null
  }
  const placed: PlacedCabinet = {
    ...updated,
    positionX: resolved.positionX,
    positionZ: resolved.positionZ
  }
  const exists = scene.cabinets.some((cabinet) => cabinet.id === updated.id)
  return {
    ...scene,
    cabinets: exists
      ? scene.cabinets.map((cabinet) => (cabinet.id === updated.id ? placed : cabinet))
      : [...scene.cabinets, placed]
  }
}

/** `tryPlaceWithoutOverlap`, with a refusal handing the scene back unchanged (the same reference). */
export function placeWithoutOverlap(scene: SceneDesign, updated: PlacedCabinet): SceneDesign {
  return tryPlaceWithoutOverlap(scene, updated) ?? scene
}

export interface SpawnPlacement extends FloorPosition {
  readonly rotationDeg: RotationDegrees
}

/**
 * Where a newly added cabinet spawns: flush against the right side of the
 * last cabinet in the scene, same rotation, fronts aligned. The first cabinet
 * in an empty room goes back-to-the-wall, centred on the back wall, which is
 * where a kitchen starts. Feed the result through placeWithoutOverlap for
 * safety — it is what keeps the spawn inside the room.
 */
export function spawnPlacement(scene: SceneDesign, design: CabinetDesign): SpawnPlacement {
  const last = scene.cabinets[scene.cabinets.length - 1]
  if (last === undefined) {
    // Rotation 0 faces +Z, so its back is against the room's back wall.
    const interior = roomInteriorRect(scene.room)
    const size = cabinetFootprintSize(design)
    return { positionX: 0, positionZ: interior.minZ + size.depthMm / 2, rotationDeg: 0 }
  }
  const rotationDeg = last.rotationDeg
  const right = rightDirection(rotationDeg)
  const lastSize = rotatedFootprintSize(cabinetFootprintSize(last.design), rotationDeg)
  const newSize = rotatedFootprintSize(cabinetFootprintSize(design), rotationDeg)
  const lastExtent = right.x !== 0 ? lastSize.widthMm : lastSize.depthMm
  const newExtent = right.x !== 0 ? newSize.widthMm : newSize.depthMm
  const shift = (lastExtent + newExtent) / 2
  let positionX = last.positionX + right.x * shift
  let positionZ = last.positionZ + right.z * shift

  // Align fronts (differing depths shift the center along the front normal).
  const front = frontDirection(rotationDeg)
  const spawned: PlacedCabinet = { ...last, design, positionX, positionZ }
  const frontDelta = frontFaceCoordinate(last) - frontFaceCoordinate(spawned)
  positionX += front.x * frontDelta
  positionZ += front.z * frontDelta

  return { positionX, positionZ, rotationDeg }
}

export interface ConnectedRun {
  readonly memberIds: readonly string[]
  readonly totalWidthMm: number
  readonly runRect: FloorRect
  /** World axis the run grows along ('x' for rotations 0/180, 'z' for 90/270). */
  readonly axis: 'x' | 'z'
  readonly rotationDeg: RotationDegrees
  /** Lowest bottom edge among the members: where the measure line hangs. */
  readonly bottomMm: number
}

function runAxisOf(rotationDeg: RotationDegrees): ConnectedRun['axis'] {
  return facesAlongZ(rotationDeg) ? 'x' : 'z'
}

/** The members of the run `start` belongs to (`start` included), in scene order. */
function runMembers(scene: SceneDesign, start: PlacedCabinet): PlacedCabinet[] {
  const rotationDeg = start.rotationDeg
  const axis = runAxisOf(rotationDeg)
  const startFront = frontFaceCoordinate(start)
  const startInterval = placedVerticalInterval(start)

  const candidates = scene.cabinets.filter(
    (cabinet) =>
      cabinet.rotationDeg === rotationDeg &&
      Math.abs(frontFaceCoordinate(cabinet) - startFront) <= FLUSH_TOLERANCE_MM &&
      (cabinet.id === start.id ||
        intervalsOverlapMm(startInterval, placedVerticalInterval(cabinet)))
  )
  const rects = new Map(candidates.map((cabinet) => [cabinet.id, placedCabinetRect(cabinet)]))

  const flushBeside = (a: string, b: string): boolean => {
    const rectA = rects.get(a)
    const rectB = rects.get(b)
    if (rectA === undefined || rectB === undefined) {
      return false
    }
    const gap =
      axis === 'x'
        ? Math.max(rectB.minX - rectA.maxX, rectA.minX - rectB.maxX)
        : Math.max(rectB.minZ - rectA.maxZ, rectA.minZ - rectB.maxZ)
    return Math.abs(gap) <= FLUSH_TOLERANCE_MM
  }

  const members = new Set<string>([start.id])
  const queue = [start.id]
  while (queue.length > 0) {
    const current = queue.pop()
    if (current === undefined) {
      break
    }
    for (const candidate of candidates) {
      if (!members.has(candidate.id) && flushBeside(current, candidate.id)) {
        members.add(candidate.id)
        queue.push(candidate.id)
      }
    }
  }
  return candidates.filter((cabinet) => members.has(cabinet.id))
}

/** The run record for a set of members already known to be flush; null for none. */
function assembleRun(
  members: readonly PlacedCabinet[],
  rotationDeg: RotationDegrees
): ConnectedRun | null {
  const axis = runAxisOf(rotationDeg)
  const runRect = unionRect(members.map((cabinet) => placedCabinetRect(cabinet)))
  if (runRect === null) {
    return null
  }
  const sorted = [...members].sort((a, b) =>
    axis === 'x' ? a.positionX - b.positionX : a.positionZ - b.positionZ
  )
  return {
    memberIds: sorted.map((cabinet) => cabinet.id),
    totalWidthMm: axis === 'x' ? runRect.maxX - runRect.minX : runRect.maxZ - runRect.minZ,
    runRect,
    axis,
    rotationDeg,
    bottomMm: Math.min(...members.map((cabinet) => placedVerticalInterval(cabinet).bottomMm))
  }
}

/**
 * The connected run the cabinet belongs to: the chain of same-rotation
 * cabinets standing flush side-to-side with fronts aligned (within
 * FLUSH_TOLERANCE_MM) at an overlapping height. Used for the total-width
 * measure line, so wall cabinets measure among themselves while a base and a
 * tall cabinet standing flush do form one mixed run.
 */
export function connectedRun(scene: SceneDesign, cabinetId: string): ConnectedRun | null {
  const start = findPlacedCabinet(scene, cabinetId)
  if (start === undefined) {
    return null
  }
  return assembleRun(runMembers(scene, start), start.rotationDeg)
}

/**
 * Every cabinet in exactly one run: `connectedRun` repeated over the
 * cabinets not yet assigned, in scene order, so the runs come out in the
 * order of their first member. Among cabinets standing at one floor level
 * (all the worktop ever passes in) the run relation is an equivalence and
 * this is a true partition; with mixed elevations a member an earlier run
 * already claimed stays there and the later run is assembled from the rest.
 */
export function connectedRuns(scene: SceneDesign): readonly ConnectedRun[] {
  const assigned = new Set<string>()
  const runs: ConnectedRun[] = []
  for (const cabinet of scene.cabinets) {
    if (assigned.has(cabinet.id)) {
      continue
    }
    const members = runMembers(scene, cabinet).filter((member) => !assigned.has(member.id))
    for (const member of members) {
      assigned.add(member.id)
    }
    const run = assembleRun(members, cabinet.rotationDeg)
    if (run !== null) {
      runs.push(run)
    }
  }
  return runs
}
