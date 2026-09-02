import { clampToLimit, limitViolations } from '../cabinet'
import type { HardwareItem, Panel } from '../panel'
import {
  backPanel,
  bandOf,
  bottomPanel,
  boundingSizeWithFronts,
  innerWidthMm,
  sidePanels,
  stretcherPanels,
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM,
  HANDLE_MATERIAL_ID,
  type CabinetBuild,
  type CarcassSpec
} from './parts'

/**
 * Ladekast — a base carcass (stretcher top, no shelves, no doors) filled with
 * a stack of equal-height drawers. Every drawer is a front plus a four-sided
 * box with a grooved-in HDF bottom, running on one pair of slides.
 */

// Provisional until the company's real list arrives.
export const DRAWER_SLIDE_MATERIAL_ID = 'drawer-slide-pair'
/** Air per side between the drawer box and the carcass, for the slide. */
const DRAWER_SLIDE_CLEARANCE_MM = 13
/** Space kept free behind the box; the slide length is what fits in front of it. */
const DRAWER_SLIDE_REAR_CLEARANCE_MM = 20
/** Slides come in 50 mm nominal lengths. */
const DRAWER_SLIDE_LENGTH_STEP_MM = 50
/** A drawer side is this much lower than its front, within the stocked range. */
const DRAWER_SIDE_HEIGHT_DROP_MM = 50
const DRAWER_SIDE_HEIGHT_MIN_MM = 60
const DRAWER_SIDE_HEIGHT_MAX_MM = 180
/** The box bottom rides this high above its front's bottom edge. */
const DRAWER_BOX_LIFT_MM = 20
/** The bottom is grooved this deep into all four box parts. */
const DRAWER_BOTTOM_GROOVE_MM = 6

export interface DrawerCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly drawerCount: number
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export const DRAWER_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 400, max: 1000 },
  depthMm: { min: 300, max: 700 },
  drawerCount: { min: 1, max: 4 }
} as const

export function createDefaultDrawerCabinetParams(): DrawerCabinetParams {
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 560,
    drawerCount: 3,
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

export function clampDrawerCabinetParams(params: DrawerCabinetParams): DrawerCabinetParams {
  const limits = DRAWER_CABINET_LIMITS
  return {
    ...params,
    widthMm: clampToLimit(params.widthMm, limits.widthMm),
    heightMm: clampToLimit(params.heightMm, limits.heightMm),
    depthMm: clampToLimit(params.depthMm, limits.depthMm),
    drawerCount: clampToLimit(params.drawerCount, limits.drawerCount)
  }
}

export function validateDrawerCabinetParams(params: DrawerCabinetParams): string[] {
  const limits = DRAWER_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['drawerCount', params.drawerCount, limits.drawerCount]
  ])
  if (!Number.isInteger(params.drawerCount)) {
    errors.push(`drawerCount must be an integer (got ${params.drawerCount})`)
  }
  return errors
}

/** Equal front heights over the carcass face, with a reveal top and bottom and a gap between. */
export function drawerFrontHeightMm(spec: CarcassSpec, drawerCount: number): number {
  return (
    (spec.heightMm - 2 * FRONT_REVEAL_MM - (drawerCount - 1) * FRONT_GAP_MM) / drawerCount
  )
}

/** Nominal slide length: what fits in front of the rear clearance, rounded down to a stocked size. */
export function drawerBoxDepthMm(spec: CarcassSpec): number {
  return (
    Math.floor((spec.depthMm - DRAWER_SLIDE_REAR_CLEARANCE_MM) / DRAWER_SLIDE_LENGTH_STEP_MM) *
    DRAWER_SLIDE_LENGTH_STEP_MM
  )
}

export function drawerBoxSideHeightMm(frontHeightMm: number): number {
  return Math.min(
    DRAWER_SIDE_HEIGHT_MAX_MM,
    Math.max(DRAWER_SIDE_HEIGHT_MIN_MM, frontHeightMm - DRAWER_SIDE_HEIGHT_DROP_MM)
  )
}

