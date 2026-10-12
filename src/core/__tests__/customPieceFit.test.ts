import { describe, expect, it } from 'vitest'
import { BACK_RECESS_MM, BACK_THICKNESS_MM, CARCASS_THICKNESS_MM } from '@core/catalog/parts'
import {
  addDrawer,
  addPresetPanel,
  createDefaultCustomPieceSpec,
  interiorBounds,
  movePanel,
  nudgePanel,
  panelExtent,
  resizeEnvelope,
  type CustomPanelSpec,
  type CustomPieceSpec,
  type PanelPreset
} from '@core/customPiece'
import { commitPieceEdit, fitInteriorPanels, interiorFitPending } from '@core/customPieceFit'

const t = CARCASS_THICKNESS_MM
/** The back's front face: recess + thickness = 4. */
const BACK_FACE = BACK_RECESS_MM + BACK_THICKNESS_MM

/** Presets in order on the default 1200 × 600 × 400 piece. */
function built(...presets: PanelPreset[]): CustomPieceSpec {
  let spec = createDefaultCustomPieceSpec('kast')
  for (const preset of presets) {
    const change = addPresetPanel(spec, preset)
    if (change === null) {
      throw new Error(`preset ${preset} refused`)
    }
    spec = change.spec
  }
  return spec
}

function panelOf(spec: CustomPieceSpec, id: string): CustomPanelSpec {
  const panel = spec.panels.find((candidate) => candidate.id === id)
  if (panel === undefined) {
    throw new Error(`no panel ${id}`)
  }
  return panel
}

/** The editor's field edit: a new value on one panel, through the fit. */
function edit(spec: CustomPieceSpec, id: string, patch: Partial<CustomPanelSpec>): CustomPieceSpec {
  const after = { ...spec, panels: spec.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)) }
  return commitPieceEdit(spec, after)
}

describe('interiorBounds', () => {
  it('is the shell’s inner faces for a full carcass: sides, bottom/top, the back’s front face to D', () => {
    const bounds = interiorBounds(built('side', 'side', 'top', 'bottom', 'back'))
    expect(bounds).toEqual({ min: { x: t, y: t, z: BACK_FACE }, max: { x: 1200 - t, y: 600 - t, z: 400 } })
  })

  it('leaves the envelope face where a shell panel is missing (partial shell), the whole envelope without one', () => {
    expect(interiorBounds(built('side', 'top'))).toEqual({
      min: { x: t, y: 0, z: 0 },
      max: { x: 1200, y: 600 - t, z: 400 }
    })
    expect(interiorBounds(createDefaultCustomPieceSpec())).toEqual({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1200, y: 600, z: 400 }
    })
  })

  it('ignores fronts and drawers, takes the innermost face of two panels in one role, and survives an inverted pair', () => {
    let spec = built('side', 'side', 'front')
    spec = addDrawer(spec)!.spec
    expect(interiorBounds(spec).max.z).toBe(400)
    // A second, thicker left side standing inside the first.
    const thick: CustomPanelSpec = { ...panelOf(spec, 'panel-1'), id: 'panel-9', thicknessMm: 40, originMm: { x: 10, y: 0, z: 0 } }
    expect(interiorBounds({ ...spec, panels: [...spec.panels, thick] }).min.x).toBe(50)
    // A side-left moved to the right of the side-right: the envelope on x.
    const inverted = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-1' ? { ...p, originMm: { x: 1190, y: 0, z: 0 } } : p)) }
    expect(interiorBounds(inverted).min.x).toBe(0)
    expect(interiorBounds(inverted).max.x).toBe(1200)
  })
})

describe('presets size interior panels to the interior bounds', () => {
  it('a divider stops at the back’s front face, not at the envelope; without a back it reaches the rear face', () => {
    const withBack = panelOf(built('side', 'side', 'top', 'bottom', 'back', 'divider'), 'panel-6')
    expect(panelExtent(withBack)).toMatchObject({ min: { y: t, z: BACK_FACE }, max: { y: 600 - t, z: 400 } })
    const noBack = panelOf(built('side', 'side', 'divider'), 'panel-3')
    expect(panelExtent(noBack)).toMatchObject({ min: { y: 0, z: 0 }, max: { y: 600, z: 400 } })
  })

  it('a shelf spans the interior with its clearances; without sides, the envelope less the clearances', () => {
    const inside = panelOf(built('side', 'side', 'back', 'shelf'), 'panel-4')
    expect(panelExtent(inside)).toMatchObject({ min: { x: t + 1, z: BACK_FACE + 2 }, max: { x: 1200 - t - 1, z: 380 } })
    const open = panelOf(built('shelf'), 'panel-1')
    expect(panelExtent(open)).toMatchObject({ min: { x: 1, z: 2 }, max: { x: 1199, z: 380 } })
  })
})

