import { describe, expect, it } from 'vitest'
import { drawerNumberOfPart, DRAWER_FRONT_MIN_HEIGHT_MM } from '@core/catalog/drawer'
import {
  clampDrawerCabinetParams,
  createDefaultDrawerCabinetParams,
  drawerFrontHeightMm,
  drawerFrontLayout,
  generateDrawerCabinet,
  shallowFrontHeightMaxMm,
  validateDrawerCabinetParams,
  type DrawerCabinetParams
} from '@core/catalog/drawerCabinet'
import { CARCASS_THICKNESS_MM, FRONT_GAP_MM, FRONT_REVEAL_MM } from '@core/catalog/parts'

// Default: 600 × 720 × 560 mm, 3 drawers, no shallow ones.
const defaults = createDefaultDrawerCabinetParams()

function withParams(patch: Partial<DrawerCabinetParams>): DrawerCabinetParams {
  return { ...defaults, ...patch }
}

function frontHeights(params: DrawerCabinetParams): number[] {
  return drawerFrontLayout(params).map((slot) => slot.heightMm)
}

interface Span {
  readonly bottom: number
  readonly top: number
}

/** Each drawer's box (everything but its front) as a vertical span, bottom drawer first. */
function boxSpans(params: DrawerCabinetParams): Span[] {
  const spans = new Map<number, Span>()
  for (const panel of generateDrawerCabinet(params).panels) {
    const number = drawerNumberOfPart(panel.id)
    if (number === null || panel.role === 'drawer-front') {
      continue
    }
    const bottom = panel.box.center.y - panel.box.size.y / 2
    const top = panel.box.center.y + panel.box.size.y / 2
    const known = spans.get(number)
    spans.set(number, {
      bottom: known === undefined ? bottom : Math.min(known.bottom, bottom),
      top: known === undefined ? top : Math.max(known.top, top)
    })
  }
  return [...spans.entries()].sort(([a], [b]) => a - b).map(([, span]) => span)
}

describe('the ladekast front layout', () => {
  it('keeps the Phase 3 equal split, to the bit, without shallow drawers', () => {
    const equal = drawerFrontHeightMm(defaults, 3)
    expect(drawerFrontLayout(defaults)).toEqual([
      { bottomMm: 2, heightMm: equal },
      { bottomMm: 2 + 1 * (equal + 3), heightMm: equal },
      { bottomMm: 2 + 2 * (equal + 3), heightMm: equal }
    ])
  })

  it('puts the shallow drawers on top; the deep ones share the rest and the bottom one takes the rounding', () => {
    // 720 − 2 × 2 − 2 × 3 = 710; 710 − 150 = 560 over two deep drawers.
    expect(frontHeights(withParams({ shallowDrawerCount: 1, shallowFrontHeightMm: 150 }))).toEqual([280, 280, 150])
    // 707 − 150 = 557 over three: 185 each, the bottom one 187.
    expect(
      frontHeights(withParams({ drawerCount: 4, shallowDrawerCount: 1, shallowFrontHeightMm: 150 }))
    ).toEqual([187, 185, 185, 150])
    // 707 − 240 = 467 over two: 233, the bottom one 234.
    expect(
      frontHeights(withParams({ drawerCount: 4, shallowDrawerCount: 2, shallowFrontHeightMm: 120 }))
    ).toEqual([234, 233, 120, 120])
    // One deep drawer owns the whole rest.
    expect(
      frontHeights(withParams({ drawerCount: 2, shallowDrawerCount: 1, shallowFrontHeightMm: 150 }))
    ).toEqual([563, 150])
  })

  it('stacks the fronts from the bottom reveal with one gap between', () => {
    expect(drawerFrontLayout(withParams({ shallowDrawerCount: 1, shallowFrontHeightMm: 150 }))).toEqual([
      { bottomMm: 2, heightMm: 280 },
      { bottomMm: 285, heightMm: 280 },
      { bottomMm: 568, heightMm: 150 }
    ])
  })

  it('sums exactly to the carcass and keeps every drawer legal, for every combination', () => {
    for (const heightMm of [400, 401, 720, 1000]) {
      for (const drawerCount of [1, 2, 3, 4]) {
        const share = shallowFrontHeightMaxMm({ heightMm, drawerCount })
        for (let shallowDrawerCount = 0; shallowDrawerCount < drawerCount; shallowDrawerCount += 1) {
          for (const shallowFrontHeightMm of [DRAWER_FRONT_MIN_HEIGHT_MM, 150, share]) {
            const label = `${heightMm} mm, ${drawerCount} drawers, ${shallowDrawerCount} × ${shallowFrontHeightMm}`
            const params = clampDrawerCabinetParams(
              withParams({ heightMm, drawerCount, shallowDrawerCount, shallowFrontHeightMm })
            )
            expect(validateDrawerCabinetParams(params), label).toEqual([])
            expect(clampDrawerCabinetParams(params), label).toEqual(params)

            const fronts = frontHeights(params)
            const total =
              fronts.reduce((sum, front) => sum + front, 0) +
              2 * FRONT_REVEAL_MM +
              (drawerCount - 1) * FRONT_GAP_MM
            if (shallowDrawerCount > 0) {
              expect(total, label).toBe(heightMm)
            } else {
              expect(total, label).toBeCloseTo(heightMm, 9)
            }
            for (const front of fronts) {
              expect(front, label).toBeGreaterThanOrEqual(DRAWER_FRONT_MIN_HEIGHT_MM)
            }
            const deep = fronts.slice(0, drawerCount - shallowDrawerCount)
            const shallow = fronts.slice(drawerCount - shallowDrawerCount)
            expect(Math.max(...shallow, 0), label).toBeLessThanOrEqual(Math.min(...deep))
            // The bottom drawer is the deepest, by less than one millimetre per deep drawer.
            expect(Math.max(...deep), label).toBe(deep[0])
            expect(deep[0] - Math.min(...deep), label).toBeLessThan(deep.length)

            const spans = boxSpans(params)
            expect(spans, label).toHaveLength(drawerCount)
            for (const span of spans) {
              expect(span.bottom, label).toBeGreaterThanOrEqual(CARCASS_THICKNESS_MM)
              expect(span.top, label).toBeLessThanOrEqual(heightMm - CARCASS_THICKNESS_MM)
            }
            for (let i = 1; i < spans.length; i += 1) {
              expect(spans[i - 1].top, label).toBeLessThan(spans[i].bottom)
            }
          }
        }
      }
    }
  })

  it('builds the fronts it lays out, the shallow one on top', () => {
    const build = generateDrawerCabinet(withParams({ shallowDrawerCount: 1, shallowFrontHeightMm: 150 }))
    const fronts = build.panels.filter((panel) => panel.role === 'drawer-front')
    expect(fronts.map((front) => [front.id, front.lengthMm])).toEqual([
      ['drawer-front-1', 280],
      ['drawer-front-2', 280],
      ['drawer-front-3', 150]
    ])
    const top = fronts[2]
    expect(top.box.center.y + top.box.size.y / 2).toBe(720 - FRONT_REVEAL_MM)
    expect(build.hardware).toEqual([
      { materialId: 'drawer-slide-pair', quantity: 3 },
      { materialId: 'handle-standard', quantity: 3 }
    ])
  })
})

