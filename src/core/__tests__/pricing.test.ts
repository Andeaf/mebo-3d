import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type BaseCabinetParams } from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'
import { buildCuttingList } from '@core/cuttingList'
import { parsePriceDatabase, type PriceDatabase } from '@core/materials'
import { calculateQuote, quoteForDesign } from '@core/pricing'

// Round-number fixture so expected totals stay readable.
const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'board-a', name: 'Board A', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'back-b', name: 'Back B', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'edge-c', name: 'Edge C', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 }
  ]
}

// Default cabinet (600 × 720 × 560, 1 shelf, 2 doors) on fixture materials.
const params: BaseCabinetParams = {
  ...createDefaultBaseCabinetParams(),
  carcassMaterialId: 'board-a',
  backMaterialId: 'back-b',
  edgeBandMaterialId: 'edge-c'
}

describe('buildCuttingList', () => {
  it('aggregates board area, edge banding length and hardware per material', () => {
    const list = buildCuttingList(generateBaseCabinet(params))

    expect(list.rows).toHaveLength(9)

    // board-a: sides 0.8064 + bottom 0.31584 + stretchers 0.108288
    //          + shelf 0.300108 + doors 0.424588 = 1.955224 m²
    const carcass = list.boards.find((board) => board.materialId === 'board-a')
    expect(carcass?.areaM2).toBeCloseTo(1.955224, 6)
    expect(carcass?.panelCount).toBe(8)
    const back = list.boards.find((board) => board.materialId === 'back-b')
    expect(back?.areaM2).toBeCloseTo(0.406, 6)

    // 2×720 (sides) + 564 (bottom) + 564 (stretcher) + 562 (shelf)
    // + 2 × (2×716 + 2×296.5) (doors) = 7180 mm
    expect(list.edgeBands).toEqual([{ materialId: 'edge-c', lengthM: expect.closeTo(7.18, 6) }])

    expect(list.hardware).toEqual([
      { materialId: 'handle-standard', quantity: 2 },
      { materialId: 'hinge-standard', quantity: 4 }
    ])
  })
})

describe('calculateQuote', () => {
  it('prices the default cabinet from the fixture database', () => {
    const quote = calculateQuote(buildCuttingList(generateBaseCabinet(params)), fixtureDb)

    expect(quote.subtotalsEur.board).toBeCloseTo(1.955224 * 10 + 0.406 * 5, 6) // 21.58224
    expect(quote.subtotalsEur.edgeband).toBeCloseTo(7.18, 6)
    expect(quote.subtotalsEur.hardware).toBeCloseTo(4 * 2 + 2 * 3, 6) // 14
    expect(quote.totalEur).toBeCloseTo(42.76224, 6)
    expect(quote.missingMaterialIds).toEqual([])

    const hingeLine = quote.lines.find((line) => line.materialId === 'hinge-standard')
    expect(hingeLine).toEqual({
      materialId: 'hinge-standard',
      description: 'Hinge',
      category: 'hardware',
      quantity: 4,
      unit: 'piece',
      unitPriceEur: 2,
      totalEur: 8
    })
  })

  it('reports materials missing from the database without crashing', () => {
    const dbWithoutHandles: PriceDatabase = {
      materials: fixtureDb.materials.filter((material) => material.id !== 'handle-standard')
    }
    const quote = calculateQuote(buildCuttingList(generateBaseCabinet(params)), dbWithoutHandles)
    expect(quote.missingMaterialIds).toEqual(['handle-standard'])
    expect(quote.totalEur).toBeCloseTo(42.76224 - 6, 6)
  })

  it('is exposed as a pure (design, price database) → quote function', () => {
    const quote = quoteForDesign({ kind: 'base-cabinet', params }, fixtureDb)
    expect(quote.totalEur).toBeCloseTo(42.76224, 6)
  })
})

describe('parsePriceDatabase', () => {
  it('accepts a valid database', () => {
    const db = parsePriceDatabase({
      materials: [
        { id: 'x', name: 'X', category: 'board', priceUnit: 'm2', pricePerUnitEur: 1.5, thicknessMm: 18, color: '#fff' }
      ]
    })
    expect(db.materials).toHaveLength(1)
    expect(db.materials[0].pricePerUnitEur).toBe(1.5)
  })

  it('rejects malformed input with a clear message', () => {
    expect(() => parsePriceDatabase(null)).toThrow(/materials/)
    expect(() => parsePriceDatabase({ materials: [{}] })).toThrow(/materials\[0\]\.id/)
    expect(() =>
      parsePriceDatabase({
        materials: [{ id: 'x', name: 'X', category: 'nope', priceUnit: 'm2', pricePerUnitEur: 1 }]
      })
    ).toThrow(/category/)
    expect(() =>
      parsePriceDatabase({
        materials: [{ id: 'x', name: 'X', category: 'board', priceUnit: 'm2', pricePerUnitEur: -1 }]
      })
    ).toThrow(/pricePerUnitEur/)
    expect(() =>
      parsePriceDatabase({
        materials: [
          { id: 'x', name: 'X', category: 'board', priceUnit: 'm2', pricePerUnitEur: 1 },
          { id: 'x', name: 'X2', category: 'board', priceUnit: 'm2', pricePerUnitEur: 2 }
        ]
      })
    ).toThrow(/duplicate/)
  })
})
