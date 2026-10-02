# Auftrag 27: Handy-Inhalte (Bilanz in der Kasse, Geldwäsche, Personal, Gangs, klare Optik)

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/27-handy-inhalte-bilanz.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, docs/handy-design.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Erst starten, wenn Auftrag 26 (Handy aufräumen) in `main` ist.** Prüfen: Auf dem Startbildschirm gibt es die Apps
Kasse, Reviere, Gangs, Personal, Geldwäsche, Einstellungen, und es gibt keine App "Logistik" mehr. Ist Auftrag 26
noch offen, nicht loslegen, sondern dem Spieler Bescheid sagen.

## Wunsch aus dem Probespielen (02.10.2026)

> Generell muss das Handy mehr farblich getrennt sein, damit man eine deutlich cleanere und bessere Übersicht hat.
> Viele Sachen haben hässliche Zeilenumbrüche, zum Beispiel "Hafenkolonne", da steht das E in der nächsten Zeile. Die
> Punkte als Trennung ("greift an · ignoriert dich") anders machen, mit einer Unterlage oder einem Hintergrund, so dass
> man es wirklich als Register sieht. Auch beim Lager alles farblich trennen. Es gibt zu viele kleine Bemerkungen unter
> den Punkten, die alles erklären. Lieber ausklappbar: Wenn man die Informationen braucht, kann man sie sehen.
>
> Kasse finde ich gut, aber man muss verstehen können, warum man Geld verdient oder verliert: Was ist mein Einkauf,
> was sind meine Ausgaben. Eher als Bilanz, Tagesbilanz, Wochenbilanz. Den Gewinn pro Viertel auswählen können.
>
> Geldwäsche ist ein großer Bestandteil des Spiels, Schwarzgeld in sauberes Geld umzuwandeln. Das muss größer werden,
> aktuell ist das zu wenig.
>
> Gangs ist an sich gut, aber oben das "Du", "Stä" und "Dro" ist total unübersichtlich. Da sollte deine Stärke stehen,
> die Zahl, und die Stärke der Gangs.
>
> Personal überarbeiten. Das Rumfragen muss besser funktionieren, und man muss sehen, wen man noch einstellen könnte.
> Es muss mehr Menschen in diesem Register geben.

## Rahmen

- **Ganzer Code freigegeben**, Schwerpunkt `src/ui/`, `src/ui/components/` und die `ui/`-Ordner von `finance`,
  `laundering`, `gangs`, `staff`, `recruiting`, `goods`. Spiellogik nur für Geldwäsche und Bewerber (Etappen 3 und 4).
- **Auftrag 28 läuft vielleicht parallel** (Spiellogik `customers`, `staff`, `hierarchy`, `spots`). Bei Konflikten in
  `staff/ui` oder `recruiting`: `main` mergen, nicht rebasen; Rollennamen aus Auftrag 28 übernehmen.
- **Bausteine statt Einzellösungen:** Die Optik-Regeln (Etappe 1) kommen in `src/ui/components` und gelten dann
  überall. Keine freien Hex-Werte, Bedeutungsfarben (`money`, `dirty`, `danger`, `people`, `place`, `goods` …).
- Sprachregel, Determinismus, Migrationen, keine neuen npm-Pakete wie immer.
- **Etappen**, nach jeder `npm run check`, Commit, Push, Draft-PR nach Etappe 1. Vor dem letzten Push zusätzlich
  `npm run build`, `npm run e2e`, `npm run screenshot:phone`, `npm run audit:phone`, `npm run balance`.

## Entscheidungen (vorab getroffen)

| Thema | Entscheidung |
| --- | --- |
| Zeilenumbrüche | Nie mitten im Wort. Namen und Werte umbrechen nicht (`white-space: nowrap`, sonst Kürzen mit "…"), Fließtext nur an Wortgrenzen (`hyphens: manual`, `overflow-wrap: normal`). Gilt in allen Bausteinen. |
| Trennpunkte | Keine "a · b · c"-Ketten mehr in Listen. Mehrere Eigenschaften stehen als **Chips** (kleine Flächen mit Bedeutungsfarbe, z.B. Status "greift an" rot, "ignoriert dich" grau). Baustein `Chip`/`Tag` erweitern. |
| Gruppen | Listen-Abschnitte bekommen eine sichtbare Unterlage (Fläche + Rand, wie iOS-Gruppen) und eine farbige Kopfzeile nach Bedeutung. Lager: je Produktgruppe eine Farbe (`goods`), je Lager eine Gruppe. |
| Erklärtexte | Höchstens ein kurzer Satz pro Seite sichtbar. Alles Weitere in ausklappbaren Zeilen ("Mehr dazu", Baustein `Disclosure` o.ä.) oder als Info-Knopf. Bestehende `Hint`-Texte durchgehen und kürzen. |
| Kasse | Startseite ist eine **Bilanz** mit Umschalter **Heute, Gestern, 7 Tage, 30 Tage**: oben Gewinn groß, darunter **Einnahmen** (Verkauf, Lieferungen, Großhandel …) und **Ausgaben** (Einkauf Ware, Löhne, Schutzgeld, Kaution, Miete, Geldwäsche-Gebühr, Strafen …) als aufklappbare Gruppen mit Summen. Filter **Ganz Köln / Veedel / Spot / Leutnant**. Ein kleiner Verlauf (Balken pro Tag). Grundlage sind die Kategorien aus `MONEY_CATEGORIES` (`src/core/wallet.ts`) und `finance`. |
| Geldwäsche | Eigene, große App: oben Schwarzgeld und sauberes Geld nebeneinander, darunter laufende Wäschen mit Fortschritt, mehrere **Wege** mit unterschiedlicher Gebühr, Dauer, Obergrenze und Risiko (siehe Etappe 3). |
| Gangs | Kopf der Gangs-Seite zeigt **deine Stärke als Zahl** und darunter **jede Gang mit ihrer Stärke** als Balken im Vergleich zu dir. Keine abgekürzten Beschriftungen ("Stä", "Dro"). Haltung zu dir als Chip. |
| Personal | Mehr Bewerber und klareres Rumfragen (Etappe 4). Bewerber sind eine eigene Gruppe "Könntest du einstellen" mit Rolle, Lohn, Handgeld, Level und Ablaufzeit; Rumfragen zeigt vorher, was es kostet und wie viele Leute es ungefähr bringt. |

