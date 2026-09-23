import { describe, expect, it } from 'vitest'
import {
  buildDrawer,
  drawerBoxSideHeightMm,
  drawerNumberOfPart,
  drawerSlideLengthMm,
  type DrawerMaterials,
  type DrawerOpening
} from '@core/catalog/drawer'
import { mergeHardware } from '@core/catalog/parts'
import type { Panel } from '@core/panel'

// A 500 × 200 front on a 460 deep carcass whose bay is 470 wide, off-centre
// on purpose so nothing can lean on the carcass width.
const opening: DrawerOpening = {
  number: 2,
  front: { centerXMm: 400, bottomMm: 100, widthMm: 500, heightMm: 200 },
  bayWidthMm: 470,
  bayCenterXMm: 400,
  carcassDepthMm: 460
}

const materials: DrawerMaterials = {
  frontMaterialId: 'front-board',
  boxMaterialId: 'box-board',
  bottomMaterialId: 'hdf',
  edgeBandMaterialId: 'band'
}

function part(panels: readonly Panel[], id: string): Panel {
  const found = panels.find((panel) => panel.id === id)
  if (found === undefined) {
    throw new Error(`no part ${id}`)
  }
  return found
}

describe('buildDrawer', () => {
  const drawer = buildDrawer(opening, materials)

  it('builds a front and the five box parts, named after the drawer number', () => {
    expect(drawer.panels.map((panel) => [panel.id, panel.role])).toEqual([
      ['drawer-front-2', 'drawer-front'],
      ['drawer-2-box-left', 'drawer-box-side'],
      ['drawer-2-box-right', 'drawer-box-side'],
      ['drawer-2-box-front', 'drawer-box-front'],
      ['drawer-2-box-back', 'drawer-box-back'],
      ['drawer-2-box-bottom', 'drawer-box-bottom']
    ])
    expect(drawer.hardware).toEqual([
      { materialId: 'drawer-slide-pair', quantity: 1 },
      { materialId: 'handle-standard', quantity: 1 }
    ])
  })

  it('lays the front on the carcass face, banded all round, in its own material', () => {
    expect(part(drawer.panels, 'drawer-front-2')).toEqual({
      id: 'drawer-front-2',
      role: 'drawer-front',
      materialId: 'front-board',
      lengthMm: 200,
      widthMm: 500,
      thicknessMm: 18,
      edgeBanding: { materialId: 'band', edges: ['length-1', 'length-2', 'width-1', 'width-2'] },
      box: { center: { x: 400, y: 200, z: 469 }, size: { x: 500, y: 200, z: 18 } }
    })
  })

  it('sizes the box from the bay, the slide steps and the front height', () => {
    // Slide: floor((460 − 20) / 50) × 50 = 400. Outer width 470 − 2 × 13 = 444,
    // inner 444 − 2 × 18 = 408. Side height 200 − 50 = 150. Bottom 20 above the front's.
    const left = part(drawer.panels, 'drawer-2-box-left')
    expect(left).toMatchObject({ materialId: 'box-board', lengthMm: 400, widthMm: 150, thicknessMm: 18 })
    expect(left.edgeBanding).toEqual({ materialId: 'band', edges: ['length-1'] })
    expect(left.box).toEqual({ center: { x: 187, y: 195, z: 260 }, size: { x: 18, y: 150, z: 400 } })
    expect(part(drawer.panels, 'drawer-2-box-right').box.center.x).toBe(613)
    // 13 mm of slide clearance on both sides of the bay (165 … 635).
    expect(left.box.center.x - 9 - 165).toBe(13)
    expect(635 - (613 + 9)).toBe(13)

    for (const [id, z] of [
      ['drawer-2-box-front', 451],
      ['drawer-2-box-back', 69]
    ] as const) {
      const member = part(drawer.panels, id)
      expect(member).toMatchObject({ materialId: 'box-board', lengthMm: 408, widthMm: 150, thicknessMm: 18 })
      expect(member.box.center).toEqual({ x: 400, y: 195, z })
    }

    expect(part(drawer.panels, 'drawer-2-box-bottom')).toEqual({
      id: 'drawer-2-box-bottom',
      role: 'drawer-box-bottom',
      materialId: 'hdf',
      lengthMm: 408 + 12,
      widthMm: 400 - 36 + 12,
      thicknessMm: 3,
      edgeBanding: null,
      box: { center: { x: 400, y: 121.5, z: 260 }, size: { x: 420, y: 3, z: 376 } }
    })
  })

  it('keeps the box inside its own front band', () => {
    const tops = drawer.panels
      .filter((panel) => panel.role !== 'drawer-front')
      .map((panel) => panel.box.center.y + panel.box.size.y / 2)
    const bottoms = drawer.panels
      .filter((panel) => panel.role !== 'drawer-front')
      .map((panel) => panel.box.center.y - panel.box.size.y / 2)
    expect(Math.max(...tops)).toBeLessThanOrEqual(opening.front.bottomMm + opening.front.heightMm)
    expect(Math.min(...bottoms)).toBeGreaterThanOrEqual(opening.front.bottomMm)
  })
})

describe('drawer rules', () => {
  it('rounds the slide down to a stocked length in front of the rear clearance', () => {
    expect(drawerSlideLengthMm(300)).toBe(250)
    expect(drawerSlideLengthMm(560)).toBe(500)
    expect(drawerSlideLengthMm(700)).toBe(650)
  })

  it('lowers the box side 50 below the front, within the stocked 60–180', () => {
    expect(drawerBoxSideHeightMm(96)).toBe(60)
    expect(drawerBoxSideHeightMm(150)).toBe(100)
    expect(drawerBoxSideHeightMm(400)).toBe(180)
  })

  it('names the drawer a part belongs to, and nothing else', () => {
    expect(drawerNumberOfPart('drawer-front-3')).toBe(3)
    for (const box of ['left', 'right', 'front', 'back', 'bottom']) {
      expect(drawerNumberOfPart(`drawer-12-box-${box}`)).toBe(12)
    }
    for (const other of ['panel-3', 'door-1', 'drawer-front-0', 'drawer-front-03', 'drawer-3-box-top', 'drawer-3']) {
      expect(drawerNumberOfPart(other), other).toBeNull()
    }
  })
})

describe('mergeHardware', () => {
  it('sums one line per material, in the order they first appear', () => {
    expect(
      mergeHardware([
        { materialId: 'slide', quantity: 1 },
        { materialId: 'handle', quantity: 2 },
        { materialId: 'slide', quantity: 3 }
      ])
    ).toEqual([
      { materialId: 'slide', quantity: 4 },
      { materialId: 'handle', quantity: 2 }
    ])
    expect(mergeHardware([])).toEqual([])
  })
})
