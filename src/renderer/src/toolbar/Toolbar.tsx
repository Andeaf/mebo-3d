import type { ReactElement } from 'react'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

export function Toolbar(): ReactElement {
  const t = useT()
  const hasSelection = useAppStore((state) => state.selectedCabinetId !== null)
  const addCabinet = useAppStore((state) => state.addCabinet)
  const duplicateSelected = useAppStore((state) => state.duplicateSelected)
  const deleteSelected = useAppStore((state) => state.deleteSelected)
  const rotateSelected = useAppStore((state) => state.rotateSelected)
  const requestFitView = useAppStore((state) => state.requestFitView)

  return (
    <div className="toolbar">
      <button type="button" className="toolbar__button" onClick={addCabinet}>
        + {t('toolbar.add')}
      </button>
      <button
        type="button"
        className="toolbar__button"
        disabled={!hasSelection}
        onClick={duplicateSelected}
      >
        {t('toolbar.duplicate')}
      </button>
      <button
        type="button"
        className="toolbar__button"
        disabled={!hasSelection}
        onClick={rotateSelected}
      >
        {t('toolbar.rotate')}
      </button>
      <button
        type="button"
        className="toolbar__button toolbar__button--danger"
        disabled={!hasSelection}
        onClick={deleteSelected}
      >
        {t('toolbar.delete')}
      </button>
      <button type="button" className="toolbar__button" onClick={requestFitView}>
        {t('toolbar.fitView')}
      </button>
    </div>
  )
}
