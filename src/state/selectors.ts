import { useMemo } from 'react'
import { generateBaseCabinet, type CabinetBuild } from '@core/catalog/baseCabinet'
import { quoteForDesign, type Quote } from '@core/pricing'
import { useAppStore } from './store'

/** The generated build (panel list) for the current parameters — single source of truth. */
export function useCabinetBuild(): CabinetBuild {
  const params = useAppStore((state) => state.params)
  return useMemo(() => generateBaseCabinet(params), [params])
}

/** Live itemized quote; null until the price database has loaded. */
export function useQuote(): Quote | null {
  const params = useAppStore((state) => state.params)
  const priceDb = useAppStore((state) => state.priceDb)
  return useMemo(
    () => (priceDb === null ? null : quoteForDesign({ kind: 'base-cabinet', params }, priceDb)),
    [params, priceDb]
  )
}
