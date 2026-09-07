import { create } from 'zustand'
import type { CabinetDesign } from '@core/cabinet'
import {
  clampDesign,
  createDefaultDesign,
  isCustomPieceDesign,
  type CabinetKind
} from '@core/catalog/registry'
import { createDefaultCustomPieceSpec, CUSTOM_PIECE_KIND } from '@core/customPiece'
import { cabinetOverlapsOthers, placedCabinetRect } from '@core/footprint'
import type { PriceDatabase } from '@core/materials'
import type { ProjectDocument } from '@core/project'
import type { MaterialRepository } from '@core/repository/MaterialRepository'
import { clampRoom, createDefaultRoom, roomContainsRect, type RoomDesign } from '@core/room'
import {
  findPlacedCabinet,
  nextCabinetNumberFor,
  rotationStep,
  type PlacedCabinet,
  type SceneDesign
} from '@core/scene'
import { placeWithoutOverlap, resolveDragPose, spawnPlacement } from '@core/snap'
import { loadStoredLanguage, storeLanguage, type Language } from './language'
import {
  cabinetRemoved,
  enterEditor,
  isEditing,
  reconcilePanels,
  selectPanel as selectPanelIn,
  type PieceEditorState,
  NO_EDITOR
} from './pieceEditor'
import { markDirty, markOpened, markSaved, type ProjectStatus, NEW_PROJECT } from './projectStatus'
import { loadRecentProjects, storeRecentProjects, type RecentProject } from './recentProjects'

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
  /** Where the scene lives on disk and whether it has unsaved changes. */
  readonly project: ProjectStatus
  readonly recentProjects: readonly RecentProject[]
  /** The last failed open/save, shown until dismissed; never silent. */
  readonly projectError: string | null
  /** The piece editor: which custom piece is open, which panel is selected. */
  readonly editor: PieceEditorState
  addCabinet: (kind: CabinetKind) => void
  /** Adds an empty custom piece (the name is the renderer's translated default) and opens its editor. */
  addCustomPiece: (name: string) => void
  /** Opens the editor on the selected cabinet; ignored unless it is a custom piece. */
  enterPieceEditor: () => void
  exitPieceEditor: () => void
  selectPanel: (panelId: string | null) => void
  duplicateSelected: () => void
  deleteSelected: () => void
  selectCabinet: (id: string | null) => void
  /** Replaces the selected cabinet's design (clamped, then re-placed). */
  updateSelectedDesign: (design: CabinetDesign) => void
  /** Resizes the room, re-placing every cabinet into it (rejected if one cannot fit). */
  updateRoom: (room: RoomDesign) => void
  /** Live drag: snap applied; ignored when the snapped spot would overlap. */
  moveSelected: (positionX: number, positionZ: number) => void
  /** Drag end: the attempted position resolves to the nearest free spot. */
  dropSelected: (positionX: number, positionZ: number) => void
  rotateSelected: () => void
  requestFitView: () => void
  loadMaterials: (repository: MaterialRepository) => Promise<void>
  setLanguage: (language: Language) => void
  /** File › New (after the unsaved guard): the start-up scene, no file, clean. */
  resetProject: () => void
  /** File › Open (after parsing): the file's scene, its creation stamp, clean, room framed. */
  loadProject: (document: ProjectDocument, path: string) => void
  markProjectSaved: (path: string, savedAt: string) => void
  setProjectError: (message: string | null) => void
  setRecentProjects: (list: readonly RecentProject[]) => void
}

function selectedOf(state: Pick<AppState, 'scene' | 'selectedCabinetId'>): PlacedCabinet | undefined {
  return state.selectedCabinetId === null
    ? undefined
    : findPlacedCabinet(state.scene, state.selectedCabinetId)
}

function samePlacement(a: PlacedCabinet, b: PlacedCabinet): boolean {
  // Designs are immutable values: a different reference is a different design.
  return (
    a.id === b.id &&
    a.design === b.design &&
    a.positionX === b.positionX &&
    a.positionZ === b.positionZ &&
    a.rotationDeg === b.rotationDeg
  )
}

