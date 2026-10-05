# Köln Tycoon – Hinweise für Claude-Sessions

Browserspiel (Vite + TypeScript + Preact + MapLibre). Was das Spiel werden soll: `docs/konzept.md`.
Ausführliche Architektur mit allen Modulen, APIs, Befehlen und Ereignissen: `docs/architektur.md`.
**Parallele Sessions:** Regeln, Phasen und wer welche Ordner besitzt stehen in `docs/auftraege/README.md`. Lies das zuerst.
Phase 0 (Fundament), Phase 1 (Aufträge 10–14) und Phase 2 (Integration, Auftrag 20) sind erledigt; alle Systeme
sind verbunden. Dazu Auftrag 21: echtes Straßennetz (`roads`), Logistik mit Hafen, Fahrern und mehreren Lagern
(`logistics`), Lieferanten zum Freischalten. Auftrag 24: Geldbuch und Kasse (`finance`), Stillhaltegeld in Haft, Leutnants mit bis
zu drei Spots, Rechte Hand, Polizei-Härte nach Größe des Geschäfts. Auftrag 26: Handy aufgeräumt (sechs Apps, vier im Dock,
schwarzer Startbildschirm, Verlauf und Wetter in den Einstellungen, Chats löschen, Banner nur für Dringendes, HUD mit
Ruf · Reviere und aufklappbarem Lager). Auftrag 28: Spots in jedem Veedel, keine Kuriere mehr, nur die Rechte Hand fährt
Aufträge aus und hat Aufgaben mit Stufen (`hierarchy/tasks.ts`); Nachrichten tragen `routine` (Rechte Hand darf antworten)
oder sind Chefsache. Auftrag 27: Kasse als Bilanz (Zeitraum, Filter Köln/Veedel/Spot/Leutnant, `balance`), Geldwäsche mit
drei Wegen (`laundering/config.ts`), mehr Bewerber und Rumfragen mit Rollenwahl, Gangs-Kopf mit Stärke, Optik-Regeln in den
Bausteinen (Chips statt „a · b“, Gruppen mit Unterlage, `Disclosure`, kein Umbruch im Wort). Auftrag 29: Quests von Peter
(`quests`, Karte unter Geld und Heat im HUD, HUD-Platz `'below'`), Intro mit Spielername beim ersten Start (`src/ui/player.ts`),
gemeinsame Bestenliste (`leaderboard`, Server `api/leaderboard.ts` auf Vercel mit Upstash Redis, lokal aus).
Auftrag 30: Köln komplett erst bei 12 Veedeln (7 = Meilenstein „Boss von Köln“), Anrufe im Handy (`messages.call`),
Vollmacht der Rechten Hand (80 % vom Tagesgewinn), zweite Stadt Hamburg (Modul `city`: aktive Stadt live, die andere
schläft mit Tagesergebnis; `present`, Fahrt über die A1), Rechte Hand pro Stadt, Straßennetz pro Stadt plus A1
(`roads`), Routen mit Fahrplan und Zoll (`logistics/routes.ts`), Stadt-Events (`events`), Klüngel, Kneipen.
Auftrag 31 (Karte lebt): Verkehr als Kulisse (`roads.traffic`, `createFleet`: eine WebGL-Ebene, eigener Zufall, Einstellung
Verkehr aus/wenig/normal), Leute an Spots (`spots.people`, SDF-Figur), Fahrzeuge halten an der Straße (`roadRoute(…).drive`,
Fußweg `addFootpath`), Autobahn-Zufahrten (`roadApproach`, `Supplier.via`), Rhein und Elbe aus Overture (`shipRoute`,
`tools/build-water.py`), Hamburger Wahrzeichen, Quellenangabe im Spiel, Prüfskript `scripts/check-roads.mjs` in `npm run lint`.
Optik liest nur und nutzt nie `ctx.random()`; Layer bekommen `update()` nur bei Änderungen; Animationen hängen am gemeinsamen
Takt `onMapFrame` (Pause bei Tempo 0). Budget und Messhilfe `?perf=1`: `src/map/README.md`, Abschnitt "Performance-Budget".
Nach Auftrag 30: Zufahrten auch in Hamburg (`Supplier.via` pro Stadt, `supplierVia`), Elbe bis zum Liegeplatz, Kamera pro
Stadt (`CITIES` `view.pitch`/`bearing`), Verkehr in der aktiven Stadt, Deutschland-Ansicht (Marker der Stadt mit
`addHtmlMarker({ near: true })` sind unter `FAR_ZOOM` aus, Wechsel beim Zoomen, A1 in Gold während einer Fahrt), Kneipen
mit Bierglas, Kölner Lichter und Hafengeburtstag auf der Karte (`events/ui/map.ts`, Effekt `firework`).
Auftrag 35 (Konfrontationen neu): Jede Runde zeigt die Absicht der Gegenseite (`encounters/intents.ts`), zwei Zeiger
(Aggression ab 70 Schlägerei, Entschlossenheit unter 30 Abzug), die Polizei-Uhr und die Einsätze (einen pro Runde
schützen, `result.parts`); Handlungen verschieben die Zeiger (`actions.ts`), der Würfel entscheidet nur die Stärke
(`tactics.ts`). Crew bis zu drei mit Spezialzügen (`crew.ts`, Haken `specialMoves(member)`), Rat der Rechten Hand
(`advice.ts`), Zollkontrolle `customsCheck` (`request.setting` 'autobahn'/'port'). Neue Anlässe, Absichten,
Handlungen und Situationstexte sind reine Daten.
Anrufe mit Stimme und Figuren mit Gesicht: Im Anruf spricht die Figur ihre Zeilen (`audio.speak`) mit dem Sprachmodell
Piper im Browser (`src/audio/piper/`: Worker mit ONNX Runtime Web und espeak-ng als WebAssembly, Modelle „Thorsten“ und
„Kerstin“ einmalig von Hugging Face in den Cache, Einstellungen › Ton zeigt und löscht sie; die Sprachausgabe des
Browsers ist nur die Notlösung); abschaltbar in Einstellungen › Ton und im Gespräch. Im Gespräch sind Musik, Effekte
und Geräusche aus (`audio.setCall`), klingelt es, lädt das Modell schon (`audio.prepareVoice`), die Zeilen werden
vorgerechnet (`audio.prepareSpeech`). Was danach kommt (Reaktion, Rückfrage), wird noch im Gespräch beantwortet, und
ist nichts mehr offen, legt die Figur auf. Fietes Übergabe läuft im Anruf (`city.handOver`).
Kontakte tragen `role`, `about`, `look` (Aussehen, auch teilweise) und `voice`; Personen ohne eigenes Aussehen bekommen
eines fest aus dem Namen (`personLook`, `src/core/looks.ts`), gezeichnet von `Face` bzw. `<Avatar look>`. Antippen des
Porträts im Chat öffnet das Profil (`core.contact`). Die Porträts sind Kiez: `Look` hat neben Frisur, Bart, Brille,
Kopfbedeckung und Oberteil (Fade, Cornrows, Dreads, Cap nach hinten, Durag, Bandana, Sturmhaube nur für `gang:`-Seeds,
Daunen-, Leder-, Bomberjacke …) auch Kopfform, Brauen, Augen, Mund, Narbe, Veilchen, Tattoo, Goldzahn/Grill, Zigarette,
Ohrringe, Kette und Maske; jedes Merkmal würfelt fest aus Seed und Merkmalsname (`roll`), gewichtet nach Alter,
Geschlecht und einem Straßen-Faktor. Das alte Feld `extra` bleibt als Eingabe gültig, `lookTraits` beschreibt alles.
Auftrag 23: Texte mit Varianten über den Text-Helfer `texts.pick(ctx, '<art>:<wer>:<anlass>', liste, vars)` aus dem Kern
(keine direkte Wiederholung, Gedächtnis im Spielstand), nie `ctx.pick` für Nachrichten. Gangs haben Stimmen und Methoden
(`gangs/texts.ts`, `traits.methods`, `gangs/methods.ts` mit Vorfällen und `gangs.respond`), Lieferprobleme Gründe und
Entscheidungen (`suppliers/problems.ts`, `troubles.ts`, `suppliers.resolveProblem`), Spots Arten, Bekanntheit und Ausbau
(`spots/kinds.ts`, `spotDemandFactor`, `spotModifiers`).
Auftrag 32 (Markt und Verträge): Preisindex pro Ware und Stadt (`market.priceIndex`, Richtpreis ganz, Einkauf über
`purchaseIndex` zur Hälfte), Rabatt-Aktionen (`suppliers.getDeals`), Marktereignisse ohne Gebiet (`events.marketEvents`),
Marktbericht montags, Bestellregel mit `maxIndex`, Qualität treibt Nachfrage am Spot (`customers/quality.ts`),
Wochenverträge (`quests/contracts.ts`, Befehl `quests.acceptContract`, Belohnung `trust`). Neue Zufallswürfe ändern die
Würfelfolge eines Moduls: Szenario-Tests mit festem Seed können dann kippen (Autopilot läuft deshalb mit Seed 12).
Auftrag 33: Lager haben Platz in Gramm und Ausbau (`goods.upgradeWarehouse`: Regale, Tresor, Tarnung; `warehouseModifiers`
fragen `police` und `encounters`). **Lieferungen und Fahrten lagern mit `storeFitting` ein** (nimmt nur, was passt, und meldet
den Rest); `store` überfüllt (nur für Beute und Rückgaben). Neues Modul `fleet` (Fahrzeuge mit Ladung, Tempo, Kontrollfaktor;
ohne eigenes das Privatauto, in der Stadt ohne Grenze, auf Routen 5 kg), Fahrten wählen `vehicleId` und `choice` (Autobahn, Landstraße, nachts; `roads` nimmt
`{ weights }` pro Straßenart), Liegeplatz-Stufen (`logistics.upgradeBerth`), Container-Pakete (`container: 'full' | 'shared'`),
Warenfluss (`goods.usagePerDay`) in der Lager-App, Ebene „Lieferwege“.
Auftrag 34 (Leute und Gegner): Leute haben Eigenschaften (`traits`, `TRAITS` in `staff/config.ts`, Wirkung nur über
`traitFactor`), Beziehungen (`relationsOf`) und Geschichten als Daten (`staff/stories.ts`, Antwort `staff.storyChoice`);
**Würfeln, das Spielstände nicht verschieben soll, geht fest aus einem Schlüssel** (`rollTraits`, `keyedRandom`) statt mit
`ctx.random()`. Gangs merken sich etwas mit `remember(ctx, gangId, kind)` (`MEMORIES`, verblasst), Verhältnisse unter den
Gangs stehen in `gangs/data.ts` (`GANG_RIVALRY`), Gang-Kriege in `gangs/war.ts`. Dealer sind Stammabnehmer mit Vertrauen
(`customers/dealers.ts`), Capos führen Leutnants (`hierarchy/capo.ts`, `getCapos`), der Rat im Tagesbericht ist eine
Liste von Regeln (`REPORT_TIPS` in `hierarchy/advice.ts`).
Auftrag 36 (Deutschland): Reihenfolge der Städte nach Köln frei (`NEXT_CITY` ist eine Liste, Angebote pro Stadt in
`city.offers`, `city.answerOffer`/`city.handOver` mit Stadt, `city.requestCall`; jede Stadt in `CITIES` mit `contact`
und `pitch`, Gespräche in `CITY_OFFERS`), Autobahn-Netz (`roads/autobahn.ts`, sechs Linien, `autobahnPath`,
`interCityRoute` über eine Stadt hinweg; neu bauen mit `build-roads.py --autobahn all`), Statthalter (`rightHandTitle`),
Razzia im Schlaf, Startgeld und Fahrzeuge bei der Übergabe (`city.handOver`, `pack.vehicleIds`), Ränge des Spielers (`city/ranks.ts`, `playerRank`, Ereignis `player.rankUp`), Quest-Kapitel pro Stadt (`cityId`
an der Quest). Stellschrauben für das Tempo späterer Städte: `FULL_POWER_SHARE`, `HANDOVER_START_MONEY_DAYS`,
`START_MONEY_MIN_BY_CITY`. **Leute bleiben in ihrer Stadt** (Feedback vom 05.10.2026): kein Startpaket mit Rechter
Hand oder Leuten, kein `staff.relocate`, Fahrer auf Routen in eine andere Stadt kommen immer zurück. In jeder neuen
Stadt fängt der Spieler ohne Rechte Hand, ohne Leute und ohne Routen an und bestellt selbst.
Auftrag 37 (Berlin): dritte spielbare Stadt nur aus Daten (`veedel/data-berlin.ts`, `spots/config-berlin.ts`,
`gangs/texts-berlin.ts`, `roads/network-berlin.ts`, Einträge in den Listen der anderen Module). Neu und allgemein:
`Spot.weekHours` (Öffnungszeiten über die Woche, Berliner Clubs Fr 22 bis Mo 8 Uhr) und `Supplier.home` (Lieferant ist
in einer Stadt zu Hause, Hein in Hamburg, Mirko in Berlin). Neue Städte legen Spots und Gang-Stimmen am besten in eigene
Dateien und spreizen sie in die Listen ein.
Auftrag 38 (München): vierte spielbare Stadt, nur Daten nach der Checkliste (`veedel/data-muenchen.ts`, Gangs `mu-` mit
Stimmen in `gangs/texts-muenchen.ts`, `network-muenchen.ts`); Dreh teuer und streng über `CITIES`, `MIN_TIER_BY_CITY`,
`CHECK_FACTOR_BY_CITY`, Events Oktoberfest und Bayern. Neu und allgemein: `Supplier.customs` (Zoll an einer Grenze),
`requires.city` (Lieferant meldet sich erst in dieser Stadt), Bot `cityOrder` (`BALANCE_ORDER=muenchen npm run balance`).
Auftrag 39 (Frankfurt, optional): fünfte spielbare Stadt nach Checkliste, Dreh nur als Daten (Kofi am Flughafen mit
`Supplier.customs` und Weg `'air'`, `LAUNDERING_CAPACITY_BY_CITY`, `CityDef.offerRank`). Gang-Stimmen einer neuen Stadt in
eigener Datei (`gangs/texts-frankfurt.ts`). Würfe, die für noch nicht freie Städte nichts bewirken, unterbleiben (sonst
verschiebt jede neue Stadt die Kölner Würfelfolge, siehe `market.stepIndex`).
Auftrag 40 (Verkauf und Hafen): Sind alle spielbaren Städte komplett (`isBossOfGermany`), ruft Jansen an; `city.sell`
verkauft das Geschäft an die Statthalter (Preis `SALE_PROFIT_DAYS` Tagesgewinne, Rotterdam `ROTTERDAM_SHARE` davon) und
fährt dich nach Rotterdam (Ort im Ausland: `ABROAD_CITIES`, `CityDef.abroad`, ohne Veedel). Ereignis `business.sold`: Module
räumen ihren Teil selbst auf (logistics Routen, laundering vierter Weg). Danach `isBusinessSold`: keine Kasse pro Stadt,
kein Schlaf, Rang Importeur. Neues Modul `trade`: Kunden (alte Organisationen mit Abnahmevertrag, je Stadt eine Gang,
fremde Städte als Daten), eine Bestellung pro Kunde und Woche mit Waren (`OrderItem`, Teillieferung), Konkurrenz aus
`suppliers.rivalOffers`, Container bei Produzenten (`trade/data.ts`), Zoll-Heat pro Hafen in `police` (`customsHeat`,
`customsArrival`), Häfen als Daten in `logistics` (`HARBOR_PORTS`), Lkw nur an einem Ort im Ausland (`harborOnly`). Eine App
kann zeitweise eine andere im Dock ersetzen (`registerPhoneApp({ dock: { replaces, when } })`). Ein Ort ohne Veedel darf
nichts kaputt machen: Code, der `liveVeedel(state)[0]` o. ä. nimmt, braucht einen Fall für die leere Liste.
Auftrag 41 (Schiffe und Europa): Seewege aus Overture-Tiefen (`roads.seaRoute`, `build-water.py --sea`), Laufzeit aus
Kilometern, Hafen-Lager mit Platz und Hallen (`trade.buildHall`, Rest wartet am Kai mit Liegegeld), eigene Schiffe in
`fleet` (`VehicleModel.ship`, `trade.sail` hin und zurück; Schiffe fahren nie auf der Straße, `freeVehicles` lässt sie
weg), Deckladung (`COVERS`), Europa-Kunden als Daten (`EUROPE_CITIES` mit Grenze, Woche, Preis) über neue
Autobahn-Linien.
Auftrag 42 (Produktion): Neues Modul `grow` (Fincas in Kolumbien und Marokko, Kette bis ins Ausfuhrlager, Kartell und
Behörden als zwei Zahlen pro Region, Ziele `growGoals` für die Ränge Produzent und Europa). Regionen im Ausland sind
Daten in `city` (`REGIONS`, `isRegion`), keine Orte zum Spielen; Leute dort (Rollen `worker`, `gardener` in `staff`)
haben die Region als `cityId` und sind nie live. Eigene Ware fährt über `trade` (`OWN_ORIGINS` als Produzenten,
`storeExport`, `StockLot.own`, `trade.delivered` mit `ownAmount`), keine zweite Logistik. grow würfelt nur über
`cityDayDice`/`keyedDice`. Seewege über den Atlantik in einem eigenen Ausschnitt (`build-water.py`, `OCEAN_LANES`).
Auftrag 43 (Feedback 05.10.2026, `docs/auftraege/43-feedback-staedte-hafen.md`): Leute bleiben in ihrer Stadt (siehe
oben), das Handy zeigt nur die aktive Stadt (`shipmentsInTransit(state, cityId)`, `tripTouchesCity`, `placeCity`),
Test-Spielstände pro Stadt. Hafen-Phase: Kapitel „Rotterdam“ mit Jansen (`QuestDef.voice`, `requires`, `goTo`
`trade`/`tradeHarbor`, `openPhone('trade.app', { view })`), mit dem Verkauf fallen die alten Kapitel weg; erste Runde
Bestellungen nur mit Ware aus der Halle; Fenna übernimmt Annehmen, Ausliefern und Nachkauf (`trade/plans.ts`,
`trade.setPlan`, `trade.addRestock`); Kunden-Seite `trade.customer`; „Dein Preis“ wirkt auf den Preis pro Gramm; nach
dem Verkauf führen alte Hafen-Seite und Lieferanten-App in die App Handel, Apps und Tabs können mit `hiddenWhen`
zeitweise verschwinden, das HUD zeigt Zoll und Ruf als Lieferant.
Wie alles zusammenspielt: `docs/architektur.md`, Abschnitte "Zusammenspiel der Systeme" und "Städte".

