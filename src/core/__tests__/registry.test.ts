import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams } from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'
import {
  CABINET_KINDS,
  CABINET_REGISTRY,
  clampDesign,
  createDefaultDesign,
  designFootprintSize,
  designVerticalExtent,
  generateCabinet,
  validateDesign
} from '@core/catalog/registry'
import { cabinetFootprintSize } from '@core/footprint'

// Every assertion here runs for the whole catalog, so a new kind is covered
// the moment it is registered.
describe('catalog registry', () => {
  it('exposes every registered kind in the picker order', () => {
    expect(CABINET_KINDS.length).toBeGreaterThan(0)
    expect([...CABINET_KINDS].sort()).toEqual(Object.keys(CABINET_REGISTRY).sort())
    for (const kind of CABINET_KINDS) {
      expect(CABINET_REGISTRY[kind].kind).toBe(kind)
    }
  })

  it('creates default designs that are valid and generate a build', () => {
    for (const kind of CABINET_KINDS) {
      const design = createDefaultDesign(kind)
      expect(design.kind).toBe(kind)
      expect(validateDesign(design)).toEqual([])
      expect(generateCabinet(design).panels.length).toBeGreaterThan(0)
    }
  })

  it('clamps idempotently and keeps the kind', () => {
    for (const kind of CABINET_KINDS) {
      const design = createDefaultDesign(kind)
      const once = clampDesign(design)
      const twice = clampDesign(once)
      expect(once.kind).toBe(kind)
      expect(twice).toEqual(once)
      // Defaults are inside their limits, so clamping must not change them.
      expect(once.params).toEqual(design.params)
    }
  })

  it('reports a footprint and a vertical extent for every kind', () => {
    for (const kind of CABINET_KINDS) {
      const design = createDefaultDesign(kind)
      const footprint = designFootprintSize(design)
      expect(footprint.widthMm).toBeGreaterThan(0)
      expect(footprint.depthMm).toBeGreaterThan(0)
      // footprint.ts must stay a pure delegation to the registry.
      expect(cabinetFootprintSize(design)).toEqual(footprint)

      const extent = designVerticalExtent(design)
      expect(extent.bottomMm).toBeGreaterThanOrEqual(0)
      expect(extent.topMm).toBeGreaterThan(extent.bottomMm)
    }
  })
})

describe('generateCabinet dispatch', () => {
  it('matches a direct call to the base cabinet generator', () => {
    const params = createDefaultBaseCabinetParams()
    expect(generateCabinet({ kind: 'base-cabinet', params })).toEqual(generateBaseCabinet(params))
  })

  it('stands the base cabinet on the floor', () => {
    const design = createDefaultDesign('base-cabinet')
    expect(designVerticalExtent(design)).toEqual({ bottomMm: 0, topMm: 720 })
  })
})
