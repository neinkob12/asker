# Karte (`src/map/`)

Die Grundkarte im **Candy-Look** (wie die Snapchat-Map): Pastellflächen, dicke runde Straßen, wenig Details,
3D-Gebäude in weichen Farben mit Schatten, Wahrzeichen als Toon-Klötze, vier Tageszeiten. Alle Daten kommen aus
den OpenFreeMap-Vektorkacheln (OpenMapTiles-Schema, ohne Key). Module importieren alles nur aus
`src/map/index.ts` und nur aus ihrem `ui/`-Ordner.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `GameMap.ts` | MapLibre-Karte, Kamera 3D/2D, Köln/Europa, Tageszeit und Stimmung anwenden, Layer der Module mounten |
| `style.ts` | Grundstil: Land, Parks/Wald/Friedhöfe, Wasser mit Uferlinie, Gleise, Straßen (Kontur + Füllung je Klasse), Brücken, Häuserschatten, 3D-Gebäude in vier Höhenbändern, Wahrzeichen |
| `look.ts` | vier Tageszeit-Paletten (`PALETTES`), weiche Übergänge (`paletteBlend`), Stimmung darüber (`computeLook`), Farbhilfen `mixColor`, `pastel` (getestet) |
| `landmarks.ts` | Wahrzeichen als gestapelte Klötze mit echten Koordinaten (`LANDMARKS`, `landmarkFeatures`) (getestet) |
| `vehicles.ts` | 3D-Mini-Fahrzeuge und Schiffe (`createVehicle`, `animateVehicle`) |
| `hotspots.ts` | pulsierende Farb-Blobs (`createHotspots`) |
| `daylight.ts` | Tag-Nacht-Kurve nach der Spieluhr: `daylight`, `twilight`, `dayPhase` (getestet) |
| `atmosphere.ts` | Stimmung der Module (`setMapMood`) und Niederschlag (`setPrecipitation`) |
| `overlay.ts` | Überwachungs-Overlay (Scanlines, Rahmen, Koordinaten), standardmäßig aus |
| `precipitation.ts` | Regen und Schnee als Canvas über der Karte |
| `effects.ts` | Effekt-Werkzeuge (Geld-Popup, Blaulicht, Ping, Blitz) und `mapEffects` |
| `markers.ts` | `addHtmlMarker`, `addTargetMarker`, `el` |
| `geometry.ts` | `pointAlong`, `pathLength`, `bearing`, `offsetAround`, `offsetMeters`, `metersPerPixel`, `formatDms` (getestet) |

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
gibt es drei Straßengruppen (Nebenstraßen weiß, Hauptstraßen gelb, Autobahnen und Brücken orange) und vier
Gebäudebänder (`BUILDING_BANDS`: unter 9 m, 9–16 m, 16–28 m, darüber). Neue Farbe = Wert in allen vier Paletten in
`look.ts` und eine Zeile in `GameMap.applyLook`.

## Tageszeiten

- Vier Paletten nach der Spieluhr (`dayPhase`): **Morgen** (5:15–7:30), **Tag**, **Abend** (19:30–21:45),
  **Nacht**. In der Dämmerung wird erst übergeblendet, dann steht die Morgen- bzw. Abendpalette eine Weile, dann
  wieder übergeblendet (`paletteBlend`). Sprünge gibt es nicht (getestet).
- Tag: heller Candy-Look (Land creme, Wasser himmelblau, Parks grün, Häuser rosa/gelb/hellblau/lila).
  Nacht: Dunkelblau, Wasser und Parks bleiben klar erkennbar, Hauptstraßen und Autobahnen glühen gelb
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
Beiträge werden addiert und legen sich über die Palette. Für den Pastell-Look helle, kühle Farbstiche nehmen
(dunkle Töne machen die Karte matschig). Das Wetter-Modul nutzt beides (`src/modules/weather/ui/index.tsx`).

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
(fill-extrusion), einheitlich in der Flottenfarbe (`VEHICLE_COLORS`), dreht sich in Fahrtrichtung, hat einen weichen
Schatten und nachts Scheinwerferlicht. Damit man es auf jeder Zoomstufe sieht, hat es eine feste Größe in Pixeln
(nie kleiner als in echt). `progress` beim Anlegen setzt die Startposition, sonst fährt es vom Anfang der Strecke los.
`title` zeigt einen Namen beim Überfahren, `onClick` macht es klickbar. Alle Fahrzeuge einer Karte teilen sich eine
GeoJSON-Quelle; neue Geometrie gibt es nur, solange sich etwas bewegt (höchstens 40 Mal pro Sekunde).
`path` kann eine Luftlinie oder eine echte Route (viele Punkte) sein; `pointAlong` verteilt gleichmäßig nach Metern.
Echte Straßenrouten gibt es noch nicht (siehe Konzept, "Logistik").

