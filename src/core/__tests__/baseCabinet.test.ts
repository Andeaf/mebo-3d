import { describe, expect, it } from 'vitest'
import {
  clampBaseCabinetParams,
  createDefaultBaseCabinetParams,
  type BaseCabinetParams
} from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'
import type { Panel, PanelRole } from '@core/panel'

// Default: 600 × 720 × 560 mm, 1 shelf, 2 doors, stretcher top.
const defaults = createDefaultBaseCabinetParams()

function withParams(patch: Partial<BaseCabinetParams>): BaseCabinetParams {
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

describe('generateBaseCabinet', () => {
  it('generates the full carcass for the default cabinet', () => {
    const build = generateBaseCabinet(defaults)
    // 2 sides + bottom + 2 stretchers + back + 1 shelf + 2 doors
    expect(build.panels).toHaveLength(9)

    const left = single(build.panels, 'side-left')
    expect(left.lengthMm).toBe(720)
    expect(left.widthMm).toBe(560)
    expect(left.thicknessMm).toBe(18)

    const bottom = single(build.panels, 'bottom')
    expect(bottom.lengthMm).toBe(564) // 600 − 2 × 18
    expect(bottom.widthMm).toBe(560)

    const front = single(build.panels, 'stretcher-front')
    expect(front.lengthMm).toBe(564)
    expect(front.widthMm).toBe(96)
    expect(front.edgeBanding?.edges).toEqual(['length-1'])
    const rear = single(build.panels, 'stretcher-back')
    expect(rear.edgeBanding).toBeNull()

    const back = single(build.panels, 'back')
    expect(back.thicknessMm).toBe(3)
    expect(back.lengthMm).toBe(700) // 720 − 36 + 2 × 8 rebate overlap
    expect(back.widthMm).toBe(580) // 600 − 36 + 2 × 8

    const shelf = single(build.panels, 'shelf')
    expect(shelf.lengthMm).toBe(562) // 564 − 2 × 1 clearance
    expect(shelf.widthMm).toBe(534) // 560 − 4 (back) − 2 − 20 setback

    expect(build.boundingSizeMm).toEqual({ x: 600, y: 720, z: 578 })
  })

  it('splits double doors evenly with reveal and center gap', () => {
    const build = generateBaseCabinet(defaults)
    const doors = byRole(build.panels, 'door')
    expect(doors).toHaveLength(2)
    for (const door of doors) {
      expect(door.lengthMm).toBe(716) // 720 − 2 × 2 reveal
      expect(door.widthMm).toBeCloseTo(296.5, 6) // (600 − 4 − 3) / 2
      expect(door.edgeBanding?.edges).toHaveLength(4)
    }
    // Doors sit in front of the carcass.
    expect(doors[0].box.center.z).toBe(560 + 9)
  })

  it('generates a single full-width door', () => {
    const build = generateBaseCabinet(withParams({ doorCount: 1 }))
    const door = single(build.panels, 'door')
    expect(door.widthMm).toBe(596) // 600 − 2 × 2 reveal
    expect(build.hardware).toEqual([
      { materialId: 'hinge-standard', quantity: 2 },
      { materialId: 'handle-standard', quantity: 1 }
    ])
  })

  it('omits doors and hardware for an open cabinet', () => {
    const build = generateBaseCabinet(withParams({ doorCount: 0, shelfCount: 0 }))
    expect(build.panels).toHaveLength(6)
    expect(byRole(build.panels, 'door')).toHaveLength(0)
    expect(build.hardware).toHaveLength(0)
    expect(build.boundingSizeMm.z).toBe(560)
  })

  it('supports a full top panel instead of stretchers', () => {
    const build = generateBaseCabinet(withParams({ topConstruction: 'panel' }))
    const top = single(build.panels, 'top')
    expect(top.lengthMm).toBe(564)
    expect(top.widthMm).toBe(560)
    expect(byRole(build.panels, 'stretcher-front')).toHaveLength(0)
    expect(byRole(build.panels, 'stretcher-back')).toHaveLength(0)
  })

  it('distributes shelves evenly over the interior height', () => {
    const build = generateBaseCabinet(withParams({ shelfCount: 3 }))
    const centers = byRole(build.panels, 'shelf').map((shelf) => shelf.box.center.y)
    // interior = 720 − 2 × 18 = 684, quarters at 189 / 360 / 531
    expect(centers).toEqual([189, 360, 531])
  })

  it('uses the configured materials', () => {
    const build = generateBaseCabinet(withParams({ carcassMaterialId: 'mdf-18' }))
    expect(single(build.panels, 'side-left').materialId).toBe('mdf-18')
    expect(byRole(build.panels, 'door').map((door) => door.materialId)).toEqual(['mdf-18', 'mdf-18'])
    expect(single(build.panels, 'back').materialId).toBe('hdf-back-3')
    expect(single(build.panels, 'shelf').edgeBanding?.materialId).toBe('abs-edge')
  })

  it('rejects out-of-range parameters', () => {
    expect(() => generateBaseCabinet(withParams({ widthMm: 250 }))).toThrow(/widthMm/)
    expect(() => generateBaseCabinet(withParams({ heightMm: 1400 }))).toThrow(/heightMm/)
    expect(() => generateBaseCabinet(withParams({ shelfCount: 2.5 }))).toThrow(/shelfCount/)
  })
})

describe('clampBaseCabinetParams', () => {
  it('clamps every numeric parameter into its allowed range', () => {
    const clamped = clampBaseCabinetParams(
      withParams({ widthMm: 2000, heightMm: 100, depthMm: 651.4, shelfCount: 9 })
    )
    expect(clamped.widthMm).toBe(1200)
    expect(clamped.heightMm).toBe(400)
    expect(clamped.depthMm).toBe(651)
    expect(clamped.shelfCount).toBe(4)
  })
})
