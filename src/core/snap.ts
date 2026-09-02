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
  type RoomDesign
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

  const snapped = resolveSnap(at(attempted), relevant)
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
  // Let near-aligned fronts click into line, but never at the cost of freeness.
  const refined = resolveSnap(at(bestCandidate), relevant)
  return free(refined) ? { positionX: refined.positionX, positionZ: refined.positionZ } : bestCandidate
}

/**
 * The single gate through which the state layer mutates placements: inserts
 * or replaces `updated` in the scene with its position resolved to a free
 * spot, so scene state can never contain overlapping cabinets.
 */
export function placeWithoutOverlap(scene: SceneDesign, updated: PlacedCabinet): SceneDesign {
  const others = scene.cabinets.filter((cabinet) => cabinet.id !== updated.id)
  const resolved = resolveNonOverlapping(updated, others, scene.room)
  if (resolved === null) {
    // The room holds no free spot: reject the whole update rather than leave a
    // cabinet overlapping or outside. Silent for now — see CLAUDE.md.
    return scene
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
  const rotationDeg = start.rotationDeg
  const axis: 'x' | 'z' = facesAlongZ(rotationDeg) ? 'x' : 'z'
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

  const memberCabinets = candidates.filter((cabinet) => members.has(cabinet.id))
  const runRect = unionRect(memberCabinets.map((cabinet) => placedCabinetRect(cabinet)))
  if (runRect === null) {
    return null
  }
  const sorted = [...memberCabinets].sort((a, b) =>
    axis === 'x' ? a.positionX - b.positionX : a.positionZ - b.positionZ
  )
  return {
    memberIds: sorted.map((cabinet) => cabinet.id),
    totalWidthMm: axis === 'x' ? runRect.maxX - runRect.minX : runRect.maxZ - runRect.minZ,
    runRect,
    axis,
    rotationDeg,
    bottomMm: Math.min(...memberCabinets.map((cabinet) => placedVerticalInterval(cabinet).bottomMm))
  }
}
