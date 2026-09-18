import { describe, expect, it } from 'vitest'
import { createDefaultBaseCabinetParams, type BaseCabinetParams } from '@core/cabinet'
import { createDefaultDesign, type CabinetKind } from '@core/catalog/registry'
import { createDefaultCustomPieceSpec } from '@core/customPiece'
import { createDefaultRoom } from '@core/room'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings, type WorktopSettings } from '@core/worktop'
import {
  computeWorktops,
  worktopSlabAreaM2,
  worktopSlabsIntersect,
  type WorktopSlab
} from '@core/worktopLayout'

// Default room 4000 × 3000 (x ±2000, z ±1500); default base cabinet
// 600 wide × 720 high × 560 deep; default worktop 38 mm thick, 30 mm overhang.
const DEFAULTS = createDefaultWorktopSettings()

function base(
  id: string,
  positionX: number,
  positionZ: number,
  rotationDeg: RotationDegrees = 0,
  params: Partial<BaseCabinetParams> = {}
): PlacedCabinet {
  return {
    id,
    design: { kind: 'base-cabinet', params: { ...createDefaultBaseCabinetParams(), ...params } },
    positionX,
    positionZ,
    rotationDeg
  }
}

function ofKind(
  kind: CabinetKind,
  id: string,
  positionX: number,
  positionZ: number,
  rotationDeg: RotationDegrees = 0
): PlacedCabinet {
  return { id, design: createDefaultDesign(kind), positionX, positionZ, rotationDeg }
}

/** A 600 × 720 × 560 custom block, standing or hanging. */
function piece(id: string, positionX: number, positionZ: number, mountingHeightMm = 0): PlacedCabinet {
  return {
    id,
    design: {
      kind: 'custom-piece',
      spec: {
        ...createDefaultCustomPieceSpec('Blok'),
        widthMm: 600,
        heightMm: 720,
        depthMm: 560,
        mountingHeightMm
      }
    },
    positionX,
    positionZ,
    rotationDeg: 0
  }
}

function sceneOf(cabinets: readonly PlacedCabinet[], worktop: WorktopSettings = DEFAULTS): SceneDesign {
  return { room: createDefaultRoom(), worktop, cabinets }
}

/** The slabs of a layout, with the invariant checked: no two slabs intersect. */
function slabsOf(cabinets: readonly PlacedCabinet[], worktop: WorktopSettings = DEFAULTS): readonly WorktopSlab[] {
  const slabs = computeWorktops(sceneOf(cabinets, worktop), worktop)
  for (let i = 0; i < slabs.length; i += 1) {
    for (let j = i + 1; j < slabs.length; j += 1) {
      expect(worktopSlabsIntersect(slabs[i], slabs[j])).toBe(false)
    }
  }
  expect(slabs.map((slab) => slab.id)).toEqual(slabs.map((_, index) => `worktop-${index + 1}`))
  return slabs
}

/** Three base cabinets along the back wall: x −2000…−200, z −1500…−940. */
const backRun: readonly PlacedCabinet[] = [
  base('cab-1', -1700, -1220),
  base('cab-2', -1100, -1220),
  base('cab-3', -500, -1220)
]

const backSlab: WorktopSlab = {
  id: 'worktop-1',
  materialId: DEFAULTS.materialId,
  rect: { minX: -2000, maxX: -200, minZ: -1500, maxZ: -910 },
  bottomMm: 720,
  topMm: 758,
  axis: 'x',
  lengthMm: 1800,
  depthMm: 590,
  memberIds: ['cab-1', 'cab-2', 'cab-3']
}

