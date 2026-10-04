# Karte (`src/map/`)

Die Grundkarte im **gedämpften Look** ("Nachtschicht", passend zur dunklen Oberfläche): Grau- und Schieferflächen,
runde Straßen, wenig Details, 3D-Gebäude in Grautönen mit Schatten, Wahrzeichen als schlichte Klötze, vier
Tageszeiten. Farbe tragen nur Spielinhalte (Reviere, Spots, Gangs, Hotspots). Alle Daten kommen aus
den OpenFreeMap-Vektorkacheln (OpenMapTiles-Schema, ohne Key). Module importieren alles nur aus
`src/map/index.ts` und nur aus ihrem `ui/`-Ordner.

## Look „Glas“ (Auftrag 24)

Über der Karte liegt alles als dunkles Glas (Tokens in `src/ui/README.md`, Abschnitt "Über der Karte: Look Glas").
Für die Karte selbst heißt das:

- **Nacht dunkler, Leuchten ruhiger:** Land `#121519`, Häuser `#1b1f25 / #21262d / #282d35 / #30363f`, Leuchten der
  Hauptstraßen `glow` 0,6 (vorher 0,7). Tag, Morgen und Abend bleiben.
- **Vignette** über der freien Kartenfläche (`--map-vignette`, `.shell-vignette` in der Shell), nicht unter dem Handy.
- **Kamera neben dem Handy:** `GameMap` setzt rechts ein Padding in Handybreite (am Desktop, solange das Handy offen
  ist) und gleitet beim Ein- und Ausklappen mit; `flyTo`, `flyToKoeln` und der Start zentrieren so auf die freie
  Fläche. Der Blick auf Köln geht auf `KOELN_VIEW` (etwas westlich der Mitte, dort liegen die meisten Spots).
- **Marker:** Spots als Bodenring mit Geduld-Countdown, Zahlen-Blase an einem Stiel und Glas-Plakette (`spots/ui`), Orte (Lager, Hafen,
  Lieferanten) als runde Kachel mit Verlauf und Glas-Pille (`.map-place`, Verlauf über `--map-place-a/-b` im Modul),
  Gang-Hauptquartiere als Kachel in Gang-Farbe mit Schein. Fahrzeug-Etiketten und Namen beim Überfahren sind Glas.
- **Geld-Popup** (`mapEffects.money`) ist eine grüne Pille mit dunkler Schrift (Verlust rot), steigt 40 px.
- **Hotspots** bleiben, aber leiser (die Spots skalieren ihre Stärke mit 0,45): Den Zustand eines Spots zeigt jetzt der
  Ring; die Blobs zeigen nur noch Nachfrage und Verkäufe, die man am Marker nicht sieht.
  **Spot-Ring:** Farbe = Zustand (ruhig, Kunden warten, dringend, Razzia), Bogen = Geduld des ungeduldigsten Kunden
  (`patienceFill` in `spots/ui/ringModel.ts`, in 5-%-Schritten als `--fill`, bei Razzia und ohne Wartende voll).
- **Strecken** laufender Fahrten gestrichelt: Schiff in der Farbe der Ware, Lkw und Transporter gold
  (`suppliers.routes`, `logistics.routes`); die letzten Meter zu Fuß gepunktet (`addFootpath`).
