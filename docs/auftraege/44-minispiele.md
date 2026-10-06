# Auftrag 44: Minispiele

Grundlage ist das Feedback des Spielers vom 06.10.2026. Er hat aus 25 Ideen zehn Minispiele ausgewählt, die bei
Ereignissen im Spiel kommen:

> Verfolgungsjagd im Auto (soll richtig high quality aussehen), Razzia-Countdown, Verkehrskontrolle, Zivi oder Kunde,
> Straßenkampf, Tresor knacken, Bude durchsuchen, Container packen, Papiere fälschen, Bewerbungsgespräch.
> Die Minispiele sind Pflicht. Es sei denn, man hat eine Rechte Hand: Dann kann sie übernehmen, und es gibt eine
> Wahrscheinlichkeit, ob sie das Ding holt oder nicht.

Die Arbeit läuft in **elf Teilen, jeder in einer eigenen Session** (eigener Branch, eigener PR). Eine steuernde Session
prüft stündlich die PRs, mergt sie bei grünem CI nach `main` und startet die nächste Welle:

```
Welle 0   Teil 0  Fundament (Modul minigames, Rahmen, Anschluss Konfrontationen, Tresor knacken als Beispiel)
             │  mergen
             ▼
Welle 1   Teil 1  Verfolgungsjagd      Teil 2  Straßenkampf      Teil 3  Razzia-Countdown
             │  alle mergen
             ▼
Welle 2   Teil 4  Verkehrskontrolle    Teil 5  Zivi oder Kunde   Teil 6  Bude durchsuchen   Teil 7  Container packen
             │  alle mergen
             ▼
Welle 3   Teil 8  Papiere fälschen     Teil 9  Bewerbungsgespräch
             │  alle mergen
             ▼
Welle 4   Teil 10 Abschluss (Feinschliff über alle, Doku, Screenshots, Messungen)
```

| Teil | Minispiel | Branch | Wo es andockt |
| --- | --- | --- | --- |
| 0 | Fundament + Tresor knacken | `claude/minispiele-44-0-fundament` | neues Modul `minigames`, `encounters`, `gangs`, Bot |
| 1 | Verfolgungsjagd | `claude/minispiele-44-1-verfolgung` | `minigames/ui/games/chase`, `encounters` (applyChase), `roads` |
| 2 | Straßenkampf | `claude/minispiele-44-2-kampf` | `minigames/ui/games/brawl`, `encounters` (applyBrawl) |
| 3 | Razzia-Countdown | `claude/minispiele-44-3-razzia` | `minigames/ui/games/stash`, `police` |
| 4 | Verkehrskontrolle | `claude/minispiele-44-4-kontrolle` | `minigames/ui/games/traffic`, `encounters` (applyTraffic) |
| 5 | Zivi oder Kunde | `claude/minispiele-44-5-zivi` | `minigames/ui/games/undercover`, `police`, `customers` |
| 6 | Bude durchsuchen | `claude/minispiele-44-6-bude` | `minigames/ui/games/search`, `gangs` |
| 7 | Container packen | `claude/minispiele-44-7-container` | `minigames/ui/games/container`, `trade` |
| 8 | Papiere fälschen | `claude/minispiele-44-8-papiere` | `minigames/ui/games/papers`, `encounters` (applyPapers) |
| 9 | Bewerbungsgespräch | `claude/minispiele-44-9-bewerbung` | `minigames/ui/games/interview`, `recruiting` |
| 10 | Abschluss | `claude/minispiele-44-10-abschluss` | alles, Doku, Skripte |

So wird eine Session gestartet:

```
Setze Teil <N> aus docs/auftraege/44-minispiele.md vollständig um. Lies vorher CLAUDE.md, docs/auftraege/README.md
und im Auftrag die Abschnitte „Für alle Teile“ und „Teil <N>“.
```

---

## Für alle Teile

### Was „Pflicht“ heißt

1. Ein Minispiel kommt, wenn **der Spieler selbst betroffen ist** (er steht am Spot, fährt selbst, ist selbst bei der
   Konfrontation, führt selbst das Gespräch). Sind nur seine Leute dabei, bleibt alles wie bisher (Würfel).
2. Der Rahmen zeigt zuerst eine kurze Einleitung (Situation in einem Satz, Steuerung) und dann zwei Wege:
   **„Los“** (selbst spielen) und, nur wenn die Stadt eine aktive Rechte Hand hat, **„<Name> übernimmt (xx %)“**.
   Es gibt keinen Weg, das Minispiel zu überspringen: kein Schließen, kein Esc, kein Wegwischen.
3. Die Rechte Hand würfelt **im Simulationskern** (`minigames.delegate`): Chance aus ihrem Wert für das Minispiel
   (siehe Teil 0), Ergebnis „geschafft“ oder „nicht geschafft“ mit festem Score.
4. Ohne Oberfläche (Tests, Bot, Autopilot) läuft eine Frist ab (`timeout`). Dann gilt **genau das alte Verhalten**
   (Würfel wie bisher, kein Bonus, kein Abzug). So bleiben Balancing, Bot und Szenario-Tests unverändert.

### Determinismus

- Das Ergebnis kommt **nur als Befehl** in die Simulation (`minigames.finish { id, score, picks }`). Der Kern prüft und
  begrenzt die Werte (Score endlich, 0 bis 1; `picks` höchstens 20 kurze Texte) und wendet die Folgen an.
- Inhalte eines Minispiels (Level, Kunden, Fragen, Zahlen am Tresor …) erzeugt die Oberfläche aus `challenge.seed` mit
  einem eigenen Zufall (`createRng(seed)` aus dem Kern). In der Oberfläche **nie** `ctx.random()`; `Math.random()` nur
  für reine Optik (Funken, Regen).
- Würfe im Kern beim Anwenden nur über `ctx.*` im Befehl/Ereignis, oder fest aus einem Schlüssel (`keyedRandom`), wo
  ein Wurf die Würfelfolge anderer Module nicht verschieben darf.

### Optik und Bedienung

- **Qualität vor Menge.** Jedes Minispiel soll sich wie ein kleines, fertiges Spiel anfühlen: klare Ziele, sofortiges
  Feedback (Ton, Vibration, Wackeln, Zeitlupe am Ende), gute Lesbarkeit, ein klares Ende mit Ergebnis.
