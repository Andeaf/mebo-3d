import { describe, expect, it } from 'vitest'
import type { CabinetDesign } from '@core/cabinet'
import { createDefaultDesign } from '@core/catalog/registry'
import {
  addPresetPanel,
  createDefaultCustomPieceSpec,
  MAX_PANELS_PER_PIECE,
  type CustomPieceSpec
} from '@core/customPiece'
import {
  parseProject,
  serializeProject,
  ProjectParseError,
  PROJECT_SCHEMA_VERSION,
  type ProjectMetadata
} from '@core/project'
import type { PlacedCabinet, SceneDesign } from '@core/scene'

// A TV unit built through the presets (carcass, shelf, two fronts) with
// hinges and handles, standing in a 5000 × 4000 room beside a base cabinet
// and under a hanging custom shelf unit.
function tvUnit(): CustomPieceSpec {
  let spec: CustomPieceSpec = {
    ...createDefaultCustomPieceSpec('TV-wand'),
    widthMm: 1800,
    heightMm: 500,
    depthMm: 400
  }
  for (const preset of ['side', 'side', 'top', 'bottom', 'back', 'shelf', 'front'] as const) {
    spec = addPresetPanel(spec, preset)!.spec
  }
  // Two doors: halve the first front, let the preset fill the rest.
  const front = spec.panels[6]
  spec = { ...spec, panels: [...spec.panels.slice(0, 6), { ...front, widthMm: 896 }] }
  spec = addPresetPanel(spec, 'front')!.spec
  return {
    ...spec,
    hardware: [
      { materialId: 'hinge-standard', quantity: 4 },
      { materialId: 'handle-standard', quantity: 2 }
    ]
  }
}

const room = { widthMm: 5000, lengthMm: 4000, wallHeightMm: 2400 }

const piece: CabinetDesign = { kind: 'custom-piece', spec: tvUnit() }
const hangingShelves: CabinetDesign = {
  kind: 'custom-piece',
  spec: {
    ...createDefaultCustomPieceSpec(''),
    widthMm: 1800,
    heightMm: 300,
    depthMm: 250,
    mountingHeightMm: 1400,
    panels: addPresetPanel(
      { ...createDefaultCustomPieceSpec(''), widthMm: 1800, heightMm: 300, depthMm: 250 },
      'bottom'
    )!.spec.panels
  }
}

const cabinets: readonly PlacedCabinet[] = [
  { id: 'cab-1', design: createDefaultDesign('base-cabinet'), positionX: -1500, positionZ: -1720, rotationDeg: 0 },
  { id: 'cab-2', design: piece, positionX: -300, positionZ: -1800, rotationDeg: 0 },
  { id: 'cab-3', design: hangingShelves, positionX: -300, positionZ: -1875, rotationDeg: 0 }
]

const scene: SceneDesign = { room, cabinets }

