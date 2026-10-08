# Auftrag 46c: Touren je Stufe, geskriptete Momente, Willkommen-Seite

Teil von [Auftrag 46 „Intro neu“](46-intro-neu.md). Lies den zuerst (Abschnitte „Grundregeln“, „Der Flow“,
„Nachrichten“), dazu `CLAUDE.md`, `src/ui/README.md` (Abschnitt „Tour“) und `docs/architektur.md` (Abschnitt zum
Modul `tutorial`). Der Tour-Baukasten (46a, PR #92) und das Modul `tutorial` (46b, PR #93) sind in `main`; die
Abschnitte „Für die Integration“ beider PRs sind Pflichtlektüre, dort stehen die Eigenheiten (Anker nur bei offenem
Handy, `anchorKey`, `waitFor { state }` wird sofort geprüft, Tempo nach der Tour, Touren enden bei Neues Spiel/Laden).
Branch: `claude/46c-touren-und-momente`, PR gegen `main`.

## Ziel

Jede Stufe des Tutorials bekommt ihre Tour mit Peter (Porträt, ein, zwei Sätze pro Schritt), und die vier
geskripteten Momente aus dem Plan passieren. Das Spiel startet mit einer Willkommen-Seite statt des Story-Intros.

## 1. Willkommen-Seite

- `IntroDialog.tsx` wird ersetzt: eine Seite „Willkommen in Kölle. Du bist Dealer am Neumarkt. Wie heißt du?“ mit
  Namensfeld (Regeln wie heute: `cleanPlayerName`, `PLAYER_NAME_MAX`), danach die Wahl des Modus wie heute. Die
  Story-Seiten fallen weg; Einstellungen › „Intro noch einmal“ zeigt nur noch diese Seite.
- Modus normal startet mit Tutorial (so ist es seit 46b), Hardcore ohne.

## 2. Touren je Stufe (`src/modules/tutorial/ui/tours.ts`, reine Daten)

Eine Tour pro Stufe als `TourDef`, Sprecher immer `PETER` aus `tutorial/config.ts`. Jeder Schritt ein, zwei Sätze,
Kölsch-Ton wie Peters Quest-Texte, kein Text länger als 140 Zeichen. Die Tour einer Stufe startet auf
`tutorial.stageReached` (und beim Laden eines Spielstands, wenn die Stufe ihre Tour noch nicht hatte: neues Feld
`toursSeen: number[]` im Zustand, Migration). Am Ende einer Erklär-Stufe (0, 3, 4, 10) schickt die Tour selbst
`tutorial.advance`; der „Weiter“-Knopf auf der Missions-Karte verschwindet dafür. Nach der Tour aus Stufe 0 wird das
Tempo auf 1 gesetzt (siehe PR #92, „Tempo“).

| Stufe | Tour | Anker und Besonderheiten |
| --- | --- | --- |
| 0 | HUD: Schwarzgeld, Heat (steigt durch Verkauf, Gewalt, Auffallen), Uhr, Tempo, dann Handy: Startbildschirm, Nachrichten, Personal (nur Läufer, dazu Bewerber und Rumfragen), Einstellungen; am Ende die Missions-Karte | `hud.money.dirty`, `hud.heat`, `hud.clock`, `hud.speed`, `phone.home`, `phone.app.core.messages`, `phone.app.tab:staff`, `phone.screen`, `hud.mission`; Handy im `before` öffnen (`ui.showPhone`, `ui.openPhone`), am Ende `ui.closePhone` |
| 1 | Kamera auf den Neumarkt, Kundenanzeige (1 erscheint, rot bei Ablauf), Spot-Fenster: Verkaufen, Preis, Läufer (kurz) | `spot.customer` mit `anchorKey: 'neumarkt'`, `ui.flyTo` im `before`; `spot.panel`, `spot.sell`, `spot.price`, `spot.runner` nach `ui.openPanel('spots.spot', …)`; der Verkaufs-Schritt wartet mit `waitFor { event: 'sale.completed' }` |
| 2 | Kamera raus, beide Spots zum Kauf zeigen | neuer Anker `spot.marker` mit `anchorKey = spotId` am Marker gesperrter Spots (in `spots/ui`), zwei Schritte Zülpicher Platz und Rudolfplatz |
| 3 | App Reviere: Was ist ein Revier, Nachfrage und Polizei im Veedel, wer herrscht, wie übernimmt und verliert man es | `phone.app.tab:territory`, `phone.screen`; ein Schritt zeigt das eigene Veedel (Altstadt-Süd) |
| 4 | App Gangs: wer ist stärker, wie schlägt man sie, wie steigt die eigene Stärke | `phone.app.tab:gangs`, `phone.screen` |
| 5 | App Lieferanten: Liste (der Spieler tippt selbst einen Lieferanten an, `waitFor { ui }`), Angebot (er bestellt selbst einmal, `waitFor { event: 'shipment.ordered' }`; Feedback 08.10.2026: vorher sperrten die Weiter-Schritte Liste und „Kaufen“), Hinweis „mehr Produkte, mehr Kunden, Ware auf Lager lohnt sich“; sobald die erste Lieferung da ist (`shipment.arrived`, Ereignisname prüfen) eine zweite kurze Tour über das Lieferungs-Menü und das Lager im HUD | `phone.app.suppliers.app`, `phone.screen`, `suppliers.offer`, `hud.stock`; dafür Anker an die Teile der Lieferungs-Seite setzen (nur Attribute) |
| 6 | Alle Spots im Veedel sind frei, Läufer einstellen lohnt sich; die Missions-Karte mit Teilzielen | `hud.mission`, `map` |
| 7 | Personal: Bereich Leutnants, einen ernennen (`waitFor` auf `staff.lieutenantAppointed` o. ä.) | `phone.app.tab:staff`, `phone.screen`, Anker an den Bereich Leutnants |
| 8 | Geldwäsche (Kiosk), sauberes Geld im HUD; Hafen und Liegeplatz; nach dem Fahrer-Einstellen direkt Route anlegen und ihn draufsetzen | `phone.app.laundering.app`, `hud.money.clean`, Hafen-Seite, Personal (Fahrer), Routen-Seite in `logistics/ui` (Anker setzen) |
| 9 | Nach der Beschlagnahme: Polizei-Intro (Kontrollen, Razzien, Heat unter 40), Spezialisten im Personal, Einzeln oder Sammelbestellung | `hud.heat`, `phone.app.tab:staff`, Anker am Bestell-Umschalter in `suppliers/ui` |
| 10 | Buchhalter einstellen, dann die Kasse | `phone.app.tab:staff`, `phone.app.finance.app`, `phone.screen` |
| 11 | Rechte Hand: was sie tut (Aufträge ausfahren, Aufgaben, Vollmacht), eine ernennen | Personal, Seite der Rechten Hand |
| 12 | Ein Schritt: „Köln gehört dir. Hamburg wartet“, Karte Deutschland | `map`, `hud.rank` |

Wetter: Im HUD gibt es seit Auftrag 26 keine Wetter-Anzeige mehr (PR #92). Setze eine kleine Wetter-Anzeige neben die
Uhr (Symbol und Grad, Daten aus `weather`, Anker `hud.weather`, Look Glas), dann hat Stufe 0 ihren Wetter-Schritt.

## 3. Geskriptete Momente

Alle vier hängen an Bedingungen im Zustand, nie an der Uhr, laufen im Tick des Moduls `tutorial` (jede Spielminute
prüfen reicht), passieren genau einmal (`tutorial.scripted { key }`, `scriptedDone`) und nur bei aktivem Tutorial.

1. **Handy-Bestellung** (`phoneOrder`): sobald zum ersten Mal 3.000 € Schwarzgeld da sind (ab Stufe 6). `customers`
   bekommt eine Funktion oder einen Befehl, mit dem eine Lieferbestellung eines Kunden im eigenen Veedel erzeugt wird
   (Produkt, das auf Lager ist, kleine Menge). Dazu eine kurze Tour: „Ein Kunde bestellt übers Handy. Du fährst selbst
   hin, Läufer tun das nicht.“ mit Anker auf der Nachricht bzw. der Bestellung.
2. **Lager fast leer** (`lowStockPopup`, bis zu dreimal): Lagerbestand in Köln unter dem Verbrauch eines Tages
   (`goods.usagePerDay`) an den ersten fünf Spieltagen. Pop-up (Dialog, `registerDialog`) mit Peter: „Dein Lager ist
   fast leer, bestell nach“, Knopf „Zu den Lieferanten“ (`ui.openPhone('suppliers.app')`) und „Später“. Zähler im
   Zustand (`scripted.lowStockPopups`), höchstens eins pro Spieltag.
3. **Erster Gang-Angriff** (`firstAttack`): zum ersten Mal 6.000 € Schwarzgeld (ab Stufe 7). Ablauf fest, ohne
   Konfrontation: Die stärkste Gang mit Anspruch auf Altstadt-Süd (oder die Gang mit dem meisten Einfluss dort) überfällt
   den Neumarkt; `gangs` bekommt dafür eine Funktion `scriptedRaid(ctx, { spotId, goodsShare: 0.3, cashShare: 0.4 })`:
   30 % jeder Ware in allen Kölner Lagern weg (`goods`), 40 % des Schwarzgelds weg (`wallet.lose`, Kategorie
   `loss.gang`), Nachricht der Gang in ihrer Stimme, Journal, Ereignis. Direkt danach eine Tour: Hotspot-Regel (an
   Hotspots passiert mehr, da lohnt Sicherheit), Sicherheit im Personal, mit `waitFor` auf das Einstellen und das
   Einsetzen am Neumarkt. Erst danach gelten Gang-Angriffe im Spiel (`gangs.attacks` ist ab Stufe 7 ohnehin frei;
   prüfe, dass bis zum Moment kein zufälliger Angriff dazwischenkommt: `gangs` fragt `scriptedDone(state,
   'firstAttack')`, solange das Tutorial aktiv ist).
4. **Beschlagnahme** (`seizure`): die zweite Lieferung von Jansen (Rotterdam) nach dem Liegeplatz wird am Kai
   vollständig beschlagnahmt, ohne Wahl „Papiere fälschen“ (die Wahl gibt es ab Stufe 9 für alle weiteren). Mechanik in
   `logistics`/`suppliers` (wo heute die Zollkontrolle am Kai entschieden wird): bei aktivem Tutorial, Stufe 9, zweite
   Rotterdam-Lieferung, `!scriptedDone('seizure')` → Zoll nimmt alles, Nachricht der Polizei, dann die Tour aus Stufe 9.

## 4. Nachrichten in der Tour-Zeit

Solange das Tutorial aktiv ist, schreibt Peter nicht zusätzlich per Chat, was die Tour sagt (keine Doppelung). Eine
erledigte Mission bleibt wie in 46b (Karte leuchtet, Ton, Belohnung); die Belohnung steht als eine Zeile im Chat von
Peter.

## 5. Prüfung

- Test: jede Tour referenziert nur Anker aus `TOUR_ANCHORS` (plus `spot.marker`), kein Text über 140 Zeichen, Stufen
  0 bis 12 haben eine Tour. Tests für die vier Momente (Bedingung, genau einmal, Beträge, nicht ohne Tutorial).
- `npm run e2e`: der Tutorial-Fall läuft durch Stufe 0 (Tour mit Enter weiterklicken) bis zur ersten Mission.
- `npm run screenshot -- --scenes=tutorial-tour` (Stufe 0 am HUD, Stufe 1 am Spot, Stufe 5 im Handy; Desktop und
  Handy-Bildschirm).
- `npm run balance` unverändert (Bot ohne Tutorial).

## Regeln

- Touren und Momente gehören ins Modul `tutorial` (`ui/tours.ts`, `scripted.ts`). In anderen Modulen nur die nötigen
  Funktionen (`gangs.scriptedRaid`, Bestellung in `customers`, Beschlagnahme-Haken, Wetter-Anzeige, Anker-Attribute),
  jeder Eingriff mit Kommentar „Auftrag 46c“. Kein Rückbau (46d), keine neuen Wirkungen (46e); diese laufen parallel
  in `quests`, `encounters`, `messages`, `staff`, `hierarchy`, `police`, `finance`. Berühre diese Module nur für
  Anker-Attribute.
- Bausteine aus `src/ui/components`, Design-Tokens, Look Glas, Texte Deutsch.
- Vor dem Push `npm run check`, `npm run build`, `npm run format`, `npm run e2e`. PR mit „Was ist neu“, „Wie
  testen“, „Für die Integration“.
