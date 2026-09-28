# Architektur

Stand: Fundament (Auftrag 00). Kurzfassung und Regeln in [`CLAUDE.md`](../CLAUDE.md), Phasenplan in
[`docs/auftraege/README.md`](auftraege/README.md). Wer eine Schnittstelle erweitert, ergänzt sie hier
(in Phase 1 sammelt das die Integration aus den PR-Beschreibungen ein).

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
- Uhr-Hilfen: `clock.day/hour/minute/weekday/weekdayName/isWeekend/isNight/format/formatLong/formatTime/at`.
  Tag 1 ist ein Freitag, Start 18:00 Uhr (`START_TIME`, `START_WEEKDAY` in `config.ts`).

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
| Nachrichten (`messages.ts`) | `messages.send(ctx, { contact, text, options?, expiresIn? })`, `thread`, `threads`, `unreadCount`, `get`, `contact`, `canAnswer` | Befehle `messages.answer`, `messages.markRead`; Ereignisse `message.received`, `message.answered`, `message.expired` |
| Spielende (`outcome.ts`) | `outcome.gameOver(ctx, 'bankrupt' \| 'killed', detail?)`, `outcome.win(ctx)`, `isOver`, `hasWon` | `game.over`, `campaign.won` |
| Uhr (`clock.ts`) | siehe oben | `clock.hourStarted`, `clock.dayStarted` |
| Format (`format.ts`) | `formatEuro`, `formatAmount`, `formatNumber`, `formatPercent` | |
| Geo (`geo.ts`) | `distanceMeters(a, b)`, `lerpLngLat(a, b, t)` | |

**Nachrichten:** Kontakt-IDs nach dem Muster `'<art>:<id>'` (`'gang:nord'`, `'staff:s12'`, `'supplier:rotterdam'`).
Eine Antwort-Option kann einen `command` tragen; beim Antworten (`messages.answer`) wird er als Spieler
ausgeführt. Schlägt er fehl, bleibt die Nachricht unbeantwortet. Ältere Nachrichten fallen ab `MESSAGE_LIMIT` weg.

