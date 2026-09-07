import type { ReactElement } from 'react'
import {
  duplicatePanel,
  panelRanges,
  removePanel,
  CUSTOM_PANEL_ROLES,
  CUSTOM_PIECE_DEFAULT_MATERIALS,
  CUSTOM_PIECE_LIMITS,
  PANEL_ORIENTATIONS,
  type CustomPanelSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import { findMaterial } from '@core/materials'
import { PANEL_EDGE_IDS, type PanelEdgeId } from '@core/panel'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { DimensionField } from '../panels/DimensionField'
import { MaterialSelect } from '../panels/MaterialSelect'

interface PanelFieldsProps {
  readonly spec: CustomPieceSpec
  readonly panel: CustomPanelSpec
  /** Hands the next spec to the store (which clamps it). */
  readonly onSpec: (spec: CustomPieceSpec) => void
}

/** Every field of the selected panel; sizes and positions are bounded by the envelope. */
export function PanelFields({ spec, panel, onSpec }: PanelFieldsProps): ReactElement {
  const t = useT()
  const priceDb = useAppStore((state) => state.priceDb)
  const selectPanel = useAppStore((state) => state.selectPanel)
  const ranges = panelRanges(spec, panel)
  const sizeMin = CUSTOM_PIECE_LIMITS.panelSizeMm.min

  const patch = (next: Partial<Omit<CustomPanelSpec, 'id'>>): void =>
    onSpec({
      ...spec,
      panels: spec.panels.map((entry) => (entry.id === panel.id ? { ...entry, ...next } : entry))
    })

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
      <h3 className="panel__subtitle">{t('panel.title')}</h3>

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
          <span className="field__label">{t('panel.thickness')}</span>
          <span className="field__value-badge">
            {panel.thicknessMm} {t('unit.mm')}
          </span>
        </div>
      </div>

      <DimensionField
        labelKey="panel.length"
        value={panel.lengthMm}
        min={sizeMin}
        max={ranges.lengthMaxMm}
        onChange={(lengthMm) => patch({ lengthMm })}
      />
      <DimensionField
        labelKey="panel.width"
        value={panel.widthMm}
        min={sizeMin}
        max={ranges.widthMaxMm}
        onChange={(widthMm) => patch({ widthMm })}
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

      <h3 className="panel__subtitle">{t('panel.position')}</h3>
      <DimensionField
        labelKey="panel.originX"
        value={panel.originMm.x}
        min={0}
        max={ranges.originMaxMm.x}
        onChange={(x) => patch({ originMm: { ...panel.originMm, x } })}
      />
      <DimensionField
        labelKey="panel.originY"
        value={panel.originMm.y}
        min={0}
        max={ranges.originMaxMm.y}
        onChange={(y) => patch({ originMm: { ...panel.originMm, y } })}
      />
      <DimensionField
        labelKey="panel.originZ"
        value={panel.originMm.z}
        min={0}
        max={ranges.originMaxMm.z}
        onChange={(z) => patch({ originMm: { ...panel.originMm, z } })}
      />

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
              selectPanel(change.panelId)
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
