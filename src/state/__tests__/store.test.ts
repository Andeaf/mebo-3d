import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BaseCabinetParams } from '@core/cabinet'
import { isCustomPieceDesign } from '@core/catalog/registry'
import { addPresetPanel, CUSTOM_PIECE_KIND, type CustomPieceSpec } from '@core/customPiece'
import { PROJECT_SCHEMA_VERSION, type ProjectDocument } from '@core/project'
import { findPlacedCabinet, type PlacedCabinet } from '@core/scene'
import { COALESCE_WINDOW_MS } from '@state/history'
import { isProjectDirty, useAppStore } from '@state/store'

/**
 * The zustand store under node: no React, no DOM (the localStorage reads
 * fall back). Every case starts from the initial state; `Date` is faked so
 * the coalescing window is deterministic.
 */
const store = useAppStore

function state(): ReturnType<typeof store.getState> {
  return store.getState()
}

function pastLength(): number {
  return state().history.past.length
}

function futureLength(): number {
  return state().history.future.length
}

function cabinetIds(): string[] {
  return state().scene.cabinets.map((cabinet) => cabinet.id)
}

function selected(): PlacedCabinet {
  const id = state().selectedCabinetId
  const placed = id === null ? undefined : findPlacedCabinet(state().scene, id)
  if (placed === undefined) {
    throw new Error('nothing selected')
  }
  return placed
}

function selectedSpec(): CustomPieceSpec {
  const design = selected().design
  if (!isCustomPieceDesign(design)) {
    throw new Error('the selected cabinet is not a custom piece')
  }
  return design.spec
}

function baseParams(): BaseCabinetParams {
  const design = selected().design
  if (design.kind !== 'base-cabinet') {
    throw new Error('expected a base cabinet')
  }
  return design.params
}

/** Sets a base-cabinet width on the selected cabinet, as the width slider does. */
function setWidth(widthMm: number, coalesce: boolean): void {
  state().updateSelectedDesign(
    { kind: 'base-cabinet', params: { ...baseParams(), widthMm } },
    coalesce ? 'widthMm' : undefined
  )
}

function setHeight(heightMm: number): void {
  state().updateSelectedDesign({ kind: 'base-cabinet', params: { ...baseParams(), heightMm } }, 'heightMm')
}

function at(ms: number): void {
  vi.setSystemTime(ms)
}

beforeEach(() => {
  store.setState(store.getInitialState(), true)
  vi.useFakeTimers()
  at(0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('one entry per discrete mutation', () => {
  it('add, duplicate, rotate and delete each record one entry; undo walks them back', () => {
    state().addCabinet('base-cabinet')
    state().duplicateSelected()
    state().rotateSelected()
    state().deleteSelected()
    expect(pastLength()).toBe(4)
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])

    state().undo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2', 'cab-3'])
    expect(findPlacedCabinet(state().scene, 'cab-3')?.rotationDeg).toBe(90)
    state().undo()
    expect(findPlacedCabinet(state().scene, 'cab-3')?.rotationDeg).toBe(0)
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1'])
    expect(pastLength()).toBe(0)
    expect(futureLength()).toBe(4)
  })

  it('undo of an add drops the selection of the vanished cabinet; redo brings the same id back', () => {
    state().addCabinet('wall-cabinet')
    expect(state().selectedCabinetId).toBe('cab-2')
    const counter = state().nextCabinetNumber

    state().undo()
    expect(cabinetIds()).toEqual(['cab-1'])
    expect(state().selectedCabinetId).toBeNull()
    expect(state().nextCabinetNumber).toBe(counter) // ids are never reused

    state().redo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])
    expect(state().selectedCabinetId).toBeNull() // selection is not part of the document
  })

  it('a mutation after an undo clears the redo stack', () => {
    state().addCabinet('base-cabinet')
    state().undo()
    expect(futureLength()).toBe(1)
    state().addCabinet('tall-cabinet')
    expect(futureLength()).toBe(0)
    expect(cabinetIds()).toEqual(['cab-1', 'cab-3'])
  })

  it('undo and redo are refused while a project flow (a native dialog) is running', () => {
    state().addCabinet('base-cabinet')
    state().setFlowBusy(true)
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])
    state().setFlowBusy(false)
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1'])
    state().setFlowBusy(true)
    state().redo()
    expect(cabinetIds()).toEqual(['cab-1'])
    state().setFlowBusy(false)
    state().redo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])
  })

  it('undo and redo with empty stacks change nothing', () => {
    const before = state().scene
    state().undo()
    state().redo()
    expect(state().scene).toBe(before)
  })
})

