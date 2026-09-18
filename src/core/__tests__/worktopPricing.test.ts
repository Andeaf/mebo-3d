import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type BaseCabinetParams } from '@core/cabinet'
import { createDefaultDesign } from '@core/catalog/registry'
import { addPresetPanel, createDefaultCustomPieceSpec } from '@core/customPiece'
import type { PriceDatabase } from '@core/materials'
import { quoteForDesign } from '@core/pricing'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, SceneDesign } from '@core/scene'
import { quoteForScene, worktopQuantity } from '@core/scenePricing'
import { createDefaultWorktopSettings, type WorktopSettings } from '@core/worktop'
import { computeWorktops } from '@core/worktopLayout'

// The scenePricing.test.ts fixture (every default cabinet totals 42.76224 EUR)
// plus one worktop material per price unit, all round numbers.
const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'board-a', name: 'Board A', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'back-b', name: 'Back B', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'edge-c', name: 'Edge C', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 },
    { id: 'top-m2', name: 'Top per m²', category: 'worktop', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 38 },
    { id: 'top-m', name: 'Top per metre', category: 'worktop', priceUnit: 'm', pricePerUnitEur: 100, thicknessMm: 38 },
    { id: 'top-piece', name: 'Top per slab', category: 'worktop', priceUnit: 'piece', pricePerUnitEur: 500 }
  ]
}

const CABINET_EUR = 42.76224

const fixtureParams: BaseCabinetParams = {
  ...createDefaultBaseCabinetParams(),
  carcassMaterialId: 'board-a',
  backMaterialId: 'back-b',
  edgeBandMaterialId: 'edge-c'
}

function base(id: string, positionX: number, params: Partial<BaseCabinetParams> = {}): PlacedCabinet {
  return {
    id,
    design: { kind: 'base-cabinet', params: { ...fixtureParams, ...params } },
    positionX,
    positionZ: -1220,
    rotationDeg: 0
  }
}

/** Three cabinets along the back wall: one slab of 1800 × 590 mm = 1.062 m². */
const backRun: readonly PlacedCabinet[] = [base('cab-1', -1700), base('cab-2', -1100), base('cab-3', -500)]

const worktop: WorktopSettings = { ...createDefaultWorktopSettings(), materialId: 'top-m2' }

function sceneOf(cabinets: readonly PlacedCabinet[], settings: WorktopSettings = worktop): SceneDesign {
  return { room: createDefaultRoom(), worktop: settings, cabinets }
}

