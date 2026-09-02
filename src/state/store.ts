import { create } from 'zustand'
import type { CabinetDesign } from '@core/cabinet'
import {
  clampDesign,
  createDefaultDesign,
  type CabinetKind
} from '@core/catalog/registry'
import { cabinetOverlapsOthers } from '@core/footprint'
import type { PriceDatabase } from '@core/materials'
import type { MaterialRepository } from '@core/repository/MaterialRepository'
import { createDefaultRoom } from '@core/room'
import { findPlacedCabinet, rotationStep, type PlacedCabinet, type SceneDesign } from '@core/scene'
import { placeWithoutOverlap, resolveSnap, spawnPlacement } from '@core/snap'
import { loadStoredLanguage, storeLanguage, type Language } from './language'

export type MaterialsLoadState = 'loading' | 'ready' | 'error'

const INITIAL_KIND: CabinetKind = 'base-cabinet'

function initialScene(): SceneDesign {
  const room = createDefaultRoom()
  const design = createDefaultDesign(INITIAL_KIND)
  // Same rule as any other add: the first cabinet starts against the back wall.
  const spawn = spawnPlacement({ room, cabinets: [] }, design)
  return {
    room,
    cabinets: [
      {
        id: 'cab-1',
        design,
        positionX: spawn.positionX,
        positionZ: spawn.positionZ,
        rotationDeg: spawn.rotationDeg
      }
    ]
  }
}

interface AppState {
  readonly scene: SceneDesign
  readonly selectedCabinetId: string | null
  readonly nextCabinetNumber: number
  readonly fitViewNonce: number
  readonly priceDb: PriceDatabase | null
  readonly materialsState: MaterialsLoadState
  readonly materialsError: string | null
  readonly language: Language
  addCabinet: (kind: CabinetKind) => void
  duplicateSelected: () => void
  deleteSelected: () => void
  selectCabinet: (id: string | null) => void
  /** Replaces the selected cabinet's design (clamped, then re-placed). */
  updateSelectedDesign: (design: CabinetDesign) => void
  /** Live drag: snap applied; ignored when the snapped spot would overlap. */
  moveSelected: (positionX: number, positionZ: number) => void
  /** Drag end: the attempted position resolves to the nearest free spot. */
  dropSelected: (positionX: number, positionZ: number) => void
  rotateSelected: () => void
  requestFitView: () => void
  loadMaterials: (repository: MaterialRepository) => Promise<void>
  setLanguage: (language: Language) => void
}

function selectedOf(state: Pick<AppState, 'scene' | 'selectedCabinetId'>): PlacedCabinet | undefined {
  return state.selectedCabinetId === null
    ? undefined
    : findPlacedCabinet(state.scene, state.selectedCabinetId)
}

// Scene invariant: every mutation that adds or moves a cabinet goes through
// placeWithoutOverlap (or is rejected), so the store never holds overlaps.
export const useAppStore = create<AppState>((set) => ({
  scene: initialScene(),
  selectedCabinetId: 'cab-1',
  nextCabinetNumber: 2,
  fitViewNonce: 0,
  priceDb: null,
  materialsState: 'loading',
  materialsError: null,
  language: loadStoredLanguage(),

  addCabinet: (kind) =>
    set((state) => {
      const design = createDefaultDesign(kind)
      const spawn = spawnPlacement(state.scene, design)
      const cabinet: PlacedCabinet = {
        id: `cab-${state.nextCabinetNumber}`,
        design,
        positionX: spawn.positionX,
        positionZ: spawn.positionZ,
        rotationDeg: spawn.rotationDeg
      }
      return {
        scene: placeWithoutOverlap(state.scene, cabinet),
        selectedCabinetId: cabinet.id,
        nextCabinetNumber: state.nextCabinetNumber + 1
      }
    }),

  duplicateSelected: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      // Aim flush beside the original; placeWithoutOverlap resolves the rest.
      const beside = spawnPlacement(
        { room: state.scene.room, cabinets: [selected] },
        selected.design
      )
      const copy: PlacedCabinet = {
        ...selected,
        id: `cab-${state.nextCabinetNumber}`,
        positionX: beside.positionX,
        positionZ: beside.positionZ
      }
      return {
        scene: placeWithoutOverlap(state.scene, copy),
        selectedCabinetId: copy.id,
        nextCabinetNumber: state.nextCabinetNumber + 1
      }
    }),

  deleteSelected: () =>
    set((state) => {
      if (state.selectedCabinetId === null) {
        return {}
      }
      return {
        scene: {
          ...state.scene,
          cabinets: state.scene.cabinets.filter((cabinet) => cabinet.id !== state.selectedCabinetId)
        },
        selectedCabinetId: null
      }
    }),

  selectCabinet: (id) => set({ selectedCabinetId: id }),

  updateSelectedDesign: (design) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      const updated: PlacedCabinet = { ...selected, design: clampDesign(design) }
      return { scene: placeWithoutOverlap(state.scene, updated) }
    }),

  moveSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      const others = state.scene.cabinets.filter((cabinet) => cabinet.id !== selected.id)
      const candidate: PlacedCabinet = { ...selected, positionX, positionZ }
      const snapped = resolveSnap(candidate, others)
      const next: PlacedCabinet = {
        ...candidate,
        positionX: snapped.positionX,
        positionZ: snapped.positionZ
      }
      if (cabinetOverlapsOthers(next, others)) {
        return {} // drag blocked at the last valid spot; drop will resolve
      }
      return {
        scene: {
          ...state.scene,
          cabinets: state.scene.cabinets.map((cabinet) =>
            cabinet.id === selected.id ? next : cabinet
          )
        }
      }
    }),

  dropSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      return {
        scene: placeWithoutOverlap(state.scene, { ...selected, positionX, positionZ })
      }
    }),

  rotateSelected: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      return {
        scene: placeWithoutOverlap(state.scene, {
          ...selected,
          rotationDeg: rotationStep(selected.rotationDeg)
        })
      }
    }),

  requestFitView: () => set((state) => ({ fitViewNonce: state.fitViewNonce + 1 })),

  setLanguage: (language) => {
    storeLanguage(language)
    set({ language })
  },

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
