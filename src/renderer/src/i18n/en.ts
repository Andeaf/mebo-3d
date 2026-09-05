import type { TranslationKey } from './nl'

/** English dictionary; must cover every TranslationKey (compile-time checked). */
export const en: Record<TranslationKey, string> = {
  'app.title': 'Mebo 3D',
  'app.subtitle': 'Kitchen configurator',
  'app.language': 'Language',

  'toolbar.add': 'Add cabinet',

  'kind.base-cabinet': 'Base cabinet',
  'kind.wall-cabinet': 'Wall cabinet',
  'kind.tall-cabinet': 'Tall cabinet',
  'kind.drawer-cabinet': 'Drawer cabinet',

  'toolbar.duplicate': 'Duplicate',
  'toolbar.delete': 'Delete',
  'toolbar.rotate': 'Rotate (R)',
  'toolbar.fitView': 'Fit view',

  'room.title': 'Room',
  'room.width': 'Room width',
  'room.length': 'Room length',
  'room.wallHeight': 'Wall height',

  'params.title': 'Dimensions & options',
  'params.noSelection': 'Click a cabinet in the 3D view to edit it.',
  'params.width': 'Width',
  'params.height': 'Height',
  'params.depth': 'Depth',
  'params.shelves': 'Shelves',
  'params.drawers': 'Drawers',
  'params.mountingHeight': 'Mounting height',
  'params.doors': 'Doors',
  'params.material': 'Carcass material',
  'params.singleDoorLimit': 'Above 600 mm width a cabinet always gets two doors.',

  'viewport.selected': 'Selection',
  'viewport.mountedAt': 'Mounted at',

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
  'price.total': 'Total (excl. VAT)',

  'menu.file': 'File',
  'menu.new': 'New',
  'menu.open': 'Open…',
  'menu.openRecent': 'Open Recent',
  'menu.noRecent': 'No recent projects',
  'menu.save': 'Save',
  'menu.saveAs': 'Save As…',
  'menu.exit': 'Exit',

  'project.untitled': 'Untitled',
  'project.fileFilter': 'Mebo 3D project',
  'project.unsavedTitle': 'Unsaved changes',
  'project.unsavedMessage': 'The project has changes that have not been saved. Do you want to save them?',
  'project.saveButton': 'Save',
  'project.discardButton': "Don't save",
  'project.cancelButton': 'Cancel',
  'project.openError': 'The project could not be opened:',
  'project.saveError': 'The project could not be saved:',
  'project.fileMissing': 'File not found; removed from the recent projects:',
  'project.dismiss': 'Dismiss'
}
