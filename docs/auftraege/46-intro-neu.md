# Auftrag 46: Intro neu – Tour, Missionen und Freischalten Schritt für Schritt

Stand 07.10.2026, dritte Fassung: der Flow aus dem Gespräch plus die Antworten auf alle Rückfragen. Nichts ist
mehr offen. Das Papier und das Brainstorming vom Vortag werden eingearbeitet,
sobald sie da sind.

## Warum

Spieler sehen die Zahlen im HUD, denken aber nicht darüber nach, was da steht. An sehr vielen Stellen ist viel zu
viel Text. Das Quest-System hat zu viele Quests in der falschen Reihenfolge, und am ersten Tag ist das Postfach voll,
bevor man drei Verkäufe gemacht hat. Ziel ist eine kurze Einführung, die mit dem natürlichen Spielfluss nach und nach
die Funktionen freischaltet und jede Funktion genau dann erklärt, wenn sie dran ist. **Die Quests von Peter fallen
weg**, an ihre Stelle treten die Missionen unten.

## Grundregeln

1. **Tour statt Text.** Wird etwas erklärt, ist genau dieses Element umrandet und leicht eingefärbt, der Rest des
   Bildschirms ist ausgegraut, daneben eine Box mit ein, zwei Sätzen und „Weiter“. Beim nächsten Schritt wandert die
   Umrandung weiter (vom Schwarzgeld zur Heat). Der Fokus liegt auf dem Grafischen, nicht auf dem Lesen. Während
   einer Tour steht die Uhr.
2. **Freischalten statt Erklären auf Vorrat.** Was noch nicht dran ist, ist unsichtbar: Teile des HUD, Apps und
   Bereiche im Handy, Lieferanten, Gangs, Polizei. Jede Stufe schaltet frei, erklärt kurz und verlangt direkt die
   erste Benutzung (einmal bestellen, einmal einstellen, einmal einsetzen).
3. **Missionen mit saftiger Belohnung.** Jede Mission wird spürbar belohnt (Regel unten).
4. **Ruhe im Handy.** Keine Push-Banner, keine Dynamic Island, deutlich weniger Chats. Wer neu dazukommt (vor allem
   Lieferanten), meldet sich mit einem Pop-up, mit dem man kurz interagieren muss.
5. **Kurze Erklärungen.** Ein, zwei Sätze pro Schritt, mehr nicht.
6. **Nur im Modus normal.** Hardcore hat keine Tour und keine Missionen, da ist alles von Anfang an frei. Alte
   Spielstände und spätere Städte ebenso.

## Was heute da ist (Stand `main`, 07.10.2026)

- Erster Start: Intro-Dialog mit Story-Seiten und Name für die Bestenliste, danach die Wahl des Modus.
- Quests von Peter (`src/modules/quests`): fünf Kölner Kapitel, ein Kapitel pro Stadt, Rotterdam, Produktion. Handy
  Schritt für Schritt (`PHONE_APP_STEPS`) hängt sieben Apps an Quests.
- Am Start drei Spots offen (Ebertplatz, Neumarkt, Zülpicher Platz), Startgeld 1.500 € schwarz, 40 g Gras.
- Lieferanten in Köln: Kalle (Köln, nur Gras) und Toni (Frankfurt) von Anfang an; Berlin ab einem Veedel, Hamburg ab
  1.500 € Umsatz, Amsterdam ab drei Veedeln und 15.000 € Umsatz, Jansen (Rotterdam) mit Liegeplatz im Niehler Hafen
  (4.000 € sauber).
- Rechte Hand braucht Level 4, Loyalität und zwei Leutnants. Capos führen Leutnants.
- Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) kosten Lohn, **haben im Code aber keine Wirkung**.
- Gangs und Polizei laufen vom ersten Tag an. Konfrontationen (Akte mit Absichten, Zeigern, Crew) sind der Weg für
  Gang-Angriffe, Räuber, Polizeikontrollen und Zollkontrollen.
- Meldungen: 72 Stellen rufen `ui.toast`, 74 schicken Chat-Nachrichten, 11 melden sich an der Dynamic Island an.

## Der Flow

### Stufe 0: Willkommen, Name, Tour durchs Interface

- Das Story-Intro fällt weg. Stattdessen eine Seite: „Willkommen in Kölle. Du bist Dealer am Neumarkt. Wie heißt
  du?“ mit der Eingabe des Namens. Dann die Wahl des Modus.
