import { clampToLimit, limitViolations } from './cabinet'
import { OVERLAP_EPSILON_MM, type FloorPosition, type FloorRect, type FootprintSize } from './footprint'

/**
 * The room the scene stands in. Dimensions are INTERIOR measurements — what a
 * tape measure gives inside the room — so the domain only ever deals with
 * inner wall faces. Wall thickness exists solely in the renderer.
 *
 * The room is centred on the world origin: x spans ±widthMm/2, z spans
 * ±lengthMm/2. Every scene has one; there is no roomless mode.
 */
export interface RoomDesign {
  /** Interior size along X. */
  readonly widthMm: number
  /** Interior size along Z. */
  readonly lengthMm: number
  readonly wallHeightMm: number
}

// Provisional until the company's real list arrives.
export const ROOM_LIMITS = {
  widthMm: { min: 2000, max: 10000 },
  lengthMm: { min: 2000, max: 10000 },
  wallHeightMm: { min: 2200, max: 3200 }
} as const

export function createDefaultRoom(): RoomDesign {
  return { widthMm: 4000, lengthMm: 3000, wallHeightMm: 2600 }
}

export function clampRoom(room: RoomDesign): RoomDesign {
  const limits = ROOM_LIMITS
  return {
    widthMm: clampToLimit(room.widthMm, limits.widthMm),
    lengthMm: clampToLimit(room.lengthMm, limits.lengthMm),
    wallHeightMm: clampToLimit(room.wallHeightMm, limits.wallHeightMm)
  }
}

export function validateRoom(room: RoomDesign): string[] {
  const limits = ROOM_LIMITS
  return limitViolations([
    ['widthMm', room.widthMm, limits.widthMm],
    ['lengthMm', room.lengthMm, limits.lengthMm],
    ['wallHeightMm', room.wallHeightMm, limits.wallHeightMm]
  ])
}

/** The floor area enclosed by the inner wall faces. */
export function roomInteriorRect(room: RoomDesign): FloorRect {
  return {
    minX: -room.widthMm / 2,
    maxX: room.widthMm / 2,
    minZ: -room.lengthMm / 2,
    maxZ: room.lengthMm / 2
  }
}

export type WallId = 'back' | 'front' | 'left' | 'right'

/**
 * One straight inner wall face. A rectangular room yields four of these; an
 * orthogonal-polygon room would yield more, and nothing downstream may assume
 * the count or that the segments form a rectangle — snapping iterates the
 * list. This is the seam L-shaped rooms will arrive through.
 */
export interface WallSegment {
  readonly id: WallId
  /** Axis the inner face is perpendicular to. */
  readonly axis: 'x' | 'z'
  /** World coordinate of the inner face along `axis`. */
  readonly faceMm: number
  /** The interior lies towards +1 / −1 along `axis`. */
  readonly interiorSign: 1 | -1
  /** Extent of the segment along the other axis. */
  readonly fromMm: number
  readonly toMm: number
}

export function roomWallSegments(room: RoomDesign): readonly WallSegment[] {
  const rect = roomInteriorRect(room)
  return [
    { id: 'back', axis: 'z', faceMm: rect.minZ, interiorSign: 1, fromMm: rect.minX, toMm: rect.maxX },
    { id: 'front', axis: 'z', faceMm: rect.maxZ, interiorSign: -1, fromMm: rect.minX, toMm: rect.maxX },
    { id: 'left', axis: 'x', faceMm: rect.minX, interiorSign: 1, fromMm: rect.minZ, toMm: rect.maxZ },
    { id: 'right', axis: 'x', faceMm: rect.maxX, interiorSign: -1, fromMm: rect.minZ, toMm: rect.maxZ }
  ]
}

/** Unit vector pointing from the wall face into the room. */
export function wallInteriorNormal(wall: WallSegment): { readonly x: number; readonly z: number } {
  return wall.axis === 'x'
    ? { x: wall.interiorSign, z: 0 }
    : { x: 0, z: wall.interiorSign }
}

/**
 * Is the footprint inside the room? Forgiving by OVERLAP_EPSILON_MM, mirroring
 * the overlap rule: a cabinet standing flush against a wall is inside, while
 * one intruding a full millimetre is not.
 */
export function roomContainsRect(room: RoomDesign, rect: FloorRect): boolean {
  const interior = roomInteriorRect(room)
  return (
    rect.minX >= interior.minX - OVERLAP_EPSILON_MM &&
    rect.maxX <= interior.maxX + OVERLAP_EPSILON_MM &&
    rect.minZ >= interior.minZ - OVERLAP_EPSILON_MM &&
    rect.maxZ <= interior.maxZ + OVERLAP_EPSILON_MM
  )
}

function clampAxis(value: number, min: number, max: number, extentMm: number): number {
  const half = extentMm / 2
  const low = min + half
  const high = max - half
  // Wider than the room (not reachable under the current limits): centre it.
  return low > high ? (min + max) / 2 : Math.min(high, Math.max(low, value))
}

/**
 * Smallest shift of a footprint's centre that brings it fully inside the room.
 * `size` must already be the ROTATED footprint (see `rotatedFootprintSize`).
 */
export function clampCenterIntoRoom(
  room: RoomDesign,
  center: FloorPosition,
  size: FootprintSize
): FloorPosition {
  const interior = roomInteriorRect(room)
  return {
    positionX: clampAxis(center.positionX, interior.minX, interior.maxX, size.widthMm),
    positionZ: clampAxis(center.positionZ, interior.minZ, interior.maxZ, size.depthMm)
  }
}