describe('shallow drawer params', () => {
  it('caps a shallow front at the equal share', () => {
    expect(shallowFrontHeightMaxMm({ heightMm: 720, drawerCount: 3 })).toBe(236)
    expect(shallowFrontHeightMaxMm({ heightMm: 400, drawerCount: 4 })).toBe(96)
    expect(shallowFrontHeightMaxMm({ heightMm: 1000, drawerCount: 2 })).toBe(496)
    expect(shallowFrontHeightMaxMm({ heightMm: 1000, drawerCount: 1 })).toBe(500)
  })

  it('clamps the shallow count and height, following the carcass', () => {
    expect(clampDrawerCabinetParams(withParams({ shallowDrawerCount: 5 })).shallowDrawerCount).toBe(2)
    expect(
      clampDrawerCabinetParams(withParams({ shallowDrawerCount: 1, shallowFrontHeightMm: 400 })).shallowFrontHeightMm
    ).toBe(236)
    // Fewer drawers pull the shallow count down with them.
    expect(clampDrawerCabinetParams(withParams({ drawerCount: 1, shallowDrawerCount: 2 })).shallowDrawerCount).toBe(0)
    // A lower carcass pulls the shallow height down: 400 mm, 4 drawers → a share of 96.
    expect(
      clampDrawerCabinetParams(
        withParams({ heightMm: 400, drawerCount: 4, shallowDrawerCount: 1, shallowFrontHeightMm: 150 })
      ).shallowFrontHeightMm
    ).toBe(96)
    // A dormant height only meets the static range.
    expect(clampDrawerCabinetParams(withParams({ shallowFrontHeightMm: 700 })).shallowFrontHeightMm).toBe(500)
    expect(clampDrawerCabinetParams(withParams({ shallowFrontHeightMm: 50 })).shallowFrontHeightMm).toBe(96)
  })

  it('refuses layouts a file could hold but the editor never builds', () => {
    const errors = (patch: Partial<DrawerCabinetParams>): string[] =>
      validateDrawerCabinetParams(withParams(patch))
    expect(errors({ shallowDrawerCount: 3 })).toEqual([
      'shallowDrawerCount must be an integer between 0 and 2 (got 3)'
    ])
    expect(errors({ shallowDrawerCount: 1.5 })).toEqual([
      'shallowDrawerCount must be an integer between 0 and 2 (got 1.5)'
    ])
    expect(errors({ shallowDrawerCount: -1 })).toEqual([
      'shallowDrawerCount must be an integer between 0 and 2 (got -1)'
    ])
    expect(errors({ shallowFrontHeightMm: 90 })).toEqual([
      'shallowFrontHeightMm must be between 96 and 500 (got 90)'
    ])
    expect(errors({ shallowDrawerCount: 1, shallowFrontHeightMm: 237 })).toEqual([
      'shallowFrontHeightMm must be at most 236 for 3 drawers in 720 mm, so no shallow front outgrows a deep one (got 237)'
    ])
    // Dormant: a tall shallow height is fine while no drawer is shallow.
    expect(errors({ shallowFrontHeightMm: 400 })).toEqual([])
    // A bad count is reported once, without a knock-on shallow message.
    expect(errors({ drawerCount: 0, shallowDrawerCount: 0 })).toEqual(['drawerCount must be between 1 and 4 (got 0)'])
    expect(() => generateDrawerCabinet(withParams({ shallowDrawerCount: 3 }))).toThrow(/shallowDrawerCount/)
  })
})
