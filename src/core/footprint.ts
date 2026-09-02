import type { CabinetDesign } from './cabinet'
import {
  designFootprintSize,
  designVerticalExtent,
  type VerticalExtentMm
} from './catalog/registry'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from './scene'

export interface FootprintSize {
  readonly widthMm: number
  readonly depthMm: number
}

/** Axis-aligned rectangle on the floor plane, world mm. */
export interface FloorRect {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

/** The center of a footprint on the floor plane, world mm. */
export interface FloorPosition {
  readonly positionX: number
  readonly positionZ: number
}

/**
 * Carcass footprint only. Overlay doors protrude ~18 mm in front of the
 * carcass and are excluded from overlap/snap on purpose: side-by-side
 * cabinets meet at their carcass sides, and "fronts aligned" means carcass
 * front faces flush (door fronts then align automatically in a run).
 */
export function cabinetFootprintSize(design: CabinetDesign): FootprintSize {
  return designFootprintSize(design)
}

export function rotatedFootprintSize(size: FootprintSize, rotationDeg: RotationDegrees): FootprintSize {
  return rotationDeg === 90 || rotationDeg === 270
    ? { widthMm: size.depthMm, depthMm: size.widthMm }
    : size
}

export function placedCabinetRect(placed: PlacedCabinet): FloorRect {
  const { widthMm, depthMm } = rotatedFootprintSize(
    cabinetFootprintSize(placed.design),
    placed.rotationDeg
  )
  return {
    minX: placed.positionX - widthMm / 2,
    maxX: placed.positionX + widthMm / 2,
    minZ: placed.positionZ - depthMm / 2,
    maxZ: placed.positionZ + depthMm / 2
  }
}

/** Unit vector (floor plane) the cabinet's front faces towards. */
export function frontDirection(rotationDeg: RotationDegrees): { readonly x: number; readonly z: number } {
  switch (rotationDeg) {
    case 0:
      return { x: 0, z: 1 }
    case 90:
      return { x: 1, z: 0 }
    case 180:
      return { x: 0, z: -1 }
    case 270:
      return { x: -1, z: 0 }
  }
}

/**
 * World coordinate of the front face along its normal axis, signed so that a
 * larger value is always "further towards the front". Two same-rotation
 * cabinets have aligned fronts iff these values are equal.
 */
export function frontFaceCoordinate(placed: PlacedCabinet): number {
  const rect = placedCabinetRect(placed)
  switch (placed.rotationDeg) {
    case 0:
      return rect.maxZ
    case 90:
      return rect.maxX
    case 180:
      return -rect.minZ
    case 270:
      return -rect.minX
  }
}

/**
 * The vertical slice of space the carcass occupies, derived from the design
 * (a wall cabinet reads its own mounting-height param). Placements never
 * store an elevation, so this is the only way to ask how high a cabinet sits.
 */
export function placedVerticalInterval(placed: PlacedCabinet): VerticalExtentMm {
  return designVerticalExtent(placed.design)
}

/** Flush contact is NOT overlap: rects must intrude beyond this on both axes. */
export const OVERLAP_EPSILON_MM = 0.5

export function rectsOverlap(a: FloorRect, b: FloorRect): boolean {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > OVERLAP_EPSILON_MM &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > OVERLAP_EPSILON_MM
  )
}

/** Same epsilon rule vertically: a cabinet resting exactly on another is not overlap. */
export function intervalsOverlapMm(a: VerticalExtentMm, b: VerticalExtentMm): boolean {
  return Math.min(a.topMm, b.topMm) - Math.max(a.bottomMm, b.bottomMm) > OVERLAP_EPSILON_MM
}

/**
 * Two cabinets collide only when they share floor AND height: a wall cabinet
 * hanging over a base run occupies the same rect but a disjoint interval.
 */
export function placedCabinetsCollide(a: PlacedCabinet, b: PlacedCabinet): boolean {
  return (
    rectsOverlap(placedCabinetRect(a), placedCabinetRect(b)) &&
    intervalsOverlapMm(placedVerticalInterval(a), placedVerticalInterval(b))
  )
}

export function cabinetOverlapsOthers(
  placed: PlacedCabinet,
  others: readonly PlacedCabinet[]
): boolean {
  return others.some((other) => other.id !== placed.id && placedCabinetsCollide(placed, other))
}

export function firstOverlappingPair(scene: SceneDesign): readonly [string, string] | null {
  const cabinets = scene.cabinets
  for (let i = 0; i < cabinets.length; i += 1) {
    for (let j = i + 1; j < cabinets.length; j += 1) {
      if (placedCabinetsCollide(cabinets[i], cabinets[j])) {
        return [cabinets[i].id, cabinets[j].id]
      }
    }
  }
  return null
}

export function sceneHasOverlap(scene: SceneDesign): boolean {
  return firstOverlappingPair(scene) !== null
}

export function unionRect(rects: readonly FloorRect[]): FloorRect | null {
  if (rects.length === 0) {
    return null
  }
  return rects.reduce((acc, rect) => ({
    minX: Math.min(acc.minX, rect.minX),
    maxX: Math.max(acc.maxX, rect.maxX),
    minZ: Math.min(acc.minZ, rect.minZ),
    maxZ: Math.max(acc.maxZ, rect.maxZ)
  }))
}

export function sceneBoundingRect(scene: SceneDesign): FloorRect | null {
  return unionRect(scene.cabinets.map(placedCabinetRect))
}
