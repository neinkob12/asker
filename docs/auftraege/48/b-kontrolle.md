# Auftrag 48, Teil B: Verkehrskontrolle und Papiere

Branch `claude/auftrag-48-kontrolle`. Geändert nur in `minigames/ui/games/traffic/`, `games/papers/`, dazu eine neue
Szene in `scripts/perf-browser.mjs` (nur angehängt). Vertrag bleibt: Score, `winAt`, die picks (`flee`, `bribe`,
`lies:<n>` bzw. `bribe`, `giveUp`, `fixed:<n>`, `hits:<n>`), `applyTraffic`/`applyPapers` unverändert.

## Bestandsaufnahme (vorher, 20.10.2026)

Angesehen mit `npm run screenshot:minigames -- --kind=traffic,papers --sizes=desktop,mobile` und der Vorschau.

**Verkehrskontrolle**
- Optik: Der Beamte ist ein flaches Comic-Porträt (HTML) auf einem Körper aus Kapseln: Rumpf wie eine Tonne, Arme als
  lange Röhren, kein Hals-Übergang. Das Gesicht bekommt kein Licht der Szene (Blaulicht nur als CSS-Schein darüber).
- Innenraum: Armaturenbrett, Tür, Säulen sind Kisten; im Bild sieht man davon fast nichts, man sitzt nicht „im Auto“.
- Regen: blaue Punkte über dem ganzen Bild, keine Tropfen auf der Scheibe, die das Blaulicht spiegeln.
- Hintergrund: Fassade mit riesigen Fensterkacheln füllt das halbe Bild, alles dunkelblau verwaschen, keine Tiefe.
- Zwei grelle weiße Balken unten im Bild (Bloom auf hellen Kanten).
- Lage: In der Vorschau steht „1 Uhr“ als Fakt (aus dem Seed), die Spieluhr zeigt 18:00.
- Gefühl: Ein Widerspruch ist ein roter Rand und ein Satz; kein Moment, der sitzt. Kein Puls, kein Ton für Spannung.
  Zeitdruck nur als dünner Balken.
- Schwierigkeit: Der gute Spieler gewinnt auch schwer fast immer (siehe unten); 0,9 fühlt sich wie 0,2 an.

**Papiere fälschen**
- Optik schon ordentlich (Holz, Papierfaser, Stempel), aber: Papiere klein in der oberen Hälfte, untere Hälfte leer;
  Lampe oben abgeschnitten; Stempelkissen und Kuli winzig; kein Licht auf den Papieren (alles gleich hell).
- Druck: Der Zöllner sitzt still im Kasten. Er liest stur von oben nach unten, wer schneller ist, gewinnt immer.
- Schwierigkeit: harte Kante (guter Fälscher immer durch, schwacher fast nie).

### Messwerte vorher

Schwierigkeit mit Test-Spielern (`traffic/model.balance.test.ts`, 120 Seeds; `papers/model.balance.test.ts`, 60 Seeds ×
Autobahn und Kai). Gewinnquote, in Klammern mittlere Dauer:

| Spiel | Spieler | 0,2 | 0,5 | 0,9 |
| --- | --- | --- | --- | --- |
| Kontrolle | gut | 100 % (43 s) | 98 % (50 s) | 99 % (57 s) |
| Kontrolle | schwach | 69 % | 57 % | 49 % |
| Kontrolle | keine Eingabe | 0 % | 0 % | 0 % |
| Papiere | gut | 100 % (44 s) | 99 % (40 s) | 98 % (34 s) |
| Papiere | schwach | 18 % | 0 % | 0 % |
| Papiere | keine Eingabe | 0 % | 0 % | 0 % |

Test-Spieler Kontrolle: liest Frage und Antworten (gut 24, schwach 14 Zeichen/s), überlegt (gut 1,2 s + bis 1,6 s,
schwach 2,2 s + bis 3 s), greift daneben (gut 4 %, schwach 14 %; unter Zeitdruck, wenn die Geduld unter der Hälfte ist,
gut ×4, schwach ×2). Papiere: prüft Feld für Feld vor dem Finger her (gut 0,8 s + bis 0,9 s, schwach 1,4 s + bis
1,4 s), Umschreiben 1,1 bzw. 1,8 s, übersieht 4 bzw. 15 % der Fehler; der gute merkt eine Stichprobe nach 0,5 s.

