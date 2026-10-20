# Auftrag 49, Teil E: Container packen, Zivi oder Kunde, Bewerbungsgespräch

Branch `claude/auftrag-48-ware-leute`. Ordner: `minigames/ui/games/container/`, `games/undercover/`,
`games/interview/`, `minigames/kinds/container.ts`, `kinds/undercover.ts`, `kinds/interview.ts`. Grundlage ist der
Stand nach Auftrag 48 in `main` (`48-minispiele-schreibtisch.md`, `-kampf.md`, `-gespraeche.md`); Plan der zweiten
Runde in `49-minispiele-runde-2.md`.

## Bestandsaufnahme (vorher)

Gemessen mit neuen Simulationen (`model.balance.test.ts` je Spiel; guter, schwacher und kein Spieler, je 60 bis 216
Läufe, geschafft ab Score 0,5) und der Bildrate am Handy (390 × 844, Pixelverhältnis 2, CPU 4× gedrosselt,
Software-Rendering, ganze Seite mit Karte; Abstand zweier Bilder in ms, Mittel / p95 / längstes).

### Container packen

- Optik gut (Kai, Wellblech, Dielen), aber die Ablage zeigt die Teile als flache beige Kästchen statt als Ware in Folie
  und Kisten; der Container sitzt am Desktop klein im oberen Drittel, darunter leerer Beton.
- Gefühl: Ablegen hat Gewicht, aber gutes Packen wird kaum belohnt: Nur „ganz versteckt“ hakt ab. Kein Lob für
  passgenaues Anlegen, keine Serie, keine aufploppenden Punkte, keine Reihe, die sich „schließt“.
- Schwierigkeit: viel zu leicht. Schwacher Spieler (5 s je Teil, nimmt oft irgendeinen von den besseren 40 % der
  Plätze) gewinnt auf schwer noch 92 %.

  | Schwierigkeit | gut | schwach | keine Eingabe |
  | --- | --- | --- | --- |
  | 0,2 | 100 % (Score 0,97) | 100 % (0,87) | 0 % |
  | 0,5 | 100 % (0,92) | 100 % (0,81) | 0 % |
  | 0,9 | 100 % (0,87) | 92 % (0,66) | 0 % |

- Leistung: 90 / 150 / 183 ms.

### Zivi oder Kunde

- Optik: Die Figur zerfällt in ein rundes Porträt und darunter, durch einen Streifen getrennt, Beine. Zehn Merkmale
  (Bierdose, Handy, Kleingeld, Hund, Sporttasche, E-Roller, zittrige Hände …) stehen nur als Text da. Am Handy deckt
  die Karte die ganze Straße zu. Häuser flache Rechtecke, Fenster grell orange Quadrate, Auto ein Scherenschnitt.
- Leben: Das Porträt atmet und pendelt; Hände gibt es nicht.
- Schwierigkeit: wirkt kaum, und die Schicht ist mit 18 s zu kurz. Tempo und Druck steigen nicht.

  | Schwierigkeit | gut | schwach | keine Eingabe | Dauer |
  | --- | --- | --- | --- | --- |
  | 0,2 | 94 % | 28 % | 0 % | 17 s |
  | 0,5 | 98 % | 34 % | 0 % | 18 s |
  | 0,9 | 95 % | 39 % | 0 % | 18 s |

  (Mensch-Modell: neue Merkmale erst nach 0,5 s bzw. 0,9 s bemerkt, Fehler steigen mit der Hast, der schwache Spieler
  wartet höchstens 2,2 s.)
- Leistung: 69 / 133 / 567 ms.

### Bewerbungsgespräch

- Konzept „eigene Fragen, Druck steuern“ steht (drei Fragekarten, Blick halten, Zone). Aber: **keine Eingabe gewinnt
  47 %**, weil eine unauffällige Antwort auch ohne jeden Druck als „richtig gelesen“ zählt.
- Die Person ist eine Büste ohne Hände über einem leeren Tisch; Gesten wie Schluck, Zappeln, Kratzen am Hals haben
  keine Hände. Schweiß und Röte nur angedeutet. Am Handy ein großes leeres Feld zwischen Akte und Fragen.
- Schwierigkeit: gut 100 / 100 / 98 %, schwach 98 / 98 / 47 % (Reaktion 0,7 s, schaut alle 0,6 s auf den Ring,
  hält jede vierte Geste für ein Zeichen). Mittel zu leicht.