## Architektur in Kürze

```
src/core/      Kern: Spielzustand, Simulation (feste Schritte), Befehle, Ereignisse, Zufall, Uhr,
               Geld (wallet), Journal, Nachrichten, Spielende, Speichern/Laden, Spielschleife
src/modules/   Spielsysteme, je ein Ordner = ein Modul (veedel, spots, staff, roads, logistics …), automatisch gefunden
  <id>/index.ts     Registrierung (defineModule) + öffentliche API. Andere importieren NUR hieraus.
  <id>/config.ts    einstellbare Werte (Balancing)
  <id>/*.test.ts    Tests neben dem Code
  <id>/ui/index.tsx Oberfläche des Moduls (Panels, Tabs, HUD, Karten-Layer …), automatisch geladen
  _template/        kommentierte Kopiervorlage (wird nicht registriert)
src/ui/        Oberfläche (dunkel; iPhone mit Dynamic Island als Zentrale): Shell, Registries, Bausteine, Design-Tokens (styles/), Handy (phone/)
src/map/       Grundkarte (MapLibre, gedämpfter Look), Registry für Karten-Layer, Effekt-Werkzeuge (3D-Fahrzeuge, Hotspots …)
src/audio/     Musik und Soundeffekte (für Module über src/ui erreichbar)
src/playtest/  Tests über alle Module: Bot fürs Balancing (bot.ts), Spielende (endings.test.ts)
scripts/       Ordnerregel-Check, Vorlagen-Test, Screenshots, Ende-zu-Ende-Test, Durchspielen im Browser
```

