import type { ReactElement } from 'react'
import { CUSTOM_PIECE_LIMITS } from '@core/customPiece'
import type { HardwareItem } from '@core/panel'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

interface HardwareFieldsProps {
  readonly hardware: readonly HardwareItem[]
  /** The key names the row whose quantity spinner is running, so the burst is one undo entry. */
  readonly onChange: (hardware: readonly HardwareItem[], coalesceKey?: string) => void
}

/**
 * The piece's hardware list: one row per hardware material with a quantity.
 * Each material appears at most once (the core refuses duplicates), so the
 * add button offers the next material not yet listed and disables when there
 * is none.
 */
export function HardwareFields({ hardware, onChange }: HardwareFieldsProps): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const options = priceDb?.materials.filter((material) => material.category === 'hardware') ?? []
  const listed = new Set(hardware.map((item) => item.materialId))
  const nextFree = options.find((material) => !listed.has(material.id))
  const { min, max } = CUSTOM_PIECE_LIMITS.hardwareQuantity

  const replace = (index: number, item: HardwareItem, coalesceKey?: string): void =>
    onChange(
      hardware.map((entry, i) => (i === index ? item : entry)),
      coalesceKey
    )

  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{t('hardware.title')}</span>
        <button
          type="button"
          className="button"
          disabled={nextFree === undefined}
          onClick={() => {
            if (nextFree !== undefined) {
              onChange([...hardware, { materialId: nextFree.id, quantity: 1 }])
            }
          }}
        >
          + {t('hardware.add')}
        </button>
      </div>
      {hardware.length === 0 && <p className="field__hint">{t('hardware.none')}</p>}
      {hardware.map((item, index) => {
        const known = options.some((material) => material.id === item.materialId)
        return (
          <div key={item.materialId} className="hardware-row">
            <select
              className="field__select"
              aria-label={t('hardware.title')}
              value={item.materialId}
              onChange={(event) => replace(index, { ...item, materialId: event.target.value })}
            >
              {!known && <option value={item.materialId}>{item.materialId}</option>}
              {options.map((material) => (
                <option
                  key={material.id}
                  value={material.id}
                  disabled={material.id !== item.materialId && listed.has(material.id)}
                >
                  {material.name}
                </option>
              ))}
            </select>
            <input
              className="field__number"
              type="number"
              aria-label={t('hardware.quantity')}
              min={min}
              max={max}
              step={1}
              value={item.quantity}
              onChange={(event) => {
                const quantity = Number(event.target.value)
                if (Number.isFinite(quantity)) {
                  replace(index, { ...item, quantity }, `hardware:${item.materialId}`)
                }
              }}
            />
            <button
              type="button"
              className="button button--danger"
              aria-label={t('hardware.remove')}
              onClick={() => onChange(hardware.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
