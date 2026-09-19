/**
 * The keyboard map, as a pure function over the event so the bindings live
 * in one place and read like a table. Conventions follow the established
 * tools: Ctrl+Z undo, Ctrl+Y and Ctrl+Shift+Z redo, Escape cancels, R
 * rotates (the toolbar label says so), arrow keys nudge by 1 mm and
 * Shift+arrow by 10 mm (the universal 2D convention), PageUp/PageDown
 * nudge up/down.
 *
 * Nudge axes are the two floor axes for the arrows (↑ = towards the back,
 * away from the default viewpoint) and Y for PgUp/PgDn. Whether they mean
 * the piece's axes (a panel) or the world's (a cabinet) is the caller's.
 */
export type NudgeAxis = 'x' | 'y' | 'z'

export interface NudgeCommand {
  readonly kind: 'nudge'
  readonly axis: NudgeAxis
  readonly direction: 1 | -1
  /** Shift held: 10 mm instead of 1 mm. */
  readonly coarse: boolean
}

export type KeyCommand = 'undo' | 'redo' | 'rotate' | 'escape' | NudgeCommand

export type KeyInput = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export const NUDGE_STEP_MM = 1
export const NUDGE_COARSE_STEP_MM = 10

const NUDGE_KEYS: Readonly<Record<string, Pick<NudgeCommand, 'axis' | 'direction'>>> = {
  arrowleft: { axis: 'x', direction: -1 },
  arrowright: { axis: 'x', direction: 1 },
  arrowup: { axis: 'z', direction: -1 },
  arrowdown: { axis: 'z', direction: 1 },
  pageup: { axis: 'y', direction: 1 },
  pagedown: { axis: 'y', direction: -1 }
}

export function keyCommand(event: KeyInput): KeyCommand | null {
  const key = event.key.toLowerCase()
  const mod = event.ctrlKey || event.metaKey
  if (mod && key === 'z') {
    return event.shiftKey ? 'redo' : 'undo'
  }
  if (mod && key === 'y' && !event.shiftKey) {
    return 'redo'
  }
  if (!mod && !event.altKey && key === 'r') {
    return 'rotate'
  }
  if (key === 'escape') {
    return 'escape'
  }
  const nudge = NUDGE_KEYS[key]
  if (nudge !== undefined && !mod && !event.altKey) {
    return { kind: 'nudge', ...nudge, coarse: event.shiftKey }
  }
  return null
}

/** The signed distance a nudge command moves, in mm. */
export function nudgeDistanceMm(command: NudgeCommand): number {
  return command.direction * (command.coarse ? NUDGE_COARSE_STEP_MM : NUDGE_STEP_MM)
}

/** Keys typed into a field belong to the field (including its own text undo). */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  )
}
