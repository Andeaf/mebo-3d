import type { ReactElement } from 'react'
import { designFootprintSize, designVerticalExtent } from '@core/catalog/registry'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

/** W × H × D of the selected cabinet, as an overlay in the viewport corner. */
export function SelectedReadout(): ReactElement | null {
  const t = useT()
  const selected = useSelectedCabinet()
  const editing = useAppStore((state) => state.editor.editingPieceId !== null)
  if (selected === null) {
    return null
  }
  const { widthMm, depthMm } = designFootprintSize(selected.design)
  const { bottomMm, topMm } = designVerticalExtent(selected.design)
  const name =
    selected.design.kind === 'custom-piece' && selected.design.spec.name !== ''
      ? selected.design.spec.name
      : t(`kind.${selected.design.kind}`)
  return (
    <div className="readout">
      <span className="readout__label">{editing ? t('viewport.editing') : t('viewport.selected')}</span>
      <span className="readout__dims">{name}</span>
      <span className="readout__dims">
        {widthMm} × {topMm - bottomMm} × {depthMm} {t('unit.mm')}
      </span>
      {bottomMm > 0 && (
        <>
          <span className="readout__label">{t('viewport.mountedAt')}</span>
          <span className="readout__dims">
            {bottomMm} {t('unit.mm')}
          </span>
        </>
      )}
    </div>
  )
}
