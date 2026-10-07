# Auftrag 46b: Modul `tutorial` (Stufen, Missionen, Freischalten)

Teil von [Auftrag 46 „Intro neu“](46-intro-neu.md). Lies den zuerst, dazu `CLAUDE.md`, `docs/architektur.md`
(Abschnitte „Zusammenspiel der Systeme“ und „Quests“) und `src/modules/quests/` als Vorbild für Zähler, Belohnungen
und Karte. Dieser Teil baut den **Kern des Tutorials**: in welcher Stufe der Spieler ist, welche Mission läuft, was
freigeschaltet ist, und die Missions-Karte im HUD. Die Touren (Peters Erklärungen Schritt für Schritt) kommen in
Teilauftrag 46c und nutzen den Tour-Baukasten aus 46a, der parallel entsteht. **Dieser Teil ruft die Tour nicht
auf** und braucht 46a nicht.
Branch: `claude/46b-modul-tutorial`, PR gegen `main`.

## Zustand und Start

Neues Modul `src/modules/tutorial/` (Vorlage `_template`).

```ts
interface TutorialState {
  /** false: alles frei (Hardcore, alte Stände, Bot, andere Städte). */
  enabled: boolean;
  /** 0 bis 12, siehe Flow in Auftrag 46. */
  stage: number;
  /** Laufende Mission (ID aus missions.ts) und ihr Fortschritt, wie bei den Quests. */
  mission: { id: string; progress: number; startedAt: number } | null;
  done: string[];
  /** Geskriptete Momente, jeder genau einmal (46c setzt sie, 46b legt die Felder an). */
  scripted: { firstAttack: boolean; seizure: boolean; phoneOrder: boolean; lowStockPopups: number };
}
```

- `init` liefert `enabled: false`. Das Tutorial startet nur über den Befehl **`tutorial.start`**, den die Oberfläche
  direkt nach `session.newGame('normal', …)` schickt (in `src/ui/start.tsx`, nicht im Hardcore-Modus, nicht bei
  `?neu=` ohne `&tutorial=1`). Bot, Szenario-Tests, Test-Spielstände, `npm run balance` und Hardcore laufen so
  unverändert, Würfelfolgen bleiben.
- `tutorial.start` am Spielbeginn: `enabled = true`, Stufe 0, 700 € Schwarzgeld dazu (`wallet.earn`, Kategorie
  `'income.other'`, „Startgeld“; macht mit den 1.500 € aus dem Kern 2.200 €), nur der Neumarkt offen (Ebertplatz und
  Zülpicher Platz werden wieder gesperrt: neuer Befehl `spots.lock { spotId }` in `spots`, nur erlaubt, solange dort
  niemand steht und nichts verkauft wurde). Migration alter Stände: `enabled: false`.
- Befehle: `tutorial.advance` (Stufe +1, nur wenn die Mission der Stufe erledigt ist oder die Stufe keine hat;
  die Oberfläche schickt ihn, wenn die Tour durch ist), `tutorial.skip` (alles frei, Stufe 12, für Entwickler und
  Einstellungen › Einstieg), `tutorial.scripted { key }` (markiert einen geskripteten Moment, für 46c).
- Ereignisse: `tutorial.stageReached { stage }`, `tutorial.missionStarted { id }`, `tutorial.missionDone { id,
  reward }`.
- Tick alle 5 Spielminuten wie bei den Quests: Fortschritt aus `measure`, Abschluss, Belohnung, nächste Mission.

## Stufen und Missionen als Daten (`config.ts`, `missions.ts`)

Die zwölf Stufen aus Auftrag 46, Abschnitt „Der Flow“, mit ihren Missionen:

| Stufe | Mission | Ziel |
| --- | --- | --- |
| 1 | `serve3` | drei Kunden selbst bedienen (`sale.completed` mit `sellerId === null`, `channel === 'street'`) |
| 2 | `buySpots` | Zülpicher Platz und Rudolfplatz freischalten |
| 5 | `threeProducts` | drei verschiedene Produkte bestellt (`shipment.ordered`, Produkte zählen) |
| 6 | `earn4k` | 4.000 € schwarz **und** vier weitere Spots **und** drei Läufer (Teilziele, alle erfüllt) |
| 7 | `earn10k` | einmal 10.000 € schwarz, eigenes Veedel übernommen, fünf weitere Spots |
| 8 | `harbor` | 4.000 € gewaschen, Liegeplatz gemietet, einmal bei Jansen bestellt |
| 9 | `lieutenants4` | zwei weitere Veedel, vier Leutnants |
| 11 | `boss` | sieben Veedel |
| 12 | `koelnDone` | 50.000 € schwarz, 12.000 € sauber, alle Spots, alle zwölf Veedel, überall ein Läufer, Bestellregeln bei allen Lieferanten, Fahrer auf allen Kölner Routen, Aufgaben der Rechten Hand an |

Stufen ohne Mission (0, 3, 4, 10) sind reine Erklär-Stufen: Sie enden mit `tutorial.advance` aus der Oberfläche.
Eine Mission kann **Teilziele** haben (`parts: { label, measure, target }[]`); die Karte zeigt sie als Liste mit Haken.
Peters Text pro Mission (`task`, `doneText`) und ein Satz Tipp (`hint`) wie bei den Quests, kurz.

**Belohnung** nach der Regel aus Auftrag 46: 20 % des Umsatzes der letzten 24 Stunden als Schwarzgeld (gerundet auf
50 € unter 1.000 €, sonst auf 100 €, mindestens 100 €) und 20 % der in den letzten 24 Stunden verkauften Gramm als
Ware (gerundet auf 5 g unter 100 g, sonst auf 10 g, mindestens 10 g) in dem Produkt, das am meisten verkauft wurde
(`goods.usagePerDay`, Umsatz aus `finance`, Tagesbuch gestern plus heute anteilig oder `customers`-Statistik, was
sauberer ist). Funktion `missionReward(state): { money, productId, amount }` mit Test. Ware kommt mit `storeFitting`
ins nächste Lager mit Platz, der Rest als Nachricht von Peter.

## Freischalten (öffentliche Lesefunktionen in `index.ts`)

```ts
export type TutorialFeature =
  | 'hud.cleanMoney' | 'hud.stock' | 'hud.reputation' | 'hud.rank'
  | 'app.territory' | 'app.gangs' | 'app.suppliers' | 'app.laundering' | 'app.goods' | 'app.finance'
  | 'staff.lieutenants' | 'staff.security' | 'staff.driver' | 'staff.specialist' | 'staff.accountant' | 'staff.rightHand'
  | 'gangs.threats' | 'gangs.attacks' | 'gangs.protection' | 'gangs.takeover'
  | 'police.undercover' | 'police.checks' | 'police.raids'
  | 'spots.upgrade' | 'spots.found' | 'laundering.allWays' | 'suppliers.groupOrder';

export function tutorialActive(state): boolean;            // enabled && stage < 12
export function tutorialStage(state): number;
export function tutorialAllows(state, feature): boolean;    // true, wenn nicht aktiv
export function tutorialSpotOpen(state, spotId): boolean;   // darf der Spot angeboten werden
export function tutorialSpotCost(state, spotId): number | null; // 350 für zuelpicher/rudolfplatz in Stufe 2
export function tutorialSupplierOpen(state, supplierId): boolean;
export function currentMission(state): MissionDef | null;
export function missionProgress(state): { parts: { label; value; target }[] };
```

Welche Stufe was freigibt, steht als Tabelle in `config.ts` (`FEATURE_STAGE: Record<TutorialFeature, number>`) nach
Auftrag 46: sauberes Geld 8, Lager 5, Ruf beim ersten Stammkunden (Stufe egal, Ereignis), Rang beim ersten Aufstieg,
Reviere 3, Gangs 4 (Drohungen 4, Angriffe/Schutzgeld/Übernahmen 7), Lieferanten 5, Geldwäsche 8 (alle Wege 9), Lager-App
8, Kasse 10, Leutnants 7, Sicherheit 7, Fahrer 8, Spezialisten 9, Buchhalter 10, Rechte Hand 11, Zivis 0, Kontrollen
und Razzien 9, Spot-Ausbau nie (fällt weg), Spot gründen nie (Shop-Platzhalter kommt in 46e), Sammelbestellung 9.
Spots: Stufe 1 nur Neumarkt; Stufe 2 dazu Zülpicher Platz und Rudolfplatz für 350 €; Stufe 6 alle Spots im eigenen
Veedel und den Nachbarveedeln (`veedel`-Nachbarn, sonst Luftlinie unter 2 km); ab Stufe 7 alle. Lieferanten: bis
Stufe 5 keine App; ab 5 Kalle und Toni; Hamburg ab 6; Berlin, Amsterdam, Rotterdam wie heute über `requires`.