describe('worktop lines in the scene quote', () => {
  it('prices one slab by area, as its own line and its own subtotal', () => {
    const quote = quoteForScene(sceneOf(backRun), fixtureDb)
    expect(quote.worktops).toHaveLength(1)
    const line = quote.worktops[0]
    expect(line).toMatchObject({
      slabId: 'worktop-1',
      lengthMm: 1800,
      depthMm: 590,
      materialId: 'top-m2',
      description: 'Top per m²',
      category: 'worktop',
      unit: 'm2',
      unitPriceEur: 10
    })
    expect(line.quantity).toBeCloseTo(1.062, 9)
    expect(line.totalEur).toBeCloseTo(10.62, 9)
    expect(quote.subtotalsEur.worktop).toBeCloseTo(10.62, 9)
    expect(quote.subtotalsEur.board).toBeCloseTo(quote.cabinets.reduce((sum, c) => sum + c.quote.subtotalsEur.board, 0), 9)
    expect(quote.totalEur).toBeCloseTo(3 * CABINET_EUR + 10.62, 6)
    // The slab is a line of its own, not a material total of the cabinets.
    expect(quote.materialTotals.some((total) => total.category === 'worktop')).toBe(false)
    expect(quote.missingMaterialIds).toEqual([])
  })

  it('emits one line per slab, in slab order, each with its own length', () => {
    const split = [base('cab-1', -1700), base('cab-2', -1100, { heightMm: 900 }), base('cab-3', -500, { widthMm: 900 })]
    const quote = quoteForScene(sceneOf(split), fixtureDb)
    expect(quote.worktops.map((line) => [line.slabId, line.lengthMm, line.depthMm])).toEqual([
      ['worktop-1', 600, 590],
      ['worktop-2', 600, 590],
      ['worktop-3', 900, 590]
    ])
    const expected = ((600 + 600 + 900) * 590) / 1_000_000
    expect(quote.subtotalsEur.worktop).toBeCloseTo(expected * 10, 9)
  })

  it('bills by the material’s unit: m² area, m run length, one per slab', () => {
    const [slab] = computeWorktops(sceneOf(backRun), worktop)
    expect(worktopQuantity(slab, 'm2')).toBeCloseTo(1.062, 9)
    expect(worktopQuantity(slab, 'm')).toBeCloseTo(1.8, 9)
    expect(worktopQuantity(slab, 'piece')).toBe(1)

    const perMetre = quoteForScene(sceneOf(backRun, { ...worktop, materialId: 'top-m' }), fixtureDb)
    expect(perMetre.worktops[0]).toMatchObject({ unit: 'm', quantity: 1.8, totalEur: 180 })
    const perSlab = quoteForScene(sceneOf(backRun, { ...worktop, materialId: 'top-piece' }), fixtureDb)
    expect(perSlab.worktops[0]).toMatchObject({ unit: 'piece', quantity: 1, totalEur: 500 })
    expect(perSlab.totalEur).toBeCloseTo(3 * CABINET_EUR + 500, 6)
  })

  it('has no lines and a zero subtotal when worktops are off or nothing carries one', () => {
    const off = quoteForScene(sceneOf(backRun, { ...worktop, enabled: false }), fixtureDb)
    expect(off.worktops).toEqual([])
    expect(off.subtotalsEur.worktop).toBe(0)
    expect(off.totalEur).toBeCloseTo(3 * CABINET_EUR, 6)

    const tallOnly = sceneOf([
      { id: 'cab-1', design: createDefaultDesign('tall-cabinet'), positionX: 0, positionZ: -1220, rotationDeg: 0 }
    ])
    expect(quoteForScene(tallOnly, fixtureDb).worktops).toEqual([])
  })

  it('reports a missing worktop material once, prices the cabinets regardless', () => {
    const split = [base('cab-1', -1700), base('cab-2', -1100, { heightMm: 900 }), base('cab-3', -500)]
    const quote = quoteForScene(sceneOf(split, { ...worktop, materialId: 'gone-top' }), fixtureDb)
    expect(quote.missingMaterialIds).toEqual(['gone-top'])
    expect(quote.worktops).toEqual([])
    expect(quote.subtotalsEur.worktop).toBe(0)
    const cabinetsEur = quote.cabinets.reduce((sum, entry) => sum + entry.quote.totalEur, 0)
    expect(cabinetsEur).toBeGreaterThan(3 * CABINET_EUR) // the 900 mm cabinet costs more
    expect(quote.totalEur).toBeCloseTo(cabinetsEur, 6)
    // Not reported when no slab exists to price.
    expect(
      quoteForScene(sceneOf(split, { ...worktop, materialId: 'gone-top', enabled: false }), fixtureDb)
        .missingMaterialIds
    ).toEqual([])
  })

  it('leaves the single-cabinet engine untouched apart from the zero category', () => {
    const quote = quoteForDesign(backRun[0].design, fixtureDb)
    expect(quote.subtotalsEur).toEqual({
      board: quote.subtotalsEur.board,
      edgeband: quote.subtotalsEur.edgeband,
      hardware: quote.subtotalsEur.hardware,
      worktop: 0
    })
    expect(quote.totalEur).toBeCloseTo(CABINET_EUR, 6)
  })

  it('counts, rather than loses, a custom panel cut from a worktop material', () => {
    // Only a hand-edited file can do this (the panel picker offers boards);
    // the cutting-list engine then bills it as m² under the worktop category.
    const bottom = addPresetPanel(
      { ...createDefaultCustomPieceSpec('Blad'), widthMm: 1000, heightMm: 100, depthMm: 500 },
      'bottom'
    )
    expect(bottom).not.toBeNull()
    const spec = bottom!.spec
    const design = {
      kind: 'custom-piece' as const,
      spec: { ...spec, panels: spec.panels.map((panel) => ({ ...panel, materialId: 'top-m2', edgeBanding: null })) }
    }
    const quote = quoteForDesign(design, fixtureDb)
    expect(quote.lines).toHaveLength(1)
    expect(quote.lines[0].category).toBe('worktop')
    expect(quote.subtotalsEur.worktop).toBeCloseTo(quote.lines[0].totalEur, 9)
    expect(quote.totalEur).toBeCloseTo(quote.subtotalsEur.worktop, 9)
  })
})
