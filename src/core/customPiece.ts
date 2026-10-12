import { clampToLimit, limitViolations, type NumericLimit } from './cabinet'
import {
  buildDrawer,
  drawerNumberOfPart,
  DRAWER_FRONT_MIN_HEIGHT_MM,
  DRAWER_FRONT_OVERLAY_MM,
  DRAWER_MIN_CARCASS_DEPTH_MM,
  type DrawerOpening
} from './catalog/drawer'
import {
  mergeHardware,
  BACK_REBATE_OVERLAP_MM,
  BACK_RECESS_MM,
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM,
  SHELF_FRONT_SETBACK_MM,
  SHELF_REAR_CLEARANCE_MM,
  SHELF_SIDE_CLEARANCE_MM,
  type CabinetBuild
} from './catalog/parts'
// Type-only on purpose: footprint.ts reaches this module at runtime through
// the registry, so a value import here would close a runtime cycle.
import type { FootprintSize, VerticalExtentMm } from './footprint'
import {
  PANEL_EDGE_IDS,
  type EdgeBanding,
  type HardwareItem,
  type Panel,
  type PanelRole
} from './panel'
import type { Box3, Size3, Vec2, Vec3 } from './units'

/**
 * Maatwerk — a custom piece of furniture that exists in no catalog: an
 * envelope plus a hand-built list of panels and a list of hardware. It is the
 * second design family beside the registry kinds (see `registry.ts`): its
 * spec is structured data, so it cannot be a registry kind (those params must
 * stay total and scalar for the template decoder) and it gets its own strict
 * decoder in `project.ts` instead.
 *
 * The spec stores each panel as its CUT piece (the `Panel` fields that price
 * it) plus where it stands: `orientation` names the axis-aligned plane the
 * face lies in and `originMm` its left/bottom/rear corner in piece space. The
 * box the renderer draws is derived from those, never stored — one
 * representation, one derivation, exactly like every catalog generator.
 *
 * Piece space is cabinet space: X = width, Y = height, Z = depth, y = 0 at the
 * piece's own bottom however high it hangs. The envelope is the CARCASS box
 * `W × H × D`; like overlay doors in the catalog, a front may stand in front
 * of it in the overlay zone `z ∈ [D, D + FRONT_OVERLAY_ZONE_MM]`, which the
 * footprint excludes so that a custom piece in a run aligns carcass fronts
 * with its neighbours and its doors end up flush with theirs.
 *
 * Beside its panels a piece holds drawers (Phase 10), each ONE element: the
 * spec stores where its overlay front sits on the carcass face and how big
 * it is; the box, its slides and its handle are derived at build time by the
 * shared drawer construction (`catalog/drawer.ts`), exactly as in the
 * ladekast. Panels and drawers are the piece's two element families.
 */

export const CUSTOM_PIECE_KIND = 'custom-piece' as const
export type CustomPieceKind = typeof CUSTOM_PIECE_KIND

/**
 * The plane a panel's face lies in. Cut dimensions map to axes the way every
 * catalog generator already does it:
 *   yz (sides, dividers):        length → Y, width → Z, thickness → X
 *   xz (tops, bottoms, shelves): length → X, width → Z, thickness → Y
 *   xy (backs, fronts):          length → Y, width → X, thickness → Z
 */
export type PanelOrientation = 'yz' | 'xz' | 'xy'
export const PANEL_ORIENTATIONS: readonly PanelOrientation[] = ['yz', 'xz', 'xy']

/** The roles the editor can label; a file with any other role on a custom panel is refused. */
export type CustomPanelRole = Extract<
  PanelRole,
  'side-left' | 'side-right' | 'top' | 'bottom' | 'shelf' | 'divider' | 'back' | 'front'
>
export const CUSTOM_PANEL_ROLES: readonly CustomPanelRole[] = [
  'side-left',
  'side-right',
  'top',
  'bottom',
  'shelf',
  'divider',
  'back',
  'front'
]

export interface CustomPanelSpec {
  /** `panel-<n>`, unique within the piece. */
  readonly id: string
  readonly role: CustomPanelRole
  readonly materialId: string
  readonly lengthMm: number
  readonly widthMm: number
  readonly thicknessMm: number
  readonly edgeBanding: EdgeBanding | null
  readonly orientation: PanelOrientation
  /** Left/bottom/rear corner of the panel in piece space (mm). */
  readonly originMm: Vec3
}

/**
 * A drawer of a custom piece: its overlay front on the carcass face. Where
 * the front stands and how big it is are all the spec says; the box behind
 * it (full-overlay relation: the bay is the front less 16 mm per side), its
 * depth (the slide that fits the envelope), one pair of slides and one
 * handle are derived — so a drawer moves, resizes and disappears as a whole.
 */
export interface CustomDrawerSpec {
  /** `drawer-<n>`, unique among the piece's drawers. */
  readonly id: string
  /** The front's left/bottom corner on the carcass face (piece space); it stands in the overlay zone. */
  readonly originMm: Vec2
  /** The front's width and height. */
  readonly widthMm: number
  readonly heightMm: number
  readonly frontMaterialId: string
  /** Box sides, box front and box back. */
  readonly boxMaterialId: string
  readonly bottomMaterialId: string
  readonly edgeBandMaterialId: string
}

export interface CustomPieceSpec {
  /** Shown in the scene list and the readout; may be empty (the UI shows the kind label then). */
  readonly name: string
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  /** Height of the piece's bottom above the floor; 0 = it stands on the floor. */
  readonly mountingHeightMm: number
  readonly panels: readonly CustomPanelSpec[]
  readonly drawers: readonly CustomDrawerSpec[]
  readonly hardware: readonly HardwareItem[]
}

export interface CustomPieceDesign {
  readonly kind: CustomPieceKind
  readonly spec: CustomPieceSpec
}

// Provisional until the company's real list arrives.
export const CUSTOM_PIECE_LIMITS = {
  widthMm: { min: 100, max: 4000 },
  heightMm: { min: 100, max: 3000 },
  depthMm: { min: 100, max: 1000 },
  mountingHeightMm: { min: 0, max: 2200 },
  panelSizeMm: { min: 10, max: 4000 },
  panelThicknessMm: { min: 1, max: 60 },
  hardwareQuantity: { min: 1, max: 999 }
} as const
export const MAX_PANELS_PER_PIECE = 60
export const MAX_PIECE_NAME_LENGTH = 60
/** A drawer's front: from the narrowest useful box to the widest slide load, and a sane height. */
export const CUSTOM_DRAWER_LIMITS = {
  widthMm: { min: 150, max: 1200 },
  heightMm: { min: DRAWER_FRONT_MIN_HEIGHT_MM, max: 600 }
} as const
export const MAX_DRAWERS_PER_PIECE = 12
/** How far a front may stand in front of the envelope: one overlay front. */
export const FRONT_OVERLAY_ZONE_MM = DOOR_THICKNESS_MM

/** Editor defaults (a starting point, not a construction rule). */
export const DEFAULT_WALL_MOUNTING_HEIGHT_MM = 1450
export const CUSTOM_PIECE_DEFAULT_MATERIALS = {
  board: 'melamine-white-18',
  back: 'hdf-back-3',
  edgeBand: 'abs-edge'
} as const

export function createDefaultCustomPieceSpec(name = ''): CustomPieceSpec {
  return {
    name,
    widthMm: 1200,
    heightMm: 600,
    depthMm: 400,
    mountingHeightMm: 0,
    panels: [],
    drawers: [],
    hardware: []
  }
}

