import type { ReactElement } from 'react'
import { Html, Line } from '@react-three/drei'
import { useSelectedRun } from '@state/selectors'
import { formatQuantity } from '../format'

const MEASURE_COLOR = '#e5b45b'
/** In front of the carcass fronts, clear of the 18 mm door overlay. */
const LINE_OFFSET_MM = 90
const LINE_HEIGHT_MM = 20
const TICK_MM = 30

type Point = readonly [number, number, number]

/** Total width of the connected run the selected cabinet belongs to. */
export function MeasureLine(): ReactElement | null {
  const run = useSelectedRun()
  if (run === null) {
    return null
  }
  const { runRect, axis, rotationDeg, totalWidthMm } = run
  const y = LINE_HEIGHT_MM / 1000

  let start: Point
  let end: Point
  let tickDir: Point
  if (axis === 'x') {
    const z = (rotationDeg === 0 ? runRect.maxZ + LINE_OFFSET_MM : runRect.minZ - LINE_OFFSET_MM) / 1000
    start = [runRect.minX / 1000, y, z]
    end = [runRect.maxX / 1000, y, z]
    tickDir = [0, 0, TICK_MM / 1000]
  } else {
    const x = (rotationDeg === 90 ? runRect.maxX + LINE_OFFSET_MM : runRect.minX - LINE_OFFSET_MM) / 1000
    start = [x, y, runRect.minZ / 1000]
    end = [x, y, runRect.maxZ / 1000]
    tickDir = [TICK_MM / 1000, 0, 0]
  }

  const mid: Point = [(start[0] + end[0]) / 2, y, (start[2] + end[2]) / 2]
  const tick = (point: Point): [Point, Point] => [
    [point[0] - tickDir[0], point[1], point[2] - tickDir[2]],
    [point[0] + tickDir[0], point[1], point[2] + tickDir[2]]
  ]

  return (
    <group>
      <Line points={[start, end]} color={MEASURE_COLOR} lineWidth={1.5} />
      <Line points={tick(start)} color={MEASURE_COLOR} lineWidth={1.5} />
      <Line points={tick(end)} color={MEASURE_COLOR} lineWidth={1.5} />
      <Html center position={[mid[0], mid[1], mid[2]]} style={{ pointerEvents: 'none' }}>
        <div className="measure-label">{formatQuantity(totalWidthMm)} mm</div>
      </Html>
    </group>
  )
}
