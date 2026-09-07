import { describe, expect, it } from 'vitest'
import {
  cabinetRemoved,
  enterEditor,
  isEditing,
  reconcilePanels,
  selectPanel,
  NO_EDITOR
} from '@state/pieceEditor'

describe('piece editor state', () => {
  it('starts closed and opens on a piece with no panel selected', () => {
    expect(isEditing(NO_EDITOR)).toBe(false)
    const open = enterEditor('cab-3')
    expect(open).toEqual({ editingPieceId: 'cab-3', selectedPanelId: null })
    expect(isEditing(open)).toBe(true)
  })

  it('selects and clears a panel only while editing', () => {
    const open = enterEditor('cab-3')
    const chosen = selectPanel(open, 'panel-2')
    expect(chosen.selectedPanelId).toBe('panel-2')
    expect(selectPanel(chosen, 'panel-2')).toBe(chosen)
    expect(selectPanel(chosen, null).selectedPanelId).toBeNull()
    expect(selectPanel(NO_EDITOR, 'panel-2')).toBe(NO_EDITOR)
  })

  it('drops a selection whose panel disappeared, keeps one that survived', () => {
    const chosen = selectPanel(enterEditor('cab-3'), 'panel-2')
    expect(reconcilePanels(chosen, ['panel-1', 'panel-2'])).toBe(chosen)
    expect(reconcilePanels(chosen, ['panel-1'])).toEqual({ editingPieceId: 'cab-3', selectedPanelId: null })
    expect(reconcilePanels(enterEditor('cab-3'), [])).toEqual(enterEditor('cab-3'))
  })

  it('closes when the edited piece leaves the scene, not for another cabinet', () => {
    const chosen = selectPanel(enterEditor('cab-3'), 'panel-2')
    expect(cabinetRemoved(chosen, 'cab-1')).toBe(chosen)
    expect(cabinetRemoved(chosen, 'cab-3')).toBe(NO_EDITOR)
    expect(cabinetRemoved(NO_EDITOR, 'cab-3')).toBe(NO_EDITOR)
  })
})