// ---------------------------------------------------------------------------
// Ids

const PANEL_ID_PATTERN = /^panel-([1-9][0-9]*)$/

/** The `<n>` of a `panel-<n>` id, or null when the id has another shape. */
export function panelNumberOf(id: string): number | null {
  const match = PANEL_ID_PATTERN.exec(id)
  return match === null ? null : Number(match[1])
}

/** One above the highest `panel-<n>` in the piece (1 for an empty piece). */
export function nextPanelNumberFor(spec: CustomPieceSpec): number {
  let highest = 0
  for (const panel of spec.panels) {
    const number = panelNumberOf(panel.id)
    if (number !== null && number > highest) {
      highest = number
    }
  }
  return highest + 1
}

const DRAWER_ID_PATTERN = /^drawer-([1-9][0-9]*)$/

/** The `<n>` of a `drawer-<n>` id, or null when the id has another shape. */
export function drawerNumberOf(id: string): number | null {
  const match = DRAWER_ID_PATTERN.exec(id)
  return match === null ? null : Number(match[1])
}

/** One above the highest `drawer-<n>` in the piece (1 without drawers). Its own sequence beside the panels'. */
export function nextDrawerNumberFor(spec: CustomPieceSpec): number {
  let highest = 0
  for (const drawer of spec.drawers) {
    const number = drawerNumberOf(drawer.id)
    if (number !== null && number > highest) {
      highest = number
    }
  }
  return highest + 1
}

// ---------------------------------------------------------------------------
// Geometry

type Axis = 'x' | 'y' | 'z'
const AXES: readonly Axis[] = ['x', 'y', 'z']
/** An axis of piece space (the gizmo and the arrow keys move elements along these). */
export type PieceAxis = Axis

export interface AxisMap {
  readonly length: Axis
  readonly width: Axis
  readonly thickness: Axis
}

/** Which piece axis each cut dimension runs along (see `PanelOrientation`). */
export function axesOf(orientation: PanelOrientation): AxisMap {
  switch (orientation) {
    case 'yz':
      return { length: 'y', width: 'z', thickness: 'x' }
    case 'xz':
      return { length: 'x', width: 'z', thickness: 'y' }
    case 'xy':
      return { length: 'y', width: 'x', thickness: 'z' }
  }
}

export function withAxis(vector: Vec3, axis: Axis, value: number): Vec3 {
  switch (axis) {
    case 'x':
      return { x: value, y: vector.y, z: vector.z }
    case 'y':
      return { x: vector.x, y: value, z: vector.z }
    case 'z':
      return { x: vector.x, y: vector.y, z: value }
  }
}

type PanelShape = Pick<CustomPanelSpec, 'lengthMm' | 'widthMm' | 'thicknessMm' | 'orientation'>

/** The panel's box size in piece space: cut dimensions laid along their axes. */
export function panelBoxSize(panel: PanelShape): Size3 {
  const axes = axesOf(panel.orientation)
  let size: Vec3 = { x: 0, y: 0, z: 0 }
  size = withAxis(size, axes.length, panel.lengthMm)
  size = withAxis(size, axes.width, panel.widthMm)
  size = withAxis(size, axes.thickness, panel.thicknessMm)
  return size
}

export interface PanelExtent {
  readonly min: Vec3
  readonly max: Vec3
}

export function panelExtent(panel: PanelShape & Pick<CustomPanelSpec, 'originMm'>): PanelExtent {
  const size = panelBoxSize(panel)
  const { originMm: origin } = panel
  return {
    min: origin,
    max: { x: origin.x + size.x, y: origin.y + size.y, z: origin.z + size.z }
  }
}

/** The render/placement box: `Box3` is centre-based, the spec is corner-based. */
export function panelBox(panel: PanelShape & Pick<CustomPanelSpec, 'originMm'>): Box3 {
  const size = panelBoxSize(panel)
  const { originMm: origin } = panel
  return {
    center: { x: origin.x + size.x / 2, y: origin.y + size.y / 2, z: origin.z + size.z / 2 },
    size
  }
}

/** The space a panel may occupy: the envelope plus the overlay zone in front. */
export function panelSpace(spec: Pick<CustomPieceSpec, 'widthMm' | 'heightMm' | 'depthMm'>): Size3 {
  return { x: spec.widthMm, y: spec.heightMm, z: spec.depthMm + FRONT_OVERLAY_ZONE_MM }
}

/** The most a panel's fields may be, given the envelope and its own current size (for the editor's sliders). */
export interface PanelRanges {
  readonly lengthMaxMm: number
  readonly widthMaxMm: number
  readonly originMaxMm: Vec3
}

export function panelRanges(
  spec: Pick<CustomPieceSpec, 'widthMm' | 'heightMm' | 'depthMm'>,
  panel: PanelShape & Pick<CustomPanelSpec, 'originMm'>
): PanelRanges {
  const space = panelSpace(spec)
  const axes = axesOf(panel.orientation)
  const size = panelBoxSize(panel)
  const limit = CUSTOM_PIECE_LIMITS.panelSizeMm.max
  return {
    lengthMaxMm: Math.min(limit, space[axes.length]),
    widthMaxMm: Math.min(limit, space[axes.width]),
    originMaxMm: {
      x: Math.max(0, space.x - size.x),
      y: Math.max(0, space.y - size.y),
      z: Math.max(0, space.z - size.z)
    }
  }
}

export interface EnvelopeLimits {
  readonly widthMm: NumericLimit
  readonly heightMm: NumericLimit
  readonly depthMm: NumericLimit
}

/**
 * The envelope's ranges for this spec. While the piece holds drawers it stays
 * wide enough for the narrowest drawer front and deep enough for the shortest
 * slide, so no envelope edit can leave a drawer without room (the sliders stop).
 */
export function customPieceEnvelopeLimits(spec: Pick<CustomPieceSpec, 'drawers'>): EnvelopeLimits {
  const limits = CUSTOM_PIECE_LIMITS
  if (spec.drawers.length === 0) {
    return { widthMm: limits.widthMm, heightMm: limits.heightMm, depthMm: limits.depthMm }
  }
  return {
    widthMm: {
      min: Math.max(limits.widthMm.min, CUSTOM_DRAWER_LIMITS.widthMm.min),
      max: limits.widthMm.max
    },
    heightMm: {
      min: Math.max(limits.heightMm.min, CUSTOM_DRAWER_LIMITS.heightMm.min),
      max: limits.heightMm.max
    },
    depthMm: {
      min: Math.max(limits.depthMm.min, DRAWER_MIN_CARCASS_DEPTH_MM),
      max: limits.depthMm.max
    }
  }
}

// ---------------------------------------------------------------------------
// Validation (used by the file decoder; the editor clamps instead)

function isFiniteVec3(vector: Vec3): boolean {
  return AXES.every((axis) => Number.isFinite(vector[axis]))
}

const DRAWER_MATERIAL_FIELDS = [
  'frontMaterialId',
  'boxMaterialId',
  'bottomMaterialId',
  'edgeBandMaterialId'
] as const

