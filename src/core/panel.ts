import { squareMmToSquareMeters, type Box3 } from './units'

export type PanelRole =
  | 'side-left'
  | 'side-right'
  | 'bottom'
  | 'top'
  | 'stretcher-front'
  | 'stretcher-back'
  | 'back'
  | 'shelf'
  | 'divider'
  | 'door'
  | 'front'
  | 'drawer-front'
  | 'drawer-box-side'
  | 'drawer-box-front'
  | 'drawer-box-back'
  | 'drawer-box-bottom'

/**
 * Edges of the rectangular cut piece: two edges run along `lengthMm`,
 * two along `widthMm`.
 */
export type PanelEdgeId = 'length-1' | 'length-2' | 'width-1' | 'width-2'

/** Every edge id, for validation of untrusted input and for the editor's checkboxes. */
export const PANEL_EDGE_IDS: readonly PanelEdgeId[] = ['length-1', 'length-2', 'width-1', 'width-2']

export interface EdgeBanding {
  readonly materialId: string
  readonly edges: readonly PanelEdgeId[]
}

/**
 * One rectangular panel of a design. This is the single source of truth:
 * the 3D view renders `box`, the cutting list and price engine read the
 * cut dimensions and edge banding. Never derive one from a second model.
 */
export interface Panel {
  readonly id: string
  readonly role: PanelRole
  readonly materialId: string
  /** Cut dimensions of the raw piece (mm). */
  readonly lengthMm: number
  readonly widthMm: number
  readonly thicknessMm: number
  readonly edgeBanding: EdgeBanding | null
  /** Placement of the panel volume in cabinet space (mm); render-only consumers use this. */
  readonly box: Box3
}

export interface HardwareItem {
  readonly materialId: string
  readonly quantity: number
}

export function panelAreaSquareMeters(panel: Panel): number {
  return squareMmToSquareMeters(panel.lengthMm * panel.widthMm)
}

export function panelEdgeBandingLengthMm(panel: Panel): number {
  if (panel.edgeBanding === null) {
    return 0
  }
  return panel.edgeBanding.edges.reduce(
    (total, edge) => total + (edge.startsWith('length') ? panel.lengthMm : panel.widthMm),
    0
  )
}
