import { create } from 'zustand'
import {
  clampBaseCabinetParams,
  createDefaultBaseCabinetParams,
  type BaseCabinetParams
} from '@core/cabinet'
import type { PriceDatabase } from '@core/materials'
import type { MaterialRepository } from '@core/repository/MaterialRepository'

export type MaterialsLoadState = 'loading' | 'ready' | 'error'

interface AppState {
  readonly params: BaseCabinetParams
  readonly priceDb: PriceDatabase | null
  readonly materialsState: MaterialsLoadState
  readonly materialsError: string | null
  updateParams: (patch: Partial<BaseCabinetParams>) => void
  loadMaterials: (repository: MaterialRepository) => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  params: createDefaultBaseCabinetParams(),
  priceDb: null,
  materialsState: 'loading',
  materialsError: null,

  updateParams: (patch) =>
    set((state) => ({ params: clampBaseCabinetParams({ ...state.params, ...patch }) })),

  loadMaterials: async (repository) => {
    set({ materialsState: 'loading', materialsError: null })
    try {
      const priceDb = await repository.loadPriceDatabase()
      set({ priceDb, materialsState: 'ready' })
    } catch (error) {
      set({
        materialsState: 'error',
        materialsError: error instanceof Error ? error.message : String(error)
      })
    }
  }
}))
