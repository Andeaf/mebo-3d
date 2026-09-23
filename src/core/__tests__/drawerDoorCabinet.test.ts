import { describe, expect, it } from 'vitest'
import type { CabinetDesign } from '@core/cabinet'
import { drawerNumberOfPart } from '@core/catalog/drawer'
import { createDefaultDrawerCabinetParams, generateDrawerCabinet } from '@core/catalog/drawerCabinet'
import {
  clampDrawerDoorCabinetParams,
  createDefaultDrawerDoorCabinetParams,
  drawerDoorHeightMm,
  drawerFrontHeightMaxMm,
  generateDrawerDoorCabinet,
  validateDrawerDoorCabinetParams,
  type DrawerDoorCabinetParams
} from '@core/catalog/drawerDoorCabinet'
import {
  CABINET_REGISTRY,
  createDefaultDesign,
  designFootprintSize,
  designMountingHeightMm,
  designVerticalExtent,
  designWorktopEligible
} from '@core/catalog/registry'
import type { PriceDatabase } from '@core/materials'
import type { Panel, PanelRole } from '@core/panel'
import { createDefaultRoom } from '@core/room'
import type { SceneDesign } from '@core/scene'
import { quoteForScene } from '@core/scenePricing'
import { connectedRuns, placeWithoutOverlap, spawnPlacement } from '@core/snap'
import { createDefaultWorktopSettings } from '@core/worktop'
import { computeWorktops } from '@core/worktopLayout'

// Default: 600 × 720 × 560 mm, a 150 mm drawer front, 1 shelf, 1 door.
const defaults = createDefaultDrawerDoorCabinetParams()