/** Same room and the same cabinets in the same poses (design identity counts). */
function sameScene(a: SceneDesign, b: SceneDesign): boolean {
  return (
    a.room.widthMm === b.room.widthMm &&
    a.room.lengthMm === b.room.lengthMm &&
    a.room.wallHeightMm === b.room.wallHeightMm &&
    a.cabinets.length === b.cabinets.length &&
    a.cabinets.every((cabinet, index) => samePlacement(cabinet, b.cabinets[index]))
  )
}

/**
 * The one way a mutation lands: dirty exactly when the scene changed. A
 * rejected placement (the gate handed the scene back unchanged) and a
 * placement that resolved to where the cabinet already stood (a click
 * without a drag) are both no-ops: no new scene, no dirty, no re-render.
 */
function sceneChange(
  state: Pick<AppState, 'scene' | 'project'>,
  scene: SceneDesign
): Partial<AppState> {
  return scene === state.scene || sameScene(state.scene, scene)
    ? {}
    : { scene, project: markDirty(state.project) }
}

/**
 * Adds a design at the spawn spot as the next `cab-<n>` and selects it, or
 * changes nothing when the room holds no free spot (the id is not consumed).
 */
function spawnDesign(
  state: Pick<AppState, 'scene' | 'project' | 'nextCabinetNumber'>,
  design: CabinetDesign
): Partial<AppState> {
  const spawn = spawnPlacement(state.scene, design)
  const cabinet: PlacedCabinet = {
    id: `cab-${state.nextCabinetNumber}`,
    design,
    positionX: spawn.positionX,
    positionZ: spawn.positionZ,
    rotationDeg: spawn.rotationDeg
  }
  const change = sceneChange(state, placeWithoutOverlap(state.scene, cabinet))
  if (change.scene === undefined) {
    return {}
  }
  return {
    ...change,
    selectedCabinetId: cabinet.id,
    nextCabinetNumber: state.nextCabinetNumber + 1
  }
}

