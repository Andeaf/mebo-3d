import { describe, expect, it } from 'vitest'
import { CABINET_KINDS, createDefaultDesign, decodeParams } from '@core/catalog/registry'
import {
  parseProject,
  serializeProject,
  ProjectParseError,
  PROJECT_SCHEMA_VERSION,
  type ProjectMetadata
} from '@core/project'
import { nextCabinetNumberFor, type PlacedCabinet, type SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings } from '@core/worktop'

// A 5000 × 4000 room (non-default) holding every kind, every rotation, a
// hanging cabinet above a standing one, and a gap in the id sequence.
const room = { widthMm: 5000, lengthMm: 4000, wallHeightMm: 2400 }

const cabinets: readonly PlacedCabinet[] = [
  // Back wall, back to the wall.
  { id: 'cab-1', design: createDefaultDesign('base-cabinet'), positionX: -1000, positionZ: -1720, rotationDeg: 0 },
  // Hanging over cab-1: same floor rect, disjoint vertical interval.
  { id: 'cab-2', design: createDefaultDesign('wall-cabinet'), positionX: -1000, positionZ: -1840, rotationDeg: 0 },
  // Left wall, turned to face +X (rotated footprint 560 × 600).
  { id: 'cab-3', design: createDefaultDesign('tall-cabinet'), positionX: -2220, positionZ: 0, rotationDeg: 90 },
  // Front wall, facing -Z.
  { id: 'cab-4', design: createDefaultDesign('drawer-cabinet'), positionX: 500, positionZ: 1720, rotationDeg: 180 },
  // Right wall, facing -X; id skips ahead.
  { id: 'cab-7', design: createDefaultDesign('base-cabinet'), positionX: 2220, positionZ: 800, rotationDeg: 270 }
]

const scene: SceneDesign = { room, worktop: createDefaultWorktopSettings(), cabinets }

const metadata: ProjectMetadata = {
  projectName: 'Keuken Jansen',
  createdAt: '2026-09-03T09:12:44.000Z',
  modifiedAt: '2026-09-03T10:40:02.000Z',
  appVersion: '0.1.0'
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

/** The reference file with one hand-edit applied, as text. */
function edited(edit: (document: Record<string, unknown>) => void): string {
  const document: unknown = JSON.parse(serializeProject(scene, metadata))
  if (!isObject(document)) {
    throw new Error('serialized project is not an object')
  }
  edit(document)
  return JSON.stringify(document)
}

function expectRefusal(text: string, ...fragments: readonly (string | RegExp)[]): void {
  expect(() => parseProject(text)).toThrow(ProjectParseError)
  for (const fragment of fragments) {
    expect(() => parseProject(text)).toThrow(fragment)
  }
}

describe('project round trip', () => {
  it('parses what it serialized, byte-identically on a second pass', () => {
    const text = serializeProject(scene, metadata)
    const document = parseProject(text)
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(document.metadata).toEqual(metadata)
    expect(document.scene).toEqual(scene)
    expect(serializeProject(document.scene, document.metadata)).toBe(text)
  })

  it('round-trips an empty room', () => {
    const empty: SceneDesign = { room, worktop: createDefaultWorktopSettings(), cabinets: [] }
    expect(parseProject(serializeProject(empty, metadata)).scene).toEqual(empty)
  })

  it('writes pretty-printed JSON with a fixed key order', () => {
    const text = serializeProject(scene, metadata)
    expect(text).toContain('\n  "schemaVersion": 3,\n')
    const document: unknown = JSON.parse(text)
    expect(Object.keys(node(document))).toEqual(['schemaVersion', 'metadata', 'scene'])
    expect(Object.keys(node(document, 'metadata'))).toEqual([
      'projectName',
      'createdAt',
      'modifiedAt',
      'appVersion'
    ])
    expect(Object.keys(node(document, 'scene'))).toEqual(['room', 'worktop', 'cabinets'])
    expect(Object.keys(node(document, 'scene', 'room'))).toEqual(['widthMm', 'lengthMm', 'wallHeightMm'])
    expect(Object.keys(node(document, 'scene', 'cabinets', 0))).toEqual([
      'id',
      'design',
      'positionX',
      'positionZ',
      'rotationDeg'
    ])
    expect(Object.keys(node(document, 'scene', 'cabinets', 0, 'design'))).toEqual(['kind', 'params'])
  })

  it('stores no prices: a discontinued material id still loads', () => {
    const text = edited((document) => {
      node(document, 'scene', 'cabinets', 0, 'design', 'params').carcassMaterialId = 'discontinued-board'
    })
    const loaded = parseProject(text).scene.cabinets[0]
    expect(loaded.design.kind === 'base-cabinet' && loaded.design.params.carcassMaterialId).toBe(
      'discontinued-board'
    )
  })
})

describe('schema version', () => {
  it('refuses a file from a newer app', () => {
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 4
      }),
      /newer version/,
      /schema 4/
    )
  })

  it('names schemaVersion when it is missing or not an integer', () => {
    expectRefusal(edited((document) => delete document.schemaVersion), /schemaVersion is missing/)
    expectRefusal(
      edited((document) => {
        document.schemaVersion = '1'
      }),
      /schemaVersion must be an integer/
    )
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 1.5
      }),
      /schemaVersion must be an integer/
    )
  })

  it('runs an older file through the migration chain (which has no step yet)', () => {
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 0
      }),
      /no migration from schema 0/
    )
  })
})

