import { findMaterial, MATERIAL_CATEGORIES, type PriceDatabase, type PriceUnit } from './materials'
import { emptySubtotals, quoteForDesign, sumSubtotals, type Quote, type QuoteLine } from './pricing'
import type { SceneDesign } from './scene'
import { computeWorktops, worktopSlabAreaM2, type WorktopSlab } from './worktopLayout'

export interface CabinetQuoteSummary {
  readonly cabinetId: string
  readonly quote: Quote
}

/**
 * One worktop slab, priced. Its `category` is always `worktop` — that is what
 * the line IS — whatever category the material happens to carry, so the
 * worktop block of the price panel and `subtotalsEur.worktop` always agree.
 */
export interface WorktopQuoteLine extends QuoteLine {
  readonly slabId: string
  readonly lengthMm: number
  readonly depthMm: number
}

export interface SceneQuote {
  /** One quote per placed cabinet, in scene order (existing engine, untouched). */
  readonly cabinets: readonly CabinetQuoteSummary[]
  /** Quantities and totals aggregated per material across the whole scene (cabinets only). */
  readonly materialTotals: readonly QuoteLine[]
  /** One line per worktop slab, in slab order; empty when disabled or when no run carries one. */
  readonly worktops: readonly WorktopQuoteLine[]
  readonly subtotalsEur: Quote['subtotalsEur']
  readonly totalEur: number
  readonly missingMaterialIds: readonly string[]
}

/**
 * The quantity a slab is billed in, by the material's own unit. THIS IS THE
 * SEAM for the company's real worktop prices: today's materials are per m²;
 * when their list prices HPL per running metre, the only change is that
 * material's `priceUnit` in materials.json (the length along the run is
 * billed); `piece` bills one per slab.
 */
export function worktopQuantity(slab: WorktopSlab, unit: PriceUnit): number {
  switch (unit) {
    case 'm2':
      return worktopSlabAreaM2(slab)
    case 'm':
      return slab.lengthMm / 1000
    case 'piece':
      return 1
  }
}

/**
 * Scene pricing: pure composition of the single-cabinet price engine plus
 * the derived worktop slabs. (scene, price database) → per-cabinet quotes +
 * per-material scene totals + one line per slab.
 */
export function quoteForScene(scene: SceneDesign, db: PriceDatabase): SceneQuote {
  const cabinets: CabinetQuoteSummary[] = scene.cabinets.map((placed) => ({
    cabinetId: placed.id,
    quote: quoteForDesign(placed.design, db)
  }))

  const totalsByMaterial = new Map<string, QuoteLine>()
  const subtotals = emptySubtotals()
  const missing = new Set<string>()

  const worktops: WorktopQuoteLine[] = []
  for (const slab of computeWorktops(scene, scene.worktop)) {
    const material = findMaterial(db, slab.materialId)
    if (material === undefined) {
      // Prices are not in the file: a discontinued worktop material is a
      // warning in the panel, the slabs still render.
      missing.add(slab.materialId)
      continue
    }
    const quantity = worktopQuantity(slab, material.priceUnit)
    const totalEur = quantity * material.pricePerUnitEur
    worktops.push({
      slabId: slab.id,
      lengthMm: slab.lengthMm,
      depthMm: slab.depthMm,
      materialId: slab.materialId,
      description: material.name,
      category: 'worktop',
      quantity,
      unit: material.priceUnit,
      unitPriceEur: material.pricePerUnitEur,
      totalEur
    })
    subtotals.worktop += totalEur
  }

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
    worktops,
    subtotalsEur: subtotals,
    totalEur: sumSubtotals(subtotals),
    missingMaterialIds: [...missing].sort((a, b) => a.localeCompare(b))
  }
}