- Leistung: 106 / 267 / 667 ms (die schlechteste der drei).

## Was neu ist

### Bewerbungsgespräch

- **Zu wenig Druck verrät nichts:** Eine unauffällige Antwort zählt nur als gelesen, wenn die Person mindestens
  `TENSE_NEEDED` (35 %) der Antwort angespannt war (`InterviewState.tense`, `RoundResult.soft`, `ruledOutBy` schließt
  dann nichts aus). Urteil: „Zu locker gefragt: … war kaum angespannt.“
- **Hände auf dem Tisch** (`Hands.tsx`): Unterarme, Hände und Becher. Haltung nach Druck (locker auseinander,
  angespannt beisammen, macht zu: verschränkt), Gesten mit Händen (Finger trommeln beim Zappeln, Schulterzucken,
  Vorbeugen; beim Kratzen und Schluck fehlt die Hand, die oben am Porträt ist). Die Person sitzt hinter dem Tisch
  (Porträt unter der Tischkante abgeschnitten, `--iv-under`). Handy: Akte und Gespräch unter den Händen, keine Lücke.
- **Schweigen aushalten** (zweite Stufe des Drucks, „Offen“ aus Auftrag 48): Ist eine Antwort, die etwas verrät, zu
  Ende und die Person noch angespannt, kommt eine Pause (`SILENCE.window` 2,4 s, Hinweis „Schweigen … Blick halten“).
  Hält man den Blick darin `SILENCE.hold` (1,1 s) in der Zone, rutscht ein Nachsatz heraus (`AFTERWORDS`, gesprochen,
  kursiv in der Blase) mit einem Zeichen mehr (`Cue.bonus`: zählt als Treffer, nicht zu den nötigen). Eigener
  Zufallsstrom je Frage, Antworten und Zeichen bleiben gleich.
- **Schwierigkeit:** Zeichenfenster schrumpft schon zur Mitte (`TELL_CURVE` 0,45, `TELL_WINDOW.hard` 0,5), auf schwer
  bis zu vier Gesten (`DECOYS.hard`).
- **Leistung:** kein Filter mehr auf dem atmenden Porträt (Schatten als eigene Fläche), Rauch ohne `blur`, Lampe ohne
  `brightness`-Filter, `--iv-p` nur in 2-%-Stufen.

### Zivi oder Kunde

- **Ganze Figur** (`Body` in `figure.tsx`): Rumpf, Arme mit Händen, Beine, Schuhe unter dem Porträt, im Licht der
  Laterne. Leben: Gewicht verlagern (`uc-sway`), Atmen, Arme pendeln, Kopf wie bisher (Blick zum Auto, Ohr …).
- **Mehr im Bild:** Bierdose, Handy (Arm angewinkelt, Bildschirm leuchtet), Kleingeld in der offenen Hand,
  Sporttasche mit Gurt, Hund an der Leine (wedelt), E-Roller, zittrige Hände, Treten von einem Fuß auf den anderen
  (`TellShow` um `beer`, `phone`, `coins`, `bag`, `dog`, `scooter`, `feet`, `shaky`; die Würfe bleiben gleich).
- **Tempo steigt:** Jede Person hat `seconds`; die letzte Karte hat nur noch `TEMPO_END` (85 % leicht bis 62 % schwer)
  der ersten (`cardSecondsAt`, `currentSeconds`). Luft nach dem letzten Merkmal nach Schwierigkeit (`revealMargin`,
  1,8 bis 1,1 s), schwer zeigt sich das meiste später (`REVEAL_LATE`). Die erste Karte (immer ein echter Kunde) hat
  `FIRST_CARD` (1,5-mal) so viel Zeit, damit „Zu lange gezögert“ nicht gleich am Anfang kommt (Befund der steuernden
  Session). Der Nächste braucht `NEXT_GAP` (0,8 s) zum
  Herankommen. HUD zeigt „Voller“, sobald es schneller wird.
- **Straße gemalt:** Häuser aus Backstein und Putz mit Gesims, Band und Sockel, Fenster mit Rahmen, Sprossen, Bank und
  Vorhang (hell warm, dunkel mit Spiegelung), Kiosk mit Markise, Fugen im Gehweg, Körnung. Was sich bewegt (Passanten,
  Auto), liegt in einer eigenen Ebene; Karten hinten im Stapel stehen still und werden ohne Filter abgedunkelt.

