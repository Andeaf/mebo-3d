import type { CabinetDesign } from './cabinet'
import { generateCabinet } from './catalog/registry'
import { buildCuttingList, type CuttingList } from './cuttingList'
import {
  findMaterial,
  MATERIAL_CATEGORIES,
  type MaterialCategory,
  type PriceDatabase,
  type PriceUnit
} from './materials'

export interface QuoteLine {
  readonly materialId: string
  readonly description: string
  readonly category: MaterialCategory
  readonly quantity: number
  readonly unit: PriceUnit
  readonly unitPriceEur: number
  readonly totalEur: number
}

export interface Quote {
  readonly lines: readonly QuoteLine[]
  readonly subtotalsEur: Readonly<Record<MaterialCategory, number>>
  readonly totalEur: number
  /** Material ids used by the design but absent from the price database. */
  readonly missingMaterialIds: readonly string[]
}

/** Every category at zero: the starting point of any quote. */
export function emptySubtotals(): Record<MaterialCategory, number> {
  return { board: 0, edgeband: 0, hardware: 0, worktop: 0 }
}

export function sumSubtotals(subtotals: Readonly<Record<MaterialCategory, number>>): number {
  return MATERIAL_CATEGORIES.reduce((sum, category) => sum + subtotals[category], 0)
}

/**
 * The price engine. A pure function: (cutting list, price database) → quote.
 * No UI, no I/O, no rendering concerns — keep it that way.
 *
 * Every line is priced by the material's unit price, but the QUANTITY is the
 * cutting list's (m² for a board, m for a band, pieces for hardware) whatever
 * the material's `priceUnit` says — the unit is displayed, not interpreted.
 * That is why worktop materials are a separate category: their slabs are
 * priced by `quoteForScene`, which does honour the unit.
 */
export function calculateQuote(cuttingList: CuttingList, db: PriceDatabase): Quote {
  const lines: QuoteLine[] = []
  const missing: string[] = []
  const subtotals = emptySubtotals()

  const addLine = (materialId: string, quantity: number): void => {
    if (quantity <= 0) {
      return
    }
    const material = findMaterial(db, materialId)
    if (material === undefined) {
      if (!missing.includes(materialId)) {
        missing.push(materialId)
      }
      return
    }
    const totalEur = quantity * material.pricePerUnitEur
    lines.push({
      materialId,
      description: material.name,
      category: material.category,
      quantity,
      unit: material.priceUnit,
      unitPriceEur: material.pricePerUnitEur,
      totalEur
    })
    subtotals[material.category] += totalEur
  }

  for (const board of cuttingList.boards) {
    addLine(board.materialId, board.areaM2)
  }
  for (const edgeBand of cuttingList.edgeBands) {
    addLine(edgeBand.materialId, edgeBand.lengthM)
  }
  for (const hardware of cuttingList.hardware) {
    addLine(hardware.materialId, hardware.quantity)
  }

  return {
    lines,
    subtotalsEur: subtotals,
    totalEur: sumSubtotals(subtotals),
    missingMaterialIds: missing
  }
}

/** Convenience composition: design → panels → cutting list → quote. */
export function quoteForDesign(design: CabinetDesign, db: PriceDatabase): Quote {
  const build = generateCabinet(design)
  return calculateQuote(buildCuttingList(build), db)
}
