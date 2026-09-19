import type { ReactElement } from 'react'
import { useT, type TranslationKey } from '../i18n'
import { NumberInput } from './NumberInput'

interface DimensionFieldProps {
  readonly labelKey: TranslationKey
  readonly value: number
  readonly min: number
  readonly max: number
  /** Slider step in mm (the numeric input always takes whole mm); 10 for cabinet and room sizes. */
  readonly step?: number
  readonly onChange: (value: number) => void
}

/**
 * Slider + numeric input for one dimension in millimetres. The slider commits
 * instantly; the numeric input (`NumberInput`) commits on blur/Enter so
 * intermediate keystrokes are not clamped away while typing. A degenerate
 * limit (min === max, e.g. the tall cabinet's fixed depth) shows as a
 * read-only value instead. Shared by the cabinet parameters and the room
 * settings.
 */
export function DimensionField({
  labelKey,
  value,
  min,
  max,
  step = 10,
  onChange
}: DimensionFieldProps): ReactElement {
  const t = useT()

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
        <NumberInput id={`dim-${labelKey}`} value={value} min={min} max={max} onCommit={onChange} />
      </div>
      <input
        className="field__slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={t(labelKey)}
      />
    </div>
  )
}
