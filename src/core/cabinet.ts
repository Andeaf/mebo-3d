export type DoorCount = 0 | 1 | 2

/**
 * Base cabinets default to two top stretchers (the worktop closes the top);
 * a full top panel is supported for future cabinet types.
 */
export type TopConstruction = 'stretchers' | 'panel'

export interface BaseCabinetParams {
  readonly widthMm: number
  readonly heightMm: number
  readonly depthMm: number
  readonly shelfCount: number
  readonly doorCount: DoorCount
  readonly topConstruction: TopConstruction
  readonly carcassMaterialId: string
  readonly backMaterialId: string
  readonly edgeBandMaterialId: string
}

export const BASE_CABINET_LIMITS = {
  widthMm: { min: 300, max: 1200 },
  heightMm: { min: 400, max: 1000 },
  depthMm: { min: 300, max: 700 },
  shelfCount: { min: 0, max: 4 }
} as const

export function createDefaultBaseCabinetParams(): BaseCabinetParams {
  return {
    widthMm: 600,
    heightMm: 720,
    depthMm: 560,
    shelfCount: 1,
    doorCount: 2,
    topConstruction: 'stretchers',
    carcassMaterialId: 'melamine-white-18',
    backMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Forces params into the allowed ranges (used by the UI on every edit). */
export function clampBaseCabinetParams(params: BaseCabinetParams): BaseCabinetParams {
  const limits = BASE_CABINET_LIMITS
  return {
    ...params,
    widthMm: clamp(Math.round(params.widthMm), limits.widthMm.min, limits.widthMm.max),
    heightMm: clamp(Math.round(params.heightMm), limits.heightMm.min, limits.heightMm.max),
    depthMm: clamp(Math.round(params.depthMm), limits.depthMm.min, limits.depthMm.max),
    shelfCount: clamp(Math.round(params.shelfCount), limits.shelfCount.min, limits.shelfCount.max)
  }
}

/** Returns a list of violations (empty when the params are valid). */
export function validateBaseCabinetParams(params: BaseCabinetParams): string[] {
  const limits = BASE_CABINET_LIMITS
  const errors: string[] = []
  const checkRange = (label: string, value: number, range: { min: number; max: number }): void => {
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      errors.push(`${label} must be between ${range.min} and ${range.max} (got ${value})`)
    }
  }
  checkRange('widthMm', params.widthMm, limits.widthMm)
  checkRange('heightMm', params.heightMm, limits.heightMm)
  checkRange('depthMm', params.depthMm, limits.depthMm)
  checkRange('shelfCount', params.shelfCount, limits.shelfCount)
  if (!Number.isInteger(params.shelfCount)) {
    errors.push(`shelfCount must be an integer (got ${params.shelfCount})`)
  }
  return errors
}

/**
 * A complete design as fed to the price engine. Phase 1 knows a single
 * cabinet type; later phases add more `kind`s (custom pieces, imports).
 */
export interface CabinetDesign {
  readonly kind: 'base-cabinet'
  readonly params: BaseCabinetParams
}
