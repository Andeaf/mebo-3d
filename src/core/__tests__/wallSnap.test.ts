import { describe, expect, it } from 'vitest'
import { cabinetOverlapsOthers, placedCabinetRect } from '@core/footprint'
import {
  createDefaultRoom,
  roomContainsRect,
  roomWallSegments,
  type RoomDesign,
  type WallId,
  type WallSegment
} from '@core/room'
import type { PlacedCabinet, RotationDegrees } from '@core/scene'
import {
  resolveDragPose,
  resolveSnapInRoom,
  rotationFacingAwayFrom,
  wallFlushDelta,
  SNAP_DISTANCE_MM
} from '@core/snap'
import { makePlaced } from './footprint.test'

// Default room: 4000 × 3000 → walls at x = ±2000, z = ±1500.
// Default cabinet: 600 wide × 560 deep.
const room = createDefaultRoom()

function wall(id: WallId, design: RoomDesign = room): WallSegment {
  const segment = roomWallSegments(design).find((candidate) => candidate.id === id)
  expect(segment).toBeDefined()
  return segment!
}

/** Centre that puts a cabinet's back flush against the named wall. */
const FLUSH = {
  back: { positionX: 0, positionZ: -1220, rotationDeg: 0 as RotationDegrees },
  front: { positionX: 0, positionZ: 1220, rotationDeg: 180 as RotationDegrees },
  left: { positionX: -1720, positionZ: 0, rotationDeg: 90 as RotationDegrees },
  right: { positionX: 1720, positionZ: 0, rotationDeg: 270 as RotationDegrees }
} as const

describe('rotationFacingAwayFrom', () => {
  it('turns the front into the room for every wall', () => {
    expect(rotationFacingAwayFrom(wall('back'))).toBe(0)
    expect(rotationFacingAwayFrom(wall('right'))).toBe(270)
    expect(rotationFacingAwayFrom(wall('front'))).toBe(180)
    expect(rotationFacingAwayFrom(wall('left'))).toBe(90)
  })
})

describe('wallFlushDelta', () => {
  it('measures the shift onto the wall face, signed towards it', () => {
    // Back wall at z = −1500; a cabinet at z = −1200 has minZ = −1480, so it
    // must move 20 mm further back.
    expect(wallFlushDelta(wall('back'), placedCabinetRect(makePlaced('a', 0, -1200)))).toBe(-20)
    // Right wall at x = 2000; cabinet at x = 1690 has maxX = 1990 → +10.
    expect(wallFlushDelta(wall('right'), placedCabinetRect(makePlaced('a', 1690, 0)))).toBe(10)
  })
})

describe('back-to-wall snapping, all four walls', () => {
  it('snaps flush when the cabinet already faces away from the wall', () => {
    for (const [id, target] of Object.entries(FLUSH)) {
      // Start 20 mm shy of the wall, already correctly rotated.
      const normalX = target.positionX === 0 ? 0 : Math.sign(target.positionX)
      const normalZ = target.positionZ === 0 ? 0 : Math.sign(target.positionZ)
      const start = makePlaced(
        'b',
        target.positionX - normalX * 20,
        target.positionZ - normalZ * 20,
        target.rotationDeg
      )
      const pose = resolveDragPose(start, [], room)
      expect({ id, ...pose }).toEqual({
        id,
        positionX: target.positionX,
        positionZ: target.positionZ,
        rotationDeg: target.rotationDeg,
        snapped: true
      })
    }
  })

  it('turns the cabinet so its back goes against the wall', () => {
    // Dragged towards the right wall while still facing +Z: it should end up
    // flush AND rotated to 270 so the back is against that wall.
    const start = makePlaced('b', 1700, 0, 0)
    const pose = resolveDragPose(start, [], room)
    expect(pose.rotationDeg).toBe(270)
    expect(pose.positionX).toBe(1720)
    expect(pose.snapped).toBe(true)
  })

  it('turns towards the back wall from a side-on rotation', () => {
    const start = makePlaced('b', 0, -1210, 90)
    const pose = resolveDragPose(start, [], room)
    expect(pose.rotationDeg).toBe(0)
    expect(pose.positionZ).toBe(-1220)
  })

  it('leaves a cabinet in open floor alone', () => {
    const pose = resolveDragPose(makePlaced('b', 0, 0), [], room)
    expect(pose).toEqual({ positionX: 0, positionZ: 0, rotationDeg: 0, snapped: false })
  })

  it('does not reach past the snap distance', () => {
    const justOut = makePlaced('b', 0, -1220 + SNAP_DISTANCE_MM + 1)
    expect(resolveDragPose(justOut, [], room).snapped).toBe(false)
  })
})

