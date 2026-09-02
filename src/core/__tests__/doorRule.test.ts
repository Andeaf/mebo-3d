import { describe, expect, it } from 'vitest'
import {
  clampBaseCabinetParams,
  clampDoorCountForWidth,
  createDefaultBaseCabinetParams,
  validateBaseCabinetParams,
  validateDoorCountForWidth,
  type BaseCabinetParams
} from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'

const defaults = createDefaultBaseCabinetParams()

function withParams(patch: Partial<BaseCabinetParams>): BaseCabinetParams {
  return { ...defaults, ...patch }
}

describe('clampDoorCountForWidth', () => {
  it('leaves a single door alone up to 600 mm', () => {
    expect(clampDoorCountForWidth(600, 1)).toBe(1)
    expect(clampDoorCountForWidth(300, 1)).toBe(1)
  })

  it('turns a single door into two above 600 mm', () => {
    expect(clampDoorCountForWidth(601, 1)).toBe(2)
    expect(clampDoorCountForWidth(1200, 1)).toBe(2)
  })

  it('never touches an open or double-door cabinet', () => {
    expect(clampDoorCountForWidth(1200, 0)).toBe(0)
    expect(clampDoorCountForWidth(1200, 2)).toBe(2)
  })
})

describe('the door rule inside the base cabinet', () => {
  it('clamps a widened single-door cabinet to two doors', () => {
    expect(clampBaseCabinetParams(withParams({ widthMm: 800, doorCount: 1 })).doorCount).toBe(2)
  })

  it('applies the rule to the clamped width, not the raw one', () => {
    // 2000 mm clamps to 1200 mm, which is still over the limit.
    expect(clampBaseCabinetParams(withParams({ widthMm: 2000, doorCount: 1 })).doorCount).toBe(2)
    // 250 mm clamps up to 300 mm, which keeps a single door legal.
    expect(clampBaseCabinetParams(withParams({ widthMm: 250, doorCount: 1 })).doorCount).toBe(1)
  })

  it('leaves a legal single-door cabinet untouched', () => {
    const params = withParams({ widthMm: 600, doorCount: 1 })
    expect(clampBaseCabinetParams(params)).toEqual(params)
  })

  it('reports the violation and refuses to generate', () => {
    const illegal = withParams({ widthMm: 800, doorCount: 1 })
    expect(validateDoorCountForWidth(800, 1)).toHaveLength(1)
    expect(validateBaseCabinetParams(illegal)).toEqual([expect.stringContaining('doorCount 1')])
    expect(() => generateBaseCabinet(illegal)).toThrow(/doorCount 1/)
  })

  it('keeps every legal combination valid', () => {
    expect(validateBaseCabinetParams(withParams({ widthMm: 800, doorCount: 2 }))).toEqual([])
    expect(validateBaseCabinetParams(withParams({ widthMm: 800, doorCount: 0 }))).toEqual([])
    expect(validateBaseCabinetParams(withParams({ widthMm: 600, doorCount: 1 }))).toEqual([])
  })
})
