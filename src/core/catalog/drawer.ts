import type { EdgeBanding, HardwareItem, Panel, PanelEdgeId } from '../panel'
import {
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  FRONT_REVEAL_MM,
  HANDLE_MATERIAL_ID
} from './parts'

/**
 * One drawer: an overlay front plus a four-sided box with a grooved-in HDF
 * bottom, running on a pair of slides, with one handle. This is the drawer's
 * chapter of the shared construction pieces (`parts.ts` holds the carcass
 * members): whatever holds a drawer builds it here, so a drawer is the same
 * drawer wherever it stands.
 *
 * Cabinet space as in `parts.ts`. The front stands on the carcass face, in
 * the overlay zone z ∈ [depth, depth + 18]; the box runs back from that face
 * by the slide length and sits in the bay between the members its slides are
 * screwed to.
 */

// Provisional until the company's real list arrives.
export const DRAWER_SLIDE_MATERIAL_ID = 'drawer-slide-pair'
/** Air per side between the drawer box and the carcass, for the slide. */
const DRAWER_SLIDE_CLEARANCE_MM = 13
/** Space kept free behind the box; the slide length is what fits in front of it. */
const DRAWER_SLIDE_REAR_CLEARANCE_MM = 20
/** Slides come in 50 mm nominal lengths, from the shortest to the longest stocked one. */
const DRAWER_SLIDE_LENGTH_STEP_MM = 50
const DRAWER_SLIDE_LENGTH_MIN_MM = 250
const DRAWER_SLIDE_LENGTH_MAX_MM = 650
/** A drawer side is this much lower than its front, within the stocked range. */
const DRAWER_SIDE_HEIGHT_DROP_MM = 50
const DRAWER_SIDE_HEIGHT_MIN_MM = 60
const DRAWER_SIDE_HEIGHT_MAX_MM = 180
/** The box bottom rides this high above its front's bottom edge. */
const DRAWER_BOX_LIFT_MM = 20
/** The bottom is grooved this deep into all four box parts. */
const DRAWER_BOTTOM_GROOVE_MM = 6

/**
 * The lowest front whose box still clears an 18 mm top member when it is the
 * top drawer under the 2 mm reveal: lift + the lowest stocked side + the
 * member − the reveal = 96 mm. Every legal ladekast's equal front (at least
 * 96.75: 400 mm high, 4 drawers) lies above it.
 */
export const DRAWER_FRONT_MIN_HEIGHT_MM =
  DRAWER_BOX_LIFT_MM + DRAWER_SIDE_HEIGHT_MIN_MM + CARCASS_THICKNESS_MM - FRONT_REVEAL_MM

/** The shallowest carcass a drawer runs in: the shortest slide plus the rear clearance (270 mm). */
export const DRAWER_MIN_CARCASS_DEPTH_MM =
  DRAWER_SLIDE_LENGTH_MIN_MM + DRAWER_SLIDE_REAR_CLEARANCE_MM

/**
 * How far a full-overlay front reaches past the bay on each side: over an
 * 18 mm member, less the 2 mm reveal. Every catalog front stands so on its
 * carcass; a custom-piece drawer derives its bay from its front with it.
 */
export const DRAWER_FRONT_OVERLAY_MM = CARCASS_THICKNESS_MM - FRONT_REVEAL_MM

/** The overlay front of one drawer on the carcass face (mm). */
export interface DrawerFront {
  readonly centerXMm: number
  readonly bottomMm: number
  readonly widthMm: number
  readonly heightMm: number
}

/** Where one drawer goes. */
export interface DrawerOpening {
  /** 1-based; names the parts `drawer-front-<n>` and `drawer-<n>-box-left|right|front|back|bottom`. */
  readonly number: number
  readonly front: DrawerFront
  /**
   * The clear width between the members the slides mount on, and its centre:
   * the box is this minus a slide clearance per side, centred in it.
   */
  readonly bayWidthMm: number
  readonly bayCenterXMm: number
  /** The carcass face the front covers; the box runs back from it. */
  readonly carcassDepthMm: number
}

export interface DrawerMaterials {
  readonly frontMaterialId: string
  /** Box sides, box front and box back. */
  readonly boxMaterialId: string
  readonly bottomMaterialId: string
  readonly edgeBandMaterialId: string
}

export interface DrawerBuild {
  readonly panels: readonly Panel[]
  readonly hardware: readonly HardwareItem[]
}

/**
 * Nominal slide length: what fits in front of the rear clearance, rounded
 * down to a stocked size, and never longer than the longest one. Callers
 * keep the carcass at least DRAWER_MIN_CARCASS_DEPTH_MM deep (every catalog
 * kind does: 300 mm gives the shortest slide, 700 mm the longest).
 */
