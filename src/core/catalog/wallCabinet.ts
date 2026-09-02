import {
  clampDoorCountForWidth,
  clampToLimit,
  limitViolations,
  validateDoorCountForWidth,
  type DoorCount
} from '../cabinet'
import type { HardwareItem, Panel } from '../panel'
import {
  backPanel,
  bottomPanel,
  boundingSizeWithFronts,
  doorHardware,
  overlayDoorPanels,
  shelfPanels,
  sidePanels,
  topPanel,
  type CabinetBuild
} from './parts'

/**
 * Bovenkast — the wall-hung cabinet. Same frameless construction as the base
 * cabinet, but closed by a full top panel as well as a full bottom (nothing
 * rests on it, and both edges are in view from below).
 *
 * `mountingHeightMm` never reaches the build: panels are generated with y = 0
 * at the cabinet's own bottom, exactly like every other kind. Only the
 * registry's vertical extent reads it, so the scene knows how high it hangs.
 */

// Provisional until the company's real list arrives.
const HINGES_PER_DOOR = 2
export const WALL_BRACKETS_PER_CABINET = 2
export const BRACKET_MATERIAL_ID = 'hanging-bracket'

export interface WallCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  /** Height of the cabinet's bottom edge above the floor. */
  readonly mountingHeightMm: number
  readonly shelfCount: number
  readonly doorCount: DoorCount
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export const WALL_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 400, max: 900 },
  depthMm: { min: 280, max: 400 },
  mountingHeightMm: { min: 900, max: 2200 },
  shelfCount: { min: 0, max: 3 }
} as const

export function createDefaultWallCabinetParams(): WallCabinetParams {
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 320,
    mountingHeightMm: 1450,
    shelfCount: 2,
    doorCount: 2,
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

export function clampWallCabinetParams(params: WallCabinetParams): WallCabinetParams {
  const limits = WALL_CABINET_LIMITS
  // Dimensions first: the door rule reads the already-clamped width.
  const widthMm = clampToLimit(params.widthMm, limits.widthMm)
  return {
    ...params,
    widthMm,
    heightMm: clampToLimit(params.heightMm, limits.heightMm),
    depthMm: clampToLimit(params.depthMm, limits.depthMm),
    mountingHeightMm: clampToLimit(params.mountingHeightMm, limits.mountingHeightMm),
    shelfCount: clampToLimit(params.shelfCount, limits.shelfCount),
    doorCount: clampDoorCountForWidth(widthMm, params.doorCount)
  }
}

export function validateWallCabinetParams(params: WallCabinetParams): string[] {
  const limits = WALL_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['mountingHeightMm', params.mountingHeightMm, limits.mountingHeightMm],
    ['shelfCount', params.shelfCount, limits.shelfCount]
  ])
  if (!Number.isInteger(params.shelfCount)) {
    errors.push(`shelfCount must be an integer (got ${params.shelfCount})`)
  }
  errors.push(...validateDoorCountForWidth(params.widthMm, params.doorCount))
  return errors
}

export function generateWallCabinet(params: WallCabinetParams): CabinetBuild {
  const errors = validateWallCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid wall cabinet params: ${errors.join('; ')}`)
  }

  const panels: Panel[] = [
    ...sidePanels(params),
    bottomPanel(params),
    topPanel(params),
    backPanel(params),
    ...shelfPanels(params, params.shelfCount),
    ...overlayDoorPanels(params, params.doorCount)
  ]

  const hardware: HardwareItem[] = [
    ...doorHardware(params.doorCount, HINGES_PER_DOOR),
    { materialId: BRACKET_MATERIAL_ID, quantity: WALL_BRACKETS_PER_CABINET }
  ]

  return {
    panels,
    hardware,
    boundingSizeMm: boundingSizeWithFronts(params, params.doorCount > 0)
  }
}
