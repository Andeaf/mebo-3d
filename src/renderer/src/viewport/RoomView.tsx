import { useMemo, useRef, type ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh } from 'three'
import { roomInteriorRect, roomWallSegments, wallInteriorNormal, type RoomDesign } from '@core/room'

const FLOOR_COLOR = '#333842'
const WALL_COLOR = '#454c59'
/** Walls are drawn this thick OUTWARD from the inner face; the domain has no thickness. */
const WALL_RENDER_THICKNESS_MM = 100
/** A hair below the grid so the two never fight for the same pixels. */
const FLOOR_Y_MM = -1

interface WallMesh {
  readonly id: string
  /** Box size in meters. */
  readonly size: readonly [number, number, number]
  /** Box centre in meters. */
  readonly position: readonly [number, number, number]
  /** A point on the inner face, and the direction the room lies in (meters). */
  readonly faceX: number
  readonly faceZ: number
  readonly normalX: number
  readonly normalZ: number
}

function wallMeshes(room: RoomDesign): readonly WallMesh[] {
  const height = room.wallHeightMm / 1000
  const thickness = WALL_RENDER_THICKNESS_MM / 1000

  return roomWallSegments(room).map((wall) => {
    const normal = wallInteriorNormal(wall)
    const face = wall.faceMm / 1000
    const from = wall.fromMm / 1000
    const to = wall.toMm / 1000
    const spanCentre = (from + to) / 2
    // Overrun by the thickness at both ends so the corners meet cleanly.
    const span = to - from + 2 * thickness
    // The slab sits entirely outside the inner face.
    const offset = face - (normal.x + normal.z) * (thickness / 2)

    return wall.axis === 'x'
      ? {
          id: wall.id,
          size: [thickness, height, span] as const,
          position: [offset, height / 2, spanCentre] as const,
          faceX: face,
          faceZ: spanCentre,
          normalX: normal.x,
          normalZ: normal.z
        }
      : {
          id: wall.id,
          size: [span, height, thickness] as const,
          position: [spanCentre, height / 2, offset] as const,
          faceX: spanCentre,
          faceZ: face,
          normalX: normal.x,
          normalZ: normal.z
        }
  })
}

/**
 * Floor and walls of the room. Any wall standing between the camera and the
 * interior hides itself every frame, so orbiting always shows what is inside.
 * Nothing here takes pointer events: dragging uses a math plane and the
 * viewport's own catcher handles click-to-deselect.
 */
export function RoomView({ room }: { readonly room: RoomDesign }): ReactElement {
  const walls = useMemo(() => wallMeshes(room), [room])
  const refs = useRef<(Mesh | null)[]>([])
  const interior = roomInteriorRect(room)

  useFrame(({ camera }) => {
    for (let i = 0; i < walls.length; i += 1) {
      const mesh = refs.current[i]
      const wall = walls[i]
      if (mesh === null || mesh === undefined) {
        continue
      }
      // Positive when the camera is on the room side of this wall.
      const side =
        (camera.position.x - wall.faceX) * wall.normalX +
        (camera.position.z - wall.faceZ) * wall.normalZ
      mesh.visible = side >= 0
    }
  })

  return (
    <group>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, FLOOR_Y_MM / 1000, 0]}
        receiveShadow
        raycast={() => null}
      >
        <planeGeometry
          args={[(interior.maxX - interior.minX) / 1000, (interior.maxZ - interior.minZ) / 1000]}
        />
        <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} metalness={0} />
      </mesh>

      {walls.map((wall, index) => (
        <mesh
          key={wall.id}
          ref={(mesh) => {
            refs.current[index] = mesh
          }}
          position={[wall.position[0], wall.position[1], wall.position[2]]}
          raycast={() => null}
        >
          <boxGeometry args={[wall.size[0], wall.size[1], wall.size[2]]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.95} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}