Datenfluss: **Die UI liest den Zustand und schickt Befehle, sonst nichts.** Die Simulation ändert den Zustand
nur in `tick`, Befehls-Handlern und Ereignis-Handlern. Alles ist deterministisch (gleicher Seed + gleiche Befehle
= gleiches Ergebnis).

## Ordnerregeln (werden von `npm run lint` geprüft)

1. Module nutzen andere Module nur über deren `index.ts` (Exporte), ihre Befehle und ihre Ereignisse.
2. Module importieren den Kern nur aus `src/core/index.ts`, Tests zusätzlich aus `src/core/testing.ts`.
3. Nur der `ui/`-Ordner eines Moduls darf `src/ui`, `src/map`, `preact` und `maplibre-gl` importieren
   (jeweils nur über `index.ts`). Der Rest eines Moduls bleibt DOM-frei.
4. Der Kern importiert keine Module, keine UI, keine Karte.
5. UI und Karte importieren keine Module; die melden sich über Registries an.
6. Keine Top-Level-Nutzung fremder Module (nur in Funktionen), sonst gibt es Import-Zyklen.

## Sprachregel

- Code-Bezeichner (Variablen, Funktionen, Typen, IDs von Befehlen/Ereignissen): **Englisch**
- Kommentare, UI-Texte, Journal- und Nachrichtentexte, Commits und PRs: **Deutsch**

