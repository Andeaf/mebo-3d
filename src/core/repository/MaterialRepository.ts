import { parsePriceDatabase, type PriceDatabase } from '../materials'

/**
 * Storage abstraction for the price database. Today the data lives in
 * data/materials.json; a SQLite-backed implementation can replace this
 * later without touching the price engine or the UI.
 */
export interface MaterialRepository {
  loadPriceDatabase(): Promise<PriceDatabase>
}

/**
 * JSON-text-backed repository. The text source is injected (in the app it is
 * an Electron IPC call that reads the file from disk) so the core stays free
 * of filesystem and Electron dependencies.
 */
export class JsonMaterialRepository implements MaterialRepository {
  constructor(private readonly readJsonText: () => Promise<string>) {}

  async loadPriceDatabase(): Promise<PriceDatabase> {
    const text = await this.readJsonText()
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('materials.json bevat geen geldige JSON')
    }
    return parsePriceDatabase(raw)
  }
}
