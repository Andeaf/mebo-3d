import { describe, expect, it } from 'vitest'
import type { CabinetDesign } from '@core/cabinet'
import { createDefaultDesign, type CabinetKind } from '@core/catalog/registry'
import { createDefaultCustomPieceSpec, type CustomPanelSpec } from '@core/customPiece'
import type { PriceDatabase } from '@core/materials'
import { quoteForDesign } from '@core/pricing'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, SceneDesign } from '@core/scene'
import { quoteForScene } from '@core/scenePricing'

// The shipped hardware ids plus round-number boards, so a mixed scene prices
// without any missing material.
const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'melamine-white-18', name: 'Board', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'hdf-back-3', name: 'Back', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'abs-edge', name: 'Edge', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'hinge-standard', name: 'Hinge', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 2 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 },
    { id: 'hanging-bracket', name: 'Bracket', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 1.5 },
    { id: 'drawer-slide-pair', name: 'Slides', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 8 }
  ]
}

const KINDS: readonly CabinetKind[] = ['base-cabinet', 'wall-cabinet', 'tall-cabinet', 'drawer-cabinet']

function placed(kind: CabinetKind, index: number): PlacedCabinet {
  return {
    id: `cab-${index + 1}`,
    design: createDefaultDesign(kind),
    positionX: index * 600,
    positionZ: 0,
    rotationDeg: 0
  }
}

const mixedScene: SceneDesign = {
  room: createDefaultRoom(),
  cabinets: KINDS.map((kind, index) => placed(kind, index))
}

describe('pricing a scene of mixed cabinet kinds', () => {
  it('prices every kind through the untouched single-cabinet engine', () => {
    const quote = quoteForScene(mixedScene, fixtureDb)
    expect(quote.cabinets).toHaveLength(4)
    expect(quote.missingMaterialIds).toEqual([])

    const designs: readonly CabinetDesign[] = mixedScene.cabinets.map((cabinet) => cabinet.design)
    const individual = designs.map((design) => quoteForDesign(design, fixtureDb))
    for (let i = 0; i < individual.length; i += 1) {
      expect(quote.cabinets[i].quote.totalEur).toBeCloseTo(individual[i].totalEur, 9)
      expect(quote.cabinets[i].quote.totalEur).toBeGreaterThan(0)
    }
    // The scene total is exactly the sum of the four individual quotes.
    expect(quote.totalEur).toBeCloseTo(
      individual.reduce((sum, entry) => sum + entry.totalEur, 0),
      9
    )
  })

  it('shows the kind-specific hardware in the scene totals', () => {
    const quote = quoteForScene(mixedScene, fixtureDb)
    const quantityOf = (materialId: string): number | undefined =>
      quote.materialTotals.find((line) => line.materialId === materialId)?.quantity

    expect(quantityOf('hanging-bracket')).toBe(2) // one wall cabinet
    expect(quantityOf('drawer-slide-pair')).toBe(3) // one 3-drawer cabinet
    // base 2×2 + wall 2×2 + tall 2×5 hinges
    expect(quantityOf('hinge-standard')).toBe(18)
    // 2 + 2 + 2 door handles + 3 drawer handles
    expect(quantityOf('handle-standard')).toBe(9)
  })
})

describe('pricing a scene that holds a custom piece', () => {
  // Two 720 × 400 sides on the 10 EUR/m² board, front edge banded, four hinges.
  const side = (id: string, x: number): CustomPanelSpec => ({
    id,
    role: x === 0 ? 'side-left' : 'side-right',
    materialId: 'melamine-white-18',
    lengthMm: 720,
    widthMm: 400,
    thicknessMm: 18,
    edgeBanding: { materialId: 'abs-edge', edges: ['length-1'] },
    orientation: 'yz',
    originMm: { x, y: 0, z: 0 }
  })
  const piece: CabinetDesign = {
    kind: 'custom-piece',
    spec: {
      ...createDefaultCustomPieceSpec('Kastje'),
      widthMm: 900,
      heightMm: 720,
      depthMm: 400,
      panels: [side('panel-1', 0), side('panel-2', 882)],
      hardware: [{ materialId: 'hinge-standard', quantity: 4 }]
    }
  }
  const withPiece: SceneDesign = {
    room: createDefaultRoom(),
    cabinets: [...mixedScene.cabinets, { id: 'cab-5', design: piece, positionX: 3000, positionZ: 0, rotationDeg: 0 }]
  }

  it('prices the piece from its own panel list, by hand', () => {
    const quote = quoteForDesign(piece, fixtureDb)
    // Board: 2 × 0.72 × 0.40 m² = 0.576 m² × 10; band: 2 × 0.72 m × 1; hinges 4 × 2.
    expect(quote.subtotalsEur.board).toBeCloseTo(5.76, 9)
    expect(quote.subtotalsEur.edgeband).toBeCloseTo(1.44, 9)
    expect(quote.subtotalsEur.hardware).toBe(8)
    expect(quote.totalEur).toBeCloseTo(15.2, 9)
    expect(quote.missingMaterialIds).toEqual([])
  })

  it('adds up with the catalog cabinets through the same engine', () => {
    const quote = quoteForScene(withPiece, fixtureDb)
    const catalogOnly = quoteForScene(mixedScene, fixtureDb)
    expect(quote.cabinets).toHaveLength(5)
    expect(quote.cabinets[4].cabinetId).toBe('cab-5')
    expect(quote.totalEur).toBeCloseTo(catalogOnly.totalEur + 15.2, 9)
    const hinges = quote.materialTotals.find((line) => line.materialId === 'hinge-standard')
    expect(hinges?.quantity).toBe(18 + 4)
  })

  it('reports a discontinued board on the piece as missing, not as an error', () => {
    const stale: CabinetDesign = {
      kind: 'custom-piece',
      spec: { ...piece.spec, panels: [{ ...piece.spec.panels[0], materialId: 'discontinued-board' }] }
    }
    const quote = quoteForScene({ ...withPiece, cabinets: [{ ...withPiece.cabinets[4], design: stale }] }, fixtureDb)
    expect(quote.missingMaterialIds).toEqual(['discontinued-board'])
    expect(quote.totalEur).toBeCloseTo(0.72 * 1 + 8, 9)
  })
})