- **Ereignisse auf der Karte:** Nach einer Razzia wird das Veedel rot getönt (`police.raidArea`), nach einer Übernahme
  leuchtet es gold auf (`territory.takeover`, Übergang über `fill-opacity-transition`).

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `GameMap.ts` | MapLibre-Karte, Kamera 3D/2D, Köln/Europa, Tageszeit und Stimmung anwenden, Layer der Module mounten |
| `style.ts` | Grundstil: Land, Parks/Wald/Friedhöfe, Wasser mit Uferlinie, Gleise, Straßen (Kontur + Füllung je Klasse), Brücken, Häuserschatten, 3D-Gebäude in vier Höhenbändern, Wahrzeichen |
| `look.ts` | vier Tageszeit-Paletten (`PALETTES`), weiche Übergänge (`paletteBlend`), Stimmung darüber (`computeLook`), Farbhilfen `mixColor`, `pastel` (getestet) |
| `landmarks.ts` | Wahrzeichen als gestapelte Klötze mit echten Koordinaten (`LANDMARKS`, `landmarkFeatures`) (getestet) |
| `vehicles.ts` | 3D-Mini-Fahrzeuge und Schiffe (`createVehicle`, `animateVehicle`) |
| `fleet.ts` | viele Kulissen-Fahrzeuge in einer WebGL-Ebene (`createFleet`, Verkehr, Auftrag 31) |
| `figure.ts` | kleine Figur als SDF-Sprite für Symbol-Ebenen (`ensureFigureImage`, Leute an Spots) |
| `footpaths.ts` | gepunktete Fußwege der letzten Meter (`addFootpath`) |
| `animation.ts` | gemeinsamer Takt der Animationen (`onMapFrame`) und Bewegungs-Zustand (`motion`: Tempo, Pause, Bewegung reduzieren) |
| `perf.ts` | Messhilfe `?perf=1` (nur Dev-Build): Bild-Arbeit, Layer-Zeiten, `setData` pro Quelle, Overlay |
| `hotspots.ts` | pulsierende Farb-Blobs (`createHotspots`) |
| `daylight.ts` | Tag-Nacht-Kurve nach der Spieluhr: `daylight`, `twilight`, `dayPhase` (getestet) |
| `atmosphere.ts` | Stimmung der Module (`setMapMood`) und Niederschlag (`setPrecipitation`) |
| `overlay.ts` | Überwachungs-Overlay (Scanlines, Rahmen, Koordinaten), standardmäßig aus |
| `precipitation.ts` | Regen und Schnee als Canvas über der Karte |
| `effects.ts` | Effekt-Werkzeuge (Geld-Popup, Blaulicht, Ping, Blitz) und `mapEffects` |
| `markers.ts` | `addHtmlMarker`, `addTargetMarker`, `el` |
| `geometry.ts` | `pointAlong`, `pathLength`, `bearing`, `offsetAround`, `offsetMeters`, `metersPerPixel`, `formatDms`, `measurePath`, `pointAtDistance`, `smoothBearing` (getestet) |

Ebenen der Grundkarte stehen in `BASE_LAYERS`. Eigene Ebenen mit Modul-Präfix anlegen und einsortieren:

- Flächen **nur auf dem Land** (unter Grün, Wasser und Straßen, z.B. die Veedel-Einfärbung):
  `map.addLayer(layer, ABOVE_LAND)`, damit Rhein und Parks klar bleiben
- Flächen **unter den Straßen**: `map.addLayer(layer, BELOW_ROADS)`
- Flächen und Linien **unter den 3D-Gebäuden** und ihren Schatten: `map.addLayer(layer, BELOW_BUILDINGS)`
- ohne `beforeId` liegt die Ebene ganz oben (über Gebäuden und Wahrzeichen, z.B. Hotspots)

Keine POIs, keine Straßennamen, keine Hausnummern: Die Grundkarte hat keine Symbol-Ebenen. Nebenstraßen erscheinen
erst ab Zoom 12, Häuser ab Zoom 13 (sie wachsen beim Hineinzoomen aus dem Boden).

**Farben ändern:** Jede Farbe hat ihre eigene Ebene mit festem Wert, damit `GameMap` sie pro Tageszeit mit
`setPaintProperty` umstellen kann, ohne die Kacheln neu aufzubauen (datengetriebene Farben würden das tun). Deshalb
gibt es drei Straßengruppen (Nebenstraßen, Hauptstraßen, Autobahnen und Brücken) und vier
Gebäudebänder (`BUILDING_BANDS`: unter 9 m, 9–16 m, 16–28 m, darüber). Neue Farbe = Wert in allen vier Paletten in
`look.ts` und eine Zeile in `GameMap.applyLook`.

## Tageszeiten

- Vier Paletten nach der Spieluhr (`dayPhase`): **Morgen** (5:15–7:30), **Tag**, **Abend** (19:30–21:45),
  **Nacht**. In der Dämmerung wird erst übergeblendet, dann steht die Morgen- bzw. Abendpalette eine Weile, dann
  wieder übergeblendet (`paletteBlend`). Sprünge gibt es nicht (getestet).
