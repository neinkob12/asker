# Architektur

Stand: nach der Integration (Auftrag 20), Logistik mit echten Straßen (Auftrag 21), Kasse und Rechte Hand (Auftrag 24)
und dem aufgeräumten Handy (Auftrag 26). Kurzfassung und Regeln in
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
  messages: { contacts, list, hidden };   // hidden: gelöschte Chats (Kontakt → letzte ausgeblendete Nachricht)
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
| Geld (`wallet.ts`) | `wallet.balance(state, kind?)`, `canAfford`, `earn(ctx, amount, kind, reason, category)`, `pay(ctx, amount, kind, reason, category)` (false, wenn es nicht reicht), `lose` (höchstens was da ist), `convert(ctx, from, to, amount, fee, reason, feeCategory?)`; Kategorien `MONEY_CATEGORIES` (`MoneyCategory`, z.B. `'sales.street'`, `'wages.runner'`, `'loss.police'`), statt einer Kategorie auch `{ category, staffId?, spotId? }` | `wallet.changed` (mit `category`, `staffId`, `spotId`) |
| Journal (`journal.ts`) | `journal.add(ctx, text, 'info' \| 'good' \| 'bad', ref?)`, `journal.entries(state)` | `journal.added` |
| Nachrichten (`messages.ts`) | `messages.send(ctx, { contact, text, options?, expiresIn?, silent?, routine? })`, `thread`, `threads`, `unreadCount`, `get`, `contact`, `canAnswer`, `hasOpenDeadline`, `openRoutine`, `answerAs(ctx, { messageId, optionId, via, reply? })` (Antwort im Namen der Rechten Hand) | Befehle `messages.answer`, `messages.markRead`, `messages.markAllRead`, `messages.delete`, `messages.deleteAll`; Ereignisse `message.received`, `message.answered` (`via?`), `message.expired` |
| Spielende (`outcome.ts`) | `outcome.gameOver(ctx, 'bankrupt' \| 'killed', detail?)`, `outcome.win(ctx)`, `isOver`, `hasWon` | `game.over`, `campaign.won` |
| Uhr (`clock.ts`) | siehe oben | `clock.hourStarted`, `clock.dayStarted` |
| Format (`format.ts`) | `formatEuro`, `formatAmount`, `formatNumber`, `formatPercent` | |
| Geo (`geo.ts`) | `distanceMeters(a, b)`, `lerpLngLat(a, b, t)` | |

**Nachrichten:** Alle Figuren sprechen den Spieler über das Spiel-Handy an. Kontakt-IDs nach dem Muster
`'<art>:<id>'`: `gang:<id>`, `staff:<id>` (auch Leutnants und der Polizei-Kontakt), `supplier:<id>`,
`customer:<Stammkunde>`, `customer:area-<veedel>`, `dealer:<id>`. Kontaktarten (`ContactKind`): `customer`,
`supplier`, `gang`, `staff`, `police`, `other`. Eine Antwort-Option kann einen `command` tragen; beim Antworten
(`messages.answer`) wird er als Spieler ausgeführt. Schlägt er fehl, bleibt die Nachricht unbeantwortet.
`silent: true` stellt still zu (ungelesen, ohne Eintrag in der Mitteilungszentrale). Ein Banner mit Ton gibt es seit
Auftrag 26 ohnehin nur für Nachrichten mit Antwortfrist, der Rest zählt still am Badge. Gelöschte Chats bleiben im
Zustand: `messages.hidden[contactId]` ist die ID der letzten ausgeblendeten Nachricht; `thread`, `threads` und
`unreadCount` lassen alles bis dahin weg, und schreibt die Figur neu, ist der Chat wieder da (Kernschema 2, Migration
in `persistence.ts`). `routine: true` kennzeichnet eine Frage als **Routine**: Die Rechte Hand darf sie beantworten
(Lieferanfragen, Ware am Kai, Großhandel in ihrem Rahmen); alles andere ist **Chefsache** und bleibt beim Spieler.
Antwortet sie, steht die Antwort als Blase des Spielers mit `via: 'Rechte Hand'` im Chat (`messages.answerAs`).
Ältere Nachrichten fallen ab `MESSAGE_LIMIT` weg.

