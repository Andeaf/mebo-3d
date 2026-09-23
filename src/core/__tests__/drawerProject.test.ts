import { describe, expect, it } from 'vitest'
import type { CabinetDesign } from '@core/cabinet'
import {
  createDefaultDrawerCabinetParams,
  drawerFrontHeightMm,
  drawerFrontLayout,
  generateDrawerCabinet
} from '@core/catalog/drawerCabinet'
import { createDefaultDrawerDoorCabinetParams } from '@core/catalog/drawerDoorCabinet'
import { createDefaultDesign, generateCabinet } from '@core/catalog/registry'
import { createDefaultCustomPieceSpec, type CustomPieceSpec } from '@core/customPiece'
import type { PriceDatabase } from '@core/materials'
import { quoteForDesign } from '@core/pricing'
import {
  parseProject,
  serializeProject,
  ProjectParseError,
  PROJECT_SCHEMA_VERSION,
  type ProjectMetadata
} from '@core/project'
import type { PlacedCabinet, SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings } from '@core/worktop'
import { drawer, floatingTvUnit, withPresets } from './drawerFixtures'

// A ladekast with one shallow drawer; beside it a drawer block built as a
// custom piece with the same three fronts; across the wall a floating TV unit
// hung at 450 mm with a drawer.
const ladekast: CabinetDesign = {
  kind: 'drawer-cabinet',
  params: { ...createDefaultDrawerCabinetParams(), shallowDrawerCount: 1, shallowFrontHeightMm: 150 }
}

const drawerBlock: CustomPieceSpec = {
  ...createDefaultCustomPieceSpec('Ladeblok'),
  widthMm: 600,
  heightMm: 720,
  depthMm: 560,
  drawers: [
    drawer({ id: 'drawer-1', originMm: { x: 2, y: 2 }, heightMm: 280 }),
    drawer({ id: 'drawer-2', originMm: { x: 2, y: 285 }, heightMm: 280 }),
    drawer({ id: 'drawer-3', originMm: { x: 2, y: 568 }, heightMm: 150 })
  ]
}

const room = { widthMm: 5000, lengthMm: 4000, wallHeightMm: 2400 }

const cabinets: readonly PlacedCabinet[] = [
  { id: 'cab-1', design: ladekast, positionX: -1500, positionZ: -1720, rotationDeg: 0 },
  { id: 'cab-2', design: { kind: 'custom-piece', spec: drawerBlock }, positionX: -900, positionZ: -1720, rotationDeg: 0 },
  { id: 'cab-3', design: { kind: 'custom-piece', spec: floatingTvUnit() }, positionX: 800, positionZ: -1800, rotationDeg: 0 },
  // Kind #5: needs nothing in the file format but its own template.
  {
    id: 'cab-4',
    design: {
      kind: 'drawer-door-cabinet',
      params: { ...createDefaultDrawerDoorCabinetParams(), drawerFrontHeightMm: 180, shelfCount: 2 }
    },
    positionX: 2200,
    positionZ: -1720,
    rotationDeg: 0
  }
]

const scene: SceneDesign = { room, worktop: createDefaultWorktopSettings(), cabinets }

const metadata: ProjectMetadata = {
  projectName: 'Keuken en woonkamer Visser',
  createdAt: '2026-09-23T09:00:00.000Z',
  modifiedAt: '2026-09-23T11:30:00.000Z',
  appVersion: '0.10.0'
}