## Ein Modul anlegen

1. `src/modules/_template` nach `src/modules/<id>` kopieren (`<id>` = Ordnername, klein).
2. Überall `template`/`Template` durch deine ID bzw. deinen Namen ersetzen.
3. Fertig. Keine Datei außerhalb des Ordners ändern (CI prüft das mit `npm run template:smoke`).

```ts
// src/modules/<id>/index.ts
declare module '../../core' {
  interface ModuleStates { casino: CasinoState }                 // eigener State-Bereich
  interface GameCommands { 'casino.bet': { amount: number } }     // Befehl: '<modul>.<verb>'
  interface GameEvents { 'casino.won': { amount: number } }       // Ereignis: '<thema>.<was passiert ist>'
}
export default defineModule({
  id: 'casino', version: 1, dependsOn: ['goods'],
  init: (ctx) => ({ ... }),                        // Anfangszustand
  tick: (ctx) => { ... }, tickEvery: 60,           // optional, Standard jede Spielminute
  commands: { 'casino.bet': (ctx, payload, meta) => ({ ok: true }) },   // oder { ok: false, reason: '…' }
  on: { 'sale.completed': (ctx, payload) => { ... } },
  migrations: { 2: (old: CasinoStateV1) => ({ ...old, neu: 0 }) },
  solvency: (state) => ...,                        // optional: Beitrag zur Pleite-Regel
});
```

