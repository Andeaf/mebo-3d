import type { ReactElement } from 'react'
import {
  BASE_CABINET_LIMITS,
  MAX_SINGLE_DOOR_CABINET_WIDTH_MM,
  type BaseCabinetParams,
  type CabinetDesign,
  type DoorCount
} from '@core/cabinet'
import { CARCASS_THICKNESS_MM } from '@core/catalog/baseCabinet'
import {
  DRAWER_CABINET_LIMITS,
  type DrawerCabinetParams
} from '@core/catalog/drawerCabinet'
import type { DesignOfKind } from '@core/catalog/registry'
import { TALL_CABINET_LIMITS, type TallCabinetParams } from '@core/catalog/tallCabinet'
import type { CustomPieceSpec } from '@core/customPiece'
import { WALL_CABINET_LIMITS, type WallCabinetParams } from '@core/catalog/wallCabinet'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'
import { DimensionField } from './DimensionField'
import { MaterialSelect } from './MaterialSelect'

/** Whole-number picker (shelves, drawers): slider plus the current value. */
function CountField({
  labelKey,
  value,
  min,
  max,
  onChange
}: {
  readonly labelKey: TranslationKey
  readonly value: number
  readonly min: number
  readonly max: number
  readonly onChange: (value: number) => void
}): ReactElement {
  const t = useT()
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={`count-${labelKey}`}>
          {t(labelKey)}
        </label>
        <span className="field__value-badge">{value}</span>
      </div>
      <input
        id={`count-${labelKey}`}
        className="field__slider"
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  )
}

/** Carcass board picker, shared by every catalog kind (18 mm boards only). */
function MaterialField({
  value,
  onChange
}: {
  readonly value: string
  readonly onChange: (materialId: string) => void
}): ReactElement {
  return (
    <MaterialSelect
      id="carcass-material"
      labelKey="params.material"
      category="board"
      thicknessMm={CARCASS_THICKNESS_MM}
      value={value}
      onChange={onChange}
    />
  )
}

const DOOR_OPTIONS: readonly DoorCount[] = [0, 1, 2]

/**
 * Door-count picker shared by every door-bearing kind. A single leaf is
 * unavailable above MAX_SINGLE_DOOR_CABINET_WIDTH_MM (the core clamps it to
 * two anyway); the hint explains why the button is dead.
 */
function DoorCountField({
  widthMm,
  doorCount,
  onChange
}: {
  readonly widthMm: number
  readonly doorCount: DoorCount
  readonly onChange: (doorCount: DoorCount) => void
}): ReactElement {
  const t = useT()
  const singleDoorBlocked = widthMm > MAX_SINGLE_DOOR_CABINET_WIDTH_MM

  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{t('params.doors')}</span>
      </div>
      <div className="segmented" role="group" aria-label={t('params.doors')}>
        {DOOR_OPTIONS.map((count) => (
          <button
            key={count}
            type="button"
            className={
              doorCount === count
                ? 'segmented__option segmented__option--active'
                : 'segmented__option'
            }
            disabled={count === 1 && singleDoorBlocked}
            onClick={() => onChange(count)}
          >
            {count}
          </button>
        ))}
      </div>
      {singleDoorBlocked && <p className="field__hint">{t('params.singleDoorLimit')}</p>}
    </div>
  )
}

