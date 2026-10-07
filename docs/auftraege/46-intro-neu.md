# Auftrag 46: Intro neu – Tour, Tutorial und Freischalten Schritt für Schritt

**Entwurf** aus dem Gespräch vom 07.10.2026 (Sprachnachricht, sinngemäß). Das Papier und das Brainstorming vom
Vortag kommen noch dazu. Offene Punkte stehen bei der jeweiligen Stufe unter „Offen“; sobald sie geklärt sind,
wird daraus der eigentliche Auftrag.

## Warum

Spieler sehen die Zahlen im HUD, denken aber nicht darüber nach, was da steht. An sehr vielen Stellen ist viel zu
viel Text. Das Quest-System hat zu viele Quests (zweistellig allein in Köln, mit allen Städten über 60) in der
falschen Reihenfolge, und am ersten Tag ist das Postfach voll, bevor man drei Verkäufe gemacht hat. Ziel ist eine
kurze Einführung, die mit dem natürlichen Spielfluss nach und nach die Funktionen freischaltet und jede Funktion
genau dann erklärt, wenn sie dran ist.

## Grundregeln

1. **Tour statt Text.** Wird etwas erklärt, ist genau dieses Element umrandet und leicht eingefärbt, der Rest des
   Bildschirms ist ausgegraut, daneben eine Box mit ein, zwei Sätzen und „Weiter“. Beim nächsten Schritt wandert die
   Umrandung weiter (z.B. vom Schwarzgeld zur Heat). Der Fokus liegt auf dem Grafischen, nicht auf dem Lesen.
2. **Freischalten statt Erklären auf Vorrat.** Was noch nicht dran ist, ist unsichtbar: Teile des HUD (sauberes Geld
   bis zur Geldwäsche), Apps im Handy, der Spot-Ausbau, Lieferanten, Gangs, Polizei. Jede Stufe schaltet frei, erklärt
   kurz und verlangt direkt die erste Benutzung (einmal bestellen, einmal einstellen, einmal einsetzen).
3. **Missionen mit saftiger Belohnung.** Jede Mission unten wird spürbar belohnt, damit man sich darauf freut.
4. **Ruhe im Handy.** Keine Push-Banner mehr, keine Dynamic Island, deutlich weniger Chats. Nur wer neu dazukommt
   (vor allem Lieferanten), meldet sich mit einem Pop-up, mit dem man kurz interagieren muss.
5. **Kurze Erklärungen.** Ein, zwei Sätze pro Schritt, mehr nicht.

## Was heute da ist (Stand `main`, 07.10.2026)

- Erster Start: Intro-Dialog mit Story-Seiten und Name für die Bestenliste (`src/ui/builtin/IntroDialog.tsx`), danach
  die Wahl des Modus (normal, hardcore). Es gibt keine weitere Schwierigkeit.
- Quests von Peter (`src/modules/quests/config.ts`): fünf Kölner Kapitel (Ankommen, Dein Team, Wachsen, Die Straße,
  Boss von Köln, Ganz Köln), dazu ein Kapitel pro Stadt, Rotterdam, Produktion. Karte unter Geld und Heat, in den
  ersten zwei Kapiteln golden mit „Zeig mir wie“ (springt zur Stelle, erklärt aber nichts).
- Handy Schritt für Schritt (Auftrag 45): `PHONE_APP_STEPS` hängt sieben Apps an Quests (Lieferanten, Kasse, Personal,
  Reviere, Geldwäsche, Lager, Gangs). Nachrichten und Einstellungen sind immer da.
- Am Start sind drei Spots offen (Ebertplatz, Neumarkt, Zülpicher Platz), Rudolfplatz kostet 600 €, Aachener Weiher
  450 €. Startgeld 1.500 € schwarz, 0 € sauber, 40 g Gras.
- Lieferanten in Köln: Kalle (Köln) und Toni (Frankfurt) von Anfang an; Berlin ab einem Veedel, Hamburg ab 1.500 €
  Umsatz, Amsterdam ab drei Veedeln und 15.000 € Umsatz, Jansen (Rotterdam) mit Liegeplatz im Niehler Hafen
  (4.000 € sauber).
- Rechte Hand braucht heute Level 4, Loyalität und zwei Leutnants. Leutnants führen bis zu drei Spots, Capos führen
  Leutnants.
- Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) lassen sich einstellen und kosten Lohn, **haben im Code aber
  keine Wirkung**. Der Buchhalter braucht also ohnehin ein Konzept.
- Gangs und Polizei laufen vom ersten Tag an (Zivis seit Auftrag 45 schon ab Tag 1 bis 3, wenn man selbst am Spot
  steht).
- Umfang der Meldungen: 72 Stellen rufen `ui.toast`, 74 schicken Chat-Nachrichten, 11 melden sich an der Dynamic
  Island an (vor allem Fahrten und Handel).

## Der Flow

Jede Stufe: was frei wird, was die Tour zeigt, welche Mission läuft, was offen ist.

### Stufe 0: Modus wählen, dann die Tour durchs Interface

- Nach der Wahl des Modus geht es nicht direkt ins Spiel, sondern in eine Tour über das ganze HUD, Element für
  Element: Schwarzgeld, Heat (wie sie steigt und warum), Uhrzeit, Wetter, Tempo-Regler, dann das Handy (was es ist,
  die wenigen Apps öffnen und kurz hineinsehen: Nachrichten, Einstellungen), Rang, Lager, Ruf.
- Sauberes Geld ist am Anfang 0 und bleibt ausgeblendet, bis die Geldwäsche frei ist (Stufe 8).
- Offen:
  - Läuft das Spiel während der Tour oder steht die Uhr (Vorschlag: Tempo 0, bis die Tour durch ist)?
  - Bleibt das Story-Intro mit dem Namen davor, oder rückt die Namenseingabe woanders hin?
  - Gilt das Tutorial auch im Modus hardcore, und gibt es „Überspringen“ für Leute, die es kennen (Vorschlag: ja, in
    den Einstellungen ein Schalter wie heute bei „Einstieg“)?
  - Rang, Lager und Ruf: Sind sie Teil der ersten Tour, oder kommen sie erst, wenn sie etwas bedeuten (Lager bei der
    ersten Lieferung, Ruf beim ersten Stammkunden, Rang beim ersten Aufstieg)?

### Stufe 1: Ein einziger Spot, der Neumarkt

- Es gibt nur den Neumarkt. Die Kamera zoomt auf ihn, man wird hingeleitet.
- Tour am Spot, im Spiel: Hier kommen Kunden. Steht ein Kunde da, erscheint die 1. Läuft die Zeit ab, wird es rot.
  Dann das ganze Spot-Menü, Schritt für Schritt: selbst verkaufen, Preis ändern, Läufer einstellen (kurz
  angeschnitten, kommt später richtig). Der Spot-Ausbau ist im Menü noch nicht da.
- Mission: drei Kunden selbst bedienen.
- Offen:
  - Im Brainstorming hieß es „Erklärung des Bezirks direkt nach dem ersten Spot“ (Nachfrage, Kaufkraft, Polizei, wer
    herrscht, gewinnen und verlieren), im späteren Flow kommen die Reviere erst nach den drei Spots mit der App
    (Stufe 3). Was gilt: ein kurzer Blick aufs Veedel schon hier und die App später, oder alles in Stufe 3?
  - Wann kommt der Spot-Ausbau zurück ins Menü (Vorschlag: mit Stufe 6, wenn man Geld verdienen soll)?

### Stufe 2: Rauszoomen, zwei Spots kaufen

- Die Karte zoomt raus. Zum Verkauf stehen nur Zülpicher Platz und Rudolfplatz, alle anderen Spots sind unsichtbar
  oder gesperrt.
- Mission: beide kaufen. Belohnung.
- Offen:
  - Im Brainstorming hatte man nach dem Rauszoomen vier Spots und sollte als Erstes bestellen; im Flow sind es ein
    Spot plus zwei zu kaufende und die Bestellung kommt erst in Stufe 5. Welche Fassung gilt?
  - Zülpicher Platz ist heute kostenlos, Rudolfplatz 600 €. Sollen beide etwas kosten (mit 1.500 € Startgeld und
    Umsatz von drei Kunden), und wenn ja, wie viel?
  - Mit 40 g Gras am Start und drei Spots ohne Nachschub bis Stufe 5: Reicht die Ware, oder gibt es als Belohnung
    Ware dazu?

### Stufe 3: Reviere

- App Reviere wird frei. Tour: Was ist ein Revier, wie übernimmt man es, wie verliert man es.
- Offen: Gibt es hier schon eine Mission (z.B. „Schau dir dein Veedel an“), oder nur die Erklärung?

