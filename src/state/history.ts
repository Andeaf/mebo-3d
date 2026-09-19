import type { SceneDesign } from '@core/scene'

/**
 * Undo / redo over the document (Phase 9). Pure: no zustand, no React, so
 * the rules are testable in plain node.
 *
 * The DOCUMENT is the history unit: an entry is a whole `SceneDesign`
 * (room + worktop settings + cabinets, custom-piece specs included), not a
 * command. The scene is already one immutable value with structural
 * sharing — an edit to one cabinet shares every other cabinet and the room
 * with the previous scene — so keeping the last hundred is cheap, and undo
 * is a swap that can never drift from the mutation it reverses. Selection,
 * camera, language, project status and edit-mode are not part of an entry
 * (the convention every major 3D tool follows).
 */
export interface History {
  /** Scenes to return to, oldest first; undo restores the last one. */
  readonly past: readonly SceneDesign[]
  /** Scenes undone, the next redo last. */
  readonly future: readonly SceneDesign[]
  /** Coalescing: the key of the last recorded edit and the clock time it happened. */
  readonly lastKey: string | null
  readonly lastAt: number
}

export const HISTORY_LIMIT = 100

/**
 * Edits with the same key this close together (ms, between consecutive
 * edits) are one entry: a slider drag, a run of arrow-key nudges, a spinner
 * held down. A pause longer than this starts a new entry.
 */
export const COALESCE_WINDOW_MS = 1000

export const EMPTY_HISTORY: History = { past: [], future: [], lastKey: null, lastAt: 0 }

/**
 * Records that `before` is being replaced by an edit. Pushes it onto `past`
 * (dropping the oldest beyond HISTORY_LIMIT) and clears `future`. With a key
 * equal to `lastKey` inside COALESCE_WINDOW_MS nothing is pushed — the
 * running burst's entry already holds the scene to return to — and only
 * `lastAt` moves. A null key never coalesces and ends any running burst.
 */
export function record(
  history: History,
  before: SceneDesign,
  key: string | null,
  now: number
): History {
  if (key !== null && key === history.lastKey && now - history.lastAt <= COALESCE_WINDOW_MS) {
    return { ...history, future: [], lastAt: now }
  }
  const past = [...history.past, before]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
    lastKey: key,
    lastAt: now
  }
}

/** A burst must not continue across whatever called this (a gesture, an undo). */
export function endBurst(history: History): History {
  return history.lastKey === null ? history : { ...history, lastKey: null }
}

export interface HistoryStep {
  readonly history: History
  readonly present: SceneDesign
}

/** The previous scene and the history that leads to it; null when there is nothing to undo. */
export function undo(history: History, present: SceneDesign): HistoryStep | null {
  if (history.past.length === 0) {
    return null
  }
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, present],
      lastKey: null,
      lastAt: 0
    },
    present: history.past[history.past.length - 1]
  }
}

/** The next undone scene and the history that leads to it; null when there is nothing to redo. */
export function redo(history: History, present: SceneDesign): HistoryStep | null {
  if (history.future.length === 0) {
    return null
  }
  return {
    history: {
      past: [...history.past, present],
      future: history.future.slice(0, -1),
      lastKey: null,
      lastAt: 0
    },
    present: history.future[history.future.length - 1]
  }
}

export function canUndo(history: History): boolean {
  return history.past.length > 0
}

export function canRedo(history: History): boolean {
  return history.future.length > 0
}
