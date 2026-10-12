# Mebo 3D — handleiding

Mebo 3D is de interne configurator van Mebo: je zet kasten in een ruimte,
ziet ze in 3D en krijgt meteen de materiaalprijs. Deze handleiding is voor
wie het programma installeert en gebruikt.

## Installeren

1. Je krijgt een bestand `Mebo-3D-Setup-0.12.0.exe`. Dubbelklik erop.
2. Windows toont waarschijnlijk een blauw scherm **"Windows heeft uw pc
   beschermd"** (SmartScreen) met "Onbekende uitgever". Dat komt doordat het
   programma nog niet digitaal ondertekend is, niet doordat er iets mis is.
   Klik op **Meer informatie** en daarna op **Toch uitvoeren**.
3. Doorloop de installatie (Volgende → Installeren → Voltooien). Er zijn geen
   beheerdersrechten nodig; het programma komt in je eigen gebruikersmap:
   `C:\Users\<jouw naam>\AppData\Local\Programs\Mebo 3D`.
4. Er staat nu een snelkoppeling **Mebo 3D** op het bureaublad en in het
   startmenu.

Een nieuwere versie installeer je gewoon over de oude heen. Je recente
projecten, je taalkeuze en je eigen prijslijst blijven bewaard — zie
"Prijzen aanpassen".

## Eerste stappen

- **Taal**: rechtsboven kies je NL / EN / RO. De keuze wordt onthouden.
- **Kast toevoegen**: knop **+ Kast toevoegen** linksboven; kies onderkast,
  bovenkast, kolomkast, ladekast of onderkast met lade. De kast verschijnt
  tegen de achterwand, naast de vorige.
- **Verplaatsen en draaien**: sleep een kast met de muis. Kasten klikken
  vanzelf tegen elkaar en tegen de wanden en kunnen nooit overlappen. Past
  iets nergens (een extra kast in een volle ruimte, een te kleine ruimte,
  een draai), dan gebeurt er niets en zegt een melding onder in het
  3D-beeld even waarom.
  **Draaien (R)** draait de geselecteerde kast een kwartslag; sleep je hem
  naar een andere wand, dan draait hij vanzelf met zijn rug naar die wand.
  Tussen kasten in een rij verschijnt een maatlijn.
- **Maten en opties**: klik een kast aan; in de zijbalk pas je breedte,
  hoogte, diepte, legplanken, deuren en materiaal aan. **Dupliceren** zet
  een kopie ernaast, **Verwijderen** haalt de kast weg.
- **Lades**: bij een ladekast kies je onder **Ondiepe lades bovenaan** hoeveel
  lage lades (bijvoorbeeld voor bestek) bovenaan komen en hoe hoog hun front
  is; de diepe lades eronder delen de rest. De onderkast met lade heeft één
  lade boven de deuren, met een instelbare fronthoogte. In een maatwerkstuk
  zet **+ Lade** een complete lade op de voorkant — front, ladebak,
  geleiders en greep — die je als één geheel verschuift, dupliceert of
  verwijdert.
- **Ruimte**: onder **Ruimte** in de zijbalk stel je de binnenmaten van de
  ruimte in. **Alles in beeld** zet de camera terug.
- **Werkblad**: onder **Werkblad** zet je het werkblad aan of uit en kies je
  materiaal, dikte en overstek. Het werkblad volgt vanzelf de rijen
  onderkasten (ook met lade) en ladekasten; je hoeft het niet te tekenen.
- **Maatwerk**: **+ Kast toevoegen → Maatwerk…** maakt een leeg stuk. In de
  zijbalk geef je onder **Buitenmaten** de maten van het stuk op en voeg je
  paneel voor paneel toe (zijkant, bovenblad, bodem, achterwand, legplank,
  tussenschot, front), elk met eigen maten, materiaal en kantenband. Zodra
  je een paneel of lade aanklikt, staat **zijn** vak bovenaan de zijbalk —
  "Paneel 3", "Lade 2" — met zijn eigen Breedte / Hoogte / Diepte en
  positie; Buitenmaten klapt dan dicht (klik op de kop om het te openen).
  Zo verander je nooit per ongeluk de hele kast als je een lade smaller
  wilt. Linksonder in het 3D-beeld staat de maat van het gekozen element.
  De rode **✕** achter een paneel of lade in de lijst verwijdert het meteen
  (Ctrl+Z zet het terug). **Klaar** (of Esc) sluit de editor; dubbelklik
  later op het stuk om verder te werken.