### Stufe 4: Gangs

- App Gangs wird frei. Tour: Wer ist stärker, wie schlägt man sie, wie erhöht man die eigene Stärke.
- Offen:
  - Gangs sollen nach einer ersten Nachricht erst an Tag 2 oder 3 „eingeführt“ werden. Ist das die Stufe hier (App
    plus Erklärung), und bleiben Gangs bis zum ersten Angriff (Stufe 7) sonst still: keine Drohungen, keine
    Übernahmen, keine Schutzgeld-Forderungen?
  - Das Konfrontations-System (Akte mit Absichten, Zeigern, Crew) kommt im Flow nicht vor. Wird es beim ersten Angriff
    erklärt, oder ist der erste Angriff fest geskriptet ohne Akte?

### Stufe 5: Lieferanten

- App Lieferanten wird frei. Tour. Mission: drei verschiedene Produkte kaufen.
- Deutliche, leichte Hinweise: Mehr Produkte bringen mehr Kunden, es lohnt sich, Ware auf Lager zu haben.
- Kommt die Lieferung an, wird das Lieferungs-Menü einmal mit allem erklärt, was darin steht.
- Am Anfang nur zwei Lieferanten; der dritte und vierte kommen nach und nach. Wer neu dazukommt, meldet sich mit
  einem Pop-up, mit dem man kurz interagieren muss.
- Offen:
  - Welche zwei Lieferanten am Anfang (Vorschlag: Kalle und Toni wie heute), und woran hängen die nächsten (Stufe,
    Umsatz, Veedel)?
  - Kalle verkauft heute nur Gras. „Drei verschiedene Produkte“ heißt also: Toni muss von Anfang an dabei sein, oder
    Kalle bekommt mehr Sortiment. Was ist gewollt?
  - Einzeln oder Sammelbestellung (Auftrag 45): hier schon erklären oder erst, wenn die Beschlagnahme droht
    (Stufe 9)?

### Stufe 6: Geld verdienen

- Mission: 4.000 € Schwarzgeld, vier weitere Spots freischalten, drei Läufer einstellen.
- Ist das Lager zu niedrig, kommt in den ersten Tagen bis zu dreimal ein Pop-up („Dein Lager ist fast leer, bestell
  nach“), das man wegklicken kann.
- Beim ersten Mal 3.000 € Schwarzgeld kommt die erste Handy-Bestellung. Tour: So funktioniert das, du musst selbst
  hinfahren (Läufer gibt es noch nicht als Fahrer).
- Offen:
  - Läufer stellt man heute im Spot-Menü ein, die App Personal kommt erst in Stufe 7. Bleibt das so (Läufer über den
    Spot, Personal-App danach für alles andere)?
  - Welche vier Spots stehen jetzt zum Verkauf: alles im eigenen Veedel, oder die Karte gibt alles frei?
  - Welcher Lagerstand gilt als „zu niedrig“ (Vorschlag: unter Tagesverbrauch), und was heißt „in den ersten Tagen“?

### Stufe 7: Leute, erster Gang-Angriff, Sicherheit

- Ist Stufe 6 erfüllt, wird die App Personal erklärt (Leute und Läufer darin), und man soll direkt jemanden
  einsetzen.
- Mission: einmal 10.000 € Schwarzgeld auf dem Konto, ein Veedel übernehmen (das, in dem man steht), fünf weitere
  Spots freischalten.
- Auf dem Weg dahin findet der erste Gang-Angriff statt, auf dem Neumarkt. Er kostet fest 30 % der Ware und 40 % des
  Bargelds. Dann wird die Hotspot-Regel erklärt (an Hotspots passiert mehr, da lohnt Sicherheit), Sicherheit wird
  frei, und man muss mindestens eine Person einstellen und auf den Neumarkt setzen.
- Offen:
  - „Man soll direkt einen … einsetzen“: Wen genau, einen Läufer oder einen Fahrer?
  - Ist der erste Angriff nicht zu gewinnen (fester Verlust, auch mit Glück), und zu welchem Zeitpunkt kommt er
    (Vorschlag: sobald man zum ersten Mal 6.000 € hat, damit 40 % wehtun, aber die Mission bleibt erreichbar)?
  - Ware: 30 % vom Lager oder nur von dem, was am Neumarkt liegt?

### Stufe 8: Geldwäsche, Hafen, Fahrer

