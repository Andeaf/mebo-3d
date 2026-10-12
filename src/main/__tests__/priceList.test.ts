import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LEGACY_SHIPPED_MATERIAL_IDS } from '../../core/priceListMerge'
import { loadPriceList, priceListPaths, type PriceListPaths } from '../priceList'

/**
 * The seed-and-merge orchestration against a real temp directory: which
 * files exist afterwards, with which bytes. The merge rules themselves are
 * priceListMerge.test.ts's.
 */
function material(id: string, pricePerUnitEur = 1): Record<string, unknown> {
  return { id, name: id, category: 'hardware', priceUnit: 'piece', pricePerUnitEur }
}

function text(...materials: Record<string, unknown>[]): string {
  return `${JSON.stringify({ materials }, null, 2)}\n`
}

const SHIPPED = text(material('a'), material('b'))

let dir: string
let paths: PriceListPaths

async function exists(path: string): Promise<boolean> {
  return fs
    .access(path)
    .then(() => true)
    .catch(() => false)
}

async function listing(): Promise<string[]> {
  return (await fs.readdir(dir)).sort()
}

async function offeredIds(): Promise<string[]> {
  return (JSON.parse(await fs.readFile(paths.offered, 'utf-8')) as { offeredIds: string[] }).offeredIds
}

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'mebo-pricelist-'))
  const shipped = join(dir, 'shipped', 'materials.json')
  await fs.mkdir(join(dir, 'shipped'))
  await fs.writeFile(shipped, SHIPPED, 'utf-8')
  paths = priceListPaths(dir, shipped)
})

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('loadPriceList', () => {
  it('first run: copies the shipped bytes verbatim and writes the sidecar, no backup', async () => {
    const load = await loadPriceList(paths)
    expect(load.seeded).toBe(true)
    expect(load.appendedIds).toEqual([])
    expect(load.text).toBe(SHIPPED)
    expect(await fs.readFile(paths.user, 'utf-8')).toBe(SHIPPED)
    expect(await exists(paths.backup)).toBe(false)
    expect(await offeredIds()).toEqual([...LEGACY_SHIPPED_MATERIAL_IDS, 'a', 'b'])
    expect(await listing()).toEqual(['materials.json', 'materials.offered.json', 'shipped'])
  })

  it('nothing to append: the user file is not touched and no backup appears', async () => {
    const edited = text(material('a', 42), material('b'))
    await fs.writeFile(paths.user, edited, 'utf-8')
    await fs.writeFile(paths.offered, '{\n  "offeredIds": [\n    "a",\n    "b"\n  ]\n}\n', 'utf-8')
    const before = await fs.stat(paths.user)
    const load = await loadPriceList(paths)
    expect(load.seeded).toBe(false)
    expect(load.text).toBe(edited)
    expect(await fs.readFile(paths.user, 'utf-8')).toBe(edited)
    expect((await fs.stat(paths.user)).mtimeMs).toBe(before.mtimeMs)
    expect(await exists(paths.backup)).toBe(false)
  })

  it('append: backup holds the previous bytes, the list grows, the sidecar follows, no .tmp is left', async () => {
    const edited = text(material('a', 42))
    await fs.writeFile(paths.user, edited, 'utf-8')
    await fs.writeFile(paths.offered, JSON.stringify({ offeredIds: ['a'] }), 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.appendedIds).toEqual(['b'])
    expect(await fs.readFile(paths.backup, 'utf-8')).toBe(edited)
    const merged = JSON.parse(await fs.readFile(paths.user, 'utf-8')) as { materials: Record<string, unknown>[] }
    expect(merged.materials).toEqual([material('a', 42), material('b')])
    expect(load.text).toBe(await fs.readFile(paths.user, 'utf-8'))
    expect(await offeredIds()).toEqual(['a', 'b'])
    expect((await listing()).some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('a second run after an append writes nothing', async () => {
    await fs.writeFile(paths.user, text(material('a', 42)), 'utf-8')
    await fs.writeFile(paths.offered, JSON.stringify({ offeredIds: ['a'] }), 'utf-8')
    await loadPriceList(paths)
    const user = await fs.stat(paths.user)
    const backup = await fs.stat(paths.backup)
    const offered = await fs.stat(paths.offered)
    const load = await loadPriceList(paths)
    expect(load.appendedIds).toEqual([])
    expect((await fs.stat(paths.user)).mtimeMs).toBe(user.mtimeMs)
    expect((await fs.stat(paths.backup)).mtimeMs).toBe(backup.mtimeMs)
    expect((await fs.stat(paths.offered)).mtimeMs).toBe(offered.mtimeMs)
  })

  it('a deleted material stays deleted across runs', async () => {
    await loadPriceList(paths) // seed: a, b offered
    await fs.writeFile(paths.user, text(material('a')), 'utf-8') // the user deletes b
    const load = await loadPriceList(paths)
    expect(load.appendedIds).toEqual([])
    expect(JSON.parse(load.text)).toEqual({ materials: [material('a')] })
    expect(await exists(paths.backup)).toBe(false)
  })

  it('a user file without a sidecar: legacy ids are not resurrected, a new id is appended', async () => {
    await fs.writeFile(
      paths.shipped,
      text(material('hinge-standard'), material('abs-edge'), material('new-id')),
      'utf-8'
    )
    await fs.writeFile(paths.user, text(material('hinge-standard', 9)), 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.appendedIds).toEqual(['new-id'])
    const merged = JSON.parse(load.text) as { materials: Record<string, unknown>[] }
    expect(merged.materials.map((entry) => entry.id)).toEqual(['hinge-standard', 'new-id'])
    expect(merged.materials[0].pricePerUnitEur).toBe(9)
  })

  it('an invalid user file (bad JSON) is returned as-is: no backup, no rewrite, no sidecar', async () => {
    await fs.writeFile(paths.user, '{ "materials": [ oops', 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.text).toBe('{ "materials": [ oops')
    expect(load.appendedIds).toEqual([])
    expect(await listing()).toEqual(['materials.json', 'shipped'])
  })

  it('an invalid user file (valid JSON, bad database) is returned as-is and untouched', async () => {
    const broken = text({ id: 'a', name: 'A' })
    await fs.writeFile(paths.user, broken, 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.text).toBe(broken)
    expect(await listing()).toEqual(['materials.json', 'shipped'])
  })

  it('an invalid sidecar appends nothing and is rebuilt', async () => {
    await fs.writeFile(paths.user, text(material('a')), 'utf-8')
    await fs.writeFile(paths.offered, 'not json', 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.appendedIds).toEqual([])
    expect(await offeredIds()).toEqual(['a', 'b'])
    expect(await exists(paths.backup)).toBe(false)
  })

  it('a missing shipped file: the user list still loads, nothing is written', async () => {
    await fs.writeFile(paths.user, text(material('a')), 'utf-8')
    await fs.rm(paths.shipped)
    const load = await loadPriceList(paths)
    expect(load.text).toBe(text(material('a')))
    expect(await listing()).toEqual(['materials.json', 'shipped'])
  })

  it('an unreadable shipped list skips the merge', async () => {
    await fs.writeFile(paths.user, text(material('a')), 'utf-8')
    await fs.writeFile(paths.shipped, '{ broken', 'utf-8')
    const load = await loadPriceList(paths)
    expect(load.text).toBe(text(material('a')))
    expect(await listing()).toEqual(['materials.json', 'shipped'])
  })

  it('no user file and no shipped file: throws (nothing to price with)', async () => {
    await fs.rm(paths.shipped)
    await expect(loadPriceList(paths)).rejects.toThrow()
    expect(await listing()).toEqual(['shipped'])
  })
})