const fixtureDb: PriceDatabase = {
  materials: [
    { id: 'melamine-white-18', name: 'Board', category: 'board', priceUnit: 'm2', pricePerUnitEur: 10, thicknessMm: 18 },
    { id: 'hdf-back-3', name: 'Back', category: 'board', priceUnit: 'm2', pricePerUnitEur: 5, thicknessMm: 3 },
    { id: 'abs-edge', name: 'Edge', category: 'edgeband', priceUnit: 'm', pricePerUnitEur: 1 },
    { id: 'handle-standard', name: 'Handle', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 3 },
    { id: 'drawer-slide-pair', name: 'Slides', category: 'hardware', priceUnit: 'piece', pricePerUnitEur: 8 }
  ]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The object at `path` inside a parsed JSON tree (numbers index arrays). */
function node(root: unknown, ...path: readonly (string | number)[]): Record<string, unknown> {
  let current: unknown = root
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`expected an array before [${key}]`)
      }
      current = current[key]
    } else {
      if (!isObject(current)) {
        throw new Error(`expected an object before .${key}`)
      }
      current = current[key]
    }
  }
  if (!isObject(current)) {
    throw new Error(`no object at ${path.join('.')}`)
  }
  return current
}

/** A scene's file with one hand-edit applied, as text. */
function editedFrom(source: SceneDesign, edit: (document: Record<string, unknown>) => void): string {
  const document: unknown = JSON.parse(serializeProject(source, metadata))
  if (!isObject(document)) {
    throw new Error('serialized project is not an object')
  }
  edit(document)
  return JSON.stringify(document)
}

function edited(edit: (document: Record<string, unknown>) => void): string {
  return editedFrom(scene, edit)
}

function params(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return node(document, 'scene', 'cabinets', index, 'design', 'params')
}

function spec(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return node(document, 'scene', 'cabinets', index, 'design', 'spec')
}

function drawerEntry(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return node(document, 'scene', 'cabinets', 1, 'design', 'spec', 'drawers', index)
}

function expectRefusal(text: string, ...fragments: readonly (string | RegExp)[]): void {
  expect(() => parseProject(text)).toThrow(ProjectParseError)
  for (const fragment of fragments) {
    expect(() => parseProject(text)).toThrow(fragment)
  }
}

describe('drawers round-trip through the project file', () => {
  it('parses what it serialized, byte-identically on a second pass', () => {
    const text = serializeProject(scene, metadata)
    expect(text).toContain('\n  "schemaVersion": 4,\n')
    const document = parseProject(text)
    expect(document.scene).toEqual(scene)
    expect(serializeProject(document.scene, document.metadata)).toBe(text)
  })

  it('writes the ladekast layout in template order and every drawer entry in a fixed order', () => {
    const document: unknown = JSON.parse(serializeProject(scene, metadata))
    const root = node(document)
    expect(Object.keys(params(root, 0))).toEqual([
      'widthMm',
      'heightMm',
      'depthMm',
      'drawerCount',
      'shallowDrawerCount',
      'shallowFrontHeightMm',
      'carcassMaterialId',
      'backMaterialId',
      'edgeBandMaterialId'
    ])
    expect(Object.keys(drawerEntry(root, 0))).toEqual([
      'id',
      'originMm',
      'widthMm',
      'heightMm',
      'frontMaterialId',
      'boxMaterialId',
      'bottomMaterialId',
      'edgeBandMaterialId'
    ])
    expect(Object.keys(node(drawerEntry(root, 0), 'originMm'))).toEqual(['x', 'y'])
    expect(Object.keys(params(root, 3))).toEqual([
      'widthMm',
      'heightMm',
      'depthMm',
      'drawerFrontHeightMm',
      'shelfCount',
      'doorCount',
      'carcassMaterialId',
      'backMaterialId',
      'edgeBandMaterialId'
    ])
  })

  it('saves and reopens the floating TV unit: hanging, its drawer intact, priced the same', () => {
    const reopened = parseProject(serializeProject(scene, metadata)).scene.cabinets[2]
    expect(reopened).toEqual(scene.cabinets[2])
    const design = reopened.design
    expect(design.kind === 'custom-piece' && design.spec.mountingHeightMm).toBe(450)
    expect(design.kind === 'custom-piece' && design.spec.drawers).toHaveLength(1)
    const quote = quoteForDesign(design, fixtureDb)
    expect(quote).toEqual(quoteForDesign(scene.cabinets[2].design, fixtureDb))
    expect(quote.lines.find((line) => line.materialId === 'drawer-slide-pair')?.quantity).toBe(1)
    expect(quote.lines.find((line) => line.materialId === 'handle-standard')?.quantity).toBe(1)
  })
})

