import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type CabinetDesign } from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'
import {
  CABINET_KINDS,
  CABINET_REGISTRY,
  clampDesign,
  createDefaultDesign,
  designFootprintSize,
  designMountingHeightMm,
  designVerticalExtent,
  designWithMountingHeightMm,
  designWorktopEligible,
  generateCabinet,
  isCabinetKind,
  isCustomPieceDesign,
  validateDesign
} from '@core/catalog/registry'
import {
  createDefaultCustomPieceSpec,
  generateCustomPiece,
  type CustomPieceSpec
} from '@core/customPiece'
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

  it('declares worktop eligibility per kind, and the dispatch helper reads it', () => {
    for (const kind of CABINET_KINDS) {
      expect(typeof CABINET_REGISTRY[kind].worktopEligible).toBe('boolean')
      expect(designWorktopEligible(createDefaultDesign(kind))).toBe(
        CABINET_REGISTRY[kind].worktopEligible
      )
    }
    // Floor-standing kitchen carcasses carry a worktop; the tall cabinet is
    // the full height itself and the wall cabinet hangs above it.
    expect(CABINET_REGISTRY['base-cabinet'].worktopEligible).toBe(true)
    expect(CABINET_REGISTRY['drawer-cabinet'].worktopEligible).toBe(true)
    expect(CABINET_REGISTRY['wall-cabinet'].worktopEligible).toBe(false)
    expect(CABINET_REGISTRY['tall-cabinet'].worktopEligible).toBe(false)
  })

  it('declares mounting per kind (null or an accessor pair), and the helpers read and write it', () => {
    for (const kind of CABINET_KINDS) {
      const { mounting } = CABINET_REGISTRY[kind]
      expect(
        mounting === null ||
          (typeof mounting.heightOf === 'function' && typeof mounting.withHeight === 'function')
      ).toBe(true)
      const design = createDefaultDesign(kind)
      expect(designMountingHeightMm(design)).toBe(
        mounting === null ? null : designVerticalExtent(design).bottomMm
      )
      const hung = designWithMountingHeightMm(design, 1000)
      if (mounting === null) {
        expect(hung).toBeNull()
      } else {
        expect(hung).not.toBeNull()
        expect(hung !== null && designVerticalExtent(hung).bottomMm).toBe(1000)
        expect(hung !== null && hung.kind).toBe(kind)
      }
    }
    // The wall cabinet hangs; the three floor kinds do not.
    expect(CABINET_REGISTRY['wall-cabinet'].mounting).not.toBeNull()
    expect(CABINET_REGISTRY['base-cabinet'].mounting).toBeNull()
    expect(CABINET_REGISTRY['tall-cabinet'].mounting).toBeNull()
    expect(CABINET_REGISTRY['drawer-cabinet'].mounting).toBeNull()
  })
})

describe('custom pieces dispatch outside the registry', () => {
  const spec: CustomPieceSpec = {
    ...createDefaultCustomPieceSpec('Dressoir'),
    widthMm: 1500,
    heightMm: 700,
    depthMm: 450,
    mountingHeightMm: 300
  }
  const design: CabinetDesign = { kind: 'custom-piece', spec }

  it('is not a catalog kind', () => {
    expect(CABINET_KINDS as readonly string[]).not.toContain('custom-piece')
    expect(isCabinetKind('custom-piece')).toBe(false)
    expect(isCustomPieceDesign(design)).toBe(true)
    expect(isCustomPieceDesign(createDefaultDesign('base-cabinet'))).toBe(false)
  })

  it('hangs when its mounting height is above zero, stands on the floor at zero', () => {
    expect(designMountingHeightMm(design)).toBe(300)
    const hung = designWithMountingHeightMm(design, 500)
    expect(hung !== null && hung.kind === 'custom-piece' && hung.spec.mountingHeightMm).toBe(500)
    const standing: CabinetDesign = { kind: 'custom-piece', spec: { ...spec, mountingHeightMm: 0 } }
    expect(designMountingHeightMm(standing)).toBeNull()
    expect(designWithMountingHeightMm(standing, 500)).toBeNull()
  })

  it('gets no worktop in Phase 7, standing or hanging', () => {
    expect(designWorktopEligible(design)).toBe(false)
    expect(
      designWorktopEligible({ kind: 'custom-piece', spec: { ...spec, mountingHeightMm: 0 } })
    ).toBe(false)
  })

  it('answers the five helpers from its spec', () => {
    expect(generateCabinet(design)).toEqual(generateCustomPiece(spec))
    expect(validateDesign(design)).toEqual([])
    expect(validateDesign({ kind: 'custom-piece', spec: { ...spec, widthMm: 5 } })[0]).toMatch(/widthMm/)
    expect(designFootprintSize(design)).toEqual({ widthMm: 1500, depthMm: 450 })
    expect(cabinetFootprintSize(design)).toEqual({ widthMm: 1500, depthMm: 450 })
    expect(designVerticalExtent(design)).toEqual({ bottomMm: 300, topMm: 1000 })
    const clamped = clampDesign({ kind: 'custom-piece', spec: { ...spec, depthMm: 5000 } })
    expect(clamped.kind).toBe('custom-piece')
    expect(clamped.kind === 'custom-piece' && clamped.spec.depthMm).toBe(1000)
    expect(clampDesign(design)).toEqual(design)
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