function validateDrawer(
  drawer: CustomDrawerSpec,
  index: number,
  face: Pick<CustomPieceSpec, 'widthMm' | 'heightMm'>,
  seenIds: Map<string, number>
): string[] {
  const path = `drawers[${index}]`
  const limits = CUSTOM_DRAWER_LIMITS
  const errors: string[] = []

  if (drawerNumberOf(drawer.id) === null) {
    errors.push(`${path}.id must look like drawer-<n> (got ${JSON.stringify(drawer.id)})`)
  }
  const first = seenIds.get(drawer.id)
  if (first !== undefined) {
    errors.push(`${path}.id is a duplicate of drawers[${first}].id (${drawer.id})`)
  } else {
    seenIds.set(drawer.id, index)
  }
  for (const field of DRAWER_MATERIAL_FIELDS) {
    if (drawer[field].length === 0) {
      errors.push(`${path}.${field} must not be empty`)
    }
  }
  const sizeErrors = limitViolations([
    [`${path}.widthMm`, drawer.widthMm, limits.widthMm],
    [`${path}.heightMm`, drawer.heightMm, limits.heightMm]
  ])
  errors.push(...sizeErrors)
  const originFinite = Number.isFinite(drawer.originMm.x) && Number.isFinite(drawer.originMm.y)
  if (!originFinite) {
    errors.push(`${path}.originMm must hold finite numbers`)
  }
  // The front on the face. The box then fits by construction: it is narrower
  // than the front, its top stays at least 16 mm below the front's top edge
  // (30 mm from a 110 mm front up), and it is at most the envelope depth − 20
  // deep.
  if (sizeErrors.length === 0 && originFinite) {
    for (const [axis, size, extent] of [
      ['x', drawer.widthMm, face.widthMm],
      ['y', drawer.heightMm, face.heightMm]
    ] as const) {
      const from = drawer.originMm[axis]
      const to = from + size
      if (from < 0 || to > extent) {
        errors.push(`${path} lies outside the front face on ${axis} (${from}–${to} vs 0–${extent})`)
      }
    }
  }
  return errors
}

function validatePanel(
  panel: CustomPanelSpec,
  index: number,
  space: Size3,
  seenIds: Map<string, number>
): string[] {
  const path = `panels[${index}]`
  const limits = CUSTOM_PIECE_LIMITS
  const errors: string[] = []

  if (panelNumberOf(panel.id) === null) {
    errors.push(`${path}.id must look like panel-<n> (got ${JSON.stringify(panel.id)})`)
  }
  const first = seenIds.get(panel.id)
  if (first !== undefined) {
    errors.push(`${path}.id is a duplicate of panels[${first}].id (${panel.id})`)
  } else {
    seenIds.set(panel.id, index)
  }
  if (!CUSTOM_PANEL_ROLES.includes(panel.role)) {
    errors.push(`${path}.role must be one of ${CUSTOM_PANEL_ROLES.join(', ')} (got ${panel.role})`)
  }
  const orientationKnown = PANEL_ORIENTATIONS.includes(panel.orientation)
  if (!orientationKnown) {
    errors.push(
      `${path}.orientation must be one of ${PANEL_ORIENTATIONS.join(', ')} (got ${panel.orientation})`
    )
  }
  if (panel.materialId.length === 0) {
    errors.push(`${path}.materialId must not be empty`)
  }
  const sizeErrors = limitViolations([
    [`${path}.lengthMm`, panel.lengthMm, limits.panelSizeMm],
    [`${path}.widthMm`, panel.widthMm, limits.panelSizeMm],
    [`${path}.thicknessMm`, panel.thicknessMm, limits.panelThicknessMm]
  ])
  errors.push(...sizeErrors)
  const originFinite = isFiniteVec3(panel.originMm)
  if (!originFinite) {
    errors.push(`${path}.originMm must hold finite numbers`)
  }
  if (orientationKnown && sizeErrors.length === 0 && originFinite) {
    const { min, max } = panelExtent(panel)
    for (const axis of AXES) {
      if (min[axis] < 0 || max[axis] > space[axis]) {
        errors.push(
          `${path} lies outside the envelope on ${axis} (${min[axis]}–${max[axis]} vs 0–${space[axis]})`
        )
      }
    }
  }
  const banding = panel.edgeBanding
  if (banding !== null) {
    if (banding.materialId.length === 0) {
      errors.push(`${path}.edgeBanding.materialId must not be empty`)
    }
    if (banding.edges.length === 0) {
      errors.push(`${path}.edgeBanding.edges must name at least one edge (use null for no banding)`)
    }
    const seenEdges = new Set<string>()
    for (const edge of banding.edges) {
      if (!PANEL_EDGE_IDS.includes(edge)) {
        errors.push(
          `${path}.edgeBanding.edges must only hold ${PANEL_EDGE_IDS.join(', ')} (got ${edge})`
        )
      } else if (seenEdges.has(edge)) {
        errors.push(`${path}.edgeBanding.edges lists ${edge} twice`)
      }
      seenEdges.add(edge)
    }
  }
  return errors
}

/** Returns a list of violations (empty when the spec is valid). Messages are relative to the spec. */
export function validateCustomPieceSpec(spec: CustomPieceSpec): string[] {
  const limits = CUSTOM_PIECE_LIMITS
  const errors = limitViolations([
    ['widthMm', spec.widthMm, limits.widthMm],
    ['heightMm', spec.heightMm, limits.heightMm],
    ['depthMm', spec.depthMm, limits.depthMm],
    ['mountingHeightMm', spec.mountingHeightMm, limits.mountingHeightMm]
  ])
  if (spec.name.length > MAX_PIECE_NAME_LENGTH) {
    errors.push(
      `name must be at most ${MAX_PIECE_NAME_LENGTH} characters (got ${spec.name.length})`
    )
  }
  if (spec.panels.length > MAX_PANELS_PER_PIECE) {
    errors.push(`panels must hold at most ${MAX_PANELS_PER_PIECE} panels (got ${spec.panels.length})`)
  }
  const space = panelSpace(spec)
  const seenIds = new Map<string, number>()
  spec.panels.forEach((panel, index) => {
    errors.push(...validatePanel(panel, index, space, seenIds))
  })
  if (spec.drawers.length > MAX_DRAWERS_PER_PIECE) {
    errors.push(
      `drawers must hold at most ${MAX_DRAWERS_PER_PIECE} drawers (got ${spec.drawers.length})`
    )
  }
  if (spec.drawers.length > 0 && spec.depthMm < DRAWER_MIN_CARCASS_DEPTH_MM) {
    errors.push(
      `depthMm must be at least ${DRAWER_MIN_CARCASS_DEPTH_MM} while the piece has drawers (got ${spec.depthMm})`
    )
  }
  const seenDrawerIds = new Map<string, number>()
  spec.drawers.forEach((drawer, index) => {
    errors.push(...validateDrawer(drawer, index, spec, seenDrawerIds))
  })
  const seenHardware = new Set<string>()
  spec.hardware.forEach((item, index) => {
    const path = `hardware[${index}]`
    if (item.materialId.length === 0) {
      errors.push(`${path}.materialId must not be empty`)
    } else if (seenHardware.has(item.materialId)) {
      errors.push(`${path}.materialId is a duplicate (${item.materialId})`)
    }
    seenHardware.add(item.materialId)
    const { min, max } = limits.hardwareQuantity
    if (!Number.isInteger(item.quantity) || item.quantity < min || item.quantity > max) {
      errors.push(`${path}.quantity must be an integer between ${min} and ${max} (got ${item.quantity})`)
    }
  })
  return errors
}

// ---------------------------------------------------------------------------
// Clamping (used by the editor on every edit; never by the file decoder)

