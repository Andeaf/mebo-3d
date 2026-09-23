import { describe, expect, it } from 'vitest'
import { drawerNumberOfPart, DRAWER_MIN_CARCASS_DEPTH_MM } from '@core/catalog/drawer'
import { createDefaultDrawerCabinetParams, generateDrawerCabinet } from '@core/catalog/drawerCabinet'
import {
  clampCustomPieceSpec,
  createDefaultCustomPieceSpec,
  customPieceEnvelopeLimits,
  customPieceVerticalExtent,
  generateCustomPiece,
  resizeEnvelope,
  validateCustomPieceSpec,
  FRONT_OVERLAY_ZONE_MM,
  MAX_DRAWERS_PER_PIECE,
  type CustomDrawerSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import type { PriceDatabase } from '@core/materials'
import { quoteForDesign } from '@core/pricing'
import { drawer, floatingTvUnit, withPresets } from './drawerFixtures'

/** A 600 × 720 × 560 envelope — the default ladekast's carcass — holding only the given drawers. */
function block(...drawers: CustomDrawerSpec[]): CustomPieceSpec {
  return { ...createDefaultCustomPieceSpec('Ladeblok'), widthMm: 600, heightMm: 720, depthMm: 560, drawers }
}

// Round numbers and the shipped hardware ids, so a quote can be checked by hand.
const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'melamine-white-18', name: 'Board', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'hdf-back-3', name: 'Back', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'abs-edge', name: 'Edge', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 },
    { id: 'drawer-slide-pair', name: 'Slides', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 8 },
    { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 }
  ]
}

describe('a drawer in a custom piece', () => {
  it('expands into its front and five box parts, named after its number', () => {
    const build = generateCustomPiece(block(drawer(), drawer({ id: 'drawer-3', originMm: { x: 2, y: 155 } })))
    expect(build.panels.map((panel) => panel.id)).toEqual([
      'drawer-front-1',
      'drawer-1-box-left',
      'drawer-1-box-right',
      'drawer-1-box-front',
      'drawer-1-box-back',
      'drawer-1-box-bottom',
      'drawer-front-3',
      'drawer-3-box-left',
      'drawer-3-box-right',
      'drawer-3-box-front',
      'drawer-3-box-back',
      'drawer-3-box-bottom'
    ])
    expect(build.hardware).toEqual([
      { materialId: 'drawer-slide-pair', quantity: 2 },
      { materialId: 'handle-standard', quantity: 2 }
    ])
    // The fronts stand in the overlay zone; the footprint does not grow.
    expect(build.boundingSizeMm).toEqual({ x: 600, y: 720, z: 560 + FRONT_OVERLAY_ZONE_MM })
  })

  it('keeps the spec panels and hardware first, the drawers after them', () => {
    const spec: CustomPieceSpec = {
      ...withPresets(block(drawer()), 'side'),
      hardware: [
        { materialId: 'hinge-standard', quantity: 4 },
        { materialId: 'handle-standard', quantity: 2 }
      ]
    }
    const build = generateCustomPiece(spec)
    expect(build.panels[0].id).toBe('panel-1')
    expect(build.panels[1].id).toBe('drawer-front-1')
    expect(build.hardware).toEqual([
      { materialId: 'hinge-standard', quantity: 4 },
      { materialId: 'handle-standard', quantity: 2 },
      { materialId: 'drawer-slide-pair', quantity: 1 },
      { materialId: 'handle-standard', quantity: 1 }
    ])
  })

  it('is the ladekast drawer, part for part, when its front sits where a ladekast front sits', () => {
    // The ladekast with one shallow drawer: fronts 280 / 280 / 150 at 2, 285 and 568.
    const ladekast = generateDrawerCabinet({
      ...createDefaultDrawerCabinetParams(),
      shallowDrawerCount: 1,
      shallowFrontHeightMm: 150
    })
    const piece = generateCustomPiece(
      block(
        drawer({ id: 'drawer-1', originMm: { x: 2, y: 2 }, heightMm: 280 }),
        drawer({ id: 'drawer-2', originMm: { x: 2, y: 285 }, heightMm: 280 }),
        drawer({ id: 'drawer-3', originMm: { x: 2, y: 568 }, heightMm: 150 })
      )
    )
    const ladekastDrawers = ladekast.panels.filter((panel) => drawerNumberOfPart(panel.id) !== null)
    expect(piece.panels).toEqual(ladekastDrawers)
    expect(piece.hardware).toEqual(ladekast.hardware)
  })

  it('keeps every part inside the envelope and the overlay zone, wherever its front lies on the face', () => {
    for (const depthMm of [DRAWER_MIN_CARCASS_DEPTH_MM, 400, 560, 1000]) {
      for (const heightMm of [96, 109, 110, 150, 400, 600]) {
        for (const widthMm of [150, 596, 1200]) {
          for (const [x, y] of [
            [0, 0],
            [1200 - widthMm, 0],
            [0, 600 - heightMm],
            [1200 - widthMm, 600 - heightMm]
          ]) {
            const spec: CustomPieceSpec = {
              ...createDefaultCustomPieceSpec(''),
              widthMm: 1200,
              heightMm: 600,
              depthMm,
              drawers: [drawer({ widthMm, heightMm, originMm: { x, y } })]
            }
            const label = `${widthMm} × ${heightMm} at ${x}, ${y} in ${depthMm} deep`
            expect(validateCustomPieceSpec(spec), label).toEqual([])
            for (const part of generateCustomPiece(spec).panels) {
              const { center, size } = part.box
              expect(center.x - size.x / 2, label).toBeGreaterThanOrEqual(0)
              expect(center.x + size.x / 2, label).toBeLessThanOrEqual(1200)
              expect(center.y - size.y / 2, label).toBeGreaterThanOrEqual(0)
              expect(center.y + size.y / 2, label).toBeLessThanOrEqual(600)
              expect(center.z - size.z / 2, label).toBeGreaterThanOrEqual(0)
              expect(center.z + size.z / 2, label).toBeLessThanOrEqual(depthMm + FRONT_OVERLAY_ZONE_MM)
            }
          }
        }
      }
    }
  })
})

