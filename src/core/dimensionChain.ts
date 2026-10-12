import {
  panelExtent,
  pieceElementKind,
  axesOf,
  type CustomPieceSpec,
  type PieceAxis
} from './customPiece'
import { DOOR_THICKNESS_MM } from './catalog/parts'
import { OVERLAP_EPSILON_MM } from './footprint'
import type { Vec3 } from './units'

/**
 * Dimension chains (maatlijnen) in the piece editor (Phase 12): for one
 * element, the row of gaps along one axis between the elements PARALLEL to
 * it — every free stretch between consecutive members, from carcass face
 * to carcass face. A divider reads the compartment widths of its row
 * (`side | 240 | 240 | 240 | side`), a shelf the heights between shelves,
 * a back or front panel the depths, a drawer its gaps to the sides and to
 * the fronts above and below. Pure: the renderer only draws the result.
 *
 * Members of a chain: the element itself plus every element of the same
 * family lying in the same plane (a panel's chain holds the panels with
 * its orientation; a drawer's holds the drawers and the front panels on
 * the face) whose cross-section overlaps the element's on the two other
 * axes. Flush members give no gap (zero length is skipped), members that
 * pass through each other give none either.
 */

export interface ChainGap {
  readonly fromMm: number
  readonly toMm: number
  readonly lengthMm: number
  /** The member whose far face starts the gap; null at the carcass face. */
  readonly beforeId: string | null
  /** The member whose near face ends the gap; null at the carcass face. */
  readonly afterId: string | null
  /** One of the selected element's own two gaps. */
  readonly own: boolean
}

export interface DimensionChain {
  readonly axis: PieceAxis
  /** The carcass faces the chain runs between (0 and the envelope extent). */
  readonly fromMm: number
  readonly toMm: number
  readonly gaps: readonly ChainGap[]
}

/** An element's box in piece space, as the chain sees it. */
export interface ChainMember {
  readonly id: string
  readonly min: Vec3
  readonly max: Vec3
}

const AXES: readonly PieceAxis[] = ['x', 'y', 'z']

/** The axes a chain is drawn along for this element: a panel's thickness axis, a drawer's two face axes. */
export function chainAxesOf(spec: CustomPieceSpec, elementId: string): readonly PieceAxis[] {
  switch (pieceElementKind(elementId)) {
    case 'panel': {
      const panel = spec.panels.find((candidate) => candidate.id === elementId)
      return panel === undefined ? [] : [axesOf(panel.orientation).thickness]
    }
    case 'drawer':
      return spec.drawers.some((drawer) => drawer.id === elementId) ? ['x', 'y'] : []
    case null:
      return []
  }
}

/** A drawer front's box: on the face, one door thick, in the overlay zone. */
function drawerMember(spec: CustomPieceSpec, drawer: CustomPieceSpec['drawers'][number]): ChainMember {
  return {
    id: drawer.id,
    min: { x: drawer.originMm.x, y: drawer.originMm.y, z: spec.depthMm },
    max: {
      x: drawer.originMm.x + drawer.widthMm,
      y: drawer.originMm.y + drawer.heightMm,
      z: spec.depthMm + DOOR_THICKNESS_MM
    }
  }
}

function panelMember(panel: CustomPieceSpec['panels'][number]): ChainMember {
  const { min, max } = panelExtent(panel)
  return { id: panel.id, min, max }
}

/**
 * The members that can bound the element's chains: panels of its
 * orientation for a panel; the drawers and the front panels on the face for
 * a drawer. The element itself is included.
 */
export function chainMembers(spec: CustomPieceSpec, elementId: string): readonly ChainMember[] {
  switch (pieceElementKind(elementId)) {
    case 'panel': {
      const panel = spec.panels.find((candidate) => candidate.id === elementId)
      if (panel === undefined) {
        return []
      }
      return spec.panels
        .filter((candidate) => candidate.orientation === panel.orientation)
        .map(panelMember)
    }
    case 'drawer':
      if (!spec.drawers.some((drawer) => drawer.id === elementId)) {
        return []
      }
      return [
        ...spec.panels
          .filter((panel) => panel.orientation === 'xy' && panel.originMm.z >= spec.depthMm)
          .map(panelMember),
        ...spec.drawers.map((drawer) => drawerMember(spec, drawer))
      ]
    case null:
      return []
  }
}

/** The envelope's extent along an axis: the carcass faces a chain runs between. */
export function chainExtentMm(spec: CustomPieceSpec, axis: PieceAxis): number {
  switch (axis) {
    case 'x':
      return spec.widthMm
    case 'y':
      return spec.heightMm
    case 'z':
      return spec.depthMm
  }
}

/** The two members overlap in cross-section (on both axes other than `axis`), thin contacts excluded. */
function crossSectionsOverlap(a: ChainMember, b: ChainMember, axis: PieceAxis): boolean {
  return AXES.filter((other) => other !== axis).every(
    (other) => Math.min(a.max[other], b.max[other]) - Math.max(a.min[other], b.min[other]) > OVERLAP_EPSILON_MM
  )
}

/**
 * The chain of `self` through `members` along `axis`: the free stretches
 * between consecutive members (and the carcass faces) that overlap `self`
 * in cross-section. `self` replaces its own entry in `members`, so a chain
 * can be read at an attempted position during a drag.
 */
export function chainOf(
  members: readonly ChainMember[],
  self: ChainMember,
  axis: PieceAxis,
  extentMm: number
): DimensionChain {
  const row = [self, ...members.filter((member) => member.id !== self.id)]
    .filter((member) => member.id === self.id || crossSectionsOverlap(member, self, axis))
    .sort((a, b) => a.min[axis] - b.min[axis])
  const gaps: ChainGap[] = []
  let cursor = 0
  let lastId: string | null = null
  const push = (fromMm: number, toMm: number, beforeId: string | null, afterId: string | null): void => {
    if (toMm - fromMm > 0) {
      gaps.push({
        fromMm,
        toMm,
        lengthMm: toMm - fromMm,
        beforeId,
        afterId,
        own: beforeId === self.id || afterId === self.id
      })
    }
  }
  for (const member of row) {
    push(cursor, member.min[axis], lastId, member.id)
    if (member.max[axis] > cursor) {
      cursor = member.max[axis]
      lastId = member.id
    }
  }
  push(cursor, extentMm, lastId, null)
  return { axis, fromMm: 0, toMm: extentMm, gaps }
}

/** The element's own box as a chain member, at its stored position. */
export function chainSelf(spec: CustomPieceSpec, elementId: string): ChainMember | null {
  return chainMembers(spec, elementId).find((member) => member.id === elementId) ?? null
}

/** The element's chain along `axis` at its stored position; null for an unknown element. */
export function dimensionChain(
  spec: CustomPieceSpec,
  elementId: string,
  axis: PieceAxis
): DimensionChain | null {
  const members = chainMembers(spec, elementId)
  const self = members.find((member) => member.id === elementId)
  if (self === undefined) {
    return null
  }
  return chainOf(members, self, axis, chainExtentMm(spec, axis))
}

/** Every chain the editor draws for the element: one per `chainAxesOf` axis. */
export function dimensionChains(spec: CustomPieceSpec, elementId: string): readonly DimensionChain[] {
  const chains: DimensionChain[] = []
  for (const axis of chainAxesOf(spec, elementId)) {
    const chain = dimensionChain(spec, elementId, axis)
    if (chain !== null) {
      chains.push(chain)
    }
  }
  return chains
}