describe('pointer gestures', () => {
  it('a drag is one entry, recorded at the end from the scene before the drag', () => {
    const start = selected()
    const before = state().scene
    state().beginGesture()
    state().moveSelected(start.positionX + 100, start.positionZ)
    state().moveSelected(start.positionX + 200, start.positionZ)
    state().moveSelected(start.positionX + 300, start.positionZ)
    expect(pastLength()).toBe(0)
    expect(selected().positionX).toBe(start.positionX + 300)
    state().dropSelected(start.positionX + 300, start.positionZ)
    state().endGesture()
    expect(pastLength()).toBe(1)
    expect(state().gestureBase).toBeNull()

    state().undo()
    expect(state().scene).toBe(before)
    expect(selected().positionX).toBe(start.positionX)
  })

  it('a click without a drag records nothing', () => {
    const start = selected()
    state().beginGesture()
    state().dropSelected(start.positionX, start.positionZ)
    state().endGesture()
    expect(pastLength()).toBe(0)
    expect(isProjectDirty(state())).toBe(false)
  })

  it('cancelGesture restores the base scene and records nothing', () => {
    const start = selected()
    const before = state().scene
    state().beginGesture()
    state().moveSelected(start.positionX + 300, start.positionZ)
    expect(state().scene).not.toBe(before)
    state().cancelGesture()
    expect(state().scene).toBe(before)
    expect(state().gestureBase).toBeNull()
    expect(pastLength()).toBe(0)
  })

  it('undo and redo are ignored while a gesture is running', () => {
    state().addCabinet('base-cabinet')
    state().beginGesture()
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2'])
    state().endGesture()
    state().undo()
    expect(cabinetIds()).toEqual(['cab-1'])
    state().beginGesture()
    state().redo()
    expect(cabinetIds()).toEqual(['cab-1'])
    state().endGesture()
  })

  it('a second beginGesture inside a gesture is ignored; end and cancel without one are no-ops', () => {
    const start = selected()
    state().beginGesture()
    const base = state().gestureBase
    state().moveSelected(start.positionX + 100, start.positionZ)
    state().beginGesture()
    expect(state().gestureBase).toBe(base)
    state().cancelGesture()
    state().endGesture()
    state().cancelGesture()
    expect(pastLength()).toBe(0)
    expect(state().scene).toBe(base)
  })
})

describe('coalescing bursts', () => {
  it('a slider burst on one field is one entry; another field starts another', () => {
    at(0)
    setWidth(610, true)
    at(400)
    setWidth(620, true)
    at(800)
    setWidth(630, true)
    expect(pastLength()).toBe(1)

    at(900)
    setHeight(740)
    expect(pastLength()).toBe(2)

    state().undo()
    expect(baseParams().heightMm).toBe(720)
    expect(baseParams().widthMm).toBe(630)
    state().undo()
    expect(baseParams().widthMm).toBe(600)
  })

  it('a pause longer than the window splits the burst', () => {
    at(0)
    setWidth(610, true)
    at(COALESCE_WINDOW_MS + 1)
    setWidth(620, true)
    expect(pastLength()).toBe(2)
  })

  it('an edit without a key never coalesces', () => {
    at(0)
    setWidth(610, false)
    at(10)
    setWidth(620, false)
    expect(pastLength()).toBe(2)
  })

  it('room and worktop edits coalesce under their own keys', () => {
    const room = state().scene.room
    at(0)
    state().updateRoom({ ...room, widthMm: 4100 }, 'widthMm')
    at(100)
    state().updateRoom({ ...room, widthMm: 4200 }, 'widthMm')
    expect(pastLength()).toBe(1)
    const worktop = state().scene.worktop
    at(200)
    state().updateWorktop({ ...worktop, thicknessMm: 40 }, 'thicknessMm')
    at(300)
    state().updateWorktop({ ...worktop, thicknessMm: 42 }, 'thicknessMm')
    expect(pastLength()).toBe(2)
    state().undo()
    expect(state().scene.worktop.thicknessMm).toBe(38)
    expect(state().scene.room.widthMm).toBe(4200)
  })

  it('a burst does not continue across an undo', () => {
    at(0)
    setWidth(610, true)
    state().undo()
    at(10)
    setWidth(620, true)
    expect(pastLength()).toBe(1)
    expect(futureLength()).toBe(0)
  })
})

