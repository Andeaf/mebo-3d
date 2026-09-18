import { useMemo } from 'react'
import type { CabinetDesign } from '@core/cabinet'
import type { CabinetBuild } from '@core/catalog/parts'
import { generateCabinet } from '@core/catalog/registry'
import type { PlacedCabinet } from '@core/scene'
import { quoteForScene, type SceneQuote } from '@core/scenePricing'
import { connectedRun, type ConnectedRun } from '@core/snap'
import { computeWorktops, type WorktopSlab } from '@core/worktopLayout'
import { useAppStore } from './store'

// Design objects are immutable (every edit creates a new one), so builds can
// be cached per design identity: only the edited cabinet regenerates.
const buildCache = new WeakMap<CabinetDesign, CabinetBuild>()

/** The generated panel list for one cabinet — the single source of truth. */
export function buildForDesign(design: CabinetDesign): CabinetBuild {
  const cached = buildCache.get(design)
  if (cached !== undefined) {
    return cached
  }
  const build = generateCabinet(design)
  buildCache.set(design, build)
  return build
}

export function useSelectedCabinet(): PlacedCabinet | null {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  return selectedCabinetId === null
    ? null
    : (scene.cabinets.find((cabinet) => cabinet.id === selectedCabinetId) ?? null)
}

/** Live aggregated scene quote; null until the price database has loaded. */
export function useSceneQuote(): SceneQuote | null {
  const scene = useAppStore((state) => state.scene)
  const priceDb = useAppStore((state) => state.priceDb)
  return useMemo(
    () => (priceDb === null ? null : quoteForScene(scene, priceDb)),
    [scene, priceDb]
  )
}

/** The worktop slabs derived from the scene (its settings included); recomputed with the scene, like the run. */
export function useWorktops(): readonly WorktopSlab[] {
  const scene = useAppStore((state) => state.scene)
  return useMemo(() => computeWorktops(scene, scene.worktop), [scene])
}

/** The flush run the selected cabinet belongs to (for the measure line). */
export function useSelectedRun(): ConnectedRun | null {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  return useMemo(
    () => (selectedCabinetId === null ? null : connectedRun(scene, selectedCabinetId)),
    [scene, selectedCabinetId]
  )
}
