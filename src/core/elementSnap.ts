import {
  chainAxesOf,
  chainExtentMm,
  chainMembers,
  chainOf,
  crossSectionsOverlap,
  type ChainMember
} from './dimensionChain'
import { snapToStep, PANEL_MOVE_STEP_MM, type CustomPieceSpec, type PieceAxis } from './customPiece'
import type { Vec3 } from './units'

/**
 * Snapping for a gizmo drag in the piece editor (Phase 12). On the axes a
 * chain is measured along (`chainAxesOf`), the element snaps to the
 * MIDPOINT between its two neighbours — the position at which its two gaps
 * are equal — when within `MIDPOINT_SNAP_MM`, and that wins over the 10 mm
 * grid (a midpoint is rarely a multiple of 10); applied divider by divider
 * it yields equal compartments. Failing that, to a position at which one of
 * its gaps equals another gap of the same chain ("as wide as that one").
 * Every other axis, and a chain axis with no target in reach, lands on the
 * grid as before. Alt held (`mode: 'free'`) suppresses all of it: the raw
 * position, whole millimetres. The result still goes through `moveElement`,
 * which clamps it.
 *
 * Neighbours are members of the chain (panels of the same orientation; for
 * a drawer, drawers and front panels) on either side of the element at its
 * ATTEMPTED position; the carcass faces are not neighbours, so a lone
 * element gets the grid only.
 */

export const MIDPOINT_SNAP_MM = 8

export type SnapMode = 'snap' | 'free'
export type SnapKind = 'midpoint' | 'equal'

export interface SnapResult {
  readonly originMm: Vec3
  /** Which snap fired, on which axis; null for the grid or a free move. */
  readonly snapped: { readonly axis: PieceAxis; readonly kind: SnapKind } | null
}

function round(vector: Vec3): Vec3 {
  return { x: Math.round(vector.x), y: Math.round(vector.y), z: Math.round(vector.z) }
}

function grid(vector: Vec3): Vec3 {
  return {
    x: snapToStep(vector.x, PANEL_MOVE_STEP_MM),
    y: snapToStep(vector.y, PANEL_MOVE_STEP_MM),
    z: snapToStep(vector.z, PANEL_MOVE_STEP_MM)
  }
}

/** The element's box moved so its origin is `originMm` (a drawer keeps its face depth). */
function memberAt(self: ChainMember, originMm: Vec3, movesInDepth: boolean): ChainMember {
  const size = { x: self.max.x - self.min.x, y: self.max.y - self.min.y, z: self.max.z - self.min.z }
  const min = { x: originMm.x, y: originMm.y, z: movesInDepth ? originMm.z : self.min.z }
  return { id: self.id, min, max: { x: min.x + size.x, y: min.y + size.y, z: min.z + size.z } }
}

interface Neighbours {
  /** The far face of the nearest member below the element on the axis, or null. */
  readonly prevMm: number | null
  /** The near face of the nearest member above, or null. */
  readonly nextMm: number | null
}

/** The nearest member faces on either side of the element (by centre), among those it overlaps in cross-section. */
function neighboursOf(members: readonly ChainMember[], self: ChainMember, axis: PieceAxis): Neighbours {
  const centre = (self.min[axis] + self.max[axis]) / 2
  let prevMm: number | null = null
  let nextMm: number | null = null
  for (const member of members) {
    if (member.id === self.id || !crossSectionsOverlap(member, self, axis)) {
      continue
    }
    const memberCentre = (member.min[axis] + member.max[axis]) / 2
    if (memberCentre < centre) {
      prevMm = prevMm === null ? member.max[axis] : Math.max(prevMm, member.max[axis])
    } else if (memberCentre > centre) {
      nextMm = nextMm === null ? member.min[axis] : Math.min(nextMm, member.min[axis])
    }
  }
  return { prevMm, nextMm }
}

/**
 * The origin a gizmo drag lands on for `attemptedMm`, and which snap did it.
 * Unknown elements get the grid (or the rounded raw position) on every axis.
 */
export function snapElementMove(
  spec: CustomPieceSpec,
  elementId: string,
  attemptedMm: Vec3,
  mode: SnapMode
): SnapResult {
  if (mode === 'free') {
    return { originMm: round(attemptedMm), snapped: null }
  }
  let originMm = grid(attemptedMm)
  let snapped: SnapResult['snapped'] = null
  const members = chainMembers(spec, elementId)
  const stored = members.find((member) => member.id === elementId)
  if (stored === undefined) {
    return { originMm, snapped }
  }
  const axes = chainAxesOf(spec, elementId)
  const movesInDepth = axes.length === 1 // a panel moves on z, a drawer (two face axes) does not
  const self = memberAt(stored, attemptedMm, movesInDepth)
  for (const axis of axes) {
    const size = self.max[axis] - self.min[axis]
    const attempted = attemptedMm[axis]
    const chain = chainOf(members, self, axis, chainExtentMm(spec, axis))
    const { prevMm, nextMm } = neighboursOf(members, self, axis)
    const lands = (target: number): boolean => Math.abs(attempted - target) <= MIDPOINT_SNAP_MM
    let target: number | null = null
    let kind: SnapKind | null = null
    if (prevMm !== null && nextMm !== null) {
      const midpoint = prevMm + (nextMm - prevMm - size) / 2
      if (lands(midpoint)) {
        target = midpoint
        kind = 'midpoint'
      }
    }
    if (target === null) {
      // "As wide as that one": a gap of the element equal to another gap of the row.
      const others = chain.gaps.filter((gap) => !gap.own).map((gap) => gap.lengthMm)
      let best: number | null = null
      for (const length of others) {
        const candidates = [
          prevMm === null ? null : prevMm + length,
          nextMm === null ? null : nextMm - length - size
        ]
        for (const candidate of candidates) {
          if (candidate === null || !lands(candidate)) {
            continue
          }
          if (best === null || Math.abs(attempted - candidate) < Math.abs(attempted - best)) {
            best = candidate
          }
        }
      }
      if (best !== null) {
        target = best
        kind = 'equal'
      }
    }
    if (target !== null && kind !== null) {
      originMm = { ...originMm, [axis]: Math.round(target) }
      snapped = { axis, kind }
    }
  }
  return { originMm, snapped }
}
