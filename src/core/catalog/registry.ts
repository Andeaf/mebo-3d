import {
  clampBaseCabinetParams,
  createDefaultBaseCabinetParams,
  validateBaseCabinetParams,
  type BaseCabinetParams
} from '../cabinet'
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
 * The catalog registry: the one place that knows which cabinet kinds exist.
 *
 * Adding a kind = one generator file + one entry in CABINET_REGISTRY + one
 * case in `visitDesign` below. Scene placement, pricing, state and UI stay
 * kind-agnostic because they only ever go through the dispatch helpers.
 */

export interface CabinetParamsByKind {
  'base-cabinet': BaseCabinetParams
  'wall-cabinet': WallCabinetParams
  'tall-cabinet': TallCabinetParams
  'drawer-cabinet': DrawerCabinetParams
}

export type CabinetKind = keyof CabinetParamsByKind

/** A complete design: a kind plus the params of exactly that kind. */
export type CabinetDesign = {
  [K in CabinetKind]: { readonly kind: K; readonly params: CabinetParamsByKind[K] }
}[CabinetKind]

/** The design variant of exactly one kind (for per-kind UI and generators). */
export type DesignOfKind<K extends CabinetKind> = Extract<CabinetDesign, { kind: K }>

// The design→scene contract lives beside FootprintSize; re-exported here
// because this is where consumers have always found it.
export type { VerticalExtentMm }

export interface CabinetKindDefinition<K extends CabinetKind> {
  readonly kind: K
  /** A ready-to-place design with this kind's defaults (used by the type picker). */
  readonly createDefaultDesign: () => CabinetDesign
  /** Wraps this kind's params back into a design; keeps dispatch cast-free. */
  readonly designOf: (params: CabinetParamsByKind[K]) => CabinetDesign
  readonly clampParams: (params: CabinetParamsByKind[K]) => CabinetParamsByKind[K]
  readonly validateParams: (params: CabinetParamsByKind[K]) => string[]
  readonly generate: (params: CabinetParamsByKind[K]) => CabinetBuild
  readonly footprintSize: (params: CabinetParamsByKind[K]) => FootprintSize
  readonly verticalExtent: (params: CabinetParamsByKind[K]) => VerticalExtentMm
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
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm })
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
    })
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
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm })
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
    verticalExtent: (params) => ({ bottomMm: 0, topMm: params.heightMm })
  }
}

/** Stable order for the UI type picker. */
export const CABINET_KINDS: readonly CabinetKind[] = [
  'base-cabinet',
  'wall-cabinet',
  'tall-cabinet',
  'drawer-cabinet'
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
export function decodeDesign<K extends CabinetKind>(kind: K, rawParams: unknown): CabinetDesign {
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
function visitDesign<R>(design: CabinetDesign, visit: DesignVisitor<R>): R {
  switch (design.kind) {
    case 'base-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'wall-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'tall-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
    case 'drawer-cabinet':
      return visit(CABINET_REGISTRY[design.kind], design.params)
  }
}

export function createDefaultDesign(kind: CabinetKind): CabinetDesign {
  return CABINET_REGISTRY[kind].createDefaultDesign()
}

/** design → panels + hardware. The single source of truth for one cabinet. */
export function generateCabinet(design: CabinetDesign): CabinetBuild {
  return visitDesign(design, (definition, params) => definition.generate(params))
}

/** Forces the design's params into their allowed ranges (used on every edit). */
export function clampDesign(design: CabinetDesign): CabinetDesign {
  return visitDesign(design, (definition, params) =>
    definition.designOf(definition.clampParams(params))
  )
}

/** Returns a list of violations (empty when the design is valid). */
export function validateDesign(design: CabinetDesign): string[] {
  return visitDesign(design, (definition, params) => definition.validateParams(params))
}

/** Carcass floor footprint (overlay fronts excluded on purpose). */
export function designFootprintSize(design: CabinetDesign): FootprintSize {
  return visitDesign(design, (definition, params) => definition.footprintSize(params))
}

/** Vertical interval the carcass occupies above the floor, in mm. */
export function designVerticalExtent(design: CabinetDesign): VerticalExtentMm {
  return visitDesign(design, (definition, params) => definition.verticalExtent(params))
}
