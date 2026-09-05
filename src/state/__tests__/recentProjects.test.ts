import { describe, expect, it } from 'vitest'
import {
  parseRecentProjects,
  pushRecent,
  removeRecent,
  MAX_RECENT_PROJECTS,
  type RecentProject
} from '@state/recentProjects'

function entry(n: number, openedAt = '2026-09-03T09:00:00.000Z'): RecentProject {
  return { path: `/projects/p${n}.mebo`, name: `p${n}`, openedAt }
}

describe('recent projects', () => {
  it('pushes to the front and moves an existing path up instead of duplicating it', () => {
    const list = pushRecent(pushRecent(pushRecent([], entry(1)), entry(2)), entry(3))
    expect(list.map((item) => item.name)).toEqual(['p3', 'p2', 'p1'])

    const reopened = pushRecent(list, entry(1, '2026-09-04T09:00:00.000Z'))
    expect(reopened.map((item) => item.name)).toEqual(['p1', 'p3', 'p2'])
    expect(reopened[0].openedAt).toBe('2026-09-04T09:00:00.000Z')
  })

  it('caps the list at MAX_RECENT_PROJECTS, dropping the oldest', () => {
    let list: readonly RecentProject[] = []
    for (let n = 1; n <= MAX_RECENT_PROJECTS + 3; n += 1) {
      list = pushRecent(list, entry(n))
    }
    expect(list).toHaveLength(MAX_RECENT_PROJECTS)
    expect(list[0].name).toBe(`p${MAX_RECENT_PROJECTS + 3}`)
    expect(list[list.length - 1].name).toBe('p4')
  })

  it('removes one path and leaves the rest in order', () => {
    const list = pushRecent(pushRecent(pushRecent([], entry(1)), entry(2)), entry(3))
    expect(removeRecent(list, entry(2).path).map((item) => item.name)).toEqual(['p3', 'p1'])
    expect(removeRecent(list, '/nowhere.mebo')).toEqual(list)
  })

  it('parses stored JSON defensively: bad entries are dropped, not fatal', () => {
    expect(parseRecentProjects(null)).toEqual([])
    expect(parseRecentProjects('[]')).toEqual([])
    expect(
      parseRecentProjects([
        entry(1),
        { path: '', name: 'empty', openedAt: 'x' },
        { path: '/no-name.mebo' },
        'garbage',
        entry(1),
        { ...entry(2), extra: true }
      ])
    ).toEqual([entry(1), entry(2)])
  })
})
