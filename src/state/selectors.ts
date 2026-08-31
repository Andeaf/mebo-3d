import { useMemo } from 'react'
import type { BaseCabinetParams } from '@core/cabinet'
import { generateBaseCabinet, type CabinetBuild } from '@core/catalog/baseCabinet'
import type { PlacedCabinet } from '@core/scene'
import { quoteForScene, type SceneQuote } from '@core/scenePricing'
import { connectedRun, type ConnectedRun } from '@core/snap'
import { useAppStore } from './store'

// Params objects are immutable (every edit creates a new object), so builds
// can be cached per params identity: only the edited cabinet regenerates.
const buildCache = new WeakMap<BaseCabinetParams, CabinetBuild>()

/** The generated panel list for one cabinet — the single source of truth. */
export function buildForParams(params: BaseCabinetParams): CabinetBuild {
  const cached = buildCache.get(params)
  if (cached !== undefined) {
    return cached
  }
  const build = generateBaseCabinet(params)
  buildCache.set(params, build)
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

/** The flush run the selected cabinet belongs to (for the measure line). */
export function useSelectedRun(): ConnectedRun | null {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  return useMemo(
    () => (selectedCabinetId === null ? null : connectedRun(scene, selectedCabinetId)),
    [scene, selectedCabinetId]
  )
}
