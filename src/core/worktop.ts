import { clampToLimit, limitViolations } from './cabinet'

/**
 * Worktop settings: the DESIGN side of worktops (Phase 7), one record per
 * scene (`SceneDesign.worktop`, never optional — the room's rule repeated).
 * It is the only thing about worktops that is ever stored: the slabs
 * themselves are derived from the scene by `computeWorktops`
 * (worktopLayout.ts) on every change, exactly like the connected runs and
 * the builds. Per-run overrides are a later phase.
 */
export interface WorktopSettings {
  readonly enabled: boolean
  readonly materialId: string
  readonly thicknessMm: number
  /**
   * How far the slab reaches past the CARCASS front (the footprint's front
   * edge, the same plane the placement math uses). Overlay doors sit inside
   * this distance: the default 30 leaves a 12 mm lip past an 18 mm door.
   */
  readonly frontOverhangMm: number
}

// Provisional until the company's real list arrives.
export const WORKTOP_LIMITS = {
  thicknessMm: { min: 12, max: 60 },
  frontOverhangMm: { min: 0, max: 60 }
} as const

/** The default worktop material; must exist in data/materials.json. */
export const DEFAULT_WORKTOP_MATERIAL_ID = 'worktop-hpl-38'

export function createDefaultWorktopSettings(): WorktopSettings {
  return {
    enabled: true,
    materialId: DEFAULT_WORKTOP_MATERIAL_ID,
    thicknessMm: 38,
    frontOverhangMm: 30
  }
}

/** Forces the two dimensions into range (rounded to whole mm); used on every edit. */
export function clampWorktopSettings(settings: WorktopSettings): WorktopSettings {
  return {
    enabled: settings.enabled,
    materialId: settings.materialId,
    thicknessMm: clampToLimit(settings.thicknessMm, WORKTOP_LIMITS.thicknessMm),
    frontOverhangMm: clampToLimit(settings.frontOverhangMm, WORKTOP_LIMITS.frontOverhangMm)
  }
}

/** Range violations, named like a cabinet's (`thicknessMm must be between …`); empty when valid. */
export function validateWorktopSettings(settings: WorktopSettings): string[] {
  return limitViolations([
    ['thicknessMm', settings.thicknessMm, WORKTOP_LIMITS.thicknessMm],
    ['frontOverhangMm', settings.frontOverhangMm, WORKTOP_LIMITS.frontOverhangMm]
  ])
}
