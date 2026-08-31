import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { sceneBoundingRect } from '@core/footprint'
import type { PlacedCabinet } from '@core/scene'
import { useAppStore } from '@state/store'
import { PlacedCabinetMesh } from './PlacedCabinetMesh'

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0)

interface DragState {
  cabinetId: string
  offsetX: number
  offsetZ: number
  attemptedX: number
  attemptedZ: number
}

function SceneContents(): ReactElement {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  const selectCabinet = useAppStore((state) => state.selectCabinet)
  const moveSelected = useAppStore((state) => state.moveSelected)
  const dropSelected = useAppStore((state) => state.dropSelected)
  const fitViewNonce = useAppStore((state) => state.fitViewNonce)
  const priceDb = useAppStore((state) => state.priceDb)

  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const raycaster = useMemo(() => new Raycaster(), [])
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)

  const floorPointMm = (event: PointerEvent): { x: number; z: number } | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const point = new Vector3()
    if (raycaster.ray.intersectPlane(FLOOR_PLANE, point) === null) {
      return null
    }
    return { x: point.x * 1000, z: point.z * 1000 }
  }

  const startDrag = (placed: PlacedCabinet, event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    selectCabinet(placed.id)
    if (event.button !== 0) {
      return
    }
    const floorPoint = floorPointMm(event.nativeEvent)
    if (floorPoint === null) {
      return
    }
    dragRef.current = {
      cabinetId: placed.id,
      offsetX: placed.positionX - floorPoint.x,
      offsetZ: placed.positionZ - floorPoint.z,
      attemptedX: placed.positionX,
      attemptedZ: placed.positionZ
    }
    if (controlsRef.current !== null) {
      controlsRef.current.enabled = false
    }
    setDragging(true)
  }

  useEffect(() => {
    if (!dragging) {
      return
    }
    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      const floorPoint = floorPointMm(event)
      if (drag === null || floorPoint === null) {
        return
      }
      drag.attemptedX = floorPoint.x + drag.offsetX
      drag.attemptedZ = floorPoint.z + drag.offsetZ
      moveSelected(drag.attemptedX, drag.attemptedZ)
    }
    const onPointerUp = (): void => {
      const drag = dragRef.current
      if (drag !== null) {
        dropSelected(drag.attemptedX, drag.attemptedZ)
      }
      dragRef.current = null
      if (controlsRef.current !== null) {
        controlsRef.current.enabled = true
      }
      setDragging(false)
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, moveSelected, dropSelected])

  useEffect(() => {
    if (fitViewNonce === 0) {
      return
    }
    const currentScene = useAppStore.getState().scene
    const bounds = sceneBoundingRect(currentScene)
    const controls = controlsRef.current
    if (bounds === null || controls === null || !(camera instanceof PerspectiveCamera)) {
      return
    }
    const maxHeightMm = currentScene.cabinets.reduce(
      (max, cabinet) => Math.max(max, cabinet.design.params.heightMm),
      0
    )
    const center = new Vector3(
      (bounds.minX + bounds.maxX) / 2000,
      maxHeightMm / 2000,
      (bounds.minZ + bounds.maxZ) / 2000
    )
    const spanX = (bounds.maxX - bounds.minX) / 1000
    const spanZ = (bounds.maxZ - bounds.minZ) / 1000
    const spanY = maxHeightMm / 1000
    const radius = Math.max(0.6, Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ) / 2)
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15
    const direction = camera.position.clone().sub(controls.target).normalize()
    camera.position.copy(center.clone().add(direction.multiplyScalar(distance)))
    controls.target.copy(center)
    controls.update()
    // Reacts to the nonce only; the scene is read fresh via getState above.
  }, [fitViewNonce])

  return (
    <>
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
          onPointerDown={(event) => startDrag(placed, event)}
        />
      ))}

      {/* Invisible catcher below the grid: clicking empty floor deselects. */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.002, 0]}
        onPointerDown={() => {
          if (!dragging) {
            selectCabinet(null)
          }
        }}
      >
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
        ref={controlsRef}
        makeDefault
        target={[0, 0.36, 0]}
        enableDamping
        minDistance={0.4}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.01}
      />
    </>
  )
}

export function Viewport(): ReactElement {
  const rotateSelected = useAppStore((state) => state.rotateSelected)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'r') {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
      ) {
        return
      }
      rotateSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [rotateSelected])

  return (
    <Canvas camera={{ position: [1.9, 1.4, 2.4], fov: 42 }}>
      <SceneContents />
    </Canvas>
  )
}
