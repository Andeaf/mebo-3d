import type { ReactElement } from 'react'
import { Edges } from '@react-three/drei'
import type { PriceDatabase } from '@core/materials'
import type { WorktopSlab } from '@core/worktopLayout'
import { colorForMaterial, darken, FALLBACK_WORKTOP_COLOR } from './materialColor'

/** A slab is one box (no stacked alphas), so it can stay a little more visible than a dimmed cabinet. */
const DIMMED_OPACITY = 0.12

interface WorktopViewProps {
  readonly slabs: readonly WorktopSlab[]
  readonly priceDb: PriceDatabase | null
  /** Edit mode: faded with the other cabinets so the open piece stands out. */
  readonly dimmed?: boolean
}

/**
 * The derived worktop slabs: one box per slab, drawn in world space (every
 * slab is world-axis-aligned because rotations are multiples of 90°),
 * coloured by the worktop material with darker edges. Never a pick target —
 * a click falls through to the cabinet underneath — and not selectable in
 * Phase 7.
 */
export function WorktopView({ slabs, priceDb, dimmed = false }: WorktopViewProps): ReactElement {
  return (
    <group>
      {slabs.map((slab) => {
        const color = colorForMaterial(priceDb, slab.materialId, FALLBACK_WORKTOP_COLOR)
        const { rect } = slab
        return (
          <mesh
            key={slab.id}
            position={[
              (rect.minX + rect.maxX) / 2000,
              (slab.bottomMm + slab.topMm) / 2000,
              (rect.minZ + rect.maxZ) / 2000
            ]}
            raycast={() => null}
          >
            <boxGeometry
              args={[
                (rect.maxX - rect.minX) / 1000,
                (slab.topMm - slab.bottomMm) / 1000,
                (rect.maxZ - rect.minZ) / 1000
              ]}
            />
            {/* Keyed on `dimmed` for the same reason as the cabinet panels: a
                material compiled opaque never fades, a fresh one does. */}
            <meshStandardMaterial
              key={dimmed ? 'dimmed' : 'solid'}
              color={color}
              roughness={0.6}
              metalness={0.05}
              transparent={dimmed}
              opacity={dimmed ? DIMMED_OPACITY : 1}
              depthWrite={!dimmed}
            />
            {!dimmed && <Edges color={darken(color, 0.55)} threshold={15} />}
          </mesh>
        )
      })}
    </group>
  )
}