- Tag: Schiefergrau (Land, Häuser in vier Grautönen, Wasser gedämpftes Blau, Parks gedämpftes Grün).
  Nacht: fast schwarz, Wasser und Parks bleiben erkennbar, Hauptstraßen und Autobahnen glühen bernsteinfarben
  (`glow`, eigene Ebene mit Blur). Himmel und Nebel (`setSky`) und das Licht auf den Gebäuden ziehen mit.
- `MapLook.night` (0 Tag … 1 Nacht) bekommen auch die Effekte: Hotspots leuchten nachts stärker, Fahrzeuge werfen
  Scheinwerferlicht.
- Kamera: 3D schräg (50°, Standard) oder 2D-Draufsicht, pro Gerät gemerkt (`ui.setCameraMode`, `ui.toggleCamera`,
  `UiState.camera`). In 2D ist Drehen und Kippen aus. `ui.flyToKoeln()` hält den Modus, `ui.flyToEuropa()` zeigt
  die Europa-Ansicht (Lieferungen) immer flach.
- Überwachungs-Overlay: `ui.setOverlay(on)`, `UiState.overlay`, pro Gerät gemerkt, **standardmäßig aus**.
- Die Layer der Module werden schon nach dem Laden des Stils gemountet (`style.load`), nicht erst nach den Kacheln:
  Sind die Kacheln nicht erreichbar, bleiben Spots, Lager und Fahrzeuge trotzdem bedienbar.

## Wahrzeichen

Statt dauerhafter Veedel-Namen helfen Wahrzeichen bei der Orientierung (`landmarks.ts`): Kölner Dom (zwei Türme
157 m, Schiff, Querhaus, abgesetzte goldene Spitzen, Dachreiter), Hohenzollernbrücke (Deck, Pfeiler, drei
Bogenfelder), Colonius (266 m, Korb), die drei Kranhäuser im Rheinauhafen und das KölnTriangle in Deutz. Echte
Koordinaten, ungefähre Maße, Toon-Farben, kräftiger als die Häuser; nachts dunkler mit leuchtenden Spitzen.
Name beim Überfahren mit der Maus. Die echten OSM-Gebäude an diesen Stellen blendet die Grundkarte aus
(`LANDMARK_ZONES`, Filter mit `distance`, nur für Häuser ab 16 m, weil die Prüfung beim Laden Zeit kostet).
Ein neues Wahrzeichen: Funktion in `landmarks.ts` mit Teilen `part(ring, unterkante, oberkante, farbe)` im lokalen
Rahmen (Meter, `forward` entlang `heading`), Farben `[Tag, Nacht]`, dazu eine `zone`.

## Stimmung und Niederschlag

```ts
import { setMapMood, setPrecipitation } from '../../../map';

// in update() eines Karten-Layers
setMapMood('police', { tint: '#7f9cc4', tintStrength: 0.2, darken: 0.1 });   // null entfernt die Stimmung
setPrecipitation({ kind: 'rain', intensity: 0.8, wind: 0.3 });                // 'rain' | 'snow' | 'none'
```

`MapMood`: `darken`, `brighten`, `desaturate`, `tint` + `tintStrength`, `haze`, `wet` (alle 0–1). Mehrere
Beiträge werden addiert und legen sich über die Palette. Dezente, kühle Farbstiche nehmen (kräftige Töne
machen die gedämpfte Karte bunt). Das Wetter-Modul nutzt beides (`src/modules/weather/ui/index.tsx`).

## 3D-Mini-Fahrzeuge

```ts
import { createVehicle } from '../../../map';

// Gesteuert von der Simulation (z.B. Lieferfortschritt 0–1):
const van = createVehicle(ctx.map, { path: [lager, kunde], kind: 'van', label: '500 g', progress: 0.2 });
van.setProgress(orderProgress(state, order));   // in update(), wird weich nachgezogen
van.setColor(verspätet ? '#ffb547' : null);      // null = Flottenfarbe
van.setVisible(false);
van.remove();

// Reine Deko-Fahrt in echter Zeit:
mapEffects.animateVehicle({ path: route, kind: 'police', durationMs: 20000, loop: true });
```

