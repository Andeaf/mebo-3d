import { useEffect, type ReactElement } from 'react'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

/** How long a refusal stays on screen; a new refusal restarts the clock. */
const GATE_NOTICE_MS = 3000

/**
 * The strip that says what the placement gate refused: nothing was added,
 * the room did not shrink, the cabinet did not turn or change. Self-
 * dismissing after a few seconds, or on a click. Neutral, not the error
 * red: the document is exactly as it was, nothing went wrong with it.
 */
export function GateNotice(): ReactElement | null {
  const t = useT()
  const notice = useAppStore((state) => state.gateNotice)
  const dismiss = useAppStore((state) => state.dismissGateNotice)
  const nonce = notice?.nonce ?? null

  useEffect(() => {
    if (nonce === null) {
      return undefined
    }
    const timer = window.setTimeout(() => dismiss(nonce), GATE_NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [nonce, dismiss])

  if (notice === null) {
    return null
  }
  return (
    <button type="button" className="gate-notice" role="status" onClick={() => dismiss(notice.nonce)}>
      {t(`gate.${notice.reason}`)}
    </button>
  )
}
