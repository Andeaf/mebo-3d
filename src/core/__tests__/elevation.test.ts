import { describe, expect, it } from 'vitest'
import { createDefaultWallCabinetParams } from '@core/catalog/wallCabinet'
import { createDefaultDesign, type CabinetKind } from '@core/catalog/registry'
import {
  cabinetOverlapsOthers,
  intervalsOverlapMm,
  placedCabinetsCollide,
  placedVerticalInterval,
  sceneHasOverlap
} from '@core/footprint'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings } from '@core/worktop'
import { connectedRun, resolveNonOverlapping, resolveSnap, verticallyRelevant } from '@core/snap'

function place(
  id: string,
  kind: CabinetKind,
  positionX: number,
  positionZ: number,
  rotationDeg: RotationDegrees = 0
): PlacedCabinet {
  return { id, design: createDefaultDesign(kind), positionX, positionZ, rotationDeg }
}

/** A wall cabinet at a specific mounting height (defaults hang at 1450). */
function wall(id: string, positionX: number, positionZ: number, mountingHeightMm = 1450): PlacedCabinet {
  return {
    id,
    design: {
      kind: 'wall-cabinet',
      params: { ...createDefaultWallCabinetParams(), mountingHeightMm }
    },
    positionX,
    positionZ,
    rotationDeg: 0
  }
}

function scene(...cabinets: PlacedCabinet[]): SceneDesign {
  return { room: createDefaultRoom(), worktop: createDefaultWorktopSettings(), cabinets }
}

describe('vertical intervals', () => {
  it('reports the interval each kind occupies', () => {
    expect(placedVerticalInterval(place('a', 'base-cabinet', 0, 0))).toEqual({
      bottomMm: 0,
      topMm: 720
    })
    expect(placedVerticalInterval(place('a', 'tall-cabinet', 0, 0))).toEqual({
      bottomMm: 0,
      topMm: 2100
    })
    expect(placedVerticalInterval(place('a', 'drawer-cabinet', 0, 0))).toEqual({
      bottomMm: 0,
      topMm: 720
    })
    expect(placedVerticalInterval(wall('a', 0, 0))).toEqual({ bottomMm: 1450, topMm: 2170 })
  })

  it('treats flush stacking as touching, not overlapping', () => {
    // A wall cabinet whose bottom sits exactly on a tall cabinet's top.
    expect(intervalsOverlapMm({ bottomMm: 0, topMm: 1450 }, { bottomMm: 1450, topMm: 2170 })).toBe(
      false
    )
    expect(intervalsOverlapMm({ bottomMm: 0, topMm: 1450.4 }, { bottomMm: 1450, topMm: 2170 })).toBe(
      false
    )
    expect(intervalsOverlapMm({ bottomMm: 0, topMm: 1451 }, { bottomMm: 1450, topMm: 2170 })).toBe(
      true
    )
  })
})

describe('collision is rect AND interval', () => {
  it('lets a wall cabinet hang over a base cabinet on the same footprint', () => {
    const base = place('base', 'base-cabinet', 0, 0)
    const upper = wall('upper', 0, 0)
    expect(placedCabinetsCollide(base, upper)).toBe(false)
    expect(cabinetOverlapsOthers(upper, [base])).toBe(false)
    expect(sceneHasOverlap(scene(base, upper))).toBe(false)
  })

  it('still collides with a tall cabinet that reaches up into it', () => {
    const tall = place('tall', 'tall-cabinet', 0, 0)
    const upper = wall('upper', 0, 0)
    expect(placedCabinetsCollide(tall, upper)).toBe(true)
    expect(sceneHasOverlap(scene(tall, upper))).toBe(true)
  })

  it('mounted clear above a tall cabinet is legal again', () => {
    const tall = place('tall', 'tall-cabinet', 0, 0) // top at 2100
    expect(sceneHasOverlap(scene(tall, wall('upper', 0, 0, 2100)))).toBe(false)
  })
})

describe('vertical gating of snapping', () => {
  it('filters the cabinets a moving one can interact with', () => {
    const base = place('base', 'base-cabinet', 0, 0)
    const neighbour = wall('neighbour', 600, 0)
    const upper = wall('upper', 20, 0)
    expect(verticallyRelevant(upper, [base, neighbour]).map((c) => c.id)).toEqual(['neighbour'])
  })

  it('snaps two wall cabinets flush and aligns their fronts', () => {
    // b attempted 20 mm short of flush and 5 mm proud of a.
    const result = resolveSnap(wall('b', 620, 5), [wall('a', 0, 0)])
    expect(result).toEqual({ positionX: 600, positionZ: 0, snapped: true })
  })

  it('ignores the base cabinet underneath, both for snapping and for dropping', () => {
    const base = place('base', 'base-cabinet', 0, 0)
    // Dead centre over the base cabinet: no snap, and the drop stands.
    expect(resolveSnap(wall('upper', 0, 0), [base]).snapped).toBe(false)
    expect(resolveNonOverlapping(wall('upper', 0, 0), [base], createDefaultRoom())).toEqual({
      positionX: 0,
      positionZ: 0
    })
  })

  it('resolves a wall-on-wall drop as if the floor run were not there', () => {
    const dropped = wall('b', 100, 0)
    const upperOnly = [wall('a', 0, 0)]
    const withFloorRun = [
      ...upperOnly,
      place('base', 'base-cabinet', 600, 0),
      place('base2', 'base-cabinet', 0, 0)
    ]
    const resolved = resolveNonOverlapping(dropped, withFloorRun, createDefaultRoom())
    expect(resolved).toEqual(resolveNonOverlapping(dropped, upperOnly, createDefaultRoom()))
    expect(
      sceneHasOverlap(
        scene(...withFloorRun, {
          ...dropped,
          positionX: resolved!.positionX,
          positionZ: resolved!.positionZ
        })
      )
    ).toBe(false)
  })
})

describe('runs at a height', () => {
  it('measures wall cabinets among themselves, not the base run below', () => {
    const run = connectedRun(scene(place('base', 'base-cabinet', 0, 0), wall('u1', 0, 120), wall('u2', 600, 120)), 'u1')
    expect(run?.memberIds).toEqual(['u1', 'u2'])
    expect(run?.totalWidthMm).toBe(1200)
    expect(run?.bottomMm).toBe(1450)
  })

  it('keeps a base + tall pair in one mixed run on the floor', () => {
    const run = connectedRun(
      scene(place('base', 'base-cabinet', 0, 0), place('tall', 'tall-cabinet', 600, 0)),
      'base'
    )
    expect(run?.memberIds).toEqual(['base', 'tall'])
    expect(run?.totalWidthMm).toBe(1200)
    expect(run?.bottomMm).toBe(0)
  })

  it('reports the lowest member as the run bottom', () => {
    const run = connectedRun(scene(wall('u1', 0, 120, 1500), wall('u2', 600, 120, 1450)), 'u1')
    // Fronts align (same depth) and the intervals overlap, so they form a run.
    expect(run?.memberIds).toEqual(['u1', 'u2'])
    expect(run?.bottomMm).toBe(1450)
  })
})
