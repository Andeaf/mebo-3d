/**
 * The single UI string dictionary. Every user-visible string in the renderer
 * comes from here, so the app language can be switched later by swapping
 * this dictionary for another one.
 */
export const nl = {
  'app.title': 'Mebo 3D',
  'app.subtitle': 'Onderkast configurator',

  'params.title': 'Afmetingen & opties',
  'params.width': 'Breedte',
  'params.height': 'Hoogte',
  'params.depth': 'Diepte',
  'params.shelves': 'Legplanken',
  'params.doors': 'Deuren',
  'params.material': 'Korpusmateriaal',

  'unit.mm': 'mm',
  'unit.m2': 'm²',
  'unit.m': 'm',
  'unit.piece': 'st',

  'price.title': 'Prijsopbouw',
  'price.loading': 'Prijzen laden…',
  'price.loadError': 'Prijsdatabase kon niet geladen worden:',
  'price.missing': 'Onbekende materialen (niet in prijsdatabase):',
  'price.category.board': 'Plaatmateriaal',
  'price.category.edgeband': 'Kantenband',
  'price.category.hardware': 'Beslag',
  'price.subtotal': 'Subtotaal',
  'price.total': 'Totaal (excl. btw)'
} as const

export type TranslationKey = keyof typeof nl

export function t(key: TranslationKey): string {
  return nl[key]
}