`kind`: `'van' | 'truck' | 'courier' | 'car' | 'police' | 'ship'`. Jedes Fahrzeug ist ein kleiner Klotz mit Kabine
(fill-extrusion), einheitlich in der Flottenfarbe (`VEHICLE_COLORS`), dreht sich in Fahrtrichtung (über eine
Fahrzeuglänge gemittelt, `smoothBearing`: an Ecken biegt es weich ab), hat einen weichen Schatten und nachts
Scheinwerferlicht. Damit man es auf jeder Zoomstufe sieht, hat es eine feste Größe in Pixeln (nie kleiner als in echt).
`progress` beim Anlegen setzt die Startposition, sonst fährt es vom Anfang der Strecke los. `title` zeigt einen Namen
beim Überfahren, `onClick` macht es klickbar. Alle Fahrzeuge einer Karte teilen sich eine GeoJSON-Quelle; neue
Geometrie gibt es höchstens 20-mal pro Sekunde und nur, wenn sich eines um mindestens 0,35 Pixel bewegt hat. Die
Scheinwerfer-Quelle bleibt tagsüber leer. `path` kann eine Luftlinie oder eine echte Route (viele Punkte) sein; die
Längen werden einmal vorberechnet (`measurePath`). Fahrzeuge der Module fahren über echte Straßen: Den Weg liefert das
Modul `roads` im `ui/`-Ordner des Moduls, die Karte selbst kennt keine Module.

**Auf der Straße bleiben (Auftrag 31):** `roadRoute(from, to)` liefert neben `path` den Teil auf der Straße (`drive`)
und die Fußwege an den Enden (`walkFrom`, `walkTo`). Fahrzeuge fahren `drive` und halten an der Straße, die letzten
Meter zeigt `addFootpath(map, route.walkTo)` als gepunktete Linie (eine gemeinsame Quelle, ab Zoom 12,5). So fährt
nichts quer über Häuser. `scripts/check-roads.mjs` (in `npm run lint`) prüft, dass jeder Spot, jedes Lager, der Hafen und
jede Autobahn-Einfahrt höchstens 60 m von einer Straße liegt und Routen kein gerades Stück über 80 m neben der Straße
haben. Kuriere aus anderen Städten kommen über die Autobahn-Zufahrt ihrer Richtung (`roadApproach(far, via)`,
`Supplier.via`: Frankfurt A3, Amsterdam A57, Berlin und Hamburg A1).

**Hafenlieferungen:** Ware aus Rotterdam kommt als Schiff den echten Rhein hinauf (`shipRoute('koeln')` aus `roads`,
Overture-Wasserdaten: Nieuwe Maas, Noord, Merwede, Waal, Rhein, 306 km, in Köln langsamer) und legt am Liegeplatz am
Westkai des Niehler Hafens an; alte Lieferungen ohne Liegeplatz werden umgeladen und fahren als Lkw zum Lager. Die
Aufteilung der Lieferzeit (`SHIP_SHARE`, `UNLOADING_SHARE`) rechnet `deliveryLeg(supplier, progress)`; die Lieferzeit
in der Simulation bleibt der Wert aus `suppliers/config.ts`. `shipRoute('hamburg')` ist die Elbe ab Cuxhaven (104 km).

## Hotspots

```ts
import { createHotspots } from '../../../map';

const hotspots = createHotspots(ctx.map, 'spots.hotspots');          // eigene Quelle und Heatmap-Ebene
hotspots.setHotspots([{ position: spot, intensity: 0.8 }]);           // 0 = nichts, 1 = viel los, bis 1,5
hotspots.remove();
```

Weicher Farb-Blob (MapLibre-Heatmap), der langsam pulsiert (nur die Stärke, 6 Bilder pro Sekunde im gemeinsamen Takt;
bei Pause, verstecktem Tab und "Bewegung reduzieren" still; seit dem Look „Glas“ von den Spots deutlich leiser
gefüttert, den Zustand zeigt der Ring am Boden): Gelb über Orange und Pink bis Lila, nachts kräftiger. Die
Spots füttern ihn aus wartenden Kunden, Verkäufen (klingen 90 Spielminuten nach) und der aktuellen Nachfrage
(`spotDemand` aus `customers`).

## Verkehr als Kulisse (Auftrag 31)

```ts
import { createFleet } from '../../../map';

const fleet = createFleet(ctx.map, { id: 'roads.traffic', minZoom: 12.5, lights: 12 });
fleet.update([{ id: 1, lng, lat, heading: 90, kind: 'car', color: '#7d838c' }], performance.now() + 50);
fleet.setNight(0.8);   // macht GameMap über die Effekte
fleet.remove();
```

