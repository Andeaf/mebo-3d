import {
  addPresetPanel,
  createDefaultCustomPieceSpec,
  type CustomDrawerSpec,
  type CustomPieceSpec,
  type PanelPreset
} from '@core/customPiece'

/** A drawer in the preset materials; 596 × 150 at the bottom-left reveal unless told otherwise. */
export function drawer(overrides: Partial<CustomDrawerSpec> = {}): CustomDrawerSpec {
  return {
    id: 'drawer-1',
    originMm: { x: 2, y: 2 },
    widthMm: 596,
    heightMm: 150,
    frontMaterialId: 'melamine-white-18',
    boxMaterialId: 'melamine-white-18',
    bottomMaterialId: 'hdf-back-3',
    edgeBandMaterialId: 'abs-edge',
    ...overrides
  }
}

/** Applies panel presets in order. */
export function withPresets(spec: CustomPieceSpec, ...presets: PanelPreset[]): CustomPieceSpec {
  let next = spec
  for (const preset of presets) {
    const change = addPresetPanel(next, preset)
    if (change === null) {
      throw new Error(`preset ${preset} refused`)
    }
    next = change.spec
  }
  return next
}

/**
 * A floating TV unit: 1600 × 350 × 400 hung at 450 mm, a carcass with a
 * divider, one drawer in the left compartment, the right one open.
 */
export function floatingTvUnit(): CustomPieceSpec {
  const carcass = withPresets(
    {
      ...createDefaultCustomPieceSpec('Zwevend TV-meubel'),
      widthMm: 1600,
      heightMm: 350,
      depthMm: 400,
      mountingHeightMm: 450
    },
    'side',
    'side',
    'top',
    'bottom',
    'back',
    'divider'
  )
  return { ...carcass, drawers: [drawer({ originMm: { x: 2, y: 2 }, widthMm: 796, heightMm: 346 })] }
}