### Container packen

- **Lob:** „Passt!“ mit Serie (×2, ×3 …) und Ton, der je Stufe steigt, wenn ein Teil dicht sitzt (`snugness` ab
  `SNUG_AT` 0,75 der Außenkanten an Wand oder Teil); „Reihe dicht!“ mit Lichtstreifen und Akkord, wenn eine Reihe von
  Wand zu Wand voll ist (`fullColumns`). Nur Anzeige, der Score bleibt.
- **Ablage mit Material:** Folie mit Klebeband in der Farbe der Ware, Bananenkiste mit Griffloch, Fliesen auf Palette
  unter Stretchfolie, Altkleider-Karton.
- **Schwierigkeit:** Der Scanner sieht Lücken und Blöcke nach Schwierigkeit schärfer (`PackSetup.scanner`,
  `SCANNER_STRENGTH` 0,8 bis 2,4), weniger Zeit (`TIME_FACTOR.hard` 0,55), beides zieht schon zur Mitte an
  (`DIFFICULTY_CURVE` 0,5).
- **Leistung:** ruhig (nur Wippen der Vorschau) höchstens 30 Bilder pro Sekunde.

## Messwerte nachher

| Spiel | gut 0,2 / 0,5 / 0,9 | schwach 0,2 / 0,5 / 0,9 | keine Eingabe | Dauer |
| --- | --- | --- | --- | --- |
| Container | 100 / 94 / 78 % (vorher 100 / 100 / 100) | 100 / 50 / 7 % (vorher 100 / 100 / 92) | 0 % | Zeit des Containers |
| Zivi oder Kunde | 94 / 98 / 86 % (vorher 94 / 98 / 95) | 63 / 33 / 7 % (vorher 28 / 34 / 39) | 0 % | 20 bis 22 s |
| Bewerbungsgespräch | 100 / 100 / 73 % (vorher 100 / 100 / 98) | 98 / 57 / 27 % (vorher 98 / 98 / 47) | 0 % (vorher 47) | 41 bis 47 s |

Zivi oder Kunde bleibt kurz: police schickt 6 bis 10 Leute; länger machen hieße mehr Leute, das gehört police.

Bildrate (Handy, CPU 4×, Software-Rendering, Mittel / p95 / längstes in ms):

| Spiel | vorher | nachher |
| --- | --- | --- |
| Container | 90 / 150 / 183 | 86 / 150 / 200 (Streuung 86 bis 97) |
| Zivi oder Kunde | 69 / 133 / 567 | 60 / 100 / 367 |
| Bewerbungsgespräch | 106 / 267 / 667 | 78 / 150 / 283 |

## Für die Integration

- picks, Score und `winAt` unverändert (`trade/packing.ts`, `police/undercover.ts`, `recruiting` lesen wie bisher).
- Container: Bei gleicher Packweise ist der Score jetzt auf mittel und schwer niedriger (schärferer Scanner); das
  Zollrisiko in `trade/packing.ts` steigt dadurch für mittelmäßiges Packen.
- Bewerbungsgespräch: Wer gar nicht drückt, deckt nichts mehr auf (vorher galten ruhige Antworten als richtig).
- Pause-Knopf (`<PauseButton />` aus `kit/pause.tsx`, PR #142) setze ich in die HUD-Leisten, sobald #142 in `main` ist.
- `npm run e2e` läuft (mit Minispielen aus prüft er nur, dass kein Gespräch startet).
- CLAUDE.md / Architektur: Stellschrauben oben (`TENSE_NEEDED`, `TELL_CURVE`, `TEMPO_END`, `revealMargin`,
  `REVEAL_LATE`, `NEXT_GAP`, `FIRST_CARD`, `SILENCE`, `SNUG_AT`, `SCANNER_STRENGTH`, `DIFFICULTY_CURVE`), Simulationen in
  `model.balance.test.ts` je Spiel (`BALANCE_REPORT=1` druckt die Tabelle).

## Offen

- Zivi oder Kunde: Figur verlässt die Karte nach dem Wischen zu Fuß (geht zum Auto bzw. mit der Ware weg).
- Container: Bildrate am echten Handy messen; headless ist sie von der Seite dahinter bestimmt.
