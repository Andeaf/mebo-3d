import { describe, expect, it } from 'vitest'
import { PROJECT_EXTENSION, projectPathFromArgv } from '../launchArgs'

describe('projectPathFromArgv', () => {
  it('is the mebo extension', () => {
    expect(PROJECT_EXTENSION).toBe('mebo')
  })

  it('finds the file a packaged launch carries', () => {
    expect(projectPathFromArgv(['C:\\Program Files\\Mebo 3D\\Mebo 3D.exe', 'C:\\k\\Keuken.mebo'])).toBe(
      'C:\\k\\Keuken.mebo'
    )
  })

  it('finds the file after the dev app path', () => {
    expect(projectPathFromArgv(['electron.exe', '.', 'x.mebo'])).toBe('x.mebo')
  })

  it('skips flags', () => {
    expect(
      projectPathFromArgv(['Mebo 3D.exe', '--inspect=9229', '--allow-file-access-from-files', 'a.mebo'])
    ).toBe('a.mebo')
    expect(projectPathFromArgv(['Mebo 3D.exe', '--weird.mebo'])).toBeNull()
  })

  it('matches the extension case-insensitively', () => {
    expect(projectPathFromArgv(['Mebo 3D.exe', 'D:\\Plannen\\KEUKEN.MEBO'])).toBe('D:\\Plannen\\KEUKEN.MEBO')
  })

  it('ignores other files', () => {
    expect(projectPathFromArgv(['Mebo 3D.exe', 'plan.mebo.bak'])).toBeNull()
    expect(projectPathFromArgv(['Mebo 3D.exe', 'notes.txt'])).toBeNull()
    expect(projectPathFromArgv(['Mebo 3D.exe', 'mebo'])).toBeNull()
  })

  it('takes the first of two project files', () => {
    expect(projectPathFromArgv(['Mebo 3D.exe', 'first.mebo', 'second.mebo'])).toBe('first.mebo')
  })

  it('never takes the executable itself', () => {
    expect(projectPathFromArgv(['launcher.mebo'])).toBeNull()
    expect(projectPathFromArgv([])).toBeNull()
    expect(projectPathFromArgv(['Mebo 3D.exe'])).toBeNull()
  })

  it('keeps a path with spaces intact', () => {
    expect(projectPathFromArgv(['Mebo 3D.exe', 'C:\\Mijn Documenten\\Keuken Jansen.mebo'])).toBe(
      'C:\\Mijn Documenten\\Keuken Jansen.mebo'
    )
  })
})