**Pleite-Regel:** Module können `solvency(state)` angeben ("kann der Spieler dank mir weitermachen?").
Melden alle `false`, löst der Kern `game.over` mit `bankrupt` aus. Stand jetzt: `goods` (Ware im Lager) und
`suppliers` (Lieferung unterwegs oder genug Schwarzgeld für das günstigste Paket).

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
encounters → goods → laundering → reputation → suppliers → veedel → gangs → market → spots
→ customers → staff → hierarchy → recruiting → territory → police → weather
```

Bekannte Kanten, die keinen Zyklus bekommen dürfen: `territory → gangs` (Startverteilung), `staff → customers`
(Läufer bedienen nach dem Kunden-Tick), `police → territory`, `hierarchy/recruiting → staff`.

## Oberfläche (`src/ui/`)

- **Shell** (`shell/`): Karte vollflächig, HUD oben, Seitenleiste mit Tabs (am Handy Bottom-Sheet), Panel-Bereich
  (Desktop unten links, Handy Bottom-Sheet), Handy-Rahmen, Dialoge, Toasts, Hinweis beim Karten-Klick.
- **Laufzeit** (`runtime.ts`): `UiRuntime` hält den reinen UI-Zustand (`UiState`) und die `UiApi`. Neuzeichnen nach
  Simulationsschritten, gedrosselt auf ca. 10 Mal pro Sekunde; in der Pause nur bei UI-Änderungen.
- **Hooks** (`hooks.ts`): `useGame()` → `{ state, dispatch }`, `useUi()` → `UiApi` + `state`, `useSession()`.
- **UiApi:** `dispatch` (Toast bei Fehler), `openPanel/closePanel`, `openDialog/closeDialog`, `toast(text, kind)`,
  `openPhone(appId?)/closePhone`, `selectTab`, `setSheetExpanded`, `setSpeed`, `togglePause`,
  `pickLocation(prompt)` (nächster Karten-Klick als Promise), `cancelPick`, `flyTo`, `flyToKoeln`, `flyToEuropa`.
- **Registries** (`registry.ts`, alle über `src/ui/index.ts`):

| Funktion | Wofür | Kern-Einträge |
| --- | --- | --- |
| `registerHudItem({ id, order, component })` | Anzeige im HUD | Geld (10), Lager (20, goods), Uhr (90) |
| `registerTab({ id, title, order, component?, badge? })` | Seitenleisten-Tab; ohne `component` zeigt er den Slot `tab:<id>` | `business` "Geschäft" (10), `journal` "Ereignisse" (90) |
| `registerSlot(name, { id, order, component })` | Abschnitt in einem Slot | `tab:business`: Lieferanten (10), Läufer (20), Statistik (30); `spots.spotPanel`: Kunden (10), Läufer (50) |
| `registerPanel({ id, title, component })` | Detailansicht, `ui.openPanel(id, props)` | `spots.spot` |
| `registerDialog({ id, component, pausesGame?, dismissable? })` | Dialog, `ui.openDialog(id, props)` | `core.newGame`, `core.saves`, `core.gameOver`, `core.won` |
| `registerPhoneApp({ id, name, icon, order, component, badge? })` | App im Spiel-Handy | `core.messages` "Nachrichten" |
| `onGameEvent(type, id, (payload, ui, state) => …)` | Reaktion auf Ereignisse (Toast, Dialog, Sound) | Game Over, Sieg, neue Nachricht |

- **Bausteine** (`components/`): `Button` (variant `default|primary|danger|subtle|link`, `active`, `wide`, `small`),
  `SegmentedControl`, `Card`, `Hint`, `Empty`, `KeyValue`, `Stat`, `Badge`, `ProgressBar` (`tone accent|warn|bad`),
  `List`/`ListItem`, `Tabs`, `Dialog`. Props werden nur erweitert, nie gebrochen.
- **Design-Tokens** (`styles/tokens.css`): `--color-*`, `--font-*`, `--space-1…6`, `--radius-*`, `--shadow-*`,
  Layout-Maße und `--z-*`. Module verwenden nur diese Variablen.
- **Start** (`start.tsx`): Registriert die Kern-Oberflächen, lädt alle `src/modules/*/ui/index.ts(x)`, setzt den
  Autosave fort oder öffnet "Neues Spiel". URL-Parameter: `?neu=normal|hardcore&seed=123&tempo=0`.
  `window.koeln = { session, runtime }` zum Ausprobieren und für Playwright.

## Karte (`src/map/`)

- `GameMap.ts`: MapLibre mit Satellitenbild und 3D-Gebäuden (`style.ts`), Kamera 3D schräg, Köln/Europa,
  Padding für die Seitenleiste, `pickLocation()`.
- `registerMapLayer({ id, order, mount(ctx) { …; return { update(state, ui), destroy() } } })`.
  `ctx` hat `map`, `ui`, `getState()`, `isPicking()`. Quellen- und Layer-IDs mit Modul-Präfix.
- Hilfen: `addHtmlMarker(map, { position, className, children, onClick, anchor, tag })`, `el(tag, class, text)`,
  gemeinsame Marker-Stile `.map-place`, `.map-place-icon`, `.map-place-name` (`map.css`).
- Layer jetzt: `suppliers.routes` (Route, Hafen, Transporter), `goods.warehouses` (Lager), `spots.markers`.
- Eigene Klicks auf die Karte: immer über `ui.pickLocation(...)`; eigene Klick-Handler auf Layern prüfen
  `ctx.isPicking()`.

## Module

"Stub" heißt: Schnittstelle da und lauffähig, Inneres folgt im genannten Auftrag.

| Modul | Auftrag | Stand | Zustand | Öffentliche API | Befehle | Ereignisse |
| --- | --- | --- | --- | --- | --- | --- |
| `veedel` | 10 | Stub: 12 Veedel mit Mittelpunkt, neutrale Eigenschaften | – (statisch) | `allVeedel()`, `getVeedel(id)`, `veedelName(id)`, `veedelAt(lng, lat)` (nächster Mittelpunkt, null außerhalb), `neighborsOf(id)`; `Veedel { id, name, district, center, purchasingPower, policePresence, density, description }` | | |
| `territory` | 10 | Stub: Startverteilung, lesen/ändern | `influence[veedel][fraktion]`, `controller[veedel]` | `PLAYER_FACTION`, `getInfluence`, `influenceIn`, `addInfluence(ctx, veedel, fraktion, delta)`, `controllerOf`, `controlledBy`, `factions`, `factionName`, `factionColor` | | `territory.controlChanged` |
| `police` | 10 | Stub: Heat lesen/erhöhen, verpfeifen | `heat[veedel]` | `getHeat`, `addHeat(ctx, veedel, n)`, `snitchOnGang(ctx, gangId)` | `police.snitch` | `police.raid`, `police.arrest`, `police.tipOff` |
| `gangs` | 11 | Stub: 3 Platzhalter-Gangs | – | `getGangs(state)`, `getGang(state, id)`; `Gang { id, name, color, homeVeedelId }` | | |
| `encounters` | 11 | Stub: entscheidet sofort per Zufall | `active`, `history` | `startEncounter(ctx, { kind, veedelId?, spotId?, staffIds?, playerPresent?, opponent?, origin? })` → `{ encounterId }`, `getEncounter`, `activeEncounters`, `ENCOUNTER_KINDS` (raidDefense, policeChase, debtCollection, dealGoneWrong) | | `encounter.started`, `encounter.resolved` (`outcome: success\|failure\|retreat`, `request.origin`, `playerKilled`) |
| `goods` | 12 | portiert: ein Produkt, ein Lager | `stock[lager][produkt]` | `allProducts`, `getProduct`, `getWarehouses`, `getWarehouse`, `getStock(state, { productId?, warehouseId? })`, `store(ctx, …)`, `take(ctx, { productId, amount, warehouseId?, partial? })` → `{ taken, quality }`; `DEFAULT_PRODUCT`, `DEFAULT_WAREHOUSE`, `STANDARD_QUALITY` | | `goods.stored`, `goods.taken` |
| `market` | 12 | Stub: Grundpreis × Kaufkraft × Konkurrenz | `competition[veedel]` | `referencePrice(state, produkt, veedel)`, `getCompetitionFactor`, `setCompetitionFactor(ctx, veedel, faktor)` (für die Gangs) | | `market.competitionChanged` |
| `suppliers` | 12 | portiert: Rotterdam, Transporter | `shipments` | `getSuppliers`, `getSupplier`, `shipmentsInTransit`, `shipmentProgress`, `cheapestPackagePrice` | `suppliers.order` | `shipment.ordered`, `shipment.arrived` |
| `customers` | 12 | portiert: Kunden an Spots, Verkauf, Statistik | `waiting`, `nextSpawnAt`, `stats` | `waitingAt`, `allWaiting`, `getCustomer`, `canServe`, `customerRevenue`, `getSalesStats`, `CUSTOMER_PATIENCE` | `customers.serve` (`sellerId` für Läufer), `customers.serveAll` | `sale.completed` (`channel, spotId, veedelId, productId, amount, quality, revenue, sellerId, customerId`), `customer.arrived`, `customer.left` |
| `spots` | 12 | portiert: 10 Spots mit `veedelId` | – | `getSpots(state)`, `getSpot`, `spotsInVeedel`; Panel `spots.spot`, Slot `spots.spotPanel` | | |
| `reputation` | 12 | Stub | `value` (0–100) | `getReputation`, `changeReputation(ctx, delta)` | | `reputation.changed` |
| `laundering` | 12 | Stub: sofort gegen 20 % Gebühr | Summen | `launderingFee`, `getLaunderingStats` | `laundering.launder` | `laundering.completed` |
| `staff` | 13 | portiert: Läufer an Spots, Löhne; Haft bei `police.arrest` | `members` | `getStaff(state, { role?, status?, spotId?, veedelId? })`, `getStaffMember`, `getStats` (speed, caution, strength, charisma, loyalty), `runnerAt`, `findAvailable(state, { role })`, `assign(ctx, id, assignment)`, `setStatus(ctx, id, status)`, `bonus(state, 'bailDiscount' \| 'launderingFeeDiscount' \| 'raidWarning')`, `dailyWages` | `staff.hireRunner`, `staff.fire`, `staff.assign` | `staff.hired`, `staff.left`, `staff.statusChanged`, `staff.assigned` |
| `hierarchy` | 13 | Stub: Leutnant ernennen/abberufen | `lieutenants[veedel]` | `getLieutenant`, `getLieutenants` | `hierarchy.appoint`, `hierarchy.dismiss` | `hierarchy.appointed`, `hierarchy.dismissed` |
| `recruiting` | 13 | Stub: leerer Pool | `candidates` | `getCandidates` | | |
| `weather` | 14 | Stub: immer klar | – | `getWeather(state)` → `{ kind, temperature }`, `weatherDemandFactor(state)`, `WEATHER_NAMES` | | |

## Was die parallelen Sessions vorfinden (Phase 1)

**Alle:** Kern mit Befehlen, Ereignissen, Zufall, Uhr, Geld, Journal, Nachrichten, Spielende und Spielständen;
Modul-Ordner mit lauffähigen Stubs; UI-Registries, Bausteine, Tokens; Karten-Registry; `createTestGame()`;
`npm run check`, `npm run screenshot`. Eigene Zustandsänderungen brauchen Version + Migration.

- **Auftrag 10 (veedel, territory, police):** `veedel` hat IDs, Namen, Mittelpunkte, neutrale Eigenschaften
  (`purchasingPower`, `policePresence`, `density` = 1, `description` leer) und eine Nachbarschaftstabelle – Grenzen,
  echte Werte und `veedelAt` per Polygon ersetzen das Innere, die Funktionen bleiben. `territory` verteilt die
  Veedel zu Beginn an die Gang mit dem nächstgelegenen Heimat-Veedel (60 Einfluss), Kontrolle ab 50; Einfluss
  durch Verkäufe fehlt noch (`sale.completed` hat `veedelId`). Sieg: `outcome.win(ctx)`. `police` hat Heat und
  `police.snitch`; `police.raid`/`police.arrest` sind deklariert, `staff` setzt bei `police.arrest` schon den
  Haft-Status. Polizeiflucht: `startEncounter(ctx, { kind: 'policeChase', origin: { module: 'police' } })` und auf
  `encounter.resolved` hören. Beschlagnahme: `take(ctx, { partial: true })` und `wallet.lose`. Mitarbeiter im
  Veedel: `getStaff(state, { veedelId })`. HUD: `registerHudItem`, Veedel-Panel: `registerPanel`, Karte:
  `registerMapLayer` (Klicks mit `ctx.isPicking()` prüfen).
- **Auftrag 11 (gangs, encounters):** 3 Platzhalter-Gangs mit `id`, `name`, `color`, `homeVeedelId` – ersetzen und
  erweitern (Zustand über Migration von "ohne Zustand"). Reviere über `territory` (`addInfluence`, `controlledBy`,
  `controllerOf`, `PLAYER_FACTION`), Nachbarn über `neighborsOf`. Preise drücken: `setCompetitionFactor(ctx,
  veedel, 0.8)`. Verpfeifen: Befehl `police.snitch`. Mitarbeiter-Werte: `getStats`, Verletzung/Tod:
  `setStatus(ctx, id, 'injured' | 'dead')`. Ware/Geld rauben: `take`, `wallet.lose`. Drohungen: `messages.send` mit
  Optionen, die eure Diplomatie-Befehle auslösen. Tod: `outcome.gameOver(ctx, 'killed')`. `encounters` hat den
  Ablauf "start → `encounter.resolved`" schon; der Dialog kommt über `registerDialog({ pausesGame: true })` und
  `onGameEvent('encounter.started', …)`. **Nicht** `dependsOn: ['territory']` in `gangs` eintragen (Zyklus).
- **Auftrag 12 (goods, market, suppliers, customers, spots, reputation, laundering):** Der Prototyp ist
  portiert und spielbar. `sale.completed` hat schon `channel` (street/delivery/wholesale) und `quality`.
  `customers.serve` mit `sellerId` wird von den Läufern (staff, Auftrag 13) benutzt – Payload nur erweitern.
  Kaufkraft: `getVeedel(id).purchasingPower`, Wetter: `weatherDemandFactor(state)`, freie Kuriere:
  `findAvailable(state, { role: 'courier' })` + `assign(ctx, id, { kind: 'delivery', targetId })`, Buchhalter:
  `bonus(state, 'launderingFeeDiscount')`. Eigene Spots per Klick: `ui.pickLocation(...)` + `veedelAt`.
  Handy-Apps: `registerPhoneApp`, Aufträge als Nachrichten mit Optionen. Das Spot-Panel gehört `spots`; andere
  Module hängen sich über den Slot `spots.spotPanel` ein. **Nicht** `dependsOn: ['staff']` in `customers`
  eintragen (Zyklus, `staff` hängt von `customers` ab).
- **Auftrag 13 (staff, hierarchy, recruiting):** Mitarbeiter haben schon `role`, `status`, `stats`, `level`, `xp`,
  `wage`, `assignment`, `portrait`. Läufer bedienen per `ctx.dispatch({ type: 'customers.serve', … },
  { actor: 'staff:<id>' })` – genau so handeln später Leutnants. `hierarchy` hat `hierarchy.appoint/dismiss`,
  `recruiting` einen leeren Pool. Andere erwarten von euch: `getStats`, `getStaff`, `findAvailable`, `assign`,
  `setStatus`, `bonus` und die Reaktion auf `police.arrest` – erweitern, nicht brechen. Die Läufer-Box im
  Spot-Panel und die Läufer-Liste im Tab "Geschäft" liegen schon in `staff/ui/`. Heat durch Verrat:
  `addHeat` aus `police`.
- **Auftrag 14 (ui, map, audio, weather, public):** Shell, Registries, Bausteine und Tokens stehen im Look des
  Prototyps. Look über Tokens und das Innere der Bausteine ändern, Props/Exporte nur erweitern (alle anderen
  Sessions nutzen sie gleichzeitig). Handy-Rahmen (`phone/PhoneFrame.tsx`) und Nachrichten-App
  (`phone/MessagesApp.tsx`) sind einfache Platzhalter auf Basis von `messages` aus dem Kern. Ereignisse für Sound
  und Benachrichtigungen: `onGameEvent` oder `session.onEvent`. Uhr für Tag/Nacht: `clock.dayProgress`,
  `clock.hour`. `weather` ist ein Stub ohne Zustand (`getWeather`, `weatherDemandFactor` behalten). Karte:
  `GameMap.ts`, `style.ts`, Marker-Hilfen; Effekt-Werkzeuge kommen in `src/map/index.ts` dazu.

## Qualität

- `npm run check` = Typecheck + `npm run lint` (Biome + `scripts/check-boundaries.mjs`) + Tests.
- CI (`.github/workflows/ci.yml`): Typecheck, Lint, Tests, Build und `npm run template:smoke` (kopiert die
  Vorlage als neues Modul und prüft, dass nichts außerhalb des Ordners geändert werden muss).
- Kern-Tests: fester Zeitschritt (`loop.test.ts`, `sim.test.ts`), Determinismus, Befehle, Ereignisse,
  Speichern/Laden mit Migration und Hardcore (`persistence.test.ts`), Game Over, Nachrichten.
