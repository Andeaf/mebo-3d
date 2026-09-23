import type { ReactElement } from 'react'
import { DRAWER_MIN_CARCASS_DEPTH_MM } from '@core/catalog/drawer'
import {
  addDrawer,
  addPresetPanel,
  canAddDrawer,
  customPieceEnvelopeLimits,
  drawerNumberOf,
  panelBoxSize,
  resizeEnvelope,
  CUSTOM_DRAWER_LIMITS,
  CUSTOM_PIECE_KIND,
  CUSTOM_PIECE_LIMITS,
  DEFAULT_WALL_MOUNTING_HEIGHT_MM,
  MAX_DRAWERS_PER_PIECE,
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
import { DrawerFields } from './DrawerFields'
import { HardwareFields } from './HardwareFields'
import { PanelFields } from './PanelFields'

interface PieceEditorProps {
  readonly placed: PlacedCabinet
  readonly spec: CustomPieceSpec
}

/**
 * The sidebar while a custom piece is open: the piece itself (name, envelope,
 * placement, hardware), the panel presets and "add drawer", the panel and
 * drawer lists, and the selected element's fields. Every change becomes a
 * new spec handed to the store, which clamps it and re-places the piece like
 * any other design edit.
 */
export function PieceEditor({ placed, spec }: PieceEditorProps): ReactElement {
  const t = useT()
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const exitPieceEditor = useAppStore((state) => state.exitPieceEditor)
  const selectElement = useAppStore((state) => state.selectElement)
  const selectedElementId = useAppStore((state) => state.editor.selectedElementId)
  const limits = CUSTOM_PIECE_LIMITS
  // While the piece holds drawers the envelope keeps room for them (the sliders stop).
  const envelope = customPieceEnvelopeLimits(spec)

  // The optional key names the field a slider is dragging so the burst is
  // one undo entry; discrete actions (a preset, a toggle) pass none.
  const onSpec = (next: CustomPieceSpec, coalesceKey?: string): void =>
    updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: next }, coalesceKey)

  const addPreset = (preset: (typeof PANEL_PRESETS)[number]): void => {
    const change = addPresetPanel(spec, preset)
    if (change !== null) {
      onSpec(change.spec)
      selectElement(change.panelId)
    }
  }

  const addOneDrawer = (): void => {
    const change = addDrawer(spec)
    if (change !== null) {
      onSpec(change.spec)
      selectElement(change.drawerId)
    }
  }

  const selectedPanel = spec.panels.find((panel) => panel.id === selectedElementId)
  const selectedDrawer = spec.drawers.find((drawer) => drawer.id === selectedElementId)
  const onWall = spec.mountingHeightMm > 0
  const atLimit = spec.panels.length >= MAX_PANELS_PER_PIECE
  const drawersAtLimit = spec.drawers.length >= MAX_DRAWERS_PER_PIECE
  const rowClass = (id: string): string =>
    id === selectedElementId ? 'panel-list__row panel-list__row--active' : 'panel-list__row'

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
        min={envelope.widthMm.min}
        max={envelope.widthMm.max}
        onChange={(widthMm) => onSpec(resizeEnvelope(spec, { widthMm }), 'widthMm')}
      />
      <DimensionField
        labelKey="params.height"
        value={spec.heightMm}
        min={envelope.heightMm.min}
        max={envelope.heightMm.max}
        onChange={(heightMm) => onSpec(resizeEnvelope(spec, { heightMm }), 'heightMm')}
      />
      <DimensionField
        labelKey="params.depth"
        value={spec.depthMm}
        min={envelope.depthMm.min}
        max={envelope.depthMm.max}
        onChange={(depthMm) => onSpec(resizeEnvelope(spec, { depthMm }), 'depthMm')}
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
          onChange={(mountingHeightMm) => onSpec({ ...spec, mountingHeightMm }, 'mountingHeightMm')}
        />
      )}

      <HardwareFields
        hardware={spec.hardware}
        onChange={(hardware, coalesceKey) => onSpec({ ...spec, hardware }, coalesceKey)}
      />

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

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('piece.addDrawer')}</span>
        </div>
        <div className="button-row">
          <button type="button" className="button" disabled={!canAddDrawer(spec)} onClick={addOneDrawer}>
            + {t('drawer.name')}
          </button>
        </div>
        {drawersAtLimit ? (
          <p className="field__hint">{t('piece.drawerLimit')}</p>
        ) : (
          !canAddDrawer(spec) && (
            <p className="field__hint">
              {t('piece.drawerNeedsRoom')} {CUSTOM_DRAWER_LIMITS.widthMm.min} × {DRAWER_MIN_CARCASS_DEPTH_MM}{' '}
              {t('unit.mm')}
            </p>
          )
        )}
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
                className={rowClass(panel.id)}
                onClick={() => selectElement(panel.id === selectedElementId ? null : panel.id)}
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

      {spec.drawers.length > 0 && (
        <>
          <h3 className="panel__subtitle">
            {t('piece.drawers')} ({spec.drawers.length})
          </h3>
          <div className="panel-list">
            {spec.drawers.map((drawer) => (
              <button
                key={drawer.id}
                type="button"
                className={rowClass(drawer.id)}
                onClick={() => selectElement(drawer.id === selectedElementId ? null : drawer.id)}
              >
                <span className="panel-list__role">
                  {t('drawer.name')} {drawerNumberOf(drawer.id)}
                </span>
                <span className="panel-list__dims">
                  {drawer.widthMm} × {drawer.heightMm}
                </span>
              </button>
            ))}
          </div>
          <p className="field__hint">{t('drawer.hardwareHint')}</p>
        </>
      )}

      {selectedPanel !== undefined ? (
        <>
          <p className="field__hint">{t('panel.moveHint')}</p>
          <PanelFields spec={spec} panel={selectedPanel} onSpec={onSpec} />
        </>
      ) : selectedDrawer !== undefined ? (
        <>
          <p className="field__hint">{t('drawer.moveHint')}</p>
          <DrawerFields spec={spec} drawer={selectedDrawer} onSpec={onSpec} />
        </>
      ) : (
        spec.panels.length + spec.drawers.length > 0 && (
          <p className="field__hint">{t('panel.noSelection')}</p>
        )
      )}
    </section>
  )
}
