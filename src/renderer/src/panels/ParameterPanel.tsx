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
  shallowFrontHeightMaxMm,
  DRAWER_CABINET_LIMITS,
  type DrawerCabinetParams
} from '@core/catalog/drawerCabinet'
import {
  drawerFrontHeightMaxMm,
  DRAWER_DOOR_CABINET_LIMITS,
  type DrawerDoorCabinetParams
} from '@core/catalog/drawerDoorCabinet'
import type { DesignOfKind } from '@core/catalog/registry'
import { TALL_CABINET_LIMITS, type TallCabinetParams } from '@core/catalog/tallCabinet'
import type { CustomPieceSpec } from '@core/customPiece'
import { WALL_CABINET_LIMITS, type WallCabinetParams } from '@core/catalog/wallCabinet'
import { roomInteriorRect } from '@core/room'
import type { PlacedCabinet } from '@core/scene'
import { useSelectedCabinet } from '@state/selectors'
import { useAppStore } from '@state/store'
import { useT, type TranslationKey } from '../i18n'
import { DimensionField } from './DimensionField'
import { MaterialSelect } from './MaterialSelect'
import { NumberInput } from './NumberInput'

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

/**
 * How many of a ladekast's top drawers are shallow: 0 … drawerCount − 1 (at
 * least one deep drawer takes the rest), as one segmented pick.
 */
