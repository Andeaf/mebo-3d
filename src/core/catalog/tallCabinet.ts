import {
  clampDoorCountForWidth,
  clampToLimit,
  limitViolations,
  validateDoorCountForWidth,
  type DoorCount
} from '../cabinet'
import type { Panel } from '../panel'
import {
  backPanel,
  bottomPanel,
  boundingSizeWithFronts,
  doorHardware,
  overlayDoorPanels,
  shelfPanels,
  sidePanels,
  topPanel,
  FRONT_REVEAL_MM,
  type CabinetBuild
} from './parts'

/**
 * Kolomkast — the floor-standing full-height cabinet (larder, oven housing).
 * Same construction as the base cabinet with a full top panel instead of
 * stretchers, and full-height overlay doors that need more hinges the taller
 * the leaf gets.
 */

// Provisional until the company's real list arrives.
/** Hinges per leaf, by door height; the first row the height fits into wins. */
export const TALL_HINGE_COUNT_BY_DOOR_HEIGHT: readonly {
  readonly maxDoorHeightMm: number
  readonly hinges: number
}[] = [
  { maxDoorHeightMm: 900, hinges: 2 },
  { maxDoorHeightMm: 1600, hinges: 3 },
  { maxDoorHeightMm: 2000, hinges: 4 }
]
const HINGES_ABOVE_TABLE = 5

export function tallHingesPerDoor(doorHeightMm: number): number {
  const row = TALL_HINGE_COUNT_BY_DOOR_HEIGHT.find(
    (entry) => doorHeightMm <= entry.maxDoorHeightMm
  )
  return row === undefined ? HINGES_ABOVE_TABLE : row.hinges
}

export interface TallCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly shelfCount: number
  readonly doorCount: DoorCount
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

/**
 * Depth is a fixed 560 mm for now (min = max), but stays a param so clamp,
 * validate and the UI treat every kind the same way — and so the range can
 * simply open up when the company's real list arrives.
 */
export const TALL_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 1800, max: 2400 },
  depthMm: { min: 560, max: 560 },
  shelfCount: { min: 0, max: 6 }
} as const

export function createDefaultTallCabinetParams(): TallCabinetParams {
  return {
    widthMm: 600,
    heightMm: 2100,
    depthMm: 560,
    shelfCount: 4,
    doorCount: 2,
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

export function clampTallCabinetParams(params: TallCabinetParams): TallCabinetParams {
  const limits = TALL_CABINET_LIMITS
  // Dimensions first: the door rule reads the already-clamped width.
  const widthMm = clampToLimit(params.widthMm, limits.widthMm)
  return {
    ...params,
    widthMm,
    heightMm: clampToLimit(params.heightMm, limits.heightMm),
    depthMm: clampToLimit(params.depthMm, limits.depthMm),
    shelfCount: clampToLimit(params.shelfCount, limits.shelfCount),
    doorCount: clampDoorCountForWidth(widthMm, params.doorCount)
  }
}

export function validateTallCabinetParams(params: TallCabinetParams): string[] {
  const limits = TALL_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['shelfCount', params.shelfCount, limits.shelfCount]
  ])
  if (!Number.isInteger(params.shelfCount)) {
    errors.push(`shelfCount must be an integer (got ${params.shelfCount})`)
  }
  errors.push(...validateDoorCountForWidth(params.widthMm, params.doorCount))
  return errors
}

export function generateTallCabinet(params: TallCabinetParams): CabinetBuild {
  const errors = validateTallCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid tall cabinet params: ${errors.join('; ')}`)
  }

  const panels: Panel[] = [
    ...sidePanels(params),
    bottomPanel(params),
    topPanel(params),
    backPanel(params),
    ...shelfPanels(params, params.shelfCount),
    ...overlayDoorPanels(params, params.doorCount)
  ]

  const doorHeightMm = params.heightMm - 2 * FRONT_REVEAL_MM
  return {
    panels,
    hardware: doorHardware(params.doorCount, tallHingesPerDoor(doorHeightMm)),
    boundingSizeMm: boundingSizeWithFronts(params, params.doorCount > 0)
  }
}