describe('drawer validation', () => {
  it('names what is wrong with each drawer', () => {
    const errors = validateCustomPieceSpec(
      block(
        drawer({ id: 'lade-1' }),
        drawer({ id: 'drawer-2', frontMaterialId: '' }),
        drawer({ id: 'drawer-2', widthMm: 100, heightMm: 50 }),
        drawer({ id: 'drawer-4', originMm: { x: 100, y: 600 } }),
        drawer({ id: 'drawer-5', originMm: { x: Number.NaN, y: 0 } })
      )
    )
    expect(errors).toEqual([
      'drawers[0].id must look like drawer-<n> (got "lade-1")',
      'drawers[1].frontMaterialId must not be empty',
      'drawers[2].id is a duplicate of drawers[1].id (drawer-2)',
      'drawers[2].widthMm must be between 150 and 1200 (got 100)',
      'drawers[2].heightMm must be between 96 and 600 (got 50)',
      'drawers[3] lies outside the front face on x (100–696 vs 0–600)',
      'drawers[3] lies outside the front face on y (600–750 vs 0–720)',
      'drawers[4].originMm must hold finite numbers'
    ])
  })

  it('needs an envelope deep enough for the shortest slide, and at most 12 drawers', () => {
    expect(validateCustomPieceSpec({ ...block(drawer()), depthMm: 250 })).toEqual([
      'depthMm must be at least 270 while the piece has drawers (got 250)'
    ])
    // Without drawers the rule does not apply.
    expect(validateCustomPieceSpec({ ...block(), depthMm: 250 })).toEqual([])
    const many = Array.from({ length: MAX_DRAWERS_PER_PIECE + 1 }, (_, index) =>
      drawer({ id: `drawer-${index + 1}`, heightMm: 96, originMm: { x: 2, y: index * 50 } })
    )
    expect(validateCustomPieceSpec(block(...many))).toEqual(['drawers must hold at most 12 drawers (got 13)'])
  })

  it('refuses to build an invalid drawer', () => {
    expect(() => generateCustomPiece(block(drawer({ widthMm: 700 })))).toThrow(/invalid custom piece/)
  })
})

