import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three'
import { designVerticalExtent } from '@core/catalog/registry'
import { placedCabinetRect, placedVerticalInterval } from '@core/footprint'
import { roomInteriorRect } from '@core/room'
import { findPlacedCabinet, type PlacedCabinet } from '@core/scene'
import { useWorktops } from '@state/selectors'
import { useAppStore } from '@state/store'
import { isTypingTarget, keyCommand } from './keymap'
import { MeasureLine } from './MeasureLine'
import { PlacedCabinetMesh } from './PlacedCabinetMesh'
import { RoomView } from './RoomView'
import { WorktopView } from './WorktopView'

/** Horizontal drag plane at a given height (meters); y = 0 for floor kinds. */
function planeAtHeight(heightMeters: number): Plane {
  return new Plane(new Vector3(0, 1, 0), -heightMeters)
}

interface DragState {
  cabinetId: string
  offsetX: number
  offsetZ: number
  attemptedX: number
  attemptedZ: number
  /** The cabinet's own bottom: dragging a wall cabinet must not parallax. */
  plane: Plane
}

/** World-mm box to frame: floor rect plus a vertical interval. */
interface FrameBounds {
  readonly minX: number
  readonly maxX: number
  readonly minY: number
  readonly maxY: number
  readonly minZ: number
  readonly maxZ: number
}

interface CameraPose {
  readonly position: Vector3
  readonly target: Vector3
}

/** Moves the camera back along its current view direction until `bounds` fits, and looks at its centre. */
function frameBounds(
  camera: PerspectiveCamera,
  controls: OrbitControlsImpl,
  bounds: FrameBounds,
  padding: number
): void {
  const center = new Vector3(
    (bounds.minX + bounds.maxX) / 2000,
    (bounds.minY + bounds.maxY) / 2000,
    (bounds.minZ + bounds.maxZ) / 2000
  )
  const spanX = (bounds.maxX - bounds.minX) / 1000
  const spanY = (bounds.maxY - bounds.minY) / 1000
  const spanZ = (bounds.maxZ - bounds.minZ) / 1000
  const radius = Math.max(0.6, Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ) / 2)
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * padding
  const direction = camera.position.clone().sub(controls.target).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(distance)))
  controls.target.copy(center)
  controls.update()
}

