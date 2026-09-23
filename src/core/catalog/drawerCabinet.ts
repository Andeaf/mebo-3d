import { clampToLimit, limitViolations } from '../cabinet'
import type { HardwareItem, Panel } from '../panel'
import {
  buildDrawer,
  drawerSlideLengthMm,
  DRAWER_FRONT_MIN_HEIGHT_MM,
  type DrawerMaterials
} from './drawer'
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
 * a stack of drawers. Every drawer is the shared one from `drawer.ts`: a front
 * plus a four-sided box with a grooved-in HDF bottom, running on one pair of
 * slides. This file only decides the stack: equal fronts, or (Phase 10) a
 * few shallow drawers on top with the deep ones below sharing the rest.
 */

// Re-exported so the ladekast keeps one import site for its drawer facts.
export { DRAWER_SLIDE_MATERIAL_ID, drawerBoxSideHeightMm } from './drawer'

export interface DrawerCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly drawerCount: number
  /** How many of the TOP drawers are shallow; 0 = every front equal (the Phase 3 layout). */
  readonly shallowDrawerCount: number
  /** The front height of each shallow drawer; read only while shallowDrawerCount > 0. */
  readonly shallowFrontHeightMm: number
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export const DRAWER_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 400, max: 1000 },
  depthMm: { min: 300, max: 700 },
  drawerCount: { min: 1, max: 4 },
  // Checked also while dormant; while shallow drawers exist the equal share caps it too.
  shallowFrontHeightMm: { min: DRAWER_FRONT_MIN_HEIGHT_MM, max: 500 }
} as const

export function createDefaultDrawerCabinetParams(): DrawerCabinetParams {
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 560,
    drawerCount: 3,
    shallowDrawerCount: 0,
    shallowFrontHeightMm: 150,
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

/** The carcass face less the two reveals and the n − 1 gaps: what the fronts share. */
function sharedFaceMm(heightMm: number, drawerCount: number): number {
  return heightMm - 2 * FRONT_REVEAL_MM - (drawerCount - 1) * FRONT_GAP_MM
}

/** Equal front heights over the carcass face, with a reveal top and bottom and a gap between. */
export function drawerFrontHeightMm(spec: CarcassSpec, drawerCount: number): number {
  return sharedFaceMm(spec.heightMm, drawerCount) / drawerCount
}

/**
 * The tallest a shallow front may be: the equal share, floored. Below it,
 * every deep front is at least as tall as a shallow one, and since a front is
 * at least DRAWER_FRONT_MIN_HEIGHT_MM, every drawer keeps a legal box.
 */
export function shallowFrontHeightMaxMm(
  params: Pick<DrawerCabinetParams, 'heightMm' | 'drawerCount'>
): number {
  return Math.min(
    DRAWER_CABINET_LIMITS.shallowFrontHeightMm.max,
    Math.floor(sharedFaceMm(params.heightMm, params.drawerCount) / params.drawerCount)
  )
}

export function clampDrawerCabinetParams(params: DrawerCabinetParams): DrawerCabinetParams {
  const limits = DRAWER_CABINET_LIMITS
  // Dimensions and the count first: the shallow drawers read the clamped ones.
  const heightMm = clampToLimit(params.heightMm, limits.heightMm)
  const drawerCount = clampToLimit(params.drawerCount, limits.drawerCount)
  const shallowDrawerCount = clampToLimit(params.shallowDrawerCount, { min: 0, max: drawerCount - 1 })
  const shallowFrontMax =
    shallowDrawerCount > 0
      ? shallowFrontHeightMaxMm({ heightMm, drawerCount })
      : limits.shallowFrontHeightMm.max
  return {
    ...params,
    widthMm: clampToLimit(params.widthMm, limits.widthMm),
    heightMm,
    depthMm: clampToLimit(params.depthMm, limits.depthMm),
    drawerCount,
    shallowDrawerCount,
    shallowFrontHeightMm: clampToLimit(params.shallowFrontHeightMm, {
      min: limits.shallowFrontHeightMm.min,
      max: shallowFrontMax
    })
  }
}

export function validateDrawerCabinetParams(params: DrawerCabinetParams): string[] {
  const limits = DRAWER_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['drawerCount', params.drawerCount, limits.drawerCount],
    ['shallowFrontHeightMm', params.shallowFrontHeightMm, limits.shallowFrontHeightMm]
  ])
  const count = params.drawerCount
  if (!Number.isInteger(count)) {
    errors.push(`drawerCount must be an integer (got ${count})`)
  }
  // Judged against a valid count only, so one mistake gives one message. At
  // least one deep drawer owns the remainder of the face.
  if (Number.isInteger(count) && count >= limits.drawerCount.min && count <= limits.drawerCount.max) {
    const shallow = params.shallowDrawerCount
    if (!Number.isInteger(shallow) || shallow < 0 || shallow > count - 1) {
      errors.push(`shallowDrawerCount must be an integer between 0 and ${count - 1} (got ${shallow})`)
    } else if (shallow > 0) {
      const max = shallowFrontHeightMaxMm(params)
      if (params.shallowFrontHeightMm > max) {
        errors.push(
          `shallowFrontHeightMm must be at most ${max} for ${count} drawers in ${params.heightMm} mm, ` +
            `so no shallow front outgrows a deep one (got ${params.shallowFrontHeightMm})`
        )
      }
    }
  }
  return errors
}

