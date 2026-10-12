import { describe, expect, it } from 'vitest'
import {
  addDrawer,
  addPresetPanel,
  createDefaultCustomPieceSpec,
  moveElement,
  type CustomPieceSpec
} from '@core/customPiece'
import { snapElementMove, MIDPOINT_SNAP_MM } from '@core/elementSnap'

/** A 1200 × 600 × 400 piece with two sides (inner faces at 18 and 1182) and a divider (panel-3). */
function withDivider(): CustomPieceSpec {
  let spec = createDefaultCustomPieceSpec('kast')
  for (const preset of ['side', 'side', 'divider'] as const) {
    spec = addPresetPanel(spec, preset)!.spec
  }
  return spec
}

/** The divider's origin at which its two gaps are equal: 18 + (1164 − 18) / 2. */
const MIDPOINT = 591

describe('snapElementMove', () => {
  it('lands a divider on the midpoint between the sides, not on the grid', () => {
    const spec = withDivider()
    const result = snapElementMove(spec, 'panel-3', { x: 595, y: 18, z: 4 }, 'snap')
    expect(result.originMm.x).toBe(MIDPOINT)
    expect(result.snapped).toEqual({ axis: 'x', kind: 'midpoint' })
    // The grid alone would have said 600.
    expect(MIDPOINT % 10).not.toBe(0)
  })

  it('snaps at exactly the tolerance and not one millimetre beyond (then the grid)', () => {
    const spec = withDivider()
    const edge = snapElementMove(spec, 'panel-3', { x: MIDPOINT + MIDPOINT_SNAP_MM, y: 18, z: 4 }, 'snap')
    expect(edge.originMm.x).toBe(MIDPOINT)
    expect(edge.snapped?.kind).toBe('midpoint')
    const beyond = snapElementMove(spec, 'panel-3', { x: MIDPOINT + MIDPOINT_SNAP_MM + 1, y: 18, z: 4 }, 'snap')
    expect(beyond.originMm.x).toBe(600)
    expect(beyond.snapped).toBeNull()
  })

  it('keeps the grid on the axes that are not the chain axis', () => {
    const spec = withDivider()
    const result = snapElementMove(spec, 'panel-3', { x: 595, y: 23, z: 7 }, 'snap')
    expect(result.originMm).toEqual({ x: MIDPOINT, y: 20, z: 10 })
  })

  it('gives the grid only when the element has no neighbours (the carcass faces are none)', () => {
    const lone = addPresetPanel(createDefaultCustomPieceSpec(), 'divider')!.spec
    const result = snapElementMove(lone, 'panel-1', { x: 594, y: 3, z: 4 }, 'snap')
    expect(result.originMm).toEqual({ x: 590, y: 0, z: 0 })
    expect(result.snapped).toBeNull()
    // One side only: still no pair of neighbours.
    const oneSide = addPresetPanel(addPresetPanel(createDefaultCustomPieceSpec(), 'side')!.spec, 'divider')!.spec
    expect(snapElementMove(oneSide, 'panel-2', { x: 603, y: 18, z: 4 }, 'snap').snapped).toBeNull()
  })

  it('free (Alt): the raw position in whole millimetres, nothing snapped', () => {
    const spec = withDivider()
    const result = snapElementMove(spec, 'panel-3', { x: 595.4, y: 18.6, z: 3.5 }, 'free')
    expect(result.originMm).toEqual({ x: 595, y: 19, z: 4 })
    expect(result.snapped).toBeNull()
  })

  it('snaps to a gap equal to another gap of the row when the midpoint is out of reach', () => {
    // Divider A fixed at x = 300 (gap 282 to the left side); B dragged near
    // the position at which its right gap is 282 too: 1182 − 282 − 18 = 882.
    let spec = withDivider()
    spec = moveElement(spec, 'panel-3', { x: 300, y: 18, z: 4 })
    spec = addPresetPanel(spec, 'divider')!.spec // panel-4
    const result = snapElementMove(spec, 'panel-4', { x: 878, y: 18, z: 4 }, 'snap')
    expect(result.originMm.x).toBe(882)
    expect(result.snapped).toEqual({ axis: 'x', kind: 'equal' })
    // The midpoint between A and the right side (741) wins when both are in reach.
    const near = snapElementMove(spec, 'panel-4', { x: 745, y: 18, z: 4 }, 'snap')
    expect(near.originMm.x).toBe(741)
    expect(near.snapped?.kind).toBe('midpoint')
  })

  it('a drawer snaps to the midpoint between the drawers above and below on y, and keeps the grid on x', () => {
    let spec = createDefaultCustomPieceSpec()
    spec = addDrawer(spec)!.spec // drawer-1: y 448–598
    spec = addDrawer(spec)!.spec // drawer-2 under it
    spec = addDrawer(spec)!.spec // drawer-3 under that
    spec = moveElement(spec, 'drawer-3', { x: 2, y: 100, z: 400 }) // 100–250
    // Midpoint for the 150 mm drawer-2 between 250 and 448: 250 + (198 − 150) / 2 = 274.
    const near = snapElementMove(spec, 'drawer-2', { x: 2, y: 280, z: 400 }, 'snap')
    expect(near.originMm.y).toBe(274)
    expect(near.snapped).toEqual({ axis: 'y', kind: 'midpoint' })
    // 300 would land on 296: a 2 mm gap above, equal to drawer-1's reveal
    // gap ("as wide as that one"); 320 is out of reach of everything.
    const equal = snapElementMove(spec, 'drawer-2', { x: 7, y: 300, z: 400 }, 'snap')
    expect(equal.originMm).toMatchObject({ x: 10, y: 296 })
    expect(equal.snapped).toEqual({ axis: 'y', kind: 'equal' })
    const far = snapElementMove(spec, 'drawer-2', { x: 7, y: 320, z: 400 }, 'snap')
    expect(far.originMm).toMatchObject({ x: 10, y: 320 })
    expect(far.snapped).toBeNull()
  })

  it('an unknown element gets the grid', () => {
    expect(snapElementMove(withDivider(), 'panel-9', { x: 13, y: 27, z: 4 }, 'snap')).toEqual({
      originMm: { x: 10, y: 30, z: 0 },
      snapped: null
    })
  })
})