describe('commitPieceEdit: a shell change re-fits the interior on the bounds that moved', () => {
  it('adding a back cuts a divider that would intersect it and takes an attached one along', () => {
    // Two dividers made before the back: one from z 0 (intersects the coming
    // back), one standing 10 mm off the rear face (attached to the old bound 0).
    let spec = built('side', 'side', 'top', 'bottom', 'divider', 'divider')
    spec = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-6' ? { ...p, widthMm: 380, originMm: { ...p.originMm, z: 10 } } : p)) }
    expect(panelExtent(panelOf(spec, 'panel-5')).min.z).toBe(0)
    const added = addPresetPanel(spec, 'back')!.spec
    const fitted = commitPieceEdit(spec, added)
    // Cut to the back's front face: origin 4, 4 mm shorter, the front edge where it was.
    expect(panelExtent(panelOf(fitted, 'panel-5'))).toMatchObject({ min: { z: BACK_FACE }, max: { z: 400 } })
    expect(panelOf(fitted, 'panel-5').widthMm).toBe(400 - BACK_FACE)
    // Attached (10 ≤ 20): keeps its 10 mm to the face that moved from 0 to 4.
    expect(panelExtent(panelOf(fitted, 'panel-6'))).toMatchObject({ min: { z: BACK_FACE + 10 }, max: { z: 390 } })
    // The shell and the drawers are not touched; the bounds themselves are the new ones.
    expect(panelOf(fitted, 'panel-1')).toEqual(panelOf(added, 'panel-1'))
    expect(interiorBounds(fitted).min.z).toBe(BACK_FACE)
  })

  it('a moved back takes the dividers standing against its old face along', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back', 'divider')
    // The back moved 20 mm forward (a deeper rebate): the divider follows.
    const fitted = edit(spec, 'panel-5', { originMm: { ...panelOf(spec, 'panel-5').originMm, z: 21 } })
    expect(panelExtent(panelOf(fitted, 'panel-6'))).toMatchObject({ min: { z: 24 }, max: { z: 400 } })
    expect(panelOf(fitted, 'panel-6').widthMm).toBe(376)
  })

  it('a re-thicknessed side claims its space: the shelf keeps its 1 mm clearance to the new inner face', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf')
    const fitted = edit(spec, 'panel-1', { thicknessMm: 22 })
    const shelf = panelOf(fitted, 'panel-6')
    expect(panelExtent(shelf).min.x).toBe(23)
    expect(panelExtent(shelf).max.x).toBe(1200 - t - 1) // the right end did not move
    expect(shelf.lengthMm).toBe(1200 - t - 1 - 23)
  })

  it('a user-shortened shelf (a 40 mm gap) is not touched by a side that moves', () => {
    let spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf')
    spec = edit(spec, 'panel-6', { lengthMm: panelOf(spec, 'panel-6').lengthMm - 39 }) // right gap 40
    const before = panelOf(spec, 'panel-6')
    // The right side moves 10 mm inward (a thicker side would do the same).
    const fitted = edit(spec, 'panel-2', { originMm: { x: 1200 - t - 10, y: 0, z: 0 } })
    expect(panelOf(fitted, 'panel-6')).toEqual(before)
  })

  it('the override stands: a divider enlarged through the back survives a move of the top, and is cut by a move of the back', () => {
    let spec = built('side', 'side', 'top', 'bottom', 'back', 'divider')
    // Through the fields: the divider now runs from z 0, through the back.
    spec = edit(spec, 'panel-6', { widthMm: 400, originMm: { ...panelOf(spec, 'panel-6').originMm, z: 0 } })
    expect(panelExtent(panelOf(spec, 'panel-6')).min.z).toBe(0)
    // The top moves down 50 mm: the divider follows on y and keeps its depth override.
    const topMoved = edit(spec, 'panel-3', { originMm: { ...panelOf(spec, 'panel-3').originMm, y: 600 - t - 50 } })
    expect(panelExtent(panelOf(topMoved, 'panel-6'))).toMatchObject({ min: { z: 0 }, max: { y: 600 - t - 50, z: 400 } })
    // The back itself moves (1 mm further forward): it reclaims its space, the divider is cut.
    const backMoved = edit(topMoved, 'panel-5', { originMm: { ...panelOf(topMoved, 'panel-5').originMm, z: 2 } })
    expect(panelExtent(panelOf(backMoved, 'panel-6')).min.z).toBe(2 + BACK_THICKNESS_MM)
    // A re-thickness of the back does the same.
    const backThicker = edit(topMoved, 'panel-5', { thicknessMm: 6 })
    expect(panelExtent(panelOf(backThicker, 'panel-6')).min.z).toBe(BACK_RECESS_MM + 6)
  })

  it('an edit that leaves the bounds alone returns the spec by reference; removing a shell panel re-fits nothing', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back', 'divider')
    const renamed = { ...spec, name: 'anders' }
    expect(commitPieceEdit(spec, renamed)).toBe(renamed)
    const dividerMoved = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-6' ? { ...p, originMm: { ...p.originMm, x: 300 } } : p)) }
    expect(commitPieceEdit(spec, dividerMoved)).toBe(dividerMoved)
    const noBack = { ...spec, panels: spec.panels.filter((p) => p.id !== 'panel-5') }
    expect(commitPieceEdit(spec, noBack)).toBe(noBack)
    expect(panelExtent(panelOf(noBack, 'panel-6')).min.z).toBe(BACK_FACE) // still where the back was
    const roleTaken = edit(spec, 'panel-5', { role: 'front' })
    expect(panelExtent(panelOf(roleTaken, 'panel-6')).min.z).toBe(BACK_FACE)
  })

  it('amendment 1: W + 100 with a shelf 10 mm short of the right side keeps its 10 mm gap', () => {
    let spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf')
    // 10 mm short of the right side's inner face = 28 from the envelope face:
    // resizeEnvelope (attached to the ENVELOPE within 20) leaves it alone…
    spec = edit(spec, 'panel-6', { lengthMm: panelOf(spec, 'panel-6').lengthMm - 9 })
    expect(1200 - t - panelExtent(panelOf(spec, 'panel-6')).max.x).toBe(10)
    const resized = resizeEnvelope(spec, { widthMm: 1300 })
    expect(panelExtent(panelOf(resized, 'panel-6')).max.x).toBe(panelExtent(panelOf(spec, 'panel-6')).max.x)
    // … and the fit, measuring to the side's INNER face, takes it along.
    const fitted = commitPieceEdit(spec, resized)
    expect(panelExtent(panelOf(fitted, 'panel-6')).max.x).toBe(1300 - t - 10)
    expect(panelExtent(panelOf(fitted, 'panel-6')).min.x).toBe(t + 1)
    // A shelf 1 mm short (the preset) is moved once, not twice.
    const preset = built('side', 'side', 'top', 'bottom', 'back', 'shelf')
    const presetFitted = commitPieceEdit(preset, resizeEnvelope(preset, { widthMm: 1210 }))
    expect(panelExtent(panelOf(presetFitted, 'panel-6')).max.x).toBe(1210 - t - 1)
  })
})

