import { clampToLimit } from './cabinet'
import {
  axesOf,
  interiorBounds,
  isInteriorPanel,
  panelBoxSize,
  panelExtent,
  sameInteriorBounds,
  withAxis,
  ATTACHED_MARGIN_MM,
  CUSTOM_PIECE_LIMITS,
  type CustomPanelSpec,
  type CustomPieceSpec,
  type InteriorBounds,
  type PieceAxis
} from './customPiece'

/**
 * Interior panels fit the carcass (Phase 12). ONE rule, the Phase 6
 * "attached within ATTACHED_MARGIN_MM follows the face" generalized from
 * the envelope to the shell's inner faces (`interiorBounds`): for every
 * interior panel, per axis and per side, an edge that was within the
 * margin of the OLD bound keeps its distance to the new one (a resize on a
 * sized axis, a move on the thickness axis, exactly `followFace`'s cases);
 * an edge BEYOND the new bound (the panel intersects the shell) is cut
 * back to it — the shell claims its space; any other edge is left alone.
 * Without an old bound (the "fit interior panels now" button) only the cut
 * applies — nothing is ever extended to flush on its own, so a shelf's
 * setback and a deliberate gap survive the button.
 *
 * Attachment is measured on the panel as it was BEFORE the edit, so a
 * panel `resizeEnvelope` already took along (it measures to the envelope
 * face) is not moved twice: the fit only sets the edge to "new bound minus
 * the old distance", wherever the edit left it.
 *
 * Who runs it: `commitPieceEdit(before, after)` after every editor path,
 * restricted to the axes and sides whose bound actually moved, so the
 * shell panel being edited reclaims its own space, edits of OTHER shell
 * panels leave an override alone, and an unchanged shell never re-fits
 * anything. Removing a shell panel (or taking its role away) moves a bound
 * out to the envelope face and is deliberately NOT a fit: nothing claims
 * space, the user may be replacing it, the button is there.
 */

type Side = 'min' | 'max'
type BoundKey = `${PieceAxis}:${Side}`

const AXES: readonly PieceAxis[] = ['x', 'y', 'z']
const SIDES: readonly Side[] = ['min', 'max']

function edgeOf(panel: CustomPanelSpec, axis: PieceAxis, side: Side): number {
  const extent = panelExtent(panel)
  return side === 'min' ? extent.min[axis] : extent.max[axis]
}

/**
 * Puts one edge of the panel at `value`: on a sized axis the panel is
 * resized (the opposite edge stays), on its thickness axis it is moved;
 * a size outside the panel limits falls back to a move.
 */
function withEdge(panel: CustomPanelSpec, axis: PieceAxis, side: Side, value: number): CustomPanelSpec {
  const delta = value - edgeOf(panel, axis, side)
  if (delta === 0) {
    return panel
  }
  const moved: CustomPanelSpec = {
    ...panel,
    originMm: withAxis(panel.originMm, axis, panel.originMm[axis] + delta)
  }
  const axes = axesOf(panel.orientation)
  const dimension = axes.length === axis ? 'lengthMm' : axes.width === axis ? 'widthMm' : null
  if (dimension === null) {
    return moved
  }
  const size = panel[dimension] + (side === 'max' ? delta : -delta)
  const { min, max } = CUSTOM_PIECE_LIMITS.panelSizeMm
  if (size < min || size > max) {
    return moved
  }
  const resized = dimension === 'lengthMm' ? { ...panel, lengthMm: size } : { ...panel, widthMm: size }
  return side === 'min' ? { ...resized, originMm: moved.originMm } : resized
}

/** One edge against one bound: follow when it was attached to the old bound, never beyond the new one. */
function fitEdge(
  panel: CustomPanelSpec,
  oldEdge: number,
  axis: PieceAxis,
  side: Side,
  bound: number,
  oldBound: number | null
): CustomPanelSpec {
  const edge = edgeOf(panel, axis, side)
  let desired = edge
  if (oldBound !== null && bound !== oldBound) {
    const distance = side === 'min' ? oldEdge - oldBound : oldBound - oldEdge
    if (Math.abs(distance) <= ATTACHED_MARGIN_MM) {
      desired = side === 'min' ? bound + distance : bound - distance
    }
  }
  // The shell claims its space.
  if (side === 'min' ? desired < bound : desired > bound) {
    desired = bound
  }
  return desired === edge ? panel : withEdge(panel, axis, side, desired)
}

