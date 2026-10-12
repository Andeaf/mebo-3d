import type { ReactElement } from 'react'
import { designFootprintSize, designVerticalExtent, isCustomPieceDesign } from '@core/catalog/registry'
import { drawerNumberOf, panelBoxSize, panelNumberOf, type CustomPieceSpec } from '@core/customPiece'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'

interface ElementLine {
  readonly nameKey: TranslationKey
  readonly number: number | null
  readonly size: string
}

/** The selected element's name and size (a panel's box in piece axes, a drawer's front). */
function elementLine(spec: CustomPieceSpec, elementId: string): ElementLine | null {
  const panel = spec.panels.find((candidate) => candidate.id === elementId)
  if (panel !== undefined) {
    const size = panelBoxSize(panel)
    return {
      nameKey: 'panel.name',
      number: panelNumberOf(panel.id),
      size: `${size.x} × ${size.y} × ${size.z}`
    }
  }
  const drawer = spec.drawers.find((candidate) => candidate.id === elementId)
  if (drawer !== undefined) {
    return {
      nameKey: 'drawer.name',
      number: drawerNumberOf(drawer.id),
      size: `${drawer.widthMm} × ${drawer.heightMm}`
    }
  }
  return null
}

/**
 * W × H × D of the selected cabinet, as an overlay in the viewport corner.
 * While an element of the open piece is selected its name and size come
 * first (Phase 12), the piece's own line under it.
 */
export function SelectedReadout(): ReactElement | null {
  const t = useT()
  const selected = useSelectedCabinet()
  const editing = useAppStore((state) => state.editor.editingPieceId !== null)
  const selectedElementId = useAppStore((state) => state.editor.selectedElementId)
  if (selected === null) {
    return null
  }
  const { widthMm, depthMm } = designFootprintSize(selected.design)
  const { bottomMm, topMm } = designVerticalExtent(selected.design)
  const name =
    selected.design.kind === 'custom-piece' && selected.design.spec.name !== ''
      ? selected.design.spec.name
      : t(`kind.${selected.design.kind}`)
  const element =
    editing && selectedElementId !== null && isCustomPieceDesign(selected.design)
      ? elementLine(selected.design.spec, selectedElementId)
      : null
  return (
    <div className="readout">
      {element !== null && (
        <div className="readout__row readout__row--element">
          <span className="readout__label">{t('viewport.element')}</span>
          <span className="readout__dims">
            {t(element.nameKey)} {element.number}
          </span>
          <span className="readout__dims">
            {element.size} {t('unit.mm')}
          </span>
        </div>
      )}
      <div className="readout__row">
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
    </div>
  )
}