- **Lesen mit `state`, schreiben mit `ctx`.** Öffentliche Lese-Funktionen nehmen `state: GameState`,
  schreibende nehmen `ctx: Ctx` (hat `emit`, `dispatch`, `random`, `nextId` …).
- **Zufall nur über `ctx.random()`, `ctx.chance()`, `ctx.pick()`, `ctx.randomInt()`**, nie `Math.random()` oder `Date`.
  Dokumentierte Ausnahme (Auftrag 40): Würfe fest aus Seed und Schlüssel mit `keyedRandom(key)`, `keyedDice(key)` bzw.
  `cityDayDice(seed, zweck, stadt, tag)` aus dem Kern (`src/core/rng.ts`), deterministisch, aber ohne Zustand im
  Spielstand. Dafür, dass ein Wurf die Würfelfolge der Module nicht verschiebt (Eigenschaften der Leute) und für Würfe
  pro Stadt (Marktindex, Rabatt-Aktionen, Marktereignisse): Was eine Stadt würfelt, hängt nicht davon ab, welche und
  wie viele Städte frei sind.
- Zustand nur als JSON-Daten (keine Klassen, Maps, Funktionen, `undefined` in Arrays).
- Befehle kommen vom Spieler, aus Handy-Antworten oder von Leutnants (`ctx.dispatch(cmd, { actor: 'staff:<id>' })`).
- Ereignisse werden am Ende des Schritts bzw. Befehls in fester Reihenfolge zugestellt.
- Geld: `wallet.pay(ctx, amount, kind, reason, category)`, ebenso `earn` und `lose`, dazu `convert` (Schwarzgeld
  `'dirty'`, sauber `'clean'`; Legales wie Liegeplatz und Lager kostet sauberes Geld). **Immer mit Kategorie** aus
  `MONEY_CATEGORIES` (`src/core/wallet.ts`), z.B. `'wages.runner'`, oder `{ category, spotId, staffId }`, damit die
  Kasse (`finance`) Gewinn und Verlust pro Spot und Leutnant zeigen kann (Löhne und Handgeld geben den Spot schon bei der
  Buchung mit: Die Kasse liest sie erst später im Schritt, dann kann die Person schon abgetaucht oder weg sein). Beträge sind
  endliche Zahlen ab 0, sonst wirft der Kern (NaN im Konto machte jeden Vergleich falsch). Journal: `journal.add(ctx, text, kind)`.
