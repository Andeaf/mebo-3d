import type { TranslationKey } from './nl'

/** Romanian dictionary; must cover every TranslationKey (compile-time checked). */
export const ro: Record<TranslationKey, string> = {
  'app.title': 'Mebo 3D',
  'app.subtitle': 'Configurator de bucătării',
  'app.language': 'Limbă',

  'toolbar.add': 'Adaugă corp',
  'toolbar.duplicate': 'Duplică',
  'toolbar.delete': 'Șterge',
  'toolbar.rotate': 'Rotește (R)',
  'toolbar.fitView': 'Încadrează tot',

  'params.title': 'Dimensiuni și opțiuni',
  'params.noSelection': 'Dă clic pe un corp în vederea 3D ca să îl editezi.',
  'params.width': 'Lățime',
  'params.height': 'Înălțime',
  'params.depth': 'Adâncime',
  'params.shelves': 'Polițe',
  'params.doors': 'Uși',
  'params.material': 'Material corp',

  'viewport.selected': 'Selecție',

  'unit.mm': 'mm',
  'unit.m2': 'm²',
  'unit.m': 'm',
  'unit.piece': 'buc',

  'price.title': 'Detaliere preț',
  'price.loading': 'Se încarcă prețurile…',
  'price.loadError': 'Baza de prețuri nu a putut fi încărcată:',
  'price.missing': 'Materiale necunoscute (lipsesc din baza de prețuri):',
  'price.category.board': 'Plăci',
  'price.category.edgeband': 'Cant',
  'price.category.hardware': 'Feronerie',
  'price.cabinets': 'Corpuri',
  'price.subtotal': 'Subtotal',
  'price.total': 'Total (fără TVA)'
}