describe('the fit-now button', () => {
  it('cuts what pierces the shell and never extends: the setback and a gap stay', () => {
    let spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf', 'divider')
    // The pre-Phase-12 screenshot: the divider dragged with the grid to z 0, into the back.
    spec = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-7' ? { ...p, originMm: { ...p.originMm, z: 0 } } : p)) }
    // And a shelf with a 40 mm gap at the right.
    spec = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-6' ? { ...p, lengthMm: p.lengthMm - 39 } : p)) }
    expect(interiorFitPending(spec)).toBe(true)
    const fitted = fitInteriorPanels(spec, null)
    // Cut at the back's face; the front edge stays where the drag left it (396): the button never extends.
    expect(panelExtent(panelOf(fitted, 'panel-7'))).toMatchObject({ min: { z: BACK_FACE }, max: { z: 396 } })
    const shelf = panelOf(fitted, 'panel-6')
    expect(shelf).toEqual(panelOf(spec, 'panel-6')) // the 20 mm setback and the 40 mm gap untouched
    expect(interiorFitPending(fitted)).toBe(false)
    expect(fitInteriorPanels(fitted, null)).toBe(fitted)
  })

  it('moves a shelf standing inside the bottom up onto it, and leaves drawers and fronts alone', () => {
    let spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf', 'front')
    spec = addDrawer(spec)!.spec
    spec = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-6' ? { ...p, originMm: { ...p.originMm, y: 10 } } : p)) }
    const fitted = fitInteriorPanels(spec, null)
    expect(panelOf(fitted, 'panel-6').originMm.y).toBe(t)
    expect(panelOf(fitted, 'panel-7')).toEqual(panelOf(spec, 'panel-7'))
    expect(fitted.drawers).toEqual(spec.drawers)
  })
})

describe('interior panels move inside the interior', () => {
  it('a divider dragged to z 0 stops at the back’s front face; without a back it reaches 0', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back', 'divider')
    // (y 20 is refused too: the divider fills the interior height, so y stays 18.)
    const dragged = movePanel(spec, 'panel-6', { x: 300, y: 20, z: 0 })
    expect(panelOf(dragged, 'panel-6').originMm).toEqual({ x: 300, y: t, z: BACK_FACE })
    const open = built('side', 'side', 'divider')
    expect(panelOf(movePanel(open, 'panel-3', { x: 300, y: 0, z: 0 }), 'panel-3').originMm.z).toBe(0)
  })

  it('a shelf nudged into a side stops at its inner face, and the fields may still push it through', () => {
    const spec = built('side', 'side', 'top', 'bottom', 'back', 'shelf')
    const nudged = nudgePanel(spec, 'panel-6', { x: -100 })
    expect(panelOf(nudged, 'panel-6').originMm.x).toBe(t)
    // An override through the fields: longer than the interior — the move
    // clamp then falls back to the envelope on that axis.
    const over = edit(spec, 'panel-6', { lengthMm: 1190 })
    const moved = movePanel(over, 'panel-6', { x: 0, y: 300, z: 6 })
    expect(panelOf(moved, 'panel-6').originMm.x).toBe(0)
  })
})