Leistung (`node scripts/perf-browser.mjs --scenes=kontrolle,papiere`, headless mit SwiftShader, daher nur zum
Vergleich): Kontrolle 1,1 fps am Handy (CPU 4× gedrosselt) bei 14,8 ms Rechenzeit pro Bild, 2,4 fps bei 1280 × 800 mit
30,6 ms; Papiere 38 fps am Handy (0,13 ms pro Bild).

## Was neu ist

**Verkehrskontrolle (3D neu)**
- Du sitzt im Auto: Fensterrahmen mit A- und B-Säule (abgerundete Form, `frameShape`), Dachhimmel mit Haltegriff,
  Türverkleidung mit Armlehne, Griff und Fensterheber-Lämpchen, Außenspiegel. Die vordere Scheibe ist ein Stück
  heruntergelassen (er spricht durch den Spalt), die hintere ist zu.
- Regen auf der Scheibe: Tropfen und laufende Rinnsale als Textur, Glanzlichter getrennt (`dropTextures`); sie färben
  sich pro Bild in der Farbe des Blaulichts (Doppelblitz blau, blau, rot, rot). Draußen feine Regenstriche.
- Der Beamte (`officer.ts`): Rumpf als gedrehtes Profil mit Taille und Brust, Jacke mit Reflexstreifen und Schriftzug
  „POLIZEI“ (leuchten im Blaulicht), Schulterklappen, Funkgerät, Gürtel mit Holster, Arme mit Schulter, Ellbogen und
  Hand, Schirmmütze. Haltungen als Daten (`POSES`: Fenster, Nachfragen, Blenden, hinten, Funk, Gute Fahrt, Aussteigen,
  Schein), weich überblendet; er atmet (schneller bei Misstrauen), verlagert das Gewicht, wippt beim Gehen. Die
  Taschenlampe zielt wirklich: Beim Blenden zeigt der Unterarm auf deine Augen, hinten in den Laderaum
  (Blendung = wie genau die Linse auf die Kamera zeigt).
- Gesicht aus dem Look-System als Textur in der Szene (`faceTexture.ts`, ohne Mütze, die ist 3D): bekommt Licht,
  Nebel und Tiefe, sitzt auf dem Hals. Ausdrücke ruhig, zweifelnd, hart, grinsend, zufrieden, dazu Blinzeln
  (`expressionOf` in `TrafficGame.tsx`: Misstrauen, Widerspruch, Ausgang).
- Licht: Laterne hinter ihm mit Kegel und Schein, Blaulicht vom Streifenwagen, Licht aus dem Wagen aufs Gesicht,
  Altbau-Fassaden mit Gesims, Fensterbank und Schaufenster (nachts Licht hinter Gardinen). Nachbearbeitung: Bloom in
  halber Auflösung, Vignette und Körnung (`GRADE_SHADER`).
- Ein Widerspruch sitzt: Hit-Stop (`HIT_STOP` 90 ms), Ruck und Heranzoomen der Kamera, roter Rand, tiefer Schlag
  (`caught`), deine Antwort steht durchgestrichen unter „Du“, „+N“ ploppt am Misstrauen auf, woran es hing, leuchtet
  links, er rückt mit der Lampe heran und schaut hart.
- Spannung: Puls im Takt des Misstrauens (`PULSE` 68 bis 150 Schläge), Ticken, wenn die Geduld unter ein Drittel fällt,
  Geduldsbalken blinkt, Regen als Tonschleife (`rain`), Antworten kommen nacheinander herein.
- Schluss: Gute Fahrt, er tippt zweimal aufs Dach, tritt zurück und grüßt, du rollst an; Gas reißt los (Sichtfeld
  weitet sich); Aussteigen, er tritt zurück, Lampe auf dich.
- Lage: Ohne Stunde in den params nimmt das Spiel die Spieluhr (die Vorschau zeigte „1 Uhr“ bei 18:00).