- Ist Stufe 7 erfüllt, wird die App Geldwäsche frei und erklärt. Sauberes Geld erscheint jetzt im HUD.
- Mission: den Niehler Hafen kaufen (Liegeplatz, 4.000 € sauber, also erst waschen), Rotterdam freischalten und dort
  mindestens einmal bestellen. Highlight: der Preis dort ist gut.
- Dann werden Fahrer frei: einen einstellen und direkt auf diese Route setzen.
- Offen:
  - Soll die Mission das Waschen ausdrücklich enthalten („Wasch 4.000 €“), weil der Liegeplatz sauberes Geld kostet?
  - Welcher der drei Wäsche-Wege ist am Anfang offen (Vorschlag: nur der Kiosk)?
  - Fahrer und Routen hängen an `logistics` (Fahrplan, Fahrzeug, Zoll). Reicht „Fahrer auf die Route Hafen → Lager
    setzen“, oder soll die Tour Fahrzeuge und Fahrplan auch zeigen?

### Stufe 9: Zwei weitere Veedel, Beschlagnahme, Spezialisten

- Mission: zwei weitere Veedel gewinnen und „mindestens vier … haben“.
- Die zweite Hafen-Bestellung wird von der Polizei beschlagnahmt, die ganze Ware ist weg. Intro der Polizei. Dann
  werden Spezialisten frei: Man lernt, dass man mit ihnen die Polizei umgeht, und stellt direkt einen ein.
- Offen:
  - „Mindestens vier Hand haben“ war nicht zu verstehen. Vier Fahrer, vier Lager, vier Läufer, 40.000 €?
  - Welcher Spezialist: Anwalt, Polizei-Kontakt oder beide? Und was tun sie konkret (heute nichts)? Vorschlag: der
    Polizei-Kontakt senkt die Beschlagnahme-Chance am Hafen, der Anwalt holt Ware und Leute schneller frei.
  - Soll bis hierher wirklich gar keine Polizei laufen: keine Heat, keine Zivis, keine Kontrollen, keine Razzien? Dann
    ist Heat in der Tour aus Stufe 0 nur Theorie. Alternative: Heat läuft ab Stufe 3, Konsequenzen erst ab hier.
  - Beschlagnahme als Minispiel (Papiere fälschen) oder fest geskriptet?

### Stufe 10: Buchhalter und Kasse

- Nach Stufe 9 wird der Buchhalter frei, man stellt einen ein, damit geht die App Kasse auf.
- Neues Konzept Buchhalter: senkt Kosten am Tag, bessere Geldwäsche, bessere Planung. In Zahlen: ein Buchhalter 3 %
  mehr Gewinn, ein guter 7 %, dazu alles etwas günstiger.
- Offen:
  - „Alles etwas günstiger“: Löhne, Einkauf, Wäsche-Gebühr, oder nur die Wäsche-Gebühr?
  - Mehrere Buchhalter: stapelt sich das oder zählt nur der beste?

### Stufe 11: Alle sieben Veedel, Rechte Hand

- Mission: sieben Veedel (Meilenstein „Boss von Köln“). Dann wird die Rechte Hand frei, man muss sie einstellen und
  bekommt erklärt, was sie tut (Aufträge ausfahren, Aufgaben, Vollmacht).
- Offen:
  - Die Rechte Hand braucht heute Level 4 und zwei Leutnants. Leutnants und Capos kommen im Flow gar nicht vor. Wann
    werden sie erklärt, und bleibt die Bedingung, oder reicht ab jetzt „einen aus dem Team ernennen“?

### Stufe 12: Köln fertig, Hamburg

- Letzte Mission in Köln: 50.000 € schwarz, 12.000 € sauber, alle Spots, alle zwölf Veedel, überall ein Läufer,
  alles automatisiert. Dann wird Hamburg frei.
- Offen: „Alles automatisiert“ heißt heute: Bestellregeln bei Lieferanten, Aufgaben der Rechten Hand, Fahrer auf
  Routen. Welche davon sind Pflicht für die Mission?

## Querschnitt

- **Belohnungen.** Für jede Mission ein Vorschlag, bevor wir bauen (Geld, Ware, Ruf, Heat runter, Titel). Heute sind
  es 250 bis 500 € oder 10 bis 40 g, das ist nicht „saftig“. Was ist die Größenordnung: ein Tagesgewinn, zwei?
