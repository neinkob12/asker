# Architektur

Stand: nach der Integration (Auftrag 20), Logistik mit echten Straßen (Auftrag 21), Kasse und Rechte Hand (Auftrag 24),
dem aufgeräumten Handy (Auftrag 26) und den Aufträgen 23 und 30 bis 35 (zuletzt Leute und Gegner, Auftrag 34). Kurzfassung und Regeln in
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
| Nachrichten (`messages.ts`) | `messages.send(ctx, { contact, text, options?, expiresIn?, silent?, routine? })`, `messages.call(ctx, { contact, lines, options?, … })` (Anruf), `contactLook(contact)`, `contactVoice(contact)`, `thread`, `threads`, `unreadCount`, `get`, `contact`, `canAnswer`, `hasOpenDeadline`, `openRoutine`, `answerAs(ctx, { messageId, optionId, via, reply? })` (Antwort im Namen der Rechten Hand) | Befehle `messages.answer`, `messages.markRead`, `messages.markAllRead`, `messages.delete`, `messages.deleteAll`; Ereignisse `message.received`, `message.answered` (`via?`), `message.expired` |
| Spielende (`outcome.ts`) | `outcome.gameOver(ctx, 'bankrupt' \| 'killed', detail?)`, `outcome.win(ctx)`, `isOver`, `hasWon` | `game.over`, `campaign.won` |
| Uhr (`clock.ts`) | siehe oben | `clock.hourStarted`, `clock.dayStarted` |
| Format (`format.ts`) | `formatEuro`, `formatAmount`, `formatNumber`, `formatPercent` | |
| Geo (`geo.ts`) | `distanceMeters(a, b)`, `lerpLngLat(a, b, t)` | |
| Aussehen (`looks.ts`) | `Look` (Alter, Haut, Haare, Bart, Brille, Mütze, Kleidung, Extra), `lookFor(seed, name?, partial?)`, `personLook(name, age?)`, `lookTraits`, `describeLook`, `VoiceSpec`, `voiceFor`; fest aus einem Hash, nie `ctx.random()` | |

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
→ customers → staff → hierarchy → fleet → logistics → recruiting → territory → police → weather
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
an `goods`, `suppliers`, `staff` und `fleet` (alte Spielstände: Liegeplatz, wenn schon in Rotterdam bestellt wurde).
Seit Auftrag 32: `market → events/suppliers` (Marktereignisse, Marktbericht), `suppliers → market` (`purchaseIndex`),
`events → goods`, `hierarchy → market` (Preisgrenze der Bestellregeln), `quests → suppliers/police` (Vertrauen als
Belohnung, Größe des Geschäfts).


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
| `registerSlot(name, { id, order, component, title?, icon?, color? })` | Abschnitt in einem Slot | `map.overlay` (über der freien Kartenfläche: Razzia-Banner, Tracking-Karte der Lieferung), `tab:territory` (Spots, Ruf, Polizei), `tab:staff` (Leute finden), `spots.spotPanel` (Kunden mit „Hier hinstellen“, Preise, Läufer, Leutnant), `veedel.veedelPanel` (Revier, Polizei, Leutnant), `staff.profile`, `goods.warehouse` (Lager-Seite: Hafen, Umlagern, Lager kaufen, Markt), `goods.app` (Lager-App: Fahrzeuge), `suppliers.top` (Schiffs-Tracker), `finance.app` (unten in der Kasse: Kundschaft), `phone.home` (Widgets), `core.settings` (eigener Abschnitt in den Einstellungen mit `title`, `icon`, `color`: Wetter, Anfragen) |
| `registerPanel({ id, title, component })` | Detailansicht als Seite im Handy, `ui.openPanel(id, props)` | `spots.spot`, `veedel.veedel`, `goods.warehouse` (mit Platz und Ausbau), `goods.flow` (Warenfluss), `logistics.port` (Hafen, mit Liegeplatz-Ausbau), `staff.profile`, `hierarchy.lieutenant`, `hierarchy.rightHand`, `market.overview`, `finance.category` |
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
  Stimmen im Anruf (`src/audio/piper/`): das Sprachmodell Piper läuft in einem Worker im Browser (ONNX Runtime Web,
  espeak-ng als Phonemizer, beides WebAssembly aus dem Build; `vendor/` hält die espeak-Daten auf Deutsch eingedampft,
  `tools/trim-espeak-data.mjs`). Zwei Modelle (`PIPER_VOICES`: Männerstimme „Thorsten“, Frauenstimme „Kerstin“, je gut
  60 MB) kommen einmalig von Hugging Face in den Cache des Browsers (Cache API), laden beim ersten Klingeln von selbst
  (nicht im Datensparmodus) und stehen in Einstellungen › Ton zum Laden und Entfernen. Tonhöhe und Tempo einer Figur
  (`VoiceSpec` aus dem Kern) werden Wiedergabe-Tempo und `length_scale` (`piperParams`). Ablauf: Text in Sätze
  (`text.ts`), Satz zu Phonemen, Reparatur des espeak-Fehlers bei „ur“ („Hamburg“), IDs des Modells, ein Lauf pro Satz,
  Wiedergabe Satz für Satz (`playback.ts`), fertige Zeilen bleiben im Speicher (`engine.ts`). Läuft das Modell nicht
  (alter Browser, Download gescheitert), spricht die Sprachausgabe des Browsers (`voice.ts`). Im Gespräch
  (`audio.setCall`) sind Musik, Effekte und Geräusche aus, nur die Stimme bleibt (`busLevels`).
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
- Werkzeuge: `createVehicle`/`animateVehicle` (3D-Mini-Fahrzeuge und Schiffe, fill-extrusion, weich nachgezogen,
  höchstens 20 neue Geometrien pro Sekunde), `createFleet` (Verkehr als Kulisse: viele Fahrzeuge in einer WebGL-Ebene,
  20 Stellungen pro Sekunde, im Shader interpoliert), `ensureFigureImage` (SDF-Figur für Symbol-Ebenen), `addFootpath`
  (gepunktete letzte Meter), `onMapFrame`/`motion` (gemeinsamer Takt, Pause bei Tempo 0, verstecktem Tab und
  "Bewegung reduzieren"), `createHotspots` (pulsierende Heatmap-Blobs in Bernstein), `addTargetMarker`/`addHtmlMarker`
  (eckige dunkle Marker), Effekte `moneyPopup`, `blueLight`, `ping`, `flash` (auch gebunden an die aktive Karte über
  `mapEffects`), Farbhilfen `mixColor`, `pastel`. Messhilfe `?perf=1` (`perf.ts`, nur Dev-Build).
- **Optik bleibt aus der Simulation draußen** (Auftrag 31): Verkehr und Figuren lesen den Zustand nur und nutzen einen
  eigenen Zufall (`mulberry32` aus Spiel-Seed und Spieltag). Layer bekommen `update()` nur bei Änderungen (Spielzeit,
  Befehl, Panel, Handy, Kamera, Overlay, Verkehr). Budget und Messung: `src/map/README.md`, Abschnitt
  "Performance-Budget".
- Layer jetzt: `territory.veedel` (feine Veedel-Grenzen, Flächen schwach getönt nach Kontrolle oder Heat, nur auf dem Land, Name nur
  beim Überfahren), `suppliers.routes` (dezente Route, Lieferanten; Transporter aus Großstädten über die Autobahn an
  den Stadtrand und dann über echte Straßen ins Ziel-Lager, Hafenware als Schiff über den Rhein an den Liegeplatz im
  Niehler Hafen), `logistics.trips` (Hafen-Marker, Abholfahrten und Umlagern über echte Straßen, Blaulicht bei einer
  Kontrolle), `goods.warehouses` (alle eigenen Lager), `gangs.markers` (Hauptquartiere, Vorstöße),
  `customers.deliveries` (Kurier/Auto vom nächsten Lager über die Straßen zum Kunden), `spots.markers` (Bodenringe mit
  Geduld-Countdown, Zahlen-Blase und Plakette, leise Hotspots, Hover-Karte), `police.raidArea` (Veedel nach einer Razzia rot),
  `territory.takeover` (übernommenes Veedel leuchtet gold), `logistics.routes` (Strecke laufender Fahrten), `weather.sky`,
  `roads.traffic` (Verkehr als Kulisse im Netz der aktiven Stadt, Auftrag 31), `spots.people` (Läufer, Sicherheit,
  wartende Kunden und Streife als kleine Figuren an den Spots, Kneipen mit Bierglas an der Blase, Auftrag 31),
  `city.cards` (Glas-Karten aller Städte in der Deutschland-Ansicht: deine mit Statthalter, freie mit Dreh und Kontakt,
  Schablonen „bald“; Wechsel der Ansicht beim Zoomen), `city.autobahn` (das Autobahn-Netz, laufende Fahrten in Gold), `city.travel` (dein Auto auf der A1), `events.map` (Feuerwerk bei den
  Kölner Lichtern, Schiffe zum Hafengeburtstag).
- Deutschland-Ansicht (Auftrag 30 und 31): Unter `FAR_ZOOM` (9) setzt die Karte `is-far`, Marker mit `near: true`
  (Lager, Häfen, Gangs, Lieferziele, Veedel-Namen) sind dann aus. Herauszoomen aus der Stadt wechselt nach
  Deutschland (flach), Hineinzoomen über einer freien Stadt zurück in ihre Stadtansicht (`ui.enterView`). Kamera pro
  Stadt mit Neigung und Drehung aus `CITIES` (`view.pitch`, `view.bearing`).
- Fahrzeuge fahren nicht mehr Luftlinie: Die Wege kommen aus dem Modul `roads` (Kölner Straßennetz aus
  OpenStreetMap über Overture Maps, A*-Routen), dieselben Routen bestimmen in der Simulation die Fahrzeiten. Fahrzeuge
  halten an der Straße (`drive`), die letzten Meter sind ein Fußweg; `scripts/check-roads.mjs` (in `npm run lint`)
  prüft, dass alle Orte höchstens 60 m von einer Straße liegen. Schiffe fahren auf echten Wasserwegen (`shipRoute`).
  Quellenangabe unten rechts und in Einstellungen › Über: "© OpenStreetMap-Mitwirkende, Overture Maps Foundation".

## Module

Alle Module sind ausgebaut. Die Kopfkommentare der `index.ts` beschreiben jeweils Verhalten und API genauer.

