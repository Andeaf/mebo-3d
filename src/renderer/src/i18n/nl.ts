/**
 * Dutch is the reference dictionary: its keys define the TranslationKey set
 * that en.ts and ro.ts must satisfy completely (compile-time checked).
 * Every user-visible string in the renderer comes from a dictionary.
 */
export const nl = {
  'app.title': 'Mebo 3D',
  'app.subtitle': 'Keukenconfigurator',
  'app.language': 'Taal',

  'toolbar.add': 'Kast toevoegen',

  'kind.base-cabinet': 'Onderkast',
  'kind.wall-cabinet': 'Bovenkast',
  'kind.tall-cabinet': 'Kolomkast',
  'kind.drawer-cabinet': 'Ladekast',

  'toolbar.duplicate': 'Dupliceren',
  'toolbar.delete': 'Verwijderen',
  'toolbar.rotate': 'Draaien (R)',
  'toolbar.fitView': 'Alles in beeld',

  'room.title': 'Ruimte',
  'room.width': 'Breedte ruimte',
  'room.length': 'Lengte ruimte',
  'room.wallHeight': 'Wandhoogte',

  'params.title': 'Afmetingen & opties',
  'params.noSelection': 'Klik op een kast in het 3D-beeld om deze te bewerken.',
  'params.width': 'Breedte',
  'params.height': 'Hoogte',
  'params.depth': 'Diepte',
  'params.shelves': 'Legplanken',
  'params.drawers': 'Lades',
  'params.mountingHeight': 'Ophanghoogte',
  'params.doors': 'Deuren',
  'params.material': 'Korpusmateriaal',
  'params.singleDoorLimit': 'Boven 600 mm breedte altijd twee deuren.',

  'viewport.selected': 'Selectie',
  'viewport.mountedAt': 'Ophanghoogte',

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
  'price.cabinets': 'Kasten',
  'price.subtotal': 'Subtotaal',
  'price.total': 'Totaal (excl. btw)',

  'menu.file': 'Bestand',
  'menu.new': 'Nieuw',
  'menu.open': 'Openen…',
  'menu.openRecent': 'Recent geopend',
  'menu.noRecent': 'Geen recente projecten',
  'menu.save': 'Opslaan',
  'menu.saveAs': 'Opslaan als…',
  'menu.exit': 'Afsluiten',

  'project.untitled': 'Naamloos',
  'project.fileFilter': 'Mebo 3D-project',
  'project.unsavedTitle': 'Niet-opgeslagen wijzigingen',
  'project.unsavedMessage': 'Het project bevat wijzigingen die nog niet zijn opgeslagen. Wil je ze opslaan?',
  'project.saveButton': 'Opslaan',
  'project.discardButton': 'Niet opslaan',
  'project.cancelButton': 'Annuleren',
  'project.openError': 'Project kon niet geopend worden:',
  'project.saveError': 'Project kon niet opgeslagen worden:',
  'project.fileMissing': 'Bestand niet gevonden; verwijderd uit de lijst met recente projecten:',
  'project.dismiss': 'Sluiten'
} as const

export type TranslationKey = keyof typeof nl
