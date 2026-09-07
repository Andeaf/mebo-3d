import { useEffect, useRef, useState, type ReactElement } from 'react'
import { CABINET_KINDS, type CabinetKind } from '@core/catalog/registry'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'

/** Add button + the cabinet-type picker it opens. Nothing is added until a kind is chosen. */
function AddCabinetMenu(): ReactElement {
  const t = useT()
  const addCabinet = useAppStore((state) => state.addCabinet)
  const addCustomPiece = useAppStore((state) => state.addCustomPiece)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: PointerEvent): void => {
      const wrap = wrapRef.current
      if (wrap !== null && event.target instanceof Node && !wrap.contains(event.target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const choose = (kind: CabinetKind): void => {
    addCabinet(kind)
    setOpen(false)
  }

  return (
    <div className="toolbar__menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="toolbar__button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        + {t('toolbar.add')}
      </button>
      {open && (
        <div className="toolbar__menu" role="menu">
          {CABINET_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="toolbar__menu-item"
              onClick={() => choose(kind)}
            >
              {t(`kind.${kind}`)}
            </button>
          ))}
          <div className="toolbar__menu-divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="toolbar__menu-item"
            onClick={() => {
              addCustomPiece(t('piece.defaultName'))
              setOpen(false)
            }}
          >
            {t('kind.custom-piece')}…
          </button>
        </div>
      )}
    </div>
  )
}

export function Toolbar(): ReactElement {
  const t = useT()
  const hasSelection = useAppStore((state) => state.selectedCabinetId !== null)
  const editing = useAppStore((state) => state.editor.editingPieceId !== null)
  const duplicateSelected = useAppStore((state) => state.duplicateSelected)
  const deleteSelected = useAppStore((state) => state.deleteSelected)
  const rotateSelected = useAppStore((state) => state.rotateSelected)
  const requestFitView = useAppStore((state) => state.requestFitView)
  const exitPieceEditor = useAppStore((state) => state.exitPieceEditor)

  if (editing) {
    // The scene gestures are off while a piece is open; only the way out remains.
    return (
      <div className="toolbar">
        <button type="button" className="toolbar__button" onClick={exitPieceEditor}>
          {t('piece.done')}
        </button>
      </div>
    )
  }

  return (
    <div className="toolbar">
      <AddCabinetMenu />
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
