import { useState, type ReactElement } from 'react'
import { BASE_CABINET_LIMITS, type BaseCabinetParams, type DoorCount } from '@core/cabinet'
import { CARCASS_THICKNESS_MM } from '@core/catalog/baseCabinet'
import type { DesignOfKind } from '@core/catalog/registry'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'

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

/** Carcass board picker, shared by every kind (18 mm boards only). */
function MaterialField({
  value,
  onChange
}: {
  readonly value: string
  readonly onChange: (materialId: string) => void
}): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const options =
    priceDb?.materials.filter(
      (material) => material.category === 'board' && material.thicknessMm === CARCASS_THICKNESS_MM
    ) ?? []

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor="carcass-material">
          {t('params.material')}
        </label>
      </div>
      <select
        id="carcass-material"
        className="field__select"
        value={value}
        disabled={options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((material) => (
          <option key={material.id} value={material.id}>
            {material.name}
          </option>
        ))}
      </select>
    </div>
  )
}

const DOOR_OPTIONS: readonly DoorCount[] = [0, 1, 2]

/** Field group for the base cabinet; one such group per kind. */
function BaseCabinetFields({ design }: { readonly design: DesignOfKind<'base-cabinet'> }): ReactElement {
  const t = useT()
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params

  const patch = (next: Partial<BaseCabinetParams>): void =>
    updateSelectedDesign({ kind: 'base-cabinet', params: { ...params, ...next } })

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={BASE_CABINET_LIMITS.widthMm.min}
        max={BASE_CABINET_LIMITS.widthMm.max}
        onChange={(widthMm) => patch({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={BASE_CABINET_LIMITS.heightMm.min}
        max={BASE_CABINET_LIMITS.heightMm.max}
        onChange={(heightMm) => patch({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={BASE_CABINET_LIMITS.depthMm.min}
        max={BASE_CABINET_LIMITS.depthMm.max}
        onChange={(depthMm) => patch({ depthMm })}
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
          onChange={(event) => patch({ shelfCount: Number(event.target.value) })}
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
                params.doorCount === count
                  ? 'segmented__option segmented__option--active'
                  : 'segmented__option'
              }
              onClick={() => patch({ doorCount: count })}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

export function ParameterPanel(): ReactElement {
  const t = useT()
  const selected = useSelectedCabinet()

  if (selected === null) {
    return (
      <section className="panel">
        <h2 className="panel__title">{t('params.title')}</h2>
        <p className="panel__note">{t('params.noSelection')}</p>
      </section>
    )
  }

  const design = selected.design
  return (
    <section className="panel">
      <h2 className="panel__title">{t('params.title')}</h2>
      {design.kind === 'base-cabinet' && <BaseCabinetFields design={design} />}
    </section>
  )
}
