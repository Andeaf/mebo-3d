import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DrawerCabinetParams } from '@core/catalog/drawerCabinet'
import type { DrawerDoorCabinetParams } from '@core/catalog/drawerDoorCabinet'
import { isCustomPieceDesign } from '@core/catalog/registry'
import {
  addDrawer,
  duplicateDrawer,
  moveElement,
  nudgeElement,
  removeDrawer,
  resizeEnvelope,
  CUSTOM_PIECE_KIND,
  type CustomPieceSpec
} from '@core/customPiece'
import { snapElementMove } from '@core/elementSnap'
import { findPlacedCabinet, type PlacedCabinet } from '@core/scene'
import { isProjectDirty, useAppStore } from '@state/store'

/**
 * Phase 10's edits through the real store (under node, like store.test.ts):
 * every new edit is undoable, bursts and gestures stay one entry, and the
 * piece editor's selection is reconciled against drawers as well as panels.
 */
const store = useAppStore

function state(): ReturnType<typeof store.getState> {
  return store.getState()
}

function pastLength(): number {
  return state().history.past.length
}

function selected(): PlacedCabinet {
  const id = state().selectedCabinetId
  const placed = id === null ? undefined : findPlacedCabinet(state().scene, id)
  if (placed === undefined) {
    throw new Error('nothing selected')
  }
  return placed
}

function ladekast(): DrawerCabinetParams {
  const design = selected().design
  if (design.kind !== 'drawer-cabinet') {
    throw new Error('expected a ladekast')
  }
  return design.params
}

function combined(): DrawerDoorCabinetParams {
  const design = selected().design
  if (design.kind !== 'drawer-door-cabinet') {
    throw new Error('expected an onderkast met lade')
  }
  return design.params
}

function spec(): CustomPieceSpec {
  const design = selected().design
  if (!isCustomPieceDesign(design)) {
    throw new Error('expected a custom piece')
  }
  return design.spec
}

function editSpec(next: CustomPieceSpec, key?: string): void {
  state().updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: next }, key)
}

/** The piece editor's "+ Lade": the core transition, then the new drawer selected. */
function clickAddDrawer(): string {
  const change = addDrawer(spec())
  if (change === null) {
    throw new Error('addDrawer refused')
  }
  editSpec(change.spec)
  state().selectElement(change.drawerId)
  return change.drawerId
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

describe('the ladekast layout is undoable', () => {
  it('the shallow count is one entry, a height drag one more, and undo walks them back', () => {
    state().addCabinet('drawer-cabinet')
    expect(pastLength()).toBe(1)
    state().updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...ladekast(), shallowDrawerCount: 1 } })
    expect(pastLength()).toBe(2)
    for (const [ms, height] of [
      [100, 140],
      [300, 130],
      [600, 120]
    ] as const) {
      at(ms)
      state().updateSelectedDesign(
        { kind: 'drawer-cabinet', params: { ...ladekast(), shallowFrontHeightMm: height } },
        'shallowFrontHeightMm'
      )
    }
    expect(pastLength()).toBe(3)
    expect(ladekast().shallowFrontHeightMm).toBe(120)

    state().undo()
    expect(ladekast()).toMatchObject({ shallowDrawerCount: 1, shallowFrontHeightMm: 150 })
    state().undo()
    expect(ladekast().shallowDrawerCount).toBe(0)
  })

  it('fewer drawers pull the shallow count down in the same, single entry', () => {
    state().addCabinet('drawer-cabinet')
    state().updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...ladekast(), shallowDrawerCount: 2 } })
    const entries = pastLength()
    state().updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...ladekast(), drawerCount: 2 } }, 'drawerCount')
    expect(ladekast()).toMatchObject({ drawerCount: 2, shallowDrawerCount: 1 })
    expect(pastLength()).toBe(entries + 1)
    state().undo()
    expect(ladekast()).toMatchObject({ drawerCount: 3, shallowDrawerCount: 2 })
  })
})

describe('the onderkast met lade is undoable', () => {
  it('adding it, its front height drag and a door pick are one entry each', () => {
    state().addCabinet('drawer-door-cabinet')
    expect(pastLength()).toBe(1)
    at(100)
    state().updateSelectedDesign(
      { kind: 'drawer-door-cabinet', params: { ...combined(), drawerFrontHeightMm: 170 } },
      'drawerFrontHeightMm'
    )
    at(400)
    state().updateSelectedDesign(
      { kind: 'drawer-door-cabinet', params: { ...combined(), drawerFrontHeightMm: 180 } },
      'drawerFrontHeightMm'
    )
    state().updateSelectedDesign({ kind: 'drawer-door-cabinet', params: { ...combined(), doorCount: 2 } })
    expect(pastLength()).toBe(3)
    state().undo()
    expect(combined()).toMatchObject({ drawerFrontHeightMm: 180, doorCount: 1 })
    state().undo()
    expect(combined().drawerFrontHeightMm).toBe(150)
    state().undo()
    expect(state().scene.cabinets.map((cabinet) => cabinet.id)).toEqual(['cab-1'])
  })
})

