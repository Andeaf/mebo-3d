import type { ReactElement } from 'react'
import { useSelectedCabinet } from '@state/selectors'
import { useT } from '../i18n'

/** W × H × D of the selected cabinet, as an overlay in the viewport corner. */
export function SelectedReadout(): ReactElement | null {
  const t = useT()
  const selected = useSelectedCabinet()
  if (selected === null) {
    return null
  }
  const { widthMm, heightMm, depthMm } = selected.design.params
  return (
    <div className="readout">
      <span className="readout__label">{t('viewport.selected')}</span>
      <span className="readout__dims">
        {widthMm} × {heightMm} × {depthMm} {t('unit.mm')}
      </span>
    </div>
  )
}
