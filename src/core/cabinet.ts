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

/**
 * Above this width a single door leaf is too wide to hang well, so the
 * cabinet gets two leaves. Applies to every door-bearing kind.
 */
export const MAX_SINGLE_DOOR_CABINET_WIDTH_MM = 600

/**
 * Enforces the door-leaf rule: one door on a cabinet wider than
 * MAX_SINGLE_DOOR_CABINET_WIDTH_MM becomes two. Never drops to zero — that
 * would silently delete doors and hardware the user asked for.
 */
export function clampDoorCountForWidth(widthMm: number, doorCount: DoorCount): DoorCount {
  return doorCount === 1 && widthMm > MAX_SINGLE_DOOR_CABINET_WIDTH_MM ? 2 : doorCount
}

/** The matching violation for validate functions (empty when the pair is legal). */
export function validateDoorCountForWidth(widthMm: number, doorCount: DoorCount): string[] {
  if (clampDoorCountForWidth(widthMm, doorCount) === doorCount) {
    return []
  }
  return [
    `doorCount 1 needs a width of at most ${MAX_SINGLE_DOOR_CABINET_WIDTH_MM} mm (got ${widthMm})`
  ]
}

/** An inclusive numeric range from a kind's `*_LIMITS` table. */
export interface NumericLimit {
  readonly min: number
  readonly max: number
}

/** Rounds to whole millimeters and forces the value into its range. */
export function clampToLimit(value: number, limit: NumericLimit): number {
  return Math.min(limit.max, Math.max(limit.min, Math.round(value)))
}

/** Collects an out-of-range violation per checked param (shared by all kinds). */
export function limitViolations(
  checks: readonly (readonly [label: string, value: number, limit: NumericLimit])[]
): string[] {
  const errors: string[] = []
  for (const [label, value, limit] of checks) {
    if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
      errors.push(`${label} must be between ${limit.min} and ${limit.max} (got ${value})`)
    }
  }
  return errors
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Forces params into the allowed ranges (used by the UI on every edit). */
export function clampBaseCabinetParams(params: BaseCabinetParams): BaseCabinetParams {
  const limits = BASE_CABINET_LIMITS
  // Dimensions first: the door rule reads the already-clamped width.
  const widthMm = clamp(Math.round(params.widthMm), limits.widthMm.min, limits.widthMm.max)
  return {
    ...params,
    widthMm,
    heightMm: clamp(Math.round(params.heightMm), limits.heightMm.min, limits.heightMm.max),
    depthMm: clamp(Math.round(params.depthMm), limits.depthMm.min, limits.depthMm.max),
    shelfCount: clamp(Math.round(params.shelfCount), limits.shelfCount.min, limits.shelfCount.max),
    doorCount: clampDoorCountForWidth(widthMm, params.doorCount)
  }
}

/** Returns a list of violations (empty when the params are valid). */
export function validateBaseCabinetParams(params: BaseCabinetParams): string[] {
  const limits = BASE_CABINET_LIMITS
  const errors = limitViolations([
    ['widthMm', params.widthMm, limits.widthMm],
    ['heightMm', params.heightMm, limits.heightMm],
    ['depthMm', params.depthMm, limits.depthMm],
    ['shelfCount', params.shelfCount, limits.shelfCount]
  ])
  if (!Number.isInteger(params.shelfCount)) {
    errors.push(`shelfCount must be an integer (got ${params.shelfCount})`)
  }
  errors.push(...validateDoorCountForWidth(params.widthMm, params.doorCount))
  return errors
}

/**
 * A complete design as fed to the price engine. The catalog registry owns the
 * union over all cabinet kinds; it is re-exported here (type-only, so this
 * creates no runtime import) because this is where consumers look for it.
 */
export type { CabinetDesign } from './catalog/registry'
