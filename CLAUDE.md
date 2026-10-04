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
Auftrag 33: Lager haben Platz in Gramm und Ausbau (`goods.upgradeWarehouse`: Regale, Tresor, Tarnung; `warehouseModifiers`
fragen `police` und `encounters`). **Lieferungen und Fahrten lagern mit `storeFitting` ein** (nimmt nur, was passt, und meldet
den Rest); `store` überfüllt (nur für Beute und Rückgaben). Neues Modul `fleet` (Fahrzeuge mit Ladung, Tempo, Kontrollfaktor;
ohne eigenes das Privatauto mit 5 kg), Fahrten wählen `vehicleId` und `choice` (Autobahn, Landstraße, nachts; `roads` nimmt
`{ weights }` pro Straßenart), Liegeplatz-Stufen (`logistics.upgradeBerth`), Container-Pakete (`container: 'full' | 'shared'`),
Warenfluss (`goods.usagePerDay`) in der Lager-App, Ebene „Lieferwege“.
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
Test-Spielstände (vom Bot gespielt, nicht in der Bestenliste): `?spielstand=koeln-komplett` oder Spielstände ›
Test-Spielstände; Liste in `src/playtest/testSaves.ts` und `src/ui/builtin/testSaves.ts`, Dateien in `public/spielstaende/`,
neu erzeugen mit `npm run saves:build` (`testSaves.test.ts` prüft, dass sie laden).
Kartenkacheln (Esri, OpenFreeMap) lädt das Skript über Node (auch hinter einem `HTTPS_PROXY`).
TypeScript-Eigenheit: Dateien, die Module importieren, nicht in einen Ordner legen, der alphabetisch vor
`src/core` steht (z.B. `src/balance`), sonst gehen die `declare module`-Erweiterungen verloren.
