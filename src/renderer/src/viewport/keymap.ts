/**
 * The keyboard map, as a pure function over the event so the bindings live
 * in one place and read like a table. Conventions follow the established
 * tools: Ctrl+Z undo, Ctrl+Y and Ctrl+Shift+Z redo, Escape cancels, R
 * rotates (the toolbar label says so).
 */
export type KeyCommand = 'undo' | 'redo' | 'rotate' | 'escape'

export type KeyInput = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

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
  return null
}

/** Keys typed into a field belong to the field (including its own text undo). */
export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
  )
}