function SceneContents(): ReactElement {
  const scene = useAppStore((state) => state.scene)
  const selectedCabinetId = useAppStore((state) => state.selectedCabinetId)
  const editingPieceId = useAppStore((state) => state.editor.editingPieceId)
  const selectedPanelId = useAppStore((state) => state.editor.selectedPanelId)
  const selectCabinet = useAppStore((state) => state.selectCabinet)
  const selectPanel = useAppStore((state) => state.selectPanel)
  const enterPieceEditor = useAppStore((state) => state.enterPieceEditor)
  const exitPieceEditor = useAppStore((state) => state.exitPieceEditor)
  const moveSelected = useAppStore((state) => state.moveSelected)
  const dropSelected = useAppStore((state) => state.dropSelected)
  const rotateSelected = useAppStore((state) => state.rotateSelected)
  const beginGesture = useAppStore((state) => state.beginGesture)
  const endGesture = useAppStore((state) => state.endGesture)
  const cancelGesture = useAppStore((state) => state.cancelGesture)
  const undo = useAppStore((state) => state.undo)
  const redo = useAppStore((state) => state.redo)
  const fitViewNonce = useAppStore((state) => state.fitViewNonce)
  const priceDb = useAppStore((state) => state.priceDb)
  const slabs = useWorktops()
  const editing = editingPieceId !== null

  const { camera, gl } = useThree()
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const raycaster = useMemo(() => new Raycaster(), [])
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)
  /** Where the camera stood before the editor framed the piece; restored on exit. */
  const poseBeforeEditRef = useRef<CameraPose | null>(null)

  const pointOnPlaneMm = (event: PointerEvent, plane: Plane): { x: number; z: number } | null => {
    const rect = gl.domElement.getBoundingClientRect()
    const ndc = new Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, camera)
    const point = new Vector3()
    if (raycaster.ray.intersectPlane(plane, point) === null) {
      return null
    }
    return { x: point.x * 1000, z: point.z * 1000 }
  }

  // A drag is one undo gesture: frames move the cabinet without recording,
  // the drop records the pre-drag scene as one entry, Escape restores it.
  const startDrag = (placed: PlacedCabinet, event: ThreeEvent<PointerEvent>): void => {
    event.stopPropagation()
    selectCabinet(placed.id)
    if (event.button !== 0) {
      return
    }
    const plane = planeAtHeight(designVerticalExtent(placed.design).bottomMm / 1000)
    const grabPoint = pointOnPlaneMm(event.nativeEvent, plane)
    if (grabPoint === null) {
      return
    }
    dragRef.current = {
      cabinetId: placed.id,
      offsetX: placed.positionX - grabPoint.x,
      offsetZ: placed.positionZ - grabPoint.z,
      attemptedX: placed.positionX,
      attemptedZ: placed.positionZ,
      plane
    }
    if (controlsRef.current !== null) {
      controlsRef.current.enabled = false
    }
    beginGesture()
    setDragging(true)
  }

  const finishDrag = useCallback((): void => {
    dragRef.current = null
    if (controlsRef.current !== null) {
      controlsRef.current.enabled = true
    }
    setDragging(false)
  }, [])

  /** Escape mid-drag: the cabinet returns to where it was picked up (Blender/Fusion convention). */
  const cancelDrag = useCallback((): void => {
    if (dragRef.current === null) {
      return
    }
    cancelGesture()
    finishDrag()
  }, [cancelGesture, finishDrag])

  useEffect(() => {
    if (!dragging) {
      return
    }
    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragRef.current
      if (drag === null) {
        return
      }
      const point = pointOnPlaneMm(event, drag.plane)
      if (point === null) {
        return
      }
      drag.attemptedX = point.x + drag.offsetX
      drag.attemptedZ = point.z + drag.offsetZ
      moveSelected(drag.attemptedX, drag.attemptedZ)
    }
    const onPointerUp = (): void => {
      const drag = dragRef.current
      if (drag !== null) {
        dropSelected(drag.attemptedX, drag.attemptedZ)
      }
      endGesture()
      finishDrag()
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, moveSelected, dropSelected, endGesture, finishDrag])

  // Keyboard: the map lives in keymap.ts. Undo/redo are store no-ops during
  // a gesture; Escape cancels a running drag before it means "leave the editor".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) {
        return
      }
      const command = keyCommand(event)
      if (command === null) {
        return
      }
      switch (command) {
        case 'undo':
          event.preventDefault()
          undo()
          break
        case 'redo':
          event.preventDefault()
          redo()
          break
        case 'rotate':
          rotateSelected() // a no-op while a piece is open
          break
        case 'escape':
          if (dragRef.current !== null) {
            cancelDrag()
          } else {
            exitPieceEditor()
          }
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, rotateSelected, exitPieceEditor, cancelDrag])

  // Runs on mount too (nonce 0), so the room is framed from the first frame:
  // OrbitControls does not apply its target prop before the first render.
  useEffect(() => {
    const currentScene = useAppStore.getState().scene
    const controls = controlsRef.current
    if (controls === null || !(camera instanceof PerspectiveCamera)) {
      return
    }
    // Frame the room: every cabinet is inside it by invariant, so this always
    // contains the furniture too — including anything hanging on a wall.
    const bounds = roomInteriorRect(currentScene.room)
    const maxTopMm = Math.max(
      currentScene.room.wallHeightMm,
      ...currentScene.cabinets.map((cabinet) => designVerticalExtent(cabinet.design).topMm)
    )
    frameBounds(camera, controls, { ...bounds, minY: 0, maxY: maxTopMm }, 1.15)
    // Reacts to the nonce only; the scene is read fresh via getState above.
  }, [fitViewNonce])

  // Entering the editor frames the piece; leaving it puts the camera back.
  // The frame follows the piece when it MOVES (the gate relocated it, or it
  // went up on the wall) but not when it merely resizes, so a slider drag
  // does not make the camera jump.
  const editedPiece = editingPieceId === null ? undefined : findPlacedCabinet(scene, editingPieceId)
  const editedBottomMm = editedPiece === undefined ? 0 : placedVerticalInterval(editedPiece).bottomMm
  useEffect(() => {
    const controls = controlsRef.current
    if (controls === null || !(camera instanceof PerspectiveCamera)) {
      return
    }
    if (editingPieceId !== null) {
      const placed = findPlacedCabinet(useAppStore.getState().scene, editingPieceId)
      if (placed === undefined) {
        return
      }
      if (poseBeforeEditRef.current === null) {
        poseBeforeEditRef.current = {
          position: camera.position.clone(),
          target: controls.target.clone()
        }
      }
      const rect = placedCabinetRect(placed)
      const { bottomMm, topMm } = placedVerticalInterval(placed)
      frameBounds(camera, controls, { ...rect, minY: bottomMm, maxY: topMm }, 1.6)
    } else if (poseBeforeEditRef.current !== null) {
      camera.position.copy(poseBeforeEditRef.current.position)
      controls.target.copy(poseBeforeEditRef.current.target)
      controls.update()
      poseBeforeEditRef.current = null
    }
  }, [
    editingPieceId,
    editedPiece?.positionX,
    editedPiece?.positionZ,
    editedPiece?.rotationDeg,
    editedBottomMm,
    camera
  ])

  return (
    <>
      <color attach="background" args={['#1d2026']} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 6, 4]} intensity={1.2} />
      <directionalLight position={[-4, 3, -3]} intensity={0.35} />

      {scene.cabinets.map((placed) =>
        editing ? (
          <PlacedCabinetMesh
            key={placed.id}
            placed={placed}
            selected={placed.id === selectedCabinetId}
            priceDb={priceDb}
            editing={placed.id === editingPieceId}
            selectedPanelId={selectedPanelId}
            onSelectPanel={selectPanel}
            dimmed={placed.id !== editingPieceId}
          />
        ) : (
          <PlacedCabinetMesh
            key={placed.id}
            placed={placed}
            selected={placed.id === selectedCabinetId}
            priceDb={priceDb}
            onPointerDown={(event) => startDrag(placed, event)}
            // Selects on the first press, opens the editor on the second; a
            // no-op for catalog cabinets (the store checks the family).
            onDoubleClick={(event) => {
              event.stopPropagation()
              enterPieceEditor()
            }}
          />
        )
      )}

      {/* Derived from the scene, never picked: a click on a slab reaches the cabinet under it. */}
      <WorktopView slabs={slabs} priceDb={priceDb} dimmed={editing} />

      <RoomView room={scene.room} />

      {!editing && <MeasureLine />}

      {/* Invisible catcher below the grid: clicking empty floor deselects (the panel while editing). */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, -0.002, 0]}
        onPointerDown={() => {
          if (editing) {
            selectPanel(null)
          } else if (!dragging) {
            selectCabinet(null)
          }
        }}
      >
        <planeGeometry args={[400, 400]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <ContactShadows position={[0, 0.001, 0]} opacity={0.35} scale={6} blur={2.4} far={1.4} />
      {/* Confined to the room floor: the grid stops where the walls start. */}
      <Grid
        position={[0, 0, 0]}
        args={[scene.room.widthMm / 1000, scene.room.lengthMm / 1000]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#3a3e46"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#4c5261"
        fadeDistance={30}
        fadeStrength={1}
      />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[0, 0.9, 0]}
        enableDamping
        minDistance={0.4}
        maxDistance={12}
        maxPolarAngle={Math.PI / 2 - 0.01}
      />
    </>
  )
}

export function Viewport(): ReactElement {
  return (
    // Outside the default room's front-right corner, so the near walls hide
    // themselves; the fit-view on mount then frames whatever room is loaded.
    <Canvas camera={{ position: [4.4, 3.3, 5.4], fov: 42 }}>
      <SceneContents />
    </Canvas>
  )
}
