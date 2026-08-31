import type { CabinetDesign } from './cabinet'
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

/**
 * Carcass footprint only. Overlay doors protrude ~18 mm in front of the
 * carcass and are excluded from overlap/snap on purpose: side-by-side
 * cabinets meet at their carcass sides, and "fronts aligned" means carcass
 * front faces flush (door fronts then align automatically in a run).
 */
export function cabinetFootprintSize(design: CabinetDesign): FootprintSize {
  return { widthMm: design.params.widthMm, depthMm: design.params.depthMm }
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

/** Flush contact is NOT overlap: rects must intrude beyond this on both axes. */
export const OVERLAP_EPSILON_MM = 0.5

export function rectsOverlap(a: FloorRect, b: FloorRect): boolean {
  return (
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > OVERLAP_EPSILON_MM &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > OVERLAP_EPSILON_MM
  )
}

export function cabinetOverlapsOthers(
  placed: PlacedCabinet,
  others: readonly PlacedCabinet[]
): boolean {
  const rect = placedCabinetRect(placed)
  return others.some(
    (other) => other.id !== placed.id && rectsOverlap(rect, placedCabinetRect(other))
  )
}

export function firstOverlappingPair(scene: SceneDesign): readonly [string, string] | null {
  const rects = scene.cabinets.map((cabinet) => ({ id: cabinet.id, rect: placedCabinetRect(cabinet) }))
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      if (rectsOverlap(rects[i].rect, rects[j].rect)) {
        return [rects[i].id, rects[j].id]
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
