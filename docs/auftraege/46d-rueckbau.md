# Auftrag 46d: Rückbau (Quests, Konfrontationen, Spot-Ausbau, Dynamic Island, Banner, Chats)

Teil von [Auftrag 46 „Intro neu“](46-intro-neu.md). Lies den zuerst (Abschnitte „Nachrichten, Pop-ups, Meldungen“
und „Was aus dem Spiel fliegt oder still wird“), dazu `CLAUDE.md` und `docs/architektur.md`. Das Modul `tutorial`
(46b, PR #93) ist in `main`; sein Abschnitt „Für die Integration“ nennt, was hier aufzuräumen ist (`questsSuppressed`,
`phoneSteps`, `PETER` doppelt). Parallel laufen 46c (Touren, Momente, in `tutorial`, `gangs.scriptedRaid`,
`customers`, Wetter-Anzeige) und 46e (Wirkungen in `staff`, `hierarchy`, `police`, `suppliers`, `finance`, `events`).
Branch: `claude/46d-rueckbau`, PR gegen `main`.

## Ziel

Weg mit allem, was den Einstieg zutextet oder den Spielfluss stört. Was wegfällt, fällt sauber weg: Migrationen für
alte Stände, Test-Spielstände laden weiter, `npm run check`, `npm run e2e` und `npm run balance` laufen.

## 1. Quests

- Die Quests von Peter (alle Kapitel, Köln bis Produktion), die Quest-Karte im HUD, die Seite „Alle Quests“,
  `PHONE_APP_STEPS`, `phoneAppLocked`, `phoneStepsEnabled`, `questsSuppressed`, Einstellungen › Einstieg (Handy-Schritte)
  und die Quest-Belohnungen fallen weg. Der Meilenstein-Titel „Boss von Köln“ und `MILESTONE_TITLE` wandern nach
  `city` oder `territory` (die Bestenliste braucht ihn weiter).
- **Wochenverträge bleiben**, aber erst nach Köln: Angebote kommen nur, wenn Köln komplett ist oder die aktive Stadt
  nicht Köln ist. Sie ziehen in ein eigenes Modul `contracts` (Zustand, Befehl `quests.acceptContract` wird
  `contracts.accept`, HUD-Karte, Migration aus `modules.quests.contracts`), oder das Modul `quests` bleibt nur mit den
  Verträgen und heißt weiter so. Entscheide nach Aufwand, schreib es in den PR.
- Peters Kontakt (`quest:peter`) bleibt, Definition nur noch in `tutorial/config.ts`. Alte Quest-Chats bleiben im
  Spielstand lesbar.
- Migration: `modules.quests` alter Stände wird in den neuen Zustand überführt (oder entfernt), nichts wirft.
  `testSaves.test.ts` muss grün bleiben; wenn Test-Spielstände neu gebaut werden müssen (`npm run saves:build`), tu es
  und sag es im PR.

## 2. Konfrontationen

- Die Akte (Absichten, Zeiger, Polizei-Uhr, Einsätze, Rat der Rechten Hand, Crew-Spezialzüge) fällt als Oberfläche
  weg. Jede Konfrontation (Gang-Überfall, Räuber, Polizeikontrolle, Zollkontrolle, Übernahme) wird sofort automatisch
  entschieden, so wie es `autoResolveEncounter` für den Bot heute schon tut (Stärke, Sicherheit am Spot, Heat, Würfel),
  und das Ergebnis erscheint als kurze Ergebnis-Karte im Look Glas über der Karte (wer, wo, was passiert ist, was es
  gekostet hat, ein Knopf „Okay“; keine Entscheidung mehr). Steht der Spieler selbst am Spot (`playerStandingIn`),
  kommt stattdessen das Minispiel Straßenkampf bzw. das passende Minispiel wie heute über `EncounterKind.minigames`,
  dessen Ausgang die Folgen bestimmt.
- Die Module behalten ihre Schnittstelle (`encounters.start`, Ereignisse `encounter.resolved`), damit `gangs`,
  `police`, `logistics`, `trade` nichts ändern müssen. Toter Code (Akte-UI, `intents.ts`, `actions.ts`, `advice.ts`,
  `tactics.ts`, soweit die automatische Entscheidung sie nicht braucht) wird gelöscht, Tests angepasst.
- `npm run balance` darf sich dadurch nicht ändern (der Bot löst heute schon automatisch auf). Prüfe das vor und nach.

