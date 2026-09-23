/**
 * The piece editor's own state: which custom piece is open and which of its
 * elements (the things the editor selects, moves and deletes one at a time)
 * is selected. Pure transitions, no zustand, no React, so the rules are
 * testable in plain node. None of this is part of the scene — entering or
 * leaving the editor never dirties the project.
 *
 * Invariant kept by the store: while `editingPieceId` is set, that piece is
 * also the selected cabinet, so spec edits flow through the ordinary
 * `updateSelectedDesign` path.
 */
export interface PieceEditorState {
  readonly editingPieceId: string | null
  readonly selectedElementId: string | null
}

export const NO_EDITOR: PieceEditorState = { editingPieceId: null, selectedElementId: null }

export function isEditing(state: PieceEditorState): boolean {
  return state.editingPieceId !== null
}

export function enterEditor(pieceId: string): PieceEditorState {
  return { editingPieceId: pieceId, selectedElementId: null }
}

/** Ignored outside the editor: there is nothing to select an element of. */
export function selectElement(state: PieceEditorState, elementId: string | null): PieceEditorState {
  if (!isEditing(state) || state.selectedElementId === elementId) {
    return state
  }
  return { ...state, selectedElementId: elementId }
}

/** After a spec change: a selection whose element is gone is dropped. */
export function reconcileElements(
  state: PieceEditorState,
  elementIds: readonly string[]
): PieceEditorState {
  if (state.selectedElementId === null || elementIds.includes(state.selectedElementId)) {
    return state
  }
  return { ...state, selectedElementId: null }
}

/** After a cabinet leaves the scene: the editor closes if it was that piece. */
export function cabinetRemoved(state: PieceEditorState, cabinetId: string): PieceEditorState {
  return state.editingPieceId === cabinetId ? NO_EDITOR : state
}