describe('corner placement', () => {
  it('goes flush against both walls at once', () => {
    // Near the back-left corner, 15 mm off each wall, already facing the room.
    const start = makePlaced('b', -1705, -1205, 0)
    const pose = resolveDragPose(start, [], room)
    expect(pose.positionX).toBe(-1700) // 600 wide against x = −2000
    expect(pose.positionZ).toBe(-1220) // 560 deep against z = −1500
    expect(pose.snapped).toBe(true)
  })

  it('keeps one rotation in the corner', () => {
    const pose = resolveDragPose(makePlaced('b', 1700, -1210, 0), [], room)
    // Both the right and the back wall are in range; the pose is a single
    // rotation with the cabinet flush on both axes for that rotation.
    const placed: PlacedCabinet = {
      ...makePlaced('b', pose.positionX, pose.positionZ, pose.rotationDeg)
    }
    const rect = placedCabinetRect(placed)
    expect(Math.min(Math.abs(rect.maxX - 2000), Math.abs(rect.minZ + 1500))).toBeLessThanOrEqual(0.5)
  })
})

describe('walls versus neighbours', () => {
  it('lets the nearer neighbour win over a farther wall', () => {
    // Neighbour flush at the back wall; b is 10 mm from its side and 25 mm
    // from the back wall — the neighbour is the smaller move.
    const neighbour = makePlaced('a', 0, -1220)
    const start = makePlaced('b', 610, -1195)
    const pose = resolveDragPose(start, [neighbour], room)
    expect(pose.positionX).toBe(600)
  })

  it('lets the nearer wall win over a farther neighbour', () => {
    const neighbour = makePlaced('a', 0, -1220)
    // b is 5 mm off the back wall and 25 mm from the neighbour's side.
    const start = makePlaced('b', 625, -1215)
    const pose = resolveDragPose(start, [neighbour], room)
    expect(pose.positionZ).toBe(-1220)
  })

  it('combines a wall on one axis with a neighbour on the other', () => {
    const neighbour = makePlaced('a', 0, -1220)
    // 15 mm off the neighbour's side and 12 mm off the back wall: both apply.
    const start = makePlaced('b', 615, -1208)
    const pose = resolveDragPose(start, [neighbour], room)
    expect(pose.positionX).toBe(600)
    expect(pose.positionZ).toBe(-1220)
    expect(pose.snapped).toBe(true)
  })

  it('backs against the same wall as its neighbour, so the backs align', () => {
    const neighbour = makePlaced('a', 0, -1220)
    const pose = resolveDragPose(makePlaced('b', 610, -1210), [neighbour], room)
    const placed = makePlaced('b', pose.positionX, pose.positionZ, pose.rotationDeg)
    expect(placedCabinetRect(placed).minZ).toBe(placedCabinetRect(neighbour).minZ)
  })

  it('only ever reports a snap it can legally take', () => {
    // Sweeping the area around a corner neighbour: whenever the drag claims a
    // snap, that pose must be free — the competition filters, not the store.
    const neighbour = makePlaced('a', -1700, -1220)
    for (const dx of [-60, -30, 0, 30, 60]) {
      for (const dz of [-30, 0, 30, 60]) {
        const pose = resolveDragPose(makePlaced('b', -1100 + dx, -1220 + dz), [neighbour], room)
        if (!pose.snapped) {
          continue
        }
        const placed = makePlaced('b', pose.positionX, pose.positionZ, pose.rotationDeg)
        expect(cabinetOverlapsOthers(placed, [neighbour])).toBe(false)
        expect(roomContainsRect(room, placedCabinetRect(placed))).toBe(true)
      }
    }
  })
})

describe('dragging past a wall', () => {
  it('glides along the wall instead of freezing', () => {
    // Pointer well outside the room to the right, level with the middle.
    const pose = resolveDragPose(makePlaced('b', 9000, 200, 0), [], room)
    expect(pose.positionX).toBe(1720) // rotated flush against the right wall
    expect(pose.rotationDeg).toBe(270)
    expect(pose.positionZ).toBe(200) // free to slide along it
  })
})

describe('resolveSnapInRoom', () => {
  it('snaps to walls without ever rotating', () => {
    const result = resolveSnapInRoom(makePlaced('b', 1700, 0, 0), [], room)
    expect(result).toEqual({ positionX: 1700, positionZ: 0, snapped: false })
  })

  it('snaps a correctly rotated cabinet flush to the wall', () => {
    const result = resolveSnapInRoom(makePlaced('b', 1700, 0, 270), [], room)
    expect(result).toEqual({ positionX: 1720, positionZ: 0, snapped: true })
  })
})
