import {
  clampBaseCabinetParams,
  createDefaultBaseCabinetParams,
  validateBaseCabinetParams,
  type BaseCabinetParams
} from '../cabinet'
// Type-only on purpose: footprint.ts calls this module at runtime, so a value
// import here would close a runtime cycle.
import type { FootprintSize } from '../footprint'
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

/**
 * How high a cabinet's carcass sits above the floor, in mm. Floor-standing
 * kinds run 0..heightMm; a wall cabinet derives its interval from its own
 * mounting-height param — elevation is never stored on the placement.
 */
export interface VerticalExtentMm {
  readonly bottomMm: number
  readonly topMm: number
}

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