- Im Modus normal folgt die Tour über das HUD, Element für Element: Schwarzgeld, Heat (wie sie steigt und warum),
  Uhrzeit, Wetter, Tempo-Regler, dann das Handy (was es ist, die Apps öffnen und kurz hineinsehen: Nachrichten,
  Personal mit Läufern, Einstellungen).
- **Die App Personal ist von Anfang an frei, zeigt aber nur Läufer.** Bewerber und Rumfragen werden hier gleich mit
  erklärt. Leutnants kommen in Stufe 7 dazu, Sicherheit in Stufe 7, Fahrer in Stufe 8, Spezialisten in Stufe 9,
  Buchhalter in Stufe 10, Rechte Hand in Stufe 11.
- Sauberes Geld ist 0 und bleibt ausgeblendet bis zur Geldwäsche (Stufe 8). Lager, Ruf und Rang kommen erst, wenn sie
  etwas bedeuten: Lager bei der ersten Lieferung (Stufe 5), Ruf beim ersten Stammkunden, Rang beim ersten Aufstieg.

### Stufe 1: Ein einziger Spot, der Neumarkt

- Es gibt nur den Neumarkt. Die Kamera zoomt auf ihn, man wird hingeleitet.
- Tour am Spot, im Spiel: Hier kommen Kunden. Steht ein Kunde da, erscheint die 1. Läuft die Zeit ab, wird es rot.
  Dann das Spot-Menü Schritt für Schritt: selbst verkaufen, Preis ändern, Läufer einstellen (kurz angeschnitten).
  **Der Spot-Ausbau fällt als Feature weg.**
- Mission 1: drei Kunden selbst bedienen.

### Stufe 2: Rauszoomen, zwei Spots kaufen

- Die Karte zoomt raus. Zum Verkauf stehen nur Zülpicher Platz und Rudolfplatz, je **350 €**, alle anderen Spots
  sind unsichtbar. Dafür gibt es **700 € mehr Startgeld (2.200 € statt 1.500 €)**.
- Mission 2: beide kaufen. Belohnung mit Ware, damit der Vorrat bis zur ersten Bestellung reicht.

### Stufe 3: Reviere

- App Reviere wird frei. Tour: Was ist ein Revier (Nachfrage, Kaufkraft, Polizei, wer herrscht), wie übernimmt man
  es, wie verliert man es.

### Stufe 4: Gangs

- App Gangs wird frei. Tour: Wer ist stärker, wie schlägt man sie, wie erhöht man die eigene Stärke.
- Bis zum ersten Angriff (Stufe 7) kommen von Gangs nur **Drohungen per SMS**: kein Angriff, kein Schutzgeld, keine
  Übernahme. Schutzgeld gibt es nach dem ersten Angriff, auch als Konsequenz.

### Stufe 5: Lieferanten und Lager

- App Lieferanten wird frei. Tour. Mission 3: drei verschiedene Produkte kaufen (Kalle und Toni sind von Anfang an
  da, zusammen haben sie genug Sortiment).
- Leichte, deutliche Hinweise: Mehr Produkte bringen mehr Kunden, Ware auf Lager lohnt sich.
- Kommt die Lieferung an, wird das Lieferungs-Menü einmal mit allem erklärt, was darin steht. Jetzt erscheint auch
  das Lager im HUD. Einzeln oder Sammelbestellung wird erst in Stufe 9 erklärt, wenn die Beschlagnahme droht.
- Lieferanten: am Anfang nur Kalle und Toni; die weiteren kommen nach und nach (Hamburg ab Stufe 6, Berlin ab dem
  ersten Veedel, Amsterdam ab drei Veedeln) und melden sich mit einem Pop-up, mit dem man kurz interagieren muss.

### Stufe 6: Geld verdienen

- Mission 4: 4.000 € Schwarzgeld, vier weitere Spots freischalten, drei Läufer einstellen. Jetzt stehen alle Spots im
  eigenen Veedel und den Nachbarveedeln zum Verkauf.
- Ist das Lager zu niedrig (unter dem Verbrauch eines Tages), kommt in den ersten Tagen bis zu dreimal ein Pop-up
  („Dein Lager ist fast leer, bestell nach“) mit Knopf zur Lieferanten-App, wegklickbar.
- Beim ersten Mal 3.000 € Schwarzgeld kommt die erste Handy-Bestellung. Tour: So funktioniert das, du fährst selbst
  hin.

### Stufe 7: Leutnants, erster Gang-Angriff, Sicherheit

- Ist Mission 4 erfüllt, bekommt die App Personal den Bereich **Leutnants**. Tour: Ein Leutnant führt bis zu drei
  Spots mit eigenen Leuten. Man ernennt direkt einen.
