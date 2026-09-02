import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams } from '@core/cabinet'
import { sceneHasOverlap } from '@core/footprint'
import { createDefaultRoom } from '@core/room'
import type { SceneDesign } from '@core/scene'
import {
  connectedRun,
  placeWithoutOverlap,
  resolveNonOverlapping,
  resolveSnap,
  spawnPlacement
} from '@core/snap'
import { makePlaced } from './footprint.test'

// All cabinets are 600 wide × 560 deep unless stated otherwise.
const cabA = makePlaced('a', 0, 0)

function scene(...cabinets: ReturnType<typeof makePlaced>[]): SceneDesign {
  return { room: createDefaultRoom(), cabinets }
}

describe('resolveSnap', () => {
  it('snaps a side within 30 mm flush, aligning fronts with a parallel neighbor', () => {
    // b attempted at (620, 5): 20 mm side gap, 5 mm front offset
    const result = resolveSnap(makePlaced('b', 620, 5), [cabA])
    expect(result).toEqual({ positionX: 600, positionZ: 0, snapped: true })
  })

  it('snaps a slightly overlapping side back out to flush', () => {
    const result = resolveSnap(makePlaced('b', 585, 0), [cabA])
    expect(result).toEqual({ positionX: 600, positionZ: 0, snapped: true })
  })

  it('does not snap beyond the snap distance', () => {
    const result = resolveSnap(makePlaced('b', 700, 40), [cabA])
    expect(result).toEqual({ positionX: 700, positionZ: 40, snapped: false })
  })

  it('snaps a perpendicular cabinet flush without aligning fronts', () => {
    // b rotated 90°: footprint 560 wide; left edge at 595 − 280 = 315, 15 mm from a's side
    const result = resolveSnap(makePlaced('b', 595, 100, 90), [cabA])
    expect(result).toEqual({ positionX: 580, positionZ: 100, snapped: true })
  })

  it('ignores side proximity when the cabinets do not face each other on the other axis', () => {
    // b far behind a: x edges are close but z bands are 240 mm apart
    const result = resolveSnap(makePlaced('b', 610, 800), [cabA])
    expect(result.snapped).toBe(false)
  })
})

describe('resolveNonOverlapping', () => {
  it('keeps a free attempted position (with live snap applied)', () => {
    const result = resolveNonOverlapping(makePlaced('b', 620, 5), [cabA])
    expect(result).toEqual({ positionX: 600, positionZ: 0 })
  })

  it('resolves a drop on top of a neighbor to the nearest free flush spot', () => {
    // attempted (100, 10) overlaps a; nearest free flush candidate is right of a,
    // and the refine pass clicks the 10 mm front offset into alignment
    const result = resolveNonOverlapping(makePlaced('b', 100, 10), [cabA])
    expect(result).toEqual({ positionX: 600, positionZ: 0 })
  })

  it('resolves a dead-center drop deterministically', () => {
    const result = resolveNonOverlapping(makePlaced('b', 0, 0), [cabA])
    expect(result).toEqual({ positionX: 0, positionZ: -560 })
  })

  it('resolves a drop into a fully surrounded center to a free diagonal pocket', () => {
    // Surround a on all four sides, then drop exactly on its center: the four
    // straight flush spots are all taken, the nearest free spot is a diagonal
    // pocket (flush against both the left and the back neighbor).
    const others = [
      cabA,
      makePlaced('left', -600, 0),
      makePlaced('right', 600, 0),
      makePlaced('back', 0, -560),
      makePlaced('front', 0, 560)
    ]
    const result = resolveNonOverlapping(makePlaced('b', 0, 0), others)
    expect(result).toEqual({ positionX: -600, positionZ: -560 })
    expect(
      sceneHasOverlap(scene(...others, makePlaced('b', result.positionX, result.positionZ)))
    ).toBe(false)
  })
})

describe('placeWithoutOverlap', () => {
  it('re-resolves a widened cabinet against its flush neighbor', () => {
    const initial = scene(cabA, makePlaced('b', 600, 0))
    const widened = {
      ...initial.cabinets[1],
      design: {
        kind: 'base-cabinet' as const,
        params: { ...createDefaultBaseCabinetParams(), widthMm: 700 }
      }
    }
    const result = placeWithoutOverlap(initial, widened)
    expect(result.cabinets[1].positionX).toBe(650) // flush again: 300 + 350
    expect(result.cabinets[1].positionZ).toBe(0)
    expect(sceneHasOverlap(result)).toBe(false)
  })

  it('appends a cabinet with an unknown id', () => {
    const result = placeWithoutOverlap(scene(cabA), makePlaced('new', 900, 0))
    expect(result.cabinets.map((cabinet) => cabinet.id)).toEqual(['a', 'new'])
    expect(sceneHasOverlap(result)).toBe(false)
  })
})

describe('spawnPlacement', () => {
  const defaultDesign = {
    kind: 'base-cabinet' as const,
    params: createDefaultBaseCabinetParams()
  }

  it('starts at the origin for an empty scene', () => {
    expect(spawnPlacement({ room: createDefaultRoom(), cabinets: [] }, defaultDesign)).toEqual({
      positionX: 0,
      positionZ: 0,
      rotationDeg: 0
    })
  })

  it('spawns flush to the right of the last cabinet', () => {
    expect(spawnPlacement(scene(cabA), defaultDesign)).toEqual({
      positionX: 600,
      positionZ: 0,
      rotationDeg: 0
    })
  })

  it('follows the last cabinet’s rotation, fronts aligned', () => {
    const rotated = makePlaced('a', 0, 0, 90)
    expect(spawnPlacement(scene(rotated), defaultDesign)).toEqual({
      positionX: 0,
      positionZ: -600,
      rotationDeg: 90
    })
  })

  it('aligns fronts when depths differ', () => {
    const deep = makePlaced('a', 0, 0, 0, 600, 700) // front at z = 350
    const result = spawnPlacement(scene(deep), defaultDesign)
    expect(result.positionX).toBe(600)
    expect(result.positionZ).toBe(70) // 560-deep cabinet centered so its front is also at 350
  })
})

describe('connectedRun', () => {
  it('sums a flush, front-aligned run and sorts members along the axis', () => {
    const run = connectedRun(
      scene(makePlaced('a', 0, 0), makePlaced('b', 600, 0), makePlaced('c', 1200, 0)),
      'b'
    )
    expect(run).not.toBeNull()
    expect(run?.memberIds).toEqual(['a', 'b', 'c'])
    expect(run?.totalWidthMm).toBe(1800)
    expect(run?.axis).toBe('x')
    expect(run?.runRect).toEqual({ minX: -300, maxX: 1500, minZ: -280, maxZ: 280 })
  })

  it('excludes cabinets separated by a gap', () => {
    const run = connectedRun(
      scene(makePlaced('a', 0, 0), makePlaced('b', 600, 0), makePlaced('d', 1900, 0)),
      'a'
    )
    expect(run?.memberIds).toEqual(['a', 'b'])
    expect(run?.totalWidthMm).toBe(1200)
  })

  it('breaks the run on front misalignment and rotation differences', () => {
    const misaligned = connectedRun(
      scene(makePlaced('a', 0, 0), makePlaced('b', 600, 50)),
      'a'
    )
    expect(misaligned?.memberIds).toEqual(['a'])

    const rotated = connectedRun(
      scene(makePlaced('a', 0, 0), makePlaced('b', 580, 20, 90)),
      'a'
    )
    expect(rotated?.memberIds).toEqual(['a'])
  })

  it('returns null for an unknown cabinet', () => {
    expect(connectedRun(scene(cabA), 'nope')).toBeNull()
  })
})
