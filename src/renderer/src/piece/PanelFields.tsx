import type { ReactElement } from 'react'
import {
  axesOf,
  duplicatePanel,
  panelBoxSize,
  panelNumberOf,
  panelRanges,
  removePanel,
  CUSTOM_PANEL_ROLES,
  CUSTOM_PIECE_DEFAULT_MATERIALS,
  CUSTOM_PIECE_LIMITS,
  PANEL_ORIENTATIONS,
  type CustomPanelSpec,
  type CustomPieceSpec,
  type PieceAxis
} from '@core/customPiece'
import { findMaterial } from '@core/materials'
import { PANEL_EDGE_IDS, type PanelEdgeId } from '@core/panel'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'
import { DimensionField } from '../panels/DimensionField'
import { MaterialSelect } from '../panels/MaterialSelect'

interface PanelFieldsProps {
  readonly spec: CustomPieceSpec
  readonly panel: CustomPanelSpec
  /**
   * Hands the next spec to the store (which clamps it). A `coalesceKey`
   * names the field a slider is dragging so the burst is one undo entry.
   */
  readonly onSpec: (spec: CustomPieceSpec, coalesceKey?: string) => void
}

/** The piece axes in the order the sidebar shows every size: width, height, depth. */
const SIZE_AXES: readonly { readonly axis: PieceAxis; readonly labelKey: TranslationKey }[] = [
  { axis: 'x', labelKey: 'params.width' },
  { axis: 'y', labelKey: 'params.height' },
  { axis: 'z', labelKey: 'params.depth' }
]

/**
 * The selected panel's section, first in the sidebar (Phase 12): its size in
 * PIECE axes — the same Breedte / Hoogte / Diepte the piece has, so the field
 * a user reaches for is the panel's — of which the thickness one is a badge
 * (it follows the material); then its position, then what it is made of.
 * The cut size stays visible as a badge: that is what the cutting list bills.
 */