- Mission 5: einmal 10.000 € Schwarzgeld auf dem Konto, das eigene Veedel übernehmen, fünf weitere Spots.
- Auf dem Weg dahin, sobald man zum ersten Mal 6.000 € hat, der **erste Gang-Angriff auf dem Neumarkt**: fest 30 %
  der Ware im ganzen Lager und 40 % des Bargelds weg, nicht zu gewinnen. Dann die Hotspot-Regel (an Hotspots
  passiert mehr, da lohnt Sicherheit), Sicherheit wird frei, mindestens eine Person einstellen und auf den Neumarkt
  setzen.
- Ab jetzt sind Gangs scharf: Angriffe, Schutzgeld, Übernahmen. Seltener als heute, dafür größer.

### Stufe 8: Geldwäsche, Hafen, Fahrer

- Ist Mission 5 erfüllt, wird die App Geldwäsche frei und erklärt, zunächst nur der Kiosk. Sauberes Geld erscheint im
  HUD.
- Mission 6: 4.000 € waschen, den Liegeplatz im Niehler Hafen kaufen, Rotterdam freischalten und dort mindestens
  einmal bestellen. Highlight: der Preis dort ist gut. Mit dem Hafen kommen das zweite Lager, die Lager-App und der
  Lager-Ausbau (Platz, Regale, Tresor).
- Dann werden Fahrer frei: einen einstellen, und direkt danach die Route Hafen → Lager anlegen und ihn draufsetzen.
  Fahrzeuge und Fahrplan werden in diesem Schritt mit gezeigt.

### Stufe 9: Vier Leutnants, Beschlagnahme, Spezialisten

- Mission 7: zwei weitere Veedel gewinnen, mindestens vier Leutnants.
- Polizei bis hierher: Heat und Zivis laufen, aber keine Kontrollen und keine Razzia. Wird ein Läufer erwischt, ist
  nur seine Ware weg.
- Die zweite Hafen-Bestellung wird beschlagnahmt, die ganze Ware ist weg. Intro der Polizei: ab jetzt Kontrollen und
  Razzien, Heat unter 40 halten lohnt sich. Die Beschlagnahme läuft fest ab, davor die Wahl „Papiere fälschen“
  (Minispiel) wie heute, und hier wird Einzeln oder Sammelbestellung erklärt.
- Spezialisten werden frei, einen einstellen. Wirkung (neu, heute keine):
  - **Polizei-Kontakt:** weniger Zoll (Beschlagnahme am Hafen), weniger Heat, weniger Polizeikontrollen.
  - **Anwalt:** weniger Verhaftungen, Leute und Ware schneller frei.

### Stufe 10: Buchhalter und Kasse

- Nach Mission 7 wird der Buchhalter frei, man stellt einen ein, damit geht die App Kasse auf.
- Wirkung (neu): **nur einer** gleichzeitig, kein Stapeln. Ein Buchhalter bringt 3 % mehr Gewinn, ein guter 7 %,
  und die Leute, die man einstellt, sind etwas günstiger (Löhne). Sonst wird nichts günstiger.

### Stufe 11: Alle sieben Veedel, Rechte Hand

- Mission 8: sieben Veedel (Meilenstein „Boss von Köln“). Dann wird die Rechte Hand frei, man muss sie einstellen und
  bekommt erklärt, was sie tut (Aufträge ausfahren, Aufgaben, Vollmacht).
- Bedingung neu: Die Rechte Hand wird aus den Leutnants gewählt (vier hat man seit Mission 7), die Stufe Level 4
  entfällt. Capos kommen, falls nötig, später nach der Rechten Hand, sonst fliegen sie aus dem Spiel.

### Stufe 12: Köln fertig, Hamburg

- Mission 9: 50.000 € schwarz, 12.000 € sauber, alle Spots, alle zwölf Veedel, überall ein Läufer, alles
  automatisiert: Bestellregeln bei den Lieferanten, Aufgaben der Rechten Hand, Fahrer auf allen Routen in Köln.
  Routen in andere Städte gehören nicht dazu. Dann wird Hamburg frei.

## Belohnungen

Regel: **20 % des Umsatzes der letzten 24 Stunden als Schwarzgeld, dazu 20 % der in den letzten 24 Stunden
verkauften Gramm als Ware**, Geld aufgerundet auf 50 bzw. 100 €, Ware auf 5 bzw. 10 g. Mindestens 100 € und 10 g,
sonst gibt es in Stufe 1 (drei Kunden) nur ein paar Euro.