/**
 * Forces a panel into `space`: cut sizes are limited by the extent of the axis
 * they run along, then the origin by what is left. A panel can therefore
 * never leave the envelope, and shrinking the envelope pulls the panels in
 * with it.
 */
function clampPanelInto(space: Size3, panel: CustomPanelSpec): CustomPanelSpec {
  const limits = CUSTOM_PIECE_LIMITS
  const axes = axesOf(panel.orientation)
  const thicknessMm = clampToLimit(panel.thicknessMm, limits.panelThicknessMm)
  const lengthMm = clampToLimit(panel.lengthMm, {
    min: limits.panelSizeMm.min,
    max: Math.min(limits.panelSizeMm.max, space[axes.length])
  })
  const widthMm = clampToLimit(panel.widthMm, {
    min: limits.panelSizeMm.min,
    max: Math.min(limits.panelSizeMm.max, space[axes.width])
  })
  const size = panelBoxSize({ lengthMm, widthMm, thicknessMm, orientation: panel.orientation })
  let originMm = panel.originMm
  for (const axis of AXES) {
    originMm = withAxis(
      originMm,
      axis,
      clampToLimit(originMm[axis], { min: 0, max: space[axis] - size[axis] })
    )
  }
  return { ...panel, lengthMm, widthMm, thicknessMm, originMm }
}

/**
 * Forces a drawer's front onto the face: its size by the face (and the drawer
 * limits), then its origin by what is left. Whole millimetres.
 */
function clampDrawerInto(
  face: Pick<CustomPieceSpec, 'widthMm' | 'heightMm'>,
  drawer: CustomDrawerSpec
): CustomDrawerSpec {
  const limits = CUSTOM_DRAWER_LIMITS
  const widthMm = clampToLimit(drawer.widthMm, {
    min: limits.widthMm.min,
    max: Math.min(limits.widthMm.max, face.widthMm)
  })
  const heightMm = clampToLimit(drawer.heightMm, {
    min: limits.heightMm.min,
    max: Math.min(limits.heightMm.max, face.heightMm)
  })
  return {
    ...drawer,
    widthMm,
    heightMm,
    originMm: {
      x: clampToLimit(drawer.originMm.x, { min: 0, max: face.widthMm - widthMm }),
      y: clampToLimit(drawer.originMm.y, { min: 0, max: face.heightMm - heightMm })
    }
  }
}

/** Forces every numeric field into range, every panel into the envelope and every drawer onto its face. */
export function clampCustomPieceSpec(spec: CustomPieceSpec): CustomPieceSpec {
  const limits = CUSTOM_PIECE_LIMITS
  const envelopeLimits = customPieceEnvelopeLimits(spec)
  const envelope = {
    widthMm: clampToLimit(spec.widthMm, envelopeLimits.widthMm),
    heightMm: clampToLimit(spec.heightMm, envelopeLimits.heightMm),
    depthMm: clampToLimit(spec.depthMm, envelopeLimits.depthMm)
  }
  const space = panelSpace(envelope)
  return {
    ...spec,
    name: spec.name.slice(0, MAX_PIECE_NAME_LENGTH),
    ...envelope,
    mountingHeightMm: clampToLimit(spec.mountingHeightMm, limits.mountingHeightMm),
    panels: spec.panels.map((panel) => clampPanelInto(space, panel)),
    drawers: spec.drawers.map((drawer) => clampDrawerInto(envelope, drawer)),
    hardware: spec.hardware.map((item) => ({
      materialId: item.materialId,
      quantity: clampToLimit(item.quantity, limits.hardwareQuantity)
    }))
  }
}

/**
 * A panel whose far edge lies within this of an envelope face is "attached"
 * to that face and follows it when the envelope is resized. Covers every
 * catalog-style member (sides 0, top 18, shelf 19, back 10, front 2) without
 * catching a divider or a half-width shelf. Phase 12 applies the same margin
 * to the shell's inner faces (`customPieceFit.ts`).
 */
export const ATTACHED_MARGIN_MM = 20

// ---------------------------------------------------------------------------
// Shell and interior (Phase 12)

/**
 * The shell is the carcass: the five roles whose inner faces bound the
 * interior. A `front` is neither shell nor interior — it lives on the face
 * like a drawer, is never fitted and never a bound.
 */
export const SHELL_ROLES: readonly CustomPanelRole[] = ['side-left', 'side-right', 'top', 'bottom', 'back']
export const INTERIOR_ROLES: readonly CustomPanelRole[] = ['shelf', 'divider']

export function isShellPanel(panel: Pick<CustomPanelSpec, 'role'>): boolean {
  return SHELL_ROLES.includes(panel.role)
}

export function isInteriorPanel(panel: Pick<CustomPanelSpec, 'role'>): boolean {
  return INTERIOR_ROLES.includes(panel.role)
}

/** The space between the shell's inner faces, per axis. */
export interface InteriorBounds {
  readonly min: Vec3
  readonly max: Vec3
}

/**
 * The interior: x between the left side's inner face and the right side's,
 * y between the bottom's top face and the top's bottom face, z between the
 * BACK's front face (the top of its box — 4 mm for the preset back, the
 * number the catalog gives shelves and dividers; its rebate overlap is on x
 * and y and does not matter here) and the carcass face `D`. A missing shell
 * panel leaves the envelope face as the bound; a front panel never bounds
 * anything. Several panels in one role: the innermost face. An inverted
 * pair (a side-left standing right of a side-right) falls back to the
 * envelope on that axis.
 */
export function interiorBounds(spec: CustomPieceSpec): InteriorBounds {
  const inner = (role: CustomPanelRole, axis: Axis, side: 'min' | 'max', fallback: number): number => {
    let bound = fallback
    for (const panel of spec.panels) {
      if (panel.role !== role) {
        continue
      }
      const extent = panelExtent(panel)
      // The inner face of a min-side member is its max face, and vice versa.
      const face = side === 'min' ? extent.max[axis] : extent.min[axis]
      bound = side === 'min' ? Math.max(bound, face) : Math.min(bound, face)
    }
    return bound
  }
  const envelope: Size3 = { x: spec.widthMm, y: spec.heightMm, z: spec.depthMm }
  const min: Vec3 = {
    x: inner('side-left', 'x', 'min', 0),
    y: inner('bottom', 'y', 'min', 0),
    z: inner('back', 'z', 'min', 0)
  }
  const max: Vec3 = {
    x: inner('side-right', 'x', 'max', envelope.x),
    y: inner('top', 'y', 'max', envelope.y),
    z: envelope.z
  }
  let result = { min, max }
  for (const axis of AXES) {
    if (result.min[axis] >= result.max[axis]) {
      result = { min: withAxis(result.min, axis, 0), max: withAxis(result.max, axis, envelope[axis]) }
    }
  }
  return result
}

export function sameInteriorBounds(a: InteriorBounds, b: InteriorBounds): boolean {
  return AXES.every((axis) => a.min[axis] === b.min[axis] && a.max[axis] === b.max[axis])
}

/**
 * Keeps an interior panel's ORIGIN inside the interior on every axis where
 * the panel fits between the bounds (a divider dragged sideways stops at a
 * side's inner face; its `z: 4` can no longer land on the grid's 0 inside
 * the back). On an axis where the panel is already larger than the
 * interior — a deliberate override through the fields — nothing changes;
 * the envelope clamp has already run. Shell panels and fronts pass through.
 */
