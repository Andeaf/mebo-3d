import { clampToLimit, limitViolations } from '../cabinet'
import type { HardwareItem, Panel } from '../panel'
import { buildDrawer, drawerSlideLengthMm, type DrawerMaterials } from './drawer'
import {
  backPanel,
  bottomPanel,
  boundingSizeWithFronts,
  innerWidthMm,
  mergeHardware,
  sidePanels,
  stretcherPanels,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM,
  type CabinetBuild,
  type CarcassSpec
} from './parts'

/**
 * Ladekast — a base carcass (stretcher top, no shelves, no doors) filled with
 * a stack of equal-height drawers. Every drawer is the shared one from
 * `drawer.ts`: a front plus a four-sided box with a grooved-in HDF bottom,
 * running on one pair of slides. This file only decides the stack.
 */

// Re-exported so the ladekast keeps one import site for its drawer facts.
export { DRAWER_SLIDE_MATERIAL_ID, drawerBoxSideHeightMm } from './drawer'

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

/** Nominal slide length for this carcass: the drawer module's rule. */
export function drawerBoxDepthMm(spec: CarcassSpec): number {
  return drawerSlideLengthMm(spec.depthMm)
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
  // Fronts and boxes are carcass board, the bottoms back board, as always.
  const materials: DrawerMaterials = {
    frontMaterialId: params.carcassMaterialId,
    boxMaterialId: params.carcassMaterialId,
    bottomMaterialId: params.backMaterialId,
    edgeBandMaterialId: params.edgeBandMaterialId
  }
  const frontHeight = drawerFrontHeightMm(params, params.drawerCount)
  const hardware: HardwareItem[] = []
  for (let i = 0; i < params.drawerCount; i += 1) {
    // Full overlay over the carcass face; the box runs between the sides.
    const drawer = buildDrawer(
      {
        number: i + 1,
        front: {
          centerXMm: params.widthMm / 2,
          bottomMm: FRONT_REVEAL_MM + i * (frontHeight + FRONT_GAP_MM),
          widthMm: params.widthMm - 2 * FRONT_REVEAL_MM,
          heightMm: frontHeight
        },
        bayWidthMm: innerWidthMm(params),
        bayCenterXMm: params.widthMm / 2,
        carcassDepthMm: params.depthMm
      },
      materials
    )
    panels.push(...drawer.panels)
    hardware.push(...drawer.hardware)
  }

  return {
    panels,
    hardware: mergeHardware(hardware),
    boundingSizeMm: boundingSizeWithFronts(params, true)
  }
}
