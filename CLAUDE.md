# Köln Tycoon – Hinweise für Claude-Sessions

Browserspiel (Vite + TypeScript + Preact + MapLibre). Was das Spiel werden soll: `docs/konzept.md`.
Ausführliche Architektur mit allen Modulen, APIs, Befehlen und Ereignissen: `docs/architektur.md`.
**Parallele Sessions:** Regeln, Phasen und wer welche Ordner besitzt stehen in `docs/auftraege/README.md`. Lies das zuerst.
Phase 0 (Fundament), Phase 1 (Aufträge 10–14) und Phase 2 (Integration, Auftrag 20) sind erledigt; alle Systeme
sind verbunden. Dazu Auftrag 21: echtes Straßennetz (`roads`), Logistik mit Hafen, Fahrern und mehreren Lagern
(`logistics`), Lieferanten zum Freischalten. Wie alles zusammenspielt: `docs/architektur.md`, Abschnitt
"Zusammenspiel der Systeme".

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
- Geld: `wallet.pay/earn/lose/convert` (Schwarzgeld `'dirty'`, sauber `'clean'`; Legales wie Liegeplatz und Lager kostet
  sauberes Geld). Journal: `journal.add(ctx, text, kind)`.
- Wege und Fahrzeiten immer über `roads` (`roadRoute`, `travelMinutes`), nie Luftlinie. Das Straßennetz neu erzeugen:
  `src/modules/roads/tools/build-roads.py` (Anleitung im Kopf der Datei).
  Nachrichten: `messages.send(ctx, { contact, text, options, silent? })` – alle Figuren reden per Handy mit dem
  Spieler, Routine-Meldungen still (`silent: true`). Spielende: `outcome.gameOver(ctx, 'killed')`, `outcome.win(ctx)`.

## Migrationen

Ändert sich die Form des eigenen Zustands: `version` hochzählen und `migrations[neueVersion]` schreiben
(bekommt den alten Stand, gibt den neuen zurück). Kam ein Modul bisher ohne Zustand aus, bekommt die Migration
`undefined`. Fehlt ein Modul im Spielstand, wird es frisch mit `init` angelegt. Einen Test dazu schreiben
(siehe `src/core/persistence.test.ts`).

## Oberfläche eines Moduls

In `src/modules/<id>/ui/index.tsx` (Beispiel in `_template/ui/`): `registerHudItem`, `registerTab`,
`registerSlot` (z.B. in `'tab:business'` oder `'spots.spotPanel'`), `registerPanel`, `registerDialog`,
`registerPhoneApp`, `registerLiveActivity` (Dynamic Island), `registerAdvisor` (Karte "Nächster Schritt"), `registerSearch` (Strg/⌘+K), `registerGameStat`
(Game-Over-Bildschirm), `onGameEvent`, `soundOnEvent` aus `src/ui`, `registerMapLayer` und `mapEffects` aus `src/map`.
HUD-Anzeigen mit `<HudPill>`, Karten für den Geschäft-Tab mit `icon`, `summary` und `status` (werden dort zu Zeilen).
Nur Bausteine aus `src/ui/components` (auch `Select`, `Avatar`, `Icon` …) und Design-Tokens (`var(--color-…)`,
`var(--space-…)`) verwenden. **Farben tragen Bedeutung**: `color="money" | "dirty" | "danger" | "warn" | "place" | "goods" | "people" | "chat" | "law" …`
(Bedeutungsfarben `--cat-*`, Hell und Dunkel, Kontrast geprüft), möglichst keine freien Hex-Werte in Modul-UIs. Eine Karte
(MapLibre) versteht kein `light-dark()`: dort `mapToken()` aus `src/map`. Details: `src/ui/README.md`, `src/map/README.md`,
Plan und Prüfung des Handy-Designs: `docs/handy-design.md`.
Komponenten lesen mit `useGame()` und ändern nur mit `dispatch`.

## Vor jedem Push

```bash
npm run check    # Typecheck + Lint (Biome + Ordnerregeln) + Tests
npm run build
npm run format   # behebt Formatierung und Import-Reihenfolge
```

Selbst ausprobieren:
- `npm run screenshot` (Desktop + Handy nach `screenshots/`, meldet Browser-Fehler)
- `npm run screenshot:phone` (alle Handy-Seiten für Desktop und Handy-Bildschirm nach `screenshots/handy/`, mit `--scenes`, `--sizes`, `--appearance=light`)
- `npm run audit:phone` (misst am laufenden Spiel Zieltreffer ≥ 44 px, Schrift ≥ 11 px und Kontrast; Fehlercode bei Verstößen)
- `npm run e2e` (Ende-zu-Ende-Test mit Playwright: neues Spiel, verkaufen, anheuern, bestellen, speichern, laden)
- `npm run playthrough` (der Bot spielt ~20 Minuten im Browser, Screenshots der wichtigen Momente)
- `npm run balance` (Balancing-Bericht über mehrere Seeds, siehe `docs/architektur.md`, Abschnitt "Balancing")

Im Browser: `?neu=normal&seed=1&tempo=0` startet ein frisches Spiel; `window.koeln.session` in der Konsole.
Kartenkacheln (Esri, OpenFreeMap) lädt das Skript über Node (auch hinter einem `HTTPS_PROXY`).
TypeScript-Eigenheit: Dateien, die Module importieren, nicht in einen Ordner legen, der alphabetisch vor
`src/core` steht (z.B. `src/balance`), sonst gehen die `declare module`-Erweiterungen verloren.
