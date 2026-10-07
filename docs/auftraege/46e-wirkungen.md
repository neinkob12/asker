# Auftrag 46e: Wirkungen (Spezialisten, Buchhalter, Rechte Hand, Pop-ups, Shop-Platzhalter)

Teil von [Auftrag 46 „Intro neu“](46-intro-neu.md). Lies den zuerst (Stufen 7 bis 11, „Nachrichten, Pop-ups,
Meldungen“, „Entschieden“), dazu `CLAUDE.md` und `docs/architektur.md`. Das Modul `tutorial` (46b, PR #93) ist in
`main`. Parallel laufen 46c (Touren und Momente in `tutorial`, `gangs.scriptedRaid`, `customers`) und 46d (Rückbau in
`quests`, `encounters`, `spots`, `messages`, `recruiting`, `market`, `src/ui`).
Branch: `claude/46e-wirkungen`, PR gegen `main`.

## Ziel

Die Rollen und Ereignisse, die das Tutorial freischaltet, müssen etwas bewirken. Heute kosten Anwalt, Buchhalter und
Polizei-Kontakt nur Lohn. Dazu die drei Pop-ups aus dem Plan und der Shop-Platzhalter.

## 1. Spezialisten (`staff`, `police`, `suppliers`/`logistics`)

Wirkung nur über Lesefunktionen, Werte in `staff/config.ts` (`SPECIALIST_EFFECTS`), skaliert mit dem Wert der Person
(Schlüsselwerte wie bei `traitFactor`; „gut“ = Schlüsselwerte über 70):

- **Polizei-Kontakt** (eine Person wirkt, mehrere stapeln nicht): Beschlagnahme-Chance am Kai und auf Routen (Zoll)
  minus 30 % (gut 50 %), Heat-Zuwachs minus 15 % (gut 25 %), Chance auf Polizeikontrollen minus 25 % (gut 40 %).
- **Anwalt**: Verhaftungen der eigenen Leute minus 30 % (gut 50 %) Chance, Haft und Rückgabe beschlagnahmter Ware halb
  so lang, der Spieler selbst kommt nach einer Festnahme schneller frei.
- Beide zeigen ihre Wirkung im Profil (Chips, „Mehr dazu“) und im Personal-Kopf.

## 2. Buchhalter (`staff`, `finance`, `wallet`-Buchungen)

- Nur **einer** gleichzeitig: Anheuern eines zweiten ist gesperrt mit Grund.
- Wirkung: jeder Verkaufserlös plus 3 % (gut 7 %), Löhne aller Leute minus 5 % (gut 10 %). Sonst wird nichts
  günstiger. Die Kasse zeigt eine Zeile „Buchhalter“ (Mehrerlös und gesparte Löhne pro Tag).
- `FEATURE_STAGE['staff.accountant']` bleibt 10; die App Kasse geht mit Stufe 10 auf (ist in 46b so).

## 3. Rechte Hand aus den Leutnants (`hierarchy`)

- `canBeRightHand`: Kandidaten sind die Leutnants der Stadt (mindestens einer vorhanden), keine Stufe Level 4 mehr,
  Loyalität bleibt als Bedingung. Texte und Tipps anpassen. Capos bleiben im Code, werden aber in der Oberfläche
  nicht mehr angeboten, solange das Tutorial aktiv ist (`tutorialAllows`-Feature `staff.capos`, nie frei in Köln);
  ob sie ganz wegfallen, entscheidet ein späterer Auftrag.

## 4. Pop-ups (`registerDialog`, Look Glas, Peter nur, wo er spricht)

- **Lieferant kennenlernen** (`suppliers`): Wird ein Lieferant frei (`tutorialSupplierOpen` wechselt auf true oder
  `requires` ist erfüllt), öffnet sich einmal ein Pop-up mit seinem Porträt (`Avatar look`), Name, Rolle, ein, zwei
  Sätze in seiner Stimme (aus den vorhandenen Begrüßungstexten) und zwei Knöpfen: „Angebot ansehen“
  (`ui.openPhone('suppliers.app', …)`) und „Später“. Danach kein Chat-Gruß mehr (46d entfernt Tonis Begrüßung; bei
  aktivem Tutorial kommt das Pop-up erst in Stufe 5 für Kalle und Toni, als eins mit beiden). Zustand im Modul
  (`introduced: string[]`, Migration: alle heute freien Lieferanten gelten als vorgestellt).
- **Stadt-Event** (`events`): statt der Nachricht ein Pop-up mit Titel, einem Satz, was es bedeutet (mehr Kunden,
  höhere Preise), und Knopf „Ware bestellen“ (`ui.openPhone('suppliers.app')`) und „Okay“. Stadt-Events kommen
  seltener (Werte in `events/config.ts`, etwa halb so oft), dafür mit mehr Nachfrage.
- **Gangs und Polizei seltener, größer** (`gangs/config.ts`, `police/config.ts`): Angriffe, Forderungen, Übernahmen,
  Kontrollen und Razzien etwa halb so oft wie heute, dafür mit spürbareren Folgen (Beute, Verluste, Heat). Dokumentiere
  die geänderten Werte im PR mit vorher/nachher aus `npm run balance`.

## 5. Shop-Platzhalter (`spots/ui`)

- In der App Reviere (oder im Spot-Fenster eines Veedels) ein Eintrag „Spot gründen“, der eine Shop-Seite öffnet:
  „0,99 € pro Spot, höchstens drei“, drei Plätze als Karten, Knopf „Bald verfügbar“ (gesperrt). Kein Kauf, keine
  Bezahlung, kein Netz. `tutorialAllows('spots.found')` bleibt gesperrt; der Platzhalter ist trotzdem sichtbar, damit
  man weiß, dass es kommt. Ein Satz Erklärung, mehr nicht.

## 6. Prüfung

- Tests für jede Wirkung (Spezialisten mit und ohne, gut und normal; Buchhalter nur einer, Erlös und Löhne;
  Rechte Hand aus Leutnants), für die Pop-ups (einmal pro Lieferant, Migration) und die Häufigkeiten (Erwartungswert
  über viele Würfe).
- `npm run balance` vorher und nachher, Zahlen im PR. `npm run e2e`, `npm run screenshot -- --scenes=alle`,
  `npm run monkey:phone`.

## Regeln

- Du arbeitest in `staff`, `hierarchy`, `police`, `suppliers`, `logistics` (Zoll), `finance`, `events`, `gangs/config`,
  `spots/ui` (Shop). 46c und 46d laufen parallel: Fasse `tutorial`, `quests`, `encounters`, `messages`, `src/ui`
  nur an, wo es zwingend nötig ist, minimal und mit Kommentar „Auftrag 46e“. Kommen Konflikte mit `main`, merge
  `main` in deinen Branch (nicht rebasen).
- Werte als Daten in `config.ts`, Wirkung über Lesefunktionen, nie `if (role === 'accountant')` im Ablauf verstreut.
- Doku: `CLAUDE.md` (Kurzabsatz zu Auftrag 46e) und `docs/architektur.md` (Spezialisten, Buchhalter, Rechte Hand).
- Vor dem Push `npm run check`, `npm run build`, `npm run format`, `npm run e2e`. PR mit „Was ist neu“, „Wie
  testen“, „Für die Integration“.
