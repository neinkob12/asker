# Auftrag 31: Die Karte lebt: Verkehr, Leute an Spots, Flüsse und Straßen aus echten Daten, Performance-Budget

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). **Erst starten, wenn Auftrag 30
(`docs/auftraege/30-staedte-hamburg.md`) in `main` ist**, denn hier werden das Hamburger Straßennetz, die Autobahn, die
Städte und die Deutschland-Ansicht aus 30 benutzt. Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/31-karte-lebt.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, src/map/README.md, src/ui/README.md,
docs/perf/2026-10-messung.md und docs/auftraege/README.md.
```

Dieser Auftrag ist **Karte und Optik mit hartem Performance-Budget**. Spiellogik kommt hier nur vor, wo die Karte sie
braucht (z.B. Lesefunktionen für wartende Kunden pro Spot).

## Wunsch aus dem Probespielen (02.10.2026)

> Die Animationen sollen verbessert werden: Die Straßen sollen überall richtig geladen werden und auch die Flussrouten
> richtig geladen werden. Generell soll mehr auf der Karte passieren. Das Spiel war eben schon sehr laggy, also bitte auch
> gucken, dass das Ganze sehr effizient läuft, besonders wenn viele Aufträge gekommen sind, hat es eher gelaggt.

## Entscheidungen (aus der Fragerunde, vorab getroffen)

| Thema | Entscheidung |
| --- | --- |
| Mehr Leben | **Verkehr auf den Straßen** (Autos, Lkw, Streifenwagen, reine Optik) und **Leute an Spots** (Läufer, Kunden, Streifen als kleine Figuren). Nicht gewählt: Gang-Fahrzeuge, Frachter und Fähren als Kulisse. |
| Flüsse | **Rhein und Elbe aus Overture-Wasserdaten statt handgezeichnet.** Das Schiff aus Rotterdam fährt den echten Rhein hinauf, Container nach Hamburg kommen die echte Elbe herein. |
| Straßen | Pro Stadt ein Netz (aus Auftrag 30), **Fahrzeuge fahren überall wirklich auf der Straße**, keine Luftlinien-Stücke mehr. |
| Performance | **Budget statt Gefühl:** feste Grenzen (unten), gemessen vor und nach jeder Etappe. Optik darf die Simulation nie bremsen oder beeinflussen. |
| Umsetzung | Zweiter von zwei großen Aufträgen, nach Auftrag 30. |

## Rahmen

- **Ganzer Code freigegeben**, Schwerpunkt `src/map/`, die `ui/`-Ordner der Module, `src/modules/roads/` (Daten und
  Werkzeuge), `scripts/`. Ordnerregeln aus `CLAUDE.md` gelten; Karten-Code in Modulen nur im `ui/`-Ordner.
- **Optik bleibt aus der Simulation draußen:** Verkehr und Figuren lesen den Zustand nur (`getState()` im Layer) und
  nutzen einen **eigenen** Zufallsgenerator (z.B. mulberry32 mit Seed aus Spiel-Seed und Spieltag), nie `ctx.random()`.
  Gleicher Seed = gleiches Bild, aber kein Einfluss auf den Spielstand.
- **Performance-Budget** (Desktop = Chromium im Screenshot-Skript, Handy = iPhone-Viewport mit 4× CPU-Drossel über CDP
  `Emulation.setCPUThrottlingRate`):
  - Desktop 60 Bilder/s, Handy 30 Bilder/s im Normalbetrieb mit vollem Verkehr, Figuren und einer laufenden Lieferung.
  - Keine Long Task über 50 ms im Normalbetrieb bei Tempo 4× mit zehn offenen Aufträgen.
  - Verkehr und Figuren zusammen höchstens 2 ms pro Bild auf dem Desktop, 4 ms auf dem Handy.
  - Jede Quelle (`GeoJSONSource.setData`) höchstens 20-mal pro Sekunde und nur, wenn sich etwas geändert hat.
  - Alles pausiert bei `document.hidden`, und `prefers-reduced-motion` schaltet Verkehr und Figuren-Bewegung ab.
  Gemessen mit den Skripten aus [`docs/perf/2026-10-messung.md`](../perf/2026-10-messung.md) (`scripts/perf-*.mjs`), Zahlen
  vor und nach jeder Etappe im PR.
- **Design:** Look Glas über der Karte (`src/ui/README.md`, Abschnitt „Über der Karte“), Farben nur über `mapToken()`
  und die Bedeutungsfarben, gedämpfte Karte (Konzept: „Nachtschicht“). Mehr Leben heißt nicht bunter: Verkehr in
  Grautönen mit Scheinwerfern bei Nacht, Figuren klein und ruhig.
- **Lizenzen:** Alles aus Overture Maps (abgeleitet von OpenStreetMap) steht unter ODbL. Kopf jeder erzeugten Datei mit
  Quelle, Release und Lizenz wie in `network.ts`. Quellenangabe „© OpenStreetMap-Mitwirkende, Overture Maps Foundation“
  jetzt auch im Spiel zeigen (Karten-Attribution unten rechts und Einstellungen › Über), das löst den offenen Punkt im
  Konzept.
- **Keine neuen npm-Pakete.** Python mit pyarrow und shapely für die Werkzeuge ist erlaubt.
- **Etappen** in der Reihenfolge unten. Nach jeder Etappe `npm run check`, Commit, Push; nach Etappe 1 Draft-PR. Vor dem
  letzten Push `npm run build`, `npm run e2e`, `npm run screenshot -- --scenes=alle`, `npm run screenshot:phone`,
  `npm run audit:phone`, `npm run monkey:phone`.
- **Doku zum Schluss:** `src/map/README.md` (Verkehr, Figuren, Wasserwege, Budget), `docs/architektur.md` (Karte), `CLAUDE.md`
  (ein Absatz zu Auftrag 31), `docs/konzept.md` („Auf der Karte sichtbar“: Figuren an Spots statt „keine Figuren“, Flüsse
  aus Daten, Verkehr; offenen Punkt Quellenangabe schließen), `docs/auftraege/README.md` (Stand).

## Ausgangslage (Stand `main` nach Auftrag 30; selbst nachprüfen)

- **Fahrzeuge:** `src/map/vehicles.ts`, 3D-Klötze mit Kabine (fill-extrusion), alle Fahrzeuge einer Karte in **einer**
  GeoJSON-Quelle, Grundriss bei jeder Bewegung neu gerechnet, Scheinwerfer nachts, Größe wächst beim Herauszoomen.
  Position von außen (`setProgress`) mit weichem Nachziehen. Benutzt von `logistics/ui/map.ts` (Fahrten, Zoll mit
  Blaulicht), `customers/ui/map.ts` (Rechte Hand fährt aus), `suppliers/ui/map.ts` (Kuriere über `roadEntryFrom`, Schiff
  auf `RHINE_ROUTE` in `suppliers/config.ts`, von Hand gesetzte Stützpunkte „außerhalb Kölns grob“).
- **Karten-Layer:** `registerMapLayer` in `src/map/registry.ts`, `update(state, ui)` etwa 10-mal pro Sekunde für jeden
  Layer, egal ob sich etwas geändert hat. HTML-Marker (`addHtmlMarker`) für Spots, Lager, Hafen, Spot-Schilder.
  Hotspots (`hotspots.ts`), Niederschlag (`precipitation.ts`), Tageslicht (`daylight.ts`), Wahrzeichen Köln
  (`landmarks.ts`, acht Klötze: Dom, Hohenzollernbrücke, Colonius, KölnTriangle, Kranhäuser …).
- **Grundkarte:** OpenFreeMap-Vektorkacheln (`style.ts`), Wasser als Fläche (`kt-water`) und Linie (`kt-waterway`),
  weltweit, also auch Hamburg und der Weg dazwischen ohne weitere Daten.
- **Straßen:** `roads` mit `network.ts` (Köln), `network-hamburg.ts`, `autobahn.ts` (A1), `roadRoute`, `interCityRoute`,
  `roadEntryFrom`, `nearestRoadPoint`; Werkzeug `tools/build-roads.py` (Overture `transportation/segment`, HTTP-Range
  aus dem öffentlichen S3-Bucket). Start und Ziel werden auf die nächste Straße eingerastet; das letzte Stück ist eine
  gerade Linie. Spots außerhalb der Box oder fern jeder Straße der geladenen Klassen fahren sichtbar neben der Straße.
- **Städte:** Modul `city` mit `CITIES` (Kamera, Box, Hafen), `GameMap.view` (`city:<id>`, `deutschland`, `europa`),
  Deutschland-Ansicht mit Glas-Karten pro Stadt und Fahrten dazwischen (einfach gehalten, soll hier schön werden).
- **Performance:** Messung und Hotspots in `docs/perf/2026-10-messung.md`; die Simulation hat Auftrag 30 in Etappe 0
  entlastet, der Karten-Anteil ist noch offen (dort als „Karte“ markiert).

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge.

### 0. Messen und Karten-Bremsen lösen

- Vorher messen (`scripts/perf-browser.mjs`, Desktop und Handy-Viewport mit Drossel), Zahlen in den PR.
- Die im Bericht als „Karte“ markierten Hotspots beheben: `update()` der Layer nur bei geändertem Zustand (Zähler oder
  Referenzvergleich pro Layer statt jedes Mal neu bauen), `setData` nur bei Änderung, Marker-DOM nur anfassen, wenn sich
  Text oder Position ändern, Fahrzeug-Geometrie höchstens 20-mal pro Sekunde, Pause bei `document.hidden`.
- Eine kleine Mess-Hilfe in `src/map` (nur im Dev-Build): Zeit pro Layer-`update` und pro Bild als Overlay
  (`?perf=1`), damit man die Budgets im Spiel sieht.

### 1. Straßen überall richtig

- **Prüfskript** `scripts/check-roads.mjs` (in `npm run lint` einhängen): Für jede Stadt liegen alle Spots, Lager, der
  Hafen, die Autobahn-Einfahrten (`roadEntryFrom` für jede Lieferanten-Stadt) höchstens 60 m von einer Straße des Netzes,
  und `roadRoute` zwischen allen Lagern und Spots hat kein gerades Stück über 80 m. Fehler nennen Ort und Abstand.
- **Daten reparieren:** Box und Klassen in `build-roads.py` so, dass das Skript grün ist (fehlen Straßen, die Klasse
  nachziehen oder die Box erweitern; die Datei darf pro Stadt auf etwa 250 KB wachsen, nicht mehr). Netze neu erzeugen,
  Release in den Dateiköpfen aktualisieren.
- **Anfahrt und letzte Meter:** Das letzte Stück von der Straße zum Spot als sichtbarer Fußweg (gepunktete Linie, das
  Fahrzeug hält an der Straße), keine Fahrzeuge quer über Häuser. Beim Abbiegen dreht das Fahrzeug weich
  (Richtung aus den nächsten Punkten mitteln). Einbahnstraßen bleiben.
- **Autobahn:** Fahrten zwischen den Städten fahren in der Stadtansicht bis zur Einfahrt, in der Deutschland-Ansicht
  die ganze A1; die Lieferanten-Kuriere aus Frankfurt (A3), Amsterdam (A57), Berlin (A2/A1) und Hamburg (A1) kommen über
  die passende Einfahrt ihrer Richtung.

### 2. Flüsse aus echten Daten

- **Werkzeug `tools/build-water.py`** (neben `build-roads.py`, gleiche Lade-Technik): Overture Thema `base`, Typ `water`,
  Linien mit `subtype` `river` oder `canal`. Zwei Wasserwege:
  - **Rotterdam → Köln:** Nieuwe Maas, Noord, Beneden Merwede, Waal, Rhein (Hauptfahrwasser der Binnenschifffahrt) bis
    zum Niehler Hafen.
  - **Nordsee → Hamburg:** Elbe ab Cuxhaven bis zum Liegeplatz im Hamburger Hafen (Norderelbe oder Köhlbrand, je nach
    Lage des `PORT_ID` aus `CITIES`).
  Linien an ihren Enden zusammensetzen (Graph, kürzester Weg zwischen Start und Ziel), vereinfachen (Douglas-Peucker 30 m
  außerhalb, 8 m innerhalb der Stadt-Box), als Polyline-Zahlenfolge in `src/modules/roads/waterways.ts` schreiben.
  Fehlen Linien in den Daten, Lücken nur dort von Hand überbrücken und das im Dateikopf vermerken.
- **API in `roads`:** `shipRoute(cityId)` liefert den Weg als `LngLat[]` von außen bis zum Kai, `shipMinutes` aus der
  Länge mit `SHIP_SPEED` (Config). `RHINE_ROUTE`, `RHINE_APPROACH_FROM` und `RHINE_APPROACH_SHARE` in `suppliers/config.ts`
  fallen weg; `suppliers/ui/map.ts` und `logistics/ui/map.ts` nehmen `shipRoute`. Die Lieferzeit der Hafen-Lieferanten
  bleibt der Wert aus `suppliers/config.ts` (Balancing), die Animation verteilt die Zeit auf die echte Strecke wie heute
  (`shipFraction`).
- In der Deutschland-Ansicht ist das Schiff auf dem Fluss zu sehen, in der Stadtansicht legt es am richtigen Kai an. Test:
  Rhein-Weg 250 bis 320 km, Elbe-Weg 100 bis 140 km; jeder Punkt des Wegs liegt in einer Wasserfläche der Kacheln (kann
  man nicht testen) bzw. höchstens 300 m von der Overture-Linie (kann man testen, im Werkzeug).

### 3. Verkehr auf den Straßen

- **Layer `roads.traffic`** in `src/modules/roads/ui/` (der `ui/`-Ordner darf `src/map` importieren). Fahrzeuge der
  Kulisse: Anzahl nach Gerät (Desktop 40, Handy 14, Einstellung „Verkehr: aus, wenig, normal“ in Einstellungen › Karte),
  erscheinen an zufälligen Knoten im sichtbaren Ausschnitt plus Rand der **aktiven** Stadt, fahren als Zufallsweg über die
  Kanten (geradeaus bevorzugt, Einbahn beachtet, nach 3 km oder außerhalb des Ausschnitts verschwinden sie), Tempo nach
  Straßenart (`ROAD_SPEEDS` × 0,8 bis 1,1), Arten 70 % Auto, 15 % Transporter, 10 % Lkw, 5 % Streifenwagen; Streifenwagen
  häufiger, je höher die Heat der sichtbaren Veedel. Dichte nach Uhrzeit (7 bis 9 und 16 bis 19 Uhr × 1,5, 23 bis 5 Uhr
  × 0,3) und nach Spieltempo (bei Tempo 0 steht alles).
- **Rendern:** `vehicles.ts` bekommt eine Flotten-API (`createFleet`: viele Fahrzeuge in **einer** Quelle und einem Layer,
  Geometrie gebündelt höchstens 20-mal pro Sekunde, dazwischen interpoliert), Scheinwerfer nachts nur für die zwölf
  nächsten Fahrzeuge, unter Zoom 12,5 unsichtbar, keine Marker, keine Klick-Ziele. Spiel-Fahrzeuge (Fahrten, Rechte Hand,
  Kuriere) bleiben eigene Fahrzeuge mit Etikett wie heute.
- Zufall nur aus dem eigenen Generator (oben). Budget: höchstens 1,5 ms pro Bild auf dem Desktop bei 40 Fahrzeugen.

### 4. Leute an Spots

- **Layer `spots.people`** in `spots/ui/` (oder `customers/ui/`, wo die Lesefunktionen sind): kleine Figuren an jedem
  besetzten Spot der aktiven Stadt: Läufer und Sicherheit aus `staff` (Rolle in der Farbe `people`), wartende Kunden aus
  `customers.allWaiting` (höchstens vier, Farbe `goods`, verschwinden beim Kauf mit dem bestehenden Geld-Popup), eine
  Streife (Farbe `law`) in Veedeln mit Heat über `CHECK_THRESHOLD`, die zwischen den Spots des Veedels geht.
- **Rendern:** Symbol-Layer mit SDF-Sprite (eine kleine Figur, über `mapToken()` eingefärbt), keine HTML-Marker. Figuren
  stehen leicht versetzt um den Spot, ruhiges Pendeln (Position höchstens 10-mal pro Sekunde, nur im Ausschnitt), unter
  Zoom 14 unsichtbar, höchstens 60 Figuren. Antippen einer Figur öffnet das Spot-Blatt (wie der Spot-Marker).
- Das löst auch die Übersicht: Auf dem Handy dürfen Figuren die Spot-Schilder nicht verdecken (`npm run audit:phone`).

### 5. Deutschland-Ansicht und Hamburg-Optik

- **Wahrzeichen Hamburg** in `landmarks.ts` pro Stadt: Elbphilharmonie, Michel, Fernsehturm, Köhlbrandbrücke,
  Landungsbrücken, Elbbrücken als schlichte Klötze wie in Köln; Kamera für Hamburg (Pitch und Bearing aus `CITIES`,
  Elbe im Bild).
- **Deutschland-Ansicht:** beide Städte als Glas-Karten (Name, Veedel x/12, Ergebnis heute, Fahrten unterwegs), A1 als
  feine Linie in Gold nur, während eine Fahrt läuft, Fahrzeuge darauf in Zoom-Größe, dein eigenes Auto bei `city.travel`,
  das Schiff auf dem Fluss. Antippen einer Stadt-Karte wechselt die Stadt (`city.switch`). Beim Herauszoomen aus einer
  Stadt wechselt die Ansicht ab einer Zoom-Schwelle automatisch in „Deutschland“ und zurück.
- **Quellenangabe** im Spiel (Rahmen oben).

### 6. Abnahme

- `npm run check` (mit `check-roads`), `npm run build`, `npm run e2e`, `npm run screenshot -- --scenes=alle` (neue Szenen:
  Verkehr bei Tag und bei Nacht, Leute an Spots, Schiff auf dem echten Rhein, Deutschland-Ansicht mit laufender Fahrt,
  Hamburg bei Nacht), `npm run screenshot:phone`, `npm run audit:phone`, `npm run monkey:phone`.
- Budget eingehalten: Messwerte Desktop und Handy (Drossel) vor und nach jeder Etappe im PR, dazu ein Lauf mit
  `prefers-reduced-motion` (keine Kulisse) und einer mit Verkehr „aus“.
- Determinismus der Simulation unverändert: der bestehende Determinismus-Test und `npm run balance` liefern dieselben
  Zahlen wie vor dem Auftrag (Optik hat keinen Einfluss).

## Nicht in diesem Auftrag

- Gang-Fahrzeuge bei Vorstößen und Überfällen, Polizei fährt zur Razzia vor.
- Frachter und Fähren als Kulisse auf Rhein und Elbe.
- Neue Wetter- oder Lichteffekte, Jahreszeiten.
- Spiellogik (Städte, Routen, Vollmacht): Auftrag 30.

## PR-Beschreibung

„Was ist neu“ (nach Etappen, mit Screenshots aus `screenshots/glas/`), „Wie testen“ (Befehle, `?perf=1`, Einstellungen
› Karte), „Für die Integration“ (was offen bleibt), dazu die Messwerte vor und nach jeder Etappe als Tabelle.