const metadata: ProjectMetadata = {
  projectName: 'Woonkamer De Vries',
  createdAt: '2026-09-07T20:10:00.000Z',
  modifiedAt: '2026-09-07T21:45:30.000Z',
  appVersion: '0.1.0'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

/** The reference file with one hand-edit applied, as text. */
function edited(edit: (document: Record<string, unknown>) => void): string {
  const document: unknown = JSON.parse(serializeProject(scene, metadata))
  if (!isObject(document)) {
    throw new Error('serialized project is not an object')
  }
  edit(document)
  return JSON.stringify(document)
}

/** The TV unit's spec node inside the reference file. */
function spec(document: Record<string, unknown>): Record<string, unknown> {
  return node(document, 'scene', 'cabinets', 1, 'design', 'spec')
}

function panel(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return node(document, 'scene', 'cabinets', 1, 'design', 'spec', 'panels', index)
}

function expectRefusal(text: string, ...fragments: readonly (string | RegExp)[]): void {
  expect(() => parseProject(text)).toThrow(ProjectParseError)
  for (const fragment of fragments) {
    expect(() => parseProject(text)).toThrow(fragment)
  }
}

describe('custom pieces round-trip through the project file', () => {
  it('parses what it serialized, byte-identically on a second pass', () => {
    const text = serializeProject(scene, metadata)
    const document = parseProject(text)
    expect(document.scene).toEqual(scene)
    expect(serializeProject(document.scene, document.metadata)).toBe(text)
    expect(text).toContain('\n  "schemaVersion": 2,\n')
  })

  it('writes the spec, its panels and their nested objects in a fixed key order', () => {
    const document: unknown = JSON.parse(serializeProject(scene, metadata))
    const root = node(document)
    expect(Object.keys(node(root, 'scene', 'cabinets', 1, 'design'))).toEqual(['kind', 'spec'])
    expect(Object.keys(spec(root))).toEqual([
      'name',
      'widthMm',
      'heightMm',
      'depthMm',
      'mountingHeightMm',
      'panels',
      'hardware'
    ])
    expect(Object.keys(panel(root, 0))).toEqual([
      'id',
      'role',
      'materialId',
      'lengthMm',
      'widthMm',
      'thicknessMm',
      'edgeBanding',
      'orientation',
      'originMm'
    ])
    expect(Object.keys(node(panel(root, 0), 'originMm'))).toEqual(['x', 'y', 'z'])
    expect(Object.keys(node(panel(root, 0), 'edgeBanding'))).toEqual(['materialId', 'edges'])
    expect(panel(root, 4).edgeBanding).toBeNull()
    expect(Object.keys(node(spec(root), 'hardware', 0))).toEqual(['materialId', 'quantity'])
  })

  it('keeps an empty name and a hanging piece', () => {
    const loaded = parseProject(serializeProject(scene, metadata)).scene.cabinets[2].design
    expect(loaded.kind === 'custom-piece' && loaded.spec.name).toBe('')
    expect(loaded.kind === 'custom-piece' && loaded.spec.mountingHeightMm).toBe(1400)
  })

  it('stores no prices: unknown board, band and hardware ids still load', () => {
    const text = edited((document) => {
      panel(document, 0).materialId = 'discontinued-board'
      node(panel(document, 0), 'edgeBanding').materialId = 'discontinued-band'
      node(spec(document), 'hardware', 0).materialId = 'discontinued-hinge'
    })
    const loaded = parseProject(text).scene.cabinets[1].design
    expect(loaded.kind === 'custom-piece' && loaded.spec.panels[0].materialId).toBe('discontinued-board')
    expect(loaded.kind === 'custom-piece' && loaded.spec.hardware[0].materialId).toBe('discontinued-hinge')
  })
})

describe('schema 1 → 2', () => {
  it('opens a Phase 5 file through the stamping migration and re-saves it as v2', () => {
    const catalogOnly: SceneDesign = { room, cabinets: [cabinets[0]] }
    const v1 = serializeProject(catalogOnly, metadata).replace('"schemaVersion": 2', '"schemaVersion": 1')
    expect(v1).toContain('"schemaVersion": 1')
    const document = parseProject(v1)
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(document.scene).toEqual(catalogOnly)
    expect(serializeProject(document.scene, document.metadata)).toContain('"schemaVersion": 2')
  })

  it('still refuses schema 0 (no migration) and schema 3 (newer)', () => {
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 0
      }),
      /no migration from schema 0 to 1/
    )
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 3
      }),
      /newer version/
    )
  })
})

