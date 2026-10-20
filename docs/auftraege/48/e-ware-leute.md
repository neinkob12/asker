# Auftrag 48, Teil E: Container packen, Zivi oder Kunde, Bewerbungsgespräch

Branch `claude/auftrag-48-ware-leute`. Ordner: `minigames/ui/games/container/`, `games/undercover/`,
`games/interview/`, `minigames/kinds/container.ts`, `kinds/undercover.ts`, `kinds/interview.ts`. Grundlage ist der
Stand nach der ersten Runde von Auftrag 48 (`48-minispiele-schreibtisch.md`, `-kampf.md`, `-gespraeche.md`).

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