describe('one run, one slab', () => {
  it('covers a three-cabinet run: carcass union plus the front overhang, resting on the tops', () => {
    const slabs = slabsOf(backRun)
    expect(slabs).toEqual([backSlab])
    expect(worktopSlabAreaM2(slabs[0])).toBeCloseTo(1.062, 9)
  })

  it('lets a drawer cabinet and a full-top base cabinet join the slab', () => {
    const run = [
      base('cab-1', -1700, -1220),
      ofKind('drawer-cabinet', 'cab-2', -1100, -1220),
      base('cab-3', -500, -1220, 0, { topConstruction: 'panel' })
    ]
    expect(slabsOf(run)).toEqual([backSlab])
  })

  it('bridges mixed depths from the deepest back to the common front', () => {
    // Fronts aligned at z = 0 (a free-standing run): 560 and 700 deep.
    const run = [base('cab-1', -300, -280), base('cab-2', 300, -350, 0, { depthMm: 700 })]
    expect(slabsOf(run)).toEqual([
      {
        ...backSlab,
        rect: { minX: -600, maxX: 600, minZ: -700, maxZ: 30 },
        lengthMm: 1200,
        depthMm: 730,
        memberIds: ['cab-1', 'cab-2']
      }
    ])
  })

  it('lets the thickness, the overhang and the material flow into the slab', () => {
    const thin = slabsOf(backRun, {
      ...DEFAULTS,
      materialId: 'worktop-oak-40',
      thicknessMm: 12,
      frontOverhangMm: 0
    })
    expect(thin).toEqual([
      {
        ...backSlab,
        materialId: 'worktop-oak-40',
        rect: { ...backSlab.rect, maxZ: -940 },
        topMm: 732,
        depthMm: 560
      }
    ])
    const thick = slabsOf(backRun, { ...DEFAULTS, thicknessMm: 60, frontOverhangMm: 60 })
    expect(thick).toEqual([
      { ...backSlab, rect: { ...backSlab.rect, maxZ: -880 }, topMm: 780, depthMm: 620 }
    ])
  })

  it('points the overhang along the front for every rotation', () => {
    const cases: readonly [RotationDegrees, WorktopSlab['rect'], WorktopSlab['axis']][] = [
      [0, { minX: -300, maxX: 300, minZ: -280, maxZ: 310 }, 'x'],
      [90, { minX: -280, maxX: 310, minZ: -300, maxZ: 300 }, 'z'],
      [180, { minX: -300, maxX: 300, minZ: -310, maxZ: 280 }, 'x'],
      [270, { minX: -310, maxX: 280, minZ: -300, maxZ: 300 }, 'z']
    ]
    for (const [rotationDeg, rect, axis] of cases) {
      expect(slabsOf([base('cab-1', 0, 0, rotationDeg)])).toEqual([
        { ...backSlab, rect, axis, lengthMm: 600, depthMm: 590, memberIds: ['cab-1'] }
      ])
    }
  })

  it('stops the lip at a wall the run faces', () => {
    // Front at z = 1490, 10 mm short of the front wall at 1500.
    const slabs = slabsOf([base('cab-1', 0, 1210)])
    expect(slabs[0].rect).toEqual({ minX: -300, maxX: 300, minZ: 930, maxZ: 1500 })
    expect(slabs[0].depthMm).toBe(570)
  })
})

describe('height steps and non-eligible cabinets', () => {
  it('splits the run at every step in top height', () => {
    const run = [
      base('cab-1', -1700, -1220),
      base('cab-2', -1100, -1220, 0, { heightMm: 900 }),
      base('cab-3', -500, -1220)
    ]
    expect(slabsOf(run)).toEqual([
      { ...backSlab, rect: { ...backSlab.rect, maxX: -1400 }, lengthMm: 600, memberIds: ['cab-1'] },
      {
        ...backSlab,
        id: 'worktop-2',
        rect: { ...backSlab.rect, minX: -1400, maxX: -800 },
        bottomMm: 900,
        topMm: 938,
        lengthMm: 600,
        memberIds: ['cab-2']
      },
      {
        ...backSlab,
        id: 'worktop-3',
        rect: { ...backSlab.rect, minX: -800 },
        lengthMm: 600,
        memberIds: ['cab-3']
      }
    ])
  })

  it('splits the worktop around a tall cabinet or a custom piece standing in the run', () => {
    const expected = [
      { ...backSlab, rect: { ...backSlab.rect, maxX: -1400 }, lengthMm: 600, memberIds: ['cab-1'] },
      {
        ...backSlab,
        id: 'worktop-2',
        rect: { ...backSlab.rect, minX: -800 },
        lengthMm: 600,
        memberIds: ['cab-3']
      }
    ]
    expect(
      slabsOf([base('cab-1', -1700, -1220), ofKind('tall-cabinet', 'cab-2', -1100, -1220), base('cab-3', -500, -1220)])
    ).toEqual(expected)
    expect(
      slabsOf([base('cab-1', -1700, -1220), piece('cab-2', -1100, -1220), base('cab-3', -500, -1220)])
    ).toEqual(expected)
  })

  it('ignores a wall cabinet over the run and a hanging piece', () => {
    expect(
      slabsOf([
        ...backRun,
        ofKind('wall-cabinet', 'cab-4', -1100, -1340),
        piece('cab-5', -1100, -1220, 1400)
      ])
    ).toEqual([backSlab])
  })

  it('is empty when disabled, when the scene is empty, and when nothing is eligible', () => {
    expect(slabsOf(backRun, { ...DEFAULTS, enabled: false })).toEqual([])
    expect(slabsOf([])).toEqual([])
    expect(
      slabsOf([ofKind('tall-cabinet', 'cab-1', -1700, -1220), ofKind('wall-cabinet', 'cab-2', -1100, -1340)])
    ).toEqual([])
  })
})

