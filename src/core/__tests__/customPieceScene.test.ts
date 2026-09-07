import { describe, expect, it } from 'vitest'
import type { CabinetDesign } from '@core/cabinet'
import { createDefaultDesign } from '@core/catalog/registry'
import { addPresetPanel, createDefaultCustomPieceSpec, type CustomPieceSpec } from '@core/customPiece'
import {
  placedCabinetRect,
  placedCabinetsCollide,
  placedVerticalInterval,
  sceneHasOverlap
} from '@core/footprint'
import { createDefaultRoom, roomContainsRect } from '@core/room'
import type { PlacedCabinet, RotationDegrees, SceneDesign } from '@core/scene'
import { connectedRun, placeWithoutOverlap, resolveSnap, spawnPlacement } from '@core/snap'

// An 1800 × 500 × 400 TV unit with a carcass and a front, so the overlay
// zone is in play. It is a floor piece unless a test says otherwise.
function tvUnit(overrides: Partial<CustomPieceSpec> = {}): CabinetDesign {
  let spec: CustomPieceSpec = {
    ...createDefaultCustomPieceSpec('TV-wand'),
    widthMm: 1800,
    heightMm: 500,
    depthMm: 400
  }
  for (const preset of ['side', 'side', 'top', 'bottom', 'front'] as const) {
    spec = addPresetPanel(spec, preset)!.spec
  }
  return { kind: 'custom-piece', spec: { ...spec, ...overrides } }
}

function place(
  id: string,
  design: CabinetDesign,
  positionX: number,
  positionZ: number,
  rotationDeg: RotationDegrees = 0
): PlacedCabinet {
  return { id, design, positionX, positionZ, rotationDeg }
}

const room = createDefaultRoom()

function scene(...cabinets: PlacedCabinet[]): SceneDesign {
  return { room, cabinets }
}

describe('a custom piece in the scene', () => {
  it('has the envelope as footprint, fronts excluded, and rotates like a cabinet', () => {
    const straight = place('cab-1', tvUnit(), 0, 0)
    expect(placedCabinetRect(straight)).toEqual({ minX: -900, maxX: 900, minZ: -200, maxZ: 200 })
    const turned = place('cab-1', tvUnit(), 0, 0, 90)
    expect(placedCabinetRect(turned)).toEqual({ minX: -200, maxX: 200, minZ: -900, maxZ: 900 })
  })

  it('snaps flush beside a catalog cabinet and joins its run', () => {
    // Base cabinet 600 wide at x -600 (so the 1800 piece fits inside the
    // 4000 room beside it); the piece dropped 20 mm short of flush and 20 mm
    // short of front-aligned, both within the 30 mm snap distance.
    const base = place('cab-1', createDefaultDesign('base-cabinet'), -600, 0)
    const piece = place('cab-2', tvUnit(), -300 + 900 + 20, 60)
    const snapped = resolveSnap(piece, [base])
    expect(snapped.positionX).toBe(600)
    // Fronts aligned: base depth 560, piece depth 400 → the piece's centre sits 80 mm forward.
    expect(snapped.positionZ).toBe(80)
    const placed = placeWithoutOverlap(scene(base), { ...piece, positionX: snapped.positionX, positionZ: snapped.positionZ })
    expect(placed.cabinets).toHaveLength(2)
    const run = connectedRun(placed, 'cab-2')
    expect(run === null ? [] : [...run.memberIds].sort()).toEqual(['cab-1', 'cab-2'])
    expect(run?.totalWidthMm).toBe(2400)
  })

  it('hangs over a base run without colliding, and collides when it stands on the floor', () => {
    const base = place('cab-1', createDefaultDesign('base-cabinet'), 0, 80)
    const hanging = place('cab-2', tvUnit({ mountingHeightMm: 1200 }), 0, 0)
    expect(placedVerticalInterval(hanging)).toEqual({ bottomMm: 1200, topMm: 1700 })
    expect(placedCabinetsCollide(base, hanging)).toBe(false)
    expect(sceneHasOverlap(scene(base, hanging))).toBe(false)
    const standing = place('cab-2', tvUnit(), 0, 0)
    expect(placedCabinetsCollide(base, standing)).toBe(true)
  })

  it('is refused by the gate when it would overlap, and pushed inside the room', () => {
    const base = place('cab-1', createDefaultDesign('base-cabinet'), 0, 0)
    const onTop = place('cab-2', tvUnit(), 0, 0)
    const resolved = placeWithoutOverlap(scene(base), onTop)
    expect(resolved.cabinets).toHaveLength(2)
    expect(sceneHasOverlap(resolved)).toBe(false)
    const far = placeWithoutOverlap(scene(), place('cab-1', tvUnit(), 5000, 0))
    expect(roomContainsRect(room, placedCabinetRect(far.cabinets[0]))).toBe(true)
  })

  it('spawns against the back wall like the first cabinet', () => {
    const spawn = spawnPlacement(scene(), tvUnit())
    expect(spawn).toEqual({ positionX: 0, positionZ: -room.lengthMm / 2 + 200, rotationDeg: 0 })
  })
})