/** One field group per kind; each builds the next design and hands it to the store. */
function BaseCabinetFields({
  design
}: {
  readonly design: DesignOfKind<'base-cabinet'>
}): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = BASE_CABINET_LIMITS
  const patch = (next: Partial<BaseCabinetParams>): void =>
    updateSelectedDesign({ kind: 'base-cabinet', params: { ...params, ...next } })

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => patch({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => patch({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => patch({ depthMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => patch({ shelfCount })}
      />
      <DoorCountField
        widthMm={params.widthMm}
        doorCount={params.doorCount}
        onChange={(doorCount) => patch({ doorCount })}
      />
      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

function WallCabinetFields({
  design
}: {
  readonly design: DesignOfKind<'wall-cabinet'>
}): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = WALL_CABINET_LIMITS
  const patch = (next: Partial<WallCabinetParams>): void =>
    updateSelectedDesign({ kind: 'wall-cabinet', params: { ...params, ...next } })

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => patch({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => patch({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => patch({ depthMm })}
      />
      <DimensionField
        labelKey="params.mountingHeight"
        value={params.mountingHeightMm}
        min={limits.mountingHeightMm.min}
        max={limits.mountingHeightMm.max}
        onChange={(mountingHeightMm) => patch({ mountingHeightMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => patch({ shelfCount })}
      />
      <DoorCountField
        widthMm={params.widthMm}
        doorCount={params.doorCount}
        onChange={(doorCount) => patch({ doorCount })}
      />
      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

function TallCabinetFields({
  design
}: {
  readonly design: DesignOfKind<'tall-cabinet'>
}): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = TALL_CABINET_LIMITS
  const patch = (next: Partial<TallCabinetParams>): void =>
    updateSelectedDesign({ kind: 'tall-cabinet', params: { ...params, ...next } })

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => patch({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => patch({ heightMm })}
      />
      {/* Fixed 560 mm for now, so this renders read-only. */}
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => patch({ depthMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => patch({ shelfCount })}
      />
      <DoorCountField
        widthMm={params.widthMm}
        doorCount={params.doorCount}
        onChange={(doorCount) => patch({ doorCount })}
      />
      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

function DrawerCabinetFields({
  design
}: {
  readonly design: DesignOfKind<'drawer-cabinet'>
}): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = DRAWER_CABINET_LIMITS
  const patch = (next: Partial<DrawerCabinetParams>): void =>
    updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...params, ...next } })

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => patch({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => patch({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => patch({ depthMm })}
      />
      <CountField
        labelKey="params.drawers"
        value={params.drawerCount}
        min={limits.drawerCount.min}
        max={limits.drawerCount.max}
        onChange={(drawerCount) => patch({ drawerCount })}
      />
      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

/**
 * A custom piece outside its editor: what it is, at a glance. Its panels are
 * edited in the piece editor, never here.
 */
function CustomPieceSummary({ spec }: { readonly spec: CustomPieceSpec }): ReactElement {
  const t = useT()
  const enterPieceEditor = useAppStore((state) => state.enterPieceEditor)
  const row = (label: string, value: string): ReactElement => (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{label}</span>
        <span className="field__value-badge">{value}</span>
      </div>
    </div>
  )
  return (
    <>
      {row(t('piece.name'), spec.name === '' ? t('kind.custom-piece') : spec.name)}
      {row(t('piece.envelope'), `${spec.widthMm} × ${spec.heightMm} × ${spec.depthMm} ${t('unit.mm')}`)}
      {row(
        t('piece.mounting'),
        spec.mountingHeightMm > 0
          ? `${t('piece.mounting.wall')}, ${spec.mountingHeightMm} ${t('unit.mm')}`
          : t('piece.mounting.floor')
      )}
      {row(t('piece.panelCount'), String(spec.panels.length))}
      <div className="field__actions">
        <button type="button" className="button button--primary" onClick={enterPieceEditor}>
          {t('piece.edit')}
        </button>
      </div>
    </>
  )
}

/** Kind → field group. Adding a catalog kind adds one case here. */
function KindFields({ design }: { readonly design: CabinetDesign }): ReactElement {
  switch (design.kind) {
    case 'base-cabinet':
      return <BaseCabinetFields design={design} />
    case 'wall-cabinet':
      return <WallCabinetFields design={design} />
    case 'tall-cabinet':
      return <TallCabinetFields design={design} />
    case 'drawer-cabinet':
      return <DrawerCabinetFields design={design} />
    case 'custom-piece':
      return <CustomPieceSummary spec={design.spec} />
  }
}

export function ParameterPanel(): ReactElement {
  const t = useT()
  const selected = useSelectedCabinet()

  if (selected === null) {
    return (
      <section className="panel">
        <h2 className="panel__title">{t('params.title')}</h2>
        <p className="panel__note">{t('params.noSelection')}</p>
      </section>
    )
  }

  return (
    <section className="panel">
      <h2 className="panel__title">{t('params.title')}</h2>
      <h3 className="panel__kind">{t(`kind.${selected.design.kind}`)}</h3>
      <KindFields design={selected.design} />
    </section>
  )
}