- **Maatlijnen**: met een paneel of lade gekozen tekent het 3D-beeld blauwe
  maatlijnen met de tussenruimtes in mm — bij een tussenschot de breedte
  van elk vak van zijn rij, bij een legplank de hoogtes tussen de planken,
  bij een lade de ruimte tot de fronten erboven en eronder. De twee eigen
  tussenruimtes zijn dikker. Ze bewegen mee terwijl je sleept. **M** (of de
  knop **Maatlijnen** linksboven) zet ze uit en aan; de keuze wordt
  onthouden.
- **Gelijke vakken**: sleep je een tussenschot of legplank met de pijlen in
  het 3D-beeld, dan klikt het binnen 8 mm vast in het **midden** tussen zijn
  twee buren (de labels worden vet met een `=`), of op een tussenruimte die
  even groot is als een andere in dezelfde rij. Tussenschot voor
  tussenschot geeft dat gelijke vakken. Anders landt het op stappen van
  10 mm. Houd **Alt** (of Ctrl) ingedrukt tijdens het slepen om helemaal
  vrij te bewegen, op de millimeter.
- **Binnenpanelen passen in de kast**: legplanken en tussenschotten worden
  gemaakt tot aan de binnenkant van zijkanten, bodem, bovenblad en
  achterwand, en verschuiven alleen daarbinnen (een tussenschot kan niet
  in de achterwand schuiven). Verplaats of vergroot je een zijkant, de
  bodem, het bovenblad of de achterwand, dan volgen de binnenpanelen die
  ertegenaan stonden en wordt alles wat erin zou steken ingekort — alleen
  door het paneel dat je bewerkt: een legplank die je zelf korter hebt
  gemaakt, of een tussenschot dat je via de velden dóór de achterwand hebt
  getrokken, blijft staan zolang je een **ander** paneel bewerkt; pas als
  je die achterwand zelf verplaatst of dikker maakt, eist zij haar ruimte
  terug. **Pas binnenpanelen aan** (onder de paneelknoppen) kort in één
  keer alles in tot de huidige kast — handig voor stukken van vóór deze
  versie waar tussenschotten door de achterwand staken. De knop kort
  alleen in en maakt nooit iets langer; Ctrl+Z zet alles terug.
- **Prijs**: de prijsopbouw onderaan de zijbalk rekent alles live uit —
  plaatmateriaal, kantenband, beslag en werkbladen — met een regel per
  kast. Alle bedragen zijn exclusief btw.
- **Opslaan en openen**: menu **Bestand** (Ctrl+S opslaan, Ctrl+O openen).
  Een project is één `.mebo`-bestand. **Bestand → Recent geopend** onthoudt
  de laatste acht projecten. Dubbelklikken op een `.mebo`-bestand in de
  Verkenner opent het meteen in Mebo 3D. Sluit je het programma met
  niet-opgeslagen wijzigingen, dan vraagt het eerst of je wilt opslaan.

## Sneltoetsen

- **Ctrl+Z** maakt de laatste wijziging ongedaan, **Ctrl+Y** (of
  Ctrl+Shift+Z) doet hem opnieuw — ook via menu **Bewerken** of de twee
  pijltjes linksboven. Alles wat de tekening verandert kan terug: kasten
  toevoegen, verplaatsen, draaien, verwijderen, maten, ruimte, werkblad en
  elk paneel van een maatwerkstuk. Een sleep of een schuifregelaar telt als
  één stap. Zit je in een tekstveld, dan geldt Ctrl+Z voor dat veld.
