import {
  clampBaseCabinetParams,
  createDefaultBaseCabinetParams,
  validateBaseCabinetParams,
  type BaseCabinetParams
} from '../cabinet'
import {
  clampCustomPieceSpec,
  customPieceFootprintSize,
  customPieceVerticalExtent,
  generateCustomPiece,
  validateCustomPieceSpec,
  CUSTOM_PIECE_KIND,
  type CustomPieceDesign
} from '../customPiece'
// Type-only on purpose: footprint.ts calls this module at runtime, so a value
// import here would close a runtime cycle.
import type { FootprintSize, VerticalExtentMm } from '../footprint'
import { generateBaseCabinet } from './baseCabinet'
import {
  clampDrawerCabinetParams,
  createDefaultDrawerCabinetParams,
  generateDrawerCabinet,
  validateDrawerCabinetParams,
  type DrawerCabinetParams
} from './drawerCabinet'
import {
  clampDrawerDoorCabinetParams,
  createDefaultDrawerDoorCabinetParams,
  generateDrawerDoorCabinet,
  validateDrawerDoorCabinetParams,
  type DrawerDoorCabinetParams
} from './drawerDoorCabinet'
import type { CabinetBuild } from './parts'
import {
  clampTallCabinetParams,
  createDefaultTallCabinetParams,
  generateTallCabinet,
  validateTallCabinetParams,
  type TallCabinetParams
} from './tallCabinet'
import {
  clampWallCabinetParams,
  createDefaultWallCabinetParams,
  generateWallCabinet,
  validateWallCabinetParams,
  type WallCabinetParams
} from './wallCabinet'

/**
 * The catalog registry: the one place that knows which cabinet kinds exist,
 * and the one place that knows what a design can be.
 *
 * A design belongs to one of exactly TWO families:
 *   - a catalog kind: `{ kind, params }` with params total and scalar, listed
 *     in CABINET_REGISTRY and decoded from files by the template decoder;
 *   - a custom piece: `{ kind: 'custom-piece', spec }`, structured data
 *     (a panel list) with its own hand-written decoder in `project.ts`.
 * The dispatch helpers below branch once on the family; the catalog family
 * then goes through the exhaustive `visitDesign` switch. Adding a catalog
 * kind = one generator file + one entry in CABINET_REGISTRY + one case in
 * `visitDesign`. Scene placement, pricing, state and UI stay kind-agnostic
 * because they only ever go through the dispatch helpers.
 */

export interface CabinetParamsByKind {
  'base-cabinet': BaseCabinetParams
  'wall-cabinet': WallCabinetParams
  'tall-cabinet': TallCabinetParams
  'drawer-cabinet': DrawerCabinetParams
  'drawer-door-cabinet': DrawerDoorCabinetParams
}

export type CabinetKind = keyof CabinetParamsByKind

/** A catalog design: a kind plus the params of exactly that kind. */
export type CatalogDesign = {
  [K in CabinetKind]: { readonly kind: K; readonly params: CabinetParamsByKind[K] }
}[CabinetKind]

/** Any design the scene can hold: a catalog kind or a custom piece. */
export type CabinetDesign = CatalogDesign | CustomPieceDesign

/** Every `design.kind` value, catalog kinds and the custom piece (for labels). */
export type DesignKind = CabinetKind | typeof CUSTOM_PIECE_KIND

/** The design variant of exactly one catalog kind (for per-kind UI and generators). */
export type DesignOfKind<K extends CabinetKind> = Extract<CatalogDesign, { kind: K }>

export function isCustomPieceDesign(design: CabinetDesign): design is CustomPieceDesign {
  return design.kind === CUSTOM_PIECE_KIND
}

// The design→scene contract lives beside FootprintSize; re-exported here
// because this is where consumers have always found it.
export type { VerticalExtentMm }

/**
 * How a kind that hangs exposes its mounting height (Phase 9: the vertical
 * arrow and the PgUp/PgDn nudge read and write it without knowing the kind).
 */
export interface MountingAccess<P> {
  readonly heightOf: (params: P) => number
  readonly withHeight: (params: P, mountingHeightMm: number) => P
}

