import type { CabinetDesign } from './cabinet'
import { createDefaultRoom, type RoomDesign } from './room'
import { createDefaultWorktopSettings, type WorktopSettings } from './worktop'

/** Yaw of a placed cabinet, counterclockwise seen from above. At 0° the front faces +Z. */
export type RotationDegrees = 0 | 90 | 180 | 270

export const ROTATION_DEGREES: readonly RotationDegrees[] = [0, 90, 180, 270]

export function isRotationDegrees(value: unknown): value is RotationDegrees {
  return typeof value === 'number' && (ROTATION_DEGREES as readonly number[]).includes(value)
}

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

/**
 * A scene is a room, the worktop settings and the cabinets standing in it.
 * Neither the room nor the settings is ever optional: an empty scene is an
 * empty room, not a roomless void. The worktop SLABS are not here — they
 * are derived from the cabinets and the settings (`computeWorktops`).
 */
export interface SceneDesign {
  readonly room: RoomDesign
  readonly worktop: WorktopSettings
  readonly cabinets: readonly PlacedCabinet[]
}

export const EMPTY_SCENE: SceneDesign = {
  room: createDefaultRoom(),
  worktop: createDefaultWorktopSettings(),
  cabinets: []
}

export function findPlacedCabinet(scene: SceneDesign, id: string): PlacedCabinet | undefined {
  return scene.cabinets.find((cabinet) => cabinet.id === id)
}

export function rotationStep(rotation: RotationDegrees): RotationDegrees {
  return (((rotation + 90) % 360) as RotationDegrees)
}

/**
 * Cabinet ids are `cab-<n>` with n a positive integer, handed out in
 * increasing order per session. The price panel shows the `<n>` and the store
 * derives the next free number from it, so the shape is part of the contract.
 */
const CABINET_ID_PATTERN = /^cab-([1-9][0-9]*)$/

/** The `<n>` of a `cab-<n>` id, or null when the id has another shape. */
export function cabinetNumberOf(id: string): number | null {
  const match = CABINET_ID_PATTERN.exec(id)
  return match === null ? null : Number(match[1])
}

/** One above the highest `cab-<n>` in the scene (1 for an empty scene), so new ids never collide. */
export function nextCabinetNumberFor(scene: SceneDesign): number {
  let highest = 0
  for (const cabinet of scene.cabinets) {
    const number = cabinetNumberOf(cabinet.id)
    if (number !== null && number > highest) {
      highest = number
    }
  }
  return highest + 1
}