export function clampIntoInterior(spec: CustomPieceSpec, panel: CustomPanelSpec): CustomPanelSpec {
  if (!isInteriorPanel(panel)) {
    return panel
  }
  const bounds = interiorBounds(spec)
  const size = panelBoxSize(panel)
  let originMm = panel.originMm
  for (const axis of AXES) {
    const low = bounds.min[axis]
    const high = bounds.max[axis] - size[axis]
    if (high >= low) {
      const clamped = clampToLimit(originMm[axis], { min: low, max: high })
      if (clamped !== originMm[axis]) {
        originMm = withAxis(originMm, axis, clamped)
      }
    }
  }
  return originMm === panel.originMm ? panel : { ...panel, originMm }
}

export interface EnvelopePatch {
  readonly widthMm?: number
  readonly heightMm?: number
  readonly depthMm?: number
}

type CutDimension = 'lengthMm' | 'widthMm' | 'thicknessMm'

function withDimension(panel: CustomPanelSpec, dimension: CutDimension, value: number): CustomPanelSpec {
  switch (dimension) {
    case 'lengthMm':
      return { ...panel, lengthMm: value }
    case 'widthMm':
      return { ...panel, widthMm: value }
    case 'thicknessMm':
      return { ...panel, thicknessMm: value }
  }
}

/** Moves or resizes one panel so it keeps its distance to a face that moved by `delta`. */
function followFace(panel: CustomPanelSpec, axis: Axis, faceBefore: number, delta: number): CustomPanelSpec {
  const farEdge = panel.originMm[axis] + panelBoxSize(panel)[axis]
  if (faceBefore - farEdge > ATTACHED_MARGIN_MM) {
    return panel
  }
  const moved = (): CustomPanelSpec => ({
    ...panel,
    originMm: withAxis(panel.originMm, axis, panel.originMm[axis] + delta)
  })
  const axes = axesOf(panel.orientation)
  const dimension: CutDimension =
    axes.length === axis ? 'lengthMm' : axes.width === axis ? 'widthMm' : 'thicknessMm'
  if (dimension === 'thicknessMm') {
    // Standing across the axis (a side, a front): it moves with the face.
    return moved()
  }
  const resized = panel[dimension] + delta
  const { min, max } = CUSTOM_PIECE_LIMITS.panelSizeMm
  return resized >= min && resized <= max ? withDimension(panel, dimension, resized) : moved()
}

/**
 * Resizes the envelope and takes the attached panels along (see
 * ATTACHED_MARGIN_MM): a top spanning the inner width follows the new width,
 * the right side moves to the new right face, a shelf keeps its front
 * setback when the depth changes. Everything else stays put and is then
 * clamped into the new envelope like any other edit.
 */
export function resizeEnvelope(spec: CustomPieceSpec, patch: EnvelopePatch): CustomPieceSpec {
  const limits = customPieceEnvelopeLimits(spec)
  const envelope = {
    widthMm: clampToLimit(patch.widthMm ?? spec.widthMm, limits.widthMm),
    heightMm: clampToLimit(patch.heightMm ?? spec.heightMm, limits.heightMm),
    depthMm: clampToLimit(patch.depthMm ?? spec.depthMm, limits.depthMm)
  }
  const before: Size3 = { x: spec.widthMm, y: spec.heightMm, z: spec.depthMm }
  const after: Size3 = { x: envelope.widthMm, y: envelope.heightMm, z: envelope.depthMm }
  let panels = spec.panels
  let drawers = spec.drawers
  for (const axis of AXES) {
    const delta = after[axis] - before[axis]
    if (delta !== 0) {
      panels = panels.map((panel) => followFace(panel, axis, before[axis], delta))
      // A drawer has no depth of its own: its box follows the envelope by derivation.
      if (axis !== 'z') {
        drawers = drawers.map((drawer) => followFaceWithDrawer(drawer, axis, before[axis], delta))
      }
    }
  }
  return clampCustomPieceSpec({ ...spec, ...envelope, panels, drawers })
}

/**
 * A drawer follows a moved face the way a front panel does: its front grows
 * or shrinks along that axis when its far edge was attached to the face, or
 * moves with it when the new size would leave the drawer limits.
 */
function followFaceWithDrawer(
  drawer: CustomDrawerSpec,
  axis: 'x' | 'y',
  faceBefore: number,
  delta: number
): CustomDrawerSpec {
  const size = axis === 'x' ? drawer.widthMm : drawer.heightMm
  if (faceBefore - (drawer.originMm[axis] + size) > ATTACHED_MARGIN_MM) {
    return drawer
  }
  const limit = axis === 'x' ? CUSTOM_DRAWER_LIMITS.widthMm : CUSTOM_DRAWER_LIMITS.heightMm
  const resized = size + delta
  if (resized >= limit.min && resized <= limit.max) {
    return axis === 'x' ? { ...drawer, widthMm: resized } : { ...drawer, heightMm: resized }
  }
  return {
    ...drawer,
    originMm:
      axis === 'x'
        ? { x: drawer.originMm.x + delta, y: drawer.originMm.y }
        : { x: drawer.originMm.x, y: drawer.originMm.y + delta }
  }
}

// ---------------------------------------------------------------------------
// The design contract (dispatched by the registry)

/**
 * A custom drawer as the shared construction sees it: a full-overlay front on
 * the face, its box centred in the bay behind it (the front less the overlay
 * on each side — the relation every catalog front has with its carcass), as
 * deep as the slide that fits the envelope.
 */
function drawerOpening(spec: CustomPieceSpec, drawer: CustomDrawerSpec, number: number): DrawerOpening {
  const centerXMm = drawer.originMm.x + drawer.widthMm / 2
  return {
    number,
    front: { centerXMm, bottomMm: drawer.originMm.y, widthMm: drawer.widthMm, heightMm: drawer.heightMm },
    bayWidthMm: drawer.widthMm - 2 * DRAWER_FRONT_OVERLAY_MM,
    bayCenterXMm: centerXMm,
    carcassDepthMm: spec.depthMm
  }
}

/**
 * spec → panels + hardware. The panels are the spec's own, with their boxes
 * derived; then every drawer's front and box parts. The hardware is the
 * spec's list verbatim, then the drawers' slide pairs and handles.
 */
export function generateCustomPiece(spec: CustomPieceSpec): CabinetBuild {
  const errors = validateCustomPieceSpec(spec)
  if (errors.length > 0) {
    throw new Error(`invalid custom piece: ${errors.join('; ')}`)
  }
  const panels: Panel[] = spec.panels.map((panel) => ({
    id: panel.id,
    role: panel.role,
    materialId: panel.materialId,
    lengthMm: panel.lengthMm,
    widthMm: panel.widthMm,
    thicknessMm: panel.thicknessMm,
    edgeBanding: panel.edgeBanding,
    box: panelBox(panel)
  }))
  const drawerHardware: HardwareItem[] = []
  for (const drawer of spec.drawers) {
    // Validated above, so the id always carries its number.
    const number = drawerNumberOf(drawer.id) ?? 0
    const built = buildDrawer(drawerOpening(spec, drawer, number), drawer)
    panels.push(...built.panels)
    drawerHardware.push(...built.hardware)
  }
  const frontMostZ = spec.panels.reduce(
    (deepest, panel) => Math.max(deepest, panelExtent(panel).max.z),
    spec.drawers.length > 0 ? spec.depthMm + DOOR_THICKNESS_MM : spec.depthMm
  )
  return {
    panels,
    hardware: [
      ...spec.hardware.map((item) => ({ materialId: item.materialId, quantity: item.quantity })),
      ...mergeHardware(drawerHardware)
    ],
    boundingSizeMm: { x: spec.widthMm, y: spec.heightMm, z: frontMostZ }
  }
}