// Scene invariant: every mutation that adds or moves a cabinet goes through
// placeWithoutOverlap (or is rejected), so the store never holds overlaps.
// While the piece editor is open the scene-level gestures (select, move,
// rotate, duplicate) are no-ops: the UI hides them, and this backs that up.
export const useAppStore = create<AppState>((set) => ({
  scene: initialScene(),
  selectedCabinetId: 'cab-1',
  nextCabinetNumber: 2,
  fitViewNonce: 0,
  priceDb: null,
  materialsState: 'loading',
  materialsError: null,
  language: loadStoredLanguage(),
  project: NEW_PROJECT,
  recentProjects: loadRecentProjects(),
  projectError: null,
  editor: NO_EDITOR,

  addCabinet: (kind) =>
    set((state) => (isEditing(state.editor) ? {} : spawnDesign(state, createDefaultDesign(kind)))),

  addCustomPiece: (name) =>
    set((state) => {
      if (isEditing(state.editor)) {
        return {}
      }
      const added = spawnDesign(state, {
        kind: CUSTOM_PIECE_KIND,
        spec: createDefaultCustomPieceSpec(name)
      })
      const addedId = added.selectedCabinetId
      if (typeof addedId !== 'string') {
        return {}
      }
      return { ...added, editor: enterEditor(addedId) }
    }),

  enterPieceEditor: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || !isCustomPieceDesign(selected.design)) {
        return {}
      }
      return { editor: enterEditor(selected.id) }
    }),

  exitPieceEditor: () => set({ editor: NO_EDITOR }),

  selectPanel: (panelId) => set((state) => ({ editor: selectPanelIn(state.editor, panelId) })),

  duplicateSelected: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
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
      const change = sceneChange(state, placeWithoutOverlap(state.scene, copy))
      if (change.scene === undefined) {
        return {}
      }
      return {
        ...change,
        selectedCabinetId: copy.id,
        nextCabinetNumber: state.nextCabinetNumber + 1
      }
    }),

  deleteSelected: () =>
    set((state) => {
      const removedId = state.selectedCabinetId
      if (removedId === null) {
        return {}
      }
      return {
        ...sceneChange(state, {
          ...state.scene,
          cabinets: state.scene.cabinets.filter((cabinet) => cabinet.id !== removedId)
        }),
        selectedCabinetId: null,
        editor: cabinetRemoved(state.editor, removedId)
      }
    }),

  selectCabinet: (id) => set((state) => (isEditing(state.editor) ? {} : { selectedCabinetId: id })),

  updateSelectedDesign: (design) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      const clamped = clampDesign(design)
      const updated: PlacedCabinet = { ...selected, design: clamped }
      const change = sceneChange(state, placeWithoutOverlap(state.scene, updated))
      if (change.scene === undefined || !isCustomPieceDesign(clamped)) {
        return change
      }
      // A panel selection must not outlive its panel.
      return {
        ...change,
        editor: reconcilePanels(
          state.editor,
          clamped.spec.panels.map((panel) => panel.id)
        )
      }
    }),

  updateRoom: (room) =>
    set((state) => {
      const clamped = clampRoom(room)
      // Re-place every cabinet into the new room, in scene order, so shrinking
      // pulls them in. If even one has nowhere to go, keep the old room rather
      // than strand or drop furniture.
      let next: SceneDesign = { room: clamped, cabinets: [] }
      for (const cabinet of state.scene.cabinets) {
        const placed = placeWithoutOverlap(next, cabinet)
        if (placed.cabinets.length === next.cabinets.length) {
          return {}
        }
        next = placed
      }
      return sceneChange(state, next)
    }),

  moveSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      const others = state.scene.cabinets.filter((cabinet) => cabinet.id !== selected.id)
      const candidate: PlacedCabinet = { ...selected, positionX, positionZ }
      // The one path that may also turn the cabinet: a wall snap puts its back
      // against the wall it lands on.
      const pose = resolveDragPose(candidate, others, state.scene.room)
      const next: PlacedCabinet = {
        ...candidate,
        positionX: pose.positionX,
        positionZ: pose.positionZ,
        rotationDeg: pose.rotationDeg
      }
      if (
        cabinetOverlapsOthers(next, others) ||
        !roomContainsRect(state.scene.room, placedCabinetRect(next))
      ) {
        return {} // drag blocked at the last valid spot; drop will resolve
      }
      return sceneChange(state, {
        ...state.scene,
        cabinets: state.scene.cabinets.map((cabinet) =>
          cabinet.id === selected.id ? next : cabinet
        )
      })
    }),

  dropSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      return sceneChange(
        state,
        placeWithoutOverlap(state.scene, { ...selected, positionX, positionZ })
      )
    }),

  rotateSelected: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      return sceneChange(
        state,
        placeWithoutOverlap(state.scene, {
          ...selected,
          rotationDeg: rotationStep(selected.rotationDeg)
        })
      )
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
  },

  resetProject: () =>
    set((state) => ({
      scene: initialScene(),
      selectedCabinetId: 'cab-1',
      nextCabinetNumber: 2,
      project: NEW_PROJECT,
      projectError: null,
      editor: NO_EDITOR,
      fitViewNonce: state.fitViewNonce + 1
    })),

  loadProject: (document, path) =>
    set((state) => ({
      scene: document.scene,
      selectedCabinetId: null,
      // One above the highest loaded id, so an added cabinet can never collide.
      nextCabinetNumber: nextCabinetNumberFor(document.scene),
      project: markOpened(path, document.metadata.createdAt),
      projectError: null,
      editor: NO_EDITOR,
      fitViewNonce: state.fitViewNonce + 1
    })),

  markProjectSaved: (path, savedAt) =>
    set((state) => ({ project: markSaved(state.project, path, savedAt) })),

  setProjectError: (message) => set({ projectError: message }),

  setRecentProjects: (list) => {
    storeRecentProjects(list)
    set({ recentProjects: list })
  }
}))