Durchgerechnet an den Test-Spielständen (Bot, Seed 12; „Umsatz“ und „Gewinn“ sind der letzte volle Tag, „Gewinn“
nach Einkauf, Löhnen, Spots):

| Stand | Tag | Schwarz | Umsatz/Tag | Gewinn/Tag | g/Tag | Lager g | 20 % € | 20 % g |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Köln, die ersten Tage (Stufe 5–6) | 3 | 1.155 | 2.145 | −290 | 184 | 262 | 450 | 35 |
| Erstes Veedel (Stufe 7) | 6 | 790 | 3.430 | 1.198 | 280 | 602 | 700 | 55 |
| Boss von Köln (Stufe 11) | 16 | 7.526 | 30.133 | −189 | 2.184 | 123 | 6.050 | 435 |
| Köln komplett (Stufe 12) | 22 | 50.000 | 24.612 | 6.110 | 1.825 | 2.602 | 4.900 | 365 |

Einordnung: Das Geld entspricht ungefähr einem Tagesgewinn an einem guten Tag, nie mehr als einem Fünftel des
Kontostands bei den großen Missionen und nie mehr als dem Umsatz eines Tages. Die Ware ist ein Fünftel der
Tagesnachfrage, also ein spürbarer Puffer, kein Lagerfüller (nur bei „Boss von Köln“ war das Bot-Lager fast leer, da
wären 435 g das Dreifache des Bestands, aber immer noch nur ein Fünftel eines Tages). **Die Regel verzerrt den
Fortschritt nicht**, weil die Missionen Tage auseinanderliegen und die Zielbeträge (4.000, 10.000, 50.000 €) jeweils
deutlich über der Belohnung der Mission davor liegen. Zwei Feinheiten: Die Ware kommt als das Produkt, das man am
meisten verkauft hat (sonst landet Vape im Lager, das keiner nimmt), und für die Missionen 1 und 2 greift die
Untergrenze.

## Nachrichten, Pop-ups, Meldungen

- **Bleibt im Chat:** Peter als Stimme der Tour und der Missionen (Porträt in der Tour-Box),
  Lieferanten (Kennenlernen als Pop-up, Lieferung da, Problem), Gangs (Drohungen ab Stufe 4, Forderungen ab Stufe 7),
  Polizei (ab Stufe 9). Polizei und Gangs seltener als heute, dafür größere Ereignisse mit mehr Wirkung.
- **Raus:** Bewerber-Chats, Geschichten der Leute, Marktbericht, Kneipen, Klüngel. Wochenverträge erst nach Köln.
- **Stadt-Events:** als Ankündigungs-Pop-up, seltener als heute, mit Hinweis „mehr Ware bestellen“ und einem Knopf
  direkt dafür.
- **Push-Banner:** weg (die Tour-Boxen ersetzen sie). **Dynamic Island:** weg. Die kleine Anzeige oben, wie viele
  Bestellungen unterwegs sind, bleibt als Zahl, nur das Aufklappen fällt weg.

## Was aus dem Spiel fliegt oder still wird

| System | Entscheidung |
| --- | --- |
| Quests von Peter (alle Kapitel) | weg, ersetzt durch die Missionen in Köln; die Städte danach bekommen später eine eigene Story-Linie |
| Konfrontationen (Akte) | weg als Feature. Gang-Angriffe, Räuber, Kontrollen und Zoll werden aus Stärke, Sicherheit und Heat automatisch entschieden, mit einem kurzen Ergebnis-Pop-up; steht man selbst am Spot, kommt das Minispiel Straßenkampf |
| Spot-Ausbau | weg |
| Spot gründen | nur im Shop, 0,99 € pro Spot, höchstens drei; vorerst Platzhalter ohne Kauf (Bezahlung ist ein eigener Auftrag) |
| Capos | später nach der Rechten Hand, falls nötig, sonst weg |
| Markt-Index, Rabatt-Aktionen | still: Preise bewegen sich weiter, Aktionen nur als Badge im Angebot, keine Nachricht |
| Marktbericht | weg |
| Wochenverträge | erst nach Köln |
| Ware strecken, Qualität | still, nach Köln erklärt; Strecken später als Slider (Design-Rework Handy) |
| Stammkunden, Dealer | still |
| Minispiele | bleiben, jedes wird beim ersten Mal kurz erklärt |
| Kneipen, Klüngel, Stadt-Events, Wetter-Wirkung | still oder weg, keine Nachrichten |
| Bestenliste | unverändert |