export function PanelFields({ spec, panel, onSpec }: PanelFieldsProps): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const selectElement = useAppStore((state) => state.selectElement)
  const ranges = panelRanges(spec, panel)
  const sizeMin = CUSTOM_PIECE_LIMITS.panelSizeMm.min
  const axes = axesOf(panel.orientation)
  const size = panelBoxSize(panel)

  const withPanel = (next: Partial<Omit<CustomPanelSpec, 'id'>>): CustomPieceSpec => ({
    ...spec,
    panels: spec.panels.map((entry) => (entry.id === panel.id ? { ...entry, ...next } : entry))
  })
  /** A discrete pick (role, material, orientation, an edge): one undo entry each. */
  const patch = (next: Partial<Omit<CustomPanelSpec, 'id'>>): void => onSpec(withPanel(next))
  /** A slider or spinner: a burst on the same field is one undo entry. */
  const burst = (
    next: Partial<Omit<CustomPanelSpec, 'id'>>,
    field: string = Object.keys(next).join('+')
  ): void => onSpec(withPanel(next), `${panel.id}:${field}`)

  const chooseMaterial = (materialId: string): void => {
    // The thickness is the board's: a 22 mm top needs a 22 mm board.
    const thicknessMm = priceDb === null ? undefined : findMaterial(priceDb, materialId)?.thicknessMm
    patch(thicknessMm === undefined ? { materialId } : { materialId, thicknessMm })
  }

  const bandedEdges = panel.edgeBanding?.edges ?? []
  const toggleEdge = (edge: PanelEdgeId): void => {
    const edges = PANEL_EDGE_IDS.filter((candidate) =>
      candidate === edge ? !bandedEdges.includes(edge) : bandedEdges.includes(candidate)
    )
    patch({
      edgeBanding:
        edges.length === 0
          ? null
          : {
              materialId: panel.edgeBanding?.materialId ?? CUSTOM_PIECE_DEFAULT_MATERIALS.edgeBand,
              edges
            }
    })
  }

  return (
    <>
      <h3 className="panel__subtitle">
        {t('panel.name')} {panelNumberOf(panel.id)} — {t(`role.${panel.role}`)}
      </h3>
      <p className="field__hint">{t('panel.moveHint')}</p>

      {SIZE_AXES.map(({ axis, labelKey }) =>
        axis === axes.thickness ? (
          // The thickness runs along this axis: a badge, since it follows the material.
          <DimensionField
            key={axis}
            labelKey={labelKey}
            id={`element-${axis}`}
            value={size[axis]}
            min={size[axis]}
            max={size[axis]}
            onChange={() => undefined}
          />
        ) : axis === axes.length ? (
          <DimensionField
            key={axis}
            labelKey={labelKey}
            id={`element-${axis}`}
            value={panel.lengthMm}
            min={sizeMin}
            max={ranges.lengthMaxMm}
            onChange={(lengthMm) => burst({ lengthMm })}
          />
        ) : (
          <DimensionField
            key={axis}
            labelKey={labelKey}
            id={`element-${axis}`}
            value={panel.widthMm}
            min={sizeMin}
            max={ranges.widthMaxMm}
            onChange={(widthMm) => burst({ widthMm })}
          />
        )
      )}
      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('panel.cutSize')}</span>
          <span className="field__value-badge">
            {panel.lengthMm} × {panel.widthMm} × {panel.thicknessMm} {t('unit.mm')}
          </span>
        </div>
      </div>

      <h3 className="panel__subtitle">{t('panel.position')}</h3>
      <DimensionField
        labelKey="panel.originX"
        value={panel.originMm.x}
        min={0}
        max={ranges.originMaxMm.x}
        onChange={(x) => burst({ originMm: { ...panel.originMm, x } }, 'originMm.x')}
      />
      <DimensionField
        labelKey="panel.originY"
        value={panel.originMm.y}
        min={0}
        max={ranges.originMaxMm.y}
        onChange={(y) => burst({ originMm: { ...panel.originMm, y } }, 'originMm.y')}
      />
      <DimensionField
        labelKey="panel.originZ"
        value={panel.originMm.z}
        min={0}
        max={ranges.originMaxMm.z}
        onChange={(z) => burst({ originMm: { ...panel.originMm, z } }, 'originMm.z')}
      />

      <h3 className="panel__subtitle">{t('panel.construction')}</h3>
      <div className="field">
        <div className="field__head">
          <label className="field__label" htmlFor="panel-role">
            {t('panel.role')}
          </label>
        </div>
        <select
          id="panel-role"
          className="field__select"
          value={panel.role}
          onChange={(event) => {
            const role = CUSTOM_PANEL_ROLES.find((candidate) => candidate === event.target.value)
            if (role !== undefined) {
              patch({ role })
            }
          }}
        >
          {CUSTOM_PANEL_ROLES.map((role) => (
            <option key={role} value={role}>
              {t(`role.${role}`)}
            </option>
          ))}
        </select>
      </div>

      <MaterialSelect
        id="panel-material"
        labelKey="panel.material"
        category="board"
        value={panel.materialId}
        onChange={chooseMaterial}
      />

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('panel.orientation')}</span>
        </div>
        <div className="segmented" role="group" aria-label={t('panel.orientation')}>
          {PANEL_ORIENTATIONS.map((orientation) => (
            <button
              key={orientation}
              type="button"
              className={
                panel.orientation === orientation
                  ? 'segmented__option segmented__option--active'
                  : 'segmented__option'
              }
              onClick={() => patch({ orientation })}
            >
              {t(`panel.orientation.${orientation}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('panel.edgeBanding')}</span>
        </div>
        <div className="checkbox-row">
          {PANEL_EDGE_IDS.map((edge) => (
            <label key={edge} className="checkbox">
              <input
                type="checkbox"
                checked={bandedEdges.includes(edge)}
                onChange={() => toggleEdge(edge)}
              />
              {t(`panel.edge.${edge}`)}
            </label>
          ))}
        </div>
      </div>
      {panel.edgeBanding !== null && (
        <MaterialSelect
          id="panel-band-material"
          labelKey="panel.bandMaterial"
          category="edgeband"
          value={panel.edgeBanding.materialId}
          onChange={(materialId) =>
            patch({ edgeBanding: { materialId, edges: bandedEdges } })
          }
        />
      )}

      <div className="field__actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            const change = duplicatePanel(spec, panel.id)
            if (change !== null) {
              onSpec(change.spec)
              selectElement(change.panelId)
            }
          }}
        >
          {t('panel.duplicate')}
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => onSpec(removePanel(spec, panel.id))}
        >
          {t('panel.delete')}
        </button>
      </div>
    </>
  )
}
