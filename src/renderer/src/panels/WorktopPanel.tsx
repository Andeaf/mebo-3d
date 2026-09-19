import { useState, type ReactElement } from 'react'
import { findMaterial } from '@core/materials'
import { WORKTOP_LIMITS, type WorktopSettings } from '@core/worktop'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { DimensionField } from './DimensionField'
import { MaterialSelect } from './MaterialSelect'

/**
 * Worktop settings for the whole scene, collapsed by default like the room:
 * set once per project and then mostly left alone. Nothing here stores a
 * slab — the four values are the design, the slabs are derived from them
 * and the cabinets on every render.
 */
export function WorktopPanel(): ReactElement {
  const t = useT()
  const worktop = useAppStore((state) => state.scene.worktop)
  const updateWorktop = useAppStore((state) => state.updateWorktop)
  const priceDb = useAppStore((state) => state.priceDb)
  const [open, setOpen] = useState(false)

  /** A discrete change (the checkbox, a material): one undo entry each. */
  const patch = (next: Partial<WorktopSettings>): void => updateWorktop({ ...worktop, ...next })
  /** A slider: a burst on the same field is one undo entry. */
  const burst = (next: Partial<WorktopSettings>): void =>
    updateWorktop({ ...worktop, ...next }, Object.keys(next).join('+'))

  const chooseMaterial = (materialId: string): void => {
    // The thickness follows the material when it states one: a 40 mm oak
    // top is 40 mm. The field stays editable afterwards (a solid top can be
    // planed to size).
    const thicknessMm = priceDb === null ? undefined : findMaterial(priceDb, materialId)?.thicknessMm
    patch(thicknessMm === undefined ? { materialId } : { materialId, thicknessMm })
  }

  return (
    <section className="panel">
      <button
        type="button"
        className="panel__collapse"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="panel__title panel__title--inline">{t('worktop.title')}</span>
        <span className="panel__collapse-mark" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          <div className="field">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={worktop.enabled}
                onChange={(event) => patch({ enabled: event.target.checked })}
              />
              {t('worktop.enabled')}
            </label>
          </div>
          {worktop.enabled && (
            <>
              <MaterialSelect
                id="worktop-material"
                labelKey="worktop.material"
                category="worktop"
                value={worktop.materialId}
                onChange={chooseMaterial}
              />
              <DimensionField
                labelKey="worktop.thickness"
                value={worktop.thicknessMm}
                min={WORKTOP_LIMITS.thicknessMm.min}
                max={WORKTOP_LIMITS.thicknessMm.max}
                step={1}
                onChange={(thicknessMm) => burst({ thicknessMm })}
              />
              <DimensionField
                labelKey="worktop.overhang"
                value={worktop.frontOverhangMm}
                min={WORKTOP_LIMITS.frontOverhangMm.min}
                max={WORKTOP_LIMITS.frontOverhangMm.max}
                step={5}
                onChange={(frontOverhangMm) => burst({ frontOverhangMm })}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}