/** One drawer: the overlay front plus its box (2 sides, front, back, grooved bottom). */
function drawerPanels(spec: CarcassSpec, index: number, drawerCount: number): Panel[] {
  const t = CARCASS_THICKNESS_MM
  const frontHeight = drawerFrontHeightMm(spec, drawerCount)
  const frontBottomY = FRONT_REVEAL_MM + index * (frontHeight + FRONT_GAP_MM)
  const frontWidth = spec.widthMm - 2 * FRONT_REVEAL_MM
  const number = index + 1

  const boxDepth = drawerBoxDepthMm(spec)
  const boxOuterWidth = innerWidthMm(spec) - 2 * DRAWER_SLIDE_CLEARANCE_MM
  const boxInnerWidth = boxOuterWidth - 2 * t
  const sideHeight = drawerBoxSideHeightMm(frontHeight)
  const boxBottomY = frontBottomY + DRAWER_BOX_LIFT_MM
  const boxCenterY = boxBottomY + sideHeight / 2
  // The box runs forward from the rear clearance to the carcass front face.
  const boxFrontZ = spec.depthMm
  const boxRearZ = boxFrontZ - boxDepth

  const panels: Panel[] = [
    {
      id: `drawer-front-${number}`,
      role: 'drawer-front',
      materialId: spec.carcassMaterialId,
      lengthMm: frontHeight,
      widthMm: frontWidth,
      thicknessMm: DOOR_THICKNESS_MM,
      edgeBanding: bandOf(spec, ['length-1', 'length-2', 'width-1', 'width-2']),
      box: {
        center: {
          x: spec.widthMm / 2,
          y: frontBottomY + frontHeight / 2,
          z: spec.depthMm + DOOR_THICKNESS_MM / 2
        },
        size: { x: frontWidth, y: frontHeight, z: DOOR_THICKNESS_MM }
      }
    }
  ]

  // Box sides run the full box depth; top edge banded.
  for (const [side, centerX] of [
    ['left', spec.widthMm / 2 - (boxOuterWidth - t) / 2],
    ['right', spec.widthMm / 2 + (boxOuterWidth - t) / 2]
  ] as const) {
    panels.push({
      id: `drawer-${number}-box-${side}`,
      role: 'drawer-box-side',
      materialId: spec.carcassMaterialId,
      lengthMm: boxDepth,
      widthMm: sideHeight,
      thicknessMm: t,
      edgeBanding: bandOf(spec, ['length-1']),
      box: {
        center: { x: centerX, y: boxCenterY, z: boxRearZ + boxDepth / 2 },
        size: { x: t, y: sideHeight, z: boxDepth }
      }
    })
  }

  // Box front and back fitted between the sides; top edge banded.
  for (const [role, centerZ] of [
    ['drawer-box-front', boxFrontZ - t / 2],
    ['drawer-box-back', boxRearZ + t / 2]
  ] as const) {
    panels.push({
      id: `drawer-${number}-${role.replace('drawer-', '')}`,
      role,
      materialId: spec.carcassMaterialId,
      lengthMm: boxInnerWidth,
      widthMm: sideHeight,
      thicknessMm: t,
      edgeBanding: bandOf(spec, ['length-1']),
      box: {
        center: { x: spec.widthMm / 2, y: boxCenterY, z: centerZ },
        size: { x: boxInnerWidth, y: sideHeight, z: t }
      }
    })
  }

  // HDF bottom, grooved into all four box parts (hence the extra 6 mm per side).
  const bottomWidth = boxInnerWidth + 2 * DRAWER_BOTTOM_GROOVE_MM
  const bottomDepth = boxDepth - 2 * t + 2 * DRAWER_BOTTOM_GROOVE_MM
  panels.push({
    id: `drawer-${number}-box-bottom`,
    role: 'drawer-box-bottom',
    materialId: spec.backMaterialId,
    lengthMm: bottomWidth,
    widthMm: bottomDepth,
    thicknessMm: BACK_THICKNESS_MM,
    edgeBanding: null,
    box: {
      center: {
        x: spec.widthMm / 2,
        y: boxBottomY + BACK_THICKNESS_MM / 2,
        z: boxRearZ + boxDepth / 2
      },
      size: { x: bottomWidth, y: BACK_THICKNESS_MM, z: bottomDepth }
    }
  })

  return panels
}

export function generateDrawerCabinet(params: DrawerCabinetParams): CabinetBuild {
  const errors = validateDrawerCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid drawer cabinet params: ${errors.join('; ')}`)
  }

  const panels: Panel[] = [
    ...sidePanels(params),
    bottomPanel(params),
    ...stretcherPanels(params),
    backPanel(params)
  ]
  for (let i = 0; i < params.drawerCount; i += 1) {
    panels.push(...drawerPanels(params, i, params.drawerCount))
  }

  const hardware: HardwareItem[] = [
    { materialId: DRAWER_SLIDE_MATERIAL_ID, quantity: params.drawerCount },
    { materialId: HANDLE_MATERIAL_ID, quantity: params.drawerCount }
  ]

  return {
    panels,
    hardware,
    boundingSizeMm: boundingSizeWithFronts(params, true)
  }
}
