import { MATERIAL_CATEGORIES, type PriceDatabase } from './materials'
import { emptySubtotals, quoteForDesign, sumSubtotals, type Quote, type QuoteLine } from './pricing'
import type { SceneDesign } from './scene'

export interface CabinetQuoteSummary {
  readonly cabinetId: string
  readonly quote: Quote
}

export interface SceneQuote {
  /** One quote per placed cabinet, in scene order (existing engine, untouched). */
  readonly cabinets: readonly CabinetQuoteSummary[]
  /** Quantities and totals aggregated per material across the whole scene. */
  readonly materialTotals: readonly QuoteLine[]
  readonly subtotalsEur: Quote['subtotalsEur']
  readonly totalEur: number
  readonly missingMaterialIds: readonly string[]
}

/**
 * Scene pricing: pure composition of the single-cabinet price engine.
 * (scene, price database) → per-cabinet quotes + per-material scene totals.
 */
export function quoteForScene(scene: SceneDesign, db: PriceDatabase): SceneQuote {
  const cabinets: CabinetQuoteSummary[] = scene.cabinets.map((placed) => ({
    cabinetId: placed.id,
    quote: quoteForDesign(placed.design, db)
  }))

  const totalsByMaterial = new Map<string, QuoteLine>()
  const subtotals = emptySubtotals()
  const missing = new Set<string>()

  for (const { quote } of cabinets) {
    for (const line of quote.lines) {
      const existing = totalsByMaterial.get(line.materialId)
      totalsByMaterial.set(
        line.materialId,
        existing === undefined
          ? line
          : {
              ...existing,
              quantity: existing.quantity + line.quantity,
              totalEur: existing.totalEur + line.totalEur
            }
      )
      subtotals[line.category] += line.totalEur
    }
    for (const materialId of quote.missingMaterialIds) {
      missing.add(materialId)
    }
  }

  const materialTotals = [...totalsByMaterial.values()].sort((a, b) => {
    const categoryDelta =
      MATERIAL_CATEGORIES.indexOf(a.category) - MATERIAL_CATEGORIES.indexOf(b.category)
    return categoryDelta !== 0 ? categoryDelta : a.materialId.localeCompare(b.materialId)
  })

  return {
    cabinets,
    materialTotals,
    subtotalsEur: subtotals,
    totalEur: sumSubtotals(subtotals),
    missingMaterialIds: [...missing].sort((a, b) => a.localeCompare(b))
  }
}