- Look „Glas“ über der Karte (`src/ui/README.md`, Abschnitt „Über der Karte: Look Glas“): dunkles Glas, Barlow und
  Barlow Condensed, Bedeutungsfarben (`--cat-*`), keine freien Hex-Werte in CSS. Im Canvas Farben über `mapToken()`
  aus `src/map` holen. Keine Emojis.
- Gesichter und Figuren aus dem Look-System (`personLook`, `lookFor`, `Look` aus `src/core/looks.ts`, `Face`/`Avatar`
  aus `src/ui`). `Face` ist SVG ohne Stimmung: Ausdruck über eine Kopie des Looks (`{ ...look, mouth: 'grin' }`, in
  `useMemo`).
- **Tastatur und Touch**: Jedes Minispiel ist mit Tastatur (Desktop) und mit dem Finger (Handy, 390 × 844) voll
  spielbar. Touch-Ziele mindestens 44 px, Schrift mindestens 11 px, Kontrast 4,5 : 1. Canvas mit `touch-action: none`.
- Höchstens ein Satz Erklärung sichtbar, mehr hinter `Disclosure`.
- `prefers-reduced-motion`: Spielzeit nie über CSS-Animationen steuern (die werden dann auf 1 ms gekürzt); eigene
  Effekte (Wackeln, Zeitlupe, Partikel) abschwächen.
- **Spielzeit steht still**, solange ein Minispiel offen ist (Dialog mit `pausesGame`). Deshalb laufen `onMapFrame`
  und `update()` der Karten-Ebenen nicht: Jedes Minispiel hat eine eigene `requestAnimationFrame`-Schleife (aus dem
  Baukasten von Teil 0), `dt` in echten Sekunden, gedeckelt.
- Leistung: Desktop 60 fps, Handy 30 fps (4× CPU-Bremse). Keine Layout-Lesungen (`getBoundingClientRect`,
  `clientWidth`, `isMobile()`) in einem Frame. Alles beim Schließen aufräumen (Schleifen, Listener, Karten-Ebenen,
  Kamera, Ton).
- Länge: 20 bis 90 Sekunden. Schwierigkeit aus `challenge.difficulty` (0 bis 1).

### Regeln für die Arbeit

1. Jeder Teil ändert nur, was sein Abschnitt nennt, und die eigenen Dateien unter
   `src/modules/minigames/ui/games/<art>/` und `src/modules/minigames/kinds/<art>.ts`. In gemeinsam genutzten Dateien
   (z.B. `encounters/minigames.ts`) nur die eigene Funktion.
2. Ein Minispiel ist erst „scharf“, wenn sein Teil `ready: true` in `src/modules/minigames/kinds/<art>.ts` setzt.
   Vorher startet der Kern es nicht, und alles bleibt wie bisher. So ist `main` nach jedem Merge spielbar.
3. Tests: Folgen im Kern mit festen Scores testen (geschafft, nicht geschafft, Rechte Hand, timeout). Spiellogik der
   Oberfläche als reines Modell in `ui/games/<art>/model.ts` mit `model.test.ts` daneben (Vitest läuft ohne DOM).
4. Selbst ausprobieren: `?neu=normal&seed=1&tempo=0&minispiel=<art>` öffnet das Minispiel als Vorschau (Teil 0). Dazu
   Screenshots am Desktop (1440 × 900) und am Handy (390 × 844) mit `npm run screenshot:minigames -- --kind=<art>`
   anschauen und nachbessern, bis es gut aussieht. Außerdem einmal den echten Weg im Spiel auslösen.
5. Vor dem Push: `npm run check`, `npm run build`, `npm run e2e`. Alles grün.
6. Ändert sich die Form eines Zustands: Version hochzählen und Migration schreiben (mit Test).
7. Wurde `main` zwischendurch geändert: `main` in den eigenen Branch mergen, nicht rebasen.
8. PR auf `main`, Titel „Auftrag 44, Teil <N>: <Minispiel>“, Beschreibung auf Deutsch mit „Was ist neu“,
   „Wie testen“, „Für die Integration“ (alles, was Teil 10 wissen muss). Danach die PR-Aktivität abonnieren und dafür
   sorgen, dass CI grün wird. **Gemergt wird von der steuernden Session**, nicht selbst.
9. `CLAUDE.md` und `docs/architektur.md` ändern nur Teil 0 (kurzer Eintrag) und Teil 10 (vollständig).

---

## Teil 0: Fundament

Ziel: Alles, was die zehn Minispiele gemeinsam brauchen, dazu der komplette Anschluss an die Konfrontationen und
**Tresor knacken** als erstes, fertiges Minispiel (Vorbild für die anderen Teile).

### 0.1 Modul `minigames` (Kern)

Neues Modul `src/modules/minigames/` aus der Vorlage (`_template`), Version 1.

- `kinds/<art>.ts`, je eine Datei pro Minispiel, und `kinds/index.ts`, das alle zehn einsammelt
  (`MINIGAME_KINDS: Record<MinigameKind, MinigameKindDef>`). So ändern parallele Teile nie dieselbe Zeile.
  ```ts
  type MinigameKind = 'chase' | 'brawl' | 'stash' | 'traffic' | 'undercover' | 'safe' | 'search' | 'container'
    | 'papers' | 'interview';
  interface MinigameKindDef {
    name: string;            // „Verfolgungsjagd“
    stat: 'speed' | 'caution' | 'strength' | 'charisma';   // Wert der Rechten Hand
    ready: boolean;          // erst true, wenn der Teil fertig ist (Teil 0: nur 'safe')
    winAt?: number;          // ab diesem Score gilt es als geschafft, Standard 0.5
  }
  ```
  Werte der Rechten Hand: chase `speed`, brawl `strength`, stash `caution`, traffic `charisma`, undercover `caution`,
  safe `caution`, search `caution`, container `caution`, papers `caution`, interview `charisma`.
- Zustand:
  ```ts
  interface Challenge {
    id: number; kind: MinigameKind;
    origin: { module: string; ref: string };   // wer es gestartet hat, z.B. { module: 'gangs', ref: 'safe:ost:12' }
    cityId: string; veedelId?: string;
    seed: number;              // fest aus Spiel-Seed und id (keyedRandom), kein ctx.random
    difficulty: number;        // 0..1
    title: string; situation: string;          // für die Einleitung
    params: Record<string, unknown>;           // nur JSON-Daten für die Oberfläche, je Art (siehe die Teile)
    startedAt: number; deadline: number;       // Frist für den Fall ohne Oberfläche
  }
  interface MinigamesState {
    active: Challenge[];
    history: { id; kind; origin; score: number | null; by: 'player' | 'rightHand' | 'timeout'; won: boolean;
               at: number }[];               // die letzten 30
    stats: Record<MinigameKind, { played: number; won: number; delegated: number }>;
  }
  ```
