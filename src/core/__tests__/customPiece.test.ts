import { describe, expect, it } from 'vitest'
import {
  BACK_RECESS_MM,
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  FRONT_GAP_MM,
  FRONT_REVEAL_MM
} from '@core/catalog/parts'
import {
  addPresetPanel,
  clampCustomPieceSpec,
  createDefaultCustomPieceSpec,
  customPieceFootprintSize,
  customPieceVerticalExtent,
  duplicatePanel,
  generateCustomPiece,
  nextPanelNumberFor,
  panelBox,
  panelBoxSize,
  panelExtent,
  panelRanges,
  removePanel,
  resizeEnvelope,
  validateCustomPieceSpec,
  CUSTOM_PIECE_LIMITS,
  FRONT_OVERLAY_ZONE_MM,
  MAX_PANELS_PER_PIECE,
  MAX_PIECE_NAME_LENGTH,
  PANEL_PRESETS,
  type CustomPanelSpec,
  type CustomPieceSpec,
  type PanelPreset
} from '@core/customPiece'
import type { PanelEdgeId } from '@core/panel'

const t = CARCASS_THICKNESS_MM

/** An 1800 × 500 × 400 TV unit envelope, empty. */
const envelope: CustomPieceSpec = {
  ...createDefaultCustomPieceSpec('TV-wand'),
  widthMm: 1800,
  heightMm: 500,
  depthMm: 400
}

function panel(overrides: Partial<CustomPanelSpec> = {}): CustomPanelSpec {
  return {
    id: 'panel-1',
    role: 'shelf',
    materialId: 'melamine-white-18',
    lengthMm: 1000,
    widthMm: 300,
    thicknessMm: 18,
    edgeBanding: { materialId: 'abs-edge', edges: ['length-1'] },
    orientation: 'xz',
    originMm: { x: 100, y: 200, z: 50 },
    ...overrides
  }
}

function withPanels(...panels: CustomPanelSpec[]): CustomPieceSpec {
  return { ...envelope, panels }
}

/** Applies presets in order and returns the resulting spec. */
function built(...presets: PanelPreset[]): CustomPieceSpec {
  let spec = envelope
  for (const preset of presets) {
    const change = addPresetPanel(spec, preset)
    if (change === null) {
      throw new Error(`preset ${preset} refused`)
    }
    spec = change.spec
  }
  return spec
}

function last(spec: CustomPieceSpec): CustomPanelSpec {
  return spec.panels[spec.panels.length - 1]
}

describe('panel geometry', () => {
  it('lays cut dimensions along the axes of each orientation', () => {
    const shape = { lengthMm: 700, widthMm: 400, thicknessMm: 18 }
    expect(panelBoxSize({ ...shape, orientation: 'yz' })).toEqual({ x: 18, y: 700, z: 400 })
    expect(panelBoxSize({ ...shape, orientation: 'xz' })).toEqual({ x: 700, y: 18, z: 400 })
    expect(panelBoxSize({ ...shape, orientation: 'xy' })).toEqual({ x: 400, y: 700, z: 18 })
  })

  it('derives the centre-based box from the corner-based origin', () => {
    const box = panelBox(panel({ orientation: 'xz', originMm: { x: 100, y: 200, z: 50 } }))
    expect(box).toEqual({ center: { x: 600, y: 209, z: 200 }, size: { x: 1000, y: 18, z: 300 } })
    expect(panelExtent(panel())).toEqual({
      min: { x: 100, y: 200, z: 50 },
      max: { x: 1100, y: 218, z: 350 }
    })
  })
})

