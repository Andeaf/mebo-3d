import type { TranslationKey } from './nl'

/** English dictionary; must cover every TranslationKey (compile-time checked). */
export const en: Record<TranslationKey, string> = {
  'app.title': 'Mebo 3D',
  'app.subtitle': 'Kitchen configurator',
  'app.language': 'Language',

  'toolbar.add': 'Add cabinet',
  'toolbar.duplicate': 'Duplicate',
  'toolbar.delete': 'Delete',
  'toolbar.rotate': 'Rotate (R)',
  'toolbar.fitView': 'Fit view',

  'params.title': 'Dimensions & options',
  'params.noSelection': 'Click a cabinet in the 3D view to edit it.',
  'params.width': 'Width',
  'params.height': 'Height',
  'params.depth': 'Depth',
  'params.shelves': 'Shelves',
  'params.doors': 'Doors',
  'params.material': 'Carcass material',

  'viewport.selected': 'Selection',

  'unit.mm': 'mm',
  'unit.m2': 'm²',
  'unit.m': 'm',
  'unit.piece': 'pcs',

  'price.title': 'Price breakdown',
  'price.loading': 'Loading prices…',
  'price.loadError': 'The price database could not be loaded:',
  'price.missing': 'Unknown materials (not in the price database):',
  'price.category.board': 'Sheet material',
  'price.category.edgeband': 'Edge banding',
  'price.category.hardware': 'Hardware',
  'price.cabinets': 'Cabinets',
  'price.subtotal': 'Subtotal',
  'price.total': 'Total (excl. VAT)'
}