- API (`index.ts`):
  - `startMinigame(ctx, { kind, origin, cityId?, veedelId?, difficulty?, title, situation, params? }): number | null`.
    `null`, wenn die Art nicht `ready` ist oder das Spiel vorbei ist. Höchstens eine offene Challenge je `origin`.
  - `getChallenge(state, id)`, `activeChallenge(state)` (älteste offene), `isMinigameReady(kind)`.
  - `delegateInfo(state, challenge): { name: string; chance: number } | null` (Rechte Hand der Stadt über
    `activeRightHand` aus `hierarchy`, `null` ohne).
  - `minigameDifficulty(state, { cityId, veedelId? }): number` (aus Polizeipräsenz, Heat im Veedel, Polizei-Härte
    `police` tier und `CHECK_FACTOR_BY_CITY`; 0,2 bis 0,95).
  - `resolveMinigameNow(ctx, id)` für Tests und Bot (wie die Frist: `by: 'timeout'`).
- Befehle:
  - `'minigames.finish': { id: number; score: number; picks?: string[] }` (vom Spieler).
  - `'minigames.delegate': { id: number }` (nur mit aktiver Rechter Hand in der Stadt der Challenge). Chance
    `clamp(0.3 + 0.5 · Wert/100 + 0.03 · Rang, 0.25, 0.85)`; geschafft → Score `RIGHT_HAND_WIN_SCORE` (0,7), sonst
    `RIGHT_HAND_LOSE_SCORE` (0,25). Journal: „<Name> übernimmt: …“.
- Ereignisse:
  - `'minigame.started': { id, kind, origin, cityId }` (öffnet den Rahmen).
  - `'minigame.finished': { id, kind, origin, cityId, score: number | null, won: boolean,
    by: 'player' | 'rightHand' | 'timeout', picks: string[] }`. Bei `timeout` ist `score` `null` und `won` `false`.
- `tick`: Challenges mit `deadline <= now` laufen als `timeout` ab. Frist `MINIGAME_TIMEOUT` = 60 Spielminuten (kürzer
  als die Frist der Konfrontationen, `DECISION_TIMEOUT` 120).
- Für den Game-Over-Bildschirm: `registerGameStat` „Minispiele gewonnen“.
- Kurzer Eintrag in `CLAUDE.md` (ein Absatz „Auftrag 44 (Minispiele)“ mit Modul, Befehlen, Pflicht-Regel, `ready`).

### 0.2 Anschluss an die Konfrontationen (`encounters`)

- `EncounterKind.minigames?: { start?: MinigameKind; actions?: Partial<Record<string, MinigameKind>>;
  brawl?: MinigameKind }` als Daten in `kinds.ts`:
  - `policeChase`: `start: 'chase'` (der Spieler springt in den Wagen)
  - `vehicleCheck`: `start: 'traffic'`, `actions: { speedOff: 'chase' }`
  - `customsCheck`: `start: 'papers'`
  - `raidDefense`, `dealGoneWrong`, `recoverLoot`, `gangSpotRaid`, `debtCollection`: `actions: { fight: 'brawl' }`,
    `brawl: 'brawl'`
- `Encounter.minigame?: { challengeId: number; kind: MinigameKind; trigger: 'start' | 'action' | 'brawl';
  actionId?: string; protect?: StakeId } | null`. Migration `encounters` 5.
- Ein Minispiel startet nur, wenn **der Spieler aktiv dabei ist** (`playerPresent`, nicht am Boden) und die Art
  `ready` ist. Sonst läuft alles wie bisher.
  - `start`: sobald die Runden beginnen. Die Konfrontation wartet.
  - `action`: `encounters.act` mit dieser Handlung startet das Minispiel statt der Runde (Schutz merken).
  - `brawl`: kippt die Aggression in einer Runde über `AGGRESSION_FIGHT`, startet vor der nächsten Runde der Kampf.
    Die Handlung „Zuschlagen“ (`fight`) startet ihn sofort.
- Solange `encounter.minigame` gesetzt ist: `act`, `protect`, `special` lehnen ab („Erst das Minispiel.“).
  `encounters.auto` und `autoResolve` (auch über `expireDecisions`) lösen das offene Minispiel zuerst als `timeout`
  auf und machen dann wie bisher weiter. So bleibt keine Konfrontation hängen (Bot, Autopilot, alte Spielstände).
- `on['minigame.finished']` mit `origin.module === 'encounters'` (`ref` = Konfrontations-ID) ruft eine Funktion je Art
  in **`encounters/minigames.ts`** auf. Teil 0 schreibt alle vier vollständig und testet sie mit festen Scores; die
  Teile 1, 2, 4 und 8 dürfen später nur ihre eigene Funktion verfeinern.
  - **`applyChase`**: geschafft → `policeChase`: Erfolg (entkommen); `vehicleCheck`: Rückzug (davongefahren, Heat
    regelt `logistics` wie bisher). Nicht geschafft → Niederlage (gefasst). `picks` mit `dumped` → Ware weg
    (`loseGoods` wie bei „Ware wegwerfen“).
  - **`applyBrawl`**: `picks` `down:<n>` (so viele Gegner am Boden), `fled:<n>` (abgehauen), `hurt:<staffId>` (eigene
    Leute verletzt), `playerHurt`, `ko` (Spieler am Boden). Anwenden über die vorhandenen Helfer (`removeFoe`,
    Zustand der Beteiligten). Alle Gegner weg → Erfolg (`beaten`). `ko` → Niederlage (`overrun`), der Spieler ist
    verletzt, **stirbt aber nie durch ein Minispiel**. Sonst: Aggression auf 60, Entschlossenheit −15 je Gegner am
    Boden, die Runden laufen weiter.
  - **`applyTraffic`**: `picks` `flee` → Verfolgungsjagd starten (wie `actions.speedOff`; ist `chase` nicht `ready`,
    die Runde „Gas geben“ wie bisher würfeln). `bribe` → Bestechungsgeld zahlen (`bribeCost`), Erfolg. Sonst
    geschafft → Erfolg (weiterfahren), nicht geschafft → Niederlage (Ladung aufgeflogen).
  - **`applyPapers`**: `bribe` → zahlen, Erfolg. `giveUp` → Niederlage `surrendered` (Ware weg, niemand
    festgenommen). Sonst geschafft → Erfolg, nicht geschafft → Niederlage.
  - Bei `timeout`: `start` → Runden wie bisher; `action` → die Runde mit dem alten Würfel spielen; `brawl` → weiter wie
    bisher.
  - Bei der Rechten Hand: wie beim Spieler, mit ihrem Score (ohne `picks`).
