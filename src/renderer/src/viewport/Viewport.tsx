import { useMemo, type ReactElement } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Edges, Grid, OrbitControls } from '@react-three/drei'
import { GeneratedGeometry, type GeometryDescription } from '@core/geometry/GeometrySource'
import { findMaterial } from '@core/materials'
import { mmToMeters } from '@core/units'
import { useCabinetBuild } from '@state/selectors'
import { useAppStore } from '@state/store'

const FALLBACK_PANEL_COLOR = '#c8c8c2'

/** Darkens a #rrggbb color; used to draw panel seams that work on any material color. */
function darken(hex: string, factor: number): string {
  const value = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(value) || hex.length !== 7) {
    return '#55554f'
  }
  const channel = (shift: number): number =>
    Math.round(((value >> shift) & 0xff) * factor)
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

function CabinetBoxes({ description }: { description: GeometryDescription }): ReactElement {
  const priceDb = useAppStore((state) => state.priceDb)
  const { x: width, z: depth } = description.boundingSizeMm

  const colorForMaterial = (materialId: string): string => {
    if (priceDb === null) {
      return FALLBACK_PANEL_COLOR
    }
    return findMaterial(priceDb, materialId)?.color ?? FALLBACK_PANEL_COLOR
  }

  return (
    // The domain works in mm with the origin at the left-rear-bottom corner;
    // scale to meters and center on the world origin here, render-side only.
    <group scale={[0.001, 0.001, 0.001]}>
      <group position={[-width / 2, 0, -depth / 2]}>
        {description.boxes.map((instance) => {
          const color = colorForMaterial(instance.materialId)
          return (
            <mesh
              key={instance.panelId}
              position={[instance.box.center.x, instance.box.center.y, instance.box.center.z]}
            >
              <boxGeometry
                args={[instance.box.size.x, instance.box.size.y, instance.box.size.z]}
              />
              <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
              <Edges color={darken(color, 0.55)} threshold={15} />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

export function Viewport(): ReactElement {
  const build = useCabinetBuild()
  const description = useMemo(() => new GeneratedGeometry(build).describe(), [build])
  const targetY = mmToMeters(build.boundingSizeMm.y) / 2

  return (
    <Canvas camera={{ position: [1.7, 1.2, 2.1], fov: 42 }}>
      <color attach="background" args={['#1d2026']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} />
      <CabinetBoxes description={description} />
      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={3.5} blur={2.4} far={1.4} />
      <Grid
        position={[0, 0, 0]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#3a3e46"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#4c5261"
        fadeDistance={9}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        target={[0, targetY, 0]}
        enableDamping
        minDistance={0.4}
        maxDistance={7}
        maxPolarAngle={Math.PI / 2 - 0.01}
      />
    </Canvas>
  )
}
