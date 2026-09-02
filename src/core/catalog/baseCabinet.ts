import { validateBaseCabinetParams, type BaseCabinetParams } from '../cabinet'
import type { Panel } from '../panel'
import {
  backPanel,
  boundingSizeWithFronts,
  bottomPanel,
  doorHardware,
  overlayDoorPanels,
  shelfPanels,
  sidePanels,
  stretcherPanels,
  topPanel,
  type CabinetBuild
} from './parts'

/**
 * Parametric panel generation for the standard base kitchen cabinet
 * (frameless / European carcass construction). The construction pieces
 * themselves live in `parts.ts` and are shared with the other kinds; this
 * file only decides which pieces a base cabinet is made of.
 *
 * See `parts.ts` for the cabinet-space coordinate system.
 */

const HINGES_PER_DOOR = 2

// Re-exported so the rest of the app keeps one import site for these.
export {
  BACK_THICKNESS_MM,
  CARCASS_THICKNESS_MM,
  DOOR_THICKNESS_MM,
  HANDLE_MATERIAL_ID,
  HINGE_MATERIAL_ID
} from './parts'
export type { CabinetBuild } from './parts'

export function generateBaseCabinet(params: BaseCabinetParams): CabinetBuild {
  const errors = validateBaseCabinetParams(params)
  if (errors.length > 0) {
    throw new Error(`invalid base cabinet params: ${errors.join('; ')}`)
  }

  const panels: Panel[] = [
    ...sidePanels(params),
    bottomPanel(params),
    // The worktop closes a base cabinet, so two stretchers are the default;
    // a full top panel stays available for other uses.
    ...(params.topConstruction === 'panel' ? [topPanel(params)] : stretcherPanels(params)),
    backPanel(params),
    ...shelfPanels(params, params.shelfCount),
    ...overlayDoorPanels(params, params.doorCount)
  ]

  return {
    panels,
    hardware: doorHardware(params.doorCount, HINGES_PER_DOOR),
    boundingSizeMm: boundingSizeWithFronts(params, params.doorCount > 0)
  }
}