export interface CabinetKindDefinition<K extends CabinetKind> {
  readonly kind: K
  /** A ready-to-place design with this kind's defaults (used by the type picker). */
  readonly createDefaultDesign: () => CatalogDesign
  /** Wraps this kind's params back into a design; keeps dispatch cast-free. */
  readonly designOf: (params: CabinetParamsByKind[K]) => CatalogDesign
  readonly clampParams: (params: CabinetParamsByKind[K]) => CabinetParamsByKind[K]
  readonly validateParams: (params: CabinetParamsByKind[K]) => string[]
  readonly generate: (params: CabinetParamsByKind[K]) => CabinetBuild
  readonly footprintSize: (params: CabinetParamsByKind[K]) => FootprintSize
  readonly verticalExtent: (params: CabinetParamsByKind[K]) => VerticalExtentMm
  /**
   * Does a worktop belong on top of this kind? (Phase 7.) Floor-standing
   * kitchen carcasses say yes; a kind that IS the full height (tall) or hangs
   * (wall) says no. Kind #5 declares its own answer or the registry test fails.
   */
  readonly worktopEligible: boolean
  /**
   * The mounting height of a kind that hangs, or null for a floor kind
   * (Phase 9). Kind #5 declares its own answer or the registry test fails.
   */
  readonly mounting: MountingAccess<CabinetParamsByKind[K]> | null
}

export const CABINET_REGISTRY: { readonly [K in CabinetKind]: CabinetKindDefinition<K> } = {
  'base-cabinet': {
    kind: 'base-cabinet',
    createDefaultDesign: () => ({
      kind: 'base-cabinet',
      params: createDefaultBaseCabinetParams()
    }),
    designOf: (params) => ({ kind: 'base-cabinet', params }),
    clampParams: clampBaseCabinetParams,
    validateParams: validateBaseCabinetParams,
    generate: generateBaseCabinet,
    footprintSize: (params) => ({ widthMm: params.widthMm, depthMm: params.depthMm }),
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm }),
    // Also with a full top panel: that closes the carcass, it is not the worktop.
    worktopEligible: true,
    mounting: null
  },
  'wall-cabinet': {
    kind: 'wall-cabinet',
    createDefaultDesign: () => ({
      kind: 'wall-cabinet',
      params: createDefaultWallCabinetParams()
    }),
    designOf: (params) => ({ kind: 'wall-cabinet', params }),
    clampParams: clampWallCabinetParams,
    validateParams: validateWallCabinetParams,
    generate: generateWallCabinet,
    footprintSize: (params) => ({ widthMm: params.widthMm, depthMm: params.depthMm }),
    verticalExtent: (params) => ({
      bottomMm: params.mountingHeightMm,
      topMm: params.mountingHeightMm + params.heightMm
    }),
    worktopEligible: false,
    mounting: {
      heightOf: (params) => params.mountingHeightMm,
      withHeight: (params, mountingHeightMm) => ({ ...params, mountingHeightMm })
    }
  },
  'tall-cabinet': {
    kind: 'tall-cabinet',
    createDefaultDesign: () => ({
      kind: 'tall-cabinet',
      params: createDefaultTallCabinetParams()
    }),
    designOf: (params) => ({ kind: 'tall-cabinet', params }),
    clampParams: clampTallCabinetParams,
    validateParams: validateTallCabinetParams,
    generate: generateTallCabinet,
    footprintSize: (params) => ({ widthMm: params.widthMm, depthMm: params.depthMm }),
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm }),
    worktopEligible: false,
    mounting: null
  },
  'drawer-cabinet': {
    kind: 'drawer-cabinet',
    createDefaultDesign: () => ({
      kind: 'drawer-cabinet',
      params: createDefaultDrawerCabinetParams()
    }),
    designOf: (params) => ({ kind: 'drawer-cabinet', params }),
    clampParams: clampDrawerCabinetParams,
    validateParams: validateDrawerCabinetParams,
    generate: generateDrawerCabinet,
    footprintSize: (params) => ({ widthMm: params.widthMm, depthMm: params.depthMm }),
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm }),
    worktopEligible: true,
    mounting: null
  },
  'drawer-door-cabinet': {
    kind: 'drawer-door-cabinet',
    createDefaultDesign: () => ({
      kind: 'drawer-door-cabinet',
      params: createDefaultDrawerDoorCabinetParams()
    }),
    designOf: (params) => ({ kind: 'drawer-door-cabinet', params }),
    clampParams: clampDrawerDoorCabinetParams,
    validateParams: validateDrawerDoorCabinetParams,
    generate: generateDrawerDoorCabinet,
    footprintSize: (params) => ({ widthMm: params.widthMm, depthMm: params.depthMm }),
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm }),
    // A kitchen base unit like the onderkast: the worktop runs over it.
    worktopEligible: true,
    mounting: null
  }
}

