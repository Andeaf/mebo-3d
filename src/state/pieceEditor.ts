/**
 * The piece editor's own state: which custom piece is open and which of its
 * panels is selected. Pure transitions, no zustand, no React, so the rules
 * are testable in plain node. None of this is part of the scene — entering
 * or leaving the editor never dirties the project.
 *
 * Invariant kept by the store: while `editingPieceId` is set, that piece is
 * also the selected cabinet, so spec edits flow through the ordinary
 * `updateSelectedDesign` path.
 */
export interface PieceEditorState {
  readonly editingPieceId: string | null
  readonly selectedPanelId: string | null
}

export const NO_EDITOR: PieceEditorState = { editingPieceId: null, selectedPanelId: null }

export function isEditing(state: PieceEditorState): boolean {
  return state.editingPieceId !== null
}

export function enterEditor(pieceId: string): PieceEditorState {
  return { editingPieceId: pieceId, selectedPanelId: null }
}

/** Ignored outside the editor: there is nothing to select a panel of. */
export function selectPanel(state: PieceEditorState, panelId: string | null): PieceEditorState {
  if (!isEditing(state) || state.selectedPanelId === panelId) {
    return state
  }
  return { ...state, selectedPanelId: panelId }
}

/** After a spec change: a selection whose panel is gone is dropped. */
export function reconcilePanels(
  state: PieceEditorState,
  panelIds: readonly string[]
): PieceEditorState {
  if (state.selectedPanelId === null || panelIds.includes(state.selectedPanelId)) {
    return state
  }
  return { ...state, selectedPanelId: null }
}

/** After a cabinet leaves the scene: the editor closes if it was that piece. */
export function cabinetRemoved(state: PieceEditorState, cabinetId: string): PieceEditorState {
  return state.editingPieceId === cabinetId ? NO_EDITOR : state
}