- Leutnants führen **Spots, nicht Veedel** (bis zu drei, `lieutenantOfSpot`, `lieutenantSpots` aus `hierarchy`).
- **Städte (Auftrag 30):** Alles, was an einem Ort hängt, gehört zu einer Stadt (`cityId` an Veedel, Lager, Gangs,
  Leuten, Ware am Kai; Spots über ihr Veedel, `spotCity`). Lesefunktionen bekommen eine Stadt (`getSpots(state, cityId)`,
  `getStaff(state, { cityId })` …), ohne Angabe meint man die aktive (`activeCity`). Ticks arbeiten nur für die Stadt,
  die live ist (`isCityLive`, `liveVeedel`); die schlafende bekommt um Mitternacht ein Tagesergebnis von `city`, ihre
  Lager bleiben, Fahrten dort fahren zu Ende. Wer selbst handelt (am Spot stehen, abholen, Konfrontationen), muss in
  der Stadt sein (`isPlayerIn`). Geld für eine bestimmte Stadt mit `{ category, cityId }` buchen. Werte pro Stadt als
  Daten (`CITIES` in `city/data.ts` oder `…_BY_CITY` in der eigenen `config.ts`), nie `if (cityId === 'hamburg')` im
  Ablauf. Die Rechte Hand gibt es pro Stadt (`getRightHand(state, cityId?)`). Neue Felder im Zustand mit Stadt brauchen
  eine Migration, die alte Stände auf `'koeln'` setzt.