function ShallowDrawerField({
  drawerCount,
  value,
  onChange
}: {
  readonly drawerCount: number
  readonly value: number
  readonly onChange: (shallowDrawerCount: number) => void
}): ReactElement {
  const t = useT()
  const options = Array.from({ length: drawerCount }, (_, index) => index)
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label">{t('params.shallowDrawers')}</span>
      </div>
      <div className="segmented" role="group" aria-label={t('params.shallowDrawers')}>
        {options.map((count) => (
          <button
            key={count}
            type="button"
            className={
              value === count ? 'segmented__option segmented__option--active' : 'segmented__option'
            }
            onClick={() => onChange(count)}
          >
            {count}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * The undo coalescing key for a slider/spinner edit: the names of the
 * fields it changes, so a drag on one slider is one entry and the next
 * slider starts another. Discrete picks (doors, material) pass no key.
 */
function burstKey(next: object): string {
  return Object.keys(next).join('+')
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
  const burst = (next: Partial<BaseCabinetParams>): void =>
    updateSelectedDesign({ kind: 'base-cabinet', params: { ...params, ...next } }, burstKey(next))

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => burst({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => burst({ depthMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => burst({ shelfCount })}
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
  const burst = (next: Partial<WallCabinetParams>): void =>
    updateSelectedDesign({ kind: 'wall-cabinet', params: { ...params, ...next } }, burstKey(next))

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => burst({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => burst({ depthMm })}
      />
      <DimensionField
        labelKey="params.mountingHeight"
        value={params.mountingHeightMm}
        min={limits.mountingHeightMm.min}
        max={limits.mountingHeightMm.max}
        onChange={(mountingHeightMm) => burst({ mountingHeightMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => burst({ shelfCount })}
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
  const burst = (next: Partial<TallCabinetParams>): void =>
    updateSelectedDesign({ kind: 'tall-cabinet', params: { ...params, ...next } }, burstKey(next))

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => burst({ heightMm })}
      />
      {/* Fixed 560 mm for now, so this renders read-only. */}
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => burst({ depthMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => burst({ shelfCount })}
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
  const t = useT()
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = DRAWER_CABINET_LIMITS
  const patch = (next: Partial<DrawerCabinetParams>): void =>
    updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...params, ...next } })
  const burst = (next: Partial<DrawerCabinetParams>): void =>
    updateSelectedDesign({ kind: 'drawer-cabinet', params: { ...params, ...next } }, burstKey(next))

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => burst({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => burst({ depthMm })}
      />
      <CountField
        labelKey="params.drawers"
        value={params.drawerCount}
        min={limits.drawerCount.min}
        max={limits.drawerCount.max}
        onChange={(drawerCount) => burst({ drawerCount })}
      />
      {params.drawerCount > 1 && (
        <ShallowDrawerField
          drawerCount={params.drawerCount}
          value={params.shallowDrawerCount}
          onChange={(shallowDrawerCount) => patch({ shallowDrawerCount })}
        />
      )}
      {params.shallowDrawerCount > 0 && (
        <>
          {/* Its maximum is the equal share: a shallow front never outgrows a deep one. */}
          <DimensionField
            labelKey="params.shallowFrontHeight"
            value={params.shallowFrontHeightMm}
            min={limits.shallowFrontHeightMm.min}
            max={shallowFrontHeightMaxMm(params)}
            step={1}
            onChange={(shallowFrontHeightMm) => burst({ shallowFrontHeightMm })}
          />
          <p className="field__hint">{t('params.shallowHint')}</p>
        </>
      )}
      <MaterialField
        value={params.carcassMaterialId}
        onChange={(carcassMaterialId) => patch({ carcassMaterialId })}
      />
    </>
  )
}

function DrawerDoorCabinetFields({
  design
}: {
  readonly design: DesignOfKind<'drawer-door-cabinet'>
}): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const params = design.params
  const limits = DRAWER_DOOR_CABINET_LIMITS
  const patch = (next: Partial<DrawerDoorCabinetParams>): void =>
    updateSelectedDesign({ kind: 'drawer-door-cabinet', params: { ...params, ...next } })
  const burst = (next: Partial<DrawerDoorCabinetParams>): void =>
    updateSelectedDesign(
      { kind: 'drawer-door-cabinet', params: { ...params, ...next } },
      burstKey(next)
    )

  return (
    <>
      <DimensionField
        labelKey="params.width"
        value={params.widthMm}
        min={limits.widthMm.min}
        max={limits.widthMm.max}
        onChange={(widthMm) => burst({ widthMm })}
      />
      <DimensionField
        labelKey="params.height"
        value={params.heightMm}
        min={limits.heightMm.min}
        max={limits.heightMm.max}
        onChange={(heightMm) => burst({ heightMm })}
      />
      <DimensionField
        labelKey="params.depth"
        value={params.depthMm}
        min={limits.depthMm.min}
        max={limits.depthMm.max}
        onChange={(depthMm) => burst({ depthMm })}
      />
      {/* Its maximum follows the height: the doors below keep their minimum. */}
      <DimensionField
        labelKey="params.drawerFrontHeight"
        value={params.drawerFrontHeightMm}
        min={limits.drawerFrontHeightMm.min}
        max={drawerFrontHeightMaxMm(params)}
        step={1}
        onChange={(drawerFrontHeightMm) => burst({ drawerFrontHeightMm })}
      />
      <CountField
        labelKey="params.shelves"
        value={params.shelfCount}
        min={limits.shelfCount.min}
        max={limits.shelfCount.max}
        onChange={(shelfCount) => burst({ shelfCount })}
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
      {spec.drawers.length > 0 && row(t('piece.drawerCount'), String(spec.drawers.length))}
      <div className="field__actions">
        <button type="button" className="button button--primary" onClick={enterPieceEditor}>
          {t('piece.edit')}
        </button>
      </div>
    </>
  )
}

/**
 * Where the selected cabinet stands: its carcass centre in world mm (the
 * stored value, rotation-independent). A committed value goes through the
 * placement gate, so what lands is the resolved pose — the field then
 * shows that, which is how a rejected value snaps back.
 */
function PositionFields({ placed }: { readonly placed: PlacedCabinet }): ReactElement {
  const t = useT()
  const room = useAppStore((state) => state.scene.room)
  const placeSelected = useAppStore((state) => state.placeSelected)
  const interior = roomInteriorRect(room)
  return (
    <>
      <h3 className="panel__subtitle">{t('params.position')}</h3>
      <div className="field">
        <div className="field__head">
          <label className="field__label" htmlFor="position-x">
            {t('params.positionX')}
          </label>
          <NumberInput
            id="position-x"
            value={placed.positionX}
            min={interior.minX}
            max={interior.maxX}
            onCommit={(x) => placeSelected(x, placed.positionZ)}
          />
        </div>
      </div>
      <div className="field">
        <div className="field__head">
          <label className="field__label" htmlFor="position-z">
            {t('params.positionZ')}
          </label>
          <NumberInput
            id="position-z"
            value={placed.positionZ}
            min={interior.minZ}
            max={interior.maxZ}
            onCommit={(z) => placeSelected(placed.positionX, z)}
          />
        </div>
      </div>
      <p className="field__hint">{t('params.nudgeHint')}</p>
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
    case 'drawer-door-cabinet':
      return <DrawerDoorCabinetFields design={design} />
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
      <PositionFields placed={selected} />
    </section>
  )
}
