import { decodeDesign, isCabinetKind, validateDesign, CABINET_KINDS } from './catalog/registry'
import type { CabinetDesign } from './cabinet'
import { firstOverlappingPair, placedCabinetRect } from './footprint'
import { roomContainsRect, validateRoom, type RoomDesign } from './room'
import {
  cabinetNumberOf,
  isRotationDegrees,
  ROTATION_DEGREES,
  type PlacedCabinet,
  type SceneDesign
} from './scene'

/**
 * The `.mebo` project file: the scene plus a small metadata envelope, as
 * pretty-printed JSON with a fixed key order (`schemaVersion`, `metadata`,
 * `scene`) so files diff cleanly and read by hand.
 *
 * PRICES ARE NOT IN THE FILE, ON PURPOSE. A project stores the design only;
 * opening it prices the design against the current materials database, so a
 * quote made last month reflects this month's prices the moment it opens. A
 * material id that has since disappeared is not a parse error — the design
 * loads and the price panel's missing-materials warning takes over.
 *
 * LOADING IS STRICT. Every value is checked (rule 9: untrusted input enters
 * as `unknown`), every check that fails names its JSON path, and nothing is
 * ever clamped or repaired: a file saying `widthMm: 1500` is refused rather
 * than loaded as 1200 behind the user's back. The scene invariants (no
 * overlap, everything inside the room — rule 10) are verified the same way.
 *
 * SCHEMA VERSIONING. `parseProject` reads `schemaVersion` first. Newer than
 * this build → refused with a message saying so. Older → run through the
 * MIGRATIONS chain, then decoded as current. To change the format: bump
 * PROJECT_SCHEMA_VERSION and add MIGRATIONS[<previous version>]; nothing else
 * moves.
 */

export const PROJECT_SCHEMA_VERSION = 1
export const PROJECT_FILE_EXTENSION = 'mebo'

export interface ProjectMetadata {
  readonly projectName: string
  /** ISO 8601. */
  readonly createdAt: string
  /** ISO 8601. */
  readonly modifiedAt: string
  readonly appVersion: string
}

export interface ProjectDocument {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION
  readonly metadata: ProjectMetadata
  readonly scene: SceneDesign
}

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectParseError'
  }
}

/** Turns a document of one schema version into the next one up. */
type Migration = (document: unknown) => unknown

/**
 * Indexed by the version a step upgrades FROM: `MIGRATIONS[1]` turns a v1
 * document into v2. Empty today because there is only v1.
 */
const MIGRATIONS: ReadonlyArray<Migration | undefined> = []

function migrateToCurrent(document: unknown, from: number): unknown {
  let current = document
  for (let version = from; version < PROJECT_SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version]
    if (step === undefined) {
      throw new ProjectParseError(`no migration from schema ${version} to ${version + 1}`)
    }
    current = step(current)
  }
  return current
}

// ---------------------------------------------------------------------------
// Serialize

export function serializeProject(scene: SceneDesign, metadata: ProjectMetadata): string {
  // Built field by field so the key order is fixed by this code, not by
  // whatever order the in-memory objects happened to be assembled in.
  const document: ProjectDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: {
      projectName: metadata.projectName,
      createdAt: metadata.createdAt,
      modifiedAt: metadata.modifiedAt,
      appVersion: metadata.appVersion
    },
    scene: {
      room: {
        widthMm: scene.room.widthMm,
        lengthMm: scene.room.lengthMm,
        wallHeightMm: scene.room.wallHeightMm
      },
      cabinets: scene.cabinets.map((cabinet) => ({
        id: cabinet.id,
        design: cabinet.design,
        positionX: cabinet.positionX,
        positionZ: cabinet.positionZ,
        rotationDeg: cabinet.rotationDeg
      }))
    }
  }
  return JSON.stringify(document, null, 2)
}

// ---------------------------------------------------------------------------
// Parse

const DOCUMENT_KEYS = ['schemaVersion', 'metadata', 'scene'] as const
const METADATA_KEYS = ['projectName', 'createdAt', 'modifiedAt', 'appVersion'] as const
const SCENE_KEYS = ['room', 'cabinets'] as const
const ROOM_KEYS = ['widthMm', 'lengthMm', 'wallHeightMm'] as const
const CABINET_KEYS = ['id', 'design', 'positionX', 'positionZ', 'rotationDeg'] as const
const DESIGN_KEYS = ['kind', 'params'] as const

function fail(message: string): never {
  throw new ProjectParseError(message)
}

function show(value: unknown): string {
  return value === undefined ? 'nothing' : JSON.stringify(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === undefined) {
    fail(`${path} is missing`)
  }
  if (!isRecord(value)) {
    fail(`${path} must be an object (got ${show(value)})`)
  }
  return value
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  path: string,
  known: readonly string[]
): void {
  for (const key of Object.keys(record)) {
    if (!known.includes(key)) {
      fail(`${path}${path === '' ? '' : '.'}${key} is not a known field`)
    }
  }
}

function requireString(value: unknown, path: string): string {
  if (value === undefined) {
    fail(`${path} is missing`)
  }
  if (typeof value !== 'string') {
    fail(`${path} must be a string (got ${show(value)})`)
  }
  return value
}

function requireDate(value: unknown, path: string): string {
  const text = requireString(value, path)
  if (Number.isNaN(Date.parse(text))) {
    fail(`${path} must be an ISO 8601 date (got ${show(text)})`)
  }
  return text
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (value === undefined) {
    fail(`${path} is missing`)
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`${path} must be a finite number (got ${show(value)})`)
  }
  return value
}

/** Re-throws parse errors from `decode` with the cabinet's id in front, so the UI can name it. */
function labelled<T>(label: string, decode: () => T): T {
  try {
    return decode()
  } catch (error) {
    if (error instanceof ProjectParseError) {
      throw new ProjectParseError(`${label}: ${error.message}`)
    }
    throw error
  }
}