describe('presets', () => {
  it('sizes every preset from the envelope and keeps it inside', () => {
    for (const preset of PANEL_PRESETS) {
      const change = addPresetPanel(envelope, preset)
      expect(change, preset).not.toBeNull()
      const spec = change!.spec
      expect(validateCustomPieceSpec(spec), preset).toEqual([])
      expect(spec.panels).toHaveLength(1)
      expect(spec.panels[0].id).toBe(change!.panelId)
    }
  })

  it('builds a carcass the way the catalog does', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back')
    const [left, right, top, bottom, back] = spec.panels
    expect(left).toMatchObject({ role: 'side-left', orientation: 'yz', lengthMm: 500, widthMm: 400 })
    expect(left.originMm).toEqual({ x: 0, y: 0, z: 0 })
    expect(right).toMatchObject({ role: 'side-right', orientation: 'yz' })
    expect(right.originMm).toEqual({ x: 1800 - t, y: 0, z: 0 })
    expect(top).toMatchObject({ role: 'top', orientation: 'xz', lengthMm: 1800 - 2 * t, widthMm: 400 })
    expect(top.originMm).toEqual({ x: t, y: 500 - t, z: 0 })
    expect(bottom.originMm).toEqual({ x: t, y: 0, z: 0 })
    expect(back).toMatchObject({
      role: 'back',
      orientation: 'xy',
      thicknessMm: BACK_THICKNESS_MM,
      materialId: 'hdf-back-3',
      edgeBanding: null
    })
    // Seated in the rebate: overlapping the carcass members 8 mm per side.
    expect(back.originMm).toEqual({ x: t - 8, y: t - 8, z: BACK_RECESS_MM })
    expect(back.widthMm).toBe(1800 - 2 * t + 16)
    expect(back.lengthMm).toBe(500 - 2 * t + 16)
    // Every carcass edge that shows is banded on the front edge only.
    for (const member of [left, right, top, bottom]) {
      expect(member.edgeBanding).toEqual({ materialId: 'abs-edge', edges: ['length-1'] })
    }
    // A third side goes left again rather than nowhere.
    expect(last(addPresetPanel(spec, 'side')!.spec).role).toBe('side-left')
  })

  it('fans shelves out into the tallest free gap', () => {
    const spec = built('top', 'bottom', 'shelf')
    const shelf = last(spec)
    // Centred between bottom (0..18) and top (482..500).
    expect(shelf.originMm.y).toBe((18 + 482) / 2 - t / 2)
    expect(shelf.originMm.x).toBe(t + 1)
    expect(shelf.lengthMm).toBe(1800 - 2 * t - 2)
    // The next one lands in the middle of one of the two halves, not on top of the first.
    const second = last(addPresetPanel(spec, 'shelf')!.spec)
    expect(second.originMm.y).not.toBe(shelf.originMm.y)
    expect(Math.abs(second.originMm.y - shelf.originMm.y)).toBeGreaterThan(100)
  })

  it('centres a divider in the widest free gap between uprights', () => {
    const spec = built('side', 'side', 'divider')
    const divider = last(spec)
    expect(divider).toMatchObject({ role: 'divider', orientation: 'yz', lengthMm: 500 - 2 * t })
    expect(divider.originMm.x).toBe(1800 / 2 - t / 2)
    const next = last(addPresetPanel(spec, 'divider')!.spec)
    expect(next.originMm.x).not.toBe(divider.originMm.x)
  })

  it('fills the remaining opening with a front', () => {
    const one = built('front')
    const front = last(one)
    expect(front).toMatchObject({
      role: 'front',
      orientation: 'xy',
      thicknessMm: DOOR_THICKNESS_MM,
      lengthMm: 500 - 2 * FRONT_REVEAL_MM,
      widthMm: 1800 - 2 * FRONT_REVEAL_MM
    })
    expect(front.originMm).toEqual({ x: FRONT_REVEAL_MM, y: FRONT_REVEAL_MM, z: 400 })
    expect(front.edgeBanding?.edges).toEqual(['length-1', 'length-2', 'width-1', 'width-2'])
    // In the overlay zone: valid, and outside the footprint.
    expect(validateCustomPieceSpec(one)).toEqual([])
    expect(panelExtent(front).max.z).toBe(400 + FRONT_OVERLAY_ZONE_MM)

    // Shrink the first door to the left half; the next front fills the rest.
    const halved: CustomPieceSpec = {
      ...one,
      panels: [{ ...front, widthMm: 896 }]
    }
    const second = last(addPresetPanel(halved, 'front')!.spec)
    expect(second.originMm.x).toBe(FRONT_REVEAL_MM + 896 + FRONT_GAP_MM)
    expect(second.originMm.x + second.widthMm).toBe(1800 - FRONT_REVEAL_MM)
  })

  it('refuses to exceed the panel limit', () => {
    let spec = envelope
    for (let i = 0; i < MAX_PANELS_PER_PIECE; i += 1) {
      spec = addPresetPanel(spec, 'shelf')!.spec
    }
    expect(spec.panels).toHaveLength(MAX_PANELS_PER_PIECE)
    expect(addPresetPanel(spec, 'shelf')).toBeNull()
    expect(duplicatePanel(spec, 'panel-1')).toBeNull()
  })
})

