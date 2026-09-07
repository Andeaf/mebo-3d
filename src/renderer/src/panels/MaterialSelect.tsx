import type { ReactElement } from 'react'
import type { MaterialCategory } from '@core/materials'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'

interface MaterialSelectProps {
  readonly id: string
  readonly labelKey: TranslationKey
  readonly category: MaterialCategory
  /** Boards only: restrict to one board thickness (the catalog's carcass boards). */
  readonly thicknessMm?: number
  readonly value: string
  readonly onChange: (materialId: string) => void
}

/**
 * Picker over the loaded price database, filtered by category (and thickness
 * when given). A value that is not in the database — a discontinued id from a
 * project file — is shown as-is so the user sees what the design says.
 */
export function MaterialSelect({
  id,
  labelKey,
  category,
  thicknessMm,
  value,
  onChange
}: MaterialSelectProps): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const options =
    priceDb?.materials.filter(
      (material) =>
        material.category === category &&
        (thicknessMm === undefined || material.thicknessMm === thicknessMm)
    ) ?? []
  const known = options.some((material) => material.id === value)

  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {t(labelKey)}
        </label>
      </div>
      <select
        id={id}
        className="field__select"
        value={value}
        disabled={options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {!known && <option value={value}>{value}</option>}
        {options.map((material) => (
          <option key={material.id} value={material.id}>
            {material.name}
          </option>
        ))}
      </select>
    </div>
  )
}