describe('rejected updates', () => {
  it('a room shrink no cabinet fits into leaves the scene and the history untouched', () => {
    // Three 1200 × 700 base cabinets in a row fit a 4000-wide room; at 2000
    // wide only two rows of 700 fit in 2000 deep, so the third has nowhere to go.
    for (let i = 0; i < 3; i += 1) {
      if (i > 0) {
        state().addCabinet('base-cabinet')
      }
      const design = selected().design
      if (design.kind === 'base-cabinet') {
        state().updateSelectedDesign({
          kind: 'base-cabinet',
          params: { ...design.params, widthMm: 1200, depthMm: 700 }
        })
      }
    }
    expect(cabinetIds()).toEqual(['cab-1', 'cab-2', 'cab-3'])
    const entries = pastLength()
    const before = state().scene

    state().updateRoom({ ...before.room, widthMm: 2000, lengthMm: 2000 }, 'widthMm')
    expect(state().scene).toBe(before)
    expect(pastLength()).toBe(entries)
  })

  it('a design edit that changes nothing records nothing', () => {
    const entries = pastLength()
    const before = state().scene
    state().rotateSelected() // 0 → 90 is a change …
    state().rotateSelected()
    state().rotateSelected()
    state().rotateSelected() // … and back to 0 is four entries, but
    expect(pastLength()).toBe(entries + 4)
    expect(state().scene).not.toBe(before)
    // a no-op drop is not one.
    const placed = selected()
    state().dropSelected(placed.positionX, placed.positionZ)
    expect(pastLength()).toBe(entries + 4)
  })
})

describe('the piece editor', () => {
  it('spec edits are entries; undo drops a vanished panel selection and closes a vanished piece', () => {
    state().addCustomPiece('Test')
    expect(state().editor.editingPieceId).toBe('cab-2')
    expect(pastLength()).toBe(1)

    const added = addPresetPanel(selectedSpec(), 'side')
    if (added === null) {
      throw new Error('preset refused')
    }
    state().updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: added.spec })
    state().selectPanel(added.panelId)
    expect(pastLength()).toBe(2)
    expect(state().editor.selectedPanelId).toBe('panel-1')

    state().undo()
    expect(selectedSpec().panels).toHaveLength(0)
    expect(state().editor.editingPieceId).toBe('cab-2') // the piece is still there
    expect(state().editor.selectedPanelId).toBeNull()

    state().undo()
    expect(cabinetIds()).toEqual(['cab-1'])
    expect(state().editor.editingPieceId).toBeNull()
    expect(state().selectedCabinetId).toBeNull()

    state().redo()
    state().redo()
    expect(state().editor.editingPieceId).toBeNull() // edit-mode is not part of the document
    expect(findPlacedCabinet(state().scene, 'cab-2')?.design.kind).toBe(CUSTOM_PIECE_KIND)
  })

  it('a gesture cancelled inside the editor drops a panel selection whose panel is gone', () => {
    state().addCustomPiece('Test')
    state().beginGesture()
    const added = addPresetPanel(selectedSpec(), 'shelf')
    if (added === null) {
      throw new Error('preset refused')
    }
    state().updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: added.spec })
    state().selectPanel(added.panelId)
    state().cancelGesture()
    expect(selectedSpec().panels).toHaveLength(0)
    expect(state().editor.selectedPanelId).toBeNull()
    expect(state().editor.editingPieceId).toBe('cab-2')
  })
})

describe('dirty follows the saved reference', () => {
  it('save clears, edit sets, undo back to the saved scene clears, redo sets', () => {
    expect(isProjectDirty(state())).toBe(false)
    state().addCabinet('base-cabinet')
    expect(isProjectDirty(state())).toBe(true)

    state().markProjectSaved('C:\\k\\Keuken.mebo', '2026-09-19T10:00:00.000Z')
    expect(isProjectDirty(state())).toBe(false)
    expect(state().project.name).toBe('Keuken')
    expect(pastLength()).toBe(1) // save keeps the history

    state().addCabinet('base-cabinet')
    expect(isProjectDirty(state())).toBe(true)
    state().undo()
    expect(isProjectDirty(state())).toBe(false)
    state().redo()
    expect(isProjectDirty(state())).toBe(true)
    state().undo()
    state().undo() // before the save point
    expect(isProjectDirty(state())).toBe(true)
    state().redo()
    expect(isProjectDirty(state())).toBe(false)
  })

  it('reset and load start a clean document with no history', () => {
    state().addCabinet('base-cabinet')
    state().resetProject()
    expect(pastLength()).toBe(0)
    expect(futureLength()).toBe(0)
    expect(isProjectDirty(state())).toBe(false)
    expect(state().savedScene).toBe(state().scene)

    state().addCabinet('base-cabinet')
    const document: ProjectDocument = {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      metadata: {
        projectName: 'Badkamer',
        createdAt: '2026-01-01T00:00:00.000Z',
        modifiedAt: '2026-01-02T00:00:00.000Z',
        appVersion: '0.9.0'
      },
      scene: { ...state().savedScene, cabinets: [] }
    }
    state().loadProject(document, 'D:\\Badkamer.mebo')
    expect(pastLength()).toBe(0)
    expect(isProjectDirty(state())).toBe(false)
    expect(state().savedScene).toBe(document.scene)
    state().undo()
    expect(state().scene).toBe(document.scene)
  })
})

