# Architektur

Stand: nach der Integration (Auftrag 20) und Logistik mit echten Straßen (Auftrag 21). Kurzfassung und Regeln in
[`CLAUDE.md`](../CLAUDE.md), Phasenplan in [`docs/auftraege/README.md`](auftraege/README.md). Wer eine Schnittstelle
erweitert, ergänzt sie hier.

## Überblick

```
┌──────────── Browser ─────────────────────────────────────────────────────────────┐
│  src/ui (Preact)                src/map (MapLibre)                               │
│  Shell · Registries · Bausteine Grundkarte · Layer-Registry                      │
│        ▲ liest Zustand, schickt Befehle        ▲                                 │
│        │                                       │  src/modules/<id>/ui/  (auto)   │
├────────┼───────────────────────────────────────┼─────────────────────────────────┤
│  src/core/session.ts   GameSession: Spielschleife, Tempo, Autosave, Speicherplätze│
│  src/core/sim.ts       Simulation: Zustand, feste Schritte, Befehle, Ereignisse   │
│  src/core/*            wallet · clock · journal · messages · outcome · rng · saves│
│        ▲ defineModule                                                            │
│  src/modules/<id>/index.ts  (auto über import.meta.glob)                         │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- **Simulation und Oberfläche sind getrennt.** Kern und Modul-Simulation (alles außer `ui/`) kennen kein DOM.
  Sie laufen in Tests unter Node und können später auf einem Server laufen (Multiplayer).
- **Ein Zustand, ein Weg zum Ändern.** Der gesamte Spielstand ist ein JSON-Objekt (`GameState`). Geändert wird er
  nur von der Simulation: in `tick`, in Befehls-Handlern und in Ereignis-Handlern.
- **Determinismus.** Zufall nur aus dem Spielstand (`ctx.random()`), Zeit nur als Spielminuten. Gleicher Stand +
  gleiche Befehle = gleiches Ergebnis. Getestet in `src/core/sim.test.ts` und `src/core/discover.test.ts`.

## Kern (`src/core/`)

### Spielzustand (`types.ts`)

```ts
interface GameState {
  schema: number;                 // Version der Kernfelder (CORE_SCHEMA_VERSION)
  meta: { runId, mode: 'normal' | 'hardcore', seed, createdAt };
  time: number;                   // Spielminuten seit Tag 1, 00:00
  nextId: number;                 // Zähler für ctx.nextId()
  rng: Record<string, number>;    // Zufallszustand, ein Strom pro Modul
  wallet: { dirty, clean };
  journal: JournalEntry[];
  messages: { contacts, list };
  outcome: { gameOver, won };
  modules: ModuleStates;          // state.modules.<id>, je Modul ein Bereich
  moduleVersions: Record<string, number>;
}
```

`ModuleStates`, `GameCommands` und `GameEvents` sind leere Interfaces, die jedes Modul aus seinem Ordner per
Declaration Merging erweitert (`declare module '../../core' { interface ModuleStates { … } }`).
Dasselbe gilt in der UI für `PanelRegistry`, `DialogRegistry` und `SlotRegistry` (`declare module '../../../ui'`).

### Zeit und Schleife (`sim.ts`, `loop.ts`, `session.ts`, `clock.ts`)

- Ein **Simulationsschritt = eine Spielminute**. `sim.step()` zählt die Zeit hoch, meldet volle Stunden
  (`clock.hourStarted`) und neue Tage (`clock.dayStarted`), lässt alle Module ticken, stellt Ereignisse zu und
  prüft die Pleite-Regel.
- Module ticken in Abhängigkeits-Reihenfolge (`dependsOn`, bei Gleichstand nach ID). Mit `tickEvery: 60`
  tickt ein Modul nur zur vollen Stunde, mit `1440` um Mitternacht.
- `GameLoop` rechnet echte Zeit in Schritte um: bei 1x 5 Spielminuten pro Sekunde, 2x und 4x entsprechend,
  Pause = 0. Die Bildrate spielt keine Rolle, Reste werden übertragen, Unterbrechungen (Tab im Hintergrund)
  laufen nicht nach. Die Zeit läuft also nur, solange gespielt wird.
- Uhr-Hilfen: `clock.day/hour/minute/weekday/weekdayName/isWeekend/isNight/dayPhase/format/formatLong/formatTime/at`.
  Tag 1 ist ein Freitag, Start 18:00 Uhr (`START_TIME`, `START_WEEKDAY` in `config.ts`).
- Tageslauf für alle gleich (`DAWN`, `DUSK`, `dayPhaseAt` in `clock.ts`): Nacht 21:45–5:15, Dämmerung 5:15–7:30
  und 19:30–21:45. `clock.isNight` und das Licht der Karte (`src/map/daylight.ts`) nutzen dieselbe Kurve.

### Befehle

```ts
sim.dispatch({ type: 'customers.serve', payload: { customerId: 12 } })   // → { ok: true } | { ok: false, reason }
ctx.dispatch(command, { actor: 'staff:s12' })                            // aus der Simulation, z.B. Leutnant
```

- Serialisierbar (`{ type, payload }`), jeder Typ gehört genau einem Modul (doppelte Handler → Fehler beim Start).
- Handler bekommen `(ctx, payload, meta)`, `meta.actor` ist `'player'`, `'system'` oder `'staff:<id>'`.
- Rückgabe `{ ok: false, reason }` mit deutschem Text; die UI zeigt ihn als Toast. `undefined` zählt als Erfolg.
- Nach Game Over schlagen alle Befehle fehl.

### Ereignisse

```ts
ctx.emit('sale.completed', { ... })      // aus tick, Befehl oder Handler
on: { 'sale.completed': (ctx, payload) => { ... } }   // im Modul
sim.on('game.over', (payload) => ...)    // außerhalb (UI, Tests), nur lesen
```

- Zustellung am Ende des Schritts bzw. Befehls, in Reihenfolge des Auslösens. Ereignisse aus Handlern kommen
  hinten dran. Pro Ereignis laufen die Module in derselben Reihenfolge wie beim Tick.
- Außerhalb der Simulation (UI) kommen Ereignisse erst nach der Zustellung an die Module an.

### Kerndienste

| Dienst | API | Ereignisse / Befehle |
| --- | --- | --- |
| Geld (`wallet.ts`) | `wallet.balance(state, kind?)`, `canAfford`, `earn(ctx, amount, kind, reason)`, `pay` (false, wenn es nicht reicht), `lose` (höchstens was da ist), `convert(ctx, from, to, amount, fee)` | `wallet.changed` |
| Journal (`journal.ts`) | `journal.add(ctx, text, 'info' \| 'good' \| 'bad', ref?)`, `journal.entries(state)` | `journal.added` |
| Nachrichten (`messages.ts`) | `messages.send(ctx, { contact, text, options?, expiresIn?, silent? })`, `thread`, `threads`, `unreadCount`, `get`, `contact`, `canAnswer` | Befehle `messages.answer`, `messages.markRead`; Ereignisse `message.received`, `message.answered`, `message.expired` |
| Spielende (`outcome.ts`) | `outcome.gameOver(ctx, 'bankrupt' \| 'killed', detail?)`, `outcome.win(ctx)`, `isOver`, `hasWon` | `game.over`, `campaign.won` |
| Uhr (`clock.ts`) | siehe oben | `clock.hourStarted`, `clock.dayStarted` |
| Format (`format.ts`) | `formatEuro`, `formatAmount`, `formatNumber`, `formatPercent` | |
| Geo (`geo.ts`) | `distanceMeters(a, b)`, `lerpLngLat(a, b, t)` | |

**Nachrichten:** Alle Figuren sprechen den Spieler über das Spiel-Handy an. Kontakt-IDs nach dem Muster
`'<art>:<id>'`: `gang:<id>`, `staff:<id>` (auch Leutnants und der Polizei-Kontakt), `supplier:<id>`,
`customer:<Stammkunde>`, `customer:area-<veedel>`, `dealer:<id>`. Kontaktarten (`ContactKind`): `customer`,
`supplier`, `gang`, `staff`, `police`, `other`. Eine Antwort-Option kann einen `command` tragen; beim Antworten
(`messages.answer`) wird er als Spieler ausgeführt. Schlägt er fehl, bleibt die Nachricht unbeantwortet.
`silent: true` stellt still zu (ungelesen, aber ohne Banner), z.B. Lieferanfragen und Meldungen der Leutnants.
Ältere Nachrichten fallen ab `MESSAGE_LIMIT` weg.

**Pleite-Regel:** Module können `solvency(state)` angeben ("kann der Spieler dank mir weitermachen?").
Melden alle `false`, löst der Kern `game.over` mit `bankrupt` aus. Stand jetzt: `goods` (Ware im Lager) und
`suppliers` (Lieferung unterwegs, genug Schwarzgeld oder Kredit für ein Paket; bei einem gesperrten Lieferanten
zählt, ob das Geld für Schulden plus Paket reicht).

### Spielstände (`persistence.ts`, `saves.ts`, `session.ts`)

- Speicherplätze `slot-1` bis `slot-3` plus `autosave` in `localStorage` (`koeln-tycoon:save:<slot>`).
  Autosave alle 10 echten Sekunden beim Spielen, beim Laden/Neuanfang und wenn der Tab verlassen wird.
  Ein beendetes Spiel überschreibt den Autosave nicht.
- **Modus** beim Anlegen: Normal (nach Game Over älteren Stand laden) oder Hardcore (alle Stände desselben
  Durchgangs, erkannt an `meta.runId`, werden bei Game Over gelöscht).
- Export/Import als JSON-Datei (`{ format: 'koeln-tycoon-save', formatVersion, savedAt, label, state }`).
- Laden: Kernfelder migrieren (`CORE_MIGRATIONS`), dann jedes Modul von seiner gespeicherten Version auf die
  aktuelle (`migrations[v]`), fehlende Module frisch anlegen. Neuere Stände werden mit Fehlermeldung abgelehnt.
  Prototyp-Spielstände werden verworfen.

### Modul-Registry (`module.ts`, `discover.ts`)

`discoverModules()` findet alle `src/modules/*/index.ts` (außer Ordnern mit `_`) per `import.meta.glob`.
Modul-ID muss gleich dem Ordnernamen sein. `sortModules` prüft doppelte IDs, fehlende Abhängigkeiten und Zyklen.
`discover.ts` wird bewusst nicht aus `core/index.ts` exportiert (Import-Zyklen); nur `main.tsx` und
`testing.ts` nutzen es.

**Tests:** `createTestGame({ seed, mode, modules?, extraModules? })` aus `src/core/testing.ts` startet ein Spiel mit
allen Modulen; `recordEvents(sim)` und `eventsOfType(events, type)` helfen beim Prüfen. `sim.advance(minuten)`
spult vor, `sim.ctx('<modul>')` gibt einen Kontext für Schreib-APIs.

## Modul-Vertrag

```ts
defineModule({
  id, version,              // Pflicht
  dependsOn?,               // vorher initialisieren und ticken
  init?(ctx) → State,       // Anfangszustand, landet in state.modules[id]
  tick?(ctx), tickEvery?,
  commands?: { '<id>.<verb>': (ctx, payload, meta) => CommandResult },
  on?: { '<event>': (ctx, payload, event) => void },
  migrations?: { [zielVersion]: (alt, state) => neu },
  solvency?(state) → boolean,
})
```

`dependsOn` nur eintragen, wenn `init` den Zustand des anderen Moduls liest oder die Tick-Reihenfolge zählt.
Reine API-Aufrufe zur Laufzeit brauchen es nicht. Aktuelle Reihenfolge:

```
encounters → goods → laundering → reputation → roads → suppliers → veedel → gangs → market → spots
→ customers → staff → hierarchy → logistics → recruiting → territory → police → weather
```

Bekannte Kanten, die keinen Zyklus bekommen dürfen: `territory → gangs` (Startverteilung), `staff → customers`
(Läufer bedienen nach dem Kunden-Tick), `police → territory`, `hierarchy/recruiting → staff`.
Weitere Import-Kanten nur zur Laufzeit (Funktionsaufrufe, kein `dependsOn`): `territory → hierarchy`
(Leutnant-Einfluss), `staff → police` (`addHeat`, `getHeat`), `hierarchy → market/recruiting/suppliers/customers`,
`customers → encounters` (Deals, die kippen), `police → staff` (`riskFactor`, `isLyingLow`), `customers/logistics/
suppliers → roads` (Routen), `suppliers ↔ logistics` (Liegeplatz, Ware am Kai), `customers ↔ logistics` (bist du
unterwegs?), `suppliers → customers/territory/reputation` (Freischalt-Bedingungen). `logistics` hängt per `dependsOn`
an `goods`, `suppliers` und `staff` (alte Spielstände: Liegeplatz, wenn schon in Rotterdam bestellt wurde).


## Oberfläche (`src/ui/`)

Look "Nachtschicht": dunkel und gedämpft über der gedämpften Karte, siehe [`src/map/README.md`](../src/map/README.md). Das Spiel-Handy ist die Schaltzentrale und folgt den iOS-Mustern (Apple HIG): iPhone-Seitenverhältnis (`--phone-ratio` 0,49), Statusleiste mit Uhrzeit links, Dynamic Island in der Mitte und Empfang/WLAN/Akku rechts, Startbildschirm mit App-Raster und Dock, gruppierte Listen mit Icon-Kacheln, Large Title mit Übergang zur schmalen Titelleiste. Glas (`backdrop-filter`) gibt es nur auf der schwebenden Ebene (Statusleiste, Island, Dock, Fußleisten); Inhalte liegen auf ruhigen Flächen. **Eine Farbe hat eine Bedeutung** (`--cat-money`, `--cat-dirty`, `--cat-danger` …, je mit Hell-/Dunkel-Variante und geprüftem Kontrast). Plan, Ableitung aus der HIG und Prüfung: [`handy-design.md`](handy-design.md). Details zu Tokens, Bausteinen, Handy und Ton: [`src/ui/README.md`](../src/ui/README.md).

- **Shell** (`shell/`): Karte vollflächig. Darüber nur eine schmale HUD-Leiste (Geld und Heat links, Warnungen,
  Spieltempo und Menü rechts; `Hud.tsx`) und die Kartensteuerung. **Alles andere läuft über das Spiel-Handy**
  (`phone/PhoneFrame.tsx`): Tabs der Module sind Apps (`tab:<id>`), Panels erscheinen als Seite im Handy, dazu die
  Handy-Apps, Meldungen (`core.alerts`), Nächster Schritt, Kennzahlen (`placement: 'more'`) und Widgets auf dem
  Startbildschirm. Desktop: Handy rechts fest angedockt, weggelegt eine Lasche am Rand. Handy-Bildschirm: Handy
  bildschirmfüllend unter dem HUD, in der Tasche eine Leiste unten mit Nächstem Schritt und Handy-Knopf. Dazu Suche
  (`Palette.tsx`, Strg/⌘+K), Toasts (einer sichtbar, Rest in der Warteschlange), Hinweis beim Karten-Klick.
  Tastatur in `keys.ts`. Größe des Handys: `min(440px, (100dvh − 24px) × Seitenverhältnis)`, es fällt also nie aus
  dem Fenster; in kleinen Fenstern verkleinern Container-Queries (`container: phone`) Abstände und Kacheln.
- **Startbildschirm** (`phone/PhoneFrame.tsx`): Statusleiste, Zeile "Heute" (Tag, Uhrzeit, Tagesphase, Wetter-Knopf),
  Skyline als Signature (`phone/Skyline.tsx`, Dom, Groß St. Martin, Kranhäuser, KölnTriangle; nachts leuchten die
  Fenster), Karte "Nächster Schritt", Kennzahlen (`placement: 'more'`), App-Raster (`HOME_ORDER`) und ein **Dock** mit
  den vier wichtigsten Apps (Nachrichten, Geschäft, Lieferanten, Leute). Ein Tab-Bar-Muster gibt es bewusst nicht:
  jede App ist eine eigene Seite mit Zurück-Knopf, das Dock ersetzt die Tab-Leiste (Begründung in `handy-design.md`).
- **Statusleiste und Island:** `phone/PhoneFrame.tsx` (`StatusBar`, Grid mit drei Spalten: Uhrzeit | Island | Symbole)
  hält die Sicherheitszone ein, die Island verdeckt nichts. Die Island zeigt Fristen nur in Stunden
  (`islandCountdown(minutes)` in `phone/islandModel.ts`: "2 Std.", unter einer Stunde "< 1 Std.").
- **Seiten im Handy** (`phone/PhoneScreen.tsx`): Large Title, der beim Scrollen in die Titelleiste wandert
  (`is-collapsed`), Zurück-Knopf als Glas-Taste, Fußleiste mit Aktionen als Glas-Blatt. Zieltreffer sind im Handy
  mindestens 44 × 44 px.
- **Laufzeit** (`runtime.ts`): `UiRuntime` hält den reinen UI-Zustand (`UiState`: Panel, Dialog, Tab, Handy,
  Tempo, `camera`, `overlay`, `vibration`, `notification`, `picking`) und die `UiApi`. Neuzeichnen nach
  Simulationsschritten, gedrosselt auf ca. 10 Mal pro Sekunde; in der Pause nur bei UI-Änderungen.
- **Hooks** (`hooks.ts`): `useGame()` → `{ state, dispatch }`, `useUi()` → `UiApi` + `state`, `useSession()`.
- **UiApi:** `dispatch` (Toast bei Fehler), `openPanel/closePanel`, `openDialog/closeDialog`, `toast(text, kind)`,
  `notify({ title, text, icon, appId, params, sound })`, `openPhone(appId?, params?)/closePhone`, `selectTab`
  (öffnet den Tab als App im Handy), `openSection(id)`, `togglePalette`, `setPopover`,
  `dismissToast`, `markAlertsRead`, `clearAlerts`, `setSpeed`, `togglePause`, `pickLocation(prompt)` (nächster Karten-Klick als Promise),
  `cancelPick`, `flyTo`, `flyToKoeln`, `flyToEuropa`, `setCameraMode`, `toggleCamera`, `setOverlay`,
  `setVibration`, `zoomIn`, `zoomOut`, `resetNorth`.
- **Registries** (`registry.ts`, alle über `src/ui/index.ts`):

| Funktion | Wofür | Einträge |
| --- | --- | --- |
| `registerHudItem({ id, order, placement?, icon?, component })` | Kennzahl (`placement`: `main` in der HUD-Leiste, `more` als Kachel auf dem Handy-Startbildschirm, `time` neben dem Datum auf dem Startbildschirm, `alert` als Warnung im HUD) | Geld (10, sauberes Geld erst wenn > 0), Lager (20), Heat (30), Ruf (40), Köln-Fortschritt (45), offene Konfrontation (50), Wetter (95) |
| `registerTab({ id, title, order, icon?, layout?, shortcut?, component?, badge? })` | Bereich als App im Handy (`tab:<id>`); ohne `component` zeigt er den Slot `tab:<id>`; `layout: 'rows'` zeigt jede Card als tippbare Zeile | Geschäft (10), Reviere (20), Leute (30), Gangs, Ereignisse (90) |
| `registerSlot(name, { id, order, component })` | Abschnitt in einem Slot | `tab:business` (Lager, Lieferungen, Logistik, Spots, Personal, Kundschaft, Ruf, Markt, Geldwäsche), `tab:staff`, `spots.spotPanel` (Kunden mit „Hier hinstellen“, Preise, Läufer, Leutnant), `veedel.veedelPanel` (Revier, Polizei, Leutnant), `staff.profile`, `phone.home` (Widgets), `core.settings` (Abschnitt in der App Einstellungen) |
| `registerPanel({ id, title, component })` | Detailansicht als Seite im Handy, `ui.openPanel(id, props)` | `spots.spot`, `veedel.veedel`, `goods.warehouse`, `staff.profile`, `hierarchy.lieutenant`, `market.overview` |
| `registerDialog({ id, component, pausesGame?, dismissable? })` | Dialog, `ui.openDialog(id, props)` | `core.newGame`, `core.saves`, `core.gameOver`, `core.won`, `encounters.encounter` (pausiert), `gangs.attack`, `gangs.ally` |
| `registerLiveActivity({ id, activities })` | Live-Aktivität in der Dynamic Island des Handys (`LiveActivity`: `priority`, `icon`, `tone`, `leading`, `trailing`, `title`, `detail`, `progress`, `open`) | Überfall, Razzia, Heat, Gang-Vorstoß, Chat-Frist, Auftrag, Kurier, Lieferung, Ware am Kai, Fahrt/Kontrolle, du am Spot, Umsatz heute |
| `registerPhoneApp({ id, name, icon, order, color?, chrome?, component, badge? })` | App im Spiel-Handy; `color` ist eine Bedeutungsfarbe (`money`, `dirty`, `danger`, `warn`, `place`, `goods`, `people`, `chat`, `sky`, `law`, `media`, `system`, `log`, `brand`) oder eine CSS-Farbe (dann wird die Schrift automatisch lesbar gewählt); `badge(state, ui)` liefert die Zahl auf dem Icon | Nachrichten (Mint), Lieferanten (Waren), Logistik (Waren), Kontakte (Leute), Aufträge, Meldungen (Orange), Wetter (Himmel), Einstellungen (Grau, mit Ton & Musik, Anzeige, Spiel) |
| `onGameEvent(type, id, (payload, ui, state) => …)` | Reaktion auf Ereignisse (Toast, Dialog, Effekt) | Game Over, Sieg, neue Nachricht (Banner), Toasts der Module, Karten-Effekte |
| `registerAdvisor({ id, advise(state) })` | Empfehlung für die Karte "Nächster Schritt" (`Advice`: priority, icon, title, cost?, action?, highlight?) | Antworten (Kern), Verkauf (an den Spot stellen oder alle bedienen) und Läufer (Spots, Personal), Nachschub (Lieferanten), Ware am Hafen abholen, Liegeplatz (Logistik), Geldwäsche, Kampagnenziel |
| `registerSearch({ id, label, order, items(state) })` | Einträge der Suche (Strg/⌘+K) | Spots, Veedel, Leute, Gangs |
| `registerGameStat({ id, order, icon, label, value(state) })` | Kennzahl auf dem Game-Over- und Sieg-Bildschirm | Tage, Schwarzgeld, Veedel, Kunden, Team |
| `soundOnEvent(type, sound, { when?, throttleMs?, volume? })` | Ton zu einem Ereignis | Kasse, Nachricht, Sirene bei Razzia/Kontrolle, Warnton bei Konfrontation, Lieferung, Game Over, Sieg |

- **Bausteine** (`components/`): `Button`, `IconButton`, `SegmentedControl`, `Select`, `Card`, `Hint`, `Empty`
  (mit `action`), `KeyValue`, `Stat`, `Badge`, `ProgressBar`, `List`/`ListItem`, `Tabs`, `Dialog`, `Icon`,
  `IconChip` (Icon-Kachel mit Farbverlauf, `solid`, `shape="tile"`), `Tag` (mit `category`), `Avatar` (Porträt oder
  Initialen, `tone`), `Toggle` (iOS-Schalter 51 × 31), `Slider`. Props werden nur erweitert, nie gebrochen.
  `components/readable.ts` wählt Schriftfarbe mit ausreichendem Kontrast auf beliebigen Farben (`readableOn`).
- **Design-Tokens** (`styles/tokens.css`): `--color-*`, `--cat-<bedeutung>` (+ `-soft`, `-a`, `-b`, `-on`),
  `--phone-*` (Flächen, Maße), `--type-*` (Schriftstufen), `--font-*`, `--space-1…6`, `--radius-*`, `--shadow-*`,
  `--safe-*` und `--z-*`. Farben liegen als `light-dark()`-Paare vor; das Handy ist dunkel (`.phone`), die
  hellen Werte sind über `data-appearance="light|auto"` vorbereitet. `src/ui/styles/contrast.test.ts` prüft
  WCAG-Kontraste aller Farbpaare (Text 4,5:1, Symbole und Bedienelemente 3:1). Module verwenden nur diese Variablen.
  Die Karte versteht kein `light-dark()`: `mapToken()` und `darkVariant()` aus `src/map/tokens.ts` lösen Tokens für
  MapLibre auf.
- **Ton** (`src/audio/`, für Module über `src/ui`): selbst erzeugte Musik nach Tageszeit, 14 Effekte,
  Geräusch-Schleifen (Regen, Sturm, Wind), Lautstärken pro Gerät. Startet nach der ersten Interaktion.
- **Start** (`start.tsx`): Registriert die Kern-Oberflächen, lädt alle `src/modules/*/ui/index.ts(x)`, setzt den
  Autosave fort oder öffnet "Neues Spiel". URL-Parameter: `?neu=normal|hardcore&seed=123&tempo=0`.
  `window.koeln = { session, runtime }` zum Ausprobieren und für Playwright.

## Karte (`src/map/`)

Details und Beispiele: [`src/map/README.md`](../src/map/README.md).

- `GameMap.ts`: MapLibre im **gedämpften Look** (`style.ts`, `look.ts`): Grau- und Schieferflächen aus den
  OpenFreeMap-Vektorkacheln, runde Straßen (Hauptstraßen etwas heller, Autobahnen warm), Wasser und Grün dezent,
  3D-Gebäude in vier Höhenbändern mit Schatten, keine POIs und keine Straßennamen. Vier Tageszeit-Paletten nach der
  Spieluhr (Morgen, Tag, Abend, Nacht) mit weichen Übergängen, nachts glühen die Hauptstraßen bernsteinfarben, Himmel
  und Nebel ziehen mit. Wahrzeichen als schlichte Klötze (`landmarks.ts`: Dom, Hohenzollernbrücke, Colonius, Kranhäuser,
  KölnTriangle). Überwachungs-Overlay (`overlay.ts`) als Schalter, standardmäßig aus. Kamera 3D (50°)/2D,
  Köln/Europa, `pickLocation()`. Beim Platzieren (`pickLocation`) sehen die Klick-Handler der Layer noch
  `ctx.isPicking() === true`, der Klick wird erst danach aufgelöst. Die Layer der Module werden schon nach dem Stil
  gemountet (`style.load`), damit das Spiel auch ohne erreichbare Kacheln bedienbar bleibt.
- `registerMapLayer({ id, order, mount(ctx) { …; return { update(state, ui), destroy() } } })`.
  `ctx` hat `map`, `ui`, `getState()`, `isPicking()`. Quellen- und Layer-IDs mit Modul-Präfix. Flächen nur aufs
  Land (unter Grün und Wasser): `map.addLayer(layer, ABOVE_LAND)`, unter die Straßen: `BELOW_ROADS`, unter die
  3D-Gebäude: `BELOW_BUILDINGS`.
- Stimmung und Niederschlag: `setMapMood(id, mood)`, `setPrecipitation({ kind, intensity, wind })`. Die Stimmung
  legt sich über die Palette (`computeLook`).
- Werkzeuge: `createVehicle`/`animateVehicle` (3D-Mini-Fahrzeuge und Schiffe, fill-extrusion, weich nachgezogen),
  `createHotspots` (pulsierende Heatmap-Blobs in Bernstein), `addTargetMarker`/`addHtmlMarker` (eckige dunkle Marker), Effekte
  `moneyPopup`, `blueLight`, `ping`, `flash` (auch gebunden an die aktive Karte über `mapEffects`), Farbhilfen
  `mixColor`, `pastel`. Figuren und Avatare gibt es auf der Karte nicht mehr.
- Layer jetzt: `territory.veedel` (feine Veedel-Grenzen, Flächen schwach getönt nach Kontrolle oder Heat, nur auf dem Land, Name nur
  beim Überfahren), `suppliers.routes` (dezente Route, Lieferanten; Transporter aus Großstädten über die Autobahn an
  den Stadtrand und dann über echte Straßen ins Ziel-Lager, Hafenware als Schiff über den Rhein an den Liegeplatz im
  Niehler Hafen), `logistics.trips` (Hafen-Marker, Abholfahrten und Umlagern über echte Straßen, Blaulicht bei einer
  Kontrolle), `goods.warehouses` (alle eigenen Lager), `gangs.markers` (Hauptquartiere, Vorstöße),
  `customers.deliveries` (Kurier/Auto vom nächsten Lager über die Straßen zum Kunden), `spots.markers` (Spots und
  Hotspots nach Kunden, Verkäufen und Nachfrage, Punkt am Spot, an dem du selbst stehst), `weather.sky`.
- Fahrzeuge fahren nicht mehr Luftlinie: Die Wege kommen aus dem Modul `roads` (Kölner Straßennetz aus
  OpenStreetMap über Overture Maps, A*-Routen), dieselben Routen bestimmen in der Simulation die Fahrzeiten.

## Module

Alle Module sind ausgebaut. Die Kopfkommentare der `index.ts` beschreiben jeweils Verhalten und API genauer.

| Modul | Zustand (Version) | Öffentliche API (Auszug) | Befehle | Ereignisse |
| --- | --- | --- | --- | --- |
| `veedel` | statisch (1): 12 Veedel mit echten Grenzen (Offene Daten Köln), Kaufkraft, Polizeipräsenz, Dichte, Beschreibung, `startInfluence` | `allVeedel`, `getVeedel`, `veedelName`, `veedelAt(lng, lat)` (Punkt in Polygon), `neighborsOf`, `sharesBorder`, `getBoundary`, `veedelLinks` | | |
| `territory` | `influence`, `controller`, `lastSaleAt` (2) | `PLAYER_FACTION`, `CONTROL_THRESHOLD`, `LOSE_CONTROL_THRESHOLD`, `getInfluence`, `influenceIn`, `addInfluence`, `controllerOf`, `controlledBy`, `factions`, `factionName`, `factionColor`, `playerPresence`, `hasPlayerPresence`, `lieutenantInfluence`, `campaignProgress` | | `territory.controlChanged` |
| `police` | `heat`, `level`, Sperrzeiten, `tipOffs`, `plannedRaids`, `stats` (3) | `getHeat`, `addHeat`, `reportViolence`, `heatLevel`, `playerHeat`, `hottestVeedel`, `snitchOnGang`, `canSnitch`, `activeTipOff`, `plannedRaid`, `getPoliceStats`, `arrestStaff`, `recordConfiscation` | `police.snitch` | `police.check`, `police.raidPlanned`, `police.raid` (`empty` wenn niemand da war), `police.arrest`, `police.tipOff`, `police.heatLevelChanged` |
| `gangs` | `gangs[id]` (Geld, Leute, Ware, Feindseligkeit, Beziehung, Abkommen, Vorstoß), `priceFactors` (2) | `getGangs`, `getGang`, `getGangStatus`, `gangVeedel`, `veedelGang`, `gangPower`, `playerPower`, `isAtPeace`, `tributeAmount`, `ceasefireCost`, `protectionAmount`, `gangContact` … | `gangs.ceasefire`, `.payTribute`, `.refuse`, `.demandProtection`, `.collect`, `.releaseProtection`, `.ally`, `.attack`, `.acceptOffer` | `gang.pushStarted`, `gang.pushEnded`, `gang.escalated`, `gang.raidStarted`, `gang.diplomacyChanged`, `gang.busted` |
| `encounters` | `active`, `history` (2) | `startEncounter(ctx, request)` (mit `askPlayer`, `place`, `situation`, `stakes`, `effects`, `skipEffects`), `getEncounter`, `activeEncounters`, `pendingEncounter`, `availableActions`, `actionChance`, `autoResolveEncounter`, `ENCOUNTER_KINDS`, `ENCOUNTER_ACTIONS`, `PLAYER_STATS` | `encounters.join`, `.act`, `.auto` | `encounter.started`, `encounter.round`, `encounter.resolved` (`result`) |
| `goods` | Posten pro Lager mit Qualität, Streckanteil, Einkaufspreis, eigene Lager `owned` (3) | `allProducts`, `getProduct`, `productName`, `getWarehouses` (eigene), `warehouseSites` (alle Standorte mit Preis), `isWarehouseOwned`, `nearestWarehouse(state, point, { productId?, amount? })`, `getStock`, `getLots`, `stockSummary`, `averageQuality`, `qualityTier`, `cutPreview`, `store`, `take` (mit `near`: nächstes Lager zuerst; → `taken`, `quality`, `cut`, `unitCost`), `cutLot` | `goods.cut`, `goods.buyWarehouse` (sauberes Geld) | `goods.stored`, `goods.taken`, `goods.cut`, `goods.warehouseBought` |
| `market` | `competition`, `pressure`, `prices` (2) | `referencePrice`, `averageReferencePrice`, `purchasingPowerFactor`, `supplyDemandFactor`, `getPressure`, `getCompetitionFactor`, `setCompetitionFactor`, `spotReferencePrice`, `getSpotPrice`, `hasOwnPrice`, `priceRatio`, `roundPrice` | `market.setPrice` | `market.competitionChanged`, `market.priceSet` |
| `suppliers` | `shipments` (`toPort` bei Schiffsware), `relations` (Vertrauen, Schulden), `unlocked`, `offered` (3) | `getSuppliers`, `getSupplier`, `isUnlocked`, `unlockRequirements` (Stand der Bedingungen), `canUnlock`, `shipmentsInTransit`, `shipmentProgress`, `deliveryLeg` (Schiff/Umladen/Straße, nur Darstellung), `RHINE_ROUTE`, `UNLOADING_PORT`, `CITY_APPROACH_SHARE`, `expectedArrival`, `cheapestPackagePrice`, `getRelation`, `supplierDiscount`, `creditLimit`, `availableCredit`, `isBlocked`, `availablePackages` (leer, solange gesperrt), `packagePrice` | `suppliers.order` (`onCredit`, `warehouseId`), `suppliers.repay`, `suppliers.unlock` | `shipment.ordered`, `shipment.arrived` (`atPort`), `shipment.problem`, `supplier.trustChanged`, `supplier.repaid`, `supplier.overdue`, `supplier.unlocked` |
| `customers` | `waiting`, `nextSpawnAt`, `stats`, `regulars`, `orders` (mit `fromWarehouseId`), `self` (Spot, an dem du stehst) (3; Auftragsstatus zusätzlich `contested`) | `waitingAt`, `allWaiting`, `spotDemand` (aktuelle Nachfrage), `canServe`, `getSalesStats`, `getRegulars`, `getOrders`, `orderProgress`, `isPlayerDelivering`, `playerSpot`, `isPlayerAway`, Kundenentscheidung als reine Funktionen | `customers.serve` (`sellerId`), `.serveAll`, `.standAt`, `.acceptOrder`, `.declineOrder` | `sale.completed` (`street`/`delivery`/`wholesale`), `customer.arrived`, `customer.left`, `customer.missed`, `customer.regularGained/Lost`, `customers.selfMoved`, `order.received/accepted/finished` |
| `spots` | `unlocked`, `custom` (2) | `getSpots` (aktive), `getAllSpots`, `getSpot`, `isSpotActive`, `spotsInVeedel`, `lockedSpots`, `customSpots`, `canFoundSpotAt`; das Veedel eines Spots kommt aus `veedelAt` | `spots.unlock`, `spots.found` | `spots.unlocked`, `spots.founded` |
| `reputation` | `value`, `recent` (2) | `getReputation`, `changeReputation(ctx, delta, reason)`, `reputationDemandFactor`, `reputationLabel`, `recentReputationChanges` | | `reputation.changed` |
| `laundering` | Wäschen mit Dauer (2) | `launderingFee`, `launderingDuration`, `launderingCapacity`, `amountInProgress`, `getBatches`, `batchProgress` | `laundering.launder` | `laundering.started`, `laundering.completed` |
| `staff` | `members`, `former`, `hiding` (3; Rolle `driver`, Einsatz `transport`) | `getStaff`, `getStaffMember`, `getStats`, `runnerAt`, `activeRunnerAt`, `securityAt`, `findAvailable`, `assign`, `setStatus`, `speedFactor`, `riskFactor`, `combatValue`, `defenseStrength`, `bonus`, `bailCost`, `dailyWages`, `staffContact`, `isLyingLow`, `lieLow`, `DRIVER_HIRE_COST` … | `staff.hireRunner`, `.hireDriver`, `.fire`, `.assign`, `.setWage`, `.bail`, `.lieLow` | `staff.hired`, `.left`, `.statusChanged`, `.assigned`, `.levelUp`, `.bailed`, `.betrayed`, `.raidWarning`, `.wentUnderground` |
| `hierarchy` | `lieutenants`, `posts` (Einstellungen, Protokoll) (2) | `getLieutenant`, `getLieutenants`, `getPost`, `lieutenantVeedel`, `canBeLieutenant`, `lieutenantSatisfaction`, `lieutenantCapacity`, `managedSpots` | `hierarchy.appoint`, `.dismiss`, `.configure` | `hierarchy.appointed`, `.dismissed`, `.configured` |
| `recruiting` | Bewerber-Pool und Kontakte (2) | `getCandidates`, `getCandidate`, `getPool`, `getContacts`, `searchReadyAt` | `recruiting.hire`, `.decline`, `.search` | `recruiting.candidateArrived`, `recruiting.hired` |
| `weather` | aktuelles Wetter, Vorhersage (2) | `getWeather`, `getForecast`, `weatherDemandFactor(state, channel?)`, `WEATHER_NAMES`, `isPrecipitation` | | `weather.changed` |
| `roads` | statisch (1): Kölner Straßennetz (`network.ts`, 14.229 Knoten, 19.640 Kanten, ca. 2.200 km, Autobahn bis Wohnstraße, Einbahnstraßen) | `roadRoute(from, to)` (→ `path`, `meters`, `onRoads`; A* nach Fahrzeit, gemerkt), `roadDistance`, `travelMinutes(from, to, metersPerMinute, extra?)`, `roadEntryFrom(far)` (Autobahn-Einfahrt aus Richtung einer fernen Stadt), `nearestRoadPoint`, `networkStats`, `ROAD_SPEEDS` | | |
| `logistics` | `berth` (Liegeplatz), `cargo` (Ware am Kai), `trips` (Fahrten), `log`, `stats` (1) | `hasBerth`, `getCargo`, `cargoAmount`, `cargoRisk`, `getTrips`, `tripProgress` (Anfahrt, Laden, Lieferung, Kontrolle), `tripRoute` (Wege über Straßen), `inTransitAmount`, `isPlayerOnTheRoad`, `freeDrivers`, `portPlace`, `receiveCargo` (für suppliers), `BERTH_COST` | `logistics.buyBerth` (sauberes Geld), `.pickup` (Fahrer oder selbst, Ziel-Lager), `.transfer` (Umlagern) | `logistics.berthBought`, `cargo.docked`, `cargo.seized` (Zoll), `transport.started`, `.stopped` (Kontrolle), `.arrived`, `.seized`, `.lost` |

## Zusammenspiel der Systeme

- **Straßen** (`roads`): Alle Fahrzeuge fahren über das echte Kölner Straßennetz. Daten: Overture Maps (abgeleitet
  von OpenStreetMap, ODbL), erzeugt mit `src/modules/roads/tools/build-roads.py` (Python mit pyarrow und shapely, lädt
  nur den Köln-Ausschnitt per HTTP-Range aus dem öffentlichen S3-Bucket) und als kompakte Zahlenfolge in `network.ts`
  gespeichert (ca. 180 KB). Routen: Punkt auf die nächste Straße einrasten, A* nach Fahrzeit (Tempo pro Straßenart),
  Einbahnstraßen gelten. Lieferdienst, Abholungen und Umlagern rechnen ihre Fahrzeit aus der Routenlänge.
- **Beschaffung und Logistik:** Am Anfang liefert nur Frankfurt. Hamburg meldet sich ab 1.500 € Umsatz, Berlin mit
  einem eigenen Veedel, Amsterdam mit drei Veedeln und 15.000 € Umsatz (Vermittlungsgebühr), Rotterdam mit einem
  Liegeplatz im Niehler Hafen (`logistics.buyBerth`, 4.000 € sauberes Geld, also erst Geld waschen). Schiffsware legt
  am Kai an und muss abgeholt werden: von einem Fahrer (`staff.hireDriver`) oder selbst. Steht sie zu lange (16 Std.),
  findet sie der Zoll. Mit Ware an Bord kann es eine Verkehrskontrolle geben (Konfrontation `vehicleCheck`, öfter bei
  viel Heat im Ziel-Veedel, seltener mit vorsichtigen Fahrern); fliegt die Ladung auf, ist sie weg, der Fahrer landet
  eventuell in Haft. Weitere Lager kauft man mit sauberem Geld (`goods.buyWarehouse`); Großstadt-Lieferungen gehen in
  ein gewähltes Lager, Umlagern per Fahrt. Straßenverkauf nimmt Ware aus dem Lager am nächsten zum Spot, der
  Lieferdienst fährt im nächsten Lager mit der Ware los. Eine Razzia durchsucht eigene Lager im Veedel mit (20 % des
  Bestands dort), Verteilen auf mehrere Lager lohnt sich also.
- **Selbst verkaufen:** Du kannst dich an einen Spot stellen (`customers.standAt`) und bedienst dort automatisch
  (10 Minuten pro Kunde), bis du weggehst. Während du selbst ausfährst oder abholst, wartet der Spot.

- **Verkauf** (`sale.completed`): Einfluss im Veedel (territory, drängt die stärkste Gang zurück), Heat (police,
  mal Polizeipräsenz und `riskFactor` des Verkäufers), Ruf (customers über reputation), Preisdruck (market),
  Umsatzverlust und Feindseligkeit der Gang (gangs), Erfahrung (staff, hierarchy), Geld-Popup auf der Karte.
- **Gangs:** drücken die Preise, wo du ihnen Konkurrenz machst (`setCompetitionFactor`, Preiskrieg ab
  Feindseligkeit 50), eskalieren per Handy (Warnung, Drohung mit Forderung), überfallen Spots, Kuriere und Lager
  (Konfrontation `raidDefense`, Verletzte und Tote über `setStatus`), stoßen in Veedel vor und verteidigen ihre.
  Je mehr Veedel du hältst, desto öfter drängen sie in dein Revier und desto teurer wird Schutzgeld.
- **Leutnants:** führen ihr Veedel über dieselben Befehle wie der Spieler, bringen zusätzlich Einfluss
  (`lieutenantInfluence`, nach Level und Charisma), melden sich per Handy (still), bestellen, was die Kunden
  vermissen (`customer.missed`), und tauchen nach einer Razzia-Warnung ab.
- **Nachfrage:** Uhrzeit, Wochentag (`WEEKDAY_DEMAND` und Kundentypen), Wetter (`weatherDemandFactor`, Straße
  vs. Lieferdienst), Ruf und Preis.
- **Polizei:** Heat aus Verkäufen und Gewalt; Kontrollen (mit Polizeiflucht), geplante Razzien
  (`police.raidPlanned` → 3 Stunden später). Der Polizei-Kontakt (staff, Bonus `raidWarning`) warnt per Handy mit
  der Antwort "Leute abziehen" (`staff.lieLow`); wer abgetaucht ist, verliert bei der Razzia nichts.
- **Konfrontationen** nutzen die echten Werte der Beteiligten (Tempo, Vorsicht, Stärke, Charisma), bringen
  Erfahrung und kosten Loyalität. Anlässe: Überfall abwehren, Polizeiflucht, Schulden eintreiben, Deal kippt
  (Gang-Angebote und Großhandel), Überfall auf einen Gang-Spot.
- **Löhne:** Wer um Mitternacht nicht bezahlt werden kann, ist sauer und schreibt; am zweiten Tag ohne Lohn oder
  unter Loyalität 30 kündigt er.
- **Spielende:** Pleite (Pleite-Regel oben), Tod (nur wer selbst bei einer Konfrontation dabei ist), Sieg bei
  7 von 12 Veedeln (`campaign.won`, danach Endlosmodus). Hardcore löscht bei Game Over alle Stände des Durchgangs.

## Balancing

- Einstellbare Werte liegen in den `config.ts` der Module. Die wichtigsten Stellschrauben dieser Runde:
  Kundschaft (`customers/config.ts`: `BASE_SPAWN_INTERVAL`), Straßenpreise (`goods/config.ts`), Einfluss
  (`territory/config.ts`: `SALE_INFLUENCE_*`, `TAKEOVER_MARGIN`, `LIEUTENANT_INFLUENCE_*`), Gang-Druck
  (`gangs/config.ts`: `ATTACK_*`, `PLAYER_THREAT_*`, `TRIBUTE_PER_PLAYER_VEEDEL`), Polizei
  (`police/config.ts`: `HEAT_DECAY_PER_HOUR`, `CHECK_*`, `RAID_LEAD_TIME`).
- Simulation: `src/playtest/bot.ts` spielt wie ein vorsichtiger Spieler (verkauft an zwei Spots selbst, bestellt
  nach Produktmix, heuert an, befördert Leutnants, stellt Sicherheit ein, zahlt Schutzgeld nur aus der
  Portokasse, lässt Konfrontationen auswürfeln, geht nie selbst hin). `npm test` prüft 10 Tage mit 2 Seeds,
  `npm run balance` gibt einen Bericht über mehrere Seeds aus (`BALANCE_DAYS`, `BALANCE_SEEDS`,
  `BALANCE_VERBOSE`).
- Stand (160 Tage, 8 Seeds): erstes Veedel an Tag 8–10, drei Veedel an Tag 10–26, danach machen die Gangs
  Druck (rund 0,5 Überfälle und 1 Vorstoß pro Tag), fünf Veedel je nach Seed ab Tag 24–142. Der vorsichtige Bot
  gewinnt selten innerhalb von 160 Tagen (in früheren Läufen an Tag 72 und 127); ein Spieler, der auch
  angreift, verpfeift, Bündnisse schließt und eigene Spots gründet, kommt schneller hin. Bei Tempo 1x dauert ein
  Spieltag 4,8 Minuten, 80–120 Spieltage sind also etwa 5–10 Stunden. Einer von acht Seeds ging an Tag 25 pleite.
- Nach Auftrag 21 (40 Tage, 6 Seeds): Der Bot schaltet Hamburg in den ersten Tagen und Berlin mit dem ersten Veedel
  frei, spart ab zwei Läufern in Raten sauberes Geld und hat den Liegeplatz an Tag 10–20, danach holt ein Fahrer die
  Schiffsware ab. Erstes Veedel an Tag 9–12, drei Veedel je nach Seed ab Tag 13–30. Umsatz pro Tag in Tag 16–30
  900–1.900 € (zum Vergleich vor Auftrag 21, 2 Seeds: 580–750 €), keiner der sechs Seeds ging pleite.

## Qualität

- `npm run check` = Typecheck + `npm run lint` (Biome + `scripts/check-boundaries.mjs`) + Tests.
- CI (`.github/workflows/ci.yml`): Typecheck, Lint, Tests, Build, `npm run template:smoke` und in einem zweiten
  Job der Ende-zu-Ende-Test (`npm run e2e`, Chromium über `playwright-core install`).
- Kern-Tests: fester Zeitschritt (`loop.test.ts`, `sim.test.ts`), Determinismus, Befehle, Ereignisse,
  Speichern/Laden mit Migration und Hardcore (`persistence.test.ts`), Game Over, Nachrichten.
- Zusammenspiel (`src/playtest/`): `endings.test.ts` (Pleite, Tod, Sieg, Normal, Hardcore mit allen Modulen),
  `balance.test.ts` (Bot, siehe oben).
- Browser (`scripts/`, gemeinsame Hilfen in `browser.mjs`: Dev-Server, Chromium, Kartenkacheln über Node):
  - `npm run e2e`: neues Spiel, selbst verkaufen, Läufer anheuern, im Handy bestellen, speichern, laden,
    Autosave nach dem Neuladen; Desktop und Handy.
  - `npm run playthrough`: Der Bot spielt im Browser eine Session (Standard 8 Spieltage ≈ 20 Minuten bei 2x) und
    macht Screenshots der wichtigen Momente. Belege der Integration liegen in `docs/integration/`.
  - `npm run screenshot`: Desktop und Handy nach `screenshots/`. Mit `--eval="window.koeln.session.sim.advance(480)"`
    springt die Uhr z.B. in die Nacht (Start 18 Uhr).
  - `npm run screenshot:phone`: alle Handy-Seiten (Startbildschirm, Nachrichten, Chat, Leute, Kontakte, Einstellungen,
    Ereignisse, Meldungen, Geschäft, Panels, Island-Zustände) für Desktop und Handy-Bildschirm nach
    `screenshots/handy/`, mit festem Seed und pausiert (Vorher/Nachher vergleichbar). Optionen `--out`, `--scenes`,
    `--sizes`, `--time`, `--appearance=light|dark`. Szenen und Ansichten stehen in `scripts/phone-scenes.mjs`.
  - `npm run audit:phone`: misst dieselben Seiten am laufenden Spiel: Zieltreffer ≥ 44 × 44 px, Schrift ≥ 11 px,
    Kontrast 4,5:1 bzw. 3:1 aus den berechneten Farben. Endet mit Fehlercode 1 bei Verstößen. Text auf Verläufen
    deckt `contrast.test.ts` ab.
