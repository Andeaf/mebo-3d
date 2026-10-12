import { describe, expect, it } from 'vitest'
import {
  LEGACY_SHIPPED_MATERIAL_IDS,
  mergeShippedMaterials,
  parseOfferedIds,
  PriceListMergeError,
  serializeOfferedIds
} from '@core/priceListMerge'

function material(id: string, pricePerUnitEur = 1): Record<string, unknown> {
  return { id, name: id, category: 'hardware', priceUnit: 'piece', pricePerUnitEur }
}

function db(...materials: Record<string, unknown>[]): { materials: Record<string, unknown>[] } {
  return { materials }
}

const SHIPPED = db(material('a'), material('b'), material('c'))

describe('mergeShippedMaterials', () => {
  it('appends a shipped id the user lacks, at the end, verbatim', () => {
    const user = db(material('a', 7))
    const result = mergeShippedMaterials(user, SHIPPED, { offeredIds: ['a'] })
    expect(result.appendedIds).toEqual(['b', 'c'])
    expect(result.offeredIds).toEqual(['a', 'b', 'c'])
    expect(result.text).not.toBeNull()
    const merged = JSON.parse(result.text ?? '') as { materials: Record<string, unknown>[] }
    expect(merged.materials.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    expect(merged.materials[1]).toEqual(material('b'))
  })

  it('never modifies an existing entry: edited price, extra key and key order survive', () => {
    const edited = { note: 'onderhandeld', ...material('a'), pricePerUnitEur: 99.5, color: '#123456' }
    const user = { comment: 'onze lijst', materials: [edited] }
    const result = mergeShippedMaterials(user, SHIPPED, { offeredIds: ['a'] })
    const merged = JSON.parse(result.text ?? '') as { comment: string; materials: Record<string, unknown>[] }
    expect(merged.comment).toBe('onze lijst')
    expect(merged.materials[0]).toEqual(edited)
    expect(Object.keys(merged.materials[0])).toEqual(Object.keys(edited))
    expect(merged.materials[0].pricePerUnitEur).toBe(99.5)
  })

  it('a deleted material stays deleted: an offered id missing from the user file is not appended', () => {
    const user = db(material('a'))
    const result = mergeShippedMaterials(user, SHIPPED, { offeredIds: ['a', 'b', 'c'] })
    expect(result.text).toBeNull()
    expect(result.appendedIds).toEqual([])
    expect(result.offeredIds).toEqual(['a', 'b', 'c'])
  })

  it('is idempotent: a second run on the first run\'s output appends nothing', () => {
    const first = mergeShippedMaterials(db(material('a')), SHIPPED, { offeredIds: ['a'] })
    const second = mergeShippedMaterials(JSON.parse(first.text ?? ''), SHIPPED, { offeredIds: first.offeredIds })
    expect(second.text).toBeNull()
    expect(second.appendedIds).toEqual([])
    expect(second.offeredIds).toEqual(first.offeredIds)
  })

  it('an empty user list receives every unoffered shipped id', () => {
    const result = mergeShippedMaterials(db(), SHIPPED, { offeredIds: [] })
    expect(result.appendedIds).toEqual(['a', 'b', 'c'])
  })

  it('an empty shipped list appends nothing and offers nothing new', () => {
    const result = mergeShippedMaterials(db(material('a')), db(), { offeredIds: ['a'] })
    expect(result.text).toBeNull()
    expect(result.offeredIds).toEqual(['a'])
  })

  it('an empty sidecar offers everything shipped that the user lacks', () => {
    const result = mergeShippedMaterials(db(material('b')), SHIPPED, { offeredIds: [] })
    expect(result.appendedIds).toEqual(['a', 'c'])
    expect(result.offeredIds).toEqual(['a', 'b', 'c'])
  })

  it('a missing sidecar means the legacy set was offered: a legacy id is not resurrected, a new one is appended', () => {
    const shipped = db(material('hinge-standard'), material('abs-edge'), material('brand-new'))
    const user = db(material('hinge-standard'))
    const result = mergeShippedMaterials(user, shipped, undefined)
    expect(result.appendedIds).toEqual(['brand-new'])
    expect(result.offeredIds).toEqual([...LEGACY_SHIPPED_MATERIAL_IDS, 'brand-new'])
  })

  it('an invalid sidecar counts everything shipped as offered: nothing appended, sidecar rebuilt', () => {
    for (const sidecar of [null, 'x', [], { offeredIds: 'a' }, { offeredIds: [1] }, { ids: [] }]) {
      const result = mergeShippedMaterials(db(material('a')), SHIPPED, sidecar)
      expect(result.text).toBeNull()
      expect(result.offeredIds).toEqual(['a', 'b', 'c'])
    }
  })

  it('an invalid user list throws, naming the user side, and never produces text', () => {
    expect(() => mergeShippedMaterials({ materials: 'x' }, SHIPPED, undefined)).toThrow(PriceListMergeError)
    expect(() => mergeShippedMaterials(db({ id: 'a' }), SHIPPED, undefined)).toThrow(/^user price list: /)
    expect(() => mergeShippedMaterials(db(material('a'), material('a')), SHIPPED, undefined)).toThrow(
      /^user price list: duplicate material id/
    )
    try {
      mergeShippedMaterials(null, SHIPPED, undefined)
    } catch (error) {
      expect(error).toBeInstanceOf(PriceListMergeError)
      expect((error as PriceListMergeError).side).toBe('user')
    }
  })

  it('an invalid shipped list throws, naming the shipped side', () => {
    expect(() => mergeShippedMaterials(db(material('a')), { materials: [{}] }, undefined)).toThrow(
      /^shipped price list: /
    )
  })

  it('the merged text is pretty JSON ending in a newline', () => {
    const result = mergeShippedMaterials(db(), db(material('a')), { offeredIds: [] })
    expect(result.text).toBe(`${JSON.stringify(db(material('a')), null, 2)}\n`)
  })
})

describe('the sidecar', () => {
  it('parses `{ offeredIds: string[] }` only', () => {
    expect(parseOfferedIds({ offeredIds: ['a'] })).toEqual(['a'])
    expect(parseOfferedIds({ offeredIds: [] })).toEqual([])
    expect(parseOfferedIds(undefined)).toBe(LEGACY_SHIPPED_MATERIAL_IDS)
    expect(parseOfferedIds({})).toBeNull()
    expect(parseOfferedIds({ offeredIds: ['a', 2] })).toBeNull()
  })

  it('round-trips through serializeOfferedIds', () => {
    const text = serializeOfferedIds(['a', 'b'])
    expect(text.endsWith('\n')).toBe(true)
    expect(parseOfferedIds(JSON.parse(text))).toEqual(['a', 'b'])
  })

  it('the legacy set is the eleven ids of data/materials.json before 0.11', () => {
    expect(LEGACY_SHIPPED_MATERIAL_IDS).toHaveLength(11)
    expect(LEGACY_SHIPPED_MATERIAL_IDS).toContain('worktop-hpl-38')
    expect(LEGACY_SHIPPED_MATERIAL_IDS).toContain('drawer-slide-pair')
  })
})