describe('corrupt files are refused, naming the culprit', () => {
  it('invalid JSON and non-object roots', () => {
    expectRefusal('{', /not valid JSON/)
    expectRefusal('[]', /project file must be an object/)
    expectRefusal('42', /project file must be an object/)
  })

  it('missing or unknown fields at every level', () => {
    expectRefusal(edited((document) => delete document.scene), /scene is missing/)
    expectRefusal(edited((document) => delete document.metadata), /metadata is missing/)
    expectRefusal(
      edited((document) => {
        document.notes = 'hand-written'
      }),
      /notes is not a known field/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'metadata').author = 'x'
      }),
      /metadata\.author is not a known field/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0).positionY = 100
      }),
      /scene\.cabinets\[0\]\.positionY is not a known field/
    )
    expectRefusal(edited((document) => delete node(document, 'scene').cabinets), /scene\.cabinets is missing/)
    expectRefusal(
      edited((document) => {
        node(document, 'scene').cabinets = 'none'
      }),
      /scene\.cabinets must be an array/
    )
  })

  it('metadata', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'metadata').createdAt = 'yesterday'
      }),
      /metadata\.createdAt must be an ISO 8601 date/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'metadata').projectName = 7
      }),
      /metadata\.projectName must be a string/
    )
  })

  it('room', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'room').widthMm = '4000'
      }),
      /scene\.room\.widthMm must be a finite number/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'room').widthMm = 500
      }),
      /scene\.room\.widthMm must be between/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'room').ceilingMm = 2600
      }),
      /scene\.room\.ceilingMm is not a known field/
    )
  })

  it('cabinet kind and params', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design').kind = 'corner-cabinet'
      }),
      /corner-cabinet/,
      /not a known cabinet kind/
    )
    expectRefusal(
      edited((document) => {
        const params = node(document, 'scene', 'cabinets', 0, 'design', 'params')
        params.widhtMm = params.widthMm
        delete params.widthMm
      }),
      /cabinet cab-1/,
      /widhtMm is not a field of base-cabinet|widthMm is missing/
    )
    expectRefusal(
      edited((document) => delete node(document, 'scene', 'cabinets', 2, 'design', 'params').depthMm),
      /cabinet cab-3/,
      /scene\.cabinets\[2\]\.design\.params\.depthMm is missing/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design', 'params').widthMm = '600'
      }),
      /params\.widthMm must be a number/
    )
  })

  it('out-of-range values are refused, never clamped', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design', 'params').widthMm = 1500
      }),
      /cabinet cab-1/,
      /widthMm must be between 300 and 1200 \(got 1500\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design', 'params').doorCount = 5
      }),
      /doorCount must be one of 0, 1, 2 \(got 5\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0, 'design', 'params').topConstruction = 'lid'
      }),
      /topConstruction must be one of stretchers, panel \(got lid\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 1, 'design', 'params').mountingHeightMm = 5000
      }),
      /cabinet cab-2/,
      /mountingHeightMm must be between/
    )
  })

  it('placement fields', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0).rotationDeg = 45
      }),
      /cabinet cab-1/,
      /rotationDeg must be one of 0, 90, 180, 270 \(got 45\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0).positionX = null
      }),
      /scene\.cabinets\[0\]\.positionX must be a finite number/
    )
  })

  it('cabinet ids', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0).id = 'kitchen-left'
      }),
      /kitchen-left/,
      /must look like cab-<n>/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 3).id = 'cab-1'
      }),
      /scene\.cabinets\[3\]\.id is a duplicate/,
      /cab-1/
    )
  })

  it('scene invariants: overlap and containment', () => {
    // cab-7 moved exactly onto cab-4.
    expectRefusal(
      edited((document) => {
        const seventh = node(document, 'scene', 'cabinets', 4)
        seventh.positionX = 500
        seventh.positionZ = 1720
        seventh.rotationDeg = 180
      }),
      /cabinets cab-4 and cab-7 overlap/
    )
    // cab-1 pushed through the left wall.
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'cabinets', 0).positionX = -2400
      }),
      /cabinet cab-1 lies outside the room/
    )
  })

  it('a hanging cabinet over a standing one is not overlap', () => {
    // The reference scene already has cab-2 over cab-1; make sure that is
    // what the invariant check accepts, not an accident of the layout.
    const loaded = parseProject(serializeProject(scene, metadata)).scene
    expect(loaded.cabinets[1].positionX).toBe(loaded.cabinets[0].positionX)
  })
})

describe('registry template decoder', () => {
  it('decodes every kind\'s own defaults back unchanged', () => {
    for (const kind of CABINET_KINDS) {
      const defaults = createDefaultDesign(kind).params
      expect(decodeParams(kind, defaults)).toEqual(defaults)
    }
  })

  it('every kind keeps its params total and scalar (the decoder\'s precondition)', () => {
    for (const kind of CABINET_KINDS) {
      for (const [key, value] of Object.entries(createDefaultDesign(kind).params)) {
        expect(['number', 'string', 'boolean'], `${kind}.${key}`).toContain(typeof value)
      }
    }
  })

  it('rejects unknown keys, missing keys and wrong types', () => {
    const defaults = createDefaultDesign('drawer-cabinet').params
    expect(() => decodeParams('drawer-cabinet', { ...defaults, doorCount: 2 })).toThrow(
      /params\.doorCount is not a field of drawer-cabinet/
    )
    expect(() => decodeParams('drawer-cabinet', { ...defaults, drawerCount: '3' })).toThrow(
      /params\.drawerCount must be a number/
    )
    expect(() => decodeParams('drawer-cabinet', 'x')).toThrow(/params must be an object/)
    expect(() => decodeParams('drawer-cabinet', { ...defaults, widthMm: Number.NaN })).toThrow(
      /params\.widthMm must be a finite number/
    )
  })
})

describe('cabinet numbering', () => {
  it('derives the next free number from the highest id', () => {
    expect(nextCabinetNumberFor(scene)).toBe(8)
    expect(nextCabinetNumberFor({ room, worktop: createDefaultWorktopSettings(), cabinets: [] })).toBe(1)
  })
})