- **Pijltjestoetsen** schuiven de geselecteerde kast 1 mm over de vloer,
  met **Shift** 10 mm. Bij een hangende kast regelen **PgUp/PgDn** de
  ophanghoogte, en de groene pijl in het 3D-beeld doet hetzelfde met de
  muis. Onder de kastmaten staan **X** en **Z** om een positie te typen.
  Let op: vlak bij een wand of een buurkast (tot 30 mm) klikt de kast weer
  vast — kasten in een keuken sluiten aan, ze zweven niet 5 mm ervoor.
- **In de maatwerk-editor** verplaats je het gekozen paneel met de rode,
  groene en blauwe pijlen in het 3D-beeld (stappen van 10 mm, en het klikt
  vast in het midden tussen zijn buren; **Alt** of Ctrl ingedrukt = vrij)
  of met de pijltjestoetsen (1 mm, Shift = 10 mm, PgUp/PgDn = hoogte). Een
  paneel kan de buitenmaten van het stuk nooit verlaten; een legplank of
  tussenschot blijft bovendien binnen de kast. Een lade verschuift alleen
  over de voorkant: links/rechts en PgUp/PgDn. **M** zet de maatlijnen uit
  en aan.
- **Esc** breekt een sleep af (de kast of het paneel springt terug) en
  sluit daarna de maatwerk-editor. **R** draait de geselecteerde kast.

## Prijzen aanpassen

Alle prijzen staan in één tekstbestand in je eigen gegevensmap:

    C:\Users\<jouw naam>\AppData\Roaming\mebo-3d\materials.json

Het snelst kom je erbij via menu **Prijzen → Prijslijst openen**: de
Verkenner opent met het bestand geselecteerd. (Of plak het pad in de
adresbalk van de Verkenner; `AppData` is een verborgen map.) Het bestand
wordt bij de eerste start aangemaakt uit de prijslijst van de installer.

- Open het bestand met Kladblok. Per materiaal staan er een naam (`name`),
  een categorie (`board` plaatmateriaal, `edgeband` kantenband, `hardware`
  beslag, `worktop` werkblad), een eenheid (`m2`, `m` of `piece`) en de
  prijs in euro excl. btw (`pricePerUnitEur`, met een **punt** als
  decimaalteken: `14.5`).
- Sla op en kies **Prijzen → Prijzen herladen**. De nieuwe prijzen gelden
  meteen, ook voor het open project en voor bestaande projecten: een
  project bewaart geen prijzen, alleen maten en materialen. (Opnieuw
  starten werkt ook.)
- Het bestand moet geldige JSON blijven. Bij een fout (een vergeten komma
  of aanhalingsteken) toont het programma "Prijsdatabase kon niet geladen
  worden" in plaats van de prijzen; het bestand wordt dan niet aangeraakt.
  Herstel de fout en herlaad.
- Verwijder je een materiaal dat een project nog gebruikt, dan opent het
  project gewoon en staat er "Onbekende materialen" onder de prijs.
- **Een nieuwe versie van het programma laat je prijslijst met rust.**
  Je aangepaste prijzen blijven staan, en een materiaal dat je verwijderd
  hebt komt niet terug. Brengt de nieuwe versie nieuwe materialen mee, dan
  worden die **onderaan toegevoegd** met de standaardprijs — controleer die
  na een update. Vlak voordat er iets toegevoegd wordt, maakt het programma
  een kopie van je lijst: `materials.backup.json` in dezelfde map.
- In dezelfde map staat ook `materials.offered.json`: daarin onthoudt het
  programma welke materialen het al eens aangeboden heeft, zodat een
  verwijderd materiaal verwijderd blijft. Laat dat bestand staan.

## Verwijderen

Instellingen → Apps → Geïnstalleerde apps → **Mebo 3D** → Verwijderen (of
`Uninstall Mebo 3D.exe` in de programmamap). Je projectbestanden, je
prijslijst en de lijst met recente projecten blijven staan.