/** The envelope on the floor; fronts in the overlay zone are excluded like catalog doors. */
export function customPieceFootprintSize(spec: CustomPieceSpec): FootprintSize {
  return { widthMm: spec.widthMm, depthMm: spec.depthMm }
}

export function customPieceVerticalExtent(spec: CustomPieceSpec): VerticalExtentMm {
  return { bottomMm: spec.mountingHeightMm, topMm: spec.mountingHeightMm + spec.heightMm }
}

// ---------------------------------------------------------------------------
// Editor transitions (pure): presets, duplicate, remove

/** The fast path: a panel already sized and positioned from the envelope. */
export type PanelPreset = 'side' | 'top' | 'bottom' | 'back' | 'shelf' | 'divider' | 'front'
export const PANEL_PRESETS: readonly PanelPreset[] = [
  'side',
  'top',
  'bottom',
  'back',
  'shelf',
  'divider',
  'front'
]

export interface PanelChange {
  readonly spec: CustomPieceSpec
  /** The panel that was added, so the editor can select it. */
  readonly panelId: string
}

interface Span {
  readonly from: number
  readonly to: number
}

function spanLength(span: Span): number {
  return span.to - span.from
}

/** The widest stretch of [from, to] not covered by any occupied span (empty when there is none). */
function widestFreeSpan(occupied: readonly Span[], from: number, to: number): Span {
  const sorted = [...occupied]
    .filter((span) => span.to > from && span.from < to)
    .sort((a, b) => a.from - b.from)
  let best: Span = { from, to: from }
  let cursor = from
  for (const span of sorted) {
    if (span.from - cursor > spanLength(best)) {
      best = { from: cursor, to: span.from }
    }
    cursor = Math.max(cursor, span.to)
  }
  if (to - cursor > spanLength(best)) {
    best = { from: cursor, to }
  }
  return best
}

/** Occupied stretches of `axis` taken by the panels that satisfy `keep`. */
function occupiedAlong(
  panels: readonly CustomPanelSpec[],
  axis: Axis,
  keep: (panel: CustomPanelSpec) => boolean
): Span[] {
  return panels.filter(keep).map((panel) => {
    const { min, max } = panelExtent(panel)
    return { from: min[axis], to: max[axis] }
  })
}

function bandOf(edges: EdgeBanding['edges']): EdgeBanding {
  return { materialId: CUSTOM_PIECE_DEFAULT_MATERIALS.edgeBand, edges }
}

/** A carcass panel in the preset material with the front edge banded. */
function carcassPanel(
  id: string,
  role: CustomPanelRole,
  orientation: PanelOrientation,
  lengthMm: number,
  widthMm: number,
  originMm: Vec3
): CustomPanelSpec {
  return {
    id,
    role,
    materialId: CUSTOM_PIECE_DEFAULT_MATERIALS.board,
    lengthMm,
    widthMm,
    thicknessMm: CARCASS_THICKNESS_MM,
    edgeBanding: bandOf(['length-1']),
    orientation,
    originMm
  }
}

function isFront(panel: CustomPanelSpec, spec: CustomPieceSpec): boolean {
  return panel.orientation === 'xy' && panel.originMm.z >= spec.depthMm
}

function presetPanel(spec: CustomPieceSpec, preset: PanelPreset, id: string): CustomPanelSpec {
  const t = CARCASS_THICKNESS_MM
  const { widthMm: w, heightMm: h, depthMm: d } = spec
  switch (preset) {
    case 'side': {
      const hasLeft = spec.panels.some((panel) => panel.role === 'side-left')
      const hasRight = spec.panels.some((panel) => panel.role === 'side-right')
      const role: CustomPanelRole = !hasLeft ? 'side-left' : !hasRight ? 'side-right' : 'side-left'
      return carcassPanel(id, role, 'yz', h, d, { x: role === 'side-left' ? 0 : w - t, y: 0, z: 0 })
    }
    case 'top':
      return carcassPanel(id, 'top', 'xz', w - 2 * t, d, { x: t, y: h - t, z: 0 })
    case 'bottom':
      return carcassPanel(id, 'bottom', 'xz', w - 2 * t, d, { x: t, y: 0, z: 0 })
    case 'back': {
      const overlap = BACK_REBATE_OVERLAP_MM
      return {
        id,
        role: 'back',
        materialId: CUSTOM_PIECE_DEFAULT_MATERIALS.back,
        lengthMm: h - 2 * t + 2 * overlap,
        widthMm: w - 2 * t + 2 * overlap,
        thicknessMm: BACK_THICKNESS_MM,
        edgeBanding: null,
        orientation: 'xy',
        originMm: { x: t - overlap, y: t - overlap, z: BACK_RECESS_MM }
      }
    }
    case 'shelf': {
      // Centre it in the tallest free gap between the horizontal panels, so
      // repeated clicks fan out instead of piling up; sized to the interior
      // (Phase 12): between the sides' inner faces with the side clearance,
      // from the back's front face plus the rear clearance to the front
      // setback. Without a side or a back the envelope face is the bound.
      const bounds = interiorBounds(spec)
      const gap = widestFreeSpan(
        occupiedAlong(spec.panels, 'y', (panel) => panel.orientation === 'xz'),
        0,
        h
      )
      const range = spanLength(gap) >= t ? gap : { from: 0, to: h }
      const rearZ = bounds.min.z + SHELF_REAR_CLEARANCE_MM
      return carcassPanel(
        id,
        'shelf',
        'xz',
        bounds.max.x - bounds.min.x - 2 * SHELF_SIDE_CLEARANCE_MM,
        d - rearZ - SHELF_FRONT_SETBACK_MM,
        { x: bounds.min.x + SHELF_SIDE_CLEARANCE_MM, y: (range.from + range.to) / 2 - t / 2, z: rearZ }
      )
    }
    case 'divider': {
      // Centred in the widest free gap between the uprights; from the
      // bottom's top face to the top's bottom face, from the back's front
      // face to the carcass face (Phase 12: the interior bounds).
      const bounds = interiorBounds(spec)
      const gap = widestFreeSpan(
        occupiedAlong(spec.panels, 'x', (panel) => panel.orientation === 'yz'),
        0,
        w
      )
      const range = spanLength(gap) >= t ? gap : { from: 0, to: w }
      return carcassPanel(id, 'divider', 'yz', bounds.max.y - bounds.min.y, d - bounds.min.z, {
        x: (range.from + range.to) / 2 - t / 2,
        y: bounds.min.y,
        z: bounds.min.z
      })
    }
    case 'front': {
      // Fill the widest opening left between the existing fronts: shrink the
      // first door and "add front" gives the second.
      const reveal = FRONT_REVEAL_MM
      const gap = widestFreeSpan(
        occupiedAlong(spec.panels, 'x', (panel) => isFront(panel, spec)),
        reveal,
        w - reveal
      )
      let left = gap.from + (gap.from > reveal ? FRONT_GAP_MM : 0)
      let right = gap.to - (gap.to < w - reveal ? FRONT_GAP_MM : 0)
      if (right - left < CUSTOM_PIECE_LIMITS.panelSizeMm.min) {
        left = reveal
        right = w - reveal
      }
      return {
        id,
        role: 'front',
        materialId: CUSTOM_PIECE_DEFAULT_MATERIALS.board,
        lengthMm: h - 2 * reveal,
        widthMm: right - left,
        thicknessMm: DOOR_THICKNESS_MM,
        edgeBanding: bandOf(['length-1', 'length-2', 'width-1', 'width-2']),
        orientation: 'xy',
        originMm: { x: left, y: reveal, z: d }
      }
    }
  }
}