**Verkehrskontrolle (Modell)**
- Bedenkzeit je Frage = Grundzeit nach Schwierigkeit (`SLOW_AFTER` 4 bis 0,5 s) plus Lesezeit der Frage und Antworten
  (`READ_CPS` 20 Zeichen/s, `readSeconds`, `state.slowAt`). Zögern kostet erst nach dem Lesen und `GRACE` (2,5 s)
  Misstrauen (`WAIT_SUS` 0,006 bis 0,03 je s). Volles Misstrauen (`SUS_FAIL`) heißt Aussteigen.
- Widerspruch wiegt schwerer mit der Schwierigkeit (`HIT_SUS` 0,3 bis 0,5).
- Neue Fragen als Daten: Nachfrage zum Wagen (`owner2`), Fangfragen (`fromTrap`, `purposeTrap`: Er unterstellt etwas
  anderes, als du gesagt hast; „Ja, genau.“ fliegt immer auf).

**Papiere**
- Stichproben (`setup.peeks`, `PEEK_FROM` 0,35, `PEEK_STEP` 0,35, `PEEK_TURN` 2,2 s): Ab mittlerer Schwierigkeit springt
  der Zöllner nach einer Zeile zu einer späteren auf einem anderen Papier (meist einer falschen), prüft sie und liest
  weiter, wo er war. Sichtbar: Das Papier hebt sich zum Schalter, orange Leiste „Stichprobe: <Feld>“ mit Restbalken,
  die Zeile blinkt, der Zöllner beugt sich vor, am Handy springt der Reiter um. Signal `peek`, Zustand `resume`.
- Lesetempo und Vorlauf neu (`lineTime` 2,5 bis 1,45 s, `startDelay` 8 bis 5 s).
- Licht der Schreibtischlampe als Fläche über Tisch und Papieren (`papers__light`, nachts enger), Lampe ganz im Bild,
  Zeilen wachsen mit der Bühne (`--pp-row` aus der Containerhöhe), Stempelkissen und Kuli größer, beanstandete Felder
  kringelt er mit Rotstift ein.
- Sätze ohne falschen Artikel vor den Papiertiteln („Jetzt: Zollanmeldung.“).

## Messwerte nachher

| Spiel | Spieler | 0,2 | 0,5 | 0,9 |
| --- | --- | --- | --- | --- |
| Kontrolle | gut | 100 % (43 s) | 93 % (50 s) | 76 % (54 s) |
| Kontrolle | schwach | 60 % | 33 % | 0 % |
| Kontrolle | keine Eingabe | 0 % | 0 % | 0 % |
| Papiere | gut | 100 % (56 s) | 90 % (51 s) | 70 % (42 s) |
| Papiere | schwach | 98 % | 36 % | 4 % |
| Papiere | keine Eingabe | 0 % | 0 % | 0 % |

Leistung (gleiche Messung wie vorher, headless mit SwiftShader): Kontrolle am Handy (CPU 4× gedrosselt) 13,5 bis
14,4 ms Rechenzeit pro Bild (vorher 14,8), 76 bis 78 Draw-Calls über alle Durchgänge, Bildrate durch die Software-Grafik
begrenzt (1,5 statt 1,1 fps); bei 1280 × 800 4,1 ms pro Bild (vorher 30,6 ms mit einem Long Task von 1 s), 93
Draw-Calls. Pixelverhältnis höchstens 1,5, Bloom in halber Auflösung, keine Schatten, Mittelstriche und Gesimse je ein
Mesh. Papiere unverändert (32 fps headless, unter 0,2 ms pro Bild).

## Für die Integration

- `TrafficScene.update(state, dt, cue)` bekommt jetzt Ausdruck, Alarm und Anspannung aus der Oberfläche; das
  HTML-Gesicht und `Officer.tsx` sind weg (`officerLook` liegt in `look.ts`).
- Dev-Haken: `window.koeln.dev.traffic` (`setup`, `state`, `time()`, `say(gut)`, `scene()`), Messung
  `node scripts/perf-browser.mjs --scenes=kontrolle,papiere` (zeigt auch Draw-Calls).
- Kandidaten für den Baukasten: `GRADE_SHADER` (Vignette und Körnung), `dropTextures` (Regen auf Glas), `faceTexture`
  (Porträt als Textur für andere 3D-Spiele).
