import { useEffect, useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import { TransformControls } from '@react-three/drei'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import { Object3D, Vector3 } from 'three'
import {
  movePanel,
  panelBox,
  snapToStep,
  CUSTOM_PIECE_KIND,
  PANEL_MOVE_STEP_MM,
  type CustomPanelSpec,
  type CustomPieceSpec
} from '@core/customPiece'
import type { PlacedCabinet } from '@core/scene'
import type { Vec3 } from '@core/units'
import { useAppStore } from '@state/store'

const UP = new Vector3(0, 1, 0)

/**
 * What the viewport needs from a gizmo without owning it: whether the
 * pointer is on it (scene picking must stand back), whether a drag runs
 * (Escape cancels it before anything else), and the cancel itself.
 */
export interface GizmoHandle {
  /** A handle is hovered or a drag is running. */
  readonly isActive: () => boolean
  readonly isDragging: () => boolean
  /** Escape: the object returns to where the drag started; the rest of the pointer gesture is ignored. */
  readonly cancel: () => void
}

/** Runtime-public fields that three-stdlib's typings declare private. */
interface TransformControlsState {
  readonly axis: string | null
  readonly dragging: boolean
}

function stateOf(controls: TransformControlsImpl): TransformControlsState {
  return controls as unknown as TransformControlsState
}

function yawOf(placed: PlacedCabinet): number {
  return (placed.rotationDeg * Math.PI) / 180
}

/** The panel's box centre in world metres: piece space → the placed, turned, lifted group. */
function worldCenter(placed: PlacedCabinet, spec: CustomPieceSpec, panel: CustomPanelSpec): Vector3 {
  const centre = panelBox(panel).center
  return new Vector3(
    (centre.x - spec.widthMm / 2) / 1000,
    centre.y / 1000,
    (centre.z - spec.depthMm / 2) / 1000
  )
    .applyAxisAngle(UP, yawOf(placed))
    .add(
      new Vector3(placed.positionX / 1000, spec.mountingHeightMm / 1000, placed.positionZ / 1000)
    )
}

function snap(value: number): number {
  return snapToStep(value, PANEL_MOVE_STEP_MM)
}

interface DragState {
  readonly startOrigin: Vec3
  readonly startProxy: Vector3
  cancelled: boolean
}

interface PanelGizmoProps {
  /** The open piece and its spec; `panel` is the selected panel of that spec. */
  readonly placed: PlacedCabinet
  readonly spec: CustomPieceSpec
  readonly panel: CustomPanelSpec
  readonly onHandle: (handle: GizmoHandle | null) => void
}

/**
 * The translate gizmo of the piece editor: the stock red/green/blue arrows
 * and plane handles, attached to a PROXY object at the scene root rather
 * than to the panel mesh. The mesh stays a pure derivation of the store
 * (one source of truth); the proxy is unscaled, carries the piece's yaw
 * (`space="local"` then points the arrows along the piece's own axes) and
 * is glued back to the panel's real, clamped centre after every store
 * change. Snapping is ours (absolute 10 mm grid on the origin, the same
 * step the origin sliders use) — the control's own `translationSnap` adds
 * the parent's world position before rounding, which is meaningless here.
 *
 * One drag = one undo gesture: mouse-down begins it, every move goes
 * through `movePanel` (clamped into the envelope) and the ordinary
 * `updateSelectedDesign`, mouse-up ends it. Escape (via the handle) puts
 * the panel back and ignores the rest of the pointer gesture.
 */
export function PanelGizmo({ placed, spec, panel, onHandle }: PanelGizmoProps): ReactElement {
  const updateSelectedDesign = useAppStore((state) => state.updateSelectedDesign)
  const beginGesture = useAppStore((state) => state.beginGesture)
  const endGesture = useAppStore((state) => state.endGesture)
  const cancelGesture = useAppStore((state) => state.cancelGesture)

  const proxy = useMemo(() => new Object3D(), [])
  const controlsRef = useRef<TransformControlsImpl | null>(null)
  const dragRef = useRef<DragState | null>(null)
  // The handlers read the latest props through refs: drei keeps the first
  // callback identity it is given per event.
  const latest = useRef({ placed, spec, panel })
  latest.current = { placed, spec, panel }

  // Glue the proxy to the panel. Runs on every store change of the panel or
  // the piece (a slider, an undo, a clamped drag frame, a gate relocation),
  // so the gizmo always sits on the panel's real centre.
  useLayoutEffect(() => {
    proxy.position.copy(worldCenter(placed, spec, panel))
    proxy.quaternion.setFromAxisAngle(UP, yawOf(placed))
  }, [proxy, placed, spec, panel])

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
      startOrigin: latest.current.panel.originMm,
      startProxy: proxy.position.clone(),
      cancelled: false
    }
    beginGesture()
  }

  const onObjectChange = (): void => {
    const drag = dragRef.current
    if (drag === null) {
      return
    }
    const { placed: piece, spec: current, panel: target } = latest.current
    if (drag.cancelled) {
      // The control keeps moving the proxy until the button is released;
      // keep the gizmo on the panel, which already went back.
      proxy.position.copy(worldCenter(piece, current, target))
      return
    }
    // The control sets proxy = start + pointer offset (world metres); into
    // the piece's axes, in mm, snapped, and through the envelope clamp.
    const delta = proxy.position
      .clone()
      .sub(drag.startProxy)
      .applyAxisAngle(UP, -yawOf(piece))
      .multiplyScalar(1000)
    const origin: Vec3 = {
      x: snap(drag.startOrigin.x + delta.x),
      y: snap(drag.startOrigin.y + delta.y),
      z: snap(drag.startOrigin.z + delta.z)
    }
    updateSelectedDesign({ kind: CUSTOM_PIECE_KIND, spec: movePanel(current, target.id, origin) })
  }

  const onMouseUp = (): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag !== null && !drag.cancelled) {
      endGesture()
    }
  }

  return (
    <>
      <primitive object={proxy} />
      <TransformControls
        ref={controlsRef}
        object={proxy}
        mode="translate"
        space="local"
        size={0.8}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onObjectChange={onObjectChange}
      />
    </>
  )
}