describe('several runs', () => {
  it('leaves two parallel runs alone', () => {
    // An island facing the back run, far away.
    const island = [base('cab-4', -1400, 500, 180), base('cab-5', -800, 500, 180)]
    expect(slabsOf([...backRun, ...island])).toEqual([
      backSlab,
      {
        ...backSlab,
        id: 'worktop-2',
        rect: { minX: -1700, maxX: -500, minZ: 190, maxZ: 780 },
        lengthMm: 1200,
        memberIds: ['cab-4', 'cab-5']
      }
    ])
  })

  // The side run along the left wall, turned to face +X, starting flush in
  // front of the back run's first cabinet.
  const sideRunInFront = [base('cab-4', -1720, -640, 90), base('cab-5', -1720, -40, 90)]

  it('L-corner, side run in front of the back run: the back slab runs through, the side slab butts against it', () => {
    expect(slabsOf([...backRun, ...sideRunInFront])).toEqual([
      backSlab,
      {
        ...backSlab,
        id: 'worktop-2',
        // Uncut it would start at z = −940; the back slab's 30 mm lip wins.
        rect: { minX: -2000, maxX: -1410, minZ: -910, maxZ: 260 },
        axis: 'z',
        lengthMm: 1170,
        memberIds: ['cab-4', 'cab-5']
      }
    ])
  })

  it('L-corner, side run in the corner: the side slab runs through, the back slab is shortened by the overhang', () => {
    const sideRunInCorner = [base('cab-1', -1720, -1200, 90), base('cab-2', -1720, -600, 90)]
    const backRunBeside = [base('cab-3', -1140, -1220), base('cab-4', -540, -1220)]
    expect(slabsOf([...sideRunInCorner, ...backRunBeside])).toEqual([
      {
        ...backSlab,
        rect: { minX: -2000, maxX: -1410, minZ: -1500, maxZ: -300 },
        axis: 'z',
        lengthMm: 1200,
        memberIds: ['cab-1', 'cab-2']
      },
      {
        ...backSlab,
        id: 'worktop-2',
        // Uncut it would start at x = −1440.
        rect: { minX: -1410, maxX: -240, minZ: -1500, maxZ: -910 },
        lengthMm: 1170,
        memberIds: ['cab-3', 'cab-4']
      }
    ])
  })

  it('facing runs closer than twice the overhang: on a tie the newer run gives up lip', () => {
    // Fronts 40 mm apart, lips of 30 each: 20 mm of overlap, equal strips.
    const facing = [
      base('cab-1', -300, -280),
      base('cab-2', 300, -280),
      base('cab-3', -300, 320, 180),
      base('cab-4', 300, 320, 180)
    ]
    expect(slabsOf(facing)).toEqual([
      {
        ...backSlab,
        rect: { minX: -600, maxX: 600, minZ: -560, maxZ: 30 },
        lengthMm: 1200,
        memberIds: ['cab-1', 'cab-2']
      },
      {
        ...backSlab,
        id: 'worktop-2',
        rect: { minX: -600, maxX: 600, minZ: 30, maxZ: 600 },
        lengthMm: 1200,
        depthMm: 570,
        memberIds: ['cab-3', 'cab-4']
      }
    ])
  })

  it('is deterministic: the same cabinets in any array order give the same slabs, ids included', () => {
    const corner = [...backRun, ...sideRunInFront]
    const reversed = [...corner].reverse()
    expect(slabsOf(reversed)).toEqual(slabsOf(corner))
    const shuffled = [corner[3], corner[0], corner[4], corner[2], corner[1]]
    expect(slabsOf(shuffled)).toEqual(slabsOf(corner))
  })
})

describe('worktopSlabsIntersect', () => {
  it('is the cabinets’ rule: floor rects AND vertical intervals must overlap', () => {
    const a = backSlab
    const overlapping = { ...backSlab, id: 'worktop-2', rect: { ...backSlab.rect, minX: -400 } }
    const flush = { ...backSlab, id: 'worktop-2', rect: { ...backSlab.rect, minX: -200, maxX: 400 } }
    const higher = { ...overlapping, bottomMm: 758, topMm: 796 }
    expect(worktopSlabsIntersect(a, overlapping)).toBe(true)
    expect(worktopSlabsIntersect(a, flush)).toBe(false)
    expect(worktopSlabsIntersect(a, higher)).toBe(false)
  })
})
