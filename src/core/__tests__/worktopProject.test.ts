import { describe, expect, it } from 'vitest'
import { createDefaultDesign } from '@core/catalog/registry'
import {
  parseProject,
  serializeProject,
  ProjectParseError,
  PROJECT_SCHEMA_VERSION,
  type ProjectMetadata
} from '@core/project'
import type { SceneDesign } from '@core/scene'
import { createDefaultWorktopSettings, type WorktopSettings } from '@core/worktop'

// Non-default settings on purpose: every field must survive the round trip.
const worktop: WorktopSettings = {
  enabled: false,
  materialId: 'worktop-oak-40',
  thicknessMm: 40,
  frontOverhangMm: 45
}

const scene: SceneDesign = {
  room: { widthMm: 4000, lengthMm: 3000, wallHeightMm: 2600 },
  worktop,
  cabinets: [
    { id: 'cab-1', design: createDefaultDesign('base-cabinet'), positionX: -1700, positionZ: -1220, rotationDeg: 0 },
    { id: 'cab-2', design: createDefaultDesign('drawer-cabinet'), positionX: -1100, positionZ: -1220, rotationDeg: 0 }
  ]
}

const metadata: ProjectMetadata = {
  projectName: 'Keuken Bakker',
  createdAt: '2026-09-18T08:00:00.000Z',
  modifiedAt: '2026-09-18T08:30:00.000Z',
  appVersion: '0.1.0'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function node(root: unknown, ...path: readonly string[]): Record<string, unknown> {
  let current: unknown = root
  for (const key of path) {
    if (!isObject(current)) {
      throw new Error(`expected an object before .${key}`)
    }
    current = current[key]
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

describe('worktop settings in the project file', () => {
  it('round-trips non-default settings byte-identically', () => {
    const text = serializeProject(scene, metadata)
    const document = parseProject(text)
    expect(document.scene.worktop).toEqual(worktop)
    expect(document.scene).toEqual(scene)
    expect(serializeProject(document.scene, document.metadata)).toBe(text)
  })

  it('writes the scene as room, worktop, cabinets and the four settings in a fixed order', () => {
    const document: unknown = JSON.parse(serializeProject(scene, metadata))
    expect(Object.keys(node(document, 'scene'))).toEqual(['room', 'worktop', 'cabinets'])
    expect(Object.keys(node(document, 'scene', 'worktop'))).toEqual([
      'enabled',
      'materialId',
      'thicknessMm',
      'frontOverhangMm'
    ])
  })

  it('stores no prices: a discontinued worktop material id still loads', () => {
    const text = edited((document) => {
      node(document, 'scene', 'worktop').materialId = 'discontinued-worktop'
    })
    expect(parseProject(text).scene.worktop.materialId).toBe('discontinued-worktop')
  })
})

describe('schema 2 → 3', () => {
  /**
   * The reference file as an older writer would have produced it: no
   * `scene.worktop`, and no Phase 10 shallow-drawer fields on the ladekast.
   */
  function olderFile(schemaVersion: number): string {
    return edited((document) => {
      document.schemaVersion = schemaVersion
      delete node(document, 'scene').worktop
      const cabinets = node(document, 'scene').cabinets
      if (!Array.isArray(cabinets)) {
        throw new Error('the reference file has no cabinet list')
      }
      const drawerParams = node(cabinets[1], 'design', 'params')
      delete drawerParams.shallowDrawerCount
      delete drawerParams.shallowFrontHeightMm
    })
  }

  it('fills the default settings for a v2 file and re-saves it as v4', () => {
    const document = parseProject(olderFile(2))
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(document.scene.worktop).toEqual(createDefaultWorktopSettings())
    expect(document.scene.cabinets).toEqual(scene.cabinets)
    expect(serializeProject(document.scene, document.metadata)).toContain('\n  "schemaVersion": 4,\n')
  })

  it('walks a v1 file through every migration', () => {
    const document = parseProject(olderFile(1))
    expect(document.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(document.scene.worktop).toEqual(createDefaultWorktopSettings())
  })

  it('refuses a v2 file that already carries scene.worktop instead of overwriting it', () => {
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 2
      }),
      /scene\.worktop is not a known field in schema 2/
    )
  })

  it('refuses schema 5 as made with a newer version', () => {
    expectRefusal(
      edited((document) => {
        document.schemaVersion = 5
      }),
      /newer version/,
      /schema 5/
    )
  })
})

describe('corrupt worktop settings are refused, naming the culprit', () => {
  it('a missing or non-object block', () => {
    expectRefusal(
      edited((document) => {
        delete node(document, 'scene').worktop
      }),
      /scene\.worktop is missing/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene').worktop = null
      }),
      /scene\.worktop must be an object \(got null\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene').worktop = 'yes'
      }),
      /scene\.worktop must be an object \(got "yes"\)/
    )
  })

  it('wrong primitive types', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').enabled = 'yes'
      }),
      /scene\.worktop\.enabled must be a boolean \(got "yes"\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').materialId = 7
      }),
      /scene\.worktop\.materialId must be a string \(got 7\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').thicknessMm = '38'
      }),
      /scene\.worktop\.thicknessMm must be a finite number \(got "38"\)/
    )
  })

  it('out-of-range values are refused, never clamped', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').thicknessMm = 80
      }),
      /scene\.worktop\.thicknessMm must be between 12 and 60 \(got 80\)/
    )
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').frontOverhangMm = -5
      }),
      /scene\.worktop\.frontOverhangMm must be between 0 and 60 \(got -5\)/
    )
  })

  it('unknown and missing keys', () => {
    expectRefusal(
      edited((document) => {
        node(document, 'scene', 'worktop').edgeProfile = 'postform'
      }),
      /scene\.worktop\.edgeProfile is not a known field/
    )
    expectRefusal(
      edited((document) => {
        delete node(document, 'scene', 'worktop').frontOverhangMm
      }),
      /scene\.worktop\.frontOverhangMm is missing/
    )
  })
})
