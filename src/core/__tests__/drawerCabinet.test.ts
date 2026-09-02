import { describe, expect, it } from 'vitest'
import type { Panel, PanelRole } from '@core/panel'
import {
  clampDrawerCabinetParams,
  createDefaultDrawerCabinetParams,
  drawerBoxDepthMm,
  drawerBoxSideHeightMm,
  drawerFrontHeightMm,
  generateDrawerCabinet,
  type DrawerCabinetParams
} from '@core/catalog/drawerCabinet'

// Default: 600 × 720 × 560 mm with 3 drawers.
const defaults = createDefaultDrawerCabinetParams()

function withParams(patch: Partial<DrawerCabinetParams>): DrawerCabinetParams {
  return { ...defaults, ...patch }
}

function byRole(panels: readonly Panel[], role: PanelRole): Panel[] {
  return panels.filter((panel) => panel.role === role)
}

describe('generateDrawerCabinet', () => {
  it('builds a base carcass with a stretcher top and no shelves or doors', () => {
    const build = generateDrawerCabinet(defaults)
    expect(byRole(build.panels, 'side-left')).toHaveLength(1)
    expect(byRole(build.panels, 'bottom')).toHaveLength(1)
    expect(byRole(build.panels, 'stretcher-front')).toHaveLength(1)
    expect(byRole(build.panels, 'stretcher-back')).toHaveLength(1)
    expect(byRole(build.panels, 'top')).toHaveLength(0)
    expect(byRole(build.panels, 'shelf')).toHaveLength(0)
    expect(byRole(build.panels, 'door')).toHaveLength(0)

    // carcass 6 + 3 drawers × 6 parts
    expect(build.panels).toHaveLength(24)
    expect(build.boundingSizeMm).toEqual({ x: 600, y: 720, z: 578 })
  })

  it('splits the face into equal fronts with one reveal and n − 1 gaps', () => {
    const build = generateDrawerCabinet(defaults)
    const fronts = byRole(build.panels, 'drawer-front')
    expect(fronts).toHaveLength(3)

    const frontHeight = drawerFrontHeightMm(defaults, 3)
    expect(frontHeight).toBeCloseTo(710 / 3, 6) // (720 − 4 − 6) / 3
    for (const front of fronts) {
      expect(front.lengthMm).toBeCloseTo(frontHeight, 6)
      expect(front.widthMm).toBe(596) // 600 − 2 × 2 reveal
      expect(front.thicknessMm).toBe(18)
      expect(front.edgeBanding?.edges).toHaveLength(4)
      expect(front.box.center.z).toBe(560 + 9)
    }
    // The stack exactly fills the height.
    expect(3 * frontHeight + 2 * 3 + 2 * 2).toBeCloseTo(720, 6)
    // Bottom edges climb by one front plus one gap.
    expect(fronts[0].box.center.y - frontHeight / 2).toBeCloseTo(2, 6)
    expect(fronts[1].box.center.y - frontHeight / 2).toBeCloseTo(2 + frontHeight + 3, 6)
  })

  it('sizes every box from the carcass and the slide steps', () => {
    const build = generateDrawerCabinet(defaults)
    const boxDepth = drawerBoxDepthMm(defaults)
    expect(boxDepth).toBe(500) // floor((560 − 20) / 50) × 50

    const sideHeight = drawerBoxSideHeightMm(drawerFrontHeightMm(defaults, 3))
    expect(sideHeight).toBe(180) // 236.67 − 50, capped at the stocked maximum

    const sides = byRole(build.panels, 'drawer-box-side')
    expect(sides).toHaveLength(6)
    for (const side of sides) {
      expect(side.lengthMm).toBe(500)
      expect(side.widthMm).toBe(180)
      expect(side.thicknessMm).toBe(18)
      expect(side.edgeBanding?.edges).toEqual(['length-1'])
    }

    // Box outer width = inner carcass − 2 × 13 slide clearance = 538.
    const boxInnerWidth = 600 - 2 * 18 - 2 * 13 - 2 * 18
    for (const role of ['drawer-box-front', 'drawer-box-back'] as const) {
      const parts = byRole(build.panels, role)
      expect(parts).toHaveLength(3)
      expect(parts[0].lengthMm).toBe(boxInnerWidth) // 502
      expect(parts[0].widthMm).toBe(180)
      expect(parts[0].edgeBanding?.edges).toEqual(['length-1'])
    }

    const bottoms = byRole(build.panels, 'drawer-box-bottom')
    expect(bottoms).toHaveLength(3)
    for (const bottom of bottoms) {
      expect(bottom.lengthMm).toBe(boxInnerWidth + 12) // 6 mm groove per side
      expect(bottom.widthMm).toBe(500 - 36 + 12)
      expect(bottom.thicknessMm).toBe(3)
      expect(bottom.materialId).toBe('hdf-back-3')
      expect(bottom.edgeBanding).toBeNull()
    }
  })

  it('keeps every box inside the carcass', () => {
    for (const drawerCount of [1, 2, 3, 4]) {
      for (const heightMm of [400, 720, 1000]) {
        const build = generateDrawerCabinet(withParams({ drawerCount, heightMm }))
        for (const panel of byRole(build.panels, 'drawer-box-side')) {
          expect(panel.box.center.y - panel.box.size.y / 2).toBeGreaterThanOrEqual(18)
          expect(panel.box.center.y + panel.box.size.y / 2).toBeLessThanOrEqual(heightMm - 18)
        }
      }
    }
  })

  it('prices one slide pair and one handle per drawer', () => {
    expect(generateDrawerCabinet(defaults).hardware).toEqual([
      { materialId: 'drawer-slide-pair', quantity: 3 },
      { materialId: 'handle-standard', quantity: 3 }
    ])
    expect(generateDrawerCabinet(withParams({ drawerCount: 1 })).hardware).toEqual([
      { materialId: 'drawer-slide-pair', quantity: 1 },
      { materialId: 'handle-standard', quantity: 1 }
    ])
  })

  it('rejects out-of-range parameters', () => {
    expect(() => generateDrawerCabinet(withParams({ drawerCount: 0 }))).toThrow(/drawerCount/)
    expect(() => generateDrawerCabinet(withParams({ drawerCount: 2.5 }))).toThrow(/drawerCount/)
    expect(() => generateDrawerCabinet(withParams({ heightMm: 1400 }))).toThrow(/heightMm/)
  })
})

describe('drawer cabinet params', () => {
  it('clamps every numeric parameter into its allowed range', () => {
    expect(
      clampDrawerCabinetParams(
        withParams({ widthMm: 2000, heightMm: 100, depthMm: 900, drawerCount: 9 })
      )
    ).toMatchObject({ widthMm: 1200, heightMm: 400, depthMm: 700, drawerCount: 4 })
    expect(clampDrawerCabinetParams(withParams({ drawerCount: 0 })).drawerCount).toBe(1)
  })
})
