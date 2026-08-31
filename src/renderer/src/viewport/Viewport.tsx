import { type ReactElement } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import { useAppStore } from '@state/store'
import { PlacedCabinetMesh } from './PlacedCabinetMesh'

export function Viewport(): ReactElement {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  const selectCabinet = useAppStore((state) => state.selectCabinet)
  const priceDb = useAppStore((state) => state.priceDb)

  return (
    <Canvas camera={{ position: [1.9, 1.4, 2.4], fov: 42 }}>
      <color attach="background" args={['#1d2026']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} />

      {scene.cabinets.map((placed) => (
        <PlacedCabinetMesh
          key={placed.id}
          placed={placed}
          selected={placed.id === selectedCabinetId}
          priceDb={priceDb}
          onPointerDown={(event) => {
            event.stopPropagation()
            selectCabinet(placed.id)
          }}
        />
      ))}

      {/* Invisible catcher below the grid: clicking empty floor deselects. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]} onPointerDown={() => selectCabinet(null)}>
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={6} blur={2.4} far={1.4} />
      <Grid
        position={[0, 0, 0]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#3a3e46"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#4c5261"
        fadeDistance={11}
        fadeStrength={1}
        infiniteGrid
      />
      <OrbitControls
        makeDefault
        target={[0, 0.36, 0]}
        enableDamping
        minDistance={0.4}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.01}
      />
    </Canvas>
  )
}