`createFleet` zeichnet viele Fahrzeuge in **einer** WebGL-Ebene (MapLibre `custom`, `renderingMode: '3d'`, Tiefe mit den
Gebäuden): ein Puffer mit einem Kasten pro Bauteil (Formen wie die Spiel-Fahrzeuge, `KINDS` aus `vehicles.ts`, etwas
kleiner), ein Zeichenaufruf. Neue Stellungen kommen gebündelt (`update`, höchstens 20-mal pro Sekunde), dazwischen
schiebt der Shader die Fahrzeuge weich weiter (nur eine Uniform pro Bild). Neue wachsen kurz auf, fehlende schrumpfen
weg. Nachts Scheinwerfer nur für die nächsten `lights` Fahrzeuge zur Kartenmitte, unter `minZoom` nichts. Keine
GeoJSON-Quelle, kein Worker, keine Marker, keine Klick-Ziele. Steht nichts mehr still, ruht auch die Karte.

Den Verkehr selbst macht das Modul `roads` (`roads/ui/traffic.ts` und Layer `roads.traffic`): Fahrzeuge erscheinen an
Knoten im Ausschnitt plus Rand, fahren als Zufallsweg über die Kanten (geradeaus bevorzugt, Einbahn beachtet), nach
3 km oder außerhalb des Ausschnitts sind sie weg. Tempo nach Straßenart (`ROAD_SPEEDS` × 0,8 bis 1,1), Arten 70 % Auto,
15 % Transporter, 10 % Lkw, 5 % Streifenwagen (mit der Heat der sichtbaren Veedel mehr), Anzahl Desktop 40, Handy 14
(Einstellungen › Karte: Verkehr aus, wenig, normal; Schalter im Menü Ebenen), Dichte nach Uhrzeit (7–9 und 16–19 Uhr
× 1,5, 23–5 Uhr × 0,3), Tempo nach Spieltempo (Wurzel, bei 0 steht alles). Zufall nur aus dem eigenen Generator
(`mulberry32` mit Spiel-Seed und Spieltag), nie aus der Simulation: Der Spielstand bleibt unberührt. Farben als Tokens
(`--map-traffic-*`, Grautöne), Streifenwagen mit Dach in `--cat-law`. Der Verkehr fährt im Netz der **aktiven Stadt**
(`roadGraph(cityId)`, ein eigener Zufallsweg pro Stadt); wechselt die Stadt, verschwindet die Kulisse der alten.

## Städte und Deutschland-Ansicht (Auftrag 30 und 31)

- **Kamera pro Stadt:** `CITIES` (`city/data.ts`) gibt `view` mit Blickpunkt, Zoom am Desktop und am Handy sowie
  `pitch` und `bearing` vor (Hamburg schaut nach Norden über die Elbe). Die Karte merkt sich die Neigung der Stadt,
  auch für den Wechsel aus der Draufsicht zurück in 3D.
- **Weit draußen (`FAR_ZOOM` = 9):** GameMap setzt die Klasse `is-far`; Marker mit `addHtmlMarker({ near: true })`
  (Lager, Häfen, Gang-Quartiere, Lieferziele, Veedel-Namen) sind dann aus, damit die Glas-Karten der Städte frei liegen.
  Neue Marker, die nur in der Stadt Sinn ergeben, bekommen `near: true`.
- **Wechsel beim Zoomen:** Zoomt man aus einer Stadt unter `FAR_ZOOM`, wird daraus die Deutschland-Ansicht (flach),
  zoomt man über einer freien Stadt wieder hinein, deren Stadtansicht (`city/ui/map.ts`, `ui.enterView(view)`, auf
  der Karte `settleView`: Ausschnitt bleibt, nur Neigung und Drehung gleiten).
- **Ausschnitt:** `flyToDeutschland` passt sich dem Rahmen um die freien Städte an (`deutschlandBounds`,
  `cameraForBounds`), am Handy mit Platz für die Karte unter Geld und Heat.
- **A1 in Gold:** Layer `city.autobahn` zeigt die Autobahn zwischen den freien Städten (`roads.autobahnBetween`) als
  feine goldene Linie, nur weit draußen und nur, solange eine Fahrt darauf läuft (du selbst, eine Route oder ein
  Kurier von Stadt zu Stadt). Kuriere zwischen Köln und Hamburg fahren `interCityRoute`, Schiffe den Fluss ihrer Stadt.

