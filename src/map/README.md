# Karte (`src/map/`)

Die Grundkarte im Look "Nacht-Satellit" mit Überwachungs-Elementen. Module importieren alles nur aus
`src/map/index.ts` und nur aus ihrem `ui/`-Ordner.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `GameMap.ts` | MapLibre-Karte, Kamera 3D/2D, Köln/Europa, Tag/Nacht, Stimmung, Layer der Module |
| `style.ts` | Grundstil: Luftbild (Esri), Wasser, Blaustich, Koordinatenraster, Straßen und Laternen (OpenFreeMap), 3D-Gebäude mit Fenstermuster |
| `look.ts` | rechnet aus Tageslicht, Dämmerung und Stimmung die Mal-Eigenschaften aus (getestet) |
| `daylight.ts` | Tag-Nacht-Kurve nach der Spieluhr: `daylight`, `twilight`, `dayPhase` (getestet) |
| `atmosphere.ts` | Stimmung der Module (`setMapMood`) und Niederschlag (`setPrecipitation`) |
| `overlay.ts` | Überwachungs-Overlay: Scanlines, Vignette, Rahmen, Fadenkreuz, Koordinaten, REC |
| `precipitation.ts` | Regen und Schnee als Canvas über dem Luftbild |
| `effects.ts` | Effekt-Werkzeuge (unten) |
| `markers.ts` | `addHtmlMarker`, `addTargetMarker`, `el` |
| `geometry.ts` | `pointAlong`, `pathLength`, `bearing`, `offsetAround`, `formatDms` (getestet) |
| `windows.ts` | Fenstermuster der Gebäude (Canvas) |

Ebenen der Grundkarte stehen in `BASE_LAYERS`. Eigene Flächen unter den 3D-Gebäuden:
`map.addLayer(layer, BELOW_BUILDINGS)`. Quellen- und Layer-IDs immer mit Modul-Präfix.

## Tag, Nacht und Kamera

- Das Licht folgt der Spieluhr: Nacht 21:45–5:15, Dämmerung 5:15–7:30 und 19:30–21:45 (mit Morgen- und
  Abendrot), sonst Tag. Keine Jahreszeiten. `dayPhase(clock.minuteOfDay(state.time))` liefert
  `'night' | 'dawn' | 'day' | 'dusk'`, z.B. für eigene Nacht-Effekte.
- Nachts: Luftbild dunkel, entsättigt, kalter Blaustich; Straßen glühen wie Natriumlampen, Laternenpunkte auf
  Hauptstraßen, viele beleuchtete Fenster. Tagsüber heller, aber gedämpft.
- Kamera: 3D schräg (Standard) oder 2D-Draufsicht, pro Gerät gemerkt (`ui.setCameraMode`, `ui.toggleCamera`,
  `UiState.camera`). In 2D ist Drehen und Kippen aus. `ui.flyToKoeln()` hält den Modus, `ui.flyToEuropa()` zeigt
  die Europa-Ansicht (Lieferungen) immer flach; einen Knopf dafür gibt es nicht mehr (hat eher verwirrt).
- Überwachungs-Overlay: `ui.setOverlay(on)`, `UiState.overlay`, pro Gerät gemerkt.

## Stimmung und Niederschlag

```ts
import { setMapMood, setPrecipitation } from '../../../map';

// in update() eines Karten-Layers
setMapMood('police', { tint: '#2f7bff', tintStrength: 0.2, darken: 0.1 });   // null entfernt die Stimmung
setPrecipitation({ kind: 'rain', intensity: 0.8, wind: 0.3 });                // 'rain' | 'snow' | 'none'
```

`MapMood`: `darken`, `brighten`, `desaturate`, `tint` + `tintStrength`, `haze`, `wet` (alle 0–1). Mehrere
Beiträge werden addiert. Das Wetter-Modul nutzt beides (`src/modules/weather/ui/index.tsx`).

## Effekt-Werkzeuge

Jede Funktion gibt es mit Karte als erstem Argument (in einem Karten-Layer: `ctx.map`) und gebunden an die
aktive Karte über `mapEffects` (z.B. in `onGameEvent`-Reaktionen; ohne Karte passiert nichts, Rückgabe `null`).
Effekte sind reine Optik und ändern nie den Spielzustand.

### Geld-Popup

```ts
mapEffects.money(spot, 450, { caption: 'Verkauf' });        // "+450 €" steigt auf und verblasst
mapEffects.money(lager, -1200, { caption: 'Razzia' });      // negativ = rot
mapEffects.money(pos, 'Deal!', { tone: 'info' });           // Text geht auch
```

Beispiel für die Integration (Verkäufe am Spot):

```ts
onGameEvent('sale.completed', 'spots.moneyFx', (p, _ui, state) => {
  const spot = p.spotId ? getSpot(state, p.spotId) : undefined;
  if (spot) mapEffects.money(spot, p.revenue, { caption: `${p.amount} g` });
});
```

### Blaulicht

```ts
const light = mapEffects.blueLight(pos, { label: 'Razzia', durationMs: 8000 });   // ohne durationMs: bis stop()
light?.setPosition(neu);
light?.stop();
```

### Fahrzeug entlang einer Linie

```ts
// Gesteuert von der Simulation (z.B. Lieferfortschritt 0–1):
const van = createVehicle(ctx.map, { path: [hafen, lager], kind: 'van', label: '500 g' });
van.setProgress(shipmentProgress(state, s));   // in update()
van.remove();

// Reine Deko-Fahrt in echter Zeit:
mapEffects.animateVehicle({ path: route, kind: 'police', durationMs: 20000, loop: true });
```

`kind`: `'car' | 'van' | 'truck' | 'police' | 'courier'`, `color` für eigene Farben (z.B. Gang). Das Fahrzeug
liegt flach auf der Karte und zeigt in Fahrtrichtung, nachts mit Scheinwerferkegel, die Polizei mit Blaulicht.
`path` kann eine Luftlinie oder eine echte Route (viele Punkte) sein; `pointAlong` verteilt gleichmäßig nach Metern.

### Figuren an Spots

```ts
const mo = addFigure(ctx.map, { position: spot, name: 'Mo', role: 'runner', state: 'active' });
mo.setState('busy');        // 'idle' | 'active' | 'busy' | 'alert' | 'down'
mo.setColor(gang.color);
const leute = mapEffects.figuresAt(spot, [{ role: 'runner' }, { role: 'customer' }, { role: 'customer' }], 16);
```

`role`: `'player' | 'dealer' | 'runner' | 'courier' | 'customer' | 'gang' | 'police' | 'staff'`.

### Zielmarker, Ping, Blitz

```ts
const ziel = addTargetMarker(ctx.map, { position, label: 'Lager Nord', sublabel: 'Gang: Nordstadt', tone: 'bad', onClick });
ziel.setActive(true);
mapEffects.ping(pos, { tone: 'accent' });          // Ring breitet sich aus
mapEffects.flash({ strength: 0.5 });              // Blitz über der Karte (Gewitter, Schuss)
```

Klicks auf eigene Marker: vorher `ctx.isPicking()` prüfen. Für einen Klick auf die Karte immer
`ui.pickLocation('Text')` nutzen.
