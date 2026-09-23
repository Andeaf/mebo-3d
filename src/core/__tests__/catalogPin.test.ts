import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type BaseCabinetParams } from '@core/cabinet'
import { generateBaseCabinet } from '@core/catalog/baseCabinet'
import {
  createDefaultDrawerCabinetParams,
  generateDrawerCabinet,
  type DrawerCabinetParams
} from '@core/catalog/drawerCabinet'
import type { CabinetBuild } from '@core/catalog/parts'
import {
  createDefaultTallCabinetParams,
  generateTallCabinet,
  type TallCabinetParams
} from '@core/catalog/tallCabinet'
import {
  createDefaultWallCabinetParams,
  generateWallCabinet,
  type WallCabinetParams
} from '@core/catalog/wallCabinet'
import type { Vec3 } from '@core/units'

/**
 * A pin of the catalog builds as they were before Phase 10 moved the drawer
 * into its own module and reshaped the shared door and shelf pieces. Every
 * number is printed in full — the shortest text that reads back as the same
 * double — so a passing snapshot proves those refactors changed no bit of any
 * part, not merely that the values stayed close. Recorded on the unchanged
 * code; never regenerated to make a refactor pass.
 */
function vec(value: Vec3): string {
  return `${value.x},${value.y},${value.z}`
}

function render(build: CabinetBuild): string[] {
  const panels = build.panels.map((panel) => {
    const band =
      panel.edgeBanding === null
        ? 'none'
        : `${panel.edgeBanding.materialId}[${panel.edgeBanding.edges.join(',')}]`
    return (
      `${panel.id} ${panel.role} ${panel.materialId} ` +
      `${panel.lengthMm}×${panel.widthMm}×${panel.thicknessMm} band=${band} ` +
      `at=(${vec(panel.box.center)}) size=(${vec(panel.box.size)})`
    )
  })
  const hardware = build.hardware.map((item) => `hardware ${item.materialId}×${item.quantity}`)
  return [...panels, ...hardware, `bounding ${vec(build.boundingSizeMm)}`]
}

describe('catalog builds pinned before Phase 10', () => {
  it('ladekast: 1–4 drawers at three heights, plus the narrowest and the largest carcass', () => {
    const defaults = createDefaultDrawerCabinetParams()
    const pins: Record<string, string[]> = {}
    for (const drawerCount of [1, 2, 3, 4]) {
      for (const heightMm of [400, 720, 1000]) {
        const params: DrawerCabinetParams = { ...defaults, drawerCount, heightMm }
        pins[`${drawerCount} drawers, ${heightMm} high`] = render(generateDrawerCabinet(params))
      }
    }
    pins['301 wide, 300 deep, 3 drawers'] = render(
      generateDrawerCabinet({ ...defaults, widthMm: 301, depthMm: 300, drawerCount: 3 })
    )
    pins['1200 wide, 700 deep, 1000 high, 4 drawers'] = render(
      generateDrawerCabinet({ ...defaults, widthMm: 1200, depthMm: 700, heightMm: 1000, drawerCount: 4 })
    )
    expect(pins).toMatchSnapshot()
  })

  it('onderkast: shelves, doors and both top constructions', () => {
    const defaults = createDefaultBaseCabinetParams()
    const pins: Record<string, string[]> = {}
    for (const shelfCount of [0, 4]) {
      for (const doorCount of [0, 1, 2] as const) {
        const params: BaseCabinetParams = { ...defaults, shelfCount, doorCount }
        pins[`${shelfCount} shelves, ${doorCount} doors`] = render(generateBaseCabinet(params))
      }
    }
    pins['full top panel'] = render(generateBaseCabinet({ ...defaults, topConstruction: 'panel' }))
    pins['1200 × 1000 × 700, 3 shelves'] = render(
      generateBaseCabinet({ ...defaults, widthMm: 1200, heightMm: 1000, depthMm: 700, shelfCount: 3 })
    )
    expect(pins).toMatchSnapshot()
  })

  it('bovenkast: no shelves, three shelves, a single door', () => {
    const defaults = createDefaultWallCabinetParams()
    const variants: Record<string, WallCabinetParams> = {
      default: defaults,
      'no shelves': { ...defaults, shelfCount: 0 },
      '3 shelves, 1 door, 450 wide': { ...defaults, shelfCount: 3, doorCount: 1, widthMm: 450 }
    }
    const pins: Record<string, string[]> = {}
    for (const [name, params] of Object.entries(variants)) {
      pins[name] = render(generateWallCabinet(params))
    }
    expect(pins).toMatchSnapshot()
  })

  it('kolomkast: the lowest and the highest, with and without shelves', () => {
    const defaults = createDefaultTallCabinetParams()
    const variants: Record<string, TallCabinetParams> = {
      '1800 high, no shelves': { ...defaults, heightMm: 1800, shelfCount: 0 },
      '2400 high, 6 shelves': { ...defaults, heightMm: 2400, shelfCount: 6 },
      default: defaults
    }
    const pins: Record<string, string[]> = {}
    for (const [name, params] of Object.entries(variants)) {
      pins[name] = render(generateTallCabinet(params))
    }
    expect(pins).toMatchSnapshot()
  })
})
