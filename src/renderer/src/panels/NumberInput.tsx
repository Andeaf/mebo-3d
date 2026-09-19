import { useState, type ReactElement } from 'react'
import { useT } from '../i18n'

interface NumberInputProps {
  readonly id: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly ariaLabel?: string
  /** Called on blur/Enter with the typed number; intermediate keystrokes are never committed. */
  readonly onCommit: (value: number) => void
}

/**
 * A millimetre number input that commits on blur/Enter, so a value being
 * typed is not clamped away keystroke by keystroke. Shows the prop value
 * again after the commit — which is how a rejected value snaps back.
 * Shared by the dimension sliders and the position fields.
 */
export function NumberInput({ id, value, min, max, ariaLabel, onCommit }: NumberInputProps): ReactElement {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)

  const commit = (): void => {
    if (draft !== null) {
      const parsed = Number(draft)
      if (Number.isFinite(parsed)) {
        onCommit(parsed)
      }
      setDraft(null)
    }
  }

  return (
    <span className="field__number-wrap">
      <input
        id={id}
        className="field__number"
        type="number"
        min={min}
        max={max}
        step={1}
        aria-label={ariaLabel}
        value={draft ?? String(value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit()
          }
        }}
      />
      <span className="field__unit">{t('unit.mm')}</span>
    </span>
  )
}