| Modul | Zustand (Version) | Öffentliche API (Auszug) | Befehle | Ereignisse |
| --- | --- | --- | --- | --- |
| `veedel` | statisch (1): 12 Veedel mit echten Grenzen (Offene Daten Köln), 12 Hamburger Stadtteile und 12 Berliner Ortsteile (Overture Maps), Kaufkraft, Polizeipräsenz, Dichte, Beschreibung, `startInfluence`, `cityId`, `nightlife` | `allVeedel(cityId?)`, `veedelCity`, `nightlifeOf`, `getVeedel`, `veedelName`, `veedelAt(lng, lat)` (Punkt in Polygon), `neighborsOf`, `sharesBorder`, `getBoundary`, `veedelLinks` | | |
| `territory` | `influence`, `controller`, `lastSaleAt` (2) | `PLAYER_FACTION`, `CONTROL_THRESHOLD`, `LOSE_CONTROL_THRESHOLD`, `getInfluence`, `influenceIn`, `addInfluence`, `controllerOf`, `controlledBy`, `factions`, `factionName`, `factionColor`, `playerPresence`, `hasPlayerPresence`, `lieutenantInfluence`, `campaignProgress` | | `territory.controlChanged` |
| `police` | `heat`, `level`, Sperrzeiten, `tipOffs`, `plannedRaids` (mit `scope`, `spotId`), `majorRaid`, `majorReadyAt`, `tier`, `stats` (4) | `getHeat`, `addHeat`, `reportViolence`, `heatLevel`, `playerHeat`, `hottestVeedel`, `snitchOnGang`, `canSnitch`, `tipOffAgainstPlayer` (Auftrag 23: eine Gang schwärzt dich an), `activeTipOff`, `plannedRaid`, `plannedRaidInfo`, `plannedMajorRaid`, `operationTier`, `operationFacts`, `nextTierHints`, `OPERATION_TIERS`, `RAID_SCOPES`, `getPoliceStats`, `arrestStaff`, `recordConfiscation` | `police.snitch` | `police.check`, `police.raidPlanned` (`scope`), `police.raid` (`scope`: `spot`/`veedel`/`major`, `veedelIds`; `empty` wenn niemand da war), `police.arrest`, `police.tipOff`, `police.heatLevelChanged`, `police.tierChanged` |
| `gangs` | `gangs[id]` (Geld, Leute, Ware, Feindseligkeit, Beziehung, Abkommen, Vorstoß), `priceFactors`, seit Auftrag 23 `incidents` (Vorfälle mit Antwort), `intimidations`, `log` (letzte Aktionen gegen dich), `nextMethodAt`, `lastMethodAt`, Auftrag 34: `memories`, `rivalry`, `wars`, `warLog`, `lastWarAskAt`, `warCount` (5); Stimmen pro Gang in `texts.ts`, Methoden-Gewichte in `data.ts` (`traits.methods`) | `getGangs`, `getGang`, `getGangStatus`, `gangVeedel`, `veedelGang`, `gangPower`, `playerPower`, `isAtPeace`, `tributeAmount`, `ceasefireCost`, `protectionAmount`, `gangContact`, Auftrag 23: `intimidationFactor(state, spotId)`, `intimidationAt`, `gangActions`, `openIncidents`, `describeIncident`, `INCIDENT_CHOICES`, `runGangMethod`, `sendGangMessage` …; Auftrag 34: `gangMemories`, `memoryScore`, `memoryPriceFactor`, `remember`, `MEMORIES`, `allianceCost`, `GANG_RIVALRY`, `rivalry`, `rivalries`, `activeWars`, `pastWars` | `gangs.ceasefire`, `.payTribute`, `.refuse`, `.demandProtection`, `.collect`, `.releaseProtection`, `.ally`, `.attack`, `.acceptOffer`, `.respond`, `.supportWar` | `gang.pushStarted`, `gang.pushEnded`, `gang.escalated`, `gang.raidStarted`, `gang.diplomacyChanged`, `gang.busted`, Auftrag 23: `gang.burglary`, `gang.poachAttempt`, `gang.intimidation`, `gang.tipOff`, `gang.blackmail`, `gang.goodTurn`, `gang.incidentResolved`, Auftrag 34: `gang.remembered`, `gang.warStarted`, `gang.warEnded`, `gang.warSupported` |
| `encounters` | `active`, `history`, je Konfrontation `mode`, Zeiger `aggression`/`resolve`, Polizei-Uhr `clock`, `intent`, `foes` (Rollen), `stakes` (Schaden), `protect`, `brawl` (4) | `startEncounter(ctx, request)` (mit `askPlayer`, `place`, `situation`, `setting`, `stakes`, `effects`, `skipEffects`), `getEncounter`, `activeEncounters`, `pendingEncounter`, `availableActions`, `availableMoves`, `previewShift` (Pfeile vor dem Tippen), `actionChance` (Stärke 0–1), `briefingOptions`, `payoffCost`, `crewCandidates`, `suggestedCrew`, `specialMoves(member)` (Haken für Auftrag 34), `rightHandAdvice`, `chooseAuto`/`chooseMove` (Strategie), `autoResolveEncounter`, `ENCOUNTER_KINDS`, `ENCOUNTER_ACTIONS`, `ENCOUNTER_INTENTS`, `SPECIAL_MOVES`, `ADVICE_RULES`, `PLAYER_STATS` | `encounters.join` (`mode`: self, crew, backup, payoff, tipoff, abandon; alt `present`; `crew` bis zu drei), `.act` (`protect`), `.protect`, `.special`, `.auto` | `encounter.started`, `encounter.round` (Zeiger, Uhr), `encounter.resolved` (`result` mit `relation`, `parts`, `ending`, `mode`) |
| `goods` | Posten pro Lager mit Qualität, Streckanteil, Einkaufspreis, eigene Lager `owned`, Ausbau `upgrades`, Einlagern `storage`, Verbrauch `usage` (5; Auftrag 33) | `allProducts`, `getProduct`, `productName`, `getWarehouses` (eigene), `warehouseSites` (alle Standorte mit Preis), `isWarehouseOwned`, `nearestWarehouse(state, point, { productId?, amount? })`, `getStock`, `getLots`, `stockSummary`, `averageQuality`, `qualityTier`, `cutPreview`, `store`, `take` (mit `near`: nächstes Lager zuerst; → `taken`, `quality`, `cut`, `unitCost`), `cutLot`; Auftrag 33: `storeFitting` (nur, was passt, mit Rest), `warehouseLoad`, `warehouseCapacity`, `warehouseFree`, `fitsInto`, `warehouseModifiers` (Kapazität, `lossFactor` für Einbruch und Überfall, `raidFactor` für Razzien), `upgradeLevel`, `upgradeCost`, `storageStats`, `usagePerDay`, `usedProducts`, `servingWarehouse`, `stockWeight` | `goods.cut`, `goods.buyWarehouse` (sauberes Geld), `goods.upgradeWarehouse` (Regale, Tresor, Tarnung; sauberes Geld) | `goods.stored`, `goods.taken`, `goods.cut`, `goods.warehouseBought`, `goods.warehouseUpgraded`, `goods.storeRejected` |
| `market` | `competition`, `pressure`, `prices`, `index` (Preisindex Stadt → Ware, Auftrag 32) (3) | `referencePrice` (mal Preisindex der Stadt), `averageReferencePrice`, `purchasingPowerFactor`, `supplyDemandFactor`, `getPressure`, `getCompetitionFactor`, `setCompetitionFactor`, `spotReferencePrice`, `getSpotPrice`, `hasOwnPrice`, `priceRatio`, `roundPrice`; Auftrag 32: `priceIndex(state, productId, cityId?)` (Pfad mal Marktereignisse, 0,85–1,2), `driftIndex`, `purchaseIndex` (halbe Ausschläge für den Einkauf), `indexTrend` (Chip ab ±5 %), `marketReport` (Text des Marktberichts) | `market.setPrice` | `market.competitionChanged`, `market.priceSet` |
| `suppliers` | `shipments` (`toPort` bei Schiffsware), `relations` (Vertrauen, Schulden), `unlocked`, `offered`, `deals` (Rabatt-Aktionen, Auftrag 32), an Lieferungen seit Auftrag 23 `route`, `reasonId`, `decision`, `choice`, `luck`, `partOf` (Gründe in `problems.ts`, Stimmen in `voices.ts`, Entscheidungen in `troubles.ts`) (6; Pakete mit `container` (`'full'` oder `'shared'`), Lieferung `shared` bei aufgeflogenem geteiltem Container, Auftrag 33) | `getSuppliers`, `getSupplier`, `isUnlocked`, `unlockRequirements` (Stand der Bedingungen), `canUnlock`, `shipmentsInTransit`, `shipmentProgress`, `deliveryLeg` (Schiff/Umladen/Straße, nur Darstellung; Weg des Schiffs: `roads.shipRoute`), `UNLOADING_PORT`, `CITY_APPROACH_SHARE`, `expectedArrival`, `cheapestPackagePrice`, `getRelation`, `supplierDiscount`, `creditLimit`, `availableCredit`, `isBlocked`, `availablePackages` (leer, solange gesperrt), `packagePrice` (mit `purchaseIndex` und Rabatt-Aktion), `supplierVia(supplier, cityId)` (Autobahn des Kuriers in die Stadt, nur Karte), `Supplier.home` (Auftrag 37: in einer Stadt zu Hause, beim ersten Betreten ohne Vermittlung dabei; Hein in Hamburg, Mirko in Berlin); Auftrag 32: `getDeals(state, cityId?)`, `activeDeal(state, supplierId, packageId, cityId?)`, `supplierContact`, `supplierById`, `addSupplierTrust(ctx, id, amount)` | `suppliers.order` (`onCredit`, `warehouseId`), `suppliers.repay`, `suppliers.unlock` | `shipment.ordered`, `shipment.arrived` (`atPort`), `shipment.problem`, `supplier.trustChanged`, `supplier.repaid`, `supplier.overdue`, `supplier.unlocked`, `supplier.dealStarted` |
| `customers` | `waiting`, `nextSpawnAt`, `stats`, `regulars`, `orders` (mit `fromWarehouseId`, `deliveredBy` `player`/`rightHand`), `self` (Spot, an dem du stehst), `directOrders`, `quality` (gleitender Schnitt der Qualität pro Spot und Ware, Auftrag 32), `dealers` (Stammabnehmer, Auftrag 34) (6; Auftragsstatus zusätzlich `contested`) | `waitingAt`, `allWaiting`, `spotDemand` (aktuelle Nachfrage), Qualität (`quality.ts`): `spotQuality`, `qualityDemandFactor`, `qualityDemandFor`, `spotReputation`, `canServe`, `getSalesStats`, `getRegulars`, `getOrders`, `orderProgress`, `isPlayerDelivering`, `playerSpot`, `isPlayerAway`, `offerDelivery`/`offerWholesale` (Tests), Kundenentscheidung als reine Funktionen; Stammabnehmer (`dealers.ts`): `DEALERS` pro Stadt, `DEALER_STAGES`, `getDealers`, `dealerRelation`, `dealerStage`, `dealerPrepays`, `middlemanPrice` | `customers.serve` (`sellerId`), `.serveAll`, `.standAt`, `.setDirectOrders`, `.acceptOrder` (`by: 'player'` oder `'rightHand'`, alt `'courier'` = Spieler), `.declineOrder`, `.dealerExclusive`, `.dealerMiddleman` | `sale.completed` (`street`/`delivery`/`wholesale`), `customer.arrived`, `customer.left`, `customer.missed`, `customer.regularGained/Lost`, `customers.selfMoved`, `order.received/accepted/finished`, `dealer.stageChanged`, `dealer.left`, `dealer.middlemanDelivered` |
| `spots` | `unlocked`, `custom` (3; jedes Veedel hat mindestens zwei vorgegebene Spots, Auftrag 28; Hamburg 25 Spots zum Freischalten, Berlin 40 (`config-berlin.ts`); Spot-Art `kind: 'kneipe'` seit Auftrag 30; seit Auftrag 23 Arten in `kinds.ts`, `awareness` (Bekanntheit eigener Spots), `upgrades` (Ausbau), Version 4) | `getSpots(state, cityId?)` (aktive), `getAllSpots`, `getSpot`, `isSpotActive`, `spotsInVeedel`, `lockedSpots`, `customSpots`, `canFoundSpotAt`, `spotCity`, Kneipen: `isKneipe`, `isSpotOpen`, `nextSpotOpening`, `spotHoursLabel`, `KNEIPE`; Öffnungszeiten über die Woche mit `Spot.weekHours` (Auftrag 37, Berliner Clubs Fr 22 bis Mo 8 Uhr); das Veedel eines Spots kommt aus `veedelAt` | `spots.unlock`, `spots.found` (mit `kind`), `spots.upgrade`, `spots.move`, `spots.rename`, `spots.close` | `spots.unlocked`, `spots.founded` (mit `kind`), `spots.upgraded`, `spots.moved`, `spots.closed` |
| `reputation` | `value`, `recent` (2) | `getReputation`, `changeReputation(ctx, delta, reason)`, `reputationDemandFactor`, `reputationLabel`, `reputationTier`, `reputationTiers`, `recentReputationChanges` | | `reputation.changed` |
| `laundering` | `batches` (mit `channel`), `unlocked` (3; drei Wege in `config.ts`: Kumpel mit Kiosk, Waschsalon, Bauunternehmer mit Gebühr, Dauer, Obergrenze, Heat-Risiko, Freischalten) | `getChannels`, `getChannel`, `isChannelUnlocked`, `channelFee`, `channelDuration`, `channelFree`, `canUnlockChannel`, `launderingFee`, `launderingDuration`, `launderingCapacity`, `amountInProgress(state, channel?)`, `getBatches`, `batchProgress`, `LAUNDERING_CHANNELS` | `laundering.launder` (`amount`, `channel?`; ohne Weg der billigste freie, große Beträge werden aufgeteilt), `laundering.unlock` (`channel`, `pay`: sauber oder schwarz) | `laundering.started`, `laundering.completed`, `laundering.unlocked` |
| `staff` | `members` (mit `jailSupport`), `former`, `hiding`, Auftrag 34: `relations`, `stories`, an jeder Person `traits` (7; Rollen `runner`, `driver`, `security`, Spezialisten; `courier` nur als Altlast im Typ, alte Kuriere werden Läufer; Einsatz `delivery` hat nur die Rechte Hand, dazu `transport` und `office`) | `getStaff`, `getStaffMember`, `getStats`, `runnerAt`, `activeRunnerAt`, `securityAt`, `findAvailable`, `assign`, `setStatus`, `speedFactor`, `riskFactor`, `combatValue`, `defenseStrength`, `bonus`, `bailCost`, `dailyWages`, `effectiveWage`, `payrollDue`, `wageCategory`, `isAbsent`, `talkChance`, `staffContact`, `isLyingLow`, `lieLow`, `DRIVER_HIRE_COST`, `JAIL_WAGE_FACTOR`, `INJURED_WAGE_FACTOR` …; Auftrag 34: `TRAITS`, `traitFactor`, `hasTrait`, `traitName`, `rollTraits`, `RELATIONS`, `relationsOf`, `relationBetween`, `relationLabel`, `STORIES`, `openStories`, `storyChoices`, `startStory` | `staff.hireRunner`, `.hireDriver`, `.fire`, `.assign`, `.setWage`, `.bail`, `.setJailSupport`, `.replace` (`fire?`), `.lieLow`, `.relocate`, `.storyChoice` | `staff.hired`, `.left`, `.statusChanged`, `.assigned`, `.levelUp`, `.bailed`, `.betrayed`, `.raidWarning`, `.wentUnderground`, `.relocated`, `.story`, `.storyResolved` |
| `hierarchy` | `posts` nach Mitarbeiter (Spots, Einstellungen mit Bestellregeln (optional `maxIndex`: nur bestellen, wenn der Preisindex darunter liegt, Auftrag 32), Team, Ausfälle, Protokoll), `rightHands` pro Stadt (Einstellungen mit Aufgaben, Erfahrung `xp`, Erledigtes `done`, Bericht, `fullPower`), `orderTemplate`, `capos` (Auftrag 34) (7) | `getPost`, `getLieutenants`, `getLieutenantIds`, `isLieutenant`, `lieutenantOfSpot`, `lieutenantSpots`, `lieutenantVeedels`, `lieutenantsInVeedel`, `teamOf`, `teamLeadOf`, `handlesAbsence`, `canBeLieutenant`, `checkSpots`, `lieutenantDemand`, `lieutenantSatisfaction`, `homeWarehouse`, `orderRuleLabel`, `ruleStock`, `isPortSupplierAllowed`, `getRightHand(state, cityId?)`, `allRightHands`, `rightHandCityOf`, Vollmacht (Auftrag 30): `hasFullPower`, `fullPowerMissing`, `FULL_POWER_SHARE`, Übergabe (Auftrag 36): `rightHandTitle` (Statthalter), `startPackLeaders` (Haken für Capos), `startPackStaff`, `startPackRank`, `START_PACK_MAX_STAFF`, `canBeRightHand`, `rightHandOffered`, `rightHandSatisfaction`, `payrollReserve`, `rightHandBudgetLeft`, `absenceHandled`, `buildReport`, Aufgaben: `RIGHT_HAND_TASKS`, `isTaskUnlocked`, `isTaskActive`, `rightHandRank`, `rightHandRankProgress`, `rightHandDriver`, `rightHandOrderLimit`, `rightHandSpeedFactor`, `rightHandHandlesOrders`, `restockBudgetLeft`, `describeDone`; Capo (Auftrag 34): `getCapos(state, cityId?)`, `isCapo`, `capoOf`, `capoDistrict`, `canBeCapo`, `capoCandidates`, `capoInCharge`; Rat: `REPORT_TIPS`, `reportTipFor`; alt: `getLieutenant(veedelId)`, `lieutenantVeedel` | `hierarchy.appoint` (`staffId`, `spotIds`), `.setSpots`, `.dismiss`, `.configure` (`settings` mit `orderRules`, `onAbsent` …), `.appointRightHand`, `.dismissRightHand`, `.configureRightHand` (auch Aufgaben und ihre Regeln; `cityId?`), `.grantFullPower`, `.revokeFullPower`, `.installRightHand` (Startpaket, nur `system`), `.appointCapo`, `.dismissCapo`, `.revokeFullPower` | `hierarchy.appointed` (`spotIds`), `.dismissed`, `.configured`, `.spotsChanged`, `.rightHandAppointed`, `.rightHandDismissed`, `.dailyReport`, `.rightHandRankUp`, `.fullPowerGranted`, `.fullPowerRevoked`, `.shareTaken` |
| `finance` | `days`: Tagesbücher der letzten 30 Tage (Kategorien, pro Spot, pro Leutnant, pro Stadt `cities`; Buchungstexte nur sieben Tage) (2) | `currentDay`, `bookDay`, `dayReport(state, daysAgo)`, `periodReport(state, days)`, `dailyProfits`, `categoryLines`, `spotResult`, `spotResults`, `lieutenantResult`, `wageRunway`; Bilanz (Auftrag 27): `PERIODS`, `periodSpan`, `balance(state, period, filter)` mit `FinanceFilter` (alles, Stadt, Veedel, Spot, Leutnant), `balanceHistory`, `explainReport`; Städte (Auftrag 30): `cityReport(state, cityId, days)`, `cityDayProfit`, `bookingCity` | | |
| `quests` | `index`, `progress`, `done`, `skipped`, `title`, `startedAt`, `contracts` (Wochenverträge: `offers`, `active`, `history`, `stats`, Auftrag 32) (4; Auftrag 36: Kapitel pro Stadt mit `cityId`, index -1 = wartet auf die nächste Stadt). Peter (Kontakt `quest:peter`) schickt 26 Quests in fünf Kapiteln der Reihe nach (`config.ts`: `QUESTS`, `CHAPTERS`); Fortschritt über Ereignis-Zähler (`count`), ein Maß am Zustand (`measure`) oder eine Serie voller Stunden (`streak`). Belohnungen: Ware, Geld (schwarz/sauber), Ruf, weniger Heat, Erfahrung und Loyalität fürs Team, Einfluss, Titel Wochenverträge in `contracts.ts` (14 Vorlagen `CONTRACT_TEMPLATES`, sechs Figuren `CONTRACT_CONTACTS`, Ziele nach `operationTier`, Belohnung `trust` beim Lieferanten) | `currentQuest`, `questsWaiting` (Auftrag 36: Kapitel der nächsten Stadt), `questProgress`, `completedQuests`, `questTitle`, `chapterName`, `rewardText`, `QUESTS`, `CHAPTERS`, `PETER`; `contractOffers`, `activeContract`, `contractProgress`, `contractHistory`, `contractStats`, `contractValue`, `getContractTemplate`, `getContractContact`, `rewardValue` | `quests.skip`, `quests.acceptContract` (`offerId`) | `quest.started`, `quest.completed`, `contract.offered`, `contract.accepted`, `contract.finished` (`result`: `done`/`failed`) |
| `leaderboard` | `peakWorth`, `peakVeedel` (1). Merkt sich das höchste Vermögen im Durchgang; die Oberfläche schickt das Ergebnis an `api/leaderboard.ts` (Vercel Function mit Upstash Redis) bei Game Over, Sieg und zu jedem Spieltag. Der Server drosselt pro IP (429), gibt keine `runId` mehr aus und verlangt für Updates eines Durchgangs ein Token (nur der Hash liegt in Redis); Ware zählt im Vermögen zum Einkaufspreis (`leaderboard/config.ts`) | `netWorth`, `getRecord`, `runSummary` (mit `title` = Rang des Spielers und `rank`, Auftrag 36) | | |
| `recruiting` | Bewerber-Pool und Kontakte, Bewerber mit `traits` (4; Pool größer mit Veedeln und Ruf, `poolMax`) | `getCandidates`, `getCandidate`, `getPool`, `getContacts`, `searchReadyAt`, `poolMax`, `searchPreview(state, role?)`, `SEARCH_ROLES` | `recruiting.hire`, `.decline`, `.search` (`role?`: Läufer, Fahrer, Sicherheit) | `recruiting.candidateArrived`, `recruiting.hired`, `recruiting.candidateLeft` |
| `weather` | aktuelles Wetter, Vorhersage (2) | `getWeather`, `getForecast`, `weatherDemandFactor(state, channel?)`, `WEATHER_NAMES`, `isPrecipitation` | | `weather.changed` |
| `roads` | statisch (1): Straßennetze der Städte (`network.ts` Köln, 14.377 Knoten, 19.840 Kanten, ca. 2.250 km, mit Parkzufahrten im Rheinpark und Autobahn-Zufahrten `ROAD_APPROACHES`; `network-hamburg.ts`, 14.723 Knoten, 2.707 km, mit Zufahrten A1, A7, A23, A24, A25, A26; `network-berlin.ts` (Auftrag 37), 16.548 Knoten, 3.385 km, mit Zufahrten A111, A115, A113; Autobahn bis Wohnstraße, Einbahnstraßen), das Autobahn-Netz (`autobahn.ts`, Auftrag 36: sechs Linien zwischen Köln, Hamburg, Berlin, München und Frankfurt, A1 409 km, A3 172 km, A3/A9 381 km, A24 272 km, A9 562 km, A7/A5 486 km), Wasserwege (`waterways.ts`: Rotterdam – Köln bis Niehl, Nordsee – Hamburg bis zum O'Swaldkai, aus Overture) | `roadRoute(from, to, options?)` (Auftrag 33: `options.weights` Gewicht pro Straßenart, `AVOID_MOTORWAY`) (→ `path`, `meters`, `onRoads`, `drive` (Teil auf der Straße), `walkFrom`/`walkTo` (Fußwege an den Enden); Netz nach Ausschnitt, A* nach Fahrzeit, gemerkt; zwischen Städten automatisch `interCityRoute`), `roadDistance`, `travelMinutes(from, to, metersPerMinute, extra?)` (zwischen Städten `interCityMinutes`), `interCityRoute` (über das Netz, auch durch eine Stadt hindurch; `via`, `refs`), `interCityMinutes`, `autobahnBetween(a, b)` (direkte Linie), `autobahnPath(a, b)`, `autobahnRefs`, `autobahnLines`, `autobahnCities`, `roadNetworkAt(point)`, `roadEntryFrom(far, via?, into?)` und `roadApproach(far, via?, into?)` (Autobahn-Zufahrt der Richtung bzw. der Autobahn `via` in die Stadt von `into`, Standard Köln), `roadApproaches(cityId?)`, `shipRoute(cityId)`, `shipMinutes(cityId)`, `SHIP_SPEED`, `roadGraph(cityId?)` (Lesesicht für den Verkehr), `nearestRoadPoint`, `networkStats(id?)`, `ROAD_SPEEDS`; Prüfung `tools/check.ts` (`scripts/check-roads.mjs`) | | |
| `fleet` | `vehicles` (Modell, Stadt, laufende Fahrt, beschlagnahmt seit) (1) | `VEHICLE_MODELS`, `PRIVATE_CAR`, `vehicleModel`, `getVehicles(state, cityId?)`, `getVehicle`, `freeVehicles`, `vehicleSpec` (Modell oder Privatauto), `pickVehicle` (kleinstes passendes freies), `vehicleStatus`, `vehicleName`, `vehiclePrice`, `useVehicle`, `releaseVehicle`, `seizeVehicle`, `maybeSeize` | `fleet.buy` (sauberes Geld), `fleet.sell` | `fleet.bought`, `fleet.sold`, `fleet.seized` |
| `city` | `offers` (Angebot pro freier Stadt), `offerFrom` (komplette Stadt der laufenden Runde), `rounds`, `startMoneyPaid`, `startLeader` (Startpaket unterwegs), `rank` (dein höchster Rang), `active` (live), `present` (wo du bist), `unlocked`, `travel`, `sleep` (Ergebnisse pro Stadt), `visited` (5) | `CITIES` (mit `contact` und `pitch`), `CITY_OFFERS`, `NEXT_CITY` (Liste), `getCity`, `cityName`, `cityContact`, `playableCities`, `activeCity`, `presentCity`, `citiesUnlocked`, `isCityUnlocked`, `isCityLive`, `cityOf(veedelId)`, `cityOfSpot`, `cityAt(lng, lat)`, `isVeedelLive`, `liveVeedel`, `sleepInfo`, `sleepResult` (Razzia im Schlaf), `cityTravel`, `isPlayerTraveling`, `isPlayerIn`, `travelMinutesBetween`, Angebote (Auftrag 36): `offerStatus(state, cityId?)`, `offerFrom`, `offerCities`, `freeCities`, `currentOffer`, `acceptedCity`, `nextCityAfter`, `nextCityMissing` (alt `hamburgMissing`), `startMoneyFor`, `startMoneyDue`, `packVehicles`, Ränge: `playerRank`, `currentRank`, `PLAYER_RANKS`, Charakter: `relationFactor`, `bribeFactor`, `raidWarningBonus` | `city.answerOffer` (`choice`, `cityId?`), `city.requestCall` (`cityId`), `city.handOver` (`cityId?`, `toCityId?`, `pack?` mit `leaderId`, `staffIds`, `vehicleIds`; nur der Spieler), `city.switch` (nur der Spieler), `city.unlock` (nur `system`), `city.travel` | `city.offerAnswered` (`cityId`), `city.offerAccepted` (`cityId`, `from`), `city.switched`, `city.unlocked`, `city.slept` (`raid?`), `city.travelStarted`, `city.arrived`, `player.rankUp` (`rankId`, `title`, `score`) |
| `events` | `running`, `announced`, `market` (laufende Marktereignisse, Auftrag 32) (2); Kalender in `config.ts` (`CITY_EVENTS`: Karneval, Kater, FC, Kölner Lichter, Hafengeburtstag, Schlagermove, Dom; `MARKET_EVENTS`: Zollfund, Großrazzia bei einer Gang, Semesterstart, gute Ernte, Schwemme aus Marokko, Billigware aus dem Netz) | `activeEvents(state, cityId?)`, `upcomingEvents`, `eventFactor(state, 'demand' \| 'heatPerSale' \| 'checks' \| 'gangRaids', where)`, `raidsAllowed(state, cityId)`, `isEventActive`, `nextEventStart`, `eventEnd`, `getEventDef`; Auftrag 32: `marketEvents(state, cityId?)`, `marketEventFactor(state, productId, cityId)`, `marketEventText`, `getMarketEventDef` | | `events.started`, `events.ended`, `events.marketStarted`, `events.marketEnded` |
| `logistics` | `berths` pro Stadt (mit Stufe `level`: Kai, Halle am Kai, Kran), `cargo` (Ware am Kai, mit `cityId`), `trips` (Fahrten, auch `kind: 'route'` mit `routeId`, `leg`), `log`, `stats`, `routes` (Fahrplan), `restock` (Nachkauf für schlafende Städte) (6; Fahrten mit `vehicleId`, `choice`, Status `planned`/`waiting`; Routen mit `vehicleId`, `choice`) | `hasBerth(state, cityId?)`, `getCargo`, `cargoAmount`, `cargoRisk`, `getTrips`, `tripProgress`, `tripRoute` (Wege über Straßen und A1, mit `routes` für Fahrweg und Fußwege), `tripCity`, `isInterCityTrip`, `inTransitAmount`, `isPlayerOnTheRoad`, `freeDrivers(state, cityId?)`, `portPlace(cityId)`, `PORTS`, `receiveCargo` (für suppliers), Routen: `getRoutes`, `getRoute`, `nextDeparture`, `routeLoadPreview`, `driverWhereabouts`, `routeName`, `INTERCITY_CAPACITY`; Auftrag 33: `roomFor`, `inboundWeight`, `chooseVehicle`, `departureFor`, `roadOptions`, `reservedCargo`, `berthLevel`, `berthEffect`, `berthUpgradeCost`, `cargoRiskFrom(cargo, state?)`, `ROUTE_CHOICES`, `BERTH_LEVELS` | `logistics.buyBerth` (`cityId?`, sauberes Geld), `.upgradeBerth`, `.pickup`, `.transfer` (beide mit `vehicleId?`, `choice?`), `.redirect` (wartende Fahrt umleiten) (nur in einer Stadt), `.addRoute`, `.updateRoute`, `.removeRoute`, `.runRouteNow` | `logistics.berthBought`, `cargo.docked`, `cargo.seized` (Zoll), `transport.started`, `.stopped` (Kontrolle, zwischen Städten Zoll), `.arrived` (`interCity`), `.seized`, `.lost`, `route.departed`, `route.skipped`, `transport.waiting`, `logistics.berthUpgraded` |

## Zusammenspiel der Systeme

- **Straßen** (`roads`): Alle Fahrzeuge fahren über echte Straßennetze (Köln, seit Auftrag 30 auch Hamburg und die
  A1 dazwischen, siehe Abschnitt „Städte“). Daten: Overture Maps (abgeleitet
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
- **Lager, Fahrzeuge, Hafen (Auftrag 33):** Jedes Lager hat Platz in Gramm (`Warehouse.capacity`, Gewicht über
  `UNIT_WEIGHT_GRAMS`; Keller 4 kg, Garage 6, Hinterhof 10, Halle 25). Lieferungen und Fahrten lagern mit `storeFitting` ein:
  Kurier-Bestellungen nimmt ein volles Lager nicht an (`suppliers.order` prüft den Platz abzüglich der Lieferungen dorthin),
  Abholungen laden nur, was ins Lager und ins Fahrzeug passt (der Rest bleibt am Kai), Umlagern und Routen ebenso; ist das
  Lager bei der Ankunft doch voll, wartet der Rest beim Fahrer (`status: 'waiting'`, er fragt per Handy, `logistics.redirect`
  oder alle 30 Minuten neu versuchen). Beute und Rückgaben (`goods.store`) dürfen überfüllen. Ausbau mit sauberem Geld:
  Regale (×1,5/×2/×3), Tresor (`lossFactor`, `encounters` beim Überfall auf ein Lager) und Tarnung (`raidFactor`,
  `police.searchWarehouses`). Fahrzeuge (`fleet`): Roller 2 kg, Kombi 8 kg, Transporter 25 kg, je mit Tempo- und
  Kontrollfaktor. Innerhalb einer Stadt (Abholen, Umlagern) passt ins Privatauto alles wie bisher; Fahrten nehmen von
  selbst das kleinste freie eigene Fahrzeug, in das die Ware ganz passt (Tempo, Tarnung), sonst das Privatauto. Die Ladung
  eines Fahrzeugs begrenzt nur, wenn man es wählt. Auf Routen fasst das Privatauto 5 kg (`INTERCITY_CAPACITY`, wie
  bisher). Fliegt eine Ladung auf, ist das Fahrzeug zur Hälfte beschlagnahmt. Jede Fahrt
  mit Ware wählt die Strecke (`ROUTE_CHOICES`): Autobahn wie bisher, Landstraße (`roads` mit `AVOID_MOTORWAY`, mindestens
  ein Fünftel länger, Kontrollen halb so oft) oder nachts (Abfahrt ab 23 Uhr, ein Drittel der Kontrollen, nur bei Abfahrt in der Nacht; bis dahin ist die
  Fahrt `planned`, Container bleiben am Kai und können dort noch vom Zoll gefunden werden). Der Liegeplatz hat Stufen
  (`BERTH_LEVELS`: Halle am Kai, Kran): Ware länger sicher, weniger Zoll, Laden schneller. Jansen und Daan bieten Container
  (`container: 'full'`, 5 bzw. 6 kg, billig pro Gramm) und halbe Container (`'shared'`, noch billiger, mit 12 % fliegt die
  fremde Hälfte auf und die eigene ist weg); Bestellregeln von Leutnants und Rechter Hand nehmen Container nur, wenn sie
  das Paket nennen. Der Warenfluss (`goods.usage`, Verkäufe der letzten sieben Tage pro Stadt und Spot) zeigt in der
  Lager-App, wie lange Bestand und Ware unterwegs reichen; die Ebene „Lieferwege“ zeigt, aus welchem Lager ein Spot
  bedient wird (`servingWarehouse`).
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
  vs. Lieferdienst), Ruf und Preis. Seit Auftrag 32 dazu die Qualität der letzten Verkäufe einer Ware am Spot
  (`customers/quality.ts`): Unter 1 dreht ein Interessent mit der Gegenwahrscheinlichkeit ab, über 1 bringt er mit dem
  Überschuss als Chance noch jemanden mit (Solide und gute Lieferantenware = 1, Premium ab 0,95 bis 1,25, Dreck bis 0,67).
- **Markt in Bewegung (Auftrag 32):** `market` würfelt um Mitternacht pro Stadt und Ware einen Schritt des Preisindex
  (Rückkehr zur Mitte `INDEX_REVERSION`, Schritt `INDEX_STEP`, Grenzen `INDEX_MIN`/`INDEX_MAX`), auch für schlafende
  Städte. `events` würfelt Marktereignisse (`MARKET_EVENT_CHANCE` pro Stadt und Tag, höchstens zwei, Faktor auf den
  Index der Ware), `suppliers` Rabatt-Aktionen (`DEAL_CHANCE_PER_DAY`, still per Handy). `priceIndex` = Pfad mal
  Ereignisse, `referencePrice` folgt ganz, `packagePrice` mit `purchaseIndex` zur Hälfte. Montags um 9 schickt der
  Lieferant mit dem meisten Vertrauen den Marktbericht (`marketReport`). Leutnants und die Rechte Hand bestellen mit
  `maxIndex` nur unter einer Preisgrenze (`planOrder` pausiert die Regel sonst).
- **Wochenverträge (Auftrag 32):** `quests` bietet montags um 8 (`clock.hourStarted`) drei Verträge von verschiedenen
  Figuren an (Nachricht mit „Annehmen“ = `quests.acceptContract`, „Nein danke“ nimmt das Angebot heraus). Einer läuft,
  gezählt wie Peters Quests (`count` mit Ereignis, Zustand und Angebot, `measure`, `streak`), nur in der Stadt des
  Angebots; erfüllt zahlt er sofort aus, Montag 0 Uhr platzt er. Angebote ohne Antwort verfallen dann auch.
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
- **Konfrontationen** (Auftrag 35) zeigen, was als Nächstes passiert, und lassen den Spieler darauf antworten. Jede
  Runde steht die **Absicht** der Gegenseite als Chip im Dialog (`encounters/intents.ts`, gewürfelt nach den Zeigern):
  „Sie gehen auf die Kasse“, „Der Anführer will reden“, „Einer zieht ein Messer“, „Sie suchen den Ausgang“ … Zwei
  **Zeiger** 0–100: Aggression (ab `AGGRESSION_FIGHT` 70 Schlägerei, beide Seiten schlagen zu) und Entschlossenheit
  (die Bereitschaft zu bleiben; unter `RETREAT_AT` 30 zieht die Gegenseite ab bzw. gibt nach). Jede Handlung verschiebt
  beide (`actions.ts`), die echten Werte der Beteiligten (Tempo, Vorsicht, Stärke, Charisma) und die Absicht verstärken
  oder dämpfen; der **Würfel entscheidet nur die Stärke** (Gutes mal M, Schlechtes mal 2 − M, `tactics.ts`), der
  Dialog zeigt die Spanne vorher als Pfeile. Die **Polizei-Uhr** zählt Runden bis zur Streife (aus Polizeipräsenz und
  Heat, „Bullen rufen“ stellt sie auf 1); läuft sie ab, verlieren beide (Festnahme-Chance, Ware weg, Heat), bei
  Polizei und Zoll kommt deren Verstärkung. **Einsätze** Ware, Kasse, Leute, Spot, Lärm: pro Runde schützt man einen
  (nimmt nur `PROTECT_FACTOR` des Schadens), die passende Handlung wendet eine Absicht ganz ab (`counters`); haben sie
  genug erbeutet (`lootLimit`), ziehen sie mit der Beute ab. Das Ergebnis ist eine Mischung (`result.parts`): Verluste
  aus `effects` zählen anteilig zum Schaden des Einsatzes, Gewinne schrumpfen damit, `effects` der Aufrufer bleiben
  gültig. **Gegner mit Rollen** (Anführer, Nervöser, Schläger; `roles` je Anlass): den Anführer einschüchtern (nur als
  Boss vor Ort), den Nervösen bearbeiten (geht), Schläger heizen jede Runde ein. Im Briefing wählt der Spieler einen
  Weg (je Anlass `briefingOptions`: selbst hin, Leute machen lassen, Verstärkung, sofort freikaufen, anonym die Bullen
  rufen, Ware retten und den Spot räumen) und eine **Crew** aus bis zu drei Leuten (`crew.ts`: wer vor Ort ist plus
  freie Leute der Stadt mit Taxi, Vorschlag vorbelegt). Jede Person bringt einen **Spezialzug** (einmal pro
  Konfrontation, `SPECIAL_MOVE_RULES`): Sicherheit fängt einen Treffer ab, Fahrer machen die Flucht sicher, hohes
  Charisma gibt eine zweite Verhandlung, hohes Tempo bringt die halbe Ware weg; `specialMoves(member)` ist der Haken
  für Eigenschaften aus Auftrag 34. Ist eine **Rechte Hand** in der Stadt, kommentiert sie die Lage in einem Satz
  (`advice.ts`, Regeln als Daten). Ohne Boss entscheiden die Leute mit einer einfachen Strategie (`strategy.ts`,
  `autoResolveEncounter`), der Bot spielt mit der klugen. Anlässe: Überfall abwehren, Polizeiflucht,
  Verkehrskontrolle, **Zollkontrolle** (`customsCheck`, Autobahn und Hafen: Papiere zeigen, bestechen, ablenken,
  Ladung aufgeben), Schulden eintreiben, Deal kippt, Überfall auf einen Gang-Spot, je mit mindestens vier
  Situationstexten nach Ort (`request.setting`), Tageszeit und Wetter. Konfrontationen bringen Erfahrung und kosten
  Loyalität.
- **Löhne:** Wer um Mitternacht nicht bezahlt werden kann, ist sauer und schreibt; am zweiten Tag ohne Lohn oder
  unter Loyalität 30 kündigt er. Fällig ist `payrollDue` (Haft und Verletzung anteilig); die Kasse warnt, wenn das
  Schwarzgeld nicht mehr für zwei Nächte reicht.
- **Spielende:** Pleite (Pleite-Regel oben), Tod (nur wer selbst bei einer Konfrontation dabei ist), Sieg bei
  7 von 12 Veedeln (`campaign.won`, danach Endlosmodus). Hardcore löscht bei Game Over alle Stände des Durchgangs.

### Mehr Leben in Köln (Auftrag 23)

- **Text-Helfer** (`src/core/texts.ts`): `texts.pick(ctx, key, varianten, vars)` wählt eine Variante, die unter dem
  Schlüssel nicht gerade erst kam (etwa die Hälfte der Liste, höchstens drei sind gesperrt), und ersetzt Platzhalter
  (`{boss}`, `{veedel}` …). Das Gedächtnis liegt im Spielstand (`state.texts.recent`, Kernschema 4), der Zufall kommt
  aus `ctx.random()`. `texts.pickItem` macht dasselbe für beliebige Einträge (z.B. Gründe mit Wirkung). Schlüssel:
  `gang:<id>:<anlass>`, `supplier:<id>:<anlass>`, `reason:<weg>:<art>`, `staff:<anlass>`, `port:<stadt>:<anlass>`.
- **Stimmen:** Jede Gang (`gangs/texts.ts`, 16 Anlässe, je mindestens fünf Varianten), jeder Lieferant
  (`suppliers/voices.ts`), Personal (`staff/texts.ts`), Leutnants (`hierarchy/texts.ts`) und der Hafen
  (`logistics/texts.ts`, pro Stadt) haben eigene Listen. Der Hafenmeister in Niehl heißt Willi Esser (`other:harbor`).
- **Gang-Methoden** (`gangs/methods.ts`): Gewichte pro Gang in `data.ts`. Ab Stufe 2 macht eine Gang Druck nach diesen
  Gewichten, mit festem Abstand pro Stadt (`METHOD_INTERVAL_BY_CITY`, Köln 4–8 Tage, Hamburg 6–12, auf Stufe 1 doppelt)
  und einem Tag zwischen allen Gangs; ohne mindestens zwei Leute (`METHOD_MIN_PEOPLE`) nicht. Die
  Methoden kommen zum Überfall ab Stufe 3 dazu und ersetzen ihn nie: Abgewehrte Überfälle schwächen die Gang, davon lebt
  die Übernahme ihrer Veedel. Einbruch ins Lager, geplant für die nächste Nacht (Wachen verscheuchen, Meldung um 7 Uhr
  durch die Nachbarin, Antworten: Täter suchen = Konfrontation `recoverLoot`, nur ein Erfolg bringt Ware zurück,
  verpfeifen, eigenen Mann rauswerfen, abhaken; ins Protokoll der Gang nur, wenn die Spur zu ihr führt),
  Abwerben (Lohn erhöhen, gehen lassen, drohen), Einschüchtern (`intimidationFactor` senkt die Kundschaft am Spot,
  `customers` fragt das), Tipp an die Polizei (`police.tipOffAgainstPlayer`), Erpressung mit einem Lager. Chancen:
  Warnung vor einem Rivalen, bezahlter Gefallen. Alles, was eine Antwort braucht, ist ein Vorfall mit
  Frist; ohne Antwort gilt die vorsichtige Wahl (`INCIDENT_CHOICES[kind][0]`). Was gerade geht, sagt
  `incidentChoices(state, incident)` (Nachricht und Gangs-Seite gleich); Schutzgeld beendet eine Einschüchterung.
- **Lieferprobleme** (`suppliers/problems.ts`, `troubles.ts`): Gründe pro Weg (Autobahn, Grenze NL, Schiff, in der
  Stadt), die Hälfte der Verspätungen und drohenden Beschlagnahmen kommt mit Rückfrage (`suppliers.resolveProblem`:
  Umweg, Teillieferung, Umleiten in ein anderes Lager, Schmieren, abwarten). Chancen: früher da, Ware obendrauf,
  bessere Qualität (`LUCK_CHANCE`). Die Wahrscheinlichkeiten der Probleme bleiben (`rollShipmentProblem`).
- **Spot-Arten** (`spots/kinds.ts`): Straßenecke, Späti-Hinterzimmer, Club, Park, Bahnhof/Haltestelle, Campus, Kneipe.
  Eigene Spots nehmen Kosten, Andrang, Kundschaft, Preis, Heat, Öffnungszeiten, Tageskurve und Wetter ihrer Art;
  vorgegebene Spots tragen die Art nur als Bezeichnung. **Bekanntheit** eigener Spots (Start 0,2) wächst mit
  Verkäufen, Stammkunden und Tagen mit Leuten dort und sinkt an leeren Tagen; `spotDemandFactor` (customers).
  **Ausbau** für jeden Spot: Späher, Versteck, Stammplatz (`spotModifiers`, gefragt von police, customers und gangs).
  Eigene Spots lassen sich verlegen (Teil der Bekanntheit bleibt), umbenennen und aufgeben (`spots.closed`: Leute
  werden frei, customers verlegt die Stammkunden zum nächsten Spot im Umkreis oder verliert sie).
- **Kunden-Anfragen** (Etappe 4) blieben, wie sie seit Auftrag 28 sind: Seitdem schreiben Kunden nur, wenn du es
  einschaltest oder die Rechte Hand ausfährt. Ein automatischer Übergang würde nur doppeln, was die Rechte Hand schon
  regelt.

### Leute und Gegner (Auftrag 34)

- **Eigenschaften** (`staff/config.ts` `TRAITS`, `staff/traits.ts`): zwei bis drei pro Person, gewürfelt fest aus einem
  Schlüssel (`rollTraits`, Hash statt `ctx.random()`: Migration und Neuerzeugung bleiben deterministisch, die Würfelfolge
  der Module ändert sich nicht). Kleine Faktoren über `traitFactor(member, key)` auf Lohnwunsch (`expectedWage`, im
  Schnitt 1), Risiko (`riskFactor`), Zeit pro Kunde (`serveTime`), Kampfkraft (`combatValue`), Erfahrung (`addXp`),
  Verrat (`betrayalChance`), Reden (`talkChance`) und Angst (Loyalität bei Festnahmen nebenan, Razzien, Heat).
  **Spezialzüge** über den Haken in `encounters/crew.ts`: Regeln mit `trait` in `SPECIAL_MOVE_RULES` (Hitzkopf fängt ab,
  charmant verhandelt zweimal, flink und Angsthase bringen Ware weg); `specialMoveFor(member, kind.moves)` nimmt den
  ersten Zug, den der Anlass erlaubt.
- **Beziehungen** (`RELATIONS`): befreundet, Geschwister (gleicher Nachname), Rivalen, ein Paar; beim Einstellen mit
  `RELATION_CHANCE` zu jemandem im Team (höchstens eine auf drei Leute), Empfehlungen (`EnlistOptions.referrerId`) immer
  mit der empfehlenden Person. Wirkung beim Entlassen und Sterben (`staff.left`: Loyalität, manchmal geht jemand mit),
  in Haft (`police.arrest`, Tagesloyalität) und am selben Spot (`relationPace`: Läufer, Sicherheit, Leutnant des Spots).
- **Geschichten** (`staff/stories.ts`, `STORIES`): 16 Vorlagen als Daten (wer passt, was sofort passiert, Antworten mit
  Wirkung, Rückfall-Wahl ohne Antwort). Zur vollen Stunde zwischen 9 und 22 Uhr in der Stadt, die live ist, nach
  `STORY_GAP` mit `STORY_CHANCE_PER_HOUR`, pro Person und Vorlage mit Abklingzeit. Texte über `texts.pick`
  (`staff:story:<vorlage>`), Antwort `staff.storyChoice` aus dem Chat, Geld als `wages.extra` (neue Kategorie im Kern).
- **Gedächtnis der Gangs** (`gangs/memory.ts`, `MEMORIES` in `config.ts`): Erinnerungen mit Wirkung und linearem
  Verfall, gleiche summieren sich bis `stack`. Aus Ereignissen (verpfiffen, Abkommen gebrochen, Überfall abgewehrt,
  Spot überfallen, Veedel abgenommen, Schutzgeld, Waffenstillstand, Deal) und den Antworten auf Vorfälle aus Auftrag 23
  (Täter gejagt, gedroht, verjagt, Erpressung gezahlt oder nicht, Gefallen, Warnung). `memoryPriceFactor` macht
  Waffenstillstand (`ceasefireCost`) und Bündnis (`allianceCost`) teurer oder billiger, `say()` hängt bei Drohungen,
  Angeboten und Bitten den Satz zur stärksten Erinnerung an. Das Gedächtnis hängt an der Gang, nicht an der Stadt
  (für die Kunden der Hafen-Phase).
- **Gang-Kriege** (`gangs/war.ts`): Verhältnisse als Daten (`GANG_RIVALRY` in `data.ts`), Laufzeit in `rivalry`. Jeder
  Vorstoß ins Revier einer anderen Gang kostet `RIVALRY_PER_PUSH`, unter `WAR_AT` ist er ein Krieg (`gang.warStarted`),
  Feinde werden lieber angegriffen (`RIVALRY_TARGET_BONUS`). Höchstens alle `WAR_MESSAGE_GAP` pro Stadt bittet die Seite
  mit der besseren Meinung von dir um Hilfe: Ware liefern (zum Einkaufspreis der Gang, der Vorstoß wird mit
  `WAR_SUPPORT_FACTOR` stärker) oder ein Spot der anderen überfallen (`gangs.attack` mit bis zu drei Leuten); dazu
  `warHelp` bei der einen und `warAgainst` bei der anderen. Die Siegerin schluckt Leute und Geld der Verliererin.
- **Stammabnehmer** (`customers/dealers.ts`): Dealer pro Stadt (`DEALERS` mit `cityId`), Vertrauen 0–100 aus erfüllten,
  abgelehnten, geplatzten und verpassten Deals (`DEALER_TRUST`). Wer fragt, hängt am Vertrauen (`pickDealer`); ab
  „regelmäßig“ meldet er sich spätestens alle drei Tage selbst und will größere Mengen, ab „Vorkasse“ zahlt er die Hälfte
  beim Annehmen und der Deal kippt nicht mehr, ab 70 bietet er Exklusivität an (`customers.dealerExclusive`, Rabatt), als
  Exklusiver ab 85 den Zwischenhandel für sein Veedel (`customers.dealerMiddleman`: jede Woche `MIDDLEMAN_AMOUNT`, Preis
  mit `MIDDLEMAN_DISCOUNT`, `MIDDLEMAN_INFLUENCE` Einfluss im Veedel). Zweimal hängengelassen in 14 Tagen: Er kauft bei
  einer Gang (`dealer.left`) und kommt nach `DEALER_RETURN_DAYS` wieder.
- **Capo** (`hierarchy/capo.ts`): Leutnant ab Level 5 mit drei Spots, führt bis zu drei Leutnants im Bezirk (Veedel
  seiner Spots und ihre Nachbarn). Fällt einer aus, ordnet er dessen Spots und bestellt nach dessen Regeln
  (`standIn` in `ai.ts`, actor = Capo); steht eine Gang an einem Spot im Bezirk, schickt er freie Sicherheit hin.
  Lohnanspruch `CAPO_DEMAND_FACTOR` mal der eines Leutnants mit drei Spots. Die Rechte Hand lässt Ausfälle und leere
  Spots im Bezirk in Ruhe (`capoInCharge`). Für Auftrag 36: `getCapos(state, cityId)`, `isCapo`.
- **Rat im Tagesbericht** (`hierarchy/advice.ts`, `REPORT_TIPS`): Regeln mit Priorität und Varianten (Capo ab acht
  Leutnants, Engpass nach `goods.usagePerDay`, Gang-Druck mit Preis des Waffenstillstands, teurer Leutnant,
  Unzufriedene, Leute ohne Einsatz, Gang-Krieg); die passende mit der höchsten Priorität kommt als `report.tip` in den
  Bericht.

## Balancing

- Einstellbare Werte liegen in den `config.ts` der Module. Die wichtigsten Stellschrauben dieser Runde:
  Kundschaft (`customers/config.ts`: `BASE_SPAWN_INTERVAL`), Straßenpreise (`goods/config.ts`), Einfluss
  (`territory/config.ts`: `SALE_INFLUENCE_*`, `TAKEOVER_MARGIN`, `LIEUTENANT_INFLUENCE_*`), Gang-Druck
  (`gangs/config.ts`: `ATTACK_*`, `PLAYER_THREAT_*`, `TRIBUTE_PER_PLAYER_VEEDEL`), Polizei
  (`police/config.ts`: `HEAT_DECAY_PER_HOUR`, `CHECK_*`, `RAID_LEAD_TIME`).
- Simulation: `src/playtest/bot.ts` spielt wie ein vorsichtiger Spieler (verkauft an zwei Spots selbst, bestellt
  nach Produktmix, heuert an, befördert Leutnants, stellt Sicherheit ein, zahlt Schutzgeld nur aus der
  Portokasse, schickt bei Konfrontationen die vorgeschlagene Crew und gibt per Handy kluge Anweisungen, geht nie
  selbst hin). `npm test` prüft 10 Tage mit 2 Seeds,
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

- Auftrag 30 (Köln komplett erst bei 12, zweite Stadt, Stadt-Events, Klüngel, Kneipen; 30 Tage, 3 Seeds, vorher =
  `main` nach Auftrag 29): „Boss von Köln“ (7) an Tag 22/23/22 → 19/17/20, Köln komplett an Tag 24/22/27 (vorher kein
  Ziel), Umsatz pro Tag Tag 1–5 2.445/2.947/2.284 € → 2.979/3.387/3.198 €, Tag 6–15 5.877/6.006/5.421 € →
  7.764/9.059/7.789 €. Der größte Teil kommt vom Nachtleben im Zülpicher-Umfeld (Auftrag 30, Etappe 4) und daher,
  dass der Bot wieder eigene Spots gründet (seit Etappe 4 hielten ihn gesperrte Hamburger Spots davon ab). Neuer
  Bericht „Hamburg nach Köln komplett“ (`simulateHamburg` in `balance.test.ts`, `scenario.ts`: 25 Tage Köln, dann
  komplett, Vollmacht und Umzug durch den Bot, 20 Tage Hamburg; `BALANCE_KOELN_DAYS`, `BALANCE_HAMBURG_DAYS`): erstes
  Hamburger Veedel nach 7/5/7 Tagen, keine Pleite, Köln bringt im Schlaf 7.500–11.000 € am Tag. Stellschrauben:
  `territory/config.ts` `SALE_INFLUENCE_FACTOR_BY_CITY` (Hamburg 0,6), `city/data.ts` (`relationFactor`,
  `bribeFactor`, `raidWarningBonus`, `wageFactor`, `propertyFactor`), `events/config.ts`, `spots/config.ts` `KNEIPE`.
- Auftrag 23 (Gang-Methoden, Lieferprobleme mit Entscheidungen, Spot-Arten; 30 Tage, Köln 8 Seeds, Hamburg 32 Seeds,
  vorher = `main` nach Auftrag 35): erstes Veedel im Schnitt an Tag 6,3 → 7,1, „Boss von Köln“ an Tag 16,5 → 17,1, Köln
  komplett an Tag 22,0 → 22,9 (alle 8 Seeds), Umsatz pro Tag Tag 6–15 10.247 → 9.255 €, keine Pleiten; Hamburg am Ende
  im Schnitt 1,8 → 1,75 Veedel, mindestens ein Veedel in 25 → 24 von 32 Seeds (schwankt stark mit dem Zufall, 0 bis 6).
  Ziel ist mehr Abwechslung, nicht mehr Härte: Jede einzelne Methode ist mild (Einbruch höchstens 15 % eines Postens,
  Einschüchtern 6 Stunden bei drei Vierteln der Kundschaft, kleine Heat-Schübe), dafür zeigt eine drohende Gang
  verlässlich alle paar Tage eine (Bot, 3 Seeds × 25 Tage: 9 Methoden, 19 Überfälle, 6 Chancen). Die Methoden kommen zum
  Überfall dazu und ersetzen ihn nie: Abgewehrte Überfälle schwächen die Gang, ohne sie fiel Hamburg auf 1,0 Veedel.
  Köln schläft mit dem Schnitt seiner letzten sieben Tage, jede Mehrausgabe dort fehlt also auch in Hamburg. Der Bot
  schmiert bei drohender Beschlagnahme und nimmt bei Verspätung den Umweg; wer Lieferprobleme nur abwartet, verliert in
  Hamburg (Schiff, Zoll) spürbar mehr Ware. Stellschrauben: `gangs/config.ts` (`METHOD_INTERVAL_BY_CITY`,
  `METHOD_HOSTILITY_RELIEF`, `BURGLARY_*`, `POACH_*`, `INTIMIDATION_*`, `TIPOFF_*`, `BLACKMAIL_*`, `GOOD_TURN_CHANCE`),
  `suppliers/config.ts` (`DECISION_*`, `DETOUR_*`, `BRIBE_*`, `LUCK_*`), `spots/kinds.ts` (Arten, `AWARENESS_*`, Ausbau).

- Auftrag 32 (Preisindex, Rabatt-Aktionen, Marktereignisse, Qualität treibt Nachfrage, Wochenverträge; 30 Tage,
  32 Seeds, vorher = `main` nach Auftrag 31): erstes Veedel Ø Tag 6,5 → 6,5, „Boss von Köln“ Ø Tag 17,7 → 16,9, Köln
  komplett bei 31 → 32 von 32 Seeds, Ø Tag 23,3 → 22,5, Umsatz pro Tag T1–5 3.240 → 3.190 €, T6–15 9.130 → 9.770 €
  (+7 %), T16–30 22.630 → 23.650 €, keine Pleite. Neu im Bericht (`npm run balance`, Zeile „Markt“): Index Köln über
  30 Tage zwischen 0,85 und 1,20, der Bot nimmt jede Woche einen Vertrag (95 angenommen, 84 erfüllt, 88 %).
  Einzeln eingeschaltet gemessen (16 Seeds, alles aus = Köln komplett Ø Tag 24,2): Qualität −1,0 Tage, Index −0,6,
  Verträge −0,7, Aktionen −0,4. Stellschrauben: Belohnungen `CONTRACT_MONEY` [0, 500, 1.500] und `CONTRACT_TRUST`
  [3, 4, 5] in `quests/contracts.ts` (Kapital in der ersten Woche wirkt stark, deshalb gibt es für Kleindealer kein
  Geld), `QUALITY_NEUTRAL` [0,45, 0,8] und `QUALITY_PREMIUM_AT` 0,95 in `customers/config.ts` (normale
  Lieferantenware bleibt neutral, erst Premium zieht Kundschaft an), `DEAL_CHANCE_PER_DAY` 0,2 in
  `suppliers/config.ts`, `INDEX_*` und `PURCHASE_INDEX_SHARE` in `market/config.ts`, `MARKET_EVENT_CHANCE` in
  `events/config.ts`.

- Auftrag 33 (Lager mit Kapazität und Ausbau, Fahrzeuge, Routenwahl, Hafen-Ausbau, Container, Warenfluss; 30 Tage,
  10 Seeds, vorher = `main` nach Auftrag 32): Köln komplett an Tag 23/22/24/23/23/20/22/24/23/23 → 24/22/24/26/23/21/22/24/
  23/22 (Ø 22,7 → 23,1), „Boss von Köln“ im Median Tag 17 → 17, Umsatz pro Tag Tag 6–15 fast gleich, Tag 16–30 im Schnitt
  22.989 € → 23.085 €, keine Pleite. Abgewiesene Einlagerungen 0–0,4 % der Gramm in Köln, 0–1,3 % in Hamburg (eine am
  vollen Lager wartende Fahrt zählt nur beim ersten Versuch). Hamburg nach Köln komplett (10 Seeds): erstes Hamburger
  Veedel bei 9 → 10 von 10 Seeds, im Median nach 6 → 8 Tagen, Liegeplatz 8 → 8. Mit kleineren Lagern (6 statt 10 kg im
  Hinterhof) wurden bis 9 % abgewiesen und Hamburg wurde deutlich schwerer. Der Bot kauft Regale nur, wenn ein volles
  Lager Ware abweist, einen Kombi, wenn mehr als 2 kg am Kai stehen (2 von 10 Seeds), holt Hafenware nachts ab, wenn sie
  bis dahin sicher ist, nimmt in einer neuen Stadt das günstigste Lager mit mindestens 6 kg Platz und kauft keine
  Container (auch nicht in Aktionen). Ein Großeinkauf (Container, drei Tage Vorrat) machte ihn langsamer: Das Geld fehlt
  dann bei Leuten und Spots. Achtung beim Messen von Hamburg: Das schlafende Köln bringt den Schnitt der letzten sieben
  live gespielten Tage, ein einziger Tag mit großem Einkauf kurz vor dem Umzug macht ihn negativ.

- Auftrag 35 (Konfrontationen neu; 30 Tage, 8 Seeds, vorher = `main` nach Auftrag 32): Gezielt gemessen wie in Auftrag 24
  (`src/playtest/encounters.measure.test.ts`, läuft mit `npm run balance`: 300 Überfälle der Hafenkolonne auf einen
  Spot, ein Läufer vor Ort, 2–4 Angreifer): **ausgewürfelt** (Leute ohne Boss, einfache Strategie) Erfolg 56 → 62,
  Rückzug 128 → 122, verloren 116 → 116, Verletzte oder Tote in 136 → 117 Fällen. Neu verglichen: **zufällig getippt**
  16 / 175 / 109, Verletzte 174; **gut gespielt** (Absicht abwenden, Einsatz der Absicht schützen, Aggression unter 70
  halten, Spezialzüge; `chooseAuto(…, true)`) 147 / 144 / 9, Verletzte 69. Rückzug heißt jetzt meist „Polizei-Uhr
  abgelaufen“ (beide verlieren: Ware, Einfluss am Spot, Festnahmen). Bot (schickt die Crew, spielt gut): Köln komplett
  an Tag 23/22/24/23/23/20/22/24 → 22/22/22/23/23/24/19/22, „Boss von Köln“ 15–18, Umsatz pro Tag Tag 16–30
  21.900–25.800 €, keine Pleite. Hamburg (nach Köln komplett, 20 Tage): keine Pleite, am Ende 0–8 Stadtteile (die
  Kontrolle der Hamburger Stadtteile kippt in beiden Ständen oft hin und her). Stellschrauben: `encounters/config.ts`
  (`AGGRESSION_FIGHT`, `RETREAT_AT`, `PROTECT_FACTOR` 0,5, `CLOCK_*`, `BRAWL_*`, `STAT_FACTOR_*`, `CREW_*`),
  `kinds.ts` (`gauges`, `clock`, `lootLimit`, Rückzug beim Überfall mit Einfluss −3), `intents.ts` (`damage`, `hit`,
  `weight`), `actions.ts` (`shift`).

- Auftrag 34 (Leute mit Geschichte, Gang-Gedächtnis und Gang-Kriege, Stammabnehmer, Capo; 30 Tage, 20 Seeds,
  vorher = `main` nach Auftrag 23): erstes Veedel Ø Tag 6,9 → 6,5, „Boss von Köln“ Ø Tag 16,65 → 16,4, Köln komplett
  Ø Tag 22,85 (19 von 20) → 22,65 (20 von 20), Umsatz pro Tag T6–15 10.114 → 11.066 €, T16–30 22.430 → 23.869 €,
  keine Pleite. Hamburg nach Köln komplett (3 Seeds): am Ende 3/1/2 → 2/3/2 Stadtteile, keine Pleite. Häufigkeit (Bot,
  Köln, etwa 22 Tage): Geschichten 4–10 (etwa zwei pro Woche), Gang-Kriege 4–10 (der Bot wird höchstens alle drei Tage
  gefragt), 1–7 Stufenwechsel bei Stammabnehmern, ein Capo ab acht Leutnants. Einzeln gemessen: Ohne Ausgleich beim
  Lohnwunsch der Eigenschaften brauchte Köln komplett anderthalb Tage länger (deshalb wollen Trinker, Angsthasen,
  Treue und Hitzköpfe weniger). Lässt der Bot fremde Dealer selbst beliefern (schon in der ersten Woche Großhandel für
  2.000–6.000 €), ist Köln komplett 1,7 Tage früher fertig; er beliefert deshalb nur Stammabnehmer selbst, den Rest
  macht die Rechte Hand. Stellschrauben: `staff/config.ts` (`TRAITS`, `RELATIONS`, `STORY_*`), `gangs/config.ts`
  (`MEMORIES`, `MEMORY_PRICE_*`, `RIVALRY_*`, `WAR_*`), `gangs/data.ts` (`GANG_RIVALRY`), `customers/config.ts`
  (`DEALER_*`, `MIDDLEMAN_*`), `hierarchy/config.ts` (`CAPO_*`).

- Auftrag 36 (Deutschland: freie Reihenfolge, Autobahn-Netz, Statthalter, Startpaket, Startgeld, Ränge; 8 Seeds, vorher =
  `main` nach Auftrag 23): Köln komplett an Tag 23/21/21/25/22/27/21/23 → 23/21/21/25/22/27/22/22 (Ø 22,9 → 22,9),
  „Boss von Köln“ unverändert (Tag 16–20), keine Pleite. Neuer Bericht „Tage pro Stadt“ (`simulateCities` in
  `balance.test.ts`, ersetzt „Hamburg nach Köln komplett“: 25 Tage Köln, dann komplett, der Bot wählt die nächste Stadt,
  übergibt mit Startpaket und spielt 30 Tage weiter; `BALANCE_KOELN_DAYS`, `BALANCE_LATER_DAYS`). Hamburg vorher: in 20
  Tagen nie komplett, am Ende 0–7 Stadtteile, erstes Veedel nach 5–13 Tagen. Nachher: komplett nach
  13/16/14/10/14/17/14/8 Tagen (alle 8 Seeds, Median 14, Richtwert „zweite Stadt etwa 15“), erstes Veedel nach 4–6
  Tagen, Startgeld 45.000–60.000 €. Gemessen, was das Tempo bestimmt (Seed 1–5): Geld bei der Ankunft. Ohne Startgeld kam
  der Bot mit wenigen Hundert Euro an (er gibt in Köln alles aus) und Hamburg blieb bei 1–3 Stadtteilen nach 30 Tagen,
  auch mit `FULL_POWER_SHARE` 0,5 statt 0,8 (erstes Veedel nur einen Tag früher) oder mit 100 % statt 60 % Einfluss pro
  Verkauf in Hamburg. Nur 10 Tagesgewinne (19.000–60.000 €) streuten zu stark: unter etwa 40.000 € blieb Hamburg hängen
  (2 von 8 Seeds länger als 30 Tage), deshalb das Mindest-Startgeld pro Zielstadt. Stellschrauben (für die späteren
  Städte nach 37 bis 39 mit „dritte 12, vierte 10, fünfte 8“ einzustellen): `HANDOVER_START_MONEY_DAYS` 10 und
  `START_MONEY_MIN_BY_CITY` (Hamburg 45.000 €, die anderen nach `propertyFactor`; `city/config.ts`, wirken am
  stärksten), `FULL_POWER_SHARE` 0,8 (`hierarchy/config.ts`, wirkt schwach, weil der Statthalter nur den Gewinn teilt),
  `START_PACK_MAX_STAFF` 5 und `START_PACK_RANK_BY_LEVEL` (`hierarchy/config.ts`), `SLEEP_RAID_*` (`city/config.ts`). Der
  Bot spart in späteren Städten erst ab fünf Läufern für den Liegeplatz (vorher ging das Geld ab zwei Läufern in die
  Wäsche, Hamburg hatte zwei Wochen lang einen Spot).

- Auftrag 37 (Berlin als dritte spielbare Stadt; Köln 16 Seeds, Tage pro Stadt 8 Seeds, vorher = `main` nach Auftrag 34):
  Köln komplett Ø Tag 22,25 (19–29) → 22,9 (20–29), „Boss von Köln“ Ø Tag 15,9 → 16,6, erstes Veedel Ø Tag 6,5 → 6,75,
  Umsatz pro Tag T6–15 11.735 → 10.428 €, T16–30 23.120 → 23.888 €, keine Pleite. Köln selbst hat sich nicht geändert;
  der Preisindex würfelt jetzt auch für Berlin (`market.stepIndex` über alle spielbaren Städte), das verschiebt die
  Würfelfolge ab Tag 2. Der Bot wählt Berlin als zweite Stadt (günstigste nach `propertyFactor` + `wageFactor`).
  Bericht „Tage pro Stadt“: Berlin komplett nach 8/14/14/17/8/8/7/12 Tagen (Median 10, Richtwert 8 bis 15), keine Pleite;
  danach Hamburg als dritte Stadt nach 6/14/10/6/6/9 Tagen (zwei Seeds noch nicht komplett, als das Fenster von 30 Tagen
  endete). Gemessen, was das Tempo bestimmt: Ohne Dämpfung nahm der
  Bot ganz Berlin in zwei bis fünf Tagen (über 1.100 Verkäufe am Tag an 40 billigen Spots mit viel Nachtleben, jeder
  Verkauf bringt Einfluss); `SALE_INFLUENCE_FACTOR_BY_CITY.berlin` 0,4 → 5 bis 16 Tage, 0,35 → 5 bis 22, 0,25 → 7 bis 17.
  Kam der Bot nur mit dem Mindest-Startgeld an (39.000 €), blieb Berlin bei einem Seed über 30 Tage hängen, deshalb
  `START_MONEY_MIN_BY_CITY.berlin` 45.000 € (wie Hamburg). Stellschrauben: `territory/config.ts`
  `SALE_INFLUENCE_FACTOR_BY_CITY` (Berlin 0,25, wirkt am stärksten), `city/config.ts` `START_MONEY_MIN_BY_CITY`,
  Andrang der Spots und Clubs in `spots/config-berlin.ts`, `nightlife` in `veedel/data-berlin.ts`, Stärke der Gangs in
  `gangs/data.ts`.

## Städte (Auftrag 30)

Köln und Hamburg sind zwei Städte in einem Spielstand mit einem Konto. Das Modul `city` hält fest, welche Stadt
**aktiv** ist (auf der Karte, live simuliert), in welcher du **bist** (`present`; unterwegs auf der A1 in keiner),
welche frei sind und was die schlafenden Städte zuletzt erwirtschaftet haben. Stammdaten in `city/data.ts`
(`CITIES`: Kamera, Rahmen, Straßennetz, Hafen, Faktoren für Löhne, Immobilien und Charakter; seit Auftrag 37 auch Berlin;
München und Frankfurt als Schablonen).

- **Stadt-Kennung**: Veedel haben `cityId` (Daten), Spots über ihr Veedel (`spotCity`), Lager (`Warehouse.cityId`),
  Gangs (`Gang.cityId`), Leute (`StaffMember.cityId`), Ware am Kai, Lieferungen und Geldbuchungen (`MoneyTag.cityId`).
  Lesefunktionen nehmen eine Stadt (`getSpots(state, cityId)`, `getWarehouses`, `getGangs`, `getStaff(state,
  { cityId })`, `getStock(state, { cityId })`, `allVeedel(cityId)`); ohne Stadt meinen die meisten die aktive.
- **Nur eine Stadt live**: Ticks von Kunden, Gangs, Polizei, Markt, Territory, Personal und Hierarchie laufen nur für
  die aktive Stadt (`isCityLive`, `liveVeedel`, `isVeedelLive`). Für jede schlafende Stadt bucht `city` um Mitternacht
  den Schnitt der letzten sieben live gespielten Tage (`income.city`/`expense.city`, Faktor 0,85–1,15), danach nimmt
  die Rechte Hand mit Vollmacht ihren Anteil (`share.righthand`), Heat kühlt ab (`police.restHeat`). Lager bleiben
  Daten; was eine Route aus einem schlafenden Lager nimmt, kauft die Rechte Hand um Mitternacht nach. Beim Aufwachen
  (`city.switch`) wird nichts nachgerechnet.
- **Kasse pro Stadt**: Jede Buchung landet in `finance` auch unter ihrer Stadt (aus `cityId`, sonst Spot oder
  Person, sonst die aktive); `cityReport`, `cityDayProfit`, Filter „Stadt“ in der Kasse.
- **Rechte Hand pro Stadt** (`hierarchy.rightHands`), Vollmacht pro Stadt; mit Vollmacht entscheidet sie in einer
  Stadt, in der du nicht bist, auch Konfrontationen.
- **Wege**: `roads` hat ein Netz pro Stadt (eigene Projektion, erst beim ersten Gebrauch dekodiert) und wählt es nach
  dem Ausschnitt; zwischen den Städten Stadt-Anfahrt, A1 (`autobahn.ts`) und Stadt-Zufahrt (`interCityRoute`). Daten
  neu erzeugen: `build-roads.py --city <id>` bzw. `--autobahn <a> <b>`.
- **Logistik**: Häfen pro Stadt (`PORTS`), Routen mit Fahrplan (`routes.ts`), Zoll auf der Autobahn. Lieferanten haben
  `cities`, `deliveryTimes`, `priceFactors`.
- **Charakter**: Stadt-Events (`events`), Klüngel (`relationFactor`, `bribeFactor`, `raidWarningBonus`), Kneipen,
  Nachtleben (`Veedel.nightlife`), Einfluss pro Verkauf (`SALE_INFLUENCE_FACTOR_BY_CITY`).
- **Oberfläche**: Kameras pro Stadt über `registerCityViews`, Ansichten `city:<id>` und `deutschland`
  (`UiApi.flyToCity`, `flyHome`, `flyToDeutschland`, `mapView`), Stadt-Chip ab zwei freien Städten, Apps zeigen die
  aktive Stadt, Nachrichten bleiben global.
- **Porträts** (`src/core/looks.ts`, `src/ui/components/Face.tsx`): `lookFor(seed, name, partial)` würfelt jedes
  Merkmal fest aus Seed und Merkmalsname (kein `ctx.random`), gewichtet nach Alter, Geschlecht, Hautton und einem
  Straßen-Faktor (jung mehr Straße; Anzug und Öljacke dämpfen). Merkmale: Kopfform, Frisur (auch Fade, Cornrows,
  Undercut, Dreads, Braids, Vokuhila), Bart, Brauen, Augen (schwere Lider, Augenringe), Mund (hart, Grinsen, schief,
  müde), Brille, Kopfbedeckung (Cap vorn/hinten, Beanie, Bucket, Durag, Bandana, Kapuze mit Kordeln, Sturmhaube nur bei
  `gang:`/`stranger:`-Seeds), Oberteil (Hoodie, Jogginganzug, Daunen-, Leder-, Bomberjacke, Muskelshirt, offenes Hemd,
  Anzug, Öljacke), Narbe, Veilchen, Tattoo (Hals, Träne, drei Punkte), Goldzahn/Grill, Zigarette/Joint/Zahnstocher,
  Ohrringe, Kette (dünn, dick, Anhänger), Maske (FFP, Schlauchschal). Das alte Eingabefeld `extra` wird übersetzt.
  `Face` zeichnet daraus ein SVG im 64er-Raster mit Schattierung (höchstens ~70 Elemente), lesbar ab 28 px.
- **Anruf und Übergabe** (nach Auftrag 30): Nach „Ich komme nach Hamburg“ mit bereiter Rechter Hand fragt Fiete noch
  im selben Gespräch, ob du Köln jetzt übergibst. „Köln an <Name> übergeben und losfahren“ ist der Befehl
  `city.handOver` (Vollmacht, Hamburg frei, Abfahrt über die A1 in einem Rutsch; vorher wird geprüft, ob du losfahren
  kannst), danach verabschiedet er sich und das Gespräch endet von selbst. „Ich regel vorher noch was“ führt über die
  Karte unter Geld und Heat zum Übergabe-Dialog (`hierarchy.handover`), der sich nicht mehr von selbst öffnet.
- **Eine weitere Stadt** braucht nur Inhalt: Eintrag in `CITIES` (`template` weg; Kontakt und Dreh stehen schon),
  Veedel mit Grenzen (`veedel/data-<id>.ts`, `boundaries-<id>.ts`), Spots, Lager, Gangs, Straßennetz
  (`network-<id>.ts`, in `roads/graph.ts` eintragen; die Enden der Autobahn-Linien in `build-roads.py` `AUTOBAHNEN`
  auf Punkte im Netz legen und `--autobahn all` neu bauen), Hafen in `PORTS` (optional), Lieferanten-`cities`, Events
  in `events/config.ts`, Gespräch in `CITY_OFFERS` (steht schon), Kapitel in `quests/config.ts` (steht schon). Seit
  Auftrag 37 dazu: Einträge in `DEALERS` (customers), `GANG_RIVALRY` und Stimmen für jede Gang (gangs), `TICKERS`
  (police), Zufahrten in `build-roads.py` `CITIES`, Wahrzeichen in `src/map/landmarks.ts`; Städte ohne Hafen prüft
  `check-roads` ohne Hafen. Migrationen für neue Gangs und Veedel: `gangs` und `territory` legen fehlende Einträge wie
  bei einem neuen Spiel an (eine neue Version mit derselben Funktion reicht).

### Berlin (Auftrag 37)

Die dritte spielbare Stadt, nach dem Muster von Hamburg nur aus Daten. Dreh „die Nacht“:
- **Zwölf Ortsteile** (`veedel/data-berlin.ts`, Grenzen `boundaries-berlin.ts` aus Overture, `tools/fetch-divisions.py
  berlin`): viel `nightlife` (bis 2,2 in Friedrichshain), `policePresence` meist unter 1, Kaufkraft von 0,8 (Wedding,
  Lichtenberg) bis 1,5 (Charlottenburg). Verbindungen durch den Tiergarten, über Gesundbrunnen und die Rummelsburger
  Bucht (`LINKS_BERLIN`).
- **40 Spots** (`spots/config-berlin.ts`), alle zum Freischalten, Preise wie in Köln mal 1,2. Vier Clubs haben nur am
  Wochenende offen (`weekHours: CLUB_WEEKEND`, Freitag 22 bis Montag 8 Uhr, Andrang 2 bis 2,5), RAW-Gelände,
  Kulturbrauerei und Nollendorfplatz laufen immer. Fünf Lager zum Kaufen (2.400 bis 3.400 €), kein Hafen.
- **Vier Gangs** (Präfix `be-`, Stimmen in `gangs/texts-berlin.ts`): Die Türsteher (Friedrichshain), Kotti-Familie
  (Neukölln), Leo-Gang (Wedding), Kudamm-Kreis (Charlottenburg); mehr Kampfkraft (70 bis 80) und Leute (18 bis 28) als
  in Hamburg. Methoden alle 5 bis 10 Tage (`METHOD_INTERVAL_BY_CITY`).
- **Polizei locker**: `CHECK_FACTOR_BY_CITY.berlin` 0,75, Bestechung billiger (`bribeFactor` 0,9), Mieten mittel
  (`propertyFactor` 1,2, Löhne 1,1).
- **Events**: Fête de la Musique (sechs Kieze, Andrang 1,8), CSD (Schöneberg und Mitte, keine Razzien), Silvester am
  Brandenburger Tor (Andrang 2,5, Polizei und Gangs unterwegs, Feuerwerk auf der Karte über `FIREWORKS` in
  `events/ui/map.ts`).
- **Lieferanten**: Mirko ist in Berlin zu Hause (`priceFactors.berlin` 0,85, eine Stunde Lieferzeit, `home`); Toni,
  Hein und Daan liefern auch nach Berlin (Zufahrten A115 bzw. A111).
- **Wege**: Straßennetz `network-berlin.ts`; die Linien nach Hamburg und München enden am Dreieck Funkturm im Netz,
  `autobahn.ts` blieb unverändert. Köln–Berlin fährt über Hamburg (es gibt keine A2-Linie).
- **Wahrzeichen**: Fernsehturm, Brandenburger Tor, Oberbaumbrücke. Kontakt Dilara (Clubs in Friedrichshain),
  Event-Kontakt Aylin (Späti am Kotti), Stammabnehmer Yusuf, Lena, Piotr, Jonas.

### Deutschland (Auftrag 36)

- **Freie Reihenfolge**: `NEXT_CITY` ist die Liste der Städte nach Köln. Nach „<Stadt> komplett“ (`campaign.won`)
  startet eine Runde (`offerFrom`): Die nächstgelegene freie, spielbare Stadt ruft `OFFER_CALL_DELAY` später an, die
  übrigen melden sich im Abstand `OFFER_NEXT_DELAY` per Chat („Ruf mich an“). Ein Tipp auf ihre Glas-Karte in der
  Deutschland-Ansicht oder „Ruf mich an“ holt den Anruf (`city.requestCall`, nicht während ein anderer klingelt). Nur
  eine Zusage gilt (`acceptedCity`). Die Übergabe (`city.handOver` oder die Vollmacht direkt) schaltet die zugesagte
  Stadt frei (ohne Zusage die nächstgelegene) und schließt die Runde; eine Stadt wird nur in einer offenen Runde frei
  (nach Widerruf und neuer Übergabe nicht noch einmal). Ist keine Stadt frei, als eine Stadt komplett wird, zählt die
  Runde nicht und kommt nach, sobald eine Stadt spielbar wird. Schablonen rufen nie an.
- **Autobahn-Netz**: `roads/autobahn.ts` mit sechs Linien (Nummern in `refs`), `autobahnPath` sucht den kürzesten Weg
  über die Städte (Dijkstra nach Metern), `interCityRoute` hängt Stadt-Anfahrt, Linien und Stadt-Zufahrt aneinander
  und fährt in einer Stadt dazwischen über ihre Straßen (ohne Netz gerade). Köln–Hamburg bleibt die A1.
- **Statthalter**: So heißt die Rechte Hand mit Vollmacht (`rightHandTitle`), mit Gesicht auf der Glas-Karte und dem
  „Bericht aus <Stadt>“. Schlaf mit Razzia (`sleepResult`): an etwa `SLEEP_RAID_CHANCE` (3 %) der Tage halbes Ergebnis
  oder ein kleines Minus, eine Zeile vom Statthalter, keine Veedel gehen verloren. Ausbau (`expansion`) zählt nicht in
  den Schnitt.
- **Startpaket**: Im Übergabe-Dialog eine neue Rechte Hand (`startPackLeaders`: bis Auftrag 34 Leutnants ab Level 5;
  sie gibt ihre Spots ab, fährt mit und wird bei der Ankunft Rechte Hand mit Stufe nach Level, `installRightHand`),
  bis zu `START_PACK_MAX_STAFF` Leute (`staff.relocate`) und freie Fahrzeuge ohne feste Route (`packVehicles`, kommen
  mit dir an). Dazu Startgeld, einmal pro Stadt (`startMoneyPaid`): `HANDOVER_START_MONEY_DAYS` Tagesgewinne der Stadt,
  mindestens `START_MONEY_MIN_BY_CITY` der Zielstadt, als Umbuchung (`startMoneyFor`, `startMoneyDue`).
- **Ränge** (`city/ranks.ts`): Kleindealer, Händler, Großhändler (höchste `operationTier` deiner Städte), Boss von Köln
  (Mehrheit), Boss von <Stadt> (jede weitere komplette Stadt), Boss von Deutschland (alle spielbaren komplett, mindestens
  `GERMANY_MIN_CITIES` = 4),
  Importeur und Produzent (Platzhalter). Höchster Rang bleibt (`rank`), `player.rankUp` mit Banner und Ton, Titel im
  HUD (Rang) und in der Bestenliste (`runSummary.title`, `rank`).
- **Quests**: Kapitel pro Stadt (`cityId` an der Quest); Peter wartet nach „Ganz Köln“ (`questsWaiting`) und macht mit
  dem Kapitel der Stadt weiter, die du freischaltest.

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
