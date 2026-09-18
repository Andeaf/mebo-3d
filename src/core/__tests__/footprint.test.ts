import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams } from '@core/cabinet'
import {
  cabinetFootprintSize,
  frontFaceCoordinate,
  placedCabinetRect,
  rectsOverlap,
  rotatedFootprintSize,
  sceneBoundingRect,
  sceneHasOverlap,
  unionRect
} from '@core/footprint'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings } from '@core/worktop'

export function makePlaced(
  id: string,
  positionX: number,
  positionZ: number,
  rotationDeg: RotationDegrees = 0,
  widthMm = 600,
  depthMm = 560
): PlacedCabinet {
  return {
    id,
    design: {
      kind: 'base-cabinet',
      params: { ...createDefaultBaseCabinetParams(), widthMm, depthMm }
    },
    positionX,
    positionZ,
    rotationDeg
  }
}

function makeScene(...cabinets: PlacedCabinet[]): SceneDesign {
  return { room: createDefaultRoom(), worktop: createDefaultWorktopSettings(), cabinets }
}

describe('footprint sizes and rects', () => {
  it('uses the carcass width × depth as footprint', () => {
    const placed = makePlaced('a', 0, 0)
    expect(cabinetFootprintSize(placed.design)).toEqual({ widthMm: 600, depthMm: 560 })
  })

  it('swaps the footprint axes at 90° and 270°', () => {
    const size = { widthMm: 600, depthMm: 560 }
    expect(rotatedFootprintSize(size, 0)).toEqual(size)
    expect(rotatedFootprintSize(size, 180)).toEqual(size)
    expect(rotatedFootprintSize(size, 90)).toEqual({ widthMm: 560, depthMm: 600 })
    expect(rotatedFootprintSize(size, 270)).toEqual({ widthMm: 560, depthMm: 600 })
  })

  it('computes a center-based world rect', () => {
    expect(placedCabinetRect(makePlaced('a', 1000, 2000))).toEqual({
      minX: 700,
      maxX: 1300,
      minZ: 1720,
      maxZ: 2280
    })
    expect(placedCabinetRect(makePlaced('a', 1000, 2000, 90))).toEqual({
      minX: 720,
      maxX: 1280,
      minZ: 1700,
      maxZ: 2300
    })
  })

  it('reports the front face coordinate per rotation', () => {
    // rotation 0 faces +Z: front at z = 280
    expect(frontFaceCoordinate(makePlaced('a', 0, 0, 0))).toBe(280)
    // rotation 90 faces +X: footprint is 560 wide, front at x = 280
    expect(frontFaceCoordinate(makePlaced('a', 0, 0, 90))).toBe(280)
    expect(frontFaceCoordinate(makePlaced('a', 0, 0, 180))).toBe(280)
    expect(frontFaceCoordinate(makePlaced('a', 0, 0, 270))).toBe(280)
  })
})

describe('rectsOverlap', () => {
  const base = placedCabinetRect(makePlaced('a', 0, 0))

  it('detects a clear overlap', () => {
    expect(rectsOverlap(base, placedCabinetRect(makePlaced('b', 500, 0)))).toBe(true)
  })

  it('treats flush edge contact as NOT overlapping', () => {
    expect(rectsOverlap(base, placedCabinetRect(makePlaced('b', 600, 0)))).toBe(false)
  })

  it('tolerates sub-epsilon intrusion but flags anything beyond it', () => {
    expect(rectsOverlap(base, placedCabinetRect(makePlaced('b', 599.6, 0)))).toBe(false)
    expect(rectsOverlap(base, placedCabinetRect(makePlaced('b', 599, 0)))).toBe(true)
  })

  it('ignores diagonal proximity without intrusion on both axes', () => {
    expect(rectsOverlap(base, placedCabinetRect(makePlaced('b', 600, 560)))).toBe(false)
  })
})

describe('scene overlap and bounds', () => {
  it('accepts a flush run and rejects an intruding cabinet', () => {
    const flush = makeScene(makePlaced('a', 0, 0), makePlaced('b', 600, 0), makePlaced('c', 1200, 0))
    expect(sceneHasOverlap(flush)).toBe(false)
    expect(sceneHasOverlap(makeScene(makePlaced('a', 0, 0), makePlaced('b', 550, 0)))).toBe(true)
  })

  it('computes the union bounding rect', () => {
    expect(unionRect([])).toBeNull()
    const scene = makeScene(makePlaced('a', 0, 0), makePlaced('b', 600, 0))
    expect(sceneBoundingRect(scene)).toEqual({ minX: -300, maxX: 900, minZ: -280, maxZ: 280 })
  })
})