function appendPanel(spec: CustomPieceSpec, panel: CustomPanelSpec): PanelChange {
  const fitted = clampPanelInto(panelSpace(spec), panel)
  return { spec: { ...spec, panels: [...spec.panels, fitted] }, panelId: fitted.id }
}

/** Adds a preset panel; null when the piece already holds MAX_PANELS_PER_PIECE. */
export function addPresetPanel(spec: CustomPieceSpec, preset: PanelPreset): PanelChange | null {
  if (spec.panels.length >= MAX_PANELS_PER_PIECE) {
    return null
  }
  const id = `panel-${nextPanelNumberFor(spec)}`
  return appendPanel(spec, presetPanel(spec, preset, id))
}

/**
 * Copies a panel flush beside the original: along its thickness axis (a
 * shelf copy lands on top of it, a side copy beside it), sideways for backs
 * and fronts, or in place when nothing fits. Null at the panel limit or for
 * an unknown id.
 */
export function duplicatePanel(spec: CustomPieceSpec, panelId: string): PanelChange | null {
  const source = spec.panels.find((panel) => panel.id === panelId)
  if (source === undefined || spec.panels.length >= MAX_PANELS_PER_PIECE) {
    return null
  }
  const axis: Axis = source.orientation === 'xy' ? 'x' : axesOf(source.orientation).thickness
  const size = panelBoxSize(source)[axis]
  const space = panelSpace(spec)[axis]
  const at = source.originMm[axis]
  let originMm = source.originMm
  if (at + 2 * size <= space) {
    originMm = withAxis(originMm, axis, at + size)
  } else if (at - size >= 0) {
    originMm = withAxis(originMm, axis, at - size)
  }
  const copy: CustomPanelSpec = { ...source, id: `panel-${nextPanelNumberFor(spec)}`, originMm }
  return appendPanel(spec, copy)
}

export function removePanel(spec: CustomPieceSpec, panelId: string): CustomPieceSpec {
  return { ...spec, panels: spec.panels.filter((panel) => panel.id !== panelId) }
}

// ---------------------------------------------------------------------------
// Moving a panel by hand (Phase 9: the gizmo and the arrow keys)

/**
 * The grid a gizmo drag lands on: absolute multiples of 10 mm on the origin,
 * the same step the origin sliders use, so a drag and a slider agree.
 * Cabinetry positions are round numbers; 1 mm precision is on the keys.
 */
export const PANEL_MOVE_STEP_MM = 10

/** Rounds to the nearest multiple of `step` (a positive number). */
export function snapToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

/**
 * Moves one panel to `originMm`, then clamps it into the envelope exactly
 * like any other edit — a drag past a face lands flush against it — and,
 * for an interior panel, into the interior (Phase 12: a shelf stops at a
 * side's inner face, never inside the back). The spec comes back unchanged
 * for an unknown id.
 */
export function movePanel(spec: CustomPieceSpec, panelId: string, originMm: Vec3): CustomPieceSpec {
  const space = panelSpace(spec)
  let found = false
  const panels = spec.panels.map((panel) => {
    if (panel.id !== panelId) {
      return panel
    }
    found = true
    return clampIntoInterior(spec, clampPanelInto(space, { ...panel, originMm }))
  })
  return found ? { ...spec, panels } : spec
}

/** `movePanel` by a delta (an arrow-key nudge); missing axes are 0. */
export function nudgePanel(spec: CustomPieceSpec, panelId: string, delta: Partial<Vec3>): CustomPieceSpec {
  const panel = spec.panels.find((candidate) => candidate.id === panelId)
  if (panel === undefined) {
    return spec
  }
  return movePanel(spec, panelId, {
    x: panel.originMm.x + (delta.x ?? 0),
    y: panel.originMm.y + (delta.y ?? 0),
    z: panel.originMm.z + (delta.z ?? 0)
  })
}

// ---------------------------------------------------------------------------
// Drawers in the editor (Phase 10): add, duplicate, remove, move

/** A new drawer's front height: a cutlery drawer, like the onderkast met lade's default. */
export const DEFAULT_DRAWER_FRONT_HEIGHT_MM = 150

export interface DrawerChange {
  readonly spec: CustomPieceSpec
  /** The drawer that was added, so the editor can select it. */
  readonly drawerId: string
}

/** Room for another drawer: under the limit, and an envelope wide and deep enough for one. */
export function canAddDrawer(spec: CustomPieceSpec): boolean {
  return (
    spec.drawers.length < MAX_DRAWERS_PER_PIECE &&
    spec.widthMm >= CUSTOM_DRAWER_LIMITS.widthMm.min &&
    spec.depthMm >= DRAWER_MIN_CARCASS_DEPTH_MM
  )
}

/** The heights of the face the fronts already cover: front panels in the overlay zone, and drawers. */
function frontSpansY(spec: CustomPieceSpec, exceptDrawerId: string | null = null): Span[] {
  return [
    ...occupiedAlong(spec.panels, 'y', (panel) => isFront(panel, spec)),
    ...spec.drawers
      .filter((drawer) => drawer.id !== exceptDrawerId)
      .map((drawer) => ({ from: drawer.originMm.y, to: drawer.originMm.y + drawer.heightMm }))
  ]
}

/** Nothing on the face covers any of [from, to] (touching is fine), and it lies on the face. */
function freeOnFace(spec: CustomPieceSpec, from: number, to: number): boolean {
  return (
    from >= 0 &&
    to <= spec.heightMm &&
    frontSpansY(spec).every((span) => span.to <= from || span.from >= to)
  )
}

function appendDrawer(spec: CustomPieceSpec, drawer: CustomDrawerSpec): DrawerChange {
  const fitted = clampDrawerInto(spec, drawer)
  return { spec: { ...spec, drawers: [...spec.drawers, fitted] }, drawerId: fitted.id }
}

/**
 * The fast path: a 150 mm front across the face (between the reveals, at
 * most the widest drawer), at the top of the tallest stretch of the face no
 * front covers yet, 3 mm under the front above it — so repeated clicks stack
 * drawers downward, and a last stretch between 96 and 150 mm is filled. With
 * no such stretch it goes to the top, like the front preset's fallback; the
 * view shows the clash. Null when the piece cannot take a drawer.
 */
