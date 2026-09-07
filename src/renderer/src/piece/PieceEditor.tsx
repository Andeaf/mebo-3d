import type { ReactElement } from 'react'
import {
  addPresetPanel,
  panelBoxSize,
  resizeEnvelope,
  CUSTOM_PIECE_KIND,
  CUSTOM_PIECE_LIMITS,
  DEFAULT_WALL_MOUNTING_HEIGHT_MM,
  MAX_PANELS_PER_PIECE,
  MAX_PIECE_NAME_LENGTH,
  PANEL_PRESETS,
  type CustomPieceSpec
} from '@core/customPiece'
import type { PlacedCabinet } from '@core/scene'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { DimensionField } from '../panels/DimensionField'
import { TextField } from '../panels/TextField'
import { HardwareFields } from './HardwareFields'
import { PanelFields } from './PanelFields'

interface PieceEditorProps {
  readonly placed: PlacedCabinet
  readonly spec: CustomPieceSpec
}

/**
 * The sidebar while a custom piece is open: the piece itself (name, envelope,
 * placement, hardware), the preset buttons, the panel list and the selected
 * panel's fields. Every change becomes a new spec handed to the store, which
 * clamps it and re-places the piece like any other design edit.
 */
export function PieceEditor({ placed, spec }: PieceEditorProps): ReactElement {
  const t = useT()
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const exitPieceEditor = useAppStore((state) => state.exitPieceEditor)
  const selectPanel = useAppStore((state) => state.selectPanel)
  const selectedPanelId = useAppStore((state) => state.editor.selectedPanelId)
  const limits = CUSTOM_PIECE_LIMITS

  const onSpec = (next: CustomPieceSpec): void =>
    updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: next })

  const addPreset = (preset: (typeof PANEL_PRESETS)[number]): void => {
    const change = addPresetPanel(spec, preset)
    if (change !== null) {
      onSpec(change.spec)
      selectPanel(change.panelId)
    }
  }

  const selectedPanel = spec.panels.find((panel) => panel.id === selectedPanelId)
  const onWall = spec.mountingHeightMm > 0
  const atLimit = spec.panels.length >= MAX_PANELS_PER_PIECE

  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="panel__title">
          {t('piece.title')}{' '}
          <span className="field__value-badge">#{placed.id.replace('cab-', '')}</span>
        </h2>
        <button type="button" className="button button--primary" onClick={exitPieceEditor}>
          {t('piece.done')}
        </button>
      </div>

      <TextField
        id="piece-name"
        labelKey="piece.name"
        placeholderKey="piece.namePlaceholder"
        value={spec.name}
        maxLength={MAX_PIECE_NAME_LENGTH}
        onChange={(name) => onSpec({ ...spec, name })}
      />
      <DimensionField
        labelKey="params.width"
        value={spec.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => onSpec(resizeEnvelope(spec, { widthMm }))}
      />
      <DimensionField
        labelKey="params.height"
        value={spec.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => onSpec(resizeEnvelope(spec, { heightMm }))}
      />
      <DimensionField
        labelKey="params.depth"
        value={spec.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => onSpec(resizeEnvelope(spec, { depthMm }))}
      />

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('piece.mounting')}</span>
        </div>
        <div className="segmented" role="group" aria-label={t('piece.mounting')}>
          <button
            type="button"
            className={!onWall ? 'segmented__option segmented__option--active' : 'segmented__option'}
            onClick={() => onSpec({ ...spec, mountingHeightMm: 0 })}
          >
            {t('piece.mounting.floor')}
          </button>
          <button
            type="button"
            className={onWall ? 'segmented__option segmented__option--active' : 'segmented__option'}
            onClick={() => {
              if (!onWall) {
                onSpec({ ...spec, mountingHeightMm: DEFAULT_WALL_MOUNTING_HEIGHT_MM })
              }
            }}
          >
            {t('piece.mounting.wall')}
          </button>
        </div>
      </div>
      {onWall && (
        <DimensionField
          labelKey="params.mountingHeight"
          value={spec.mountingHeightMm}
          min={1}
          max={limits.mountingHeightMm.max}
          onChange={(mountingHeightMm) => onSpec({ ...spec, mountingHeightMm })}
        />
      )}

      <HardwareFields hardware={spec.hardware} onChange={(hardware) => onSpec({ ...spec, hardware })} />

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('piece.addPanel')}</span>
        </div>
        <div className="button-row">
          {PANEL_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="button"
              disabled={atLimit}
              onClick={() => addPreset(preset)}
            >
              + {t(`preset.${preset}`)}
            </button>
          ))}
        </div>
        {atLimit && <p className="field__hint">{t('piece.panelLimit')}</p>}
      </div>

      <h3 className="panel__subtitle">
        {t('piece.panels')} ({spec.panels.length})
      </h3>
      {spec.panels.length === 0 ? (
        <p className="panel__note">{t('piece.noPanels')}</p>
      ) : (
        <div className="panel-list">
          {spec.panels.map((panel) => {
            const size = panelBoxSize(panel)
            return (
              <button
                key={panel.id}
                type="button"
                className={
                  panel.id === selectedPanelId
                    ? 'panel-list__row panel-list__row--active'
                    : 'panel-list__row'
                }
                onClick={() => selectPanel(panel.id === selectedPanelId ? null : panel.id)}
              >
                <span className="panel-list__role">{t(`role.${panel.role}`)}</span>
                <span className="panel-list__dims">
                  {size.x} × {size.y} × {size.z}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {selectedPanel === undefined ? (
        spec.panels.length > 0 && <p className="field__hint">{t('panel.noSelection')}</p>
      ) : (
        <PanelFields spec={spec} panel={selectedPanel} onSpec={onSpec} />
      )}
    </section>
  )
}
