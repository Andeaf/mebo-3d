import type { CabinetDesign } from './cabinet'

/** Yaw of a placed cabinet, counterclockwise seen from above. At 0° the front faces +Z. */
export type RotationDegrees = 0 | 90 | 180 | 270

/**
 * One cabinet standing in the scene. `positionX/positionZ` is the center of
 * the CARCASS footprint on the floor (mm, world coordinates); rotation pivots
 * around that center. Overlay doors protrude in front of the footprint and
 * are deliberately excluded from placement math (documented simplification).
 */
export interface PlacedCabinet {
  readonly id: string
  readonly design: CabinetDesign
  readonly positionX: number
  readonly positionZ: number
  readonly rotationDeg: RotationDegrees
}

export interface SceneDesign {
  readonly cabinets: readonly PlacedCabinet[]
}

export const EMPTY_SCENE: SceneDesign = { cabinets: [] }

export function findPlacedCabinet(scene: SceneDesign, id: string): PlacedCabinet | undefined {
  return scene.cabinets.find((cabinet) => cabinet.id === id)
}

export function rotationStep(rotation: RotationDegrees): RotationDegrees {
  return (((rotation + 90) % 360) as RotationDegrees)
}
