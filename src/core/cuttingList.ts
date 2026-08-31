import type { CabinetBuild } from './catalog/baseCabinet'
import {
  panelAreaSquareMeters,
  panelEdgeBandingLengthMm,
  type Panel,
  type PanelRole
} from './panel'
import { MM_PER_METER } from './units'

export interface CuttingListRow {
  readonly panelId: string
  readonly role: PanelRole
  readonly materialId: string
  readonly lengthMm: number
  readonly widthMm: number
  readonly thicknessMm: number
  readonly areaM2: number
  readonly edgeBandingMm: number
}

export interface BoardUsage {
  readonly materialId: string
  readonly areaM2: number
  readonly panelCount: number
}

export interface EdgeBandUsage {
  readonly materialId: string
  readonly lengthM: number
}

export interface HardwareUsage {
  readonly materialId: string
  readonly quantity: number
}

export interface CuttingList {
  readonly rows: readonly CuttingListRow[]
  readonly boards: readonly BoardUsage[]
  readonly edgeBands: readonly EdgeBandUsage[]
  readonly hardware: readonly HardwareUsage[]
}

function toRow(panel: Panel): CuttingListRow {
  return {
    panelId: panel.id,
    role: panel.role,
    materialId: panel.materialId,
    lengthMm: panel.lengthMm,
    widthMm: panel.widthMm,
    thicknessMm: panel.thicknessMm,
    areaM2: panelAreaSquareMeters(panel),
    edgeBandingMm: panelEdgeBandingLengthMm(panel)
  }
}

/** Aggregates a generated build into per-material quantities (sorted by material id). */
export function buildCuttingList(build: CabinetBuild): CuttingList {
  const rows = build.panels.map(toRow)

  const boardTotals = new Map<string, { areaM2: number; panelCount: number }>()
  const edgeTotals = new Map<string, number>()
  for (const panel of build.panels) {
    const board = boardTotals.get(panel.materialId) ?? { areaM2: 0, panelCount: 0 }
    board.areaM2 += panelAreaSquareMeters(panel)
    board.panelCount += 1
    boardTotals.set(panel.materialId, board)

    if (panel.edgeBanding !== null && panel.edgeBanding.edges.length > 0) {
      const bandMaterialId = panel.edgeBanding.materialId
      const current = edgeTotals.get(bandMaterialId) ?? 0
      edgeTotals.set(bandMaterialId, current + panelEdgeBandingLengthMm(panel))
    }
  }

  const hardwareTotals = new Map<string, number>()
  for (const item of build.hardware) {
    hardwareTotals.set(item.materialId, (hardwareTotals.get(item.materialId) ?? 0) + item.quantity)
  }

  const byId = <T extends { materialId: string }>(a: T, b: T): number =>
    a.materialId.localeCompare(b.materialId)

  return {
    rows,
    boards: [...boardTotals.entries()]
      .map(([materialId, totals]) => ({ materialId, ...totals }))
      .sort(byId),
    edgeBands: [...edgeTotals.entries()]
      .map(([materialId, lengthMm]) => ({ materialId, lengthM: lengthMm / MM_PER_METER }))
      .sort(byId),
    hardware: [...hardwareTotals.entries()]
      .map(([materialId, quantity]) => ({ materialId, quantity }))
      .sort(byId)
  }
}
