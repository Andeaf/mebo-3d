import { promises as fs } from 'node:fs'

/**
 * Writes `<path>.tmp` beside the target and renames it over the target, so a
 * crash mid-write never leaves a truncated file. Shared by the project
 * writer and the price-list files. Node only — testable without Electron.
 */
export async function atomicWrite(path: string, text: string): Promise<void> {
  const temp = `${path}.tmp`
  await fs.writeFile(temp, text, 'utf-8')
  try {
    await fs.rename(temp, path)
  } catch (error) {
    await fs.rm(temp, { force: true })
    throw error
  }
}
