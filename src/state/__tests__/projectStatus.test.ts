import { describe, expect, it } from 'vitest'
import { markOpened, markSaved, projectNameFromPath, NEW_PROJECT } from '@state/projectStatus'

// Phase 9: the dirty flag left this module — it is derived by the store from
// the scene (see store.test.ts), so the transitions below are path, name and
// creation stamp only.
describe('project status transitions', () => {
  it('starts unnamed and unsaved', () => {
    expect(NEW_PROJECT).toEqual({ path: null, name: null, createdAt: null })
  })

  it('a save names the project after the file and stamps createdAt once', () => {
    const first = markSaved(NEW_PROJECT, 'C:\\Klanten\\Jansen\\Keuken.mebo', '2026-09-03T09:00:00.000Z')
    expect(first).toEqual({
      path: 'C:\\Klanten\\Jansen\\Keuken.mebo',
      name: 'Keuken',
      createdAt: '2026-09-03T09:00:00.000Z'
    })

    // Save As to a new path later: creation stamp survives, name follows the file.
    const second = markSaved(first, '/home/mebo/Keuken v2.mebo', '2026-09-04T10:00:00.000Z')
    expect(second).toEqual({
      path: '/home/mebo/Keuken v2.mebo',
      name: 'Keuken v2',
      createdAt: '2026-09-03T09:00:00.000Z'
    })
  })

  it("an open takes the file's own creation stamp", () => {
    expect(markOpened('D:\\Projecten\\Badkamer.mebo', '2025-12-01T08:30:00.000Z')).toEqual({
      path: 'D:\\Projecten\\Badkamer.mebo',
      name: 'Badkamer',
      createdAt: '2025-12-01T08:30:00.000Z'
    })
  })
})

describe('projectNameFromPath', () => {
  it('strips the directory on both separators and the .mebo extension', () => {
    expect(projectNameFromPath('C:\\Klanten\\Jansen\\Keuken.mebo')).toBe('Keuken')
    expect(projectNameFromPath('/home/mebo/projects/Keuken.mebo')).toBe('Keuken')
    expect(projectNameFromPath('Keuken.MEBO')).toBe('Keuken')
    expect(projectNameFromPath('Keuken')).toBe('Keuken')
  })

  it('keeps a foreign extension and inner dots', () => {
    expect(projectNameFromPath('/x/Keuken.v2.mebo')).toBe('Keuken.v2')
    expect(projectNameFromPath('/x/notes.txt')).toBe('notes.txt')
  })
})
