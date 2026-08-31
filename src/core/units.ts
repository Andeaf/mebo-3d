/**
 * Domain units. 1 domain unit = 1 millimeter, everywhere in `src/core`.
 * The renderer scales to meters at draw time; the core never does.
 */
export type Millimeters = number

export interface Vec3 {
  readonly x: Millimeters
  readonly y: Millimeters
  readonly z: Millimeters
}

export interface Size3 {
  readonly x: Millimeters
  readonly y: Millimeters
  readonly z: Millimeters
}

/** Axis-aligned box in cabinet space: center position + full size, in mm. */
export interface Box3 {
  readonly center: Vec3
  readonly size: Size3
}

export const MM_PER_METER = 1000

export function mmToMeters(mm: Millimeters): number {
  return mm / MM_PER_METER
}

export function squareMmToSquareMeters(mm2: number): number {
  return mm2 / (MM_PER_METER * MM_PER_METER)
}
