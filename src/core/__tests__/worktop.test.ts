import { describe, expect, it } from 'vitest'
import {
  clampWorktopSettings,
  createDefaultWorktopSettings,
  validateWorktopSettings,
  DEFAULT_WORKTOP_MATERIAL_ID,
  WORKTOP_LIMITS
} from '@core/worktop'

describe('worktop settings', () => {
  it('defaults to worktops on, 38 mm HPL with a 30 mm overhang, inside the limits', () => {
    const settings = createDefaultWorktopSettings()
    expect(settings).toEqual({
      enabled: true,
      materialId: DEFAULT_WORKTOP_MATERIAL_ID,
      thicknessMm: 38,
      frontOverhangMm: 30
    })
    expect(validateWorktopSettings(settings)).toEqual([])
    expect(clampWorktopSettings(settings)).toEqual(settings)
  })

  it('clamps both dimensions into range and rounds to whole millimetres', () => {
    const clamped = clampWorktopSettings({
      enabled: false,
      materialId: 'worktop-oak-40',
      thicknessMm: 80,
      frontOverhangMm: -5
    })
    expect(clamped).toEqual({
      enabled: false,
      materialId: 'worktop-oak-40',
      thicknessMm: WORKTOP_LIMITS.thicknessMm.max,
      frontOverhangMm: WORKTOP_LIMITS.frontOverhangMm.min
    })
    expect(
      clampWorktopSettings({ ...createDefaultWorktopSettings(), thicknessMm: 39.6, frontOverhangMm: 12.4 })
    ).toMatchObject({ thicknessMm: 40, frontOverhangMm: 12 })
    expect(clampWorktopSettings(clamped)).toEqual(clamped)
  })

  it('names the field and the range when validating', () => {
    expect(
      validateWorktopSettings({ ...createDefaultWorktopSettings(), thicknessMm: 80, frontOverhangMm: -5 })
    ).toEqual([
      'thicknessMm must be between 12 and 60 (got 80)',
      'frontOverhangMm must be between 0 and 60 (got -5)'
    ])
    expect(validateWorktopSettings({ ...createDefaultWorktopSettings(), thicknessMm: Number.NaN })).toEqual([
      'thicknessMm must be between 12 and 60 (got NaN)'
    ])
  })

  it('never touches the material id or the switch', () => {
    const settings = { enabled: false, materialId: 'anything-at-all', thicknessMm: 12, frontOverhangMm: 60 }
    expect(clampWorktopSettings(settings)).toEqual(settings)
    expect(validateWorktopSettings(settings)).toEqual([])
  })
})