describe('drawer clamping', () => {
  it('forces a drawer onto the face: its size by the face, then its origin, in whole millimetres', () => {
    const clamped = clampCustomPieceSpec(
      block(drawer({ widthMm: 2000, heightMm: 20, originMm: { x: 500.4, y: -30 } }), drawer({ id: 'drawer-2', originMm: { x: 10.4, y: 20.6 } }))
    )
    expect(clamped.drawers[0]).toMatchObject({ widthMm: 600, heightMm: 96, originMm: { x: 0, y: 0 } })
    expect(clamped.drawers[1].originMm).toEqual({ x: 4, y: 21 })
    expect(validateCustomPieceSpec(clamped)).toEqual([])
    expect(clampCustomPieceSpec(clamped)).toEqual(clamped)
  })

  it('keeps the envelope deep and wide enough while the piece has drawers', () => {
    const spec = block(drawer())
    expect(customPieceEnvelopeLimits(spec).depthMm.min).toBe(270)
    expect(customPieceEnvelopeLimits(spec).widthMm.min).toBe(150)
    expect(customPieceEnvelopeLimits(block()).depthMm.min).toBe(100)
    expect(clampCustomPieceSpec({ ...spec, depthMm: 120 }).depthMm).toBe(270)
    expect(resizeEnvelope(spec, { depthMm: 120 }).depthMm).toBe(270)
    const narrow = resizeEnvelope(spec, { widthMm: 100 })
    expect(narrow.widthMm).toBe(150)
    expect(narrow.drawers[0]).toMatchObject({ widthMm: 150, originMm: { x: 0, y: 2 } })
    expect(validateCustomPieceSpec(narrow)).toEqual([])
  })
})

describe('drawer pricing', () => {
  it('prices every drawer: its boards, its banding, one slide pair and one handle', () => {
    const quote = quoteForDesign(
      { kind: 'custom-piece', spec: block(drawer(), drawer({ id: 'drawer-2', originMm: { x: 2, y: 155 } })) },
      fixtureDb
    )
    // Per drawer (front 596 × 150, 560 deep): slide 500, bay 564 → box 538 outside, 502 inside,
    // sides 100 high. Board: front 0.0894 + sides 0.1 + box front/back 0.1004 = 0.2898 m²;
    // HDF bottom 0.514 × 0.476 = 0.244664 m²; band 1492 + 1000 + 1004 = 3496 mm.
    expect(quote.subtotalsEur.board).toBeCloseTo(2 * (0.2898 * 10 + 0.244664 * 5), 9)
    expect(quote.subtotalsEur.edgeband).toBeCloseTo(2 * 3.496, 9)
    expect(quote.subtotalsEur.hardware).toBe(2 * 8 + 2 * 3)
    expect(quote.missingMaterialIds).toEqual([])
  })
})

describe('a floating TV unit with a drawer', () => {
  it('validates, hangs, and prices its slides and its handle', () => {
    const spec = floatingTvUnit()
    expect(validateCustomPieceSpec(spec)).toEqual([])
    expect(customPieceVerticalExtent(spec)).toEqual({ bottomMm: 450, topMm: 800 })

    const build = generateCustomPiece(spec)
    // Six carcass panels, then the drawer's six parts.
    expect(build.panels).toHaveLength(12)
    expect(build.panels.filter((panel) => drawerNumberOfPart(panel.id) === 1)).toHaveLength(6)

    const quote = quoteForDesign({ kind: 'custom-piece', spec }, fixtureDb)
    const quantityOf = (materialId: string): number | undefined =>
      quote.lines.find((line) => line.materialId === materialId)?.quantity
    expect(quantityOf('drawer-slide-pair')).toBe(1)
    expect(quantityOf('handle-standard')).toBe(1)
    expect(quote.subtotalsEur.hardware).toBe(8 + 3)
    expect(quote.missingMaterialIds).toEqual([])
  })
})
