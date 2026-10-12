import { create } from 'zustand'
import type { CabinetDesign } from '@core/cabinet'
import {
  clampDesign,
  createDefaultDesign,
  designWithMountingHeightMm,
  isCustomPieceDesign,
  sameDesign,
  type CabinetKind
} from '@core/catalog/registry'
import { createDefaultCustomPieceSpec, pieceElementIds, CUSTOM_PIECE_KIND } from '@core/customPiece'
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
import {
  clampWorktopSettings,
  createDefaultWorktopSettings,
  type WorktopSettings
} from '@core/worktop'
import {
  endBurst,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type History,
  EMPTY_HISTORY
} from './history'
import { loadStoredLanguage, storeLanguage, type Language } from './language'
import {
  cabinetRemoved,
  enterEditor,
  isEditing,
  reconcileElements,
  selectElement as selectElementIn,
  type PieceEditorState,
  NO_EDITOR
} from './pieceEditor'
import { markOpened, markSaved, type ProjectStatus, NEW_PROJECT } from './projectStatus'
import { loadRecentProjects, storeRecentProjects, type RecentProject } from './recentProjects'

export type MaterialsLoadState = 'loading' | 'ready' | 'error'

const INITIAL_KIND: CabinetKind = 'base-cabinet'

function initialScene(): SceneDesign {
  const room = createDefaultRoom()
  const worktop = createDefaultWorktopSettings()
  const design = createDefaultDesign(INITIAL_KIND)
  // Same rule as any other add: the first cabinet starts against the back wall.
  const spawn = spawnPlacement({ room, worktop, cabinets: [] }, design)
  return {
    room,
    worktop,
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
  /**
   * The scene as it was last saved, opened or created. The project is dirty
   * exactly when `scene` is not this reference (`isProjectDirty`): an undo
   * back to it clears the flag, an edit away from it sets it.
   */
  readonly savedScene: SceneDesign
  /** Undo / redo over the scene (Phase 9); see `history.ts` for the model. */
  readonly history: History
  /**
   * The scene a pointer gesture (a drag) started from; null outside one.
   * While set, scene changes are not recorded — the gesture records its
   * base as ONE entry when it ends, or restores it when cancelled.
   */
  readonly gestureBase: SceneDesign | null
  readonly selectedCabinetId: string | null
  readonly nextCabinetNumber: number
  readonly fitViewNonce: number
  readonly priceDb: PriceDatabase | null
  readonly materialsState: MaterialsLoadState
  readonly materialsError: string | null
  readonly language: Language
  /** Where the scene lives on disk (never whether it changed — see `savedScene`). */
  readonly project: ProjectStatus
  readonly recentProjects: readonly RecentProject[]
  /** The last failed open/save, shown until dismissed; never silent. */
  readonly projectError: string | null
  /** The piece editor: which custom piece is open, which of its elements is selected. */
  readonly editor: PieceEditorState
  /**
   * A project flow (New/Open/Save/close) is running, possibly with a native
   * dialog up. Windows already keeps real input away from the window while
   * a modal is shown; this makes the renderer refuse undo/redo on its own
   * as well, whatever path a key event takes.
   */
  readonly flowBusy: boolean
  addCabinet: (kind: CabinetKind) => void
  /** Adds an empty custom piece (the name is the renderer's translated default) and opens its editor. */
  addCustomPiece: (name: string) => void
  /** Opens the editor on the selected cabinet; ignored unless it is a custom piece. */
  enterPieceEditor: () => void
  exitPieceEditor: () => void
  selectElement: (elementId: string | null) => void
  duplicateSelected: () => void
  deleteSelected: () => void
  selectCabinet: (id: string | null) => void
  /**
   * Replaces the selected cabinet's design (clamped, then re-placed). A
   * `coalesceKey` names the field being edited so a burst (a slider drag)
   * is one undo entry; without one every call is its own entry.
   */
  updateSelectedDesign: (design: CabinetDesign, coalesceKey?: string) => void
  /** Resizes the room, re-placing every cabinet into it (rejected if one cannot fit). */
  updateRoom: (room: RoomDesign, coalesceKey?: string) => void
  /** Replaces the scene's worktop settings (clamped); the slabs follow by derivation. */
  updateWorktop: (settings: WorktopSettings, coalesceKey?: string) => void
  /** Live drag frame (inside a gesture): snap applied; ignored when the snapped spot would overlap. */
  moveSelected: (positionX: number, positionZ: number) => void
  /** Drag end: the attempted position resolves to the nearest free spot. */
  dropSelected: (positionX: number, positionZ: number) => void
  /**
   * Puts the selected cabinet at a position through the gate (the X/Z
   * fields): the resolved pose is what lands, a rejected value snaps back.
   */
  placeSelected: (positionX: number, positionZ: number) => void
  /** Arrow keys in scene mode: `placeSelected` by a delta, one entry per key burst. */
  nudgeSelected: (deltaX: number, deltaZ: number) => void
  /**
   * Live vertical drag frame (inside a gesture) of a hanging design: the
   * floor drag turned 90°. The height is clamped; one at which the cabinet
   * would overlap a neighbour is skipped (it stays at the last legal
   * height instead of jumping sideways). The drop goes through the gate.
   */
  moveSelectedVertically: (mountingHeightMm: number) => void
  rotateSelected: () => void
  /** A pointer gesture starts: remember the scene to record (or restore) when it ends. */
  beginGesture: () => void
  /** The gesture ends: one undo entry if the scene changed, none otherwise. */
  endGesture: () => void
  /** Escape mid-gesture: the scene goes back to the gesture's base, nothing is recorded. */
  cancelGesture: () => void
  undo: () => void
  redo: () => void
  /** Set by the project bridge around every flow; undo/redo are refused while true. */
  setFlowBusy: (busy: boolean) => void
  requestFitView: () => void
  loadMaterials: (repository: MaterialRepository) => Promise<void>
  setLanguage: (language: Language) => void
  /** File › New (after the unsaved guard): the start-up scene, no file, clean, no history. */
  resetProject: () => void
  /** File › Open (after parsing): the file's scene, its creation stamp, clean, no history, room framed. */
  loadProject: (document: ProjectDocument, path: string) => void
  markProjectSaved: (path: string, savedAt: string) => void
  setProjectError: (message: string | null) => void
  setRecentProjects: (list: readonly RecentProject[]) => void
}

/** Unsaved changes exist exactly when the scene is not the saved reference. */
export function isProjectDirty(state: Pick<AppState, 'scene' | 'savedScene'>): boolean {
  return state.scene !== state.savedScene
}

function selectedOf(state: Pick<AppState, 'scene' | 'selectedCabinetId'>): PlacedCabinet | undefined {
  return state.selectedCabinetId === null
    ? undefined
    : findPlacedCabinet(state.scene, state.selectedCabinetId)
}

function samePlacement(a: PlacedCabinet, b: PlacedCabinet): boolean {
  // Designs are compared by value: every edit builds a new design object, so
  // a reference test would call "the active door count clicked again" a
  // change. The reference check stays in front as the fast path.
  return (
    a.id === b.id &&
    a.positionX === b.positionX &&
    a.positionZ === b.positionZ &&
    a.rotationDeg === b.rotationDeg &&
    (a.design === b.design || sameDesign(a.design, b.design))
  )
}

function sameWorktop(a: WorktopSettings, b: WorktopSettings): boolean {
  return (
    a.enabled === b.enabled &&
    a.materialId === b.materialId &&
    a.thicknessMm === b.thicknessMm &&
    a.frontOverhangMm === b.frontOverhangMm
  )
}

/** Same room, same worktop settings and the same cabinets in the same poses with the same design values. */
function sameScene(a: SceneDesign, b: SceneDesign): boolean {
  return (
    a.room.widthMm === b.room.widthMm &&
    a.room.lengthMm === b.room.lengthMm &&
    a.room.wallHeightMm === b.room.wallHeightMm &&
    sameWorktop(a.worktop, b.worktop) &&
    a.cabinets.length === b.cabinets.length &&
    a.cabinets.every((cabinet, index) => samePlacement(cabinet, b.cabinets[index]))
  )
}

type SceneState = Pick<AppState, 'scene' | 'history' | 'gestureBase'>

/**
 * The one way a mutation lands, and the one place history is written. A
 * rejected placement (the gate handed the scene back unchanged), a
 * placement that resolved to where the cabinet already stood (a click
 * without a drag) and an edit that lands on the same design values (a pick
 * that is already active) are all no-ops: the scene reference stays, no
 * entry, not dirty, no re-render.
 * Inside a gesture the scene moves without an entry — the gesture records
 * its base once, at the end. Dirty needs no bookkeeping: it is
 * `scene !== savedScene`.
 */
function sceneChange(state: SceneState, scene: SceneDesign, key: string | null = null): Partial<AppState> {
  if (scene === state.scene || sameScene(state.scene, scene)) {
    return {}
  }
  if (state.gestureBase !== null) {
    return { scene }
  }
  return { scene, history: record(state.history, state.scene, key, Date.now()) }
}

/** A scoped coalescing key, or null (never coalesce) when the caller gave none. */
function scoped(prefix: string, key: string | undefined): string | null {
  return key === undefined ? null : `${prefix}:${key}`
}

/**
 * After a scene arrives from history (undo, redo, a cancelled gesture): the
 * transient state is reconciled, never restored. A selection whose cabinet
 * is gone is dropped; the editor closes if its piece is gone and forgets an
 * element (a panel or a drawer) that is gone.
 */
function reconcileWith(
  state: Pick<AppState, 'selectedCabinetId' | 'editor'>,
  scene: SceneDesign
): Pick<AppState, 'selectedCabinetId' | 'editor'> {
  const selectedCabinetId =
    state.selectedCabinetId !== null && findPlacedCabinet(scene, state.selectedCabinetId) !== undefined
      ? state.selectedCabinetId
      : null
  let editor = state.editor
  if (editor.editingPieceId !== null) {
    const piece = findPlacedCabinet(scene, editor.editingPieceId)
    editor =
      piece === undefined || !isCustomPieceDesign(piece.design)
        ? NO_EDITOR
        : reconcileElements(editor, pieceElementIds(piece.design.spec))
  }
  return { selectedCabinetId, editor }
}

/**
 * Adds a design at the spawn spot as the next `cab-<n>` and selects it, or
 * changes nothing when the room holds no free spot (the id is not consumed).
 */
function spawnDesign(
  state: SceneState & Pick<AppState, 'nextCabinetNumber'>,
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

/** A fresh document: the given scene is both the present and the saved reference, with no history. */
function freshDocument(scene: SceneDesign): Pick<AppState, 'scene' | 'savedScene' | 'history' | 'gestureBase'> {
  return { scene, savedScene: scene, history: EMPTY_HISTORY, gestureBase: null }
}

// Scene invariant: every mutation that adds or moves a cabinet goes through
// placeWithoutOverlap (or is rejected), so the store never holds overlaps.
// While the piece editor is open the scene-level gestures (select, move,
// rotate, duplicate) are no-ops: the UI hides them, and this backs that up.
export const useAppStore = create<AppState>((set) => ({
  ...freshDocument(initialScene()),
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
  flowBusy: false,

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

  selectElement: (elementId) => set((state) => ({ editor: selectElementIn(state.editor, elementId) })),

  duplicateSelected: () =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      // Aim flush beside the original; placeWithoutOverlap resolves the rest.
      const beside = spawnPlacement({ ...state.scene, cabinets: [selected] }, selected.design)
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

  updateSelectedDesign: (design, coalesceKey) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined) {
        return {}
      }
      const clamped = clampDesign(design)
      const updated: PlacedCabinet = { ...selected, design: clamped }
      const change = sceneChange(
        state,
        placeWithoutOverlap(state.scene, updated),
        scoped(selected.id, coalesceKey)
      )
      if (change.scene === undefined || !isCustomPieceDesign(clamped)) {
        return change
      }
      // An element selection must not outlive its panel or drawer.
      return { ...change, editor: reconcileElements(state.editor, pieceElementIds(clamped.spec)) }
    }),

  updateRoom: (room, coalesceKey) =>
    set((state) => {
      const clamped = clampRoom(room)
      // Re-place every cabinet into the new room, in scene order, so shrinking
      // pulls them in. If even one has nowhere to go, keep the old room rather
      // than strand or drop furniture.
      let next: SceneDesign = { ...state.scene, room: clamped, cabinets: [] }
      for (const cabinet of state.scene.cabinets) {
        const placed = placeWithoutOverlap(next, cabinet)
        if (placed.cabinets.length === next.cabinets.length) {
          return {}
        }
        next = placed
      }
      return sceneChange(state, next, scoped('room', coalesceKey))
    }),

  updateWorktop: (settings, coalesceKey) =>
    set((state) =>
      sceneChange(
        state,
        { ...state.scene, worktop: clampWorktopSettings(settings) },
        scoped('worktop', coalesceKey)
      )
    ),

  moveSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      const others = state.scene.cabinets.filter((cabinet) => cabinet.id !== selected.id)
      // Whole millimetres, like every other value in the domain: a pointer
      // position is fractional, a stored pose never is.
      const candidate: PlacedCabinet = {
        ...selected,
        positionX: Math.round(positionX),
        positionZ: Math.round(positionZ)
      }
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
        placeWithoutOverlap(state.scene, {
          ...selected,
          positionX: Math.round(positionX),
          positionZ: Math.round(positionZ)
        })
      )
    }),

  placeSelected: (positionX, positionZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      return sceneChange(
        state,
        placeWithoutOverlap(state.scene, {
          ...selected,
          positionX: Math.round(positionX),
          positionZ: Math.round(positionZ)
        })
      )
    }),

  nudgeSelected: (deltaX, deltaZ) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      return sceneChange(
        state,
        placeWithoutOverlap(state.scene, {
          ...selected,
          positionX: selected.positionX + deltaX,
          positionZ: selected.positionZ + deltaZ
        }),
        scoped(selected.id, 'nudge')
      )
    }),

  moveSelectedVertically: (mountingHeightMm) =>
    set((state) => {
      const selected = selectedOf(state)
      if (selected === undefined || isEditing(state.editor)) {
        return {}
      }
      const hung = designWithMountingHeightMm(selected.design, mountingHeightMm)
      if (hung === null) {
        return {}
      }
      const next: PlacedCabinet = { ...selected, design: clampDesign(hung) }
      const others = state.scene.cabinets.filter((cabinet) => cabinet.id !== selected.id)
      if (cabinetOverlapsOthers(next, others)) {
        return {} // blocked at the last legal height; the drop resolves
      }
      return sceneChange(state, {
        ...state.scene,
        cabinets: state.scene.cabinets.map((cabinet) =>
          cabinet.id === selected.id ? next : cabinet
        )
      })
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

  beginGesture: () =>
    set((state) =>
      state.gestureBase !== null
        ? {}
        : { gestureBase: state.scene, history: endBurst(state.history) }
    ),

  endGesture: () =>
    set((state) => {
      const base = state.gestureBase
      if (base === null) {
        return {}
      }
      if (base === state.scene || sameScene(base, state.scene)) {
        return { gestureBase: null }
      }
      return { gestureBase: null, history: record(state.history, base, null, Date.now()) }
    }),

  cancelGesture: () =>
    set((state) => {
      const base = state.gestureBase
      if (base === null) {
        return {}
      }
      return { gestureBase: null, scene: base, ...reconcileWith(state, base) }
    }),

  undo: () =>
    set((state) => {
      if (state.gestureBase !== null || state.flowBusy) {
        return {}
      }
      const step = undoHistory(state.history, state.scene)
      if (step === null) {
        return {}
      }
      return { scene: step.present, history: step.history, ...reconcileWith(state, step.present) }
    }),

  redo: () =>
    set((state) => {
      if (state.gestureBase !== null || state.flowBusy) {
        return {}
      }
      const step = redoHistory(state.history, state.scene)
      if (step === null) {
        return {}
      }
      return { scene: step.present, history: step.history, ...reconcileWith(state, step.present) }
    }),

  setFlowBusy: (busy) => set((state) => (state.flowBusy === busy ? {} : { flowBusy: busy })),

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
      // A failed (re)load leaves no prices rather than stale ones beside an
      // error: the panel shows the error alone, as at a failed start.
      set({
        priceDb: null,
        materialsState: 'error',
        materialsError: error instanceof Error ? error.message : String(error)
      })
    }
  },

  resetProject: () =>
    set((state) => ({
      ...freshDocument(initialScene()),
      selectedCabinetId: 'cab-1',
      nextCabinetNumber: 2,
      project: NEW_PROJECT,
      projectError: null,
      editor: NO_EDITOR,
      fitViewNonce: state.fitViewNonce + 1
    })),

  loadProject: (document, path) =>
    set((state) => ({
      ...freshDocument(document.scene),
      selectedCabinetId: null,
      // One above the highest loaded id, so an added cabinet can never collide.
      nextCabinetNumber: nextCabinetNumberFor(document.scene),
      project: markOpened(path, document.metadata.createdAt),
      projectError: null,
      editor: NO_EDITOR,
      fitViewNonce: state.fitViewNonce + 1
    })),

  markProjectSaved: (path, savedAt) =>
    set((state) => ({ savedScene: state.scene, project: markSaved(state.project, path, savedAt) })),

  setProjectError: (message) => set({ projectError: message }),

  setRecentProjects: (list) => {
    storeRecentProjects(list)
    set({ recentProjects: list })
  }
}))
