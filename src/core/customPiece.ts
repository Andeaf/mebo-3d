import { clampToLimit, limitViolations } from './cabinet'
import {
  BACK_REBATE_OVERLAP_MM,
  BACK_RECESS_MM,
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM,
  interiorRearZMm,
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
import type { Box3, Size3, Vec3 } from './units'

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

export interface CustomPieceSpec {
  /** Shown in the scene list and the readout; may be empty (the UI shows the kind label then). */
  readonly name: string
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  /** Height of the piece's bottom above the floor; 0 = it stands on the floor. */
  readonly mountingHeightMm: number
  readonly panels: readonly CustomPanelSpec[]
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

// ---------------------------------------------------------------------------
// Geometry

type Axis = 'x' | 'y' | 'z'
const AXES: readonly Axis[] = ['x', 'y', 'z']

interface AxisMap {
  readonly length: Axis
  readonly width: Axis
  readonly thickness: Axis
}

/** Which piece axis each cut dimension runs along (see `PanelOrientation`). */
function axesOf(orientation: PanelOrientation): AxisMap {
  switch (orientation) {
    case 'yz':
      return { length: 'y', width: 'z', thickness: 'x' }
    case 'xz':
      return { length: 'x', width: 'z', thickness: 'y' }
    case 'xy':
      return { length: 'y', width: 'x', thickness: 'z' }
  }
}

function withAxis(vector: Vec3, axis: Axis, value: number): Vec3 {
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

// ---------------------------------------------------------------------------
// Validation (used by the file decoder; the editor clamps instead)

function isFiniteVec3(vector: Vec3): boolean {
  return AXES.every((axis) => Number.isFinite(vector[axis]))
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

/** Forces every numeric field into range and every panel into the envelope. */
export function clampCustomPieceSpec(spec: CustomPieceSpec): CustomPieceSpec {
  const limits = CUSTOM_PIECE_LIMITS
  const envelope = {
    widthMm: clampToLimit(spec.widthMm, limits.widthMm),
    heightMm: clampToLimit(spec.heightMm, limits.heightMm),
    depthMm: clampToLimit(spec.depthMm, limits.depthMm)
  }
  const space = panelSpace(envelope)
  return {
    ...spec,
    name: spec.name.slice(0, MAX_PIECE_NAME_LENGTH),
    ...envelope,
    mountingHeightMm: clampToLimit(spec.mountingHeightMm, limits.mountingHeightMm),
    panels: spec.panels.map((panel) => clampPanelInto(space, panel)),
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
 * catching a divider or a half-width shelf.
 */
export const ATTACHED_MARGIN_MM = 20

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
  const limits = CUSTOM_PIECE_LIMITS
  const envelope = {
    widthMm: clampToLimit(patch.widthMm ?? spec.widthMm, limits.widthMm),
    heightMm: clampToLimit(patch.heightMm ?? spec.heightMm, limits.heightMm),
    depthMm: clampToLimit(patch.depthMm ?? spec.depthMm, limits.depthMm)
  }
  const before: Size3 = { x: spec.widthMm, y: spec.heightMm, z: spec.depthMm }
  const after: Size3 = { x: envelope.widthMm, y: envelope.heightMm, z: envelope.depthMm }
  let panels = spec.panels
  for (const axis of AXES) {
    const delta = after[axis] - before[axis]
    if (delta !== 0) {
      panels = panels.map((panel) => followFace(panel, axis, before[axis], delta))
    }
  }
  return clampCustomPieceSpec({ ...spec, ...envelope, panels })
}

// ---------------------------------------------------------------------------
// The design contract (dispatched by the registry)

/** spec → panels + hardware. The panels are the spec's own, with their boxes derived. */
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
  const frontMostZ = spec.panels.reduce(
    (deepest, panel) => Math.max(deepest, panelExtent(panel).max.z),
    spec.depthMm
  )
  return {
    panels,
    hardware: spec.hardware.map((item) => ({ materialId: item.materialId, quantity: item.quantity })),
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
      // repeated clicks fan out instead of piling up.
      const gap = widestFreeSpan(
        occupiedAlong(spec.panels, 'y', (panel) => panel.orientation === 'xz'),
        0,
        h
      )
      const range = spanLength(gap) >= t ? gap : { from: 0, to: h }
      const rearZ = interiorRearZMm() + SHELF_REAR_CLEARANCE_MM
      return carcassPanel(
        id,
        'shelf',
        'xz',
        w - 2 * t - 2 * SHELF_SIDE_CLEARANCE_MM,
        d - rearZ - SHELF_FRONT_SETBACK_MM,
        { x: t + SHELF_SIDE_CLEARANCE_MM, y: (range.from + range.to) / 2 - t / 2, z: rearZ }
      )
    }
    case 'divider': {
      const gap = widestFreeSpan(
        occupiedAlong(spec.panels, 'x', (panel) => panel.orientation === 'yz'),
        0,
        w
      )
      const range = spanLength(gap) >= t ? gap : { from: 0, to: w }
      const rearZ = interiorRearZMm()
      return carcassPanel(id, 'divider', 'yz', h - 2 * t, d - rearZ, {
        x: (range.from + range.to) / 2 - t / 2,
        y: t,
        z: rearZ
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
