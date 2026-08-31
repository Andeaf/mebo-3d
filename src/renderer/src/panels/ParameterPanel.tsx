import { useState, type ReactElement } from 'react'
import { BASE_CABINET_LIMITS, type DoorCount } from '@core/cabinet'
import { CARCASS_THICKNESS_MM } from '@core/catalog/baseCabinet'
import { useAppStore } from '@state/store'
import { t, type TranslationKey } from '../i18n/nl'

interface DimensionFieldProps {
  readonly labelKey: TranslationKey
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (value: number) => void
}

/**
 * Slider + numeric input for one dimension. The slider commits instantly;
 * the numeric input commits on blur/Enter so intermediate keystrokes are
 * not clamped away while typing.
 */
function DimensionField({ labelKey, value, min, max, onChange }: DimensionFieldProps): ReactElement {
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

const DOOR_OPTIONS: readonly DoorCount[] = [0, 1, 2]

export function ParameterPanel(): ReactElement {
  const params = useAppStore((state) => state.params)
  const priceDb = useAppStore((state) => state.priceDb)
  const updateParams = useAppStore((state) => state.updateParams)

  const carcassBoardOptions =
    priceDb?.materials.filter(
      (material) => material.category === 'board' && material.thicknessMm === CARCASS_THICKNESS_MM
    ) ?? []

  return (
    <section className="panel">
      <h2 className="panel__title">{t('params.title')}</h2>

      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={BASE_CABINET_LIMITS.widthMm.min}
        max={BASE_CABINET_LIMITS.widthMm.max}
        onChange={(widthMm) => updateParams({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={BASE_CABINET_LIMITS.heightMm.min}
        max={BASE_CABINET_LIMITS.heightMm.max}
        onChange={(heightMm) => updateParams({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={BASE_CABINET_LIMITS.depthMm.min}
        max={BASE_CABINET_LIMITS.depthMm.max}
        onChange={(depthMm) => updateParams({ depthMm })}
      />

      <div className="field">
        <div className="field__head">
          <label className="field__label" htmlFor="shelf-count">
            {t('params.shelves')}
          </label>
          <span className="field__value-badge">{params.shelfCount}</span>
        </div>
        <input
          id="shelf-count"
          className="field__slider"
          type="range"
          min={BASE_CABINET_LIMITS.shelfCount.min}
          max={BASE_CABINET_LIMITS.shelfCount.max}
          step={1}
          value={params.shelfCount}
          onChange={(event) => updateParams({ shelfCount: Number(event.target.value) })}
        />
      </div>

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('params.doors')}</span>
        </div>
        <div className="segmented" role="group" aria-label={t('params.doors')}>
          {DOOR_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              className={
                params.doorCount === count ? 'segmented__option segmented__option--active' : 'segmented__option'
              }
              onClick={() => updateParams({ doorCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__head">
          <label className="field__label" htmlFor="carcass-material">
            {t('params.material')}
          </label>
        </div>
        <select
          id="carcass-material"
          className="field__select"
          value={params.carcassMaterialId}
          disabled={carcassBoardOptions.length === 0}
          onChange={(event) => updateParams({ carcassMaterialId: event.target.value })}
        >
          {carcassBoardOptions.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
