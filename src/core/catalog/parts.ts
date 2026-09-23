import type { EdgeBanding, HardwareItem, Panel, PanelEdgeId, PanelRole } from '../panel'
import type { Size3 } from '../units'

/**
 * Construction pieces shared by every cabinet kind in the catalog.
 *
 * Coordinate system (cabinet space, mm), identical for all kinds:
 *   X = width (0 at the left outside face), Y = height (0 at the cabinet's own
 *   bottom), Z = depth (0 at the rear outside face, +Z towards the room).
 *   Overlay fronts (doors, drawer fronts) sit in front of the carcass, at
 *   z > depth. A cabinet is always generated with y = 0 at its own bottom;
 *   how high it hangs in the scene is a placement concern, never a build one.
 */

export const CARCASS_THICKNESS_MM = 18
export const BACK_THICKNESS_MM = 3
export const DOOR_THICKNESS_MM = 18

/** Width of the two top stretchers that replace a full top panel. */
export const STRETCHER_WIDTH_MM = 96
/** The back panel sits in a rebate and overlaps the surrounding panels by this much per side. */
export const BACK_REBATE_OVERLAP_MM = 8
/** The back panel is seated this far in front of the rear face (rebate seat). */
export const BACK_RECESS_MM = 1
export const SHELF_SIDE_CLEARANCE_MM = 1
export const SHELF_REAR_CLEARANCE_MM = 2
export const SHELF_FRONT_SETBACK_MM = 20
/** Reveal around an overlay front row (top, bottom and outer sides). */
export const FRONT_REVEAL_MM = 2
/** Gap between neighbouring overlay fronts (double doors, stacked drawer fronts). */
export const FRONT_GAP_MM = 3

export const HINGE_MATERIAL_ID = 'hinge-standard'
export const HANDLE_MATERIAL_ID = 'handle-standard'
const HANDLES_PER_FRONT = 1

/**
 * The generated build is the single source of truth for one cabinet:
 * the 3D view, the cutting list and the price are all derived from it.
 */
export interface CabinetBuild {
  readonly panels: readonly Panel[]
  readonly hardware: readonly HardwareItem[]
  /** Overall bounding size including overlay fronts (mm). */
  readonly boundingSizeMm: Size3
}

/**
 * The carcass box a kind is built around. Every kind's params satisfy this
 * structurally, so generators pass their params straight in.
 */
