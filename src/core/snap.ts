import {
  cabinetFootprintSize,
  cabinetOverlapsOthers,
  frontDirection,
  frontFaceCoordinate,
  placedCabinetRect,
  rotatedFootprintSize,
  sceneBoundingRect,
  unionRect,
  type FloorRect
} from './footprint'
import type { CabinetDesign } from './cabinet'
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

export interface FloorPosition {
  readonly positionX: number
  readonly positionZ: number
}

function facesAlongZ(rotationDeg: RotationDegrees): boolean {
  return rotationDeg === 0 || rotationDeg === 180
}

/** Unit vector towards the cabinet's own right-hand side (seen from above). */
function rightDirection(rotationDeg: RotationDegrees): { x: number; z: number } {
  const front = frontDirection(rotationDeg)
  return { x: front.z, z: -front.x }
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

  for (const other of others) {
    if (other.id === moving.id) {
      continue
    }
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
 * Resolves a drop/programmatic placement to the nearest free position:
 * the (snapped) attempted position when it is overlap-free, otherwise the
 * nearest non-overlapping flush position along a neighbor's sides (with a
 * final resolveSnap pass so near-aligned fronts click into line), with a
 * deterministic fallback flush to the right of the whole scene.
 * `others` must not contain the moving cabinet itself.
 */
export function resolveNonOverlapping(
  moving: PlacedCabinet,
  others: readonly PlacedCabinet[]
): FloorPosition {
  const at = (position: FloorPosition): PlacedCabinet => ({
    ...moving,
    positionX: position.positionX,
    positionZ: position.positionZ
  })

  const snapped = resolveSnap(moving, others)
  if (!cabinetOverlapsOthers(at(snapped), others)) {
    return { positionX: snapped.positionX, positionZ: snapped.positionZ }
  }
  if (!cabinetOverlapsOthers(moving, others)) {
    return { positionX: moving.positionX, positionZ: moving.positionZ }
  }

  const size = rotatedFootprintSize(cabinetFootprintSize(moving.design), moving.rotationDeg)
  const halfW = size.widthMm / 2
  const halfD = size.depthMm / 2
  const candidates: FloorPosition[] = []

  for (const other of others) {
    if (other.id === moving.id) {
      continue
    }
    const rect = placedCabinetRect(other)
    const parallel = other.rotationDeg === moving.rotationDeg

    // Flush left/right of the neighbor.
    for (const x of [rect.minX - halfW, rect.maxX + halfW]) {
      candidates.push({ positionX: x, positionZ: moving.positionZ })
      if (parallel && facesAlongZ(moving.rotationDeg)) {
        const z = moving.rotationDeg === 0 ? rect.maxZ - halfD : rect.minZ + halfD
        candidates.push({ positionX: x, positionZ: z })
      }
    }
    // Flush behind/in front of the neighbor.
    for (const z of [rect.minZ - halfD, rect.maxZ + halfD]) {
      candidates.push({ positionX: moving.positionX, positionZ: z })
      if (parallel && !facesAlongZ(moving.rotationDeg)) {
        const x = moving.rotationDeg === 90 ? rect.maxX - halfW : rect.minX + halfW
        candidates.push({ positionX: x, positionZ: z })
      }
    }
  }

  let bestCandidate: FloorPosition | null = null
  let bestDistSq = Infinity
  for (const candidate of candidates) {
    if (cabinetOverlapsOthers(at(candidate), others)) {
      continue
    }
    const dx = candidate.positionX - moving.positionX
    const dz = candidate.positionZ - moving.positionZ
    const distSq = dx * dx + dz * dz
    if (distSq < bestDistSq) {
      bestDistSq = distSq
      bestCandidate = candidate
    }
  }
  if (bestCandidate !== null) {
    // Let near-aligned fronts click into line, but never at the cost of an overlap.
    const refined = resolveSnap(at(bestCandidate), others)
    if (!cabinetOverlapsOthers(at(refined), others)) {
      return { positionX: refined.positionX, positionZ: refined.positionZ }
    }
    return bestCandidate
  }

  // Deterministic fallback: flush to the right of everything else.
  const bounds = sceneBoundingRect({ cabinets: [...others] })
  if (bounds === null) {
    return { positionX: moving.positionX, positionZ: moving.positionZ }
  }
  return { positionX: bounds.maxX + halfW, positionZ: moving.positionZ }
}

/**
 * The single gate through which the state layer mutates placements: inserts
 * or replaces `updated` in the scene with its position resolved to a free
 * spot, so scene state can never contain overlapping cabinets.
 */
export function placeWithoutOverlap(scene: SceneDesign, updated: PlacedCabinet): SceneDesign {
  const others = scene.cabinets.filter((cabinet) => cabinet.id !== updated.id)
  const resolved = resolveNonOverlapping(updated, others)
  const placed: PlacedCabinet = {
    ...updated,
    positionX: resolved.positionX,
    positionZ: resolved.positionZ
  }
  const exists = scene.cabinets.some((cabinet) => cabinet.id === updated.id)
  return {
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
 * last cabinet in the scene, same rotation, fronts aligned (the origin for an
 * empty scene). Feed the result through placeWithoutOverlap for safety.
 */
export function spawnPlacement(scene: SceneDesign, design: CabinetDesign): SpawnPlacement {
  const last = scene.cabinets[scene.cabinets.length - 1]
  if (last === undefined) {
    return { positionX: 0, positionZ: 0, rotationDeg: 0 }
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
}

/**
 * The connected run the cabinet belongs to: the chain of same-rotation
 * cabinets standing flush side-to-side with fronts aligned (within
 * FLUSH_TOLERANCE_MM). Used for the total-width measure line.
 */
export function connectedRun(scene: SceneDesign, cabinetId: string): ConnectedRun | null {
  const start = findPlacedCabinet(scene, cabinetId)
  if (start === undefined) {
    return null
  }
  const rotationDeg = start.rotationDeg
  const axis: 'x' | 'z' = facesAlongZ(rotationDeg) ? 'x' : 'z'
  const startFront = frontFaceCoordinate(start)

  const candidates = scene.cabinets.filter(
    (cabinet) =>
      cabinet.rotationDeg === rotationDeg &&
      Math.abs(frontFaceCoordinate(cabinet) - startFront) <= FLUSH_TOLERANCE_MM
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
    rotationDeg
  }
}
