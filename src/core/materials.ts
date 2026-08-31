export type MaterialCategory = 'board' | 'edgeband' | 'hardware'

export type PriceUnit = 'm2' | 'm' | 'piece'

export interface Material {
  readonly id: string
  readonly name: string
  readonly category: MaterialCategory
  readonly priceUnit: PriceUnit
  readonly pricePerUnitEur: number
  /** Boards and edge banding only. */
  readonly thicknessMm?: number
  /** Optional rendering hint (hex color); the core itself never renders. */
  readonly color?: string
}

export interface PriceDatabase {
  readonly materials: readonly Material[]
}

export function findMaterial(db: PriceDatabase, id: string): Material | undefined {
  return db.materials.find((material) => material.id === id)
}

const MATERIAL_CATEGORIES: readonly MaterialCategory[] = ['board', 'edgeband', 'hardware']
const PRICE_UNITS: readonly PriceUnit[] = ['m2', 'm', 'piece']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseMaterial(raw: unknown, index: number): Material {
  if (!isRecord(raw)) {
    throw new Error(`materials[${index}] is not an object`)
  }
  const { id, name, category, priceUnit, pricePerUnitEur, thicknessMm, color } = raw
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`materials[${index}].id must be a non-empty string`)
  }
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`materials[${index}].name must be a non-empty string`)
  }
  if (typeof category !== 'string' || !MATERIAL_CATEGORIES.includes(category as MaterialCategory)) {
    throw new Error(`materials[${index}].category must be one of: ${MATERIAL_CATEGORIES.join(', ')}`)
  }
  if (typeof priceUnit !== 'string' || !PRICE_UNITS.includes(priceUnit as PriceUnit)) {
    throw new Error(`materials[${index}].priceUnit must be one of: ${PRICE_UNITS.join(', ')}`)
  }
  if (typeof pricePerUnitEur !== 'number' || !Number.isFinite(pricePerUnitEur) || pricePerUnitEur < 0) {
    throw new Error(`materials[${index}].pricePerUnitEur must be a non-negative number`)
  }
  if (thicknessMm !== undefined && (typeof thicknessMm !== 'number' || thicknessMm <= 0)) {
    throw new Error(`materials[${index}].thicknessMm must be a positive number when present`)
  }
  if (color !== undefined && typeof color !== 'string') {
    throw new Error(`materials[${index}].color must be a string when present`)
  }
  return {
    id,
    name,
    category: category as MaterialCategory,
    priceUnit: priceUnit as PriceUnit,
    pricePerUnitEur,
    ...(thicknessMm !== undefined ? { thicknessMm } : {}),
    ...(color !== undefined ? { color } : {})
  }
}

/** Validates untrusted JSON (from data/materials.json) into a typed PriceDatabase. */
export function parsePriceDatabase(raw: unknown): PriceDatabase {
  if (!isRecord(raw) || !Array.isArray(raw.materials)) {
    throw new Error('price database must be an object with a "materials" array')
  }
  const materials = raw.materials.map((entry, index) => parseMaterial(entry, index))
  const seen = new Set<string>()
  for (const material of materials) {
    if (seen.has(material.id)) {
      throw new Error(`duplicate material id "${material.id}"`)
    }
    seen.add(material.id)
  }
  return { materials }
}