describe('duplicate and remove', () => {
  it('lands a copy flush along the thickness axis', () => {
    const spec = built('shelf')
    const shelf = spec.panels[0]
    const copy = last(duplicatePanel(spec, shelf.id)!.spec)
    expect(copy.id).toBe('panel-2')
    expect(copy.originMm).toEqual({ ...shelf.originMm, y: shelf.originMm.y + t })
    expect(copy).toMatchObject({ lengthMm: shelf.lengthMm, widthMm: shelf.widthMm, role: 'shelf' })
  })

  it('moves a side copy beside the original, and fronts sideways', () => {
    const side = built('side')
    const sideCopy = last(duplicatePanel(side, 'panel-1')!.spec)
    expect(sideCopy.originMm.x).toBe(t)

    const front = built('front')
    const halved: CustomPieceSpec = { ...front, panels: [{ ...front.panels[0], widthMm: 800 }] }
    const frontCopy = last(duplicatePanel(halved, 'panel-1')!.spec)
    expect(frontCopy.originMm.x).toBe(FRONT_REVEAL_MM + 800)
    expect(frontCopy.originMm.z).toBe(400)
  })

  it('copies in place when nothing fits, and null for an unknown panel', () => {
    const full = withPanels(
      panel({ orientation: 'xz', lengthMm: 1800, widthMm: 400, thicknessMm: 60, originMm: { x: 0, y: 0, z: 0 } })
    )
    const tall: CustomPieceSpec = { ...full, heightMm: 100 }
    const copy = last(duplicatePanel(tall, 'panel-1')!.spec)
    expect(copy.originMm).toEqual({ x: 0, y: 0, z: 0 })
    expect(duplicatePanel(tall, 'panel-9')).toBeNull()
  })

  it('removes by id and reuses nothing below the highest number', () => {
    const spec = built('side', 'side', 'top')
    const fewer = removePanel(spec, 'panel-2')
    expect(fewer.panels.map((entry) => entry.id)).toEqual(['panel-1', 'panel-3'])
    expect(nextPanelNumberFor(fewer)).toBe(4)
    expect(removePanel(spec, 'panel-99')).toEqual(spec)
  })
})

