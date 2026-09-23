import {
  clampDoorCountForWidth,
  clampToLimit,
  limitViolations,
  validateDoorCountForWidth,
  type DoorCount
} from '../cabinet'
import type { Panel } from '../panel'
import { buildDrawer, DRAWER_FRONT_MIN_HEIGHT_MM } from './drawer'
import {
  backPanel,
  bottomPanel,
  boundingSizeWithFronts,
  doorHardware,
  fixedShelfPanel,
  hingesPerDoor,
  innerWidthMm,
  mergeHardware,
  overlayDoorRow,
  shelfPanelsBetween,
  sidePanels,
  stretcherPanels,
  CARCASS_THICKNESS_MM,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM,
  type CabinetBuild
} from './parts'

/**
 * Onderkast met lade — the classic kitchen base unit: one drawer on top and
 * doors below in one carcass, with the base cabinet's stretcher top. A fixed
 * shelf under the drawer closes its compartment and sits behind the gap
 * between the drawer front and the doors; the door leaves follow the door
 * rule and hang on hinges counted by their height; adjustable shelves spread
 * over the door compartment. The drawer is the shared one (`drawer.ts`).
 */

// Provisional until the company's real list arrives.
/** However tall the drawer front, the doors below keep at least this much. */
const MIN_DOOR_HEIGHT_MM = 200

export interface DrawerDoorCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly drawerFrontHeightMm: number
  /** Adjustable shelves behind the doors. */
  readonly shelfCount: number
  readonly doorCount: DoorCount
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export const DRAWER_DOOR_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 400, max: 1000 },
  depthMm: { min: 300, max: 700 },
  drawerFrontHeightMm: { min: DRAWER_FRONT_MIN_HEIGHT_MM, max: 300 },
  shelfCount: { min: 0, max: 3 }
} as const

export function createDefaultDrawerDoorCabinetParams(): DrawerDoorCabinetParams {
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 560,
    drawerFrontHeightMm: 150,
    shelfCount: 1,
    doorCount: 1,
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

/** The door leaves' height: the carcass less the drawer zone (reveal, front, gap) and the bottom reveal. */
export function drawerDoorHeightMm(
  params: Pick<DrawerDoorCabinetParams, 'heightMm' | 'drawerFrontHeightMm'>
): number {
  return params.heightMm - 2 * FRONT_REVEAL_MM - FRONT_GAP_MM - params.drawerFrontHeightMm
}

/** The tallest drawer front this carcass takes while its doors keep MIN_DOOR_HEIGHT_MM. */
export function drawerFrontHeightMaxMm(params: Pick<DrawerDoorCabinetParams, 'heightMm'>): number {
  return Math.min(
    DRAWER_DOOR_CABINET_LIMITS.drawerFrontHeightMm.max,
    params.heightMm - 2 * FRONT_REVEAL_MM - FRONT_GAP_MM - MIN_DOOR_HEIGHT_MM
  )
}

export function clampDrawerDoorCabinetParams(params: DrawerDoorCabinetParams): DrawerDoorCabinetParams {
  const limits = DRAWER_DOOR_CABINET_LIMITS
  // Dimensions first: the door rule reads the clamped width, the front the clamped height.
  const widthMm = clampToLimit(params.widthMm, limits.widthMm)
  const heightMm = clampToLimit(params.heightMm, limits.heightMm)
  return {
    ...params,
    widthMm,
    heightMm,
    depthMm: clampToLimit(params.depthMm, limits.depthMm),
    drawerFrontHeightMm: clampToLimit(params.drawerFrontHeightMm, {
      min: limits.drawerFrontHeightMm.min,
      max: drawerFrontHeightMaxMm({ heightMm })
    }),
    shelfCount: clampToLimit(params.shelfCount, limits.shelfCount),
    doorCount: clampDoorCountForWidth(widthMm, params.doorCount)
  }
}

export function validateDrawerDoorCabinetParams(params: DrawerDoorCabinetParams): string[] {
  const limits = DRAWER_DOOR_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['drawerFrontHeightMm', params.drawerFrontHeightMm, limits.drawerFrontHeightMm],
    ['shelfCount', params.shelfCount, limits.shelfCount]
  ])
  if (!Number.isInteger(params.shelfCount)) {
    errors.push(`shelfCount must be an integer (got ${params.shelfCount})`)
  }
  errors.push(...validateDoorCountForWidth(params.widthMm, params.doorCount))
  // Judged only between a legal height and a legal front, so one mistake gives one message.
  const inRange = (value: number, limit: { readonly min: number; readonly max: number }): boolean =>
    value >= limit.min && value <= limit.max
  const frontMax = drawerFrontHeightMaxMm(params)
  if (
    inRange(params.heightMm, limits.heightMm) &&
    inRange(params.drawerFrontHeightMm, limits.drawerFrontHeightMm) &&
    params.drawerFrontHeightMm > frontMax
  ) {
    errors.push(
      `drawerFrontHeightMm must be at most ${frontMax} in a ${params.heightMm} mm carcass, ` +
        `so the doors keep ${MIN_DOOR_HEIGHT_MM} mm (got ${params.drawerFrontHeightMm})`
    )
  }
  return errors
}

export function generateDrawerDoorCabinet(params: DrawerDoorCabinetParams): CabinetBuild {
  const errors = validateDrawerDoorCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid drawer-door cabinet params: ${errors.join('; ')}`)
  }

  const t = CARCASS_THICKNESS_MM
  const frontBottomMm = params.heightMm - FRONT_REVEAL_MM - params.drawerFrontHeightMm
  const doorHeightMm = drawerDoorHeightMm(params)
  // Behind the gap between the drawer front and the doors: each front covers half of what is left.
  const fixedShelfCenterMm = frontBottomMm - FRONT_GAP_MM / 2

  // Full overlay over the carcass face, like every catalog drawer; the box runs between the sides.
  const drawer = buildDrawer(
    {
      number: 1,
      front: {
        centerXMm: params.widthMm / 2,
        bottomMm: frontBottomMm,
        widthMm: params.widthMm - 2 * FRONT_REVEAL_MM,
        heightMm: params.drawerFrontHeightMm
      },
      bayWidthMm: innerWidthMm(params),
      bayCenterXMm: params.widthMm / 2,
      carcassDepthMm: params.depthMm
    },
    {
      frontMaterialId: params.carcassMaterialId,
      boxMaterialId: params.carcassMaterialId,
      bottomMaterialId: params.backMaterialId,
      edgeBandMaterialId: params.edgeBandMaterialId
    }
  )

  const panels: Panel[] = [
    ...sidePanels(params),
    bottomPanel(params),
    ...stretcherPanels(params),
    backPanel(params),
    fixedShelfPanel(params, fixedShelfCenterMm),
    ...shelfPanelsBetween(params, params.shelfCount, t, fixedShelfCenterMm - t / 2),
    ...overlayDoorRow(params, params.doorCount, FRONT_REVEAL_MM, doorHeightMm),
    ...drawer.panels
  ]

  return {
    panels,
    hardware: mergeHardware([
      ...doorHardware(params.doorCount, hingesPerDoor(doorHeightMm)),
      ...drawer.hardware
    ]),
    boundingSizeMm: boundingSizeWithFronts(params, true)
  }
}
