import { describe, expect, it } from 'vitest'
import { CARCASS_THICKNESS_MM } from '@core/catalog/parts'
import {
  addDrawer,
  addPresetPanel,
  createDefaultCustomPieceSpec,
  type CustomPanelSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import { chainAxesOf, dimensionChain, dimensionChains } from '@core/dimensionChain'

const t = CARCASS_THICKNESS_MM

/** A 1200 × 600 × 400 piece with two sides, a top, a bottom and a back. */
function carcass(): CustomPieceSpec {
  let spec = createDefaultCustomPieceSpec('kast')
  for (const preset of ['side', 'side', 'top', 'bottom', 'back'] as const) {
    spec = addPresetPanel(spec, preset)!.spec
  }
  return spec
}

function panel(spec: CustomPieceSpec, id: string): CustomPanelSpec {
  return spec.panels.find((candidate) => candidate.id === id)!
}

function withPanel(spec: CustomPieceSpec, id: string, patch: Partial<CustomPanelSpec>): CustomPieceSpec {
  return { ...spec, panels: spec.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
}

const lengths = (gaps: readonly { lengthMm: number }[]): number[] => gaps.map((gap) => gap.lengthMm)

describe('chainAxesOf', () => {
  it('is the thickness axis of a panel, both face axes of a drawer, nothing for an unknown id', () => {
    const spec = addDrawer(carcass())!.spec
    expect(chainAxesOf(spec, 'panel-1')).toEqual(['x']) // a side (yz)
    expect(chainAxesOf(spec, 'panel-3')).toEqual(['y']) // the top (xz)
    expect(chainAxesOf(spec, 'panel-5')).toEqual(['z']) // the back (xy)
    expect(chainAxesOf(spec, 'drawer-1')).toEqual(['x', 'y'])
    expect(chainAxesOf(spec, 'panel-99')).toEqual([])
    expect(chainAxesOf(spec, 'nothing')).toEqual([])
  })
})

describe('dimensionChain', () => {
  it('reads a divider row: side | gap | divider | gap | divider | gap | side, the own gaps flagged', () => {
    // Two dividers placed by hand at thirds of the inner width (1164 inside).
    let spec = carcass()
    spec = addPresetPanel(spec, 'divider')!.spec // panel-6, centred
    spec = addPresetPanel(spec, 'divider')!.spec // panel-7, in the widest gap
    const inner = 1200 - 2 * t
    spec = withPanel(spec, 'panel-6', { originMm: { x: t + (inner - 2 * t) / 3, y: t, z: 4 } })
    spec = withPanel(spec, 'panel-7', { originMm: { x: t + (2 * (inner - 2 * t)) / 3 + t, y: t, z: 4 } })
    const chain = dimensionChain(spec, 'panel-6', 'x')!
    expect(chain.fromMm).toBe(0)
    expect(chain.toMm).toBe(1200)
    expect(lengths(chain.gaps)).toEqual([376, 376, 376])
    expect(chain.gaps.map((gap) => [gap.beforeId, gap.afterId])).toEqual([
      ['panel-1', 'panel-6'],
      ['panel-6', 'panel-7'],
      ['panel-7', 'panel-2']
    ])
    expect(chain.gaps.map((gap) => gap.own)).toEqual([true, true, false])
    // Read from the other divider, the same row with the other own flags.
    expect(dimensionChain(spec, 'panel-7', 'x')!.gaps.map((gap) => gap.own)).toEqual([false, true, true])
  })

  it('gives no zero-length gap at a flush side and no gap where members pass through each other', () => {
    const spec = addPresetPanel(carcass(), 'divider')!.spec
    const chain = dimensionChain(spec, 'panel-6', 'x')!
    // Sides flush with the faces: two gaps only, not four.
    expect(chain.gaps).toHaveLength(2)
    expect(chain.gaps[0]).toMatchObject({ fromMm: t, beforeId: 'panel-1', afterId: 'panel-6', own: true })
    expect(chain.gaps[1]).toMatchObject({ toMm: 1200 - t, beforeId: 'panel-6', afterId: 'panel-2', own: true })
    expect(chain.gaps[0].lengthMm + chain.gaps[1].lengthMm + t).toBe(1200 - 2 * t)
    // A second divider pushed into the first: still just two gaps, around the pair.
    const overlapped = withPanel(
      addPresetPanel(spec, 'divider')!.spec,
      'panel-7',
      { originMm: { ...panel(spec, 'panel-6').originMm, x: panel(spec, 'panel-6').originMm.x + 10 } }
    )
    expect(dimensionChain(overlapped, 'panel-6', 'x')!.gaps).toHaveLength(2)
  })

  it('reads shelf heights between the bottom, the shelves and the top', () => {
    let spec = addPresetPanel(carcass(), 'shelf')!.spec // panel-6
    spec = addPresetPanel(spec, 'shelf')!.spec // panel-7
    const chain = dimensionChain(spec, 'panel-6', 'y')!
    expect(chain.toMm).toBe(600)
    expect(chain.gaps).toHaveLength(3)
    expect(chain.gaps.map((gap) => gap.beforeId)).toEqual(['panel-4', expect.any(String), expect.any(String)])
    expect(chain.gaps[2].afterId).toBe('panel-3')
    const total = chain.gaps.reduce((sum, gap) => sum + gap.lengthMm, 0)
    expect(total).toBe(600 - 4 * t)
  })

  it('ignores a parallel member that does not overlap the element in cross-section', () => {
    let spec = addPresetPanel(carcass(), 'divider')!.spec // panel-6 at the centre
    spec = addPresetPanel(spec, 'shelf')!.spec // panel-7 spans the full width → clashes with the divider
    // A left-half shelf and a right-half shelf at different heights.
    spec = withPanel(spec, 'panel-7', { lengthMm: 500, originMm: { x: t + 1, y: 200, z: 6 } })
    spec = addPresetPanel(spec, 'shelf')!.spec // panel-8
    spec = withPanel(spec, 'panel-8', { lengthMm: 500, originMm: { x: 1200 - t - 1 - 500, y: 400, z: 6 } })
    const chain = dimensionChain(spec, 'panel-7', 'y')!
    // The right shelf is not in the left shelf's chain: bottom | 182 | shelf | 364 | top.
    expect(lengths(chain.gaps)).toEqual([200 - t, 600 - t - (200 + t)])
    expect(chain.gaps.every((gap) => gap.own)).toBe(true)
  })

  it('reads depths for a back panel: the back, then the carcass face, with a front as the last member', () => {
    const spec = addPresetPanel(carcass(), 'front')!.spec // panel-6 at z = 400
    const back = dimensionChain(spec, 'panel-5', 'z')!
    // 1 mm recess behind the back, then 396 to the front standing on the face.
    expect(back.gaps).toHaveLength(2)
    expect(back.gaps[0]).toMatchObject({ fromMm: 0, toMm: 1, beforeId: null, afterId: 'panel-5', own: true })
    expect(back.gaps[1]).toMatchObject({ fromMm: 4, toMm: 400, beforeId: 'panel-5', afterId: 'panel-6', own: true })
    // Without the front the last gap runs to the carcass face.
    const noFront = dimensionChain(carcass(), 'panel-5', 'z')!
    expect(noFront.gaps[1]).toMatchObject({ fromMm: 4, toMm: 400, afterId: null })
  })

  it('reads a drawer stack: the 3 mm gaps between fronts on y, the reveals to the sides on x', () => {
    let spec = carcass()
    spec = addDrawer(spec)!.spec // drawer-1 at the top
    spec = addDrawer(spec)!.spec // drawer-2 under it
    const chains = dimensionChains(spec, 'drawer-2')
    expect(chains.map((chain) => chain.axis)).toEqual(['x', 'y'])
    const [x, y] = chains
    // Fronts span the face between the 2 mm reveals.
    expect(lengths(x.gaps)).toEqual([2, 2])
    expect(x.gaps.every((gap) => gap.own)).toBe(true)
    // Top reveal | drawer-1 | 3 | drawer-2 | the rest of the face.
    expect(y.gaps.map((gap) => [gap.lengthMm, gap.beforeId, gap.afterId])).toEqual([
      [600 - 2 - 150 - 3 - 150, null, 'drawer-2'],
      [3, 'drawer-2', 'drawer-1'],
      [2, 'drawer-1', null]
    ])
    expect(y.gaps.map((gap) => gap.own)).toEqual([true, true, false])
  })

  it('has one gap face to face when the element has no neighbour, and none when it fills the axis', () => {
    const spec = addPresetPanel(createDefaultCustomPieceSpec(), 'divider')!.spec
    const chain = dimensionChain(spec, 'panel-1', 'x')!
    expect(chain.gaps).toHaveLength(2)
    expect(chain.gaps[0]).toMatchObject({ fromMm: 0, beforeId: null, afterId: 'panel-1', own: true })
    expect(chain.gaps[1]).toMatchObject({ toMm: 1200, beforeId: 'panel-1', afterId: null, own: true })
    const wall = withPanel(spec, 'panel-1', { thicknessMm: 60, originMm: { x: 0, y: 0, z: 0 } })
    const full = { ...wall, widthMm: 60 }
    expect(dimensionChain(full, 'panel-1', 'x')!.gaps).toEqual([])
  })

  it('is null for an unknown element and empty for an id of another shape', () => {
    expect(dimensionChain(carcass(), 'panel-42', 'x')).toBeNull()
    expect(dimensionChain(carcass(), 'drawer-1', 'y')).toBeNull()
    expect(dimensionChains(carcass(), 'cab-1')).toEqual([])
  })
})