- `params`, die der Kern mitgibt (die Teile dürfen ergänzen): `start: [lng, lat]` (Spot, Lager oder Veedel-Mitte),
  `setting`, `phase` (Tageszeit), `weather`, `opponent` (Label, Stärke, Anzahl, Rollen der Gegner), `intent` (aktuelle
  Absicht), `crew` (Name, Werte, Spezialzug, Look-Seed der Beteiligten), `stakes`, `bribeCost`, `clock`.
- Oberfläche der Konfrontation: Während ein Minispiel läuft, zeigt die Akte „Läuft …“ statt der Handlungen. Nach
  `minigame.finished` öffnet sie sich wieder (`onGameEvent`). Ist der Spieler selbst dabei, gibt es „Deine Leute
  entscheiden lassen“ nur noch mit aktiver Rechter Hand (Pflicht).

### 0.3 Rahmen in der Oberfläche (`minigames/ui`)

- Dialog `'minigames.play': { challengeId: number }` mit `pausesGame: true`, `dismissable: false`, `area: 'map'`.
  **Kein `MapDialog`/`Sheet`** (die haben am Handy immer einen Schließen-Knopf): eigenes Overlay wie
  `encounters/ui` (`enc-overlay`), am Handy bildschirmfüllend. Fokus selbst setzen (`area: 'map'` hat keine
  Fokus-Falle).
- Öffnen über `onGameEvent('minigame.started')`. Es gibt nur einen Dialog-Platz: Ein anderer offener Dialog wird
  ersetzt; der Konfrontations-Dialog öffnet sich nach dem Minispiel selbst wieder. Beim Laden eines Spielstands mit
  offener Challenge: Warnung im HUD wie `PendingHud` in `encounters/ui`, die den Rahmen öffnet.
- Abfolge: **Einleitung** (Titel, Situation, Steuerung für Tastatur und Touch, „Los“, „<Name> übernimmt (xx %)“) →
  **3-2-1** → **Spiel** → **Ergebnis** (Stempel „Geschafft“ / „Nicht geschafft“, ein Satz, was das bedeutet,
  „Weiter“). Erst „Weiter“ schickt `minigames.finish`: zuerst `ui.closeDialog()`, dann `dispatch` (sonst schließt man
  den Dialog, den die Folge-Ereignisse öffnen).
- Registry je Art in `minigames/ui/registry.ts`: `registerMinigameView(kind, { component, controls, layout })`.
  `layout: 'map'` (Karte bleibt sichtbar, für die Verfolgungsjagd) oder `'stage'` (eigene Bühne über abgedunkelter
  Karte). Für Arten ohne fertige Ansicht ein schlichter Platzhalter (der nie im Spiel erscheint, weil `ready: false`).
- Vertrag für jedes Spiel:
  ```ts
  interface MinigameViewProps {
    challenge: Challenge;          // seed, difficulty, params
    preview: boolean;              // Vorschau ohne Spielstand (siehe unten)
    onFinish(score: number, picks?: string[]): void;   // einmal aufrufen, dann zeigt der Rahmen das Ergebnis
  }
  ```
- Baukasten in `minigames/ui/kit/` für alle Teile:
  - `useFrameLoop(cb: (dt: number, t: number) => void, running: boolean)`: eigene `requestAnimationFrame`-Schleife,
    `dt` gedeckelt auf 0,05 s, Pause bei verstecktem Tab, Aufräumen beim Unmount.
  - `useGameKeys(keys: string[])`: gedrückte Tasten und Tasten-Ereignisse, `preventDefault` für Spieltasten, ohne
    Wiederholung; mit `window`-Listener in der Capture-Phase, damit Leertaste und Pfeile nicht ans Spiel gehen.
  - `TouchControls`: Steuerkreuz bzw. links/rechts, Aktionsknöpfe (mindestens 56 px), Wischgesten, mit `haptic`.
  - `useStageCanvas(ref)`: Canvas mit Geräte-Pixelverhältnis, Größe über `ResizeObserver` (nicht pro Frame).
  - `HudTimer`, `HudMeter` (Balken mit Bedeutungsfarbe), `ResultStamp` im Glas-Look.
  - Ton: `audio.play` mit den vorhandenen `SOUND_IDS`; eigene Klänge über `audio.registerSound` (synth) in
    `minigames/ui/kit/sounds.ts` (z.B. Klicken am Tresor, Schläge, Motor). `haptic` nicht pro Frame.
- **Vorschau** für Entwicklung und Screenshots: `?minispiel=<art>` (optional `&schwer=0.7`, `&seed=…`) öffnet den
  Rahmen mit einer erfundenen Challenge (nicht im Spielstand, Daten aus `previewParams(kind)` je Art). `onFinish`
  zeigt nur das Ergebnis, nichts wird geschickt.
- Skript `scripts/minigame-shots.mjs` (`npm run screenshot:minigames -- --kind=<art>|alle`): Einleitung, Spiel nach
  ein paar Sekunden und Ergebnis, Desktop und Handy, nach `screenshots/minispiele/`; meldet Browser-Fehler.
- `scripts/phone-audit.mjs` und `scripts/phone-monkey.mjs` kennen das neue Overlay (Wurzel bzw. bekannte Klasse).

### 0.4 Tresor knacken (fertig, `ready: true`)

- **Auslöser** (`gangs`, `reactions.ts`, Zweig `attack`): `gangSpotRaid` mit Erfolg, Spieler selbst dabei und am Leben
  → `startMinigame('safe', origin { module: 'gangs', ref: 'safe:<gangId>:<encounterId>' }, params { max })`.
  `max = min(SAFE_MAX (4000), round(Geld der Gang · SAFE_SHARE (0,1)))`; unter 200 kein Tresor.
- **Folgen** (`on['minigame.finished']` in `gangs`): geschafft → `round(max · score)` Schwarzgeld
  (`wallet.earn(…, { category: 'income.other', cityId })`), der Gang abziehen, Journal. Nicht geschafft → Alarm:
  Heat im Veedel (`SAFE_ALARM_HEAT` 8). `timeout` → nichts.
