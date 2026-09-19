import { describe, expect, it } from 'vitest'
import { createDefaultRoom } from '@core/room'
import { EMPTY_SCENE, type SceneDesign } from '@core/scene'
import {
  canRedo,
  canUndo,
  COALESCE_WINDOW_MS,
  EMPTY_HISTORY,
  endBurst,
  HISTORY_LIMIT,
  record,
  redo,
  undo,
  type History
} from '@state/history'

/** A distinct scene value per call (the room width tags it). */
function sceneNo(n: number): SceneDesign {
  return { ...EMPTY_SCENE, room: { ...createDefaultRoom(), widthMm: 2000 + n } }
}

describe('record', () => {
  it('pushes the scene being replaced and clears the redo stack', () => {
    const undone: History = { ...EMPTY_HISTORY, future: [sceneNo(9)] }
    const next = record(undone, sceneNo(1), null, 1000)
    expect(next.past).toEqual([sceneNo(1)])
    expect(next.future).toEqual([])
    expect(next.lastKey).toBeNull()
    expect(next.lastAt).toBe(1000)
  })

  it('coalesces the same key inside the window: nothing pushed, the clock moves', () => {
    const first = record(EMPTY_HISTORY, sceneNo(1), 'cab-1:widthMm', 1000)
    const second = record(first, sceneNo(2), 'cab-1:widthMm', 1000 + COALESCE_WINDOW_MS)
    expect(second.past).toEqual([sceneNo(1)])
    expect(second.lastAt).toBe(1000 + COALESCE_WINDOW_MS)
    expect(second.lastKey).toBe('cab-1:widthMm')
  })

  it('measures the window between consecutive edits, not from the start of the burst', () => {
    let history = record(EMPTY_HISTORY, sceneNo(1), 'k', 0)
    for (let i = 1; i <= 5; i += 1) {
      history = record(history, sceneNo(i + 1), 'k', i * COALESCE_WINDOW_MS)
    }
    expect(history.past).toEqual([sceneNo(1)])
  })

  it('starts a new entry after a pause longer than the window', () => {
    const first = record(EMPTY_HISTORY, sceneNo(1), 'k', 1000)
    const second = record(first, sceneNo(2), 'k', 1000 + COALESCE_WINDOW_MS + 1)
    expect(second.past).toEqual([sceneNo(1), sceneNo(2)])
  })

  it('starts a new entry for a different key', () => {
    const first = record(EMPTY_HISTORY, sceneNo(1), 'cab-1:widthMm', 1000)
    const second = record(first, sceneNo(2), 'cab-1:heightMm', 1001)
    expect(second.past).toEqual([sceneNo(1), sceneNo(2)])
    expect(second.lastKey).toBe('cab-1:heightMm')
  })

  it('never coalesces a null key, and a null key ends the running burst', () => {
    const burst = record(EMPTY_HISTORY, sceneNo(1), 'k', 1000)
    const plain = record(burst, sceneNo(2), null, 1001)
    expect(plain.past).toEqual([sceneNo(1), sceneNo(2)])
    expect(plain.lastKey).toBeNull()
    const again = record(plain, sceneNo(3), 'k', 1002)
    expect(again.past).toEqual([sceneNo(1), sceneNo(2), sceneNo(3)])
  })

  it('keeps the newest HISTORY_LIMIT entries', () => {
    let history = EMPTY_HISTORY
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      history = record(history, sceneNo(i), null, i)
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(history.past[0]).toEqual(sceneNo(6))
    expect(history.past[HISTORY_LIMIT - 1]).toEqual(sceneNo(HISTORY_LIMIT + 5))
  })
})

describe('endBurst', () => {
  it('forgets the running key so the next edit of it starts a new entry', () => {
    const burst = record(EMPTY_HISTORY, sceneNo(1), 'k', 1000)
    const ended = endBurst(burst)
    expect(ended.lastKey).toBeNull()
    expect(record(ended, sceneNo(2), 'k', 1001).past).toEqual([sceneNo(1), sceneNo(2)])
  })

  it('returns the same object when no burst is running', () => {
    expect(endBurst(EMPTY_HISTORY)).toBe(EMPTY_HISTORY)
  })
})

describe('undo and redo', () => {
  it('round-trip: undo restores the entry, redo brings the present back', () => {
    const history = record(record(EMPTY_HISTORY, sceneNo(1), null, 1), sceneNo(2), null, 2)
    const present = sceneNo(3)

    const undone = undo(history, present)
    expect(undone).not.toBeNull()
    expect(undone?.present).toBe(history.past[1])
    expect(undone?.present).toEqual(sceneNo(2))
    expect(undone?.history.past).toEqual([sceneNo(1)])
    expect(undone?.history.future).toEqual([present])

    const redone = undone === null ? null : redo(undone.history, undone.present)
    expect(redone?.present).toBe(present)
    expect(redone?.history.past).toEqual([sceneNo(1), sceneNo(2)])
    expect(redone?.history.future).toEqual([])
  })

  it('restores the exact scene reference that was recorded', () => {
    const before = sceneNo(1)
    const history = record(EMPTY_HISTORY, before, null, 1)
    expect(undo(history, sceneNo(2))?.present).toBe(before)
  })

  it('returns null with nothing to undo or redo', () => {
    expect(undo(EMPTY_HISTORY, sceneNo(1))).toBeNull()
    expect(redo(EMPTY_HISTORY, sceneNo(1))).toBeNull()
    expect(canUndo(EMPTY_HISTORY)).toBe(false)
    expect(canRedo(EMPTY_HISTORY)).toBe(false)
  })

  it('a new edit after an undo drops the redo stack', () => {
    const history = record(EMPTY_HISTORY, sceneNo(1), null, 1)
    const undone = undo(history, sceneNo(2))
    expect(undone === null ? false : canRedo(undone.history)).toBe(true)
    const edited = undone === null ? EMPTY_HISTORY : record(undone.history, undone.present, null, 3)
    expect(canRedo(edited)).toBe(false)
    expect(edited.past).toEqual([sceneNo(1)])
  })

  it('both end a running burst', () => {
    const burst = record(EMPTY_HISTORY, sceneNo(1), 'k', 1000)
    const undone = undo(burst, sceneNo(2))
    expect(undone?.history.lastKey).toBeNull()
    const redone = undone === null ? null : redo(undone.history, undone.present)
    expect(redone?.history.lastKey).toBeNull()
    // The same key right after: a fresh entry, not a continuation.
    const after = redone === null ? EMPTY_HISTORY : record(redone.history, sceneNo(2), 'k', 1001)
    expect(after.past).toEqual([sceneNo(1), sceneNo(2)])
  })
})