describe('validation', () => {
  it('accepts the default spec and a full carcass', () => {
    expect(validateCustomPieceSpec(createDefaultCustomPieceSpec())).toEqual([])
    expect(validateCustomPieceSpec(built('side', 'side', 'top', 'bottom', 'back', 'shelf', 'front'))).toEqual([])
  })

  it('checks the envelope, the mounting height and the name', () => {
    expect(validateCustomPieceSpec({ ...envelope, widthMm: 5000 })).toEqual([
      'widthMm must be between 100 and 4000 (got 5000)'
    ])
    expect(validateCustomPieceSpec({ ...envelope, mountingHeightMm: -1 })[0]).toMatch(/mountingHeightMm/)
    expect(validateCustomPieceSpec({ ...envelope, name: 'x'.repeat(MAX_PIECE_NAME_LENGTH + 1) })[0]).toMatch(
      /name must be at most 60 characters/
    )
    expect(validateCustomPieceSpec({ ...envelope, name: '' })).toEqual([])
  })

  it('names the axis a panel leaves the envelope on', () => {
    const wide = withPanels(panel({ lengthMm: 1800, originMm: { x: 18, y: 0, z: 0 } }))
    expect(validateCustomPieceSpec(wide)).toEqual([
      'panels[0] lies outside the envelope on x (18–1818 vs 0–1800)'
    ])
    const low = withPanels(panel({ originMm: { x: 0, y: -1, z: 0 } }))
    expect(validateCustomPieceSpec(low)[0]).toMatch(/outside the envelope on y \(-1–17/)
    // The space runs to D + the overlay zone on z.
    const deep = withPanels(panel({ widthMm: 419, originMm: { x: 0, y: 0, z: 0 } }))
    expect(validateCustomPieceSpec(deep)[0]).toMatch(/outside the envelope on z \(0–419 vs 0–418\)/)
  })

  it('allows the overlay zone in front but not beyond it', () => {
    const front = panel({ orientation: 'xy', lengthMm: 496, widthMm: 1796, originMm: { x: 2, y: 2, z: 400 } })
    expect(validateCustomPieceSpec(withPanels(front))).toEqual([])
    expect(validateCustomPieceSpec(withPanels({ ...front, originMm: { x: 2, y: 2, z: 401 } }))[0]).toMatch(
      /outside the envelope on z/
    )
  })

  it('checks ids, roles, orientations and materials', () => {
    const errors = validateCustomPieceSpec(
      withPanels(
        panel({ id: 'shelf-1' }),
        panel({ id: 'panel-1', role: 'drawer-box-side' as CustomPanelSpec['role'] }),
        panel({ id: 'panel-1', orientation: 'diagonal' as CustomPanelSpec['orientation'], materialId: '' })
      )
    )
    expect(errors).toContain('panels[0].id must look like panel-<n> (got "shelf-1")')
    expect(errors).toContain('panels[2].id is a duplicate of panels[1].id (panel-1)')
    expect(errors.find((error) => error.includes('panels[1].role must be one of'))).toContain('drawer-box-side')
    expect(errors.find((error) => error.includes('panels[2].orientation must be one of'))).toContain('diagonal')
    expect(errors).toContain('panels[2].materialId must not be empty')
  })

  it('checks sizes and edge banding', () => {
    expect(validateCustomPieceSpec(withPanels(panel({ thicknessMm: 0 })))[0]).toMatch(
      /panels\[0\]\.thicknessMm must be between 1 and 60/
    )
    expect(validateCustomPieceSpec(withPanels(panel({ lengthMm: 5 })))[0]).toMatch(
      /panels\[0\]\.lengthMm must be between 10 and 4000/
    )
    expect(validateCustomPieceSpec(withPanels(panel({ edgeBanding: { materialId: 'abs-edge', edges: [] } })))).toEqual([
      'panels[0].edgeBanding.edges must name at least one edge (use null for no banding)'
    ])
    const badEdge = {
      materialId: 'abs-edge',
      edges: ['top', 'length-1', 'length-1'] as unknown as readonly PanelEdgeId[]
    }
    const errors = validateCustomPieceSpec(withPanels(panel({ edgeBanding: badEdge })))
    expect(errors[0]).toMatch(/edges must only hold length-1, length-2, width-1, width-2 \(got top\)/)
    expect(errors[1]).toBe('panels[0].edgeBanding.edges lists length-1 twice')
  })

  it('checks hardware quantities and duplicates', () => {
    const spec: CustomPieceSpec = {
      ...envelope,
      hardware: [
        { materialId: 'hinge-standard', quantity: 4 },
        { materialId: 'hinge-standard', quantity: 2.5 },
        { materialId: '', quantity: 0 }
      ]
    }
    expect(validateCustomPieceSpec(spec)).toEqual([
      'hardware[1].materialId is a duplicate (hinge-standard)',
      'hardware[1].quantity must be an integer between 1 and 999 (got 2.5)',
      'hardware[2].materialId must not be empty',
      'hardware[2].quantity must be an integer between 1 and 999 (got 0)'
    ])
  })

  it('refuses more panels than the limit', () => {
    const panels = Array.from({ length: MAX_PANELS_PER_PIECE + 1 }, (_, i) =>
      panel({ id: `panel-${i + 1}` })
    )
    expect(validateCustomPieceSpec(withPanels(...panels))).toEqual([
      `panels must hold at most ${MAX_PANELS_PER_PIECE} panels (got ${MAX_PANELS_PER_PIECE + 1})`
    ])
  })
})

describe('clamping', () => {
  it('forces numeric fields into range and truncates the name', () => {
    const clamped = clampCustomPieceSpec({
      ...envelope,
      name: 'x'.repeat(80),
      widthMm: 9000,
      heightMm: 10,
      mountingHeightMm: 3000,
      hardware: [{ materialId: 'hinge-standard', quantity: 0 }]
    })
    expect(clamped.name).toHaveLength(MAX_PIECE_NAME_LENGTH)
    expect(clamped.widthMm).toBe(CUSTOM_PIECE_LIMITS.widthMm.max)
    expect(clamped.heightMm).toBe(CUSTOM_PIECE_LIMITS.heightMm.min)
    expect(clamped.mountingHeightMm).toBe(CUSTOM_PIECE_LIMITS.mountingHeightMm.max)
    expect(clamped.hardware).toEqual([{ materialId: 'hinge-standard', quantity: 1 }])
  })

  it('never lets a panel stick out of a smaller envelope', () => {
    const spec = built('side', 'side', 'top')
    const narrower = clampCustomPieceSpec({ ...spec, widthMm: 1600 })
    expect(validateCustomPieceSpec(narrower)).toEqual([])
    for (const member of narrower.panels) {
      expect(panelExtent(member).max.x).toBeLessThanOrEqual(1600)
    }
  })

  it('keeps a panel inside when its own size or origin is edited', () => {
    const spec = built('shelf')
    const shelf = spec.panels[0]
    const pushed = clampCustomPieceSpec({
      ...spec,
      panels: [{ ...shelf, originMm: { x: 1500, y: 700, z: -20 }, lengthMm: 2400 }]
    })
    const fitted = pushed.panels[0]
    expect(fitted.lengthMm).toBe(1800)
    expect(fitted.originMm).toEqual({ x: 0, y: 500 - t, z: 0 })
    expect(validateCustomPieceSpec(pushed)).toEqual([])
  })

  it('is idempotent and rounds to whole millimetres', () => {
    const spec = withPanels(panel({ lengthMm: 999.6, originMm: { x: 10.4, y: 20, z: 30 } }))
    const once = clampCustomPieceSpec(spec)
    expect(once.panels[0].lengthMm).toBe(1000)
    expect(once.panels[0].originMm.x).toBe(10)
    expect(clampCustomPieceSpec(once)).toEqual(once)
  })
})

describe('panelRanges', () => {
  it('bounds sizes by the axis extent and origins by what is left', () => {
    const shelf = built('shelf').panels[0]
    const ranges = panelRanges(envelope, shelf)
    expect(ranges.lengthMaxMm).toBe(1800)
    expect(ranges.widthMaxMm).toBe(400 + FRONT_OVERLAY_ZONE_MM)
    expect(ranges.originMaxMm).toEqual({
      x: 1800 - shelf.lengthMm,
      y: 500 - t,
      z: 418 - shelf.widthMm
    })
    const side = built('side').panels[0]
    expect(panelRanges(envelope, side).lengthMaxMm).toBe(500)
    expect(panelRanges(envelope, side).originMaxMm.x).toBe(1800 - t)
  })
})

describe('resizeEnvelope', () => {
  const carcass = built('side', 'side', 'top', 'bottom', 'back', 'shelf', 'front')

  it('takes the attached panels along when the width shrinks', () => {
    const narrower = resizeEnvelope(carcass, { widthMm: 1600 })
    const [left, right, top, bottom, back, shelf, front] = narrower.panels
    expect(narrower.widthMm).toBe(1600)
    expect(left.originMm.x).toBe(0)
    expect(right.originMm.x).toBe(1600 - t)
    expect(top.lengthMm).toBe(1600 - 2 * t)
    expect(bottom.lengthMm).toBe(1600 - 2 * t)
    expect(back.widthMm).toBe(1600 - 2 * t + 16)
    expect(shelf.lengthMm).toBe(1600 - 2 * t - 2)
    expect(front.widthMm).toBe(1600 - 2 * FRONT_REVEAL_MM)
    expect(validateCustomPieceSpec(narrower)).toEqual([])
  })

  it('takes them along when it grows, on every axis', () => {
    const bigger = resizeEnvelope(carcass, { widthMm: 2000, heightMm: 700, depthMm: 500 })
    const [left, right, top, , back, shelf, front] = bigger.panels
    expect(right.originMm.x).toBe(2000 - t)
    expect(left).toMatchObject({ lengthMm: 700, widthMm: 500 })
    expect(top).toMatchObject({ lengthMm: 2000 - 2 * t, widthMm: 500 })
    expect(top.originMm.y).toBe(700 - t)
    expect(back).toMatchObject({ lengthMm: 700 - 2 * t + 16, widthMm: 2000 - 2 * t + 16 })
    expect(back.originMm.z).toBe(BACK_RECESS_MM)
    // The shelf keeps its 20 mm front setback and its clearances.
    expect(shelf.widthMm).toBe(carcass.panels[5].widthMm + 100)
    expect(front.originMm).toEqual({ x: FRONT_REVEAL_MM, y: FRONT_REVEAL_MM, z: 500 })
    expect(front).toMatchObject({ lengthMm: 700 - 2 * FRONT_REVEAL_MM, widthMm: 2000 - 2 * FRONT_REVEAL_MM })
    expect(validateCustomPieceSpec(bigger)).toEqual([])
  })

  it('leaves unattached panels where they are', () => {
    const half = panel({ id: 'panel-1', lengthMm: 800, originMm: { x: 18, y: 250, z: 0 } })
    const divider = panel({ id: 'panel-2', orientation: 'yz', lengthMm: 464, widthMm: 396, originMm: { x: 891, y: 18, z: 4 } })
    const spec = withPanels(half, divider)
    const wider = resizeEnvelope(spec, { widthMm: 2400 })
    expect(wider.panels[0]).toEqual(half)
    expect(wider.panels[1]).toEqual(divider)
    // Shrinking below them clamps them in like any other edit.
    const narrower = resizeEnvelope(spec, { widthMm: 500 })
    expect(validateCustomPieceSpec(narrower)).toEqual([])
    expect(narrower.panels[1].originMm.x).toBe(500 - t)
  })

  it('clamps the envelope itself and ignores an empty patch', () => {
    expect(resizeEnvelope(carcass, { widthMm: 9000 }).widthMm).toBe(CUSTOM_PIECE_LIMITS.widthMm.max)
    expect(resizeEnvelope(carcass, {})).toEqual(carcass)
  })
})

describe('generateCustomPiece', () => {
  it('hands the panels through verbatim with their boxes, and the hardware verbatim', () => {
    const spec: CustomPieceSpec = {
      ...built('side', 'side', 'shelf'),
      hardware: [{ materialId: 'hinge-standard', quantity: 4 }]
    }
    const build = generateCustomPiece(spec)
    expect(build.panels).toHaveLength(3)
    build.panels.forEach((generated, index) => {
      const source = spec.panels[index]
      expect(generated).toEqual({
        id: source.id,
        role: source.role,
        materialId: source.materialId,
        lengthMm: source.lengthMm,
        widthMm: source.widthMm,
        thicknessMm: source.thicknessMm,
        edgeBanding: source.edgeBanding,
        box: panelBox(source)
      })
    })
    expect(build.hardware).toEqual([{ materialId: 'hinge-standard', quantity: 4 }])
    expect(build.boundingSizeMm).toEqual({ x: 1800, y: 500, z: 400 })
  })

  it('grows the bounding size by the fronts, never the footprint', () => {
    const spec = built('side', 'front')
    expect(generateCustomPiece(spec).boundingSizeMm.z).toBe(400 + DOOR_THICKNESS_MM)
    expect(customPieceFootprintSize(spec)).toEqual({ widthMm: 1800, depthMm: 400 })
  })

  it('generates an empty piece and refuses an invalid one', () => {
    const empty = generateCustomPiece(envelope)
    expect(empty.panels).toEqual([])
    expect(empty.hardware).toEqual([])
    expect(() => generateCustomPiece({ ...envelope, widthMm: 5000 })).toThrow(/invalid custom piece/)
  })

  it('stands on the floor at 0 and hangs at its mounting height', () => {
    expect(customPieceVerticalExtent(envelope)).toEqual({ bottomMm: 0, topMm: 500 })
    expect(customPieceVerticalExtent({ ...envelope, mountingHeightMm: 1200 })).toEqual({
      bottomMm: 1200,
      topMm: 1700
    })
  })
})
