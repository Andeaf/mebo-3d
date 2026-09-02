import { describe, expect, it } from 'vitest'
import type { Panel, PanelRole } from '@core/panel'
import { designVerticalExtent } from '@core/catalog/registry'
import {
  clampTallCabinetParams,
  createDefaultTallCabinetParams,
  generateTallCabinet,
  tallHingesPerDoor,
  type TallCabinetParams
} from '@core/catalog/tallCabinet'

// Default: 600 × 2100 × 560 mm, 4 shelves, 2 full-height doors.
const defaults = createDefaultTallCabinetParams()

function withParams(patch: Partial<TallCabinetParams>): TallCabinetParams {
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

describe('generateTallCabinet', () => {
  it('builds a full-height carcass closed by a top panel', () => {
    const build = generateTallCabinet(defaults)
    // 2 sides + bottom + top + back + 4 shelves + 2 doors
    expect(build.panels).toHaveLength(11)

    const left = single(build.panels, 'side-left')
    expect(left.lengthMm).toBe(2100)
    expect(left.widthMm).toBe(560)

    const top = single(build.panels, 'top')
    expect(top.lengthMm).toBe(564)
    expect(top.box.center.y).toBe(2100 - 9)
    expect(byRole(build.panels, 'stretcher-front')).toHaveLength(0)

    const back = single(build.panels, 'back')
    expect(back.lengthMm).toBe(2080) // 2100 − 36 + 2 × 8
    expect(build.boundingSizeMm).toEqual({ x: 600, y: 2100, z: 578 })
  })

  it('spaces six shelves evenly over the interior height', () => {
    const centers = byRole(generateTallCabinet(withParams({ shelfCount: 6 })).panels, 'shelf').map(
      (shelf) => shelf.box.center.y
    )
    // interior = 2100 − 36 = 2064, sevenths from 18 + 294.857…
    expect(centers).toHaveLength(6)
    for (let i = 0; i < centers.length; i += 1) {
      expect(centers[i]).toBeCloseTo(18 + (2064 * (i + 1)) / 7, 6)
    }
  })

  it('gives the doors the full carcass height', () => {
    const doors = byRole(generateTallCabinet(defaults).panels, 'door')
    expect(doors).toHaveLength(2)
    for (const door of doors) {
      expect(door.lengthMm).toBe(2096) // 2100 − 2 × 2 reveal
      expect(door.widthMm).toBeCloseTo(296.5, 6)
      expect(door.edgeBanding?.edges).toHaveLength(4)
    }
  })

  it('prices five hinges per leaf on a 2100 mm cabinet', () => {
    expect(generateTallCabinet(defaults).hardware).toEqual([
      { materialId: 'hinge-standard', quantity: 10 },
      { materialId: 'handle-standard', quantity: 2 }
    ])
  })

  it('rejects base-cabinet heights', () => {
    expect(() => generateTallCabinet(withParams({ heightMm: 720 }))).toThrow(/heightMm/)
  })
})

describe('tallHingesPerDoor', () => {
  it('steps up at the table boundaries', () => {
    expect(tallHingesPerDoor(900)).toBe(2)
    expect(tallHingesPerDoor(901)).toBe(3)
    expect(tallHingesPerDoor(1600)).toBe(3)
    expect(tallHingesPerDoor(1601)).toBe(4)
    expect(tallHingesPerDoor(2000)).toBe(4)
    expect(tallHingesPerDoor(2001)).toBe(5)
  })
})

describe('tall cabinet params', () => {
  it('pins the depth to its single allowed value', () => {
    expect(clampTallCabinetParams(withParams({ depthMm: 300 })).depthMm).toBe(560)
    expect(clampTallCabinetParams(withParams({ depthMm: 900 })).depthMm).toBe(560)
  })

  it('clamps height and shelves and applies the door-leaf rule', () => {
    const clamped = clampTallCabinetParams(
      withParams({ heightMm: 3000, shelfCount: 9, widthMm: 900, doorCount: 1 })
    )
    expect(clamped).toMatchObject({ heightMm: 2400, shelfCount: 6, widthMm: 900, doorCount: 2 })
  })
})

describe('tall cabinet elevation', () => {
  it('stands on the floor over its full height', () => {
    expect(designVerticalExtent({ kind: 'tall-cabinet', params: defaults })).toEqual({
      bottomMm: 0,
      topMm: 2100
    })
  })
})