export function addDrawer(spec: CustomPieceSpec): DrawerChange | null {
  if (!canAddDrawer(spec)) {
    return null
  }
  const reveal = FRONT_REVEAL_MM
  const faceTop = spec.heightMm - reveal
  const gap = widestFreeSpan(frontSpansY(spec), reveal, faceTop)
  const top = gap.to - (gap.to < faceTop ? FRONT_GAP_MM : 0)
  const bottom = gap.from + (gap.from > reveal ? FRONT_GAP_MM : 0)
  const fits = top - bottom >= CUSTOM_DRAWER_LIMITS.heightMm.min
  const heightMm = fits ? Math.min(DEFAULT_DRAWER_FRONT_HEIGHT_MM, top - bottom) : DEFAULT_DRAWER_FRONT_HEIGHT_MM
  return appendDrawer(spec, {
    id: `drawer-${nextDrawerNumberFor(spec)}`,
    originMm: { x: reveal, y: (fits ? top : faceTop) - heightMm },
    widthMm: Math.min(spec.widthMm - 2 * reveal, CUSTOM_DRAWER_LIMITS.widthMm.max),
    heightMm,
    frontMaterialId: CUSTOM_PIECE_DEFAULT_MATERIALS.board,
    boxMaterialId: CUSTOM_PIECE_DEFAULT_MATERIALS.board,
    bottomMaterialId: CUSTOM_PIECE_DEFAULT_MATERIALS.back,
    edgeBandMaterialId: CUSTOM_PIECE_DEFAULT_MATERIALS.edgeBand
  })
}

/**
 * Copies a drawer one gap below the original when the face is free there,
 * else one gap above, else in place. Null at the drawer limit or for an
 * unknown id.
 */
export function duplicateDrawer(spec: CustomPieceSpec, drawerId: string): DrawerChange | null {
  const source = spec.drawers.find((drawer) => drawer.id === drawerId)
  if (source === undefined || spec.drawers.length >= MAX_DRAWERS_PER_PIECE) {
    return null
  }
  const height = source.heightMm
  const below = source.originMm.y - FRONT_GAP_MM - height
  const above = source.originMm.y + height + FRONT_GAP_MM
  const y = freeOnFace(spec, below, below + height)
    ? below
    : freeOnFace(spec, above, above + height)
      ? above
      : source.originMm.y
  return appendDrawer(spec, {
    ...source,
    id: `drawer-${nextDrawerNumberFor(spec)}`,
    originMm: { x: source.originMm.x, y }
  })
}

export function removeDrawer(spec: CustomPieceSpec, drawerId: string): CustomPieceSpec {
  return { ...spec, drawers: spec.drawers.filter((drawer) => drawer.id !== drawerId) }
}

/**
 * Moves a drawer's front to `originMm` on the face, then clamps it onto the
 * face like any other edit — a drag past an edge lands flush against it. A
 * drawer has no depth to move along. The spec comes back unchanged for an
 * unknown id.
 */
export function moveDrawer(spec: CustomPieceSpec, drawerId: string, originMm: Vec2): CustomPieceSpec {
  let found = false
  const drawers = spec.drawers.map((drawer) => {
    if (drawer.id !== drawerId) {
      return drawer
    }
    found = true
    return clampDrawerInto(spec, { ...drawer, originMm: { x: originMm.x, y: originMm.y } })
  })
  return found ? { ...spec, drawers } : spec
}

/** `moveDrawer` by a delta (an arrow-key nudge); missing axes are 0. */
export function nudgeDrawer(spec: CustomPieceSpec, drawerId: string, delta: Partial<Vec2>): CustomPieceSpec {
  const drawer = spec.drawers.find((candidate) => candidate.id === drawerId)
  if (drawer === undefined) {
    return spec
  }
  return moveDrawer(spec, drawerId, {
    x: drawer.originMm.x + (delta.x ?? 0),
    y: drawer.originMm.y + (delta.y ?? 0)
  })
}

/** The most a drawer's fields may be, given the face and its own size (for the editor's sliders). */
export interface DrawerRanges {
  readonly widthMaxMm: number
  readonly heightMaxMm: number
  readonly originMaxMm: Vec2
}

export function drawerRanges(
  spec: Pick<CustomPieceSpec, 'widthMm' | 'heightMm'>,
  drawer: CustomDrawerSpec
): DrawerRanges {
  return {
    widthMaxMm: Math.min(CUSTOM_DRAWER_LIMITS.widthMm.max, spec.widthMm),
    heightMaxMm: Math.min(CUSTOM_DRAWER_LIMITS.heightMm.max, spec.heightMm),
    originMaxMm: {
      x: Math.max(0, spec.widthMm - drawer.widthMm),
      y: Math.max(0, spec.heightMm - drawer.heightMm)
    }
  }
}

// ---------------------------------------------------------------------------
// Elements: what the editor selects, moves, duplicates and deletes, one at a time

/** A piece's two element families: its panels and (Phase 10) its drawers. */
export type PieceElementKind = 'panel' | 'drawer'

/** Which family an element id names, by its shape; null for anything else. */
export function pieceElementKind(id: string): PieceElementKind | null {
  if (panelNumberOf(id) !== null) {
    return 'panel'
  }
  return drawerNumberOf(id) === null ? null : 'drawer'
}

/** Every element of the piece, panels first: what a selection may name. */
export function pieceElementIds(spec: CustomPieceSpec): string[] {
  return [...spec.panels.map((panel) => panel.id), ...spec.drawers.map((drawer) => drawer.id)]
}

/** The element a generated part belongs to: a panel is its own element; a drawer's six parts are the drawer. */
export function elementIdOfPart(partId: string): string {
  const number = drawerNumberOfPart(partId)
  return number === null ? partId : `drawer-${number}`
}

/** What the gizmo and the arrow keys need of the selected element. */
export interface ElementAnchor {
  /** Where the gizmo sits (piece space): the panel's box, or the drawer front's box. */
  readonly box: Box3
  /** What a move sets: the panel's origin, or the drawer front's corner (z is the face). */
  readonly originMm: Vec3
  /** The axes it moves along: a drawer front always stands on the face. */
  readonly axes: readonly PieceAxis[]
}

export function elementAnchor(spec: CustomPieceSpec, id: string): ElementAnchor | null {
  const panel = spec.panels.find((candidate) => candidate.id === id)
  if (panel !== undefined) {
    return { box: panelBox(panel), originMm: panel.originMm, axes: AXES }
  }
  const drawer = spec.drawers.find((candidate) => candidate.id === id)
  if (drawer === undefined) {
    return null
  }
  // The same box the build gives the drawer's front.
  return {
    box: {
      center: {
        x: drawer.originMm.x + drawer.widthMm / 2,
        y: drawer.originMm.y + drawer.heightMm / 2,
        z: spec.depthMm + DOOR_THICKNESS_MM / 2
      },
      size: { x: drawer.widthMm, y: drawer.heightMm, z: DOOR_THICKNESS_MM }
    },
    originMm: { x: drawer.originMm.x, y: drawer.originMm.y, z: spec.depthMm },
    axes: ['x', 'y']
  }
}

/** `movePanel` or `moveDrawer`, by the element's family; unknown ids change nothing. */
export function moveElement(spec: CustomPieceSpec, id: string, originMm: Vec3): CustomPieceSpec {
  switch (pieceElementKind(id)) {
    case 'panel':
      return movePanel(spec, id, originMm)
    case 'drawer':
      return moveDrawer(spec, id, originMm)
    case null:
      return spec
  }
}

/** `nudgePanel` or `nudgeDrawer`, by the element's family; a drawer ignores depth. */
export function nudgeElement(spec: CustomPieceSpec, id: string, delta: Partial<Vec3>): CustomPieceSpec {
  switch (pieceElementKind(id)) {
    case 'panel':
      return nudgePanel(spec, id, delta)
    case 'drawer':
      return nudgeDrawer(spec, id, delta)
    case null:
      return spec
  }
}