- Lieferungen fährt **nur die Rechte Hand** (`customers.acceptOrder` mit `by: 'rightHand'`, `rightHandDriver`); alles,
  was sie selbständig tun soll, ist eine Aufgabe in `hierarchy/tasks.ts` und läuft über `ctx.dispatch` mit Actor.
- Wege und Fahrzeiten immer über `roads` (`roadRoute`, `travelMinutes`), nie Luftlinie; zwischen zwei Städten nehmen
  beide von selbst die A1 (`interCityRoute`). Fahrzeuge auf der Karte fahren `roadRoute(…).drive` und zeigen die letzten
  Meter mit `addFootpath`. Straßennetze neu erzeugen: `src/modules/roads/tools/build-roads.py` (`--city <id>`,
  `--autobahn <a> <b>`), die Wasserwege `tools/build-water.py` (Anleitung im Kopf der Dateien). Neue Spots, Lager oder
  Häfen müssen `scripts/check-roads.mjs` bestehen (höchstens 60 m bis zur nächsten Straße).
  Nachrichten: `messages.send(ctx, { contact, text, options, expiresIn?, silent? })` – alle Figuren reden per Handy mit
  dem Spieler. Benannte Figuren geben im Kontakt Aussehen und Stimme mit (`look`, `voice`, `role`, `about`), nie ein
  Emoji als Gesicht. Ein Banner mit Ton gibt es nur für Nachrichten mit Antwortfrist (`options` + `expiresIn`), alles andere
  zählt still am Badge (`silent` ist damit nur noch für die Mitteilungszentrale relevant). Gelöschte Chats bleiben im
  Zustand (`messages.hidden`) und kommen wieder, sobald die Figur neu schreibt. Spielende: `outcome.gameOver(ctx, 'killed')`,
  `outcome.win(ctx)`.

## Migrationen

Ändert sich die Form des eigenen Zustands: `version` hochzählen und `migrations[neueVersion]` schreiben
(bekommt den alten Stand, gibt den neuen zurück). Kam ein Modul bisher ohne Zustand aus, bekommt die Migration
`undefined`. Fehlt ein Modul im Spielstand, wird es frisch mit `init` angelegt. Einen Test dazu schreiben
(siehe `src/core/persistence.test.ts`).

## Oberfläche eines Moduls

In `src/modules/<id>/ui/index.tsx` (Beispiel in `_template/ui/`): `registerHudItem`, `registerTab`,
`registerSlot` (z.B. in `'tab:territory'`, `'tab:staff'`, `'spots.spotPanel'`, `'goods.warehouse'` (Lager-Seite), `'goods.app'` (Lager-App), `'suppliers.top'` (oben in der Lieferanten-App), `'finance.app'`
(unten in der Kasse), `'core.settings'` (eigener Abschnitt in den Einstellungen mit `title`, `icon`, `color`) oder `'map.overlay'`
über der Kartenfläche), `registerPanel`,
`registerDialog` (mit `area: 'map'` nur über der Kartenfläche, dazu `MapDialog`), `registerMapLayerOption` (Menü Ebenen),
`registerPhoneApp`, `registerLiveActivity` (Dynamic Island), `registerAdvisor` (Karte "Nächster Schritt"), `registerSearch` (Strg/⌘+K), `registerGameStat`
(Game-Over-Bildschirm), `onGameEvent`, `soundOnEvent` aus `src/ui`, `registerMapLayer` und `mapEffects` aus `src/map`.
**Optik-Regeln (Auftrag 27):** Eigenschaften in Listen als Chips (`ItemContent tags`, `Chip`/`Chips`), nie als „a · b · c“;
Abschnitte als `Group` (Unterlage, farbige Kopfzeile, `value`, `collapsible`); höchstens ein Satz Erklärung sichtbar, mehr in
`Disclosure` oder `Group more`; Namen und Werte brechen nie im Wort um.
HUD-Anzeigen mit `<HudPill>` (mit `details` klappt beim Drüberfahren eine Glas-Karte auf). **Das Handy hat seit Auftrag 26 sechs Apps**
(Kasse, Reviere, Gangs, Personal, Geldwäsche, Einstellungen), dazu seit dem Hamburger Lager-Kauf die App „Lager“ (`goods.app`: eigene Lager, Standorte kaufen) und vier im Dock (Nachrichten, Lieferanten, Personal,
Kasse): Neues hängt sich als Abschnitt oder Seite an eine davon (Slots oben, `registerPanel`), eine neue App braucht einen Grund;
`hidden: true` hält eine App vom Startbildschirm fern, `ui.openPhone(id)` öffnet sie trotzdem. **Banner nur für Dringendes:**
`ui.toast(text, kind, { urgent })` erscheint als Banner nur bei `'bad'`/`'warn'` oder `urgent: true` (Lieferung da, Löhne nicht
gedeckt), Routine landet still im Verlauf (Einstellungen › Verlauf, Seite `core.history`).
Nur Bausteine aus `src/ui/components` (auch `Select`, `Avatar`, `Icon` …) und Design-Tokens (`var(--color-…)`,
`var(--space-…)`) verwenden. **Farben tragen Bedeutung**: `color="money" | "dirty" | "danger" | "warn" | "place" | "goods" | "people" | "chat" | "law" …`
(Bedeutungsfarben `--cat-*`, Hell und Dunkel, Kontrast geprüft), möglichst keine freien Hex-Werte in Modul-UIs. Eine Karte
(MapLibre) versteht kein `light-dark()`: dort `mapToken()` aus `src/map`. Details: `src/ui/README.md`, `src/map/README.md`,
Plan und Prüfung des Handy-Designs: `docs/handy-design.md`.
Über der Karte gilt der Look „Glas“ (Auftrag 24): dunkles Glas (`--hud-glass*`), Barlow (`--font-hud*`), Tokens und Regeln in
`src/ui/README.md`, Abschnitt "Über der Karte: Look Glas".
Komponenten lesen mit `useGame()` und ändern nur mit `dispatch`.