- **Spiel**: Nahaufnahme eines alten Stahltresors im Hinterzimmer, Taschenlampenkegel, Glas-HUD oben (Zeit, drei
  Punkte für die Zahlen). Drei Zahlen (0 bis 99) aus dem Seed, abwechselnd links und rechts drehen wie bei einem
  echten Schloss. Drehen per Ziehen (Maus/Finger, kreisförmig) oder ←/→ (mit Umschalt fein). Nahe an der richtigen
  Zahl: Klicken im Ton (lauter, je näher), leichtes Zittern des Rads, Vibration, ein Stethoskop-Ausschlag als
  Wellenlinie. Bestätigen mit Leertaste/Tippen auf „Einrasten“; falsch → Fehlerton und Strafsekunden. Zeit 45 s
  (schwer 30 s), Toleranz schmaler mit `difficulty`. Score: geknackt 0,6 + 0,4 · restliche Zeit; sonst
  0,2 · geknackte Zahlen / 3.

### 0.5 Bot und Tests

- Bot (`src/playtest/bot.ts`): offene Challenges nach jedem Zug mit `resolveMinigameNow` bzw. einem Befehl auflösen,
  damit alles wie bisher läuft. Szenario-Tests, Autopilot und Balancing bleiben grün und unverändert.
- Tests: Modul (`start`, `finish`, Grenzen der Werte, `delegate` mit und ohne Rechte Hand, `timeout`, `ready: false`),
  Konfrontationen (jede `apply…` mit festen Scores, warten, `auto` löst auf, Migration), Tresor (Geld, Alarm, nichts
  bei `timeout`).

---

## Teil 1: Verfolgungsjagd

Der Spieler will, dass das **richtig high quality** aussieht. Das ist das Aushängeschild des Auftrags.

**Auslöser** (schon in Teil 0 verdrahtet): `policeChase` mit dem Spieler (Kontrolle am Spot, er springt in den Wagen),
„Gas geben“ in der Verkehrskontrolle (Teil 4) bzw. in `vehicleCheck`. Folgen über `applyChase`.

**Spielgefühl:** Kamera hinter und über dem eigenen Wagen auf der echten 3D-Karte der aktiven Stadt, echte Straßen,
Blaulicht im Rückspiegel. Man fährt nicht frei, sondern **auf dem Straßennetz**: An jeder Kreuzung wählt man die
Richtung vorher (Pfeil im HUD zeigt die nächste Abbiegung), dazu Gas, Bremse und einen begrenzten Turbo.

- **Straßen**: `roadGraph(cityId)` aus `roads` (Typed Arrays, Knoten in Metern, CSR-Nachbarn, Einbahnstraßen). Wie
  `roads/ui/traffic.ts` fahren (Kante, Richtung, Meter auf der Kante, `pointOn`, Kurs gemittelt). Fehlt eine Suche
  nach der nächsten Kante, darf Teil 1 `snapToRoad` aus `roads/graph.ts` über `roads/index.ts` exportieren.
- **Fahren**: Höchsttempo nach Straßenart (`ROAD_SPEEDS`, im Spiel etwas schneller), Beschleunigen und Bremsen mit
  Trägheit. Zu schnell in eine scharfe Kurve → Rutschen (Tempo weg, Reifenspuren, Kamera wackelt). Wenden mit „zurück“
  kostet Zeit. Turbo-Balken lädt langsam nach.
- **Polizei**: 2 bis 5 Streifen nach `difficulty`, erscheinen 300 bis 600 m entfernt auf dem Netz, suchen den Weg zum
  Spieler (eigene A*/Dijkstra auf den CSR-Arrays, alle 0,3 bis 0,5 s neu, Ziel ist der nächste Knoten vor dem Spieler).
  Auf Geraden etwas langsamer als der Spieler mit Turbo, in Kurven besser. Ab mittlerer Schwierigkeit
  **Straßensperren** an Knoten vor dem Spieler (Barken, zwei Wagen quer). Zivilverkehr auf den Kanten in der Nähe
  (10 bis 20 Wagen, einfache Kantenfahrt wie `traffic.ts`), Zusammenstöße bremsen und hupen.
- **Ziel**: Sichtkontakt brechen und abtauchen. „Sichtkontakt“, solange eine Streife näher als etwa 160 m ist (oder im
  Scheinwerfer des Hubschraubers). Ohne Sichtkontakt füllt sich ein Ring „Abtauchen“ (8 s → entkommen). Schneller geht
  es in einem **Versteck**: eigene Lager der Stadt und zwei, drei Tiefgaragen/Hinterhöfe (Knoten an ruhigen Straßen
  350 bis 900 m entfernt), als Ziel auf der Karte mit Richtungspfeil am Rand. Im Versteck ohne Sichtkontakt → sofort
  entkommen.
- **Druck**: Nach 40 bis 60 s (aus `params.clock`) kommt der **Hubschrauber** mit einem Lichtkegel, der dem Spieler
  mit Verzögerung folgt. Gefasst, wenn eine Streife länger als 1,5 s dicht (unter 12 m) bei langsamem Tempo
  (unter 15 km/h) dran ist oder die Zeit (120 s) abläuft. Knopf „Ware aus dem Fenster“: einmal, kurz mehr Tempo und die
  Verfolger zögern, dafür `dumped` (Ware weg).
- **Darstellung**: eigene WebGL-Ebene nach dem Vorbild von `src/map/fleet.ts` (instanzierte Boxen aus `KINDS` in
  `src/map/vehicles.ts`), über `registerMapLayer` angemeldet (dort gibt es die MapLibre-Karte). Dazu:
  Lichtbalken der Streifen blinken rot/blau mit Lichtschein auf der Straße (additiv), Scheinwerfer bei Nacht
  (`daylight`), Rücklichter und Bremslicht, Reifenspuren, Funken bei Zusammenstößen, Hubschrauber-Kegel. Wenn
  Erweiterungen in `src/map` sinnvoll sind (z.B. blinkende Dachlichter in der Flotte), sind sie erlaubt.
- **Kamera**: eigene Schleife (`useFrameLoop`), jeden Frame `map.jumpTo` mit geglättetem Kurs und Vorausblick, Neigung
  um 60°, Zoom nach Tempo (schneller = weiter weg). Während der Jagd sind Ziehen, Zoomen, Drehen und die Tastatur der
  Karte aus und werden danach wiederhergestellt, ebenso die Kamera von vorher.
