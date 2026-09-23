import { useMemo, type ReactElement } from 'react'
import { Edges } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { BoxGeometry } from 'three'
import { designFootprintSize, designVerticalExtent } from '@core/catalog/registry'
import { elementIdOfPart } from '@core/customPiece'
import { GeneratedGeometry } from '@core/geometry/GeometrySource'
import type { PriceDatabase } from '@core/materials'
import type { PlacedCabinet } from '@core/scene'
import { buildForDesign } from '@state/selectors'
import { colorForMaterial, darken, FALLBACK_PANEL_COLOR } from './materialColor'

export const SELECTION_COLOR = '#4f8cff'
const PANEL_SELECTION_COLOR = '#ffb547'
/**
 * How faded the rest of the scene is while a piece is being edited. Low on
 * purpose: a cabinet is several overlapping panels, and their alphas stack.
 */
const DIMMED_OPACITY = 0.08

interface PlacedCabinetMeshProps {
  readonly placed: PlacedCabinet
  readonly selected: boolean
  readonly priceDb: PriceDatabase | null
  /** Scene mode: starts a drag (and selects). Absent while a piece is open. */
  readonly onPointerDown?: (event: ThreeEvent<PointerEvent>) => void
  readonly onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void
  /**
   * Edit mode, the open piece: its parts are pick targets and its envelope is
   * drawn. A part picks and lights up as the element it belongs to: a panel
   * as itself, any of a drawer's six parts as the drawer.
   */
  readonly editing?: boolean
  readonly selectedElementId?: string | null
  readonly onSelectElement?: (elementId: string) => void
  /**
   * True while a gizmo handle is under the pointer: the press belongs to the
   * gizmo, so a panel behind the handle must not be (re)selected.
   */
  readonly pointerBlocked?: () => boolean
  /** Edit mode, every other cabinet: faded, ignoring the pointer. */
  readonly dimmed?: boolean
}

/**
 * One placed cabinet, whatever its design family: the panel boxes the
 * GeometrySource describes, coloured by material. Kind-agnostic on purpose —
 * the envelope drawn in edit mode comes from the footprint and the vertical
 * extent, which every design answers.
 */
export function PlacedCabinetMesh({
  placed,
  selected,
  priceDb,
  onPointerDown,
  onDoubleClick,
  editing = false,
  selectedElementId = null,
  onSelectElement,
  pointerBlocked,
  dimmed = false
}: PlacedCabinetMeshProps): ReactElement {
  const build = buildForDesign(placed.design)
  const description = useMemo(() => new GeneratedGeometry(build).describe(), [build])
  const { widthMm, depthMm } = designFootprintSize(placed.design)
  // Panels are generated with y = 0 at the cabinet's own bottom; a wall
  // cabinet (or a hanging piece) is simply lifted to its mounting height here.
  const { bottomMm, topMm } = designVerticalExtent(placed.design)
  const heightMm = topMm - bottomMm
  const envelope = useMemo(
    () => (editing ? new BoxGeometry(widthMm, heightMm, depthMm) : null),
    [editing, widthMm, heightMm, depthMm]
  )

  const ignorePointer = dimmed ? { raycast: () => null } : {}

  return (
    // World placement: position/rotation in meters around the carcass
    // footprint center; inside, domain mm coordinates are scaled and offset.
    <group
      position={[placed.positionX / 1000, bottomMm / 1000, placed.positionZ / 1000]}
      rotation={[0, (placed.rotationDeg * Math.PI) / 180, 0]}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <group scale={[0.001, 0.001, 0.001]}>
        <group position={[-widthMm / 2, 0, -depthMm / 2]}>
          {description.boxes.map((instance) => {
            const color = colorForMaterial(priceDb, instance.materialId, FALLBACK_PANEL_COLOR)
            const elementId = elementIdOfPart(instance.panelId)
            const panelSelected = editing && elementId === selectedElementId
            return (
              <mesh
                key={instance.panelId}
                position={[instance.box.center.x, instance.box.center.y, instance.box.center.z]}
                onPointerDown={
                  editing && onSelectElement !== undefined
                    ? (event) => {
                        if (pointerBlocked?.() === true) {
                          return // the press is the gizmo's
                        }
                        event.stopPropagation()
                        if (event.button === 0) {
                          onSelectElement(elementId)
                        }
                      }
                    : undefined
                }
                {...ignorePointer}
              >
                <boxGeometry
                  args={[instance.box.size.x, instance.box.size.y, instance.box.size.z]}
                />
                {/* Keyed on `dimmed`: three.js bakes OPAQUE into the shader of a
                    material created with transparent=false, so toggling the flag
                    on a live material never fades — a fresh material does. */}
                <meshStandardMaterial
                  key={dimmed ? 'dimmed' : 'solid'}
                  color={color}
                  roughness={0.85}
                  metalness={0.05}
                  emissive={panelSelected ? PANEL_SELECTION_COLOR : SELECTION_COLOR}
                  emissiveIntensity={panelSelected ? 0.5 : selected && !editing ? 0.14 : 0}
                  transparent={dimmed}
                  opacity={dimmed ? DIMMED_OPACITY : 1}
                  depthWrite={!dimmed}
                />
                {!dimmed && (
                  <Edges
                    color={panelSelected ? PANEL_SELECTION_COLOR : darken(color, 0.55)}
                    threshold={15}
                  />
                )}
              </mesh>
            )
          })}
          {envelope !== null && (
            <lineSegments position={[widthMm / 2, heightMm / 2, depthMm / 2]} raycast={() => null}>
              <edgesGeometry args={[envelope]} />
              <lineBasicMaterial color={SELECTION_COLOR} />
            </lineSegments>
          )}
        </group>
        {selected && !editing && (
          <mesh rotation-x={-Math.PI / 2} position={[0, 1.5, 0]} raycast={() => null}>
            <planeGeometry args={[widthMm + 60, depthMm + 60]} />
            <meshBasicMaterial
              color={SELECTION_COLOR}
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