## Etappen

### 1. Optik-Regeln in den Bausteinen

- `src/ui/components`: Zeilenumbruch-Regeln, `Chip` (Bedeutungsfarbe, klein, nicht umbrechend), Gruppen mit
  Unterlage und farbiger Kopfzeile, `Disclosure` (ausklappbar, merkt sich nichts). Bestehende Props nur erweitern.
- Alle Modul-UIs auf "a · b"-Ketten durchsuchen (`grep -rn " · " src/modules/*/ui src/ui`) und auf Chips oder
  Wert-rechts-in-der-Zeile umbauen. Lange Hinweise kürzen oder in `Disclosure` stecken.
- Vorher/nachher-Screenshots aller Handy-Seiten (`npm run screenshot:phone`) in den PR.

### 2. Kasse als Bilanz

- `src/modules/finance` (Logik nur erweitern): Auswertungen für Zeitraum (heute, gestern, 7, 30 Tage) und Filter
  (Veedel, Spot, Leutnant), gruppiert in Einnahmen und Ausgaben nach Kategorie. Fehlen Daten für 30 Tage, Speicher
  im Zustand erweitern (Version + Migration + Test), aber begrenzen (z.B. Tageswerte, keine Einzelbuchungen).
- `finance/ui`: Bilanz-Seite nach der Tabelle, jede Gruppe ausklappbar bis zur einzelnen Kategorie, Tippen auf eine
  Kategorie zeigt die größten Posten. Ein Satz oben, warum der Zeitraum Gewinn oder Verlust gemacht hat (größter
  Posten, z.B. "Löhne sind höher als der Umsatz").

### 3. Geldwäsche größer

- `src/modules/laundering`: statt eines einzigen Wegs **drei Wege**, die man nach und nach freischaltet:
  1. **Kumpel mit Kiosk** (von Anfang an): kleine Beträge, hohe Gebühr, schnell, fast kein Risiko.
  2. **Waschsalon / Shisha-Bar** (Freischalten mit sauberem oder Schwarzgeld): mittlere Beträge, mittlere Gebühr.
  3. **Bauunternehmer oder Immobilien** (spät, braucht Ruf oder Reviere): große Beträge, niedrige Gebühr, langsam,
     erhöht Heat, wenn zu viel auf einmal läuft.
  Werte in `laundering/config.ts`, Buchungen mit Kategorie. Alte Spielstände: laufende Wäschen bleiben gültig
  (Version + Migration + Test). Mit `npm run balance` prüfen, dass das mittlere Spiel nicht leichter wird (Zahlen im
  PR). Mehr Inhalt (Tarnfirmen mit eigenem Gameplay) ist ein späterer Auftrag, hier nur die drei Wege.
- `laundering/ui`: die große App nach der Tabelle; die Geld-Anzeigen im HUD öffnen sie (macht Auftrag 26).

### 4. Personal und Bewerber

- `src/modules/recruiting`: mehr Bewerber gleichzeitig (Größe des Pools und Nachschub in `config.ts` erhöhen, je nach
  Ruf und Revieren), Rumfragen mit sichtbarer Wirkung (Kosten, ungefähre Zahl neuer Leute, welche Rollen eher kommen,
  wählbar: "Läufer suchen", "Fahrer suchen", "Sicherheit suchen"). Wer abläuft, verschwindet mit einer stillen Notiz.
- `staff/ui` + `recruiting/ui`: Personal-Seite in drei Gruppen: **Dein Team** (nach Rolle), **Könntest du einstellen**
  (Bewerber, nach Rolle filterbar), **Leute finden** (Rumfragen). Eine Zeile pro Person mit Avatar, Rolle als Chip,
  Lohn rechts.

### 5. Gangs

- `gangs/ui`: Kopf nach der Tabelle (deine Stärke als Zahl, Balken pro Gang, Haltung als Chip), ausgeschriebene
  Beschriftungen, Namen wie "Hafenkolonne" ohne Umbruch.

## Abnahme

- Kein Wort im Handy bricht mitten im Wort um, keine "·"-Ketten in Listen (Screenshots Desktop und Handy).
- Kasse beantwortet auf einen Blick: Wie viel Gewinn heute/Woche, woher kommt das Geld, wohin geht es, und pro Veedel.
- Geldwäsche mit drei Wegen; Balancing-Bericht vorher/nachher im PR.
- Personal zeigt deutlich mehr Bewerber, Rumfragen mit Rollenwahl.
- Gangs-Kopf ohne Abkürzungen, mit Stärke-Zahlen.
- `npm run check`, `npm run build`, `npm run e2e`, `npm run audit:phone` grün.
- PR-Beschreibung: "Was ist neu", "Wie testen", "Offen".