describe('drawers in the piece editor are undoable, like panels', () => {
  beforeEach(() => {
    state().addCustomPiece('Dressoir') // 1200 × 600 × 400, editor open on cab-2
  })

  it('add, a drag, a nudge burst, duplicate and remove are one entry each', () => {
    const base = pastLength()
    const drawerId = clickAddDrawer()
    expect(pastLength()).toBe(base + 1)
    expect(state().editor.selectedElementId).toBe('drawer-1')

    // A gizmo drag: frames without entries, one entry at the end.
    state().beginGesture()
    for (const y of [400, 300, 200]) {
      editSpec(moveElement(spec(), drawerId, { x: 2, y, z: 400 }))
    }
    expect(pastLength()).toBe(base + 1)
    state().endGesture()
    expect(pastLength()).toBe(base + 2)
    expect(spec().drawers[0].originMm).toEqual({ x: 2, y: 200 })

    // Arrow keys (PgUp): a burst under one key is one entry.
    for (const ms of [2000, 2100, 2200]) {
      at(ms)
      editSpec(nudgeElement(spec(), drawerId, { y: 1 }), `nudge:${drawerId}`)
    }
    expect(pastLength()).toBe(base + 3)
    expect(spec().drawers[0].originMm).toEqual({ x: 2, y: 203 })

    const copy = duplicateDrawer(spec(), drawerId)
    if (copy === null) {
      throw new Error('duplicate refused')
    }
    editSpec(copy.spec)
    editSpec(removeDrawer(spec(), drawerId))
    expect(pastLength()).toBe(base + 5)
    expect(spec().drawers.map((entry) => entry.id)).toEqual(['drawer-2'])

    state().undo() // the removal
    state().undo() // the copy
    expect(spec().drawers.map((entry) => entry.id)).toEqual(['drawer-1'])
    state().undo() // the nudges
    expect(spec().drawers[0].originMm).toEqual({ x: 2, y: 200 })
    state().undo() // the drag
    expect(spec().drawers[0].originMm).toEqual({ x: 2, y: 448 })
    state().undo() // the add
    expect(spec().drawers).toEqual([])
  })

  it('a snapped drag (Phase 12) is one entry, and the snap hint is not part of the document', () => {
    clickAddDrawer() // drawer-1 at y 448
    clickAddDrawer() // drawer-2 under it (295)
    clickAddDrawer() // drawer-3 under that (142)
    state().selectElement('drawer-2')
    const entries = pastLength()
    state().beginGesture()
    for (const attempted of [{ x: 2, y: 310, z: 400 }, { x: 2, y: 302, z: 400 }]) {
      const { originMm, snapped } = snapElementMove(spec(), 'drawer-2', attempted, 'snap')
      state().setSnapHint(snapped)
      editSpec(moveElement(spec(), 'drawer-2', originMm))
    }
    // 302 lands on the midpoint between drawer-3 (top 292) and drawer-1
    // (448): 292 + (156 − 150) / 2 = 295; x went from the preset's 2 to the
    // grid's 0 on the first frame, as every first drag does.
    expect(spec().drawers[1].originMm).toEqual({ x: 0, y: 295 })
    expect(state().snapHint).toEqual({ axis: 'y', kind: 'midpoint' })
    expect(pastLength()).toBe(entries) // frames record nothing
    state().endGesture()
    expect(state().snapHint).toBeNull()
    expect(pastLength()).toBe(entries + 1) // one entry for the whole drag

    // A free (Alt) drag: the raw position, one more entry.
    state().beginGesture()
    editSpec(moveElement(spec(), 'drawer-2', snapElementMove(spec(), 'drawer-2', { x: 3, y: 333, z: 400 }, 'free').originMm))
    state().setSnapHint(null)
    state().endGesture()
    expect(pastLength()).toBe(entries + 2)
    expect(spec().drawers[1].originMm).toEqual({ x: 3, y: 333 })
    state().undo()
    expect(spec().drawers[1].originMm).toEqual({ x: 0, y: 295 })
    state().undo()
    expect(spec().drawers[1].originMm).toEqual({ x: 2, y: 295 })
  })

  it('a drag that ends where it began records nothing', () => {
    const drawerId = clickAddDrawer()
    const entries = pastLength()
    const before = state().scene
    state().beginGesture()
    editSpec(moveElement(spec(), drawerId, { x: 2, y: 300, z: 400 }))
    editSpec(moveElement(spec(), drawerId, { x: 2, y: 448, z: 400 }))
    state().endGesture()
    expect(pastLength()).toBe(entries)
    // Value-identical to where it started: the history holds nothing new.
    expect(spec()).toEqual(before.cabinets[1].design.kind === 'custom-piece' ? before.cabinets[1].design.spec : null)
  })

  it('undo drops the selection of a drawer it takes away; a removal drops it at once', () => {
    clickAddDrawer()
    state().undo()
    expect(spec().drawers).toEqual([])
    expect(state().editor.selectedElementId).toBeNull()
    expect(state().editor.editingPieceId).toBe('cab-2')

    state().redo()
    expect(spec().drawers).toHaveLength(1)
    expect(state().editor.selectedElementId).toBeNull() // selection is not part of the document

    state().selectElement('drawer-1')
    editSpec(removeDrawer(spec(), 'drawer-1'))
    expect(state().editor.selectedElementId).toBeNull()
  })

  it('an envelope drag with drawers is one entry and never leaves a drawer without room', () => {
    clickAddDrawer()
    const entries = pastLength()
    for (const [ms, depthMm] of [
      [5000, 350],
      [5200, 300],
      [5400, 200]
    ] as const) {
      at(ms)
      editSpec(resizeEnvelope(spec(), { depthMm }), 'depthMm')
    }
    expect(pastLength()).toBe(entries + 1)
    expect(spec().depthMm).toBe(270)
    state().undo()
    expect(spec().depthMm).toBe(400)
  })

  it('dirty follows drawer edits back to the saved scene', () => {
    state().markProjectSaved('C:\\k\\Dressoir.mebo', '2026-09-23T12:00:00.000Z')
    clickAddDrawer()
    expect(isProjectDirty(state())).toBe(true)
    state().undo()
    expect(isProjectDirty(state())).toBe(false)
  })
})