**Geld mit Kategorie:** Jede Buchung trägt eine Kategorie aus `MONEY_CATEGORIES` (`wallet.ts`: Bezeichnung, Gruppe
`income`/`expense`/`loss`/`transfer`, Symbol). Fehlt sie, landet die Buchung unter "Sonstiges" (`income.other` bzw.
`expense.other`). Mit `{ category, staffId, spotId }` lässt sich eine Buchung zusätzlich einem Spot oder einer Person
zuordnen (Verkauf am Spot, Lohn, Kaution), daraus rechnet `finance` die Ergebnisse pro Spot und pro Leutnant.
Geldwäsche bucht den gewaschenen Betrag als Umbuchung (`transfer`, kein Gewinn und kein Verlust) und die Gebühr
getrennt (`laundering`).

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
encounters → finance → goods → laundering → reputation → roads → suppliers → veedel → gangs → market → spots
→ customers → staff → hierarchy → logistics → recruiting → territory → police → weather
```

Bekannte Kanten, die keinen Zyklus bekommen dürfen: `territory → gangs` (Startverteilung), `staff → customers`
(Läufer bedienen nach dem Kunden-Tick), `police → territory`, `hierarchy/recruiting → staff`.
Weitere Import-Kanten nur zur Laufzeit (Funktionsaufrufe, kein `dependsOn`): `territory → hierarchy`
(Leutnant-Einfluss), `staff → police` (`addHeat`, `getHeat`), `hierarchy → market/recruiting/suppliers/customers`,
`customers → encounters` (Deals, die kippen), `police → staff` (`riskFactor`, `isLyingLow`), `police → finance/hierarchy/
logistics/goods` (Größe des Geschäfts), `finance → hierarchy/staff` (Ergebnis pro Leutnant, fällige Löhne),
`staff → hierarchy` (Ausfälle, die ein Leutnant oder die Rechte Hand regelt), `customers/logistics/
suppliers → roads` (Routen), `suppliers ↔ logistics` (Liegeplatz, Ware am Kai), `customers ↔ logistics` (bist du
unterwegs?), `suppliers → customers/territory/reputation` (Freischalt-Bedingungen). `logistics` hängt per `dependsOn`
an `goods`, `suppliers` und `staff` (alte Spielstände: Liegeplatz, wenn schon in Rotterdam bestellt wurde).


## Oberfläche (`src/ui/`)

Look "Nachtschicht": dunkel und gedämpft über der gedämpften Karte, siehe [`src/map/README.md`](../src/map/README.md). Das Spiel-Handy ist die Schaltzentrale und folgt den iOS-Mustern (Apple HIG): iPhone-Seitenverhältnis (`--phone-ratio` 0,49), Statusleiste mit Uhrzeit links, Dynamic Island in der Mitte und Empfang/WLAN/Akku rechts, Startbildschirm mit App-Raster und Dock, gruppierte Listen mit Icon-Kacheln, Large Title mit Übergang zur schmalen Titelleiste. Glas (`backdrop-filter`) gibt es nur auf der schwebenden Ebene (Statusleiste, Island, Dock, Fußleisten); Inhalte liegen auf ruhigen Flächen. **Eine Farbe hat eine Bedeutung** (`--cat-money`, `--cat-dirty`, `--cat-danger` …, je mit Hell-/Dunkel-Variante und geprüftem Kontrast). Plan, Ableitung aus der HIG und Prüfung: [`handy-design.md`](handy-design.md). Details zu Tokens, Bausteinen, Handy und Ton: [`src/ui/README.md`](../src/ui/README.md).

- **Look „Glas“ über der Karte** (Auftrag 24, Details in [`src/ui/README.md`](../src/ui/README.md)): HUD,
  Kartensteuerung, Marker, Überlagerungen und Dialoge über der Karte sind dunkles Glas mit Barlow/Barlow Condensed
  (`--hud-*`, `--spot-*`, `--font-hud*`). Sie halten sich an `--map-right` und folgen dem Ein- und Ausklappen des
  Handys mit derselben Feder (`--dock-*`), die Kamera der Karte auch (Padding in `GameMap`).
- **Shell** (`shell/`): Karte vollflächig. Darüber das HUD in drei Glas-Gruppen (Geld mit Heat, Uhr mit Wetter, Tempo
  und Menü, Kennzahl-Kacheln; `Hud.tsx`), die Kartensteuerung (Zoom/Norden, 3D, Ebenen, Köln) und die
  Überlagerungen der Module (Slot `map.overlay`). **Alles andere läuft über das Spiel-Handy**
  (`phone/PhoneFrame.tsx`): Tabs der Module sind Apps (`tab:<id>`), Panels erscheinen als Seite im Handy, dazu die
  Handy-Apps, der Verlauf (`core.history`) und ein dringender Rat auf dem Startbildschirm. Desktop: Handy rechts fest angedockt, weggelegt eine Lasche am Rand. Handy-Bildschirm: Handy
  bildschirmfüllend unter dem HUD, in der Tasche eine Leiste unten mit Nächstem Schritt und Handy-Knopf. Dazu Suche
  (`Palette.tsx`, Strg/⌘+K) und der Hinweis beim Karten-Klick. Meldungen (`ui.toast`) erscheinen als Banner im Handy
  (einer sichtbar, Rest in der Warteschlange), nicht mehr über der Karte.
  Tastatur in `keys.ts`. Größe des Handys: `min(440px, (100dvh − 24px) × Seitenverhältnis)`, es fällt also nie aus
  dem Fenster; in kleinen Fenstern verkleinern Container-Queries (`container: phone`) Abstände und Kacheln.
- **Startbildschirm** (`phone/PhoneFrame.tsx`, seit Auftrag 26): schwarz, Statusleiste, ganz oben höchstens ein
  dringender Rat (`registerAdvisor` ab Priorität 80, wegwischbar), das App-Raster mit genau sechs Apps (`HOME_ORDER`:
  Kasse, Reviere, Gangs, Personal, Geldwäsche, Einstellungen) und ein **Dock** (`DOCK`: Nachrichten, Lieferanten,
  Personal, Kasse). Keine Heute-Zeile, keine Kennzahlen, keine Skyline mehr. Apps und Tabs mit `hidden: true` fehlen im
  Raster und in der Suche, bleiben aber per `openPhone` erreichbar. Ein Tab-Bar-Muster gibt es bewusst nicht: jede App
  ist eine eigene Seite mit Zurück-Knopf, das Dock ersetzt die Tab-Leiste (Begründung in `handy-design.md`).
- **Statusleiste und Island:** `phone/PhoneFrame.tsx` (`StatusBar`, Grid mit drei Spalten: Uhrzeit | Island | Symbole)
  hält die Sicherheitszone ein, die Island verdeckt nichts. Die Island zeigt Fristen nur in Stunden
  (`islandCountdown(minutes)` in `phone/islandModel.ts`: "2 Std.", unter einer Stunde "< 1 Std.").
- **Seiten im Handy** (`phone/PhoneScreen.tsx`): Large Title, der beim Scrollen in die Titelleiste wandert
  (`is-collapsed`), Zurück-Knopf als Glas-Taste, Fußleiste mit Aktionen als Glas-Blatt. Zieltreffer sind im Handy
  mindestens 44 × 44 px.
- **Laufzeit** (`runtime.ts`): `UiRuntime` hält den reinen UI-Zustand (`UiState`: Panel, Dialog, Tab, Handy,
  Tempo, `camera`, `overlay`, `vibration`, `moreNotifications`, `notification`, `picking`) und die `UiApi`.
  Banner-Regel (Auftrag 26): `toast(text, kind, { urgent? })` erscheint als Banner nur bei `'bad'`/`'warn'` oder
  `urgent: true`, Routine landet still in `ui.alerts` (Verlauf); `notify({ …, urgent: false })` geht nur in die
  Mitteilungszentrale. „Mehr Benachrichtigungen“ (pro Gerät) schaltet alles wieder auf Banner. `runtime.stats.banners`
  zählt. Neuzeichnen nach
  Simulationsschritten, gedrosselt auf ca. 10 Mal pro Sekunde; in der Pause nur bei UI-Änderungen.
- **Hooks** (`hooks.ts`): `useGame()` → `{ state, dispatch }`, `useUi()` → `UiApi` + `state`, `useSession()`.
- **UiApi:** `dispatch` (Toast bei Fehler), `openPanel/closePanel`, `openDialog/closeDialog`, `toast(text, kind, options)`,
  `notify({ title, text, icon, appId, params, sound, urgent })`, `openPhone(appId?, params?)/closePhone`, `selectTab`
  (öffnet den Tab als App im Handy), `openSection(id)`, `togglePalette`, `setPopover`,
  `dismissToast`, `markAlertsRead`, `clearAlerts`, `setSpeed`, `togglePause`, `pickLocation(prompt)` (nächster Karten-Klick als Promise),
  `cancelPick`, `flyTo`, `flyToKoeln`, `flyToEuropa`, `setCameraMode`, `toggleCamera`, `setOverlay`,
  `setVibration`, `setMoreNotifications`, `zoomIn`, `zoomOut`, `resetNorth`.
- **Registries** (`registry.ts`, alle über `src/ui/index.ts`):

| Funktion | Wofür | Einträge |
| --- | --- | --- |
| `registerHudItem({ id, order, placement?, icon?, component })` | Kennzahl (`placement`: `main` in der Geld-Kapsel des HUD, `more` als Kachel oben rechts über der Karte (am Handy-Bildschirm flach unter Geld und Uhr), `time` in der Uhr-Kapsel, `alert` als Warnung im HUD). `HudPill` mit `details` klappt beim Drüberfahren eine Glas-Karte auf | Geld (10, Klick öffnet die Geldwäsche), Lager (20, mit Aufstellung und „Bestellen“), Heat (30), Ruf · Reviere (40, Leiste 0–100 mit Stufen und Revierzahl), offene Konfrontation (50) |
| `registerTab({ id, title, order, icon?, layout?, shortcut?, component?, badge?, hidden? })` | Bereich als App im Handy (`tab:<id>`); ohne `component` zeigt er den Slot `tab:<id>`; `layout: 'rows'` zeigt jede Card als tippbare Zeile; `hidden` hält ihn vom Startbildschirm fern | Reviere (20, mit Slot `tab:territory` für Spots, Ruf, Polizei), Personal (30, mit Slot `tab:staff` für „Leute finden“), Gangs |
| `registerSlot(name, { id, order, component, title?, icon?, color? })` | Abschnitt in einem Slot | `map.overlay` (über der freien Kartenfläche: Razzia-Banner, Tracking-Karte der Lieferung), `tab:territory` (Spots, Ruf, Polizei), `tab:staff` (Leute finden), `spots.spotPanel` (Kunden mit „Hier hinstellen“, Preise, Läufer, Leutnant), `veedel.veedelPanel` (Revier, Polizei, Leutnant), `staff.profile`, `goods.warehouse` (Lager-Seite: Hafen, Umlagern, Lager kaufen, Markt), `finance.app` (unten in der Kasse: Kundschaft), `phone.home` (Widgets), `core.settings` (eigener Abschnitt in den Einstellungen mit `title`, `icon`, `color`: Wetter, Anfragen) |
| `registerPanel({ id, title, component })` | Detailansicht als Seite im Handy, `ui.openPanel(id, props)` | `spots.spot`, `veedel.veedel`, `goods.warehouse`, `logistics.port` (Hafen), `staff.profile`, `hierarchy.lieutenant`, `hierarchy.rightHand`, `market.overview`, `finance.category` |
| `registerDialog({ id, component, pausesGame?, dismissable?, area?, lockPhone? })` | Dialog, `ui.openDialog(id, props)`; `area: 'map'` liegt nur über der Kartenfläche (Darstellung mit `MapDialog`, am Handy-Bildschirm ein Blatt), `lockPhone` (Standard wie `pausesGame`) dunkelt das Handy ab und sperrt es | `core.newGame`, `core.saves`, `core.gameOver`, `core.won`, `encounters.encounter` (Karte, pausiert, sperrt das Handy), `police.raidReport` (Karte), `territory.takeover` (Karte, pausiert, nur beim ersten Mal je Veedel), `gangs.attack` |
| `registerMapLayerOption({ id, order, group, label, icon?, toggle?, active, select })` | Eintrag im Menü „Ebenen“ der Kartensteuerung | Veedel nach Kontrolle oder Heat (territory), Überwachung (Kern) |
| `registerLiveActivity({ id, activities })` | Live-Aktivität in der Dynamic Island des Handys (`LiveActivity`: `priority`, `icon`, `tone`, `leading`, `trailing`, `title`, `detail`, `progress`, `open`) | Überfall, Razzia, Heat, Gang-Vorstoß, Chat-Frist, Auftrag, Kurier, Lieferung, Ware am Kai, Fahrt/Kontrolle, du am Spot, Umsatz heute |
| `registerPhoneApp({ id, name, icon, order, color?, chrome?, component, badge?, hidden? })` | App im Spiel-Handy; `color` ist eine Bedeutungsfarbe (`money`, `dirty`, `danger`, `warn`, `place`, `goods`, `people`, `chat`, `sky`, `law`, `media`, `system`, `log`, `brand`) oder eine CSS-Farbe (dann wird die Schrift automatisch lesbar gewählt); `badge(state, ui)` liefert die Zahl auf dem Icon; `hidden` nur per `openPhone` | Nachrichten (Mint), Lieferanten (Waren), Kasse (Geld), Geldwäsche (Geld), Einstellungen (Grau: Ton & Musik, Anzeige, Wetter, Anfragen, Verlauf, Spiel), Verlauf (Papier, versteckt) |
| `onGameEvent(type, id, (payload, ui, state) => …)` | Reaktion auf Ereignisse (Toast, Dialog, Effekt) | Game Over, Sieg, neue Nachricht (Banner), Toasts der Module, Karten-Effekte |
| `registerAdvisor({ id, advise(state) })` | Empfehlung (`Advice`: priority, icon, title, cost?, action?, highlight?): ab Priorität 80 als dringende Zeile auf dem Startbildschirm, sonst in der Suche und in der Leiste am Handy-Bildschirm | Antworten (Kern, 90 nur mit Frist), Verkauf (an den Spot stellen oder alle bedienen) und Läufer (Spots, Personal), Nachschub (Lieferanten), Ware am Hafen abholen, Liegeplatz (Logistik), Geldwäsche, Löhne (Kasse), Rechte Hand, Kampagnenziel |
| `registerSearch({ id, label, order, items(state) })` | Einträge der Suche (Strg/⌘+K) | Spots, Veedel, Leute, Gangs |
| `registerGameStat({ id, order, icon, label, value(state) })` | Kennzahl auf dem Game-Over- und Sieg-Bildschirm | Tage, Schwarzgeld, Veedel, Kunden, Team |
| `soundOnEvent(type, sound, { when?, throttleMs?, volume? })` | Ton zu einem Ereignis | Kasse, Nachricht, Sirene bei Razzia/Kontrolle, Warnton bei Konfrontation, Lieferung, Game Over, Sieg |

- **Bausteine** (`components/`): `Button`, `IconButton`, `SegmentedControl`, `Select`, `Card`, `Hint`, `Empty`
  (mit `action`), `KeyValue`, `Stat`, `Badge`, `ProgressBar`, `List`/`ListItem`, `Tabs`, `Dialog`, `Icon`,
  `IconChip` (Icon-Kachel mit Farbverlauf, `solid`, `shape="tile"`), `Tag` (mit `category`), `Avatar` (Porträt oder
  Initialen, `tone`), `Toggle` (iOS-Schalter 51 × 31), `Slider`. Seit Auftrag 27: `Chip`/`Chips` (Eigenschaft als
  kleine Fläche in der Bedeutungsfarbe, bricht nie um), `Disclosure` („Mehr dazu“), `Group` mit Unterlage, farbiger
  Kopfzeile, `value`, `collapsible` und `more`, `ItemContent` mit `tags`. Props werden nur erweitert, nie gebrochen.
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
  `customers.deliveries` (Kurier/Auto vom nächsten Lager über die Straßen zum Kunden), `spots.markers` (Achteck-Schilder
  mit Lichtkegel und Plakette, leise Hotspots, Hover-Karte), `police.raidArea` (Veedel nach einer Razzia rot),
  `territory.takeover` (übernommenes Veedel leuchtet gold), `logistics.routes` (Strecke laufender Fahrten), `weather.sky`.
- Fahrzeuge fahren nicht mehr Luftlinie: Die Wege kommen aus dem Modul `roads` (Kölner Straßennetz aus
  OpenStreetMap über Overture Maps, A*-Routen), dieselben Routen bestimmen in der Simulation die Fahrzeiten.

## Module

Alle Module sind ausgebaut. Die Kopfkommentare der `index.ts` beschreiben jeweils Verhalten und API genauer.

| Modul | Zustand (Version) | Öffentliche API (Auszug) | Befehle | Ereignisse |
| --- | --- | --- | --- | --- |
| `veedel` | statisch (1): 12 Veedel mit echten Grenzen (Offene Daten Köln), Kaufkraft, Polizeipräsenz, Dichte, Beschreibung, `startInfluence` | `allVeedel`, `getVeedel`, `veedelName`, `veedelAt(lng, lat)` (Punkt in Polygon), `neighborsOf`, `sharesBorder`, `getBoundary`, `veedelLinks` | | |
| `territory` | `influence`, `controller`, `lastSaleAt` (2) | `PLAYER_FACTION`, `CONTROL_THRESHOLD`, `LOSE_CONTROL_THRESHOLD`, `getInfluence`, `influenceIn`, `addInfluence`, `controllerOf`, `controlledBy`, `factions`, `factionName`, `factionColor`, `playerPresence`, `hasPlayerPresence`, `lieutenantInfluence`, `campaignProgress` | | `territory.controlChanged` |
| `police` | `heat`, `level`, Sperrzeiten, `tipOffs`, `plannedRaids` (mit `scope`, `spotId`), `majorRaid`, `majorReadyAt`, `tier`, `stats` (4) | `getHeat`, `addHeat`, `reportViolence`, `heatLevel`, `playerHeat`, `hottestVeedel`, `snitchOnGang`, `canSnitch`, `activeTipOff`, `plannedRaid`, `plannedRaidInfo`, `plannedMajorRaid`, `operationTier`, `operationFacts`, `nextTierHints`, `OPERATION_TIERS`, `RAID_SCOPES`, `getPoliceStats`, `arrestStaff`, `recordConfiscation` | `police.snitch` | `police.check`, `police.raidPlanned` (`scope`), `police.raid` (`scope`: `spot`/`veedel`/`major`, `veedelIds`; `empty` wenn niemand da war), `police.arrest`, `police.tipOff`, `police.heatLevelChanged`, `police.tierChanged` |
| `gangs` | `gangs[id]` (Geld, Leute, Ware, Feindseligkeit, Beziehung, Abkommen, Vorstoß), `priceFactors` (2) | `getGangs`, `getGang`, `getGangStatus`, `gangVeedel`, `veedelGang`, `gangPower`, `playerPower`, `isAtPeace`, `tributeAmount`, `ceasefireCost`, `protectionAmount`, `gangContact` … | `gangs.ceasefire`, `.payTribute`, `.refuse`, `.demandProtection`, `.collect`, `.releaseProtection`, `.ally`, `.attack`, `.acceptOffer` | `gang.pushStarted`, `gang.pushEnded`, `gang.escalated`, `gang.raidStarted`, `gang.diplomacyChanged`, `gang.busted` |
| `encounters` | `active`, `history`, je Konfrontation `mode` (3) | `startEncounter(ctx, request)` (mit `askPlayer`, `place`, `situation`, `stakes`, `effects`, `skipEffects`), `getEncounter`, `activeEncounters`, `pendingEncounter`, `availableActions`, `actionChance`, `briefingOptions` (Wege mit Kosten, ob sie gehen), `payoffCost`, `autoResolveEncounter`, `ENCOUNTER_KINDS` (mit `briefingOptions`), `ENCOUNTER_ACTIONS`, `PLAYER_STATS` | `encounters.join` (`mode`: self, crew, backup, payoff, tipoff, abandon; alt `present`), `.act`, `.auto` | `encounter.started`, `encounter.round`, `encounter.resolved` (`result` mit `relation`, `mode`) |
| `goods` | Posten pro Lager mit Qualität, Streckanteil, Einkaufspreis, eigene Lager `owned` (3) | `allProducts`, `getProduct`, `productName`, `getWarehouses` (eigene), `warehouseSites` (alle Standorte mit Preis), `isWarehouseOwned`, `nearestWarehouse(state, point, { productId?, amount? })`, `getStock`, `getLots`, `stockSummary`, `averageQuality`, `qualityTier`, `cutPreview`, `store`, `take` (mit `near`: nächstes Lager zuerst; → `taken`, `quality`, `cut`, `unitCost`), `cutLot` | `goods.cut`, `goods.buyWarehouse` (sauberes Geld) | `goods.stored`, `goods.taken`, `goods.cut`, `goods.warehouseBought` |
| `market` | `competition`, `pressure`, `prices` (2) | `referencePrice`, `averageReferencePrice`, `purchasingPowerFactor`, `supplyDemandFactor`, `getPressure`, `getCompetitionFactor`, `setCompetitionFactor`, `spotReferencePrice`, `getSpotPrice`, `hasOwnPrice`, `priceRatio`, `roundPrice` | `market.setPrice` | `market.competitionChanged`, `market.priceSet` |
| `suppliers` | `shipments` (`toPort` bei Schiffsware), `relations` (Vertrauen, Schulden), `unlocked`, `offered` (3) | `getSuppliers`, `getSupplier`, `isUnlocked`, `unlockRequirements` (Stand der Bedingungen), `canUnlock`, `shipmentsInTransit`, `shipmentProgress`, `deliveryLeg` (Schiff/Umladen/Straße, nur Darstellung), `RHINE_ROUTE`, `UNLOADING_PORT`, `CITY_APPROACH_SHARE`, `expectedArrival`, `cheapestPackagePrice`, `getRelation`, `supplierDiscount`, `creditLimit`, `availableCredit`, `isBlocked`, `availablePackages` (leer, solange gesperrt), `packagePrice` | `suppliers.order` (`onCredit`, `warehouseId`), `suppliers.repay`, `suppliers.unlock` | `shipment.ordered`, `shipment.arrived` (`atPort`), `shipment.problem`, `supplier.trustChanged`, `supplier.repaid`, `supplier.overdue`, `supplier.unlocked` |
| `customers` | `waiting`, `nextSpawnAt`, `stats`, `regulars`, `orders` (mit `fromWarehouseId`, `deliveredBy` `player`/`rightHand`), `self` (Spot, an dem du stehst), `directOrders` (4; Auftragsstatus zusätzlich `contested`) | `waitingAt`, `allWaiting`, `spotDemand` (aktuelle Nachfrage), `canServe`, `getSalesStats`, `getRegulars`, `getOrders`, `orderProgress`, `isPlayerDelivering`, `playerSpot`, `isPlayerAway`, `offerDelivery`/`offerWholesale` (Tests), Kundenentscheidung als reine Funktionen | `customers.serve` (`sellerId`), `.serveAll`, `.standAt`, `.setDirectOrders`, `.acceptOrder` (`by: 'player'` oder `'rightHand'`, alt `'courier'` = Spieler), `.declineOrder` | `sale.completed` (`street`/`delivery`/`wholesale`), `customer.arrived`, `customer.left`, `customer.missed`, `customer.regularGained/Lost`, `customers.selfMoved`, `order.received/accepted/finished` |
| `spots` | `unlocked`, `custom` (3; jedes Veedel hat mindestens zwei vorgegebene Spots, Auftrag 28) | `getSpots` (aktive), `getAllSpots`, `getSpot`, `isSpotActive`, `spotsInVeedel`, `lockedSpots`, `customSpots`, `canFoundSpotAt`; das Veedel eines Spots kommt aus `veedelAt` | `spots.unlock`, `spots.found` | `spots.unlocked`, `spots.founded` |
| `reputation` | `value`, `recent` (2) | `getReputation`, `changeReputation(ctx, delta, reason)`, `reputationDemandFactor`, `reputationLabel`, `reputationTier`, `reputationTiers`, `recentReputationChanges` | | `reputation.changed` |
| `laundering` | `batches` (mit `channel`), `unlocked` (3; drei Wege in `config.ts`: Kumpel mit Kiosk, Waschsalon, Bauunternehmer mit Gebühr, Dauer, Obergrenze, Heat-Risiko, Freischalten) | `getChannels`, `getChannel`, `isChannelUnlocked`, `channelFee`, `channelDuration`, `channelFree`, `canUnlockChannel`, `launderingFee`, `launderingDuration`, `launderingCapacity`, `amountInProgress(state, channel?)`, `getBatches`, `batchProgress`, `LAUNDERING_CHANNELS` | `laundering.launder` (`amount`, `channel?`; ohne Weg der billigste freie, große Beträge werden aufgeteilt), `laundering.unlock` (`channel`, `pay`: sauber oder schwarz) | `laundering.started`, `laundering.completed`, `laundering.unlocked` |
| `staff` | `members` (mit `jailSupport`), `former`, `hiding` (5; Rollen `runner`, `driver`, `security`, Spezialisten; `courier` nur als Altlast im Typ, alte Kuriere werden Läufer; Einsatz `delivery` hat nur die Rechte Hand, dazu `transport` und `office`) | `getStaff`, `getStaffMember`, `getStats`, `runnerAt`, `activeRunnerAt`, `securityAt`, `findAvailable`, `assign`, `setStatus`, `speedFactor`, `riskFactor`, `combatValue`, `defenseStrength`, `bonus`, `bailCost`, `dailyWages`, `effectiveWage`, `payrollDue`, `wageCategory`, `isAbsent`, `talkChance`, `staffContact`, `isLyingLow`, `lieLow`, `DRIVER_HIRE_COST`, `JAIL_WAGE_FACTOR`, `INJURED_WAGE_FACTOR` … | `staff.hireRunner`, `.hireDriver`, `.fire`, `.assign`, `.setWage`, `.bail`, `.setJailSupport`, `.replace` (`fire?`), `.lieLow` | `staff.hired`, `.left`, `.statusChanged`, `.assigned`, `.levelUp`, `.bailed`, `.betrayed`, `.raidWarning`, `.wentUnderground` |
| `hierarchy` | `posts` nach Mitarbeiter (Spots, Einstellungen mit Bestellregeln, Team, Ausfälle, Protokoll), `rightHand` (Einstellungen mit Aufgaben, Erfahrung `xp`, Erledigtes `done`, Bericht), `orderTemplate` (4) | `getPost`, `getLieutenants`, `getLieutenantIds`, `isLieutenant`, `lieutenantOfSpot`, `lieutenantSpots`, `lieutenantVeedels`, `lieutenantsInVeedel`, `teamOf`, `teamLeadOf`, `handlesAbsence`, `canBeLieutenant`, `checkSpots`, `lieutenantDemand`, `lieutenantSatisfaction`, `homeWarehouse`, `orderRuleLabel`, `ruleStock`, `isPortSupplierAllowed`, `getRightHand`, `canBeRightHand`, `rightHandOffered`, `rightHandSatisfaction`, `payrollReserve`, `rightHandBudgetLeft`, `absenceHandled`, `buildReport`, Aufgaben: `RIGHT_HAND_TASKS`, `isTaskUnlocked`, `isTaskActive`, `rightHandRank`, `rightHandRankProgress`, `rightHandDriver`, `rightHandOrderLimit`, `rightHandSpeedFactor`, `rightHandHandlesOrders`, `restockBudgetLeft`, `describeDone`; alt: `getLieutenant(veedelId)`, `lieutenantVeedel` | `hierarchy.appoint` (`staffId`, `spotIds`), `.setSpots`, `.dismiss`, `.configure` (`settings` mit `orderRules`, `onAbsent` …), `.appointRightHand`, `.dismissRightHand`, `.configureRightHand` (auch Aufgaben und ihre Regeln) | `hierarchy.appointed` (`spotIds`), `.dismissed`, `.configured`, `.spotsChanged`, `.rightHandAppointed`, `.rightHandDismissed`, `.dailyReport`, `.rightHandRankUp` |
| `finance` | `days`: Tagesbücher der letzten 30 Tage (Kategorien, pro Spot, pro Leutnant; Buchungstexte nur sieben Tage) (1) | `currentDay`, `bookDay`, `dayReport(state, daysAgo)`, `periodReport(state, days)`, `dailyProfits`, `categoryLines`, `spotResult`, `spotResults`, `lieutenantResult`, `wageRunway`; Bilanz (Auftrag 27): `PERIODS`, `periodSpan`, `balance(state, period, filter)` mit `FinanceFilter` (ganz Köln, Veedel, Spot, Leutnant), `balanceHistory`, `explainReport` | | |
| `quests` | `index`, `progress`, `done`, `skipped`, `title` (1). Peter (Kontakt `quest:peter`) schickt 26 Quests in fünf Kapiteln der Reihe nach (`config.ts`: `QUESTS`, `CHAPTERS`); Fortschritt über Ereignis-Zähler (`count`), ein Maß am Zustand (`measure`) oder eine Serie voller Stunden (`streak`). Belohnungen: Ware, Geld (schwarz/sauber), Ruf, weniger Heat, Erfahrung und Loyalität fürs Team, Einfluss, Titel | `currentQuest`, `questProgress`, `completedQuests`, `questTitle`, `chapterName`, `rewardText`, `QUESTS`, `CHAPTERS`, `PETER` | `quests.skip` | `quest.started`, `quest.completed` |
| `leaderboard` | `peakWorth`, `peakVeedel` (1). Merkt sich das höchste Vermögen im Durchgang; die Oberfläche schickt das Ergebnis an `api/leaderboard.ts` (Vercel Function mit Upstash Redis) bei Game Over, Sieg und zu jedem Spieltag | `netWorth`, `getRecord`, `runSummary` | | |
| `recruiting` | Bewerber-Pool und Kontakte (2; Pool größer mit Veedeln und Ruf, `poolMax`) | `getCandidates`, `getCandidate`, `getPool`, `getContacts`, `searchReadyAt`, `poolMax`, `searchPreview(state, role?)`, `SEARCH_ROLES` | `recruiting.hire`, `.decline`, `.search` (`role?`: Läufer, Fahrer, Sicherheit) | `recruiting.candidateArrived`, `recruiting.hired`, `recruiting.candidateLeft` |
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
  Lieferdienst fährt im nächsten Lager mit der Ware los. Ab Händler durchsucht eine Razzia eigene Lager im Veedel mit
  (25 % des Bestands dort, bei einer Großrazzia 50 %), Verteilen auf mehrere Lager lohnt sich also.
- **Selbst verkaufen:** Du kannst dich an einen Spot stellen (`customers.standAt`) und bedienst dort automatisch
  (10 Minuten pro Kunde), bis du weggehst. Während du selbst ausfährst oder abholst, wartet der Spot.

- **Verkauf** (`sale.completed`): Einfluss im Veedel (territory, drängt die stärkste Gang zurück), Heat (police,
  mal Polizeipräsenz und `riskFactor` des Verkäufers), Ruf (customers über reputation), Preisdruck (market),
  Umsatzverlust und Feindseligkeit der Gang (gangs), Erfahrung (staff, hierarchy), Geld-Popup auf der Karte.
- **Gangs:** drücken die Preise, wo du ihnen Konkurrenz machst (`setCompetitionFactor`, Preiskrieg ab
  Feindseligkeit 50), eskalieren per Handy (Warnung, Drohung mit Forderung), überfallen Spots, Auftragsfahrten der
  Rechten Hand und Lager
  (Konfrontation `raidDefense`, Verletzte und Tote über `setStatus`), stoßen in Veedel vor und verteidigen ihre.
  Je mehr Veedel du hältst, desto öfter drängen sie in dein Revier und desto teurer wird Schutzgeld.
- **Geldbuch** (`finance`): hört auf `wallet.changed` und `sale.completed` und führt pro Tag (Mitternacht gehört zum
  Vortag) Summen nach Kategorie, die größten Gründe, Umsatz/Wareneinsatz/Löhne pro Spot und pro Leutnant. Die
  Kassen-App im Handy zeigt daraus Gewinn und Verlust (Heute, Gestern, 7 Tage), den Verlauf, die Ergebnisse pro Spot
  und Leutnant und ob das Geld für die Löhne heute Nacht reicht (`wageRunway`). Die Polizei liest daraus den
  Umsatz pro Tag (Größe des Geschäfts), die Rechte Hand ihren Tagesbericht.
- **Haft und Ausfälle:** Wer sitzt, bekommt Stillhaltegeld (25 % des Lohns, `staff.setJailSupport`, Standard an);
  ohne verliert er schneller Loyalität und redet beim Rauskommen eher (Heat, Razzia-Gefahr). Verletzte bekommen den
  halben Lohn. Nach einer Festnahme fragt der Leutnant (oder die Person selbst) per Handy: ersetzen, Kaution,
  entlassen und ersetzen, abwarten (`staff.replace`, `staff.bail`). Ersetzen nimmt freie Leute oder heuert neu an;
  der Ausgefallene ist danach frei. Wer einen Leutnant hat, lässt ihn nach seiner Regel entscheiden (`onAbsent`:
  warten, ersetzen, nach N Tagen entlassen und ersetzen, sofort entlassen und ersetzen; fehlen Leute oder Budget, versucht er es bei jedem Durchgang wieder), mit Rechter Hand regelt die das für Leute ohne Leutnant.
- **Leutnants:** führen bis zu drei Spots (auch in verschiedenen Veedeln, `hierarchy.appoint` mit `spotIds`), nicht
  mehr ein Veedel. Sie arbeiten über dieselben Befehle wie der Spieler: Preise und Vorsicht pro Spot, Läufer und
  Sicherheit anheuern (Budget pro Tag, `mayHire`), nachbestellen nach Bestellregeln (Produkt, Lieferant, Paket,
  Mindestbestand, Lager; ein Lieferant mit Liegeplatz nur, wenn `isPortSupplierAllowed`), Ausfälle regeln, bei
  Razzia-Warnung abtauchen. Einfluss (`lieutenantInfluence`) verteilen sie auf die Veedel ihrer Spots, mit Bonus, wenn
  mehrere Spots in einem Veedel liegen. Je mehr Spots, desto höher ihr Anspruch (`lieutenantDemand`). Alte
  Spielstände: Leutnant eines Veedels → Leutnant seiner (bis zu drei) Spots dort.
- **Rechte Hand:** Ab zwei Leutnants bietet sich jemand ab Level 4 mit Loyalität 50 an (`hierarchy.appointRightHand`,
  Einsatz `office`). Sie hält die Lohnreserve für zwei Nächte zurück (Leutnants geben nur aus, was darüber liegt),
  verteilt freie Leute auf leere Spots, regelt Ausfälle ohne Leutnant (Kaution ab Level 3 im Rahmen ihres Budgets),
  warnt vor Razzien und schickt jeden Morgen um 8 einen Tagesbericht (`hierarchy.dailyReport`): Ergebnis, Löhne,
  Ausfälle, Probleme und was sie erledigt hat. Mit Antworten "Kasse öffnen" und "Leute öffnen".
- **Rechte Hand als Auftragsfahrer mit Aufgaben (Auftrag 28, `hierarchy/tasks.ts`):** Kuriere gibt es nicht mehr;
  Lieferanfragen fährt nur die Rechte Hand (`customers.acceptOrder` mit `by: 'rightHand'`, Einsatz `delivery`, Auto
  über `roads`, eine Fahrt zur Zeit, schneller mit Tempo-Wert und Stufe; Gang-Überfälle treffen sie unterwegs, bei
  Haft platzt die Lieferung). Ohne Rechte Hand liefert der Spieler selbst. Ihre Aufgaben sind einzeln schaltbar und
  nach **Stufe** frei (1 bis 5 aus Erfahrung als Rechte Hand: pro erledigter Aufgabe und gutem Tagesbericht, Werte in
  `hierarchy/config.ts`): **Aufträge und Handy** (Stufe 1, Regeln: Betrag bis X, auch von der Stufe begrenzt, nur
  eigene Reviere; sie sagt im Chat zu, was sie nicht schafft bleibt beim Spieler), **Hafen abholen** (Stufe 1, freier
  Fahrer der Logistik; dann gilt `isPortSupplierAllowed` und Leutnants bestellen auch beim Hafen), **Nachbestellen für
  ganz Köln** (Stufe 2, Bestellregeln wie die Leutnants, eigenes Tagesbudget, Hauptlager), **Personal** (Stufe 3,
  Bewerber für leere Spots ohne Leutnant, Ausfälle, bei denen ein Leutnant feststeckt), **Großhandel** (Stufe 4, Deals
  bis Betrag X), **Geldwäsche** (Stufe 4, über X Schwarzgeld einen Anteil des Überschusses). Alles läuft über
  `ctx.dispatch(…, { actor: 'staff:<id>' })` mit bestehenden Befehlen. Fehler: wenig Vorsicht bringt Umwege, wenig
  Loyalität lässt sie selten etwas abzweigen (`loss.betrayal`). Mit allen Aufgaben an läuft Köln ohne Spieler
  (`src/playtest/autopilot.test.ts`). Lieferanfragen kommen seltener (`DELIVERY_CHANCE_PER_HOUR` 0,09, höchstens zwei
  offen, 150 Minuten Frist), mit Rechter Hand auf "Aufträge und Handy" etwas öfter (Faktor 1,5), auch ohne
  eingeschaltete Direktanfragen.
- **Nachfrage:** Uhrzeit, Wochentag (`WEEKDAY_DEMAND` und Kundentypen), Wetter (`weatherDemandFactor`, Straße
  vs. Lieferdienst), Ruf und Preis.
- **Polizei:** Heat aus Verkäufen und Gewalt. Sie sinkt pro Stunde um einen festen Wert plus einen Anteil der
  aktuellen Heat (`HEAT_DECAY_PER_HOUR`, `HEAT_DECAY_SHARE_PER_HOUR`), pendelt sich also bei gleichem Geschäft ein.
  Kontrollen (mit Polizeiflucht), geplante Razzien
  (`police.raidPlanned` → 3 Stunden später). Wie hart sie durchgreift, hängt an der Größe deines Geschäfts
  (`operationTier`, mit Hysterese, `police.tierChanged`): **Kleindealer** (seltene Razzien, nur an einem Spot, Lager
  bleiben unberührt), **Händler** (ab einem Veedel, 4 besetzten Spots, 5 Leuten, einem Leutnant, Liegeplatz, zwei
  Lagern oder 6.000 € Umsatz am Tag: Razzien im ganzen Veedel mit Lagern), **Großhändler** (ab 6 Veedeln mit 6
  Leuten oder 8 Spots mit Liegeplatz und zwei Lagern: mehr Heat pro Verkauf, häufigere Razzien und Großrazzien in bis
  zu vier Veedeln zugleich mit einem Tag Vorlauf). Beute anteilig (`RAID_SCOPES`): Ware am Ort, Lagerbestand,
  Schwarzgeld. Der Polizei-Kontakt (staff, Bonus `raidWarning`) warnt per Handy mit der Antwort "Leute abziehen"
  (`staff.lieLow`), vor einer Großrazzia immer; wer abgetaucht ist, verliert bei der Razzia nichts.
- **Konfrontationen** nutzen die echten Werte der Beteiligten (Tempo, Vorsicht, Stärke, Charisma), bringen
  Erfahrung und kosten Loyalität. Anlässe: Überfall abwehren, Polizeiflucht, Schulden eintreiben, Deal kippt
  (Gang-Angebote und Großhandel), Überfall auf einen Gang-Spot. Im Briefing wählt der Spieler einen Weg (je Anlass
  `briefingOptions`): selbst hin, Leute machen lassen, Verstärkung (freie Leute fahren hin, Start-Lage besser),
  sofort freikaufen (Erfolg, Beziehung zur Gang sinkt, gangs wendet `result.relation` an), anonym die Bullen rufen
  (Rückzug, Heat, etwas Ware weg) oder Ware retten und den Spot räumen (Rückzug, die Kasse ist weg).
- **Löhne:** Wer um Mitternacht nicht bezahlt werden kann, ist sauer und schreibt; am zweiten Tag ohne Lohn oder
  unter Loyalität 30 kündigt er. Fällig ist `payrollDue` (Haft und Verletzung anteilig); die Kasse warnt, wenn das
  Schwarzgeld nicht mehr für zwei Nächte reicht.
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
- Nach Auftrag 24 (Stellschrauben: `staff/config.ts` `JAIL_WAGE_FACTOR`, `INJURED_WAGE_FACTOR`;
  `hierarchy/config.ts` `LIEUTENANT_DEMAND_BY_SPOTS`, `DEFAULT_SETTINGS`; `territory/config.ts`
  `LIEUTENANT_INFLUENCE_PER_HOUR` 0,08, `LIEUTENANT_CLUSTER_BONUS`; `police/config.ts` `DEALER_UP`, `KINGPIN_*`,
  `RAID_CHANCE_BY_TIER`, `SALE_HEAT_BY_TIER`, `RAID_SCOPES`, `MAJOR_RAID_*`). `npm run balance` zeigt zusätzlich den
  Geldfluss nach Kategorie, den Kontostand an Tag 1–7 und einen vorsichtigen Bot (`CAREFUL_BOT`: zwei Läufer, kein
  Ausbau, keine Kaution). Der Bot ernennt Leutnants mit Spots und ab etwa Tag 6–9 eine Rechte Hand. 16 Seeds,
  50 Tage: erstes/drittes/fünftes Veedel im Median an Tag 7/9/35 (vorher 7/12/34, fünf Veedel bei 14 statt 12 von 16
  Seeds), Umsatz pro Tag in Tag 6–15 im Schnitt 4.780 € (vorher 4.190 €), in Tag 16–30 5.160 € (vorher 5.510 €), kein
  Sieg innerhalb von 50 Tagen (vorher 2), keine Pleite. Der vorsichtige Bot hat an Tag 5 rund 4.100–6.300 € gespart,
  an Tag 7 6.700–10.300 € und an Tag 10 5.400–11.300 € (vor Auftrag 24, 6 Seeds: 8.900–12.900 €; ab Tag 7 hält er
  meist ein Veedel und zählt als Händler). Wichtig für die Rechte Hand: Hielte sie auch beim Nachschub die Löhne für
  zwei Tage zurück, liefen bei knapper Kasse die Spots leer (6 von 16 Seeds pleite), deshalb gilt für Ware nur eine
  Nacht (`PAYROLL_RESERVE_DAYS_ORDERS`).

- Auftrag 24 (neue Wege im Briefing, Überfall per Handy mit Verhandeln und Freikaufen; 40 Tage, 6 Seeds): Der Bot
  wählt weiter „Leute machen lassen“ und würfelt aus. Vorher/nachher fast gleich (Veedel nach 40 Tagen 2/3/5/4/4/3 →
  3/4/5/Sieg an Tag 40/4/3, Umsatz T6–15 unverändert). Gezielt gemessen (300 Überfälle, nur Leute vor Ort,
  ausgewürfelt): Erfolg 26 → 45, Rückzug 122 → 134, verloren 152 → 121, Verletzte oder Tote in 193 → 144 Fällen.
- Polizei entschärft (Köln ist der Einstieg): Heat pro Verkauf je Stufe 0,4 / 0,5 / 0,6 (vorher 1 / 1 / 1,8), Abbau
  0,4 pro Stunde plus 4 % der Heat (vorher fest 0,7), Großhändler erst ab 6 Veedeln (vorher 4). Gemessen (Bot,
  4 Seeds): bis Tag 16 höchstens 1–2 Flammen im HUD (vorher 5 ab Tag 6–8), 0–1 Razzien statt 10–14, 0–6 Kontrollen
  statt 17–28; danach meist 2–4 Flammen. 16 Seeds, 50 Tage: Köln übernommen bei allen Seeds an Tag 21–28 (vorher bei
  keinem), fünf Veedel im Median an Tag 17 (vorher 32), Umsatz Tag 16–30 im Schnitt 11.350 € (vorher 5.300 €), keine
  Pleite. Der vorsichtige Bot hat an Tag 10 rund 14.000–17.000 €.

- Auftrag 28 (Spots in jedem Veedel, halb so viele Lieferanfragen, Rechte Hand als Auftragsfahrer mit allen Aufgaben
  beim Bot; 30 Tage, 3 Seeds, vorher = `origin/main`): Sieg an Tag 23/26/25 → 19/20/21, fünf Veedel an Tag 16/18/17 →
  15/14/16, Umsatz pro Tag Tag 6–15 5.800/6.060/5.390 € → 7.180/8.660/6.340 €, Tag 16–30 10.900/12.140/12.070 € →
  12.420/11.390/11.920 €, Razzien 1/0/0 → 0/0/0, Kontrollen 4/5/4 → 3/2/2, keine Pleite. Lieferanfragen pro Tag (Bot,
  20 Tage, Direktanfragen an): 5,3–5,6 → 2,6–2,8 ohne Rechte Hand, 3,3–4,5 mit Rechter Hand auf "Aufträge und Handy"
  (sie fährt davon 55–91 in 20 Tagen selbst). Der vorsichtige Bot ist unverändert (gleiche Zahlen Tag 1–10).

## Qualität

- `npm run check` = Typecheck + `npm run lint` (Biome + `scripts/check-boundaries.mjs`) + Tests.
- CI (`.github/workflows/ci.yml`): Typecheck, Lint, Tests, Build, `npm run template:smoke` und in einem zweiten
  Job der Ende-zu-Ende-Test (`npm run e2e`, Chromium über `playwright-core install`).
- Kern-Tests: fester Zeitschritt (`loop.test.ts`, `sim.test.ts`), Determinismus, Befehle, Ereignisse,
  Speichern/Laden mit Migration und Hardcore (`persistence.test.ts`), Game Over, Nachrichten.
- Zusammenspiel (`src/playtest/`): `endings.test.ts` (Pleite, Tod, Sieg, Normal, Hardcore mit allen Modulen),
  `balance.test.ts` (Bot, siehe oben), `determinism.test.ts` (gleicher Seed und Bot = gleiche Ereignisse und gleicher
  Zustand, Speichern und Laden mitten im Spiel ändert den Verlauf nicht).
- Browser (`scripts/`, gemeinsame Hilfen in `browser.mjs`: Dev-Server, Chromium, Kartenkacheln über Node):
  - `npm run e2e`: neues Spiel, selbst verkaufen, Läufer anheuern, im Handy bestellen, Kasse öffnen, Leutnant mit
    zwei Spots ernennen, speichern, laden, Autosave nach dem Neuladen; Desktop und Handy.
  - `npm run playthrough`: Der Bot spielt im Browser eine Session (Standard 8 Spieltage ≈ 20 Minuten bei 2x) und
    macht Screenshots der wichtigen Momente, am Ende steht die Zahl der Banner im Handy (`--banner=alle` zählt wie vor
    Auftrag 26). Belege der Integration liegen in `docs/integration/`.
  - `npm run screenshot`: Desktop und Handy nach `screenshots/`. Mit `--eval="window.koeln.session.sim.advance(480)"`
    springt die Uhr z.B. in die Nacht (Start 18 Uhr). Mit `--scenes=alle` (oder Namen) die Szenen des Looks „Glas“
    (`scripts/glass-scenes.mjs`: Normalbetrieb in vier Tageszeiten, weggelegt, Spot-Hover, Orte, Konfrontation,
    Razzia, Lieferung, Übernahme) nach `screenshots/glas/`, auch als `npm run screenshot:glas`.
  - `npm run screenshot:phone`: alle Handy-Seiten (Startbildschirm, Nachrichten, Chat, Personal mit Leute finden,
    Reviere, Hafen, Geldwäsche, Einstellungen mit Verlauf, Panels, Island-Zustände) für Desktop und Handy-Bildschirm nach
    `screenshots/handy/`, mit festem Seed und pausiert (Vorher/Nachher vergleichbar). Optionen `--out`, `--scenes`,
    `--sizes`, `--time`, `--appearance=light|dark`. Szenen und Ansichten stehen in `scripts/phone-scenes.mjs`.
  - `npm run audit:phone`: misst dieselben Seiten am laufenden Spiel: Zieltreffer ≥ 44 × 44 px, Schrift ≥ 11 px,
    Kontrast 4,5:1 bzw. 3:1 aus den berechneten Farben. Endet mit Fehlercode 1 bei Verstößen. Text auf Verläufen
    deckt `contrast.test.ts` ab.
  - `npm run monkey:phone`: klickt zufällig (fester Seed, also wiederholbar) durch jede Handy-App und jeden Tab, in
    Desktop- und Handy-Größe, und meldet Fehler im Browser, Bedienelemente, die von etwas anderem verdeckt oder auch nach
    dem Scrollen nicht erreichbar sind, ungültige Zahlen (NaN, Infinity) im Spielstand und Sackgassen. Er wartet, bis
    Blätter eingeglitten sind, prüft nur die oberste Ebene (Blatt, Dialog) und bricht "Spot gründen" wie Esc ab. Optionen
    `--apps=a,b`, `--sizes=mobile,desktop`, `--steps=N`, `--seed=N`; endet mit Fehlercode 1, wenn etwas auffällt.
