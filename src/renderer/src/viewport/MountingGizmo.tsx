import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { Object3D, Vector3 } from 'three'
import { designMountingHeightMm } from '@core/catalog/registry'
import { snapToStep, PANEL_MOVE_STEP_MM } from '@core/customPiece'
import { findPlacedCabinet, type PlacedCabinet } from '@core/scene'
import { useAppStore } from '@state/store'
import type { GizmoHandle } from './PanelGizmo'

/** The vertical drag snaps to the same 10 mm grid as a panel drag. */
const MOUNTING_STEP_MM = PANEL_MOVE_STEP_MM

/** Runtime-public fields that three-stdlib's typings declare private. */
interface TransformControlsState {
  readonly axis: string | null
  readonly dragging: boolean
}

function stateOf(controls: TransformControlsImpl): TransformControlsState {
  return controls as unknown as TransformControlsState
}

/** The proxy sits at the carcass centre, at the cabinet's bottom, in world metres. */
function anchor(placed: PlacedCabinet, mountingHeightMm: number): Vector3 {
  return new Vector3(placed.positionX / 1000, mountingHeightMm / 1000, placed.positionZ / 1000)
}

interface DragState {
  readonly startHeightMm: number
  readonly startProxyY: number
  cancelled: boolean
}

interface MountingGizmoProps {
  /** The selected, hanging cabinet and its current mounting height. */
  readonly placed: PlacedCabinet
  readonly mountingHeightMm: number
  readonly onHandle: (handle: GizmoHandle | null) => void
  /** The viewport keeps the gizmo mounted for the whole drag through this. */
  readonly onDragChange: (dragging: boolean) => void
}

/**
 * The green arrow on a hanging item (a wall cabinet, a wall-mounted custom
 * piece): drags `mountingHeightMm` with 10 mm snapping. The same proxy
 * discipline as the panel gizmo, world space, Y only. Live frames go
 * through `moveSelectedVertically` (blocked, never relocated, like the
 * floor drag); the drop goes through `updateSelectedDesign` (the gate, as
 * any edit); the whole drag is one undo gesture; Escape cancels.
 */
export function MountingGizmo({
  placed,
  mountingHeightMm,
  onHandle,
  onDragChange
}: MountingGizmoProps): ReactElement {
  const moveSelectedVertically = useAppStore((state) => state.moveSelectedVertically)
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const beginGesture = useAppStore((state) => state.beginGesture)
  const endGesture = useAppStore((state) => state.endGesture)
  const cancelGesture = useAppStore((state) => state.cancelGesture)

  const proxy = useMemo(() => new Object3D(), [])
  const controlsRef = useRef<TransformControlsImpl | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const latest = useRef({ placed, mountingHeightMm })
  latest.current = { placed, mountingHeightMm }

  useLayoutEffect(() => {
    proxy.position.copy(anchor(placed, mountingHeightMm))
  }, [proxy, placed, mountingHeightMm])

  /** The cabinet's real pose from the store: what the proxy is glued to. */
  const reglue = (): void => {
    const current = findPlacedCabinet(useAppStore.getState().scene, latest.current.placed.id)
    const height = current === undefined ? null : designMountingHeightMm(current.design)
    if (current !== undefined) {
      proxy.position.copy(anchor(current, height ?? 0))
    }
  }

  const handle = useMemo<GizmoHandle>(
    () => ({
      isActive: () => {
        const controls = controlsRef.current
        if (controls === null) {
          return false
        }
        const { axis, dragging } = stateOf(controls)
        return axis !== null || dragging
      },
      isDragging: () => controlsRef.current !== null && stateOf(controlsRef.current).dragging,
      cancel: () => {
        const drag = dragRef.current
        if (drag === null || drag.cancelled) {
          return
        }
        drag.cancelled = true
        cancelGesture()
        controlsRef.current?.reset()
      }
    }),
    [cancelGesture]
  )

  useEffect(() => {
    onHandle(handle)
    return () => onHandle(null)
  }, [handle, onHandle])

  const onMouseDown = (): void => {
    dragRef.current = {
      startHeightMm: latest.current.mountingHeightMm,
      startProxyY: proxy.position.y,
      cancelled: false
    }
    beginGesture()
    onDragChange(true)
  }

  const onObjectChange = (): void => {
    const drag = dragRef.current
    if (drag === null) {
      return
    }
    if (!drag.cancelled) {
      const deltaMm = (proxy.position.y - drag.startProxyY) * 1000
      moveSelectedVertically(snapToStep(drag.startHeightMm + deltaMm, MOUNTING_STEP_MM))
    }
    // Blocked, clamped or cancelled: the gizmo stays on the cabinet either way.
    reglue()
  }

  const onMouseUp = (): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag !== null && !drag.cancelled) {
      // The drop: through the gate like any edit (a no-op for a legal pose,
      // apart from a possible snap), then the gesture's one entry.
      const current = findPlacedCabinet(useAppStore.getState().scene, latest.current.placed.id)
      if (current !== undefined) {
        updateSelectedDesign(current.design)
      }
      endGesture()
    }
    onDragChange(false)
  }

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        ref={controlsRef}
        object={proxy}
        mode="translate"
        space="world"
        showX={false}
        showZ={false}
        size={0.9}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onObjectChange={onObjectChange}
      />
    </>
  )
}
