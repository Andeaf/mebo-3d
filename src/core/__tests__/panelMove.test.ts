import { describe, expect, it } from 'vitest'
import { CARCASS_THICKNESS_MM, SHELF_SIDE_CLEARANCE_MM } from '@core/catalog/parts'
import {
  addPresetPanel,
  createDefaultCustomPieceSpec,
  duplicatePanel,
  movePanel,
  nudgePanel,
  panelExtent,
  panelSpace,
  snapToStep,
  validateCustomPieceSpec,
  PANEL_MOVE_STEP_MM,
  type CustomPanelSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import type { Vec3 } from '@core/units'

function withPreset(spec: CustomPieceSpec, preset: Parameters<typeof addPresetPanel>[1]): CustomPieceSpec {
  const change = addPresetPanel(spec, preset)
  if (change === null) {
    throw new Error(`preset ${preset} refused`)
  }
  return change.spec
}

function panelOf(spec: CustomPieceSpec, id: string): CustomPanelSpec {
  const panel = spec.panels.find((candidate) => candidate.id === id)
  if (panel === undefined) {
    throw new Error(`no panel ${id}`)
  }
  return panel
}

/** What the gizmo does per frame: the attempted origin snapped to the grid, then clamped by movePanel. */
function gizmoDrag(spec: CustomPieceSpec, id: string, deltaMm: Partial<Vec3>): CustomPieceSpec {
  const { originMm } = panelOf(spec, id)
  const snap = (value: number): number => snapToStep(value, PANEL_MOVE_STEP_MM)
  return movePanel(spec, id, {
    x: snap(originMm.x + (deltaMm.x ?? 0)),
    y: snap(originMm.y + (deltaMm.y ?? 0)),
    z: snap(originMm.z + (deltaMm.z ?? 0))
  })
}

describe('snapToStep', () => {
  it('rounds to the nearest multiple', () => {
    expect(snapToStep(291, 10)).toBe(290)
    expect(snapToStep(295, 10)).toBe(300)
    expect(snapToStep(-4, 10) === 0).toBe(true)
    expect(snapToStep(7, 1)).toBe(7)
  })
})

describe('movePanel', () => {
  const base = withPreset(createDefaultCustomPieceSpec('t'), 'shelf') // 1200 × 600 × 400
  const shelf = panelOf(base, 'panel-1')

  it('moves the panel to the origin and keeps everything else', () => {
    // The preset shelf is 1162 long in a 1200 envelope: x may reach 38.
    const moved = movePanel(base, 'panel-1', { x: 20, y: 200, z: 30 })
    expect(panelOf(moved, 'panel-1').originMm).toEqual({ x: 20, y: 200, z: 30 })
    expect(panelOf(moved, 'panel-1').lengthMm).toBe(shelf.lengthMm)
    expect(moved.widthMm).toBe(base.widthMm)
    expect(validateCustomPieceSpec(moved)).toEqual([])
  })

  it('clamps on every axis: past a face lands flush against it, below zero lands at zero', () => {
    const space = panelSpace(base)
    const { max } = panelExtent(shelf)
    const size = { x: max.x - shelf.originMm.x, y: max.y - shelf.originMm.y, z: max.z - shelf.originMm.z }
    const far = movePanel(base, 'panel-1', { x: 5000, y: 5000, z: 5000 })
    expect(panelOf(far, 'panel-1').originMm).toEqual({
      x: space.x - size.x,
      y: space.y - size.y,
      z: space.z - size.z
    })
    const near = movePanel(base, 'panel-1', { x: -50, y: -50, z: -50 })
    expect(panelOf(near, 'panel-1').originMm).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('rounds to whole millimetres', () => {
    expect(panelOf(movePanel(base, 'panel-1', { x: 10.4, y: 20.6, z: 0 }), 'panel-1').originMm).toEqual({
      x: 10,
      y: 21,
      z: 0
    })
  })

  it('returns the spec unchanged for an unknown id', () => {
    expect(movePanel(base, 'panel-9', { x: 1, y: 1, z: 1 })).toBe(base)
    expect(nudgePanel(base, 'panel-9', { x: 1 })).toBe(base)
  })

  it('nudgePanel moves by a delta, missing axes stay, and a nudge past a face stops at it', () => {
    const nudged = nudgePanel(base, 'panel-1', { x: 1, z: 10 })
    expect(panelOf(nudged, 'panel-1').originMm).toEqual({
      x: shelf.originMm.x + 1,
      y: shelf.originMm.y,
      z: shelf.originMm.z + 10
    })
    // The preset shelf sits 4 mm from the rear face: a 10 mm nudge back stops at 0.
    expect(panelOf(nudgePanel(base, 'panel-1', { z: -10 }), 'panel-1').originMm.z).toBe(0)
  })
})

describe('the divided cabinet: a left shelf and a right shelf at one height', () => {
  // Built the way the brief asks: presets, the length slider, gizmo drags
  // and duplicate — no coordinates typed.
  it('ends with two shelves at the same Y, on either side of the divider, inside the envelope', () => {
    let spec = createDefaultCustomPieceSpec('Verdeeld')
    spec = withPreset(spec, 'side') // panel-1 left
    spec = withPreset(spec, 'side') // panel-2 right
    spec = withPreset(spec, 'top') // panel-3
    spec = withPreset(spec, 'bottom') // panel-4
    spec = withPreset(spec, 'divider') // panel-5, centred
    spec = withPreset(spec, 'shelf') // panel-6, spans the interior
    const divider = panelOf(spec, 'panel-5')
    const t = CARCASS_THICKNESS_MM
    const clearance = SHELF_SIDE_CLEARANCE_MM

    // The length slider: shrink the shelf to the left compartment.
    const leftCompartment = divider.originMm.x - t - 2 * clearance
    spec = { ...spec, panels: spec.panels.map((p) => (p.id === 'panel-6' ? { ...p, lengthMm: leftCompartment } : p)) }

    // Gizmo: drag it left until it stops beside the left side. The first
    // drag also lands the preset's odd origin (y = 291) on the 10 mm grid.
    spec = gizmoDrag(spec, 'panel-6', { x: -1000 })
    const left = panelOf(spec, 'panel-6')
    expect(left.originMm.x).toBe(0) // clamped at the envelope wall
    expect(left.originMm.y % PANEL_MOVE_STEP_MM).toBe(0)
    // … then nudge it clear of the side with the arrow keys (Shift = 10 mm, twice).
    spec = nudgePanel(spec, 'panel-6', { x: 10 })
    spec = nudgePanel(spec, 'panel-6', { x: 10 })
    expect(panelOf(spec, 'panel-6').originMm.x).toBe(20)

    // Duplicate: the copy lands on top of the original (flush along the thickness axis).
    const copy = duplicatePanel(spec, 'panel-6')
    if (copy === null) {
      throw new Error('duplicate refused')
    }
    spec = copy.spec
    expect(panelOf(spec, copy.panelId).originMm.y).toBe(panelOf(spec, 'panel-6').originMm.y + t)

    // Gizmo: drag the copy right past the divider and back down onto the grid row.
    spec = gizmoDrag(spec, copy.panelId, { x: divider.originMm.x + t, y: -t })
    const right = panelOf(spec, copy.panelId)
    const leftFinal = panelOf(spec, 'panel-6')

    expect(right.originMm.y).toBe(leftFinal.originMm.y)
    expect(panelExtent(leftFinal).max.x).toBeLessThanOrEqual(divider.originMm.x)
    expect(right.originMm.x).toBeGreaterThanOrEqual(divider.originMm.x + t)
    expect(panelExtent(right).max.x).toBeLessThanOrEqual(spec.widthMm)
    expect(validateCustomPieceSpec(spec)).toEqual([])
    expect(spec.panels).toHaveLength(7)
  })
})