function decodeMetadata(raw: unknown): ProjectMetadata {
  const record = requireRecord(raw, 'metadata')
  rejectUnknownKeys(record, 'metadata', METADATA_KEYS)
  return {
    projectName: requireString(record.projectName, 'metadata.projectName'),
    createdAt: requireDate(record.createdAt, 'metadata.createdAt'),
    modifiedAt: requireDate(record.modifiedAt, 'metadata.modifiedAt'),
    appVersion: requireString(record.appVersion, 'metadata.appVersion')
  }
}

function decodeRoom(raw: unknown): RoomDesign {
  const path = 'scene.room'
  const record = requireRecord(raw, path)
  rejectUnknownKeys(record, path, ROOM_KEYS)
  const room: RoomDesign = {
    widthMm: requireFiniteNumber(record.widthMm, `${path}.widthMm`),
    lengthMm: requireFiniteNumber(record.lengthMm, `${path}.lengthMm`),
    wallHeightMm: requireFiniteNumber(record.wallHeightMm, `${path}.wallHeightMm`)
  }
  const errors = validateRoom(room)
  if (errors.length > 0) {
    fail(errors.map((error) => `${path}.${error}`).join('; '))
  }
  return room
}

function decodeCabinetDesign(raw: unknown, path: string): CabinetDesign {
  const record = requireRecord(raw, path)
  rejectUnknownKeys(record, path, DESIGN_KEYS)
  const kind = requireString(record.kind, `${path}.kind`)
  if (!isCabinetKind(kind)) {
    fail(`${path}.kind ${show(kind)} is not a known cabinet kind (known: ${CABINET_KINDS.join(', ')})`)
  }
  if (record.params === undefined) {
    fail(`${path}.params is missing`)
  }
  let design: CabinetDesign
  try {
    design = decodeDesign(kind, record.params)
  } catch (error) {
    // The registry's messages start with `params.`; give them their path.
    fail(`${path}.${error instanceof Error ? error.message : String(error)}`)
  }
  const errors = validateDesign(design)
  if (errors.length > 0) {
    fail(errors.map((error) => `${path}.params.${error}`).join('; '))
  }
  return design
}

function decodeCabinet(raw: unknown, index: number, seen: Set<string>): PlacedCabinet {
  const path = `scene.cabinets[${index}]`
  const record = requireRecord(raw, path)
  rejectUnknownKeys(record, path, CABINET_KEYS)
  const id = requireString(record.id, `${path}.id`)
  if (cabinetNumberOf(id) === null) {
    fail(`${path}.id must look like cab-<n> (got ${show(id)})`)
  }
  if (seen.has(id)) {
    fail(`${path}.id is a duplicate: cabinet ${id} appears twice`)
  }
  seen.add(id)
  return labelled(`cabinet ${id}`, () => {
    const rotationDeg = record.rotationDeg
    if (!isRotationDegrees(rotationDeg)) {
      fail(
        `${path}.rotationDeg must be one of ${ROTATION_DEGREES.join(', ')} (got ${show(rotationDeg)})`
      )
    }
    return {
      id,
      design: decodeCabinetDesign(record.design, `${path}.design`),
      positionX: requireFiniteNumber(record.positionX, `${path}.positionX`),
      positionZ: requireFiniteNumber(record.positionZ, `${path}.positionZ`),
      rotationDeg
    }
  })
}

function decodeScene(raw: unknown): SceneDesign {
  const record = requireRecord(raw, 'scene')
  rejectUnknownKeys(record, 'scene', SCENE_KEYS)
  const room = decodeRoom(record.room)
  if (record.cabinets === undefined) {
    fail('scene.cabinets is missing')
  }
  if (!Array.isArray(record.cabinets)) {
    fail(`scene.cabinets must be an array (got ${show(record.cabinets)})`)
  }
  const seen = new Set<string>()
  const cabinets = record.cabinets.map((entry: unknown, index) => decodeCabinet(entry, index, seen))
  const scene: SceneDesign = { room, cabinets }

  // Rule 10, applied to the file: refuse rather than repair.
  const pair = firstOverlappingPair(scene)
  if (pair !== null) {
    fail(`cabinets ${pair[0]} and ${pair[1]} overlap`)
  }
  for (const cabinet of cabinets) {
    if (!roomContainsRect(room, placedCabinetRect(cabinet))) {
      fail(`cabinet ${cabinet.id} lies outside the room`)
    }
  }
  return scene
}

function decodeDocument(raw: unknown): ProjectDocument {
  const record = requireRecord(raw, 'project file')
  rejectUnknownKeys(record, '', DOCUMENT_KEYS)
  if (record.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    // Only reachable through a migration step that forgot to bump the version.
    fail(`schemaVersion must be ${PROJECT_SCHEMA_VERSION} after migration (got ${show(record.schemaVersion)})`)
  }
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    metadata: decodeMetadata(record.metadata),
    scene: decodeScene(record.scene)
  }
}

/** Validates the text of a `.mebo` file into a typed document; throws `ProjectParseError`. */
export function parseProject(text: string): ProjectDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    fail(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  const record = requireRecord(raw, 'project file')
  const version = record.schemaVersion
  if (version === undefined) {
    fail('schemaVersion is missing')
  }
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    fail(`schemaVersion must be an integer (got ${show(version)})`)
  }
  if (version > PROJECT_SCHEMA_VERSION) {
    fail(
      `made with a newer version of the app (schema ${version}; this version reads up to ${PROJECT_SCHEMA_VERSION})`
    )
  }
  return decodeDocument(version < PROJECT_SCHEMA_VERSION ? migrateToCurrent(raw, version) : raw)
}