/** Stable order for the UI type picker. */
export const CABINET_KINDS: readonly CabinetKind[] = [
  'base-cabinet',
  'wall-cabinet',
  'tall-cabinet',
  'drawer-cabinet',
  'drawer-door-cabinet'
]

export function isCabinetKind(value: string): value is CabinetKind {
  return (CABINET_KINDS as readonly string[]).includes(value)
}

/** What a kind's param may hold: the JSON scalars the template decoder can check. */
type ParamPrimitive = 'number' | 'string' | 'boolean'
const PARAM_PRIMITIVES: readonly ParamPrimitive[] = ['number', 'string', 'boolean']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Decodes untrusted params (a project file) against the kind's DEFAULT params
 * used as a template: every template key must be present with the same
 * primitive type, and no other key may exist — a typo like `widhtMm` fails
 * loudly instead of loading a default silently. Range and enum checks are
 * `validateDesign`'s job, run by the caller afterwards.
 *
 * CONSTRAINT ON EVERY KIND, present and future: params must be TOTAL and
 * SCALAR — every field required (no optional fields, no `undefined`) and
 * every value a number, string or boolean. A kind whose defaults break this
 * is refused here with a programmer-facing error, so it shows up in the
 * registry tests rather than at a customer's Open dialog.
 *
 * The one cast after the exhaustive runtime check is deliberate: it is what
 * keeps this decoder kind-agnostic (zero per-kind decoder code), the same
 * discipline `parsePriceDatabase` uses for `category`. Error messages start
 * with `params.` so a caller can prefix them with its own path.
 */
export function decodeParams<K extends CabinetKind>(kind: K, raw: unknown): CabinetParamsByKind[K] {
  const defaults: unknown = CABINET_REGISTRY[kind].createDefaultDesign().params
  if (!isRecord(defaults)) {
    throw new Error(`kind ${kind} has non-object default params; the template decoder cannot read it`)
  }
  const template = defaults
  if (!isRecord(raw)) {
    throw new Error('params must be an object')
  }
  const decoded: Record<string, unknown> = {}
  for (const [key, templateValue] of Object.entries(template)) {
    const expected = typeof templateValue
    if (!(PARAM_PRIMITIVES as readonly string[]).includes(expected)) {
      throw new Error(
        `kind ${kind} has a non-scalar param ${key} (${expected}); the template decoder cannot read it`
      )
    }
    const value = raw[key]
    if (value === undefined) {
      throw new Error(`params.${key} is missing`)
    }
    if (typeof value !== expected) {
      throw new Error(`params.${key} must be a ${expected} (got ${JSON.stringify(value)})`)
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`params.${key} must be a finite number (got ${value})`)
    }
    decoded[key] = value
  }
  for (const key of Object.keys(raw)) {
    if (!(key in template)) {
      throw new Error(`params.${key} is not a field of ${kind}`)
    }
  }
  // The one deliberate cast (see the doc comment): the loop above is the proof.
  return decoded as unknown as CabinetParamsByKind[K]
}

/** `decodeParams` wrapped back into a design of that kind. */
export function decodeDesign<K extends CabinetKind>(kind: K, rawParams: unknown): CatalogDesign {
  const definition: CabinetKindDefinition<K> = CABINET_REGISTRY[kind]
  return definition.designOf(decodeParams(kind, rawParams))
}

type DesignVisitor<R> = <K extends CabinetKind>(
  definition: CabinetKindDefinition<K>,
  params: CabinetParamsByKind[K]
) => R

/**
 * The single exhaustive dispatch point of the catalog. Narrowing on the
 * discriminant is what pairs a definition with params of its own kind, so
 * every helper below stays fully typed without a cast.
 */
function visitDesign<R>(design: CatalogDesign, visit: DesignVisitor<R>): R {
  switch (design.kind) {
    case 'base-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'wall-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'tall-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'drawer-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'drawer-door-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
  }
}

export function createDefaultDesign(kind: CabinetKind): CatalogDesign {
  return CABINET_REGISTRY[kind].createDefaultDesign()
}

// The five dispatch helpers: one family branch each, then the catalog switch.
// A custom piece answers from its spec; everything downstream (cutting list,
// price engine, geometry, scene) only ever sees what these return.