## Leute an Spots (Auftrag 31)

Layer `spots.people` (`spots/ui/people.ts`, Planung in `peopleModel.ts`): kleine Figuren im Ring der Spots.
Läufer und Sicherheit in `--cat-people`, bis zu vier wartende Kunden in `--cat-goods` (gehen beim Kauf, das Geld-Popup
kommt wie bisher), dazu eine Streife in `--cat-law`, die in Veedeln mit Heat über `CHECK_THRESHOLD` über die Straßen von
Spot zu Spot geht. Symbol-Ebene mit der SDF-Figur aus `figure.ts` (`ensureFigureImage`, Farbe über `icon-color`,
Rand über `icon-halo`), keine HTML-Marker. Versatz in Bildschirm-Einheiten (`icon-offset`), Personal links und Kunden
rechts unterhalb von Blase und Plakette, damit auch am Handy nichts verdeckt wird. Nur im Ausschnitt, unter Zoom 14
unsichtbar, höchstens 60 Figuren. Antippen öffnet das Spot-Blatt.

**Symbol-Ebenen sparsam füttern:** Jedes `setData` einer Symbol-Ebene lässt MapLibre die Symbole neu einsortieren und
die Deckkraft aller Beschriftungen der Karte neu rechnen; mit 10 Aufrufen pro Sekunde gab das am Handy mit Drossel
deutlich mehr Long Tasks. Darum stehen die Figuren fest in ihrer Quelle (neu nur, wenn jemand kommt oder geht), das
Pendeln läuft über `icon-translate` (Paint-Eigenschaft, ohne Übergang) in drei Gruppen mit eigener Phase, und nur die
Streife bekommt neue Stellungen (eigene Quelle, höchstens 10-mal pro Sekunde, erst nach einem Pixel Weg). Bewegte
Dinge in großer Zahl gehören in eine eigene WebGL-Ebene wie die Flotte.

## Gemeinsamer Takt und Bewegung

```ts
import { motion, onMapFrame, onMotionChange } from '../../../map';

const stop = onMapFrame((now, dt) => { … }, 'mein-layer');   // dt in echten Sekunden, höchstens 0,1
motion.speed; motion.running; motion.reduced;               // Spieltempo, läuft gerade etwas, Bewegung reduzieren
```

Alle Animationen der Karte (Verkehr, Figuren, Hotspot-Puls) hängen an **einer** `requestAnimationFrame`-Schleife, die
nur läuft, solange jemand zuhört, das Spiel nicht pausiert ist und der Tab sichtbar ist. Das Spieltempo setzt `GameMap`
(`setSpeed`, aus `MapView`). Bei "Bewegung reduzieren" (`prefers-reduced-motion`) gibt es keinen Verkehr und kein Pendeln.

## Performance-Budget (Auftrag 31)

- Desktop 60 Bilder pro Sekunde, Handy 30 (iPhone-Viewport, 4× CPU-Drossel) im Normalbetrieb mit Verkehr, Figuren und
  einer laufenden Lieferung; keine Long Task über 50 ms bei Tempo 4× mit zehn offenen Aufträgen.
- Verkehr und Figuren zusammen höchstens 2 ms pro Bild (Handy 4 ms), Verkehr allein 1,5 ms bei 40 Fahrzeugen.
- Jede Quelle (`setData`) höchstens 20-mal pro Sekunde und nur bei Änderung.
- Layer bekommen `update()` nur, wenn sich Spielzeit, ein Befehl, das offene Panel, Handy, Kamera, Overlay oder die
  Verkehrs-Einstellung geändert haben (`GameMap.update`, `invalidate`). Marker-DOM nur bei neuem Text (`setText`).
- In einem Bild (`onMapFrame`, `render`) nichts lesen, was ein Layout erzwingt: kein `clientWidth`,
  `getBoundingClientRect` und auch kein `window.innerWidth` (also kein `isMobile()`), sondern in `update()` merken oder
  die Canvas-Attribute nehmen. `isMobile()` pro Bild kostete den Verkehr am Handy mit Drossel 1,5 ms pro Bild.

