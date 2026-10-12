import { useMemo, type ReactElement } from 'react'
import { Html, Line } from '@react-three/drei'
import { DOOR_THICKNESS_MM } from '@core/catalog/parts'
import { chainSelf, dimensionChains, type ChainGap, type DimensionChain } from '@core/dimensionChain'
import type { CustomPieceSpec, PieceAxis } from '@core/customPiece'
import type { PlacedCabinet } from '@core/scene'
import type { Vec3 } from '@core/units'
import { formatQuantity } from '../format'

const CHAIN_COLOR = '#5aa9ff'
/** In front of the fronts (the overlay zone), clear of the gizmo's plane handles. */
const FRONT_OFFSET_MM = 40
/** Above the piece, for the depth chains. */
const TOP_OFFSET_MM = 40
const ARROW_MM = 12

type Point = readonly [number, number, number]

function withAxis(point: Vec3, axis: PieceAxis, value: number): Vec3 {
  return { ...point, [axis]: value }
}

/** The axis the arrowheads open along: the other front-plane axis, or x for the depth chain above the piece. */
function arrowAxis(axis: PieceAxis): PieceAxis {
  return axis === 'y' ? 'x' : axis === 'x' ? 'y' : 'x'
}

function toPoint(vector: Vec3): Point {
  return [vector.x, vector.y, vector.z]
}

interface ChainLineProps {
  readonly chain: DimensionChain
  /** Where the chain line sits on the two other axes (piece mm). */
  readonly through: Vec3
  /** The gap a snap just landed on is marked (step 5). */
  readonly snapped: boolean
}

function GapLine({ gap, axis, through, snapped }: { gap: ChainGap; axis: PieceAxis; through: Vec3; snapped: boolean }): ReactElement {
  const start = withAxis(through, axis, gap.fromMm)
  const end = withAxis(through, axis, gap.toMm)
  const mid = withAxis(through, axis, (gap.fromMm + gap.toMm) / 2)
  const perp = arrowAxis(axis)
  // Arrowheads point outward at both ends, a V in the chain's plane; a gap
  // shorter than two heads gets ticks instead so the heads never cross.
  const head = Math.min(ARROW_MM, gap.lengthMm / 2)
  const wing = ARROW_MM * 0.5
  const strokes: Point[][] = [
    [toPoint(start), toPoint(end)],
    [toPoint(withAxis(withAxis(start, axis, gap.fromMm + head), perp, through[perp] + wing)), toPoint(start)],
    [toPoint(withAxis(withAxis(start, axis, gap.fromMm + head), perp, through[perp] - wing)), toPoint(start)],
    [toPoint(withAxis(withAxis(end, axis, gap.toMm - head), perp, through[perp] + wing)), toPoint(end)],
    [toPoint(withAxis(withAxis(end, axis, gap.toMm - head), perp, through[perp] - wing)), toPoint(end)]
  ]
  const emphasis = gap.own ? 1 : 0.45
  const className = `chain-label${gap.own ? ' chain-label--own' : ''}${gap.own && snapped ? ' chain-label--snapped' : ''}`
  return (
    <>
      {strokes.map((points, index) => (
        <Line
          key={index}
          points={points}
          color={CHAIN_COLOR}
          lineWidth={gap.own ? 2 : 1.2}
          transparent
          opacity={emphasis}
          depthTest={false}
          renderOrder={10}
        />
      ))}
      <Html center position={toPoint(mid)} style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <div className={className}>{formatQuantity(gap.lengthMm)}</div>
      </Html>
    </>
  )
}

function ChainLine({ chain, through, snapped }: ChainLineProps): ReactElement {
  return (
    <>
      {chain.gaps.map((gap) => (
        <GapLine key={`${gap.fromMm}-${gap.toMm}`} gap={gap} axis={chain.axis} through={through} snapped={snapped} />
      ))}
    </>
  )
}

interface DimensionChainsProps {
  readonly placed: PlacedCabinet
  readonly spec: CustomPieceSpec
  readonly elementId: string
  /** The axis a snap just fired on, if any: its own gaps are marked. */
  readonly snappedAxis: PieceAxis | null
}

/**
 * The dimension chains of the selected element of the open piece (Phase
 * 12): one row of arrowed gaps per chain axis, each gap labelled in mm,
 * the element's own two gaps emphasised. Drawn in the piece's own frame
 * (placed, turned, lifted, mm → m like the meshes) just in front of the
 * fronts — the depth chain above the piece — and never depth-tested, so
 * orbiting never hides a label inside a panel. Pure derivation of the
 * spec: a gizmo frame, a nudge and an undo redraw it.
 */
export function DimensionChains({ placed, spec, elementId, snappedAxis }: DimensionChainsProps): ReactElement | null {
  const chains = useMemo(() => dimensionChains(spec, elementId), [spec, elementId])
  const self = useMemo(() => chainSelf(spec, elementId), [spec, elementId])
  if (self === null || chains.length === 0) {
    return null
  }
  const centre: Vec3 = {
    x: (self.min.x + self.max.x) / 2,
    y: (self.min.y + self.max.y) / 2,
    z: (self.min.z + self.max.z) / 2
  }
  const frontZ = spec.depthMm + DOOR_THICKNESS_MM + FRONT_OFFSET_MM
  const throughFor = (axis: PieceAxis): Vec3 =>
    axis === 'z'
      ? { x: centre.x, y: spec.heightMm + TOP_OFFSET_MM, z: 0 }
      : { x: centre.x, y: centre.y, z: frontZ }
  return (
    <group
      position={[placed.positionX / 1000, spec.mountingHeightMm / 1000, placed.positionZ / 1000]}
      rotation={[0, (placed.rotationDeg * Math.PI) / 180, 0]}
    >
      <group scale={[0.001, 0.001, 0.001]} position={[-spec.widthMm / 2000, 0, -spec.depthMm / 2000]}>
        {chains.map((chain) => (
          <ChainLine
            key={chain.axis}
            chain={chain}
            through={throughFor(chain.axis)}
            snapped={snappedAxis === chain.axis}
          />
        ))}
      </group>
    </group>
  )
}
