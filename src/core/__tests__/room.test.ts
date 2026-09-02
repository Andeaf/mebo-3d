import { describe, expect, it } from 'vitest'
import { rotatedFootprintSize, type FloorRect } from '@core/footprint'
import {
  clampCenterIntoRoom,
  clampRoom,
  createDefaultRoom,
  roomContainsRect,
  roomInteriorRect,
  roomWallSegments,
  validateRoom,
  wallInteriorNormal,
  type RoomDesign,
  type WallId
} from '@core/room'

// Default: 4000 × 3000 mm interior, 2600 mm walls, centred on the origin.
const defaults = createDefaultRoom()

function withRoom(patch: Partial<RoomDesign>): RoomDesign {
  return { ...defaults, ...patch }
}

function wall(room: RoomDesign, id: WallId) {
  const segment = roomWallSegments(room).find((candidate) => candidate.id === id)
  expect(segment).toBeDefined()
  return segment!
}

describe('room limits', () => {
  it('accepts the defaults unchanged', () => {
    expect(validateRoom(defaults)).toEqual([])
    expect(clampRoom(defaults)).toEqual(defaults)
  })

  it('clamps every dimension into its range and rounds to whole mm', () => {
    expect(clampRoom({ widthMm: 500, lengthMm: 99000, wallHeightMm: 1000 })).toEqual({
      widthMm: 2000,
      lengthMm: 10000,
      wallHeightMm: 2200
    })
    expect(clampRoom(withRoom({ widthMm: 4200.6 })).widthMm).toBe(4201)
  })

  it('reports out-of-range dimensions', () => {
    expect(validateRoom(withRoom({ widthMm: 500 }))).toEqual([expect.stringContaining('widthMm')])
    expect(validateRoom(withRoom({ wallHeightMm: 4000 }))).toEqual([
      expect.stringContaining('wallHeightMm')
    ])
  })
})

describe('roomInteriorRect', () => {
  it('centres the interior on the world origin', () => {
    expect(roomInteriorRect(defaults)).toEqual({
      minX: -2000,
      maxX: 2000,
      minZ: -1500,
      maxZ: 1500
    })
  })
})

describe('roomWallSegments', () => {
  it('describes four inner faces with their interior side', () => {
    const segments = roomWallSegments(defaults)
    expect(segments.map((segment) => segment.id)).toEqual(['back', 'front', 'left', 'right'])

    expect(wall(defaults, 'back')).toEqual({
      id: 'back',
      axis: 'z',
      faceMm: -1500,
      interiorSign: 1,
      fromMm: -2000,
      toMm: 2000
    })
    expect(wall(defaults, 'front')).toMatchObject({ axis: 'z', faceMm: 1500, interiorSign: -1 })
    expect(wall(defaults, 'left')).toMatchObject({ axis: 'x', faceMm: -2000, interiorSign: 1 })
    expect(wall(defaults, 'right')).toMatchObject({ axis: 'x', faceMm: 2000, interiorSign: -1 })

    // Side walls span the room's length, end walls its width.
    expect(wall(defaults, 'left').fromMm).toBe(-1500)
    expect(wall(defaults, 'left').toMm).toBe(1500)
  })

  it('points every interior normal into the room', () => {
    expect(wallInteriorNormal(wall(defaults, 'back'))).toEqual({ x: 0, z: 1 })
    expect(wallInteriorNormal(wall(defaults, 'front'))).toEqual({ x: 0, z: -1 })
    expect(wallInteriorNormal(wall(defaults, 'left'))).toEqual({ x: 1, z: 0 })
    expect(wallInteriorNormal(wall(defaults, 'right'))).toEqual({ x: -1, z: 0 })
  })

  it('tracks the room size', () => {
    const small = withRoom({ widthMm: 2000, lengthMm: 2000 })
    expect(wall(small, 'right').faceMm).toBe(1000)
    expect(wall(small, 'back').faceMm).toBe(-1000)
  })
})

describe('roomContainsRect', () => {
  const rect = (minX: number, maxX: number, minZ: number, maxZ: number): FloorRect => ({
    minX,
    maxX,
    minZ,
    maxZ
  })

  it('accepts a footprint well inside', () => {
    expect(roomContainsRect(defaults, rect(-300, 300, -280, 280))).toBe(true)
  })

  it('accepts a footprint flush against a wall', () => {
    expect(roomContainsRect(defaults, rect(-300, 300, -1500, -940))).toBe(true)
    expect(roomContainsRect(defaults, rect(1400, 2000, -280, 280))).toBe(true)
  })

  it('rejects a footprint intruding into a wall', () => {
    expect(roomContainsRect(defaults, rect(-300, 300, -1501, -941))).toBe(false)
    expect(roomContainsRect(defaults, rect(1401, 2001, -280, 280))).toBe(false)
  })

  it('tolerates sub-epsilon float noise, like the overlap rule', () => {
    expect(roomContainsRect(defaults, rect(-300, 300, -1500.4, -940))).toBe(true)
  })
})

describe('clampCenterIntoRoom', () => {
  const size = { widthMm: 600, depthMm: 560 }

  it('leaves a footprint that already fits', () => {
    expect(clampCenterIntoRoom(defaults, { positionX: 0, positionZ: 0 }, size)).toEqual({
      positionX: 0,
      positionZ: 0
    })
  })

  it('pulls a footprint back inside on both axes', () => {
    // 600 × 560 cabinet: centres live in ±1700 on X and ±1220 on Z.
    expect(clampCenterIntoRoom(defaults, { positionX: 5000, positionZ: -9000 }, size)).toEqual({
      positionX: 1700,
      positionZ: -1220
    })
  })

  it('accounts for the rotated footprint', () => {
    const rotated = rotatedFootprintSize(size, 90)
    expect(rotated).toEqual({ widthMm: 560, depthMm: 600 })
    expect(clampCenterIntoRoom(defaults, { positionX: 5000, positionZ: 5000 }, rotated)).toEqual({
      positionX: 1720,
      positionZ: 1200
    })
  })

  it('centres a footprint wider than the room instead of failing', () => {
    const huge = { widthMm: 9000, depthMm: 9000 }
    const small = withRoom({ widthMm: 2000, lengthMm: 2000 })
    expect(clampCenterIntoRoom(small, { positionX: 800, positionZ: -800 }, huge)).toEqual({
      positionX: 0,
      positionZ: 0
    })
  })
})