describe('scene-level movement through the gate', () => {
  it('placeSelected lands where the gate resolves; a nudge in open floor moves by its delta', () => {
    // cab-1 starts against the back wall; put it in open floor first.
    state().placeSelected(0, 0)
    expect(selected().positionX).toBe(0)
    expect(selected().positionZ).toBe(0)
    at(0)
    state().nudgeSelected(1, 0)
    expect(selected().positionX).toBe(1)
    at(100)
    state().nudgeSelected(0, -10)
    expect(selected().positionZ).toBe(-10)
    expect(pastLength()).toBe(2) // the placement, then one entry for the key burst
    state().undo()
    expect(selected().positionX).toBe(0)
    expect(selected().positionZ).toBe(0)
  })

  it('a nudge beside a flush neighbour snaps back (the snap-first rule), and records nothing', () => {
    state().addCabinet('base-cabinet') // cab-2, flush right of cab-1
    const x = selected().positionX
    state().nudgeSelected(1, 0)
    expect(selected().positionX).toBe(x)
    expect(pastLength()).toBe(1)
  })

  it('placeSelected outside the room is pulled inside', () => {
    state().placeSelected(10000, 0)
    // Room 4000 wide, cabinet 600 wide: the centre stops 300 short of the wall.
    expect(selected().positionX).toBe(1700)
  })

  it('moveSelectedVertically: ignores a floor kind, applies a free height, skips a colliding one', () => {
    const mountingOf = (): number => {
      const design = selected().design
      if (design.kind !== 'wall-cabinet') {
        throw new Error('expected a wall cabinet')
      }
      return design.params.mountingHeightMm
    }
    state().moveSelectedVertically(1200) // cab-1 is a base cabinet
    expect(pastLength()).toBe(0)
    // A 1000 mm tall base cabinet reaches above the wall kind's 900 minimum.
    setHeight(1000)

    state().addCabinet('wall-cabinet') // cab-2
    const base = findPlacedCabinet(state().scene, 'cab-1')
    if (base === undefined) {
      throw new Error('cab-1 missing')
    }
    // Hang it right above cab-1: disjoint heights, so the same floor spot is legal.
    state().placeSelected(base.positionX, base.positionZ)
    expect(selected().positionX).toBe(base.positionX)
    const entries = pastLength()

    state().beginGesture()
    state().moveSelectedVertically(950) // its interval 950–1670 would meet cab-1's 0–1000
    expect(mountingOf()).toBe(1450)
    state().moveSelectedVertically(1000) // flush stacking is not overlap
    expect(mountingOf()).toBe(1000)
    state().moveSelectedVertically(800) // clamps to the kind's minimum, 900: colliding, so skipped
    expect(mountingOf()).toBe(1000)
    state().moveSelectedVertically(1200)
    expect(mountingOf()).toBe(1200)
    expect(pastLength()).toBe(entries) // frames inside the gesture record nothing
    state().endGesture()
    expect(pastLength()).toBe(entries + 1)
    state().undo()
    expect(mountingOf()).toBe(1450)
  })

  it('a hanging custom piece moves vertically; a floor-standing one does not', () => {
    state().addCustomPiece('Kastje')
    state().exitPieceEditor()
    const spec = selectedSpec()
    state().updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: { ...spec, mountingHeightMm: 1200 } })
    state().moveSelectedVertically(1300)
    expect(selectedSpec().mountingHeightMm).toBe(1300)
    state().updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: { ...spec, mountingHeightMm: 0 } })
    state().moveSelectedVertically(1300)
    expect(selectedSpec().mountingHeightMm).toBe(0)
  })
})
