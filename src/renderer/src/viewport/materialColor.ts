import { findMaterial, type PriceDatabase } from '@core/materials'

/** A panel whose material has no colour hint (or no database yet). */
export const FALLBACK_PANEL_COLOR = '#c8c8c2'
/** A worktop whose material is unknown or not yet loaded: a warm mid grey. */
export const FALLBACK_WORKTOP_COLOR = '#8f8a80'

/** The material's rendering hint, or `fallback` when the database is not loaded, the id is unknown or it has no colour. */
export function colorForMaterial(
  priceDb: PriceDatabase | null,
  materialId: string,
  fallback: string
): string {
  if (priceDb === null) {
    return fallback
  }
  return findMaterial(priceDb, materialId)?.color ?? fallback
}

/** Darkens a #rrggbb colour; used to draw seams and edges that work on any material colour. */
export function darken(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(value) || hex.length !== 7) {
    return '#55554f'
  }
  const channel = (shift: number): number => Math.round(((value >> shift) & 0xff) * factor)
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}