- **HUD** (Glas): Tacho, Sichtkontakt-Anzeige (Sterne oder Balken), Ring „Abtauchen“, Hubschrauber-Uhr, Turbo,
  nächste Abbiegung, Pfeil zum Versteck, Funk-Zeile mit Veedel-Namen („Zentrale: Fahrzeug Richtung Ehrenfeld“, über
  `veedelAt`), rot-blaues Pulsieren am Bildrand bei Sichtkontakt, Tempo-Linien bei hoher Geschwindigkeit.
- **Steuerung**: ←/→ bzw. A/D Abbiegung wählen, ↑/W Gas, ↓/S/Leertaste Bremse, Umschalt Turbo. Am Handy große
  Knöpfe links/rechts, Bremse und Turbo; Wischen nach links/rechts wählt die Abbiegung.
- **Ton**: Sirene (vorhandenes `siren` bzw. eigene Schleife, lauter je näher), Motor nach Tempo, Reifenquietschen,
  Aufprall, Hubschrauber.
- **Ende**: Entkommen → Zeitlupe, Sirenen werden leiser. Gefasst → Zeitlupe, Blaulicht von allen Seiten.
  Score: entkommen 0,6 + 0,4 · übrige Zeit; gefasst 0,05 bis 0,4 nach überstandener Zeit.
- **Leistung**: 60 fps Desktop, 30 fps Handy; Pfadsuche gestaffelt, keine `setData`-Flut (WebGL statt GeoJSON).
- `ready: true` in `kinds/chase.ts`, Screenshots bei Tag und Nacht, in Köln und in einer zweiten Stadt.

---

## Teil 2: Straßenkampf

**Auslöser** (Teil 0): „Zuschlagen“ oder Schlägerei (Aggression ab 70) in `raidDefense`, `dealGoneWrong`,
`recoverLoot`, `gangSpotRaid`, `debtCollection`, wenn der Spieler dabei ist. Folgen über `applyBrawl`.

- **Bühne**: 2D-Seitenansicht im Canvas, Straßenszene nach `params.setting` (Spot, Lager, Straße, Treffpunkt),
  Tageszeit (`phase`, Laternen und Neon bei Nacht) und Wetter (Regen, Schnee als Partikel, nasse Spiegelungen), leichte
  Parallaxe. Kamera folgt dem Geschehen.
- **Figuren**: aus dem Look-System gezeichnet (Hautton, Frisur, Bart, Kopfbedeckung, Oberteil und Farbe; der Spieler
  bekommt einen festen eigenen Look). Gliederpuppen mit Umriss und Animationen: stehen, gehen, Schlag, Tritt, Block,
  Ausweichen, getroffen, am Boden. Gegner nach Rolle: Anführer (klug, blockt), Nervöser (haut ab, wenn er Treffer
  kassiert), Schläger (langsam, hart). Stärke aus `params.opponent`.
- **Kampf**: links/rechts laufen (und zwei Tiefen-Ebenen), leichter Schlag, schwerer Schlag, Block, Ausweichen.
  Gegner kündigen Angriffe an (Symbol über dem Kopf, kurzes Ausholen); die aktuelle **Absicht** der Konfrontation
  (`params.intent`) bestimmt, wer was vorhat (Messer = rot blinkendes Symbol, Abstand halten). Konter im richtigen
  Moment gibt Zeitlupe und doppelten Schaden. Treffer-Feedback: Aufblitzen, kurzes Anhalten (Hit-Stop),
  Schadenszahlen, Wackeln, Ton.
- **Crew**: bis zu drei eigene Leute aus `params.crew` kämpfen mit (einfache KI, Werte zählen). Ihre Spezialzüge
  (`crew.ts`) sind Knöpfe mit Abklingzeit: z.B. `block` fängt den nächsten Treffer gegen dich ab, `secondTalk` lässt
  einen Gegner zögern.
- **HUD**: Lebensbalken (Spieler, Crew, Gegner mit Rolle), `DuelBar` für das Kräfteverhältnis, Polizei-Uhr
  (`params.clock`: läuft sie ab, hört man Sirenen und alle rennen weg, dann Ergebnis nach Stand).
- **Steuerung**: Pfeile/WASD laufen, J leicht, K schwer, L Block, Leertaste Ausweichen, 1 bis 3 Spezialzüge. Am
  Handy Steuerkreuz links, vier Knöpfe rechts.
- **Ergebnis** als `picks` wie in `applyBrawl` (`down:<n>`, `fled:<n>`, `hurt:<staffId>`, `playerHurt`, `ko`),
  Score = Anteil der ausgeschalteten Gegner, gemindert durch eigene Treffer.
- `ready: true` in `kinds/brawl.ts`.

---

## Teil 3: Razzia-Countdown

- **Auslöser** (`police`): Wird eine Razzia gegen den Spieler geplant (`planRaid`, `planMajorRaid`), der Spieler ist
  in dieser Stadt (`isPlayerIn`) und dort liegt Ware (eigene Lager im Veedel bzw. bei der Großrazzia in den
  betroffenen Veedeln, sonst Ware für den Spot), startet `'stash'` mit `origin { module: 'police', ref:
  'raid:<veedelId>' }` (Großrazzia: `raid:major`). Die Situation sagt, woher der Tipp kommt (Kontakt bei der Polizei,
  sonst Ömer vom Büdchen bzw. der Kiosk der Stadt aus `events/config.ts`).
- **params**: Lager im Veedel mit Partien (Ware, Gramm, Qualität), Ausbau (Tresor, Tarnung aus
  `warehouseModifiers`), Art der Razzia (`spot`, `veedel`, `major`), Zeit bis zur Razzia.
- **Folgen**: `PlannedRaid.stash?: number` bzw. `MajorRaid.stash?: number` (0 bis `STASH_MAX` 0,7, aus dem Score),
  Migration `police` 7. In `searchWarehouses` und `confiscateNear` wird der Anteil mit `(1 − stash)` gemindert, das
  Geld in `raidPlayer`/`majorRaid` ebenso. `'police.raid'` bekommt `stashed`, der Bericht „Das hat gekostet“ zeigt,
  was gerettet wurde. Rechte Hand: wie Score. `timeout`: nichts.
