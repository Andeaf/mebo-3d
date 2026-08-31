import { validateBaseCabinetParams, type BaseCabinetParams } from '../cabinet'
import type { EdgeBanding, HardwareItem, Panel, PanelEdgeId } from '../panel'
import type { Size3 } from '../units'

/**
 * Parametric panel generation for the standard base kitchen cabinet
 * (frameless / European carcass construction).
 *
 * Coordinate system (cabinet space, mm):
 *   X = width (0 at the left outside face), Y = height (0 at the floor),
 *   Z = depth (0 at the rear outside face, +Z towards the room).
 *   Overlay doors sit in front of the carcass, at z > depth.
 */

export const CARCASS_THICKNESS_MM = 18
export const BACK_THICKNESS_MM = 3
export const DOOR_THICKNESS_MM = 18

/** Width of the two top stretchers that replace a full top panel. */
const STRETCHER_WIDTH_MM = 96
/** The back panel sits in a rebate and overlaps the surrounding panels by this much per side. */
const BACK_REBATE_OVERLAP_MM = 8
/** The back panel is seated this far in front of the rear face (rebate seat). */
const BACK_RECESS_MM = 1
const SHELF_SIDE_CLEARANCE_MM = 1
const SHELF_REAR_CLEARANCE_MM = 2
const SHELF_FRONT_SETBACK_MM = 20
/** Reveal around overlay doors (top, bottom and outer sides). */
const DOOR_REVEAL_MM = 2
/** Gap between the two doors of a double-door cabinet. */
const DOOR_GAP_MM = 3

const HINGES_PER_DOOR = 2
const HANDLES_PER_DOOR = 1
export const HINGE_MATERIAL_ID = 'hinge-standard'
export const HANDLE_MATERIAL_ID = 'handle-standard'

/**
 * The generated build is the single source of truth for one cabinet:
 * the 3D view, the cutting list and the price are all derived from it.
 */
export interface CabinetBuild {
  readonly panels: readonly Panel[]
  readonly hardware: readonly HardwareItem[]
  /** Overall bounding size including doors (mm). */
  readonly boundingSizeMm: Size3
}