/** design → panels + hardware. The single source of truth for one cabinet. */
export function generateCabinet(design: CabinetDesign): CabinetBuild {
  if (isCustomPieceDesign(design)) {
    return generateCustomPiece(design.spec)
  }
  return visitDesign(design, (definition, params) => definition.generate(params))
}

/** Plain-data equality: primitives by value, arrays element by element, records by key set and value. */
function sameData(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true
  }
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) && a.length === b.length && a.every((item, index) => sameData(item, b[index]))
    )
  }
  if (isRecord(a)) {
    if (!isRecord(b)) {
      return false
    }
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]))
    )
  }
  return false
}

/**
 * Two designs are the same design when their VALUES are equal, whatever
 * their references. Every edit builds a new design object (the clamp alone
 * does), so identity cannot tell an edit that changed nothing — the active
 * door count clicked again, "on the floor" for a piece already standing —
 * from a real one; this can. Generic over both families: a design is plain
 * data (scalar params, or a spec of records and arrays).
 */
export function sameDesign(a: CabinetDesign, b: CabinetDesign): boolean {
  return sameData(a, b)
}

/** Forces the design's values into their allowed ranges (used on every edit). */
export function clampDesign(design: CatalogDesign): CatalogDesign
export function clampDesign(design: CustomPieceDesign): CustomPieceDesign
export function clampDesign(design: CabinetDesign): CabinetDesign
export function clampDesign(design: CabinetDesign): CabinetDesign {
  if (isCustomPieceDesign(design)) {
    return { kind: CUSTOM_PIECE_KIND, spec: clampCustomPieceSpec(design.spec) }
  }
  return visitDesign(design, (definition, params) =>
    definition.designOf(definition.clampParams(params))
  )
}

/** Returns a list of violations (empty when the design is valid). */
export function validateDesign(design: CabinetDesign): string[] {
  if (isCustomPieceDesign(design)) {
    return validateCustomPieceSpec(design.spec)
  }
  return visitDesign(design, (definition, params) => definition.validateParams(params))
}

/** Carcass floor footprint (overlay fronts excluded on purpose). */
export function designFootprintSize(design: CabinetDesign): FootprintSize {
  if (isCustomPieceDesign(design)) {
    return customPieceFootprintSize(design.spec)
  }
  return visitDesign(design, (definition, params) => definition.footprintSize(params))
}

/** Vertical interval the carcass occupies above the floor, in mm. */
export function designVerticalExtent(design: CabinetDesign): VerticalExtentMm {
  if (isCustomPieceDesign(design)) {
    return customPieceVerticalExtent(design.spec)
  }
  return visitDesign(design, (definition, params) => definition.verticalExtent(params))
}

/**
 * Does a worktop belong on this design? A per-kind fact of the registry; a
 * custom piece gets none in Phase 7 (no params to consult, so no visit).
 */
export function designWorktopEligible(design: CabinetDesign): boolean {
  if (isCustomPieceDesign(design)) {
    return false
  }
  return CABINET_REGISTRY[design.kind].worktopEligible
}

/**
 * The height a hanging design's bottom sits at, or null when it does not
 * hang: a floor kind, or a custom piece standing on the floor (its
 * `mountingHeightMm` is 0). The vertical arrow exists exactly when this is
 * not null.
 */
export function designMountingHeightMm(design: CabinetDesign): number | null {
  if (isCustomPieceDesign(design)) {
    return design.spec.mountingHeightMm > 0 ? design.spec.mountingHeightMm : null
  }
  return visitDesign(design, (definition, params) =>
    definition.mounting === null ? null : definition.mounting.heightOf(params)
  )
}

/**
 * The same design hung at another height (unclamped — `clampDesign` runs
 * afterwards as for any edit), or null when it does not hang.
 */
export function designWithMountingHeightMm(
  design: CabinetDesign,
  mountingHeightMm: number
): CabinetDesign | null {
  if (isCustomPieceDesign(design)) {
    return design.spec.mountingHeightMm > 0
      ? { kind: CUSTOM_PIECE_KIND, spec: { ...design.spec, mountingHeightMm } }
      : null
  }
  return visitDesign(design, (definition, params) =>
    definition.mounting === null
      ? null
      : definition.designOf(definition.mounting.withHeight(params, mountingHeightMm))
  )
}