/** A cut or a follow never leaves the envelope: the origin is clamped like any other edit. */
function clampOrigin(spec: CustomPieceSpec, panel: CustomPanelSpec): CustomPanelSpec {
  const size = panelBoxSize(panel)
  const space = { x: spec.widthMm, y: spec.heightMm, z: spec.depthMm }
  let originMm = panel.originMm
  for (const axis of AXES) {
    const clamped = clampToLimit(originMm[axis], { min: 0, max: Math.max(0, space[axis] - size[axis]) })
    if (clamped !== originMm[axis]) {
      originMm = withAxis(originMm, axis, clamped)
    }
  }
  return originMm === panel.originMm ? panel : { ...panel, originMm }
}

/**
 * Re-fits every interior panel to `interiorBounds(spec)`: cuts what
 * intersects the shell and — given `oldBounds` — takes along what was
 * attached to a bound that moved, measured on `before` (the panels as they
 * were before the edit; the panel itself when it has no `before`).
 * `selection` limits it to the bounds that changed; null applies every
 * bound. Returns the same spec when no panel changed. Drawers, fronts and
 * the shell are untouched.
 */
export function fitInteriorPanels(
  spec: CustomPieceSpec,
  oldBounds: InteriorBounds | null,
  before: readonly CustomPanelSpec[] = spec.panels,
  selection: ReadonlySet<BoundKey> | null = null
): CustomPieceSpec {
  const bounds = interiorBounds(spec)
  let changed = false
  const panels = spec.panels.map((panel) => {
    if (!isInteriorPanel(panel)) {
      return panel
    }
    const was = before.find((candidate) => candidate.id === panel.id) ?? panel
    let fitted = panel
    for (const axis of AXES) {
      for (const side of SIDES) {
        if (selection !== null && !selection.has(`${axis}:${side}`)) {
          continue
        }
        fitted = fitEdge(
          fitted,
          edgeOf(was, axis, side),
          axis,
          side,
          bounds[side][axis],
          oldBounds === null ? null : oldBounds[side][axis]
        )
      }
    }
    fitted = clampOrigin(spec, fitted)
    if (fitted !== panel) {
      changed = true
    }
    return fitted
  })
  return changed ? { ...spec, panels } : spec
}

function envelopeExtent(spec: CustomPieceSpec, axis: PieceAxis): number {
  switch (axis) {
    case 'x':
      return spec.widthMm
    case 'y':
      return spec.heightMm
    case 'z':
      return spec.depthMm
  }
}

/**
 * Every editor path hands its result through here: when the edit moved a
 * shell bound — a shell panel added, moved, resized, re-thicknessed or
 * given a shell role, or the envelope resized with the shell following —
 * the interior follows it on exactly those bounds. A bound that merely
 * fell back to the envelope face (a shell panel removed or its role taken
 * away, the envelope itself unchanged) is not applied: nothing claims
 * space. Returns `after` itself when there is nothing to do.
 */
export function commitPieceEdit(before: CustomPieceSpec, after: CustomPieceSpec): CustomPieceSpec {
  if (before === after) {
    return after
  }
  const oldBounds = interiorBounds(before)
  const bounds = interiorBounds(after)
  if (sameInteriorBounds(oldBounds, bounds)) {
    return after
  }
  const selection = new Set<BoundKey>()
  for (const axis of AXES) {
    for (const side of SIDES) {
      if (oldBounds[side][axis] === bounds[side][axis]) {
        continue
      }
      const atEnvelopeFace = bounds[side][axis] === (side === 'min' ? 0 : envelopeExtent(after, axis))
      const removed = atEnvelopeFace && envelopeExtent(before, axis) === envelopeExtent(after, axis)
      if (!removed) {
        selection.add(`${axis}:${side}`)
      }
    }
  }
  return selection.size === 0 ? after : fitInteriorPanels(after, oldBounds, before.panels, selection)
}

/** The button's state: would "fit interior panels now" change anything? */
export function interiorFitPending(spec: CustomPieceSpec): boolean {
  return fitInteriorPanels(spec, null) !== spec
}