- **Nachrichten.** Welche Chats bleiben in Köln? Vorschlag: Peter (Missionen), Lieferanten (nur bei Kennenlernen,
  Lieferung, Problem), Gangs (ab Stufe 4, Drohungen ab Stufe 7), Polizei (ab Stufe 9). Alles andere (Bewerber, Leute
  mit Geschichten, Stadt-Events, Marktbericht, Verträge, Kneipen, Klüngel) still oder erst nach Köln.
- **Banner und Dynamic Island.** Beide weg, oder Dynamic Island nur noch für laufende Fahrten?
- **Alte Spielstände und andere Städte.** Wer schon spielt oder in Hamburg ankommt, hat alles frei und keine Tour
  (wie heute bei den Handy-Schritten).

## Noch nicht einsortiert

Diese Systeme kommen im Flow nicht vor. Für jedes brauchen wir: wann (welche Stufe oder erst nach Köln) und ob es
erklärt wird oder still mitläuft.

| System | Heute | Vorschlag |
| --- | --- | --- |
| Leutnants und Capos (`hierarchy`) | Quest in Kapitel 2, Bedingung für die Rechte Hand | Stufe 11 vor der Rechten Hand, oder Bedingung streichen |
| Zweites Lager, Lager-App, Lager-Ausbau (`goods`) | Quest in Kapitel 3 | Stufe 8 mit dem Hafen |
| Ware strecken, Qualität | Quest in Kapitel 3 | still, erst nach Köln erklären |
| Stammkunden, Dealer (Stammabnehmer) | Quest in Kapitel 2 | still |
| Markt-Index, Marktbericht, Rabatt-Aktionen, Wochenverträge (`market`, `quests/contracts`) | laufen ab Tag 1 | erst nach Stufe 8 |
| Minispiele (Zivi, Kontrolle, Razzia, Gespräch, Papiere, Schlägerei) | ab Tag 1 bis 3 | Schlägerei beim ersten Angriff, Papiere bei der Beschlagnahme, Rest ab Stufe 9 |
| Konfrontationen (Akte) | ab dem ersten Kontakt | Stufe 7 |
| Heat unter 40 halten, Razzia | Quest in Kapitel 4 | Stufe 9 |
| Fahrzeuge (`fleet`), Routen mit Fahrplan | frei | Stufe 8 nur ein Fahrer auf eine Route |
| Kneipen, Klüngel, Stadt-Events, Wetter-Wirkung | laufen | still bis nach Köln |
| Bewerber, Rumfragen, Bewerbungsgespräch (`recruiting`) | Quest in Kapitel 2 | Stufe 7 mit der Personal-App |
| Spot-Arten, Spot-Ausbau, Spot gründen | frei | Ausbau ab Stufe 6, gründen nach Köln |
| Bestenliste | ab Start | unverändert |

## Technik (grob, noch ohne Auftrag)

- **Tour-Baukasten in `src/ui`:** Elemente tragen einen Anker (`data-tour="hud.dirty"`), eine Tour ist eine Liste
  von Schritten (Anker, ein, zwei Sätze, optional „muss man selbst tun“), ein Overlay graut alles aus und schneidet
  den Anker frei (umrandet, leicht eingefärbt), dazu die Box mit „Weiter“. Öffnet ein Schritt eine App oder ein
  Panel, tut die Tour das selbst.
- **Tutorial-Zustand im Spielstand:** Stufe 0 bis 12 als Zustand (eigenes Modul `tutorial` oder Kapitel in
  `quests`), deterministisch wie alles andere. Die Stufe steuert `hiddenWhen` von Apps, HUD-Teilen, Spot-Ausbau,
  welche Spots und Lieferanten es gibt, und ob Gangs und Polizei schon laufen.
- **Geskriptete Momente:** erster Gang-Angriff am Neumarkt, Beschlagnahme der zweiten Hafen-Bestellung,
  Handy-Bestellung bei 3.000 €, Lager-niedrig-Pop-up. Jedes hängt an einer Bedingung im Zustand, nicht an der Uhr.
- **Was weg kann:** Push-Banner außer in der Tour, Dynamic Island, die alten Kölner Quest-Kapitel (werden durch die
  Missionen ersetzt), große Teile der Chats am ersten Tag.
- Bot, Szenario-Tests und `npm run balance` laufen ohne Tutorial (Stufe „alles frei“), damit Würfelfolgen bleiben.