**Hafenlieferungen:** Ware aus Rotterdam kommt als Schiff den Rhein hinauf (`RHINE_ROUTE` in
`src/modules/suppliers/config.ts`, in Köln langsamer), wird im Niehler Hafen umgeladen und fährt als Lkw zum Lager.
Die Aufteilung der Lieferzeit (`SHIP_SHARE`, `UNLOADING_SHARE`) rechnet `deliveryLeg(supplier, progress)`; die
Lieferzeit in der Simulation bleibt gleich.

## Hotspots

```ts
import { createHotspots } from '../../../map';

const hotspots = createHotspots(ctx.map, 'spots.hotspots');          // eigene Quelle und Heatmap-Ebene
hotspots.setHotspots([{ position: spot, intensity: 0.8 }]);           // 0 = nichts, 1 = viel los, bis 1,5
hotspots.remove();
```

Weicher Farb-Blob (MapLibre-Heatmap), der langsam pulsiert (15 Bilder pro Sekunde, bei "Bewegung reduzieren" still):
Gelb über Orange und Pink bis Lila, nachts kräftiger. Die Spots füttern ihn aus wartenden Kunden, Verkäufen (klingen
90 Spielminuten nach) und der aktuellen Nachfrage (`spotDemand` aus `customers`). Figuren und Avatare gibt es auf der
Karte nicht mehr.

## Weitere Effekt-Werkzeuge

Jede Funktion gibt es mit Karte als erstem Argument (in einem Karten-Layer: `ctx.map`) und gebunden an die aktive
Karte über `mapEffects` (z.B. in `onGameEvent`-Reaktionen; ohne Karte passiert nichts, Rückgabe `null`).
Effekte sind reine Optik und ändern nie den Spielzustand.

```ts
mapEffects.money(spot, 450, { caption: 'Verkauf' });        // weiße Pille "+450 €" steigt auf und verblasst
mapEffects.money(lager, -1200, { caption: 'Razzia' });      // negativ = rot
const light = mapEffects.blueLight(pos, { label: 'Razzia', durationMs: 8000 });   // ohne durationMs: bis stop()
mapEffects.ping(pos, { tone: 'accent' });                   // Ring breitet sich aus
mapEffects.flash({ strength: 0.5 });                        // Blitz über der Karte (Gewitter, Schuss)
```

Konfetti und Blaulicht-Ringe im Candy-Look kommen in einem späteren Auftrag.

## Marker

Marker sind rund und weiß mit weichem Schatten, Schrift dunkel (Tokens `--color-marker-bg`, `--color-marker-ink`,
`--color-marker-muted`, `--shadow-marker-soft`), Farben nur aus den Design-Tokens.

```ts
const ziel = addTargetMarker(ctx.map, { position, label: 'Lager Nord', sublabel: 'Gang: Nordstadt', tone: 'bad', onClick });
ziel.setActive(true);

// Orte (Lager, Lieferanten, Hafen): runder Knopf mit farbigem Kern und Namens-Pille
addHtmlMarker(map, {
  position,
  className: 'map-place map-place--warehouse',   // Farbe im Modul: .map-place--warehouse { --map-place-color: … }
  anchor: 'bottom',
  children: [el('span', 'map-place-icon'), el('span', 'map-place-name', 'Lager Ehrenfeld')],
});
```

Veedel-Namen stehen nicht dauerhaft auf der Karte, nur im Panel und beim Überfahren mit der Maus (territory).
Klicks auf eigene Marker: vorher `ctx.isPicking()` prüfen. Für einen Klick auf die Karte immer
`ui.pickLocation('Text')` nutzen.
