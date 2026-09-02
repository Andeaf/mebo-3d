import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type BaseCabinetParams } from '@core/cabinet'
import type { PriceDatabase } from '@core/materials'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, SceneDesign } from '@core/scene'
import { quoteForScene } from '@core/scenePricing'

// Same round-number fixture as pricing.test.ts.
const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'board-a', name: 'Board A', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'back-b', name: 'Back B', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'edge-c', name: 'Edge C', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 }
  ]
}

// Default cabinet on fixture materials: totals 42.76224 EUR each (see pricing.test.ts).
const fixtureParams: BaseCabinetParams = {
  ...createDefaultBaseCabinetParams(),
  carcassMaterialId: 'board-a',
  backMaterialId: 'back-b',
  edgeBandMaterialId: 'edge-c'
}

function placed(id: string, positionX: number): PlacedCabinet {
  return {
    id,
    design: { kind: 'base-cabinet', params: fixtureParams },
    positionX,
    positionZ: 0,
    rotationDeg: 0
  }
}

const twoCabinetScene: SceneDesign = {
  room: createDefaultRoom(),
  cabinets: [placed('cab-1', 0), placed('cab-2', 600)]
}

describe('quoteForScene', () => {
  it('returns an empty quote for an empty scene', () => {
    const quote = quoteForScene({ room: createDefaultRoom(), cabinets: [] }, fixtureDb)
    expect(quote.cabinets).toEqual([])
    expect(quote.materialTotals).toEqual([])
    expect(quote.subtotalsEur).toEqual({ board: 0, edgeband: 0, hardware: 0 })
    expect(quote.totalEur).toBe(0)
    expect(quote.missingMaterialIds).toEqual([])
  })

  it('keeps one full quote per cabinet, in scene order', () => {
    const quote = quoteForScene(twoCabinetScene, fixtureDb)
    expect(quote.cabinets.map((entry) => entry.cabinetId)).toEqual(['cab-1', 'cab-2'])
    for (const entry of quote.cabinets) {
      expect(entry.quote.totalEur).toBeCloseTo(42.76224, 6)
    }
  })

  it('aggregates per-material quantities and totals across the scene', () => {
    const quote = quoteForScene(twoCabinetScene, fixtureDb)

    const carcass = quote.materialTotals.find((line) => line.materialId === 'board-a')
    expect(carcass?.quantity).toBeCloseTo(2 * 1.955224, 6)
    expect(carcass?.totalEur).toBeCloseTo(2 * 19.55224, 6)

    const edge = quote.materialTotals.find((line) => line.materialId === 'edge-c')
    expect(edge?.quantity).toBeCloseTo(14.36, 6)

    const hinges = quote.materialTotals.find((line) => line.materialId === 'hinge-standard')
    expect(hinges?.quantity).toBe(8)
    expect(hinges?.totalEur).toBe(16)

    // ordered by category (board, edgeband, hardware), then material id
    expect(quote.materialTotals.map((line) => line.materialId)).toEqual([
      'back-b',
      'board-a',
      'edge-c',
      'handle-standard',
      'hinge-standard'
    ])

    expect(quote.subtotalsEur.board).toBeCloseTo(2 * 21.58224, 6)
    expect(quote.subtotalsEur.edgeband).toBeCloseTo(14.36, 6)
    expect(quote.subtotalsEur.hardware).toBe(28)
    expect(quote.totalEur).toBeCloseTo(2 * 42.76224, 6)
  })

  it('unions missing material ids across cabinets without double counting', () => {
    const withoutHandles: PriceDatabase = {
      materials: fixtureDb.materials.filter((material) => material.id !== 'handle-standard')
    }
    const quote = quoteForScene(twoCabinetScene, withoutHandles)
    expect(quote.missingMaterialIds).toEqual(['handle-standard'])
    expect(quote.totalEur).toBeCloseTo(2 * (42.76224 - 6), 6)
  })
})