describe('schema 3 → 4', () => {
  // What a v3 writer could hold: a plain ladekast, and a custom piece of panels only.
  const v3Scene: SceneDesign = {
    room,
    worktop: createDefaultWorktopSettings(),
    cabinets: [
      { id: 'cab-1', design: createDefaultDesign('drawer-cabinet'), positionX: -1500, positionZ: -1720, rotationDeg: 0 },
      {
        id: 'cab-2',
        design: {
          kind: 'custom-piece',
          spec: withPresets({ ...createDefaultCustomPieceSpec('Kastje'), widthMm: 800 }, 'side', 'side', 'bottom')
        },
        positionX: -800,
        positionZ: -1800,
        rotationDeg: 0
      }
    ]
  }

  /** The v3 scene's file as the Phase 9 build wrote it: no shallow-drawer params, no drawer list. */
  function olderFile(schemaVersion: number, edit: (document: Record<string, unknown>) => void = () => {}): string {
    return editedFrom(v3Scene, (document) => {
      document.schemaVersion = schemaVersion
      delete params(document, 0).shallowDrawerCount
      delete params(document, 0).shallowFrontHeightMm
      delete spec(document, 1).drawers
      edit(document)
    })
  }

  it('opens a v3 ladekast with equal fronts — exactly the pinned Phase 3 build', () => {
    const document = parseProject(olderFile(3))
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(document.scene).toEqual(v3Scene)
    const loaded = document.scene.cabinets[0].design
    if (loaded.kind !== 'drawer-cabinet') {
      throw new Error('expected the ladekast')
    }
    expect(loaded.params.shallowDrawerCount).toBe(0)
    const equal = drawerFrontHeightMm(loaded.params, 3)
    expect(drawerFrontLayout(loaded.params).map((slot) => slot.heightMm)).toEqual([equal, equal, equal])
    expect(generateCabinet(loaded)).toEqual(generateDrawerCabinet(createDefaultDrawerCabinetParams()))
    expect(serializeProject(document.scene, document.metadata)).toContain('\n  "schemaVersion": 4,\n')
  })

  it('gives a v3 custom piece an empty drawer list', () => {
    const loaded = parseProject(olderFile(3)).scene.cabinets[1].design
    expect(loaded.kind === 'custom-piece' && loaded.spec.drawers).toEqual([])
  })

  it('walks a v1 file all the way to 4', () => {
    const document = parseProject(
      olderFile(1, (document) => {
        delete node(document, 'scene').worktop
      })
    )
    expect(document.schemaVersion).toBe(4)
    expect(document.scene).toEqual(v3Scene)
  })

  it('refuses a v3 file that already carries a Phase 10 field, rather than overwrite it', () => {
    expectRefusal(
      olderFile(3, (document) => {
        params(document, 0).shallowDrawerCount = 1
      }),
      /cabinet cab-1: scene\.cabinets\[0\]\.design\.params\.shallowDrawerCount is not a known field in schema 3/
    )
    expectRefusal(
      olderFile(3, (document) => {
        spec(document, 1).drawers = []
      }),
      /cabinet cab-2: scene\.cabinets\[1\]\.design\.spec\.drawers is not a known field in schema 3/
    )
  })

  it('leaves a malformed v3 cabinet to the decoder to name', () => {
    expectRefusal(
      olderFile(3, (document) => {
        node(document, 'scene', 'cabinets', 0).design = 'none'
      }),
      /scene\.cabinets\[0\]\.design must be an object/
    )
  })
})