- **Spiel**: Draufsicht auf das eigene Lager (Regale, Kisten, Tür, Lieferwagen vor dem Tor), gezeichnet im Glas-Look.
  Pakete (je Ware ein Farbton und Symbol, Größe nach Menge) per Ziehen in Verstecke: Tresor (nur mit Ausbau, Platz nach
  Stufe), doppelter Boden, Lüftungsschacht, Kofferraum (begrenzt), Gully draußen (schnell, aber Ware ist nass: weniger
  wert). Sirenen werden lauter, Blaulicht an den Fenstern, 30 s (schwer 20 s); am Ende stürmen sie rein, was offen
  liegt, ist weg. Bei einer Razzia am Spot ohne Lager: dieselbe Mechanik am Spot (Blumenkübel, Briefkasten, Mülltonne,
  Gully). Score = geretteter Anteil nach Wert.
- `ready: true` in `kinds/stash.ts`.

---

## Teil 4: Verkehrskontrolle

**Auslöser** (Teil 0): `vehicleCheck`, wenn der Spieler selbst fährt (`logistics`, `trip.driverId === null`). Folgen
über `applyTraffic`.

- **Bühne**: Blick vom Fahrersitz (Lenkrad, Armaturenbrett, Seitenfenster), draußen der Beamte am Fenster
  (`Face` mit Polizeimütze, Look fest aus dem Seed), Taschenlampe, Streifenwagen mit Blaulicht im Rückspiegel, Tageszeit
  und Wetter (Regentropfen auf der Scheibe).
- **Gespräch**: 4 bis 6 Fragen aus Daten (`ui/games/traffic/questions.ts`): Woher, wohin, was ist hinten drin,
  getrunken, Papiere, Rückfragen. Je Frage drei bis vier Antworten, **Zeit zum Antworten** (6 s, schwer 4 s). Lügen
  müssen zusammenpassen: Der Beamte fragt später noch einmal („Wo kamen Sie nochmal her?“), ein Widerspruch macht ihn
  misstrauisch.
- **Puls**: Herzschlag-Anzeige, die man mit ruhigem Tippen im Takt (Taste bzw. Daumen) im grünen Bereich hält. Hoher
  Puls → zittrige Antworten, der Beamte merkt es.
- **Misstrauen** als Balken. Der Beamte tut Dinge, die man beobachten muss (leuchtet in den Laderaum, funkt die
  Kollegen an = Zeitdruck).
- Jederzeit: **„Gas geben“** (→ `flee`, dann Verfolgungsjagd) und **„Schein zustecken“** (`bribe`, Betrag aus
  `params.bribeCost`, klappt nur bei mittlerem Misstrauen, sonst steigt es stark).
- **Ende**: Misstrauen am Schluss unter der Grenze → „Gute Fahrt“ (geschafft). Voll → „Aussteigen, Kofferraum auf!“
  (nicht geschafft).
- `ready: true` in `kinds/traffic.ts`.

---

## Teil 5: Zivi oder Kunde?

- **Auslöser** (`police`): Steht der Spieler selbst an einem Spot (`playerSpot` aus `customers`) in einem Veedel mit
  Heat ab `UNDERCOVER_HEAT` (20), prüft die Polizei stündlich mit einer Chance (nach Heat und Präsenz, Abklingzeit
  `UNDERCOVER_COOLDOWN` 8 h): eine **Schicht mit Zivilfahndern** → `'undercover'` mit `origin { module: 'police',
  ref: 'undercover:<spotId>' }`. `params`: Spot, Ware am Spot, Zahl der Kunden (6 bis 10) und Zivis (1 bis 3 nach
  Heat).
- **Spiel**: Kunden kommen nacheinander als Karte mit Porträt (`Face`, `personLook` aus dem Seed), einem Satz, den sie
  sagen, und dem, was man sieht. Zivis haben **Merkmale** (Knopf im Ohr, nagelneue Schuhe, Ausbeulung am Gürtel, will
  gleich eine große Menge, zu höflich, schaut ständig zum Auto gegenüber), echte Kunden haben auch mal etwas
  Verdächtiges (falsche Fährten). Merkmale als Daten in `ui/games/undercover/tells.ts`, mit Bild im Porträt (Ohrstöpsel,
  Schuhe am unteren Kartenrand) und als Text. Pro Kunde 6 s (schwer 4 s): **wischen** nach rechts = verkaufen, links =
  abwimmeln (Tastatur ←/→). Karten fliegen mit Schwung, Stapel mit Tiefe.
- **Folgen** (`police`): `picks` `soldZivi:<n>`, `spotted:<n>`, `turnedAway:<n>`. Ein Verkauf an einen Zivi → eine
  Kontrolle gegen den Spieler wie in `runCheck` (mit der Chance auf `policeChase`, also die Verfolgungsjagd).
  Alle Zivis erkannt → Heat im Veedel sinkt (`UNDERCOVER_RELIEF`). Echte Kunden weggeschickt → etwas weniger Ruf am
  Spot. Rechte Hand: Score als Anteil richtig. `timeout`: nichts.
- `ready: true` in `kinds/undercover.ts`.

---

## Teil 6: Bude durchsuchen

- **Auslöser** (`gangs`, `reactions.ts`, Zweig `collect`): `debtCollection` mit dem Spieler selbst, Ausgang Erfolg
  oder Rückzug → `'search'` mit `origin { module: 'gangs', ref: 'search:<gangId>:<encounterId>' }`.
  `params.max = (Einsatz − schon bekommenes Geld) + SEARCH_BONUS (0,3) · Einsatz` (das Versteckte aus der Absicht
  `hideMoney` plus seine eigene Reserve).
- **Folgen**: gefundenes Geld `round(max · score)` als Schwarzgeld (`income.other`, mit Stadt), der Gang abziehen,
  Journal. Nicht geschafft und Lärm (`picks` `noise`) → Heat im Veedel. `timeout`: nichts.
- **Spiel**: eine gezeichnete Wohnung (2,5D, Glas-HUD), 15 bis 25 Dinge zum Durchsuchen: Sofakissen, Spülkasten,
  Gefrierfach, Müslipackung, Bilderrahmen, Teppichecke, Lüftungsgitter, Schuhkarton, Matratze, Blumentopf, ein dickes
  Buch, Mikrowelle … Drei bis fünf verstecken Geld (aus dem Seed), manche machen Lärm (Geschirr klirrt → Nachbarn,
  Lärm-Balken). Antippen → kurze Such-Animation, gefundenes Geld fliegt in den Zähler. Bei Nacht nur ein
  Taschenlampenkegel (Maus/Finger), bei Tag Licht durch die Jalousien. Zeit 30 s, am Ende dreht sich der Schlüssel im
  Schloss. Score = gefunden / versteckt.
