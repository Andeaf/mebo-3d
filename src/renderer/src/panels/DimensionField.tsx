import { useState, type ReactElement } from 'react'
import { useT, type TranslationKey } from '../i18n'

interface DimensionFieldProps {
  readonly labelKey: TranslationKey
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (value: number) => void
}

/**
 * Slider + numeric input for one dimension in millimetres. The slider commits
 * instantly; the numeric input commits on blur/Enter so intermediate
 * keystrokes are not clamped away while typing. A degenerate limit
 * (min === max, e.g. the tall cabinet's fixed depth) shows as a read-only
 * value instead. Shared by the cabinet parameters and the room settings.
 */
export function DimensionField({
  labelKey,
  value,
  min,
  max,
  onChange
}: DimensionFieldProps): ReactElement {
  const t = useT()
  const [draft, setDraft] = useState<string | null>(null)

  const commitDraft = (): void => {
    if (draft !== null) {
      const parsed = Number(draft)
      if (Number.isFinite(parsed)) {
        onChange(parsed)
      }
      setDraft(null)
    }
  }

  if (min === max) {
    return (
      <div className="field">
        <div className="field__head">
          <span className="field__label">{t(labelKey)}</span>
          <span className="field__value-badge">
            {value} {t('unit.mm')}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={`dim-${labelKey}`}>
          {t(labelKey)}
        </label>
        <span className="field__number-wrap">
          <input
            id={`dim-${labelKey}`}
            className="field__number"
            type="number"
            min={min}
            max={max}
            step={1}
            value={draft ?? String(value)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitDraft()
              }
            }}
          />
          <span className="field__unit">{t('unit.mm')}</span>
        </span>
      </div>
      <input
        className="field__slider"
        type="range"
        min={min}
        max={max}
        step={10}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={t(labelKey)}
      />
    </div>
  )
}