describe('corrupt drawer data is refused, naming the culprit', () => {
  it('the onderkast met lade with out-of-range params', () => {
    expectRefusal(
      edited((document) => {
        params(document, 3).widthMm = 1500
      }),
      /cabinet cab-4/,
      /scene\.cabinets\[3\]\.design\.params\.widthMm must be between 300 and 1200 \(got 1500\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 3).drawerFrontHeightMm = 50
      }),
      /params\.drawerFrontHeightMm must be between 96 and 300 \(got 50\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 3).heightMm = 400
        params(document, 3).drawerFrontHeightMm = 250
      }),
      /params\.drawerFrontHeightMm must be at most 193 in a 400 mm carcass, so the doors keep 200 mm \(got 250\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 3).widthMm = 900
        params(document, 3).doorCount = 1
      }),
      /params\.doorCount 1 needs a width of at most 600 mm \(got 900\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 3).shelfCount = 2.5
      }),
      /params\.shelfCount must be an integer \(got 2\.5\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 3).drawerCount = 2
      }),
      /params\.drawerCount is not a field of drawer-door-cabinet/
    )
  })

  it('invalid ladekast layouts', () => {
    expectRefusal(
      edited((document) => {
        params(document, 0).shallowDrawerCount = 3
      }),
      /cabinet cab-1/,
      /scene\.cabinets\[0\]\.design\.params\.shallowDrawerCount must be an integer between 0 and 2 \(got 3\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 0).shallowFrontHeightMm = 300
      }),
      /params\.shallowFrontHeightMm must be at most 236 for 3 drawers in 720 mm/
    )
    expectRefusal(
      edited((document) => {
        params(document, 0).shallowFrontHeightMm = 60
      }),
      /params\.shallowFrontHeightMm must be between 96 and 500 \(got 60\)/
    )
    expectRefusal(
      edited((document) => {
        params(document, 0).shallowDrawerCount = '1'
      }),
      /params\.shallowDrawerCount must be a number/
    )
    expectRefusal(
      edited((document) => {
        delete params(document, 0).shallowFrontHeightMm
      }),
      /params\.shallowFrontHeightMm is missing/
    )
  })

  it('a drawer off the front face, or in a piece too shallow for a slide', () => {
    expectRefusal(
      edited((document) => {
        node(drawerEntry(document, 0), 'originMm').x = 100
      }),
      /cabinet cab-2/,
      /design\.spec\.drawers\[0\] lies outside the front face on x \(100–696 vs 0–600\)/
    )
    expectRefusal(
      edited((document) => {
        node(drawerEntry(document, 2), 'originMm').y = 600
      }),
      /design\.spec\.drawers\[2\] lies outside the front face on y \(600–750 vs 0–720\)/
    )
    expectRefusal(
      edited((document) => {
        spec(document, 1).depthMm = 250
      }),
      /design\.spec\.depthMm must be at least 270 while the piece has drawers \(got 250\)/
    )
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 0).widthMm = 1300
      }),
      /design\.spec\.drawers\[0\]\.widthMm must be between 150 and 1200 \(got 1300\)/
    )
  })

  it('drawer entry shapes and ids', () => {
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 0).softClose = true
      }),
      /design\.spec\.drawers\[0\]\.softClose is not a known field/
    )
    expectRefusal(
      edited((document) => {
        node(drawerEntry(document, 0), 'originMm').z = 560
      }),
      /drawers\[0\]\.originMm\.z is not a known field/
    )
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 1).id = 'drawer-1'
      }),
      /drawers\[1\]\.id is a duplicate of drawers\[0\]\.id \(drawer-1\)/
    )
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 0).id = 'lade-1'
      }),
      /drawers\[0\]\.id must look like drawer-<n> \(got "lade-1"\)/
    )
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 0).frontMaterialId = 7
      }),
      /drawers\[0\]\.frontMaterialId must be a string \(got 7\)/
    )
    expectRefusal(
      edited((document) => {
        drawerEntry(document, 0).widthMm = '596'
      }),
      /drawers\[0\]\.widthMm must be a finite number/
    )
    expectRefusal(
      edited((document) => {
        spec(document, 1).drawers = 'none'
      }),
      /design\.spec\.drawers must be an array/
    )
    expectRefusal(
      edited((document) => {
        delete spec(document, 1).drawers
      }),
      /design\.spec\.drawers is missing/
    )
  })
})