**Einbau in die anderen Module (klein halten):** `hiddenWhen` der Apps und HUD-Teile ruft `tutorialAllows` (statt
`phoneAppLocked` aus `quests`, das entfällt); `spots.lockedSpots` und `unlock` fragen `tutorialSpotOpen` und
`tutorialSpotCost`; `suppliers.getSuppliers` fragt `tutorialSupplierOpen`; `staff` bietet Rollen nur mit
`tutorialAllows('staff.<rolle>')` an (Anheuern, Bewerber, Rumfragen); `gangs`, `police`, `laundering`, `spots`
(Ausbau, Gründen) prüfen ihr Feature am Anfang des jeweiligen Ablaufs. Nur Funktionsaufrufe in Funktionen, keine
Top-Level-Nutzung (Ordnerregel 6). Solange das Tutorial aktiv ist, schickt `quests` keine Quests und keine Handy-Schritte
(`questsSuppressed(state)` in `quests`, ruft `tutorialActive`); der Rückbau der Quests selbst ist 46d.

## Oberfläche (`ui/index.tsx`)

- **Missions-Karte** im HUD (`placement: 'below'`, `order` wie die Quest-Karte, die bei aktivem Tutorial versteckt
  ist): Peters Porträt klein, Titel, Teilziele mit Haken oder Fortschrittsbalken, Belohnung („+ 450 € · + 35 g Haze“
  aus `missionReward`, live), Knopf zur passenden Stelle (`goTo` wie bei den Quests). Anker `data-tour="hud.mission"`.
  Erledigt: kurz golden leuchten, Ton, dann die nächste Karte. Keine Banner, keine Dynamic Island.
- Einstellungen › Einstieg: Schalter „Tutorial beenden“ (`tutorial.skip`) statt der heutigen Handy-Schritte.
- Dev-Haken `window.koeln.dev.tutorialStage(n)` (ruft `tutorial.skip`-ähnlich bis Stufe n, nur Entwicklung).
- Neue Spielstände für die Oberfläche: `?neu=normal&tutorial=1&seed=1` startet mit Tutorial.

## Tests und Prüfung

- Modultests: Start (700 €, nur Neumarkt), jede Mission mit ihren Zählern (Ereignisse einspielen), Teilziele,
  Belohnungsregel (Rundung, Untergrenze, Produktwahl), Freischalt-Tabelle (ein Test pro Feature-Gruppe), Migration,
  `enabled: false` ändert nichts am Spiel (Szenario mit und ohne Tutorial gleicher Seed: ohne `tutorial.start` gleiche
  Würfelfolge wie heute).
- `npm run balance` liefert dieselben Zahlen wie vor dem Auftrag (Bot ohne Tutorial).
- `npm run e2e` bekommt einen Fall „neues Spiel mit Tutorial“: nur ein Spot sichtbar, Mission 1 auf der Karte, drei
  Verkäufe erledigen sie, Belohnung kommt.
- Screenshots `npm run screenshot -- --scenes=tutorial` (Karte mit Mission 1 und mit Teilzielen).

## Regeln

- Nur `src/modules/tutorial/` neu; in anderen Modulen nur die Freischalt-Abfragen und `spots.lock`, so klein wie
  möglich, jeder Eingriff mit Kommentar „Auftrag 46b“. Kein Tour-Aufruf (46c), kein Rückbau (46d), keine neuen
  Wirkungen (46e).
- `CLAUDE.md` und `docs/architektur.md`: Abschnitt zum Modul `tutorial` (Stufen, Befehle, Freischalt-Funktionen, wie
  man ein Feature anhängt).
- Vor dem Push `npm run check`, `npm run build`, `npm run format`, `npm run e2e`. PR mit „Was ist neu“, „Wie
  testen“, „Für die Integration“ (dort: welche Features noch keine Abfrage haben, was 46c für die Touren braucht).