## Technik (grob)

- **Tour-Baukasten in `src/ui`:** Elemente tragen einen Anker (`data-tour="hud.dirty"`), eine Tour ist eine Liste
  von Schritten (Anker, ein, zwei Sätze, optional „muss man selbst tun“), ein Overlay graut alles aus und schneidet
  den Anker frei (umrandet, leicht eingefärbt), dazu die Box mit „Weiter“. Öffnet ein Schritt eine App oder ein
  Panel, tut die Tour das selbst. Tempo 0 während der Tour.
- **Modul `tutorial` statt `quests`:** Stufe 0 bis 12 und die Missionen als Zustand, deterministisch. Die Stufe
  steuert `hiddenWhen` von Apps, Bereichen und HUD-Teilen, welche Spots und Lieferanten es gibt, ob Gangs und Polizei
  scharf sind. Im Modus hardcore, in alten Ständen und in späteren Städten steht die Stufe auf „alles frei“.
- **Geskriptete Momente** (an Bedingungen im Zustand, nicht an der Uhr): erster Gang-Angriff bei 6.000 €,
  Beschlagnahme der zweiten Hafen-Bestellung, Handy-Bestellung bei 3.000 €, Lager-niedrig-Pop-up.
- **Umbauten an bestehenden Modulen:** `encounters` wird zu automatischen Entscheidungen; Spezialisten und Buchhalter
  bekommen Wirkung (`staff`, `police`, `suppliers`, `finance`); Rechte Hand aus den Leutnants (`hierarchy`); Shop
  für Spots als Platzhalter (`spots`); Spot-Ausbau raus (`spots/kinds.ts`, `spotModifiers`).
- Bot, Szenario-Tests und `npm run balance` laufen mit „alles frei“, damit Würfelfolgen bleiben.

## Entschieden am 07.10.2026 (zweite Runde)

1. **Nur Köln.** Für die Städte nach Köln fallen Peters Kapitel, Rotterdam und Produktion mit den Quests weg; dort
   gibt es vorerst keine Führung. Eine eigene Story-Linie für die anderen Städte wird später überlegt.
2. **Peter spricht in der Tour**, mit Porträt in der Box (und Stimme wie im Anruf, wenn das ohne Aufwand geht).
3. **Shop nur als Platzhalter.** Spot gründen zeigt im Handy einen Shop mit „0,99 € pro Spot, höchstens drei“, aber
   ohne Kauf. Bezahlung mit echtem Geld ist ein eigener Auftrag.
4. **Rechte Hand aus den Leutnants**, ohne die Stufe Level 4 (angenommen, nicht widersprochen).

## Umsetzung in Teilaufträgen

Jeder Teil läuft in einer eigenen Session mit eigenem Branch und PR gegen `main`. Eine Routine („Korrektur-Loop
Auftrag 46“, stündlich, sichtbar unter Routinen) prüft die Sessions und PRs gegen diesen Plan, schickt Korrekturen
und startet den nächsten Teil, sobald der vorige gemergt ist.

| Teil | Inhalt | Hängt ab von |
| --- | --- | --- |
| [46a](46a-tour-baukasten.md) (PR #92, gemergt) | Tour-Baukasten in `src/ui/tour` (Overlay, Anker, Box mit Peter, Weiter, Uhr steht) | nichts |
| [46b](46b-modul-tutorial.md) (PR #93, gemergt) | Modul `tutorial`: Stufen, Missionen mit Belohnungsregel, Freischalt-Funktionen, Missions-Karte, `tutorial.start` | nichts (parallel zu 46a) |
| [46c](46c-touren-und-momente.md) | Touren je Stufe mit Peters Texten, geskriptete Momente (erster Gang-Angriff, Beschlagnahme, Handy-Bestellung, Lager-Pop-up), Willkommen-Seite mit Name | 46a, 46b |
| [46d](46d-rueckbau.md) | Rückbau: Quests, Konfrontationen (automatische Entscheidung plus Straßenkampf am Spot), Spot-Ausbau, Dynamic Island, Push-Banner, Chats (Bewerber, Geschichten, Marktbericht, Kneipen, Klüngel), Verträge nach Köln | 46b |
| [46e](46e-wirkungen.md) | Wirkungen: Spezialisten, Buchhalter, Rechte Hand aus den Leutnants, Lieferanten-Kennenlern-Pop-up, Stadt-Event-Pop-up mit Bestell-Knopf, Shop-Platzhalter | 46b |