export function drawerSlideLengthMm(carcassDepthMm: number): number {
  return Math.min(
    DRAWER_SLIDE_LENGTH_MAX_MM,
    Math.floor((carcassDepthMm - DRAWER_SLIDE_REAR_CLEARANCE_MM) / DRAWER_SLIDE_LENGTH_STEP_MM) *
      DRAWER_SLIDE_LENGTH_STEP_MM
  )
}

export function drawerBoxSideHeightMm(frontHeightMm: number): number {
  return Math.min(
    DRAWER_SIDE_HEIGHT_MAX_MM,
    Math.max(DRAWER_SIDE_HEIGHT_MIN_MM, frontHeightMm - DRAWER_SIDE_HEIGHT_DROP_MM)
  )
}

const BOX_PARTS = ['left', 'right', 'front', 'back', 'bottom'] as const
const PART_ID_PATTERN = new RegExp(
  `^drawer-(?:front-([1-9][0-9]*)|([1-9][0-9]*)-box-(?:${BOX_PARTS.join('|')}))$`
)

/** The drawer a generated part belongs to (`drawer-front-3`, `drawer-3-box-left` → 3); null for any other id. */
export function drawerNumberOfPart(panelId: string): number | null {
  const match = PART_ID_PATTERN.exec(panelId)
  if (match === null) {
    return null
  }
  return Number(match[1] ?? match[2])
}

/** Drawer opening → the front and the box's five parts, plus one slide pair and one handle. */
export function buildDrawer(opening: DrawerOpening, materials: DrawerMaterials): DrawerBuild {
  const t = CARCASS_THICKNESS_MM
  const { number, front } = opening
  const frontHeight = front.heightMm
  const frontBottomY = front.bottomMm
  const band = (edges: readonly PanelEdgeId[]): EdgeBanding => ({
    materialId: materials.edgeBandMaterialId,
    edges
  })

  const boxDepth = drawerSlideLengthMm(opening.carcassDepthMm)
  const boxOuterWidth = opening.bayWidthMm - 2 * DRAWER_SLIDE_CLEARANCE_MM
  const boxInnerWidth = boxOuterWidth - 2 * t
  const sideHeight = drawerBoxSideHeightMm(frontHeight)
  const boxBottomY = frontBottomY + DRAWER_BOX_LIFT_MM
  const boxCenterY = boxBottomY + sideHeight / 2
  // The box runs forward from the rear clearance to the carcass front face.
  const boxFrontZ = opening.carcassDepthMm
  const boxRearZ = boxFrontZ - boxDepth

  const panels: Panel[] = [
    {
      id: `drawer-front-${number}`,
      role: 'drawer-front',
      materialId: materials.frontMaterialId,
      lengthMm: frontHeight,
      widthMm: front.widthMm,
      thicknessMm: DOOR_THICKNESS_MM,
      edgeBanding: band(['length-1', 'length-2', 'width-1', 'width-2']),
      box: {
        center: {
          x: front.centerXMm,
          y: frontBottomY + frontHeight / 2,
          z: opening.carcassDepthMm + DOOR_THICKNESS_MM / 2
        },
        size: { x: front.widthMm, y: frontHeight, z: DOOR_THICKNESS_MM }
      }
    }
  ]

  // Box sides run the full box depth; top edge banded.
  for (const [side, centerX] of [
    ['left', opening.bayCenterXMm - (boxOuterWidth - t) / 2],
    ['right', opening.bayCenterXMm + (boxOuterWidth - t) / 2]
  ] as const) {
    panels.push({
      id: `drawer-${number}-box-${side}`,
      role: 'drawer-box-side',
      materialId: materials.boxMaterialId,
      lengthMm: boxDepth,
      widthMm: sideHeight,
      thicknessMm: t,
      edgeBanding: band(['length-1']),
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
      materialId: materials.boxMaterialId,
      lengthMm: boxInnerWidth,
      widthMm: sideHeight,
      thicknessMm: t,
      edgeBanding: band(['length-1']),
      box: {
        center: { x: opening.bayCenterXMm, y: boxCenterY, z: centerZ },
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
    materialId: materials.bottomMaterialId,
    lengthMm: bottomWidth,
    widthMm: bottomDepth,
    thicknessMm: BACK_THICKNESS_MM,
    edgeBanding: null,
    box: {
      center: {
        x: opening.bayCenterXMm,
        y: boxBottomY + BACK_THICKNESS_MM / 2,
        z: boxRearZ + boxDepth / 2
      },
      size: { x: bottomWidth, y: BACK_THICKNESS_MM, z: bottomDepth }
    }
  })

  return {
    panels,
    hardware: [
      { materialId: DRAWER_SLIDE_MATERIAL_ID, quantity: 1 },
      { materialId: HANDLE_MATERIAL_ID, quantity: 1 }
    ]
  }
}
