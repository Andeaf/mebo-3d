import type { ReactElement } from 'react'
import { drawerBoxSideHeightMm, drawerSlideLengthMm } from '@core/catalog/drawer'
import { CARCASS_THICKNESS_MM, DOOR_THICKNESS_MM } from '@core/catalog/parts'
import {
  drawerRanges,
  duplicateDrawer,
  removeDrawer,
  CUSTOM_DRAWER_LIMITS,
  type CustomDrawerSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import { useAppStore } from '@state/store'
import { useT } from '../i18n'
import { DimensionField } from '../panels/DimensionField'
import { MaterialSelect } from '../panels/MaterialSelect'

interface DrawerFieldsProps {
  readonly spec: CustomPieceSpec
  readonly drawer: CustomDrawerSpec
  /**
   * Hands the next spec to the store (which clamps it). A `coalesceKey`
   * names the field a slider is dragging so the burst is one undo entry.
   */
  readonly onSpec: (spec: CustomPieceSpec, coalesceKey?: string) => void
}

/**
 * Every field of the selected drawer: where its front sits on the face and
 * what it is made of. The box behind it is derived — shown, never edited.
 */
export function DrawerFields({ spec, drawer, onSpec }: DrawerFieldsProps): ReactElement {
  const t = useT()
  const selectElement = useAppStore((state) => state.selectElement)
  const ranges = drawerRanges(spec, drawer)
  const limits = CUSTOM_DRAWER_LIMITS

  const withDrawer = (next: Partial<Omit<CustomDrawerSpec, 'id'>>): CustomPieceSpec => ({
    ...spec,
    drawers: spec.drawers.map((entry) => (entry.id === drawer.id ? { ...entry, ...next } : entry))
  })
  /** A discrete pick (a material): one undo entry each. */
  const patch = (next: Partial<Omit<CustomDrawerSpec, 'id'>>): void => onSpec(withDrawer(next))
  /** A slider or spinner: a burst on the same field is one undo entry. */
  const burst = (
    next: Partial<Omit<CustomDrawerSpec, 'id'>>,
    field: string = Object.keys(next).join('+')
  ): void => onSpec(withDrawer(next), `${drawer.id}:${field}`)

  return (
    <>
      <h3 className="panel__subtitle">{t('drawer.title')}</h3>
      <DimensionField
        labelKey="drawer.frontWidth"
        value={drawer.widthMm}
        min={limits.widthMm.min}
        max={ranges.widthMaxMm}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="drawer.frontHeight"
        value={drawer.heightMm}
        min={limits.heightMm.min}
        max={ranges.heightMaxMm}
        step={1}
        onChange={(heightMm) => burst({ heightMm })}
      />

      <h3 className="panel__subtitle">{t('panel.position')}</h3>
      <DimensionField
        labelKey="panel.originX"
        value={drawer.originMm.x}
        min={0}
        max={ranges.originMaxMm.x}
        onChange={(x) => burst({ originMm: { ...drawer.originMm, x } }, 'originMm.x')}
      />
      <DimensionField
        labelKey="panel.originY"
        value={drawer.originMm.y}
        min={0}
        max={ranges.originMaxMm.y}
        onChange={(y) => burst({ originMm: { ...drawer.originMm, y } }, 'originMm.y')}
      />

      {/* The front and the box are built 18 mm thick, so only 18 mm boards are offered. */}
      <MaterialSelect
        id="drawer-front-material"
        labelKey="drawer.frontMaterial"
        category="board"
        thicknessMm={DOOR_THICKNESS_MM}
        value={drawer.frontMaterialId}
        onChange={(frontMaterialId) => patch({ frontMaterialId })}
      />
      <MaterialSelect
        id="drawer-box-material"
        labelKey="drawer.boxMaterial"
        category="board"
        thicknessMm={CARCASS_THICKNESS_MM}
        value={drawer.boxMaterialId}
        onChange={(boxMaterialId) => patch({ boxMaterialId })}
      />
      <div className="field">
        <div className="field__head">
          <span className="field__label">{t('drawer.box')}</span>
          <span className="field__value-badge">
            {drawerSlideLengthMm(spec.depthMm)} × {drawerBoxSideHeightMm(drawer.heightMm)} {t('unit.mm')}
          </span>
        </div>
      </div>

      <div className="field__actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            const change = duplicateDrawer(spec, drawer.id)
            if (change !== null) {
              onSpec(change.spec)
              selectElement(change.drawerId)
            }
          }}
        >
          {t('panel.duplicate')}
        </button>
        <button
          type="button"
          className="button button--danger"
          onClick={() => onSpec(removeDrawer(spec, drawer.id))}
        >
          {t('panel.delete')}
        </button>
      </div>
    </>
  )
}
