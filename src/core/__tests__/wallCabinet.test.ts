import { describe, expect, it } from 'vitest'
import type { Panel, PanelRole } from '@core/panel'
import {
  clampWallCabinetParams,
  createDefaultWallCabinetParams,
  generateWallCabinet,
  validateWallCabinetParams,
  type WallCabinetParams
} from '@core/catalog/wallCabinet'
import { designVerticalExtent } from '@core/catalog/registry'

// Default: 600 × 720 × 320 mm at 1450 mm, 2 shelves, 2 doors.
const defaults = createDefaultWallCabinetParams()

function withParams(patch: Partial<WallCabinetParams>): WallCabinetParams {
  return { ...defaults, ...patch }
}

function byRole(panels: readonly Panel[], role: PanelRole): Panel[] {
  return panels.filter((panel) => panel.role === role)
}

function single(panels: readonly Panel[], role: PanelRole): Panel {
  const matches = byRole(panels, role)
  expect(matches).toHaveLength(1)
  return matches[0]
}

describe('generateWallCabinet', () => {
  it('closes the carcass with a full top as well as a full bottom', () => {
    const build = generateWallCabinet(defaults)
    // 2 sides + bottom + top + back + 2 shelves + 2 doors
    expect(build.panels).toHaveLength(9)

    const top = single(build.panels, 'top')
    const bottom = single(build.panels, 'bottom')
    for (const panel of [top, bottom]) {
      expect(panel.lengthMm).toBe(564) // 600 − 2 × 18
      expect(panel.widthMm).toBe(320)
      expect(panel.edgeBanding?.edges).toEqual(['length-1'])
    }
    // Top under the top edge, bottom on the bottom edge.
    expect(top.box.center.y).toBe(720 - 9)
    expect(bottom.box.center.y).toBe(9)

    expect(byRole(build.panels, 'stretcher-front')).toHaveLength(0)
    expect(byRole(build.panels, 'stretcher-back')).toHaveLength(0)
  })

  it('builds sides, back, shelves and doors like the rest of the catalog', () => {
    const build = generateWallCabinet(defaults)

    const left = single(build.panels, 'side-left')
    expect(left.lengthMm).toBe(720)
    expect(left.widthMm).toBe(320)

    const back = single(build.panels, 'back')
    expect(back.thicknessMm).toBe(3)
    expect(back.lengthMm).toBe(700) // 720 − 36 + 2 × 8 rebate overlap
    expect(back.widthMm).toBe(580)

    const shelves = byRole(build.panels, 'shelf')
    expect(shelves).toHaveLength(2)
    // interior = 720 − 36 = 684, thirds at 246 / 474
    expect(shelves.map((shelf) => shelf.box.center.y)).toEqual([246, 474])
    expect(shelves[0].widthMm).toBe(294) // 320 − 4 (back) − 2 − 20 setback

    const doors = byRole(build.panels, 'door')
    expect(doors).toHaveLength(2)
    for (const door of doors) {
      expect(door.lengthMm).toBe(716)
      expect(door.widthMm).toBeCloseTo(296.5, 6)
      expect(door.edgeBanding?.edges).toHaveLength(4)
    }
    expect(doors[0].box.center.z).toBe(320 + 9)
  })

  it('keeps the mounting height out of the build', () => {
    const low = generateWallCabinet(withParams({ mountingHeightMm: 900 }))
    const high = generateWallCabinet(withParams({ mountingHeightMm: 2000 }))
    expect(low.panels).toEqual(high.panels)
    expect(low.boundingSizeMm).toEqual({ x: 600, y: 720, z: 338 })
  })

  it('adds two hanging brackets on top of the door hardware', () => {
    expect(generateWallCabinet(defaults).hardware).toEqual([
      { materialId: 'hinge-standard', quantity: 4 },
      { materialId: 'handle-standard', quantity: 2 },
      { materialId: 'hanging-bracket', quantity: 2 }
    ])
    // An open wall cabinet still has to hang on something.
    expect(generateWallCabinet(withParams({ doorCount: 0 })).hardware).toEqual([
      { materialId: 'hanging-bracket', quantity: 2 }
    ])
  })

  it('rejects out-of-range parameters', () => {
    expect(() => generateWallCabinet(withParams({ depthMm: 560 }))).toThrow(/depthMm/)
    expect(() => generateWallCabinet(withParams({ mountingHeightMm: 400 }))).toThrow(
      /mountingHeightMm/
    )
    expect(() => generateWallCabinet(withParams({ shelfCount: 5 }))).toThrow(/shelfCount/)
  })
})

describe('wall cabinet params', () => {
  it('clamps every numeric parameter into its allowed range', () => {
    const clamped = clampWallCabinetParams(
      withParams({ widthMm: 2000, heightMm: 100, depthMm: 560, mountingHeightMm: 3000, shelfCount: 9 })
    )
    expect(clamped).toMatchObject({
      widthMm: 1200,
      heightMm: 400,
      depthMm: 400,
      mountingHeightMm: 2200,
      shelfCount: 3
    })
  })

  it('applies the shared door-leaf rule', () => {
    expect(clampWallCabinetParams(withParams({ widthMm: 800, doorCount: 1 })).doorCount).toBe(2)
    expect(clampWallCabinetParams(withParams({ widthMm: 600, doorCount: 1 })).doorCount).toBe(1)
    expect(validateWallCabinetParams(withParams({ widthMm: 800, doorCount: 1 }))).toEqual([
      expect.stringContaining('doorCount 1')
    ])
  })
})

describe('wall cabinet elevation', () => {
  it('derives its vertical interval from the mounting height', () => {
    expect(designVerticalExtent({ kind: 'wall-cabinet', params: defaults })).toEqual({
      bottomMm: 1450,
      topMm: 2170
    })
    expect(
      designVerticalExtent({
        kind: 'wall-cabinet',
        params: withParams({ mountingHeightMm: 1600, heightMm: 600 })
      })
    ).toEqual({ bottomMm: 1600, topMm: 2200 })
  })
})