function withParams(patch: Partial<DrawerDoorCabinetParams>): DrawerDoorCabinetParams {
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

function bottomOf(panel: Panel): number {
  return panel.box.center.y - panel.box.size.y / 2
}

function topOf(panel: Panel): number {
  return panel.box.center.y + panel.box.size.y / 2
}

describe('the onderkast met lade', () => {
  it('is a stretcher-top carcass with a fixed shelf, shelves, doors and one drawer', () => {
    const build = generateDrawerDoorCabinet(defaults)
    const counts: Partial<Record<PanelRole, number>> = {}
    for (const panel of build.panels) {
      counts[panel.role] = (counts[panel.role] ?? 0) + 1
    }
    expect(counts).toEqual({
      'side-left': 1,
      'side-right': 1,
      bottom: 1,
      'stretcher-front': 1,
      'stretcher-back': 1,
      back: 1,
      'fixed-shelf': 1,
      shelf: 1,
      door: 1,
      'drawer-front': 1,
      'drawer-box-side': 2,
      'drawer-box-front': 1,
      'drawer-box-back': 1,
      'drawer-box-bottom': 1
    })
    expect(build.panels).toHaveLength(15)
    expect(build.boundingSizeMm).toEqual({ x: 600, y: 720, z: 578 })

    const bare = generateDrawerDoorCabinet(withParams({ widthMm: 800, doorCount: 0, shelfCount: 3 }))
    expect(byRole(bare.panels, 'door')).toHaveLength(0)
    expect(byRole(bare.panels, 'shelf')).toHaveLength(3)
    expect(bare.panels).toHaveLength(7 + 3 + 6)
  })

  it('gives the doors the carcass less the drawer zone: H − 2 × 2 − 3 − front', () => {
    for (const [heightMm, drawerFrontHeightMm, doorHeight] of [
      [720, 150, 563],
      [1000, 300, 693],
      [400, 193, 200]
    ] as const) {
      const params = withParams({ heightMm, drawerFrontHeightMm })
      expect(drawerDoorHeightMm(params)).toBe(doorHeight)
      const door = single(generateDrawerDoorCabinet(params).panels, 'door')
      expect(door.lengthMm).toBe(doorHeight)
      expect(bottomOf(door)).toBe(2)
      // One 3 mm gap up to the drawer front, which ends 2 mm under the top.
      const front = single(generateDrawerDoorCabinet(params).panels, 'drawer-front')
      expect(bottomOf(front) - topOf(door)).toBe(3)
      expect(topOf(front)).toBe(heightMm - 2)
      expect(front.lengthMm).toBe(drawerFrontHeightMm)
    }
  })

  it('follows the door-leaf rule: above 600 mm one leaf becomes two', () => {
    expect(clampDrawerDoorCabinetParams(withParams({ widthMm: 700, doorCount: 1 })).doorCount).toBe(2)
    expect(validateDrawerDoorCabinetParams(withParams({ widthMm: 700, doorCount: 1 }))).toEqual([
      'doorCount 1 needs a width of at most 600 mm (got 700)'
    ])
    const doors = byRole(generateDrawerDoorCabinet(withParams({ widthMm: 900, doorCount: 2 })).panels, 'door')
    expect(doors).toHaveLength(2)
    expect(doors[0].widthMm).toBe((900 - 4 - 3) / 2)
  })

  it('hangs every leaf on hinges counted by its height, and adds the drawer hardware', () => {
    for (const heightMm of [400, 720, 1000]) {
      for (const drawerFrontHeightMm of [96, 150, drawerFrontHeightMaxMm({ heightMm })]) {
        for (const doorCount of [0, 1, 2] as const) {
          const params = clampDrawerDoorCabinetParams(
            withParams({ heightMm, drawerFrontHeightMm, doorCount, widthMm: doorCount === 2 ? 800 : 600 })
          )
          // Every legal door is at most 897 mm: 2 hinges per leaf in the shared table.
          const hardware = generateDrawerDoorCabinet(params).hardware
          expect(hardware, `${heightMm}/${drawerFrontHeightMm}/${doorCount}`).toEqual(
            doorCount === 0
              ? [
                  { materialId: 'drawer-slide-pair', quantity: 1 },
                  { materialId: 'handle-standard', quantity: 1 }
                ]
              : [
                  { materialId: 'hinge-standard', quantity: 2 * doorCount },
                  { materialId: 'handle-standard', quantity: doorCount + 1 },
                  { materialId: 'drawer-slide-pair', quantity: 1 }
                ]
          )
        }
      }
    }
  })

  it('sits the fixed shelf behind the gap, the shelves below it and the drawer box above it', () => {
    for (const [heightMm, drawerFrontHeightMm, shelfCount] of [
      [720, 150, 1],
      [1000, 300, 3],
      [400, 96, 2]
    ] as const) {
      const params = withParams({ heightMm, drawerFrontHeightMm, shelfCount })
      const build = generateDrawerDoorCabinet(params)
      const fixed = single(build.panels, 'fixed-shelf')
      const door = single(build.panels, 'door')
      const front = single(build.panels, 'drawer-front')
      // Centred on the gap: each front covers 7.5 mm of it.
      expect(fixed.box.center.y).toBe(heightMm - 2 - drawerFrontHeightMm - 1.5)
      expect(topOf(door) - bottomOf(fixed)).toBe(7.5)
      expect(topOf(fixed) - bottomOf(front)).toBe(7.5)
      // Between the sides, from the back panel's face (z = 4) to the carcass front.
      expect(fixed).toMatchObject({ lengthMm: 564, widthMm: 556, thicknessMm: 18 })
      expect(fixed.box.center.z).toBe(4 + 556 / 2)
      expect(fixed.edgeBanding?.edges).toEqual(['length-1'])

      const shelves = byRole(build.panels, 'shelf')
      expect(shelves).toHaveLength(shelfCount)
      const gaps = [18, ...shelves.map((shelf) => shelf.box.center.y), bottomOf(fixed)]
      for (let i = 1; i < gaps.length; i += 1) {
        expect(gaps[i] - gaps[i - 1]).toBeCloseTo((bottomOf(fixed) - 18) / (shelfCount + 1), 9)
      }

      const box = build.panels.filter(
        (panel) => drawerNumberOfPart(panel.id) === 1 && panel.role !== 'drawer-front'
      )
      expect(Math.min(...box.map(bottomOf))).toBeGreaterThan(topOf(fixed))
      expect(Math.max(...box.map(topOf))).toBeLessThanOrEqual(heightMm - 18)
    }
  })

  it('builds its drawer part for part like a ladekast top drawer with the same front', () => {
    // A 2-drawer ladekast whose shallow top drawer has a 150 mm front: it starts at 568 too.
    const ladekast = generateDrawerCabinet({
      ...createDefaultDrawerCabinetParams(),
      drawerCount: 2,
      shallowDrawerCount: 1,
      shallowFrontHeightMm: 150
    })
    const withoutId = (panel: Panel): Omit<Panel, 'id'> => ({
      role: panel.role,
      materialId: panel.materialId,
      lengthMm: panel.lengthMm,
      widthMm: panel.widthMm,
      thicknessMm: panel.thicknessMm,
      edgeBanding: panel.edgeBanding,
      box: panel.box
    })
    const ladekastTop = ladekast.panels.filter((panel) => drawerNumberOfPart(panel.id) === 2).map(withoutId)
    const combined = generateDrawerDoorCabinet(defaults)
      .panels.filter((panel) => drawerNumberOfPart(panel.id) === 1)
      .map(withoutId)
    expect(combined).toEqual(ladekastTop)
  })

  it('keeps the doors at least 200 mm whatever the front, and clamps into its limits', () => {
    expect(drawerFrontHeightMaxMm({ heightMm: 720 })).toBe(300)
    expect(drawerFrontHeightMaxMm({ heightMm: 400 })).toBe(193)
    expect(clampDrawerDoorCabinetParams(withParams({ heightMm: 400, drawerFrontHeightMm: 250 })).drawerFrontHeightMm).toBe(193)
    expect(clampDrawerDoorCabinetParams(withParams({ drawerFrontHeightMm: 50 })).drawerFrontHeightMm).toBe(96)
    expect(
      clampDrawerDoorCabinetParams(withParams({ widthMm: 2000, heightMm: 100, depthMm: 900, shelfCount: 9 }))
    ).toMatchObject({ widthMm: 1200, heightMm: 400, depthMm: 700, shelfCount: 3 })
    expect(validateDrawerDoorCabinetParams(withParams({ heightMm: 400, drawerFrontHeightMm: 250 }))).toEqual([
      'drawerFrontHeightMm must be at most 193 in a 400 mm carcass, so the doors keep 200 mm (got 250)'
    ])
    expect(validateDrawerDoorCabinetParams(withParams({ drawerFrontHeightMm: 50 }))).toEqual([
      'drawerFrontHeightMm must be between 96 and 300 (got 50)'
    ])
    expect(validateDrawerDoorCabinetParams(withParams({ shelfCount: 2.5 }))).toEqual([
      'shelfCount must be an integer (got 2.5)'
    ])
    expect(() => generateDrawerDoorCabinet(withParams({ widthMm: 1500 }))).toThrow(/widthMm/)
  })

  it('declares itself a floor kind that carries a worktop', () => {
    expect(CABINET_REGISTRY['drawer-door-cabinet'].worktopEligible).toBe(true)
    expect(CABINET_REGISTRY['drawer-door-cabinet'].mounting).toBeNull()
    const design = createDefaultDesign('drawer-door-cabinet')
    expect(designWorktopEligible(design)).toBe(true)
    expect(designMountingHeightMm(design)).toBeNull()
    expect(designFootprintSize(design)).toEqual({ widthMm: 600, depthMm: 560 })
    expect(designVerticalExtent(design)).toEqual({ bottomMm: 0, topMm: 720 })
  })
})

describe('the onderkast met lade in a run', () => {
  // The shipped hardware ids, round prices; the default worktop priced per m².
  const fixtureDb: PriceDatabase = {
    materials: [
      { id: 'melamine-white-18', name: 'Board', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
      { id: 'hdf-back-3', name: 'Back', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
      { id: 'abs-edge', name: 'Edge', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
      { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 },
      { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 },
      { id: 'drawer-slide-pair', name: 'Slides', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 8 },
      { id: 'worktop-hpl-38', name: 'Top', category: 'worktop', priceUnit: 'm2', pricePerUnitEur: 100, thicknessMm: 38 }
    ]
  }

  it('snaps flush beside an onderkast, joins its run and shares one worktop slab', () => {
    const room = createDefaultRoom()
    const worktop = createDefaultWorktopSettings()
    const base: CabinetDesign = createDefaultDesign('base-cabinet')
    const combined: CabinetDesign = createDefaultDesign('drawer-door-cabinet')
    let scene: SceneDesign = { room, worktop, cabinets: [] }
    scene = placeWithoutOverlap(scene, { id: 'cab-1', design: base, ...spawnPlacement(scene, base) })
    scene = placeWithoutOverlap(scene, { id: 'cab-2', design: combined, ...spawnPlacement(scene, combined) })
    expect(scene.cabinets).toHaveLength(2)
    const [first, second] = scene.cabinets
    // Flush side to side, fronts aligned, both backs on the back wall.
    expect(second.positionX - first.positionX).toBe(600)
    expect(second.positionZ).toBe(first.positionZ)
    expect(second.rotationDeg).toBe(first.rotationDeg)

    const runs = connectedRuns(scene)
    expect(runs).toHaveLength(1)
    expect(runs[0].memberIds).toEqual(['cab-1', 'cab-2'])

    const slabs = computeWorktops(scene, scene.worktop)
    expect(slabs).toHaveLength(1)
    expect(slabs[0].lengthMm).toBe(1200)
    expect(slabs[0].memberIds).toEqual(['cab-1', 'cab-2'])
    expect(slabs[0].bottomMm).toBe(720)

    const quote = quoteForScene(scene, fixtureDb)
    expect(quote.cabinets).toHaveLength(2)
    expect(quote.worktops).toHaveLength(1)
    expect(quote.missingMaterialIds).toEqual([])
    const quantityOf = (materialId: string): number | undefined =>
      quote.materialTotals.find((line) => line.materialId === materialId)?.quantity
    expect(quantityOf('drawer-slide-pair')).toBe(1)
    // Base: 2 doors × 2 hinges; combined: 1 door × 2.
    expect(quantityOf('hinge-standard')).toBe(4 + 2)
    // Base: 2 door handles; combined: 1 door + 1 drawer.
    expect(quantityOf('handle-standard')).toBe(2 + 2)
  })
})