Messen: `?perf=1` im Dev-Build zeigt oben links Bilder pro Sekunde, Bild-Arbeit der Animationen, Zeit pro Layer-Update,
`setData` pro Quelle und Long Tasks neben dem Budget (`perf.ts`, `mapPerf.begin()`/`mapPerf.end('frame' | 'layer', name,
t0)`, Anzahlen mit `mapPerf.count`); `npm run perf:browser -- --save=<spielstand> --scenes=karte --hour=8 --width=1440
--height=900` (Berufsverkehr, volle 40 Fahrzeuge; unter 760 px Breite gilt die Handy-Zahl 14), dazu `--mobile
--throttle=4`, `--reduced-motion` und `--traffic=off`, liest dieselben Zahlen über `window.__ktMapPerf`. Ohne GPU (Headless, SwiftShader) sind Bilder pro Sekunde und Long Tasks durch
die Software-Grafik begrenzt; Bild-Arbeit und `setData` nicht. Mit `--gpu` auf einem Rechner mit Grafikkarte messen.

## Weitere Effekt-Werkzeuge

Jede Funktion gibt es mit Karte als erstem Argument (in einem Karten-Layer: `ctx.map`) und gebunden an die aktive
Karte über `mapEffects` (z.B. in `onGameEvent`-Reaktionen; ohne Karte passiert nichts, Rückgabe `null`).
Effekte sind reine Optik und ändern nie den Spielzustand.

```ts
mapEffects.money(spot, 450, { caption: 'Verkauf' });        // grüne Pille "+450 €" steigt 40 px auf und verblasst
mapEffects.money(lager, -1200, { caption: 'Razzia' });      // negativ = rot
const light = mapEffects.blueLight(pos, { label: 'Razzia', durationMs: 8000 });   // ohne durationMs: bis stop()
mapEffects.ping(pos, { tone: 'accent' });                   // Ring breitet sich aus
mapEffects.flash({ strength: 0.5 });                        // Blitz über der Karte (Gewitter, Schuss)
mapEffects.firework(pos, { color: '#f2c766', size: 46 });   // Feuerwerk-Schlag (Kölner Lichter), nur CSS
```

Bei „Bewegung reduzieren“ gibt es keinen Blitz und kein Feuerwerk. Die Stadt-Events auf der Karte (Kölner Lichter mit
Feuerwerk über dem Rhein ab 21 Uhr, Hafengeburtstag mit Schiffen auf der Elbe) zeichnet das Modul `events`
(`events/ui/map.ts`). Konfetti und Blaulicht-Ringe auf der Karte kommen in einem späteren Auftrag.

## Marker

Marker im Look „Glas“: Namen auf Glas-Pillen (`--spot-plate`, `--hud-glass-edge`, Barlow), Orte als runde Kachel mit
Verlauf und weißem Symbol. Ältere Marker (`addTargetMarker`) sind noch eckig und dunkel (`--color-marker-*`,
`--color-label-bg`, `--shadow-marker-soft`). Farben nur aus den Design-Tokens. Icons in selbst gebauten Markern:
`iconElement(name)` aus `src/ui`.

```ts
const ziel = addTargetMarker(ctx.map, { position, label: 'Lager Nord', sublabel: 'Gang: Nordstadt', tone: 'bad', onClick });
ziel.setActive(true);

// Orte (Lager, Lieferanten, Hafen): runde Kachel mit Verlauf und Symbol, darunter eine Glas-Pille
const tile = el('span', 'map-place-icon');
tile.appendChild(iconElement('warehouse', { strokeWidth: 2.2 }));   // iconElement aus src/ui
addHtmlMarker(map, {
  position,
  className: 'map-place map-place--warehouse',   // Verlauf im Modul: .map-place--warehouse { --map-place-a: …; --map-place-b: … }
  anchor: 'bottom',
  tag: 'button',
  children: [tile, el('span', 'map-place-name', 'Lager Ehrenfeld · 640 g')],
});
```

Veedel-Namen stehen nicht dauerhaft auf der Karte, nur im Panel und beim Überfahren mit der Maus (territory).
Klicks auf eigene Marker: vorher `ctx.isPicking()` prüfen. Für einen Klick auf die Karte immer
`ui.pickLocation('Text')` nutzen.