export function generateBaseCabinet(params: BaseCabinetParams): CabinetBuild {
  const errors = validateBaseCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid base cabinet params: ${errors.join('; ')}`)
  }

  const { widthMm: w, heightMm: h, depthMm: d } = params
  const t = CARCASS_THICKNESS_MM
  const bt = BACK_THICKNESS_MM
  const innerWidth = w - 2 * t

  const band = (edges: readonly PanelEdgeId[]): EdgeBanding => ({
    materialId: params.edgeBandMaterialId,
    edges
  })

  const panels: Panel[] = []

  // Two full-height, full-depth sides; front edge banded.
  for (const [role, centerX] of [
    ['side-left', t / 2],
    ['side-right', w - t / 2]
  ] as const) {
    panels.push({
      id: role,
      role,
      materialId: params.carcassMaterialId,
      lengthMm: h,
      widthMm: d,
      thicknessMm: t,
      edgeBanding: band(['length-1']),
      box: {
        center: { x: centerX, y: h / 2, z: d / 2 },
        size: { x: t, y: h, z: d }
      }
    })
  }

  // Bottom fitted between the sides, full depth; front edge banded.
  panels.push({
    id: 'bottom',
    role: 'bottom',
    materialId: params.carcassMaterialId,
    lengthMm: innerWidth,
    widthMm: d,
    thicknessMm: t,
    edgeBanding: band(['length-1']),
    box: {
      center: { x: w / 2, y: t / 2, z: d / 2 },
      size: { x: innerWidth, y: t, z: d }
    }
  })

  if (params.topConstruction === 'panel') {
    // Full top panel between the sides; front edge banded.
    panels.push({
      id: 'top',
      role: 'top',
      materialId: params.carcassMaterialId,
      lengthMm: innerWidth,
      widthMm: d,
      thicknessMm: t,
      edgeBanding: band(['length-1']),
      box: {
        center: { x: w / 2, y: h - t / 2, z: d / 2 },
        size: { x: innerWidth, y: t, z: d }
      }
    })
  } else {
    // Two flat stretchers between the sides; only the front one shows an edge.
    const stretcherRearZ = BACK_RECESS_MM + bt // starts just in front of the back panel
    for (const [role, centerZ, banding] of [
      ['stretcher-front', d - STRETCHER_WIDTH_MM / 2, band(['length-1'])],
      ['stretcher-back', stretcherRearZ + STRETCHER_WIDTH_MM / 2, null]
    ] as const) {
      panels.push({
        id: role,
        role,
        materialId: params.carcassMaterialId,
        lengthMm: innerWidth,
        widthMm: STRETCHER_WIDTH_MM,
        thicknessMm: t,
        edgeBanding: banding,
        box: {
          center: { x: w / 2, y: h - t / 2, z: centerZ },
          size: { x: innerWidth, y: t, z: STRETCHER_WIDTH_MM }
        }
      })
    }
  }

  // Back panel seated in a rebate: overlaps the sides, bottom and top members
  // by BACK_REBATE_OVERLAP_MM on every side, recessed BACK_RECESS_MM from the rear face.
  const backWidth = innerWidth + 2 * BACK_REBATE_OVERLAP_MM
  const backHeight = h - 2 * t + 2 * BACK_REBATE_OVERLAP_MM
  panels.push({
    id: 'back',
    role: 'back',
    materialId: params.backMaterialId,
    lengthMm: backHeight,
    widthMm: backWidth,
    thicknessMm: bt,
    edgeBanding: null,
    box: {
      center: { x: w / 2, y: h / 2, z: BACK_RECESS_MM + bt / 2 },
      size: { x: backWidth, y: backHeight, z: bt }
    }
  })

  // Adjustable shelves, evenly distributed over the interior height; front edge banded.
  const shelfLength = innerWidth - 2 * SHELF_SIDE_CLEARANCE_MM
  const shelfDepth = d - (BACK_RECESS_MM + bt) - SHELF_REAR_CLEARANCE_MM - SHELF_FRONT_SETBACK_MM
  const shelfRearZ = BACK_RECESS_MM + bt + SHELF_REAR_CLEARANCE_MM
  const interiorHeight = h - 2 * t
  for (let i = 0; i < params.shelfCount; i += 1) {
    const centerY = t + (interiorHeight * (i + 1)) / (params.shelfCount + 1)
    panels.push({
      id: `shelf-${i + 1}`,
      role: 'shelf',
      materialId: params.carcassMaterialId,
      lengthMm: shelfLength,
      widthMm: shelfDepth,
      thicknessMm: t,
      edgeBanding: band(['length-1']),
      box: {
        center: { x: w / 2, y: centerY, z: shelfRearZ + shelfDepth / 2 },
        size: { x: shelfLength, y: t, z: shelfDepth }
      }
    })
  }

  // Overlay doors covering the carcass front, all four edges banded.
  const doorHeight = h - 2 * DOOR_REVEAL_MM
  const availableDoorWidth = w - 2 * DOOR_REVEAL_MM
  const doorWidth =
    params.doorCount === 2 ? (availableDoorWidth - DOOR_GAP_MM) / 2 : availableDoorWidth
  for (let i = 0; i < params.doorCount; i += 1) {
    const doorLeftX = DOOR_REVEAL_MM + i * (doorWidth + DOOR_GAP_MM)
    panels.push({
      id: `door-${i + 1}`,
      role: 'door',
      materialId: params.carcassMaterialId,
      lengthMm: doorHeight,
      widthMm: doorWidth,
      thicknessMm: DOOR_THICKNESS_MM,
      edgeBanding: band(['length-1', 'length-2', 'width-1', 'width-2']),
      box: {
        center: { x: doorLeftX + doorWidth / 2, y: h / 2, z: d + DOOR_THICKNESS_MM / 2 },
        size: { x: doorWidth, y: doorHeight, z: DOOR_THICKNESS_MM }
      }
    })
  }

  const hardware: HardwareItem[] = []
  if (params.doorCount > 0) {
    hardware.push({ materialId: HINGE_MATERIAL_ID, quantity: HINGES_PER_DOOR * params.doorCount })
    hardware.push({ materialId: HANDLE_MATERIAL_ID, quantity: HANDLES_PER_DOOR * params.doorCount })
  }

  return {
    panels,
    hardware,
    boundingSizeMm: {
      x: w,
      y: h,
      z: d + (params.doorCount > 0 ? DOOR_THICKNESS_MM : 0)
    }
  }
}