export interface DrawerFrontSlot {
  readonly bottomMm: number
  readonly heightMm: number
}

/**
 * Every front's bottom edge and height, bottom → top (drawer 1 is the lowest).
 * Without shallow drawers: the Phase 3 equal split, its expressions unchanged.
 * With k of them: the top k fronts get the shallow height, the deep fronts
 * below share the rest in whole millimetres, and the BOTTOM drawer takes the
 * remainder of that division — so reveals + gaps + fronts = H exactly.
 */
export function drawerFrontLayout(params: DrawerCabinetParams): DrawerFrontSlot[] {
  const count = params.drawerCount
  const shallow = params.shallowDrawerCount
  if (shallow === 0) {
    const heightMm = drawerFrontHeightMm(params, count)
    return Array.from({ length: count }, (_, index) => ({
      bottomMm: FRONT_REVEAL_MM + index * (heightMm + FRONT_GAP_MM),
      heightMm
    }))
  }
  const deepCount = count - shallow
  const rest = sharedFaceMm(params.heightMm, count) - shallow * params.shallowFrontHeightMm
  const deep = Math.floor(rest / deepCount)
  const heights = [
    rest - (deepCount - 1) * deep,
    ...Array.from({ length: deepCount - 1 }, () => deep),
    ...Array.from({ length: shallow }, () => params.shallowFrontHeightMm)
  ]
  let bottomMm = FRONT_REVEAL_MM
  return heights.map((heightMm) => {
    const slot = { bottomMm, heightMm }
    bottomMm += heightMm + FRONT_GAP_MM
    return slot
  })
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
  const hardware: HardwareItem[] = []
  drawerFrontLayout(params).forEach((slot, index) => {
    // Full overlay over the carcass face; the box runs between the sides.
    const drawer = buildDrawer(
      {
        number: index + 1,
        front: {
          centerXMm: params.widthMm / 2,
          bottomMm: slot.bottomMm,
          widthMm: params.widthMm - 2 * FRONT_REVEAL_MM,
          heightMm: slot.heightMm
        },
        bayWidthMm: innerWidthMm(params),
        bayCenterXMm: params.widthMm / 2,
        carcassDepthMm: params.depthMm
      },
      materials
    )
    panels.push(...drawer.panels)
    hardware.push(...drawer.hardware)
  })

  return {
    panels,
    hardware: mergeHardware(hardware),
    boundingSizeMm: boundingSizeWithFronts(params, true)
  }
}