describe('corrupt custom pieces are refused, naming the culprit', () => {
  it('design shape', () => {
    expectRefusal(
      edited((document) => {
        const design = node(document, 'scene', 'cabinets', 1, 'design')
        design.params = design.spec
        delete design.spec
      }),
      /cabinet cab-2/,
      /scene\.cabinets\[1\]\.design\.params is not a known field/
    )
    expectRefusal(edited((document) => delete node(document, 'scene', 'cabinets', 1, 'design').spec), /design\.spec is missing/)
    // A catalog cabinet must not carry a spec either.
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design').spec = {}
      }),
      /scene\.cabinets\[0\]\.design\.spec is not a known field/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design').kind = 'corner-cabinet'
      }),
      /not a known cabinet kind \(known: .*custom-piece\)/
    )
  })

  it('spec fields', () => {
    expectRefusal(
      edited((document) => {
        spec(document).colour = 'oak'
      }),
      /design\.spec\.colour is not a known field/
    )
    expectRefusal(edited((document) => delete spec(document).name), /design\.spec\.name is missing/)
    expectRefusal(
      edited((document) => {
        spec(document).name = 'x'.repeat(61)
      }),
      /design\.spec\.name must be at most 60 characters/
    )
    expectRefusal(
      edited((document) => {
        spec(document).widthMm = '1800'
      }),
      /design\.spec\.widthMm must be a finite number/
    )
    expectRefusal(
      edited((document) => {
        spec(document).widthMm = 5000
      }),
      /cabinet cab-2/,
      /design\.spec\.widthMm must be between 100 and 4000 \(got 5000\)/
    )
    expectRefusal(
      edited((document) => {
        spec(document).mountingHeightMm = -5
      }),
      /design\.spec\.mountingHeightMm must be between 0 and 2200/
    )
    expectRefusal(
      edited((document) => {
        spec(document).panels = 'none'
      }),
      /design\.spec\.panels must be an array/
    )
  })

  it('panel shapes', () => {
    expectRefusal(
      edited((document) => {
        spec(document).panels = [42]
      }),
      /design\.spec\.panels\[0\] must be an object/
    )
    expectRefusal(
      edited((document) => {
        panel(document, 0).grain = 'vertical'
      }),
      /design\.spec\.panels\[0\]\.grain is not a known field/
    )
    expectRefusal(edited((document) => delete panel(document, 2).lengthMm), /panels\[2\]\.lengthMm is missing/)
    expectRefusal(
      edited((document) => {
        panel(document, 0).role = 'drawer-box-side'
      }),
      /panels\[0\]\.role must be one of side-left, side-right, top, bottom, shelf, divider, back, front \(got "drawer-box-side"\)/
    )
    expectRefusal(
      edited((document) => {
        panel(document, 0).orientation = 'diagonal'
      }),
      /panels\[0\]\.orientation must be one of yz, xz, xy \(got "diagonal"\)/
    )
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'originMm').w = 1
      }),
      /panels\[0\]\.originMm\.w is not a known field/
    )
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'originMm').y = null
      }),
      /panels\[0\]\.originMm\.y must be a finite number/
    )
  })

  it('edge banding', () => {
    expectRefusal(edited((document) => delete panel(document, 0).edgeBanding), /panels\[0\]\.edgeBanding is missing/)
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'edgeBanding').edges = ['top']
      }),
      /panels\[0\]\.edgeBanding\.edges\[0\] must be one of length-1, length-2, width-1, width-2 \(got "top"\)/
    )
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'edgeBanding').edges = []
      }),
      /panels\[0\]\.edgeBanding\.edges must name at least one edge/
    )
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'edgeBanding').edges = ['length-1', 'length-1']
      }),
      /panels\[0\]\.edgeBanding\.edges lists length-1 twice/
    )
    expectRefusal(
      edited((document) => {
        node(panel(document, 0), 'edgeBanding').thickness = 1
      }),
      /panels\[0\]\.edgeBanding\.thickness is not a known field/
    )
  })

  it('ids, the envelope and the panel limit are validated, never repaired', () => {
    expectRefusal(
      edited((document) => {
        panel(document, 1).id = 'panel-1'
      }),
      /panels\[1\]\.id is a duplicate of panels\[0\]\.id \(panel-1\)/
    )
    expectRefusal(
      edited((document) => {
        panel(document, 1).id = 'right-side'
      }),
      /panels\[1\]\.id must look like panel-<n>/
    )
    // The right side pushed 1 mm through the right face.
    expectRefusal(
      edited((document) => {
        node(panel(document, 1), 'originMm').x = 1783
      }),
      /cabinet cab-2/,
      /panels\[1\] lies outside the envelope on x \(1783–1801 vs 0–1800\)/
    )
    // A front is allowed in the overlay zone but not beyond it.
    expectRefusal(
      edited((document) => {
        node(panel(document, 6), 'originMm').z = 401
      }),
      /panels\[6\] lies outside the envelope on z/
    )
    expectRefusal(
      edited((document) => {
        const first = panel(document, 0)
        spec(document).panels = Array.from({ length: MAX_PANELS_PER_PIECE + 1 }, (_, i) => ({
          ...first,
          id: `panel-${i + 1}`
        }))
      }),
      /panels must hold at most 60 panels \(got 61\)/
    )
  })

  it('hardware', () => {
    expectRefusal(
      edited((document) => {
        node(spec(document), 'hardware', 0).quantity = 2.5
      }),
      /hardware\[0\]\.quantity must be an integer between 1 and 999 \(got 2.5\)/
    )
    expectRefusal(
      edited((document) => {
        node(spec(document), 'hardware', 1).materialId = 'hinge-standard'
      }),
      /hardware\[1\]\.materialId is a duplicate \(hinge-standard\)/
    )
    expectRefusal(
      edited((document) => {
        node(spec(document), 'hardware', 0).unitPriceEur = 3.4
      }),
      /hardware\[0\]\.unitPriceEur is not a known field/
    )
  })

  it('scene invariants hold for pieces too', () => {
    // The TV unit dropped onto the base cabinet (both on the floor).
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 1).positionX = -1500
        node(document, 'scene', 'cabinets', 1).positionZ = -1720
      }),
      /cabinets cab-1 and cab-2 overlap/
    )
    // The hanging shelves lowered onto the TV unit.
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 2, 'design', 'spec').mountingHeightMm = 300
      }),
      /cabinets cab-2 and cab-3 overlap/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 1).positionX = 2000
      }),
      /cabinet cab-2 lies outside the room/
    )
  })
})