## 3. Spot-Ausbau

- Ausbau-Stufen, `spots.upgrade`, `spots.upgraded`, der Abschnitt im Spot-Fenster und die Wirkung in `spotModifiers`
  fallen weg; `spots.upgrades` im Zustand wird wegmigriert. Spot-Arten (`kinds.ts`), Bekanntheit und `weekHours`
  bleiben. `tutorial` kennt das Feature `spots.upgrade`: entferne es dort und in `FEATURE_STAGE`.
- Spot gründen bleibt als Befehl, ist aber nur noch über den Shop-Platzhalter erreichbar (46e baut ihn); der heutige
  Weg über die Karte („Spot gründen“ mit Ortswahl) wird aus der Oberfläche entfernt.

## 4. Dynamic Island, Banner, Mitteilungszentrale

- Die Dynamic Island fällt weg: keine `registerLiveActivity`-Darstellung mehr, kein Aufklappen, kein Puls. An ihrer
  Stelle steht oben eine kleine, feste Anzeige „n Lieferungen unterwegs“ (nur Zahl und Symbol, Tipp öffnet die
  Lieferanten-App), sichtbar nur, wenn n größer 0. `registerLiveActivity` und `pulseIsland` werden entfernt oder zu
  No-ops mit Kommentar, die elf Aufrufer bereinigt.
- Push-Banner fallen weg: `ui.toast` zeigt nichts mehr über der Karte, alles landet im Verlauf (Einstellungen ›
  Verlauf). Ausnahmen bleiben in `tutorial` (Missions-Karte leuchtet, Belohnung) und die Tour-Box. `PhoneNotification`,
  `ui.notify`, `holdBanner`, die Mitteilungszentrale und `soundOnEvent`-Banner werden entsprechend zurückgebaut; ein
  Badge an der Nachrichten-App bleibt.

## 5. Chats und Meldungen

Raus (keine Nachricht mehr, Logik bleibt, wo sie das Spiel braucht): Bewerber-Chats aus `recruiting` (Bewerber stehen
nur in der Personal-App), Geschichten der Leute (`staff/stories.ts` und `staff.storyChoice`: ganz raus), Marktbericht
(`market`), Kneipen und Klüngel (Nachrichten raus, Mechanik darf bleiben oder weg), Tonis Begrüßung beim Spielstart
(das Kennenlernen baut 46e als Pop-up), Nachrichten des Tagesberichts der Rechten Hand bleiben.
Gangs und Polizei: Drohungen, Forderungen und Polizei-Nachrichten höchstens eine pro Gang bzw. Polizei pro Spieltag;
46e dreht die Häufigkeit der Ereignisse selbst.
Stadt-Events: Nachrichten raus; das Pop-up kommt mit 46e (`events`).

## 6. Prüfung

- `npm run check`, `npm run build`, `npm run e2e`, `npm run balance` (vorher und nachher: durch die wegfallenden
  Quest-Belohnungen verschieben sich die Zahlen, dokumentiere die neue Grundlinie im PR), `npm run screenshot --
  --scenes=alle` (keine Island, keine Banner), `npm run monkey:phone`, `npm run audit:phone`.
- Test-Spielstände laden (`testSaves.test.ts`), ein frisches Spiel ohne Tutorial (Hardcore) hat keine Quest-Karte,
  keine Island, keine Banner, keinen Ausbau.

## Regeln

- Du arbeitest in `quests`, `encounters`, `spots`, `messages`, `recruiting`, `staff/stories`, `market`, `src/ui`
  (Island, Banner, Mitteilungszentrale). 46c und 46e laufen parallel: Fasse `tutorial`, `gangs`, `customers`,
  `hierarchy`, `police`, `suppliers`, `finance`, `events` nur an, wo der Rückbau es zwingend braucht, und dann minimal
  mit Kommentar „Auftrag 46d“. Kommen Konflikte mit `main`, merge `main` in deinen Branch (nicht rebasen).
- Löschen statt auskommentieren. Jede Zustandsänderung mit Migration und Test.
- Doku: `CLAUDE.md` und `docs/architektur.md` ohne die weggefallenen Teile (Quests, Akte, Ausbau, Island, Banner).
- Vor dem Push `npm run check`, `npm run build`, `npm run format`, `npm run e2e`. PR mit „Was ist neu“, „Wie
  testen“, „Für die Integration“.
