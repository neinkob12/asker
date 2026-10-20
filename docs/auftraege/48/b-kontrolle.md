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