## Vor jedem Push

```bash
npm run check    # Typecheck + Lint (Biome + Ordnerregeln) + Tests
npm run build
npm run format   # behebt Formatierung und Import-Reihenfolge
```

Selbst ausprobieren:
- `npm run screenshot` (Desktop + Handy nach `screenshots/`, meldet Browser-Fehler)
- `npm run screenshot -- --scenes=alle` (Look Glas: Normalbetrieb in vier Tageszeiten, Konfrontation, Razzia, Lieferung, Übernahme nach `screenshots/glas/`)
- `npm run screenshot:phone` (alle Handy-Seiten für Desktop und Handy-Bildschirm nach `screenshots/handy/`, mit `--scenes`, `--sizes`, `--appearance=light`)
- `npm run audit:phone` (misst am laufenden Spiel Zieltreffer ≥ 44 px, Schrift ≥ 11 px und Kontrast; Fehlercode bei Verstößen)
- `npm run monkey:phone` (klickt zufällig, mit festem Seed, durch jede Handy-App und meldet Browser-Fehler, verdeckte oder nicht erreichbare Bedienelemente, ungültige Zahlen im Spielstand und Sackgassen; mit `--apps`, `--sizes`, `--steps`, `--seed`)
- `npm run e2e` (Ende-zu-Ende-Test mit Playwright: neues Spiel, verkaufen, anheuern, bestellen, speichern, laden)
- `npm run playthrough` (der Bot spielt ~20 Minuten im Browser, Screenshots der wichtigen Momente)
- `npm run balance` (Balancing-Bericht über mehrere Seeds, siehe `docs/architektur.md`, Abschnitt "Balancing")

Im Browser: `?neu=normal&seed=1&tempo=0` startet ein frisches Spiel; `window.koeln.session` in der Konsole.
Test-Spielstände (vom Bot gespielt, nicht in der Bestenliste), einer für jeden Abschnitt des Bogens (`koeln-anfang` bis
`europa`; jede Stadt in der Reihenfolge Hamburg, Berlin, München, Frankfurt mit `ankunft-<stadt>`, `boss-von-<stadt>`
und `<stadt>-komplett`): `?spielstand=koeln-komplett` oder Spielstände › Test-Spielstände; Liste in `src/playtest/testSaves.ts` und
`src/ui/builtin/testSaves.ts`, Dateien in `public/spielstaende/`, neu erzeugen mit `npm run saves:build` (etwa zwei
Minuten; `testSaves.test.ts` prüft, dass sie laden und den Moment zeigen; Übersicht in `docs/architektur.md`, Abschnitt
"Spielstände").
Kartenkacheln (Esri, OpenFreeMap) lädt das Skript über Node (auch hinter einem `HTTPS_PROXY`).
TypeScript-Eigenheit: Dateien, die Module importieren, nicht in einen Ordner legen, der alphabetisch vor
`src/core` steht (z.B. `src/balance`), sonst gehen die `declare module`-Erweiterungen verloren.