export interface CarcassSpec {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export function bandOf(spec: CarcassSpec, edges: readonly PanelEdgeId[]): EdgeBanding {
  return { materialId: spec.edgeBandMaterialId, edges }
}

/** Clear width between the two sides. */
export function innerWidthMm(spec: CarcassSpec): number {
  return spec.widthMm - 2 * CARCASS_THICKNESS_MM
}

/** Clear height between the bottom and the top member. */
export function interiorHeightMm(spec: CarcassSpec): number {
  return spec.heightMm - 2 * CARCASS_THICKNESS_MM
}

/** Z of the back panel's front face: the rear limit of the interior. */
export function interiorRearZMm(): number {
  return BACK_RECESS_MM + BACK_THICKNESS_MM
}

/** Two full-height, full-depth sides; front edge banded. */
export function sidePanels(spec: CarcassSpec): Panel[] {
  const t = CARCASS_THICKNESS_MM
  return (
    [
      ['side-left', t / 2],
      ['side-right', spec.widthMm - t / 2]
    ] as const
  ).map(([role, centerX]) => ({
    id: role,
    role,
    materialId: spec.carcassMaterialId,
    lengthMm: spec.heightMm,
    widthMm: spec.depthMm,
    thicknessMm: t,
    edgeBanding: bandOf(spec, ['length-1']),
    box: {
      center: { x: centerX, y: spec.heightMm / 2, z: spec.depthMm / 2 },
      size: { x: t, y: spec.heightMm, z: spec.depthMm }
    }
  }))
}

/** A full-depth horizontal panel fitted between the sides; front edge banded. */
function horizontalPanel(spec: CarcassSpec, role: PanelRole, centerY: number): Panel {
  const t = CARCASS_THICKNESS_MM
  const inner = innerWidthMm(spec)
  return {
    id: role,
    role,
    materialId: spec.carcassMaterialId,
    lengthMm: inner,
    widthMm: spec.depthMm,
    thicknessMm: t,
    edgeBanding: bandOf(spec, ['length-1']),
    box: {
      center: { x: spec.widthMm / 2, y: centerY, z: spec.depthMm / 2 },
      size: { x: inner, y: t, z: spec.depthMm }
    }
  }
}

export function bottomPanel(spec: CarcassSpec): Panel {
  return horizontalPanel(spec, 'bottom', CARCASS_THICKNESS_MM / 2)
}

export function topPanel(spec: CarcassSpec): Panel {
  return horizontalPanel(spec, 'top', spec.heightMm - CARCASS_THICKNESS_MM / 2)
}

/** Two flat top stretchers between the sides; only the front one shows an edge. */
export function stretcherPanels(spec: CarcassSpec): Panel[] {
  const t = CARCASS_THICKNESS_MM
  const inner = innerWidthMm(spec)
  // The rear stretcher starts just in front of the back panel.
  const stretcherRearZ = interiorRearZMm()
  return (
    [
      ['stretcher-front', spec.depthMm - STRETCHER_WIDTH_MM / 2, bandOf(spec, ['length-1'])],
      ['stretcher-back', stretcherRearZ + STRETCHER_WIDTH_MM / 2, null]
    ] as const
  ).map(([role, centerZ, banding]) => ({
    id: role,
    role,
    materialId: spec.carcassMaterialId,
    lengthMm: inner,
    widthMm: STRETCHER_WIDTH_MM,
    thicknessMm: t,
    edgeBanding: banding,
    box: {
      center: { x: spec.widthMm / 2, y: spec.heightMm - t / 2, z: centerZ },
      size: { x: inner, y: t, z: STRETCHER_WIDTH_MM }
    }
  }))
}

/**
 * Back panel seated in a rebate: overlaps the sides, bottom and top members by
 * BACK_REBATE_OVERLAP_MM on every side, recessed BACK_RECESS_MM from the rear face.
 */
export function backPanel(spec: CarcassSpec): Panel {
  const bt = BACK_THICKNESS_MM
  const width = innerWidthMm(spec) + 2 * BACK_REBATE_OVERLAP_MM
  const height = interiorHeightMm(spec) + 2 * BACK_REBATE_OVERLAP_MM
  return {
    id: 'back',
    role: 'back',
    materialId: spec.backMaterialId,
    lengthMm: height,
    widthMm: width,
    thicknessMm: bt,
    edgeBanding: null,
    box: {
      center: { x: spec.widthMm / 2, y: spec.heightMm / 2, z: BACK_RECESS_MM + bt / 2 },
      size: { x: width, y: height, z: bt }
    }
  }
}

/**
 * A fixed horizontal member between the sides ("tussenbodem"), centred at
 * `centerYMm`: from the back panel's face to the carcass front, front edge
 * banded. It stops in front of the back, which runs on past it.
 */
export function fixedShelfPanel(spec: CarcassSpec, centerYMm: number): Panel {
  const t = CARCASS_THICKNESS_MM
  const inner = innerWidthMm(spec)
  const rearZ = interiorRearZMm()
  const depth = spec.depthMm - rearZ
  return {
    id: 'fixed-shelf',
    role: 'fixed-shelf',
    materialId: spec.carcassMaterialId,
    lengthMm: inner,
    widthMm: depth,
    thicknessMm: t,
    edgeBanding: bandOf(spec, ['length-1']),
    box: {
      center: { x: spec.widthMm / 2, y: centerYMm, z: rearZ + depth / 2 },
      size: { x: inner, y: t, z: depth }
    }
  }
}

/** Adjustable shelves spread evenly over `spanMm` of clear height from `bottomMm` up. */
function shelvesOver(spec: CarcassSpec, shelfCount: number, bottomMm: number, spanMm: number): Panel[] {
  const t = CARCASS_THICKNESS_MM
  const length = innerWidthMm(spec) - 2 * SHELF_SIDE_CLEARANCE_MM
  const depth = spec.depthMm - interiorRearZMm() - SHELF_REAR_CLEARANCE_MM - SHELF_FRONT_SETBACK_MM
  const rearZ = interiorRearZMm() + SHELF_REAR_CLEARANCE_MM
  const panels: Panel[] = []
  for (let i = 0; i < shelfCount; i += 1) {
    panels.push({
      id: `shelf-${i + 1}`,
      role: 'shelf',
      materialId: spec.carcassMaterialId,
      lengthMm: length,
      widthMm: depth,
      thicknessMm: t,
      edgeBanding: bandOf(spec, ['length-1']),
      box: {
        center: {
          x: spec.widthMm / 2,
          y: bottomMm + (spanMm * (i + 1)) / (shelfCount + 1),
          z: rearZ + depth / 2
        },
        size: { x: length, y: t, z: depth }
      }
    })
  }
  return panels
}

/** Adjustable shelves, evenly distributed over the interior height; front edge banded. */
export function shelfPanels(spec: CarcassSpec, shelfCount: number): Panel[] {
  return shelvesOver(spec, shelfCount, CARCASS_THICKNESS_MM, interiorHeightMm(spec))
}

/** Adjustable shelves, evenly distributed over the clear height between `bottomMm` and `topMm`. */
export function shelfPanelsBetween(
  spec: CarcassSpec,
  shelfCount: number,
  bottomMm: number,
  topMm: number
): Panel[] {
  return shelvesOver(spec, shelfCount, bottomMm, topMm - bottomMm)
}

/** A row of overlay doors over the carcass width, `doorHeight` tall and centred at `centerYMm`. */
function doorRow(spec: CarcassSpec, doorCount: number, centerYMm: number, doorHeight: number): Panel[] {
  const availableWidth = spec.widthMm - 2 * FRONT_REVEAL_MM
  const doorWidth = doorCount === 2 ? (availableWidth - FRONT_GAP_MM) / 2 : availableWidth
  const panels: Panel[] = []
  for (let i = 0; i < doorCount; i += 1) {
    const leftX = FRONT_REVEAL_MM + i * (doorWidth + FRONT_GAP_MM)
    panels.push({
      id: `door-${i + 1}`,
      role: 'door',
      materialId: spec.carcassMaterialId,
      lengthMm: doorHeight,
      widthMm: doorWidth,
      thicknessMm: DOOR_THICKNESS_MM,
      edgeBanding: bandOf(spec, ['length-1', 'length-2', 'width-1', 'width-2']),
      box: {
        center: {
          x: leftX + doorWidth / 2,
          y: centerYMm,
          z: spec.depthMm + DOOR_THICKNESS_MM / 2
        },
        size: { x: doorWidth, y: doorHeight, z: DOOR_THICKNESS_MM }
      }
    })
  }
  return panels
}

/** Full-height overlay doors covering the carcass front, all four edges banded. */
export function overlayDoorPanels(spec: CarcassSpec, doorCount: number): Panel[] {
  return doorRow(spec, doorCount, spec.heightMm / 2, spec.heightMm - 2 * FRONT_REVEAL_MM)
}

/** Overlay doors covering the carcass face from `bottomMm` up, `heightMm` tall (below a drawer). */
export function overlayDoorRow(
  spec: CarcassSpec,
  doorCount: number,
  bottomMm: number,
  heightMm: number
): Panel[] {
  return doorRow(spec, doorCount, bottomMm + heightMm / 2, heightMm)
}

// Provisional until the company's real list arrives.
/** Hinges per leaf, by door height; the first row the height fits into wins. */
export const HINGE_COUNT_BY_DOOR_HEIGHT: readonly {
  readonly maxDoorHeightMm: number
  readonly hinges: number
}[] = [
  { maxDoorHeightMm: 900, hinges: 2 },
  { maxDoorHeightMm: 1600, hinges: 3 },
  { maxDoorHeightMm: 2000, hinges: 4 }
]
const HINGES_ABOVE_TABLE = 5

/** Hinges one door leaf of this height hangs on (the kolomkast's table, shared since Phase 10). */
export function hingesPerDoor(doorHeightMm: number): number {
  const row = HINGE_COUNT_BY_DOOR_HEIGHT.find((entry) => doorHeightMm <= entry.maxDoorHeightMm)
  return row === undefined ? HINGES_ABOVE_TABLE : row.hinges
}

/** Hinges + handles for a row of doors (empty for an open cabinet). */
export function doorHardware(doorCount: number, hingesPerDoor: number): HardwareItem[] {
  if (doorCount <= 0) {
    return []
  }
  return [
    { materialId: HINGE_MATERIAL_ID, quantity: hingesPerDoor * doorCount },
    { materialId: HANDLE_MATERIAL_ID, quantity: HANDLES_PER_FRONT * doorCount }
  ]
}

/** One line per hardware material, quantities summed, in the order the materials first appear. */
export function mergeHardware(items: readonly HardwareItem[]): HardwareItem[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(item.materialId, (totals.get(item.materialId) ?? 0) + item.quantity)
  }
  return [...totals].map(([materialId, quantity]) => ({ materialId, quantity }))
}

/** Carcass envelope, grown by the overlay front thickness when fronts are present. */
export function boundingSizeWithFronts(spec: CarcassSpec, hasFronts: boolean): Size3 {
  return {
    x: spec.widthMm,
    y: spec.heightMm,
    z: spec.depthMm + (hasFronts ? DOOR_THICKNESS_MM : 0)
  }
}
