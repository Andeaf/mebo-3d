import type { CabinetBuild } from '../catalog/baseCabinet'
import type { PanelRole } from '../panel'
import type { Box3, Size3 } from '../units'

export interface PanelBoxInstance {
  readonly panelId: string
  readonly role: PanelRole
  readonly materialId: string
  readonly box: Box3
}

export interface BoxGeometryDescription {
  readonly kind: 'boxes'
  readonly boxes: readonly PanelBoxInstance[]
  readonly boundingSizeMm: Size3
}

/**
 * Union of everything a GeometrySource can describe. When the company's own
 * cabinet files get imported later, add e.g. an `imported-mesh` variant here
 * and teach the renderer about it — pricing code never touches this type.
 */
export type GeometryDescription = BoxGeometryDescription

/**
 * Where a placed cabinet's visual mesh comes from. The renderer only consumes
 * `describe()`; it never reaches into domain objects for geometry.
 */
export interface GeometrySource {
  describe(): GeometryDescription
}

/** Geometry generated from the parametric panel list (the Phase 1 implementation). */
export class GeneratedGeometry implements GeometrySource {
  constructor(private readonly build: CabinetBuild) {}

  describe(): GeometryDescription {
    return {
      kind: 'boxes',
      boxes: this.build.panels.map((panel) => ({
        panelId: panel.id,
        role: panel.role,
        materialId: panel.materialId,
        box: panel.box
      })),
      boundingSizeMm: this.build.boundingSizeMm
    }
  }
}