- `ready: true` in `kinds/search.ts`.

---

## Teil 7: Container packen

- **Auslöser** (`trade`): Der Spieler kauft selbst Container (`trade.buy`) oder belädt sein Schiff (`trade.sail`),
  nicht Fenna (`plans.ts`) und nicht der Bot → `'container'` mit `origin { module: 'trade', ref: 'pack:<id,id,…>' }`
  für die neuen Lieferungen. `params`: Ware, Containergröße (`small`, `medium`, `full`), Deckladung (`none`, `tiles`,
  `bananas`), Anzahl.
- **Folgen**: `TradeShipment.packing?: number` (Score). In `containerRisk` zusätzlich Faktor
  `1.25 − 0.7 · packing` (0 → 1,25, 0,5 → 0,9, 1 → 0,55), ohne Wert 1. Die Vorschau im Bestell-Panel zeigt den
  Faktor nach dem Packen. Rechte Hand: Score. `timeout`: kein Faktor.
- **Spiel**: Container von oben als Raster (Größe nach Container). Ware kommt als Blöcke in Tetris-Formen, dazu die
  Deckladung (Bananenkisten, Fliesenpaletten, ohne Deckladung Kartons mit Altkleidern). Ziel: alle Ware hinein, und
  zwar so, dass sie **von Deckladung umgeben** ist (nicht an den Türen, nicht an der Wand zum Röntgen, keine großen
  zusammenhängenden Ware-Blöcke). Drehen, Ablegen, Rückgängig. 45 bis 60 s. Am Ende fährt der **Röntgen-Scanner**
  einmal über den Container (Animation), auffällige Stellen leuchten auf. Score = verstaute Ware × Tarnung.
- `ready: true` in `kinds/container.ts`.

---

## Teil 8: Papiere fälschen

**Auslöser** (Teil 0): `customsCheck` mit dem Spieler (Autobahn, wenn er selbst fährt; Hafen in Rotterdam, wenn er
am Kai steht). Folgen über `applyPapers`.

- **Bühne**: Schreibtisch des Zolls im Stil von „Papers, Please“: Frachtbrief (CMR) bzw. Konnossement und
  Zollanmeldung, Lieferschein, Fahrzeugschein bzw. Containernummer, Stempel, Waage mit dem echten Gewicht, der Zöllner
  (`Face`) gegenüber.
- **Spiel**: Felder (Absender, Empfänger, Ware, Gewicht, Herkunft, Datum, Kennzeichen/Containernummer, Stempel) haben
  2 bis 5 **Widersprüche** (aus dem Seed, mehr mit `difficulty`). Der Zöllner liest ein Papier nach dem anderen (sein
  Finger wandert die Zeilen runter). Man muss die Widersprüche finden und beheben, **bevor er dort ankommt**: Feld
  antippen, passenden Wert wählen (passend zu den anderen Papieren und zur Waage), fehlende Stempel setzen. Gefunden
  von ihm = Misstrauen; zwei Treffer → nicht geschafft. Dazu „Schein ins Papier legen“ (`bribe`) und „Ladung aufgeben“
  (`giveUp`).
- Score = behobene Widersprüche, bevor er sie sah.
- `ready: true` in `kinds/papers.ts`.

---

## Teil 9: Bewerbungsgespräch

- **Heute sind die Eigenschaften der Bewerber vor der Einstellung sichtbar.** Teil 9 versteckt sie:
  `Candidate.revealedTraits?: TraitId[]`, `CandidateSheet` und `CandidateRow` zeigen nur aufgedeckte Eigenschaften und
  sonst „?“ (wie bei den Werten). Migration `recruiting` 6: alte Bewerber behalten alles sichtbar. Nach der Einstellung
  bleiben alle Eigenschaften sichtbar wie bisher.
- **Auslöser**: Knopf „Gespräch führen“ im Bewerber-Blatt → `'recruiting.interview': { candidateId }` (einmal je
  Bewerber) → `'interview'` mit `origin { module: 'recruiting', ref: <candidateId> }`. `params`: Name, Rolle, Look-Seed,
  Stimme, Eigenschaften (für die Antworten).
- **Spiel**: Gegenüber am Tisch im Hinterzimmer (`Face` groß, Ausdruck nach Antwort). Drei Runden: je eine von drei
  Fragen wählen (Daten in `recruiting`: jede Frage prüft zwei, drei Eigenschaften, z.B. „Was machst du, wenn die
  Bullen kommen?“). Die Antwort kommt als Text, gesprochen mit der Stimme der Figur (`audio.speak`, wenn verfügbar).
  Danach in 8 s antippen, was die Antwort verrät (drei Chips: eine richtig, zwei Köder).
- **Folgen**: `picks` = getippte Eigenschaften; nur echte werden aufgedeckt. Zusätzlich deckt ein gutes Gespräch einen
  versteckten Wert auf (`visibleStats`). Rechte Hand: eine Eigenschaft mit ihrer Chance. Die Rechte Hand und die
  Leutnants stellen weiter ohne Gespräch ein.
- `ready: true` in `kinds/interview.ts`.

---

## Teil 10: Abschluss

- Alle zehn Minispiele einmal im echten Spiel auslösen (Test-Spielstände oder Konsole) und durchspielen, am Desktop und
  am Handy. Einheitlicher Look und Ton, Übergänge zwischen Konfrontation und Minispiel, keine Sackgassen, Leistung der
  Verfolgungsjagd am Handy (`npm run perf:browser -- --mobile --throttle=4`).
- Was in den PRs der Teile 1 bis 9 unter „Für die Integration“ steht, umsetzen.
- `npm run audit:phone`, `npm run monkey:phone`, `npm run e2e` (dazu ein Ende-zu-Ende-Schritt, der ein Minispiel
  spielt), `npm run balance` (keine Verschiebung durch die Minispiele ohne Oberfläche).
- Doku: `CLAUDE.md` (Absatz „Auftrag 44“ vollständig), `docs/architektur.md` (Abschnitt „Minispiele“: Modul,
  Befehle, Ereignisse, Rahmen, Baukasten, wie man ein elftes Minispiel anlegt), `docs/auftraege/README.md` (Stand).
- Screenshots aller zehn Minispiele (`npm run screenshot:minigames -- --kind=alle`) in den PR.
