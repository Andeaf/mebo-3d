import type { CabinetDesign } from './cabinet'
import { generateCabinet } from './catalog/registry'
import { buildCuttingList, type CuttingList } from './cuttingList'
import { findMaterial, type MaterialCategory, type PriceDatabase, type PriceUnit } from './materials'

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

/**
 * The price engine. A pure function: (cutting list, price database) → quote.
 * No UI, no I/O, no rendering concerns — keep it that way.
 */
export function calculateQuote(cuttingList: CuttingList, db: PriceDatabase): Quote {
  const lines: QuoteLine[] = []
  const missing: string[] = []
  const subtotals: Record<MaterialCategory, number> = { board: 0, edgeband: 0, hardware: 0 }

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
    totalEur: subtotals.board + subtotals.edgeband + subtotals.hardware,
    missingMaterialIds: missing
  }
}

/** Convenience composition: design → panels → cutting list → quote. */
export function quoteForDesign(design: CabinetDesign, db: PriceDatabase): Quote {
  const build = generateCabinet(design)
  return calculateQuote(buildCuttingList(build), db)
}
