# Mebo 3D — handleiding

Mebo 3D is de interne configurator van Mebo: je zet kasten in een ruimte,
ziet ze in 3D en krijgt meteen de materiaalprijs. Deze handleiding is voor
wie het programma installeert en gebruikt.

## Installeren

1. Je krijgt een bestand `Mebo-3D-Setup-0.8.0.exe`. Dubbelklik erop.
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
projecten en je taalkeuze blijven bewaard; je eigen prijslijst niet — zie
"Prijzen aanpassen".

## Eerste stappen

- **Taal**: rechtsboven kies je NL / EN / RO. De keuze wordt onthouden.
- **Kast toevoegen**: knop **+ Kast toevoegen** linksboven; kies onderkast,
  bovenkast, kolomkast of ladekast. De kast verschijnt tegen de achterwand,
  naast de vorige.
- **Verplaatsen en draaien**: sleep een kast met de muis. Kasten klikken
  vanzelf tegen elkaar en tegen de wanden en kunnen nooit overlappen.
  **Draaien (R)** draait de geselecteerde kast een kwartslag; sleep je hem
  naar een andere wand, dan draait hij vanzelf met zijn rug naar die wand.
  Tussen kasten in een rij verschijnt een maatlijn.
- **Maten en opties**: klik een kast aan; in de zijbalk pas je breedte,
  hoogte, diepte, legplanken, deuren en materiaal aan. **Dupliceren** zet
  een kopie ernaast, **Verwijderen** haalt de kast weg.
- **Ruimte**: onder **Ruimte** in de zijbalk stel je de binnenmaten van de
  ruimte in. **Alles in beeld** zet de camera terug.
- **Werkblad**: onder **Werkblad** zet je het werkblad aan of uit en kies je
  materiaal, dikte en overstek. Het werkblad volgt vanzelf de rijen
  onderkasten en ladekasten; je hoeft het niet te tekenen.
- **Maatwerk**: **+ Kast toevoegen → Maatwerk…** maakt een leeg stuk. In de
  zijbalk geef je de buitenmaten op en voeg je paneel voor paneel toe
  (zijkant, bovenblad, bodem, achterwand, legplank, tussenschot, front),
  elk met eigen maten, materiaal en kantenband. **Klaar** (of Esc) sluit de
  editor; dubbelklik later op het stuk om verder te werken.
- **Prijs**: de prijsopbouw onderaan de zijbalk rekent alles live uit —
  plaatmateriaal, kantenband, beslag en werkbladen — met een regel per
  kast. Alle bedragen zijn exclusief btw.
- **Opslaan en openen**: menu **Bestand** (Ctrl+S opslaan, Ctrl+O openen).
  Een project is één `.mebo`-bestand. **Bestand → Recent geopend** onthoudt
  de laatste acht projecten. Dubbelklikken op een `.mebo`-bestand in de
  Verkenner opent het meteen in Mebo 3D. Sluit je het programma met
  niet-opgeslagen wijzigingen, dan vraagt het eerst of je wilt opslaan.

## Prijzen aanpassen

Alle prijzen staan in één tekstbestand naast het programma:

    C:\Users\<jouw naam>\AppData\Local\Programs\Mebo 3D\resources\data\materials.json

Plak dit pad in de adresbalk van de Verkenner (`AppData` is een verborgen
map).

- **Maak eerst een kopie** van het bestand voordat je iets wijzigt.
- Open het bestand met Kladblok. Per materiaal staan er een naam (`name`),
  een categorie (`board` plaatmateriaal, `edgeband` kantenband, `hardware`
  beslag, `worktop` werkblad), een eenheid (`m2`, `m` of `piece`) en de
  prijs in euro excl. btw (`pricePerUnitEur`, met een **punt** als
  decimaalteken: `14.5`).
- Sla op en start Mebo 3D opnieuw. De nieuwe prijzen gelden meteen, ook
  voor bestaande projecten: een project bewaart geen prijzen, alleen maten
  en materialen.
- Het bestand moet geldige JSON blijven. Bij een fout (een vergeten komma
  of aanhalingsteken) toont het programma bij het opstarten
  "Prijsdatabase kon niet geladen worden" in plaats van de prijzen. Zet dan
  je kopie terug en probeer opnieuw.
- Verwijder je een materiaal dat een project nog gebruikt, dan opent het
  project gewoon en staat er "Onbekende materialen" onder de prijs.
- **Bij een nieuwe versie van het programma wordt dit bestand
  overschreven** door de prijslijst uit de installer. Bewaar je eigen
  prijslijst dus ook ergens anders en zet hem na een update terug.

## Verwijderen

Instellingen → Apps → Geïnstalleerde apps → **Mebo 3D** → Verwijderen (of
`Uninstall Mebo 3D.exe` in de programmamap). Je projectbestanden en de lijst
met recente projecten blijven staan.
