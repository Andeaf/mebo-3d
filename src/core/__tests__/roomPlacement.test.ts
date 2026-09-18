import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '@core/catalog/registry'
import { placedCabinetRect, sceneHasOverlap } from '@core/footprint'
import { createDefaultRoom, roomContainsRect, type RoomDesign } from '@core/room'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings } from '@core/worktop'
import { placeWithoutOverlap, resolveNonOverlapping, spawnPlacement } from '@core/snap'
import { makePlaced } from './footprint.test'

// Default room: 4000 × 3000 interior, so x ∈ [−2000, 2000], z ∈ [−1500, 1500].
const room = createDefaultRoom()

function scene(roomDesign: RoomDesign, ...cabinets: PlacedCabinet[]): SceneDesign {
  return { room: roomDesign, worktop: createDefaultWorktopSettings(), cabinets }
}

/** Every cabinet in the scene is inside the room and free of overlaps. */
function sceneIsLegal(design: SceneDesign): boolean {
  return (
    !sceneHasOverlap(design) &&
    design.cabinets.every((cabinet) =>
      roomContainsRect(design.room, placedCabinetRect(cabinet))
    )
  )
}

describe('containment in the gate', () => {
  it('pulls an attempted position outside the room back inside, flush to the wall', () => {
    // Dropped far beyond the right wall: 600 wide → centre clamps to 1700.
    const result = resolveNonOverlapping(makePlaced('b', 9000, 0), [], room)
    expect(result).toEqual({ positionX: 1700, positionZ: 0 })
  })

  it('resolves a drop straddling a wall to flush against it', () => {
    // Half outside the back wall (centre −1400, depth 560 → minZ −1680).
    const result = resolveNonOverlapping(makePlaced('b', 0, -1400), [], room)
    expect(result).toEqual({ positionX: 0, positionZ: -1220 })
  })

  it('clamps both axes at once in a corner', () => {
    const result = resolveNonOverlapping(makePlaced('b', -9000, 9000), [], room)
    expect(result).toEqual({ positionX: -1700, positionZ: 1220 })
  })

  it('accounts for the rotated footprint when clamping', () => {
    // Rotated 90°: footprint is 560 wide × 600 deep.
    const result = resolveNonOverlapping(makePlaced('b', 9000, 9000, 90), [], room)
    expect(result).toEqual({ positionX: 1720, positionZ: 1200 })
  })

  it('keeps a legal position untouched', () => {
    expect(resolveNonOverlapping(makePlaced('b', 500, 200), [], room)).toEqual({
      positionX: 500,
      positionZ: 200
    })
  })

  it('never lets the scene hold a cabinet outside the room', () => {
    let current = scene(room)
    for (const [x, z] of [
      [0, 0],
      [9000, 0],
      [-9000, -9000],
      [0, 9000],
      [1900, 1400]
    ] as const) {
      current = placeWithoutOverlap(current, makePlaced(`c-${x}-${z}`, x, z))
    }
    expect(current.cabinets).toHaveLength(5)
    expect(sceneIsLegal(current)).toBe(true)
  })

  it('resolves a drop that is both out of the room and on a neighbour', () => {
    const neighbour = makePlaced('a', 1700, 0) // already flush to the right wall
    const result = resolveNonOverlapping(makePlaced('b', 9000, 0), [neighbour], room)
    expect(result).not.toBeNull()
    const placed = makePlaced('b', result!.positionX, result!.positionZ)
    expect(roomContainsRect(room, placedCabinetRect(placed))).toBe(true)
    expect(sceneIsLegal(scene(room, neighbour, placed))).toBe(true)
  })

  it('rejects the update when the room has no free spot left', () => {
    // A 2000 × 2000 room packed with 600 × 560 cabinets on a tight grid.
    const small: RoomDesign = { widthMm: 2000, lengthMm: 2000, wallHeightMm: 2600 }
    const packed: PlacedCabinet[] = []
    for (let ix = 0; ix < 3; ix += 1) {
      for (let iz = 0; iz < 3; iz += 1) {
        packed.push(makePlaced(`p-${ix}-${iz}`, -700 + ix * 600, -720 + iz * 560))
      }
    }
    const full = scene(small, ...packed)
    expect(sceneIsLegal(full)).toBe(true)

    expect(resolveNonOverlapping(makePlaced('extra', 0, 0), packed, small)).toBeNull()
    // The gate rejects the whole update instead of breaking the invariant.
    const after = placeWithoutOverlap(full, makePlaced('extra', 0, 0))
    expect(after).toBe(full)
    expect(after.cabinets).toHaveLength(9)
  })
})

describe('spawning inside the room', () => {
  const design = createDefaultDesign('base-cabinet')

  it('puts the first cabinet back-to-the-wall, centred', () => {
    expect(spawnPlacement(scene(room), design)).toEqual({
      positionX: 0,
      positionZ: -1220,
      rotationDeg: 0
    })
  })

  it('follows the room depth', () => {
    const deep: RoomDesign = { ...room, lengthMm: 6000 }
    expect(spawnPlacement(scene(deep), design).positionZ).toBe(-2720)
  })

  it('keeps a run that would leave the room inside it', () => {
    // Fill the back wall rightwards until the next spawn would pass x = 2000.
    let current = scene(room)
    for (let i = 0; i < 8; i += 1) {
      const spawn = spawnPlacement(current, design)
      current = placeWithoutOverlap(current, {
        id: `cab-${i + 1}`,
        design,
        positionX: spawn.positionX,
        positionZ: spawn.positionZ,
        rotationDeg: spawn.rotationDeg
      })
    }
    expect(current.cabinets.length).toBeGreaterThan(0)
    expect(sceneIsLegal(current)).toBe(true)
    for (const cabinet of current.cabinets) {
      expect(placedCabinetRect(cabinet).maxX).toBeLessThanOrEqual(2000.5)
    }
  })

  it('spawns rotated cabinets inside the room too', () => {
    const rotated: RotationDegrees = 90
    const first = makePlaced('a', 1700, 0, rotated)
    const spawn = spawnPlacement(scene(room, first), design)
    const placed = placeWithoutOverlap(scene(room, first), {
      id: 'b',
      design,
      positionX: spawn.positionX,
      positionZ: spawn.positionZ,
      rotationDeg: spawn.rotationDeg
    })
    expect(sceneIsLegal(placed)).toBe(true)
  })
})
