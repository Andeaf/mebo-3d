import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type CabinetDesign } from '@core/cabinet'
import { createDefaultDesign, sameDesign } from '@core/catalog/registry'
import { addPresetPanel, createDefaultCustomPieceSpec, type CustomPieceSpec } from '@core/customPiece'

function piece(...presets: Parameters<typeof addPresetPanel>[1][]): CustomPieceSpec {
  let spec = createDefaultCustomPieceSpec('Kastje')
  for (const preset of presets) {
    spec = addPresetPanel(spec, preset)!.spec
  }
  return spec
}

describe('sameDesign compares values, not references', () => {
  it('a catalog design rebuilt with the same params is the same design', () => {
    const design = createDefaultDesign('base-cabinet')
    const rebuilt: CabinetDesign = { kind: 'base-cabinet', params: createDefaultBaseCabinetParams() }
    expect(rebuilt).not.toBe(design)
    expect(sameDesign(design, rebuilt)).toBe(true)
    if (design.kind === 'base-cabinet') {
      expect(sameDesign(design, { kind: 'base-cabinet', params: { ...design.params, doorCount: 1 } })).toBe(false)
    }
    expect(sameDesign(design, createDefaultDesign('drawer-cabinet'))).toBe(false)
  })

  it('a custom piece is compared through its panels and hardware, in order', () => {
    const spec = piece('side', 'side', 'shelf')
    const copy: CustomPieceSpec = JSON.parse(JSON.stringify(spec))
    expect(sameDesign({ kind: 'custom-piece', spec }, { kind: 'custom-piece', spec: copy })).toBe(true)
    const moved: CustomPieceSpec = {
      ...spec,
      panels: spec.panels.map((panel, index) => (index === 2 ? { ...panel, originMm: { ...panel.originMm, y: 1 } } : panel))
    }
    expect(sameDesign({ kind: 'custom-piece', spec }, { kind: 'custom-piece', spec: moved })).toBe(false)
    const reordered: CustomPieceSpec = { ...spec, panels: [spec.panels[1], spec.panels[0], spec.panels[2]] }
    expect(sameDesign({ kind: 'custom-piece', spec }, { kind: 'custom-piece', spec: reordered })).toBe(false)
    const withHinges: CustomPieceSpec = { ...spec, hardware: [{ materialId: 'hinge-standard', quantity: 2 }] }
    expect(sameDesign({ kind: 'custom-piece', spec }, { kind: 'custom-piece', spec: withHinges })).toBe(false)
  })

  it('ignores the order of keys, not their presence', () => {
    const design = createDefaultDesign('wall-cabinet')
    const entries = Object.entries(design.params)
    const reversed = Object.fromEntries([...entries].reverse())
    expect(sameDesign(design, { kind: 'wall-cabinet', params: reversed } as unknown as CabinetDesign)).toBe(true)
    const fewer = Object.fromEntries(entries.filter(([key]) => key !== 'shelfCount'))
    expect(sameDesign(design, { kind: 'wall-cabinet', params: fewer } as unknown as CabinetDesign)).toBe(false)
  })
})
