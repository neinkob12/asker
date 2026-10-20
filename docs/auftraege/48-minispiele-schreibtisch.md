# Auftrag 48: Container packen und Papiere fälschen („Schreibtisch“)

Teil der Runde „Minispiele sollen sich richtig gut anfühlen“ (20.10.2026, Lead-Session `claude/minigames-verbesserung-u7gczr`).
Branch `claude/minispiele-48-schreibtisch`. Geändert nur in `minigames/ui/games/container/` und `minigames/ui/games/papers/`;
Vertrag (`onFinish(score, picks)`, Bedeutung der picks, Folgen in `trade/packing.ts` und `encounters`) unverändert.

## Bestandsaufnahme (vorher)

- **Container:** Flache Kästchen auf dunklem Grund, Holz und Wellblech nur angedeutet. Ablegen ohne Gewicht (Teil ist
  einfach da). Test-Bot (gierig, ein Teil alle 2 bis 6 s) zeigt: Die Zeit drückt kaum (4 bis 8 s je Teil verfügbar), die
  Schwierigkeit ändert fast nichts (Score 0,99 leicht, 0,88 schwer), ohne Deckladung (Altkleider) war es sogar leichter
  als mit Fliesen.
- **Papiere:** Guter Grundaufbau (Holztisch, Zöllner, Finger). Papier glatt und gleichfarbig, Stempel ohne Wucht, am Handy
  muss man zum Vergleichen zwischen den Reitern hin und her (Gedächtnisspiel statt Hinsehen). Test-Bot zeigt eine harte
  Kante: Wer schneller als 1,6 s je Feld prüft, kommt immer durch, ab 2 s bei „schwer“ nie.

## Container packen

Optik (`draw.ts`, neu geschrieben):
- Kai aus Beton mit Fugen, Flecken, Ölflecken, Markierung, warmer Lichtkegel einer Hafenlampe, fester Kranschatten,
  Vignette. Schienen des Scanners mit Schwellen und Stahlglanz, Warnstreifen mit Abrieb.
- Container: weicher Schlagschatten, Wellblech als Muster mit Rippen (lange Seiten senkrecht, Stirnseite waagerecht),
  Wände nach Licht hell bzw. dunkel, Rost, Eckbeschläge, Türen mit Verschlussstangen und Plomben.
- Boden aus Dielen mit eigenem Ton, Maserung, versetzten Stößen und Nagelreihen; Schatten der Wände auf dem Boden;
  rote Zonen (Türspalte, Röntgen-Reihe) als Verlauf von der Wand mit gestrichelter Grenze; Raster aus Kreide.
- Teile als Bilder (`renderPiece`, einmal je Teil bzw. Form und Drehung, `warmSprites` zeichnet sie vorab, eins pro
  Takt schon während der Einleitung): Schatten vom Licht weg, Verlauf, Fase (Kanten hell/dunkel nach Licht), Körnung.
  Ware in dunkler Folie mit Glanz und Falten, Klebeband in der Farbe der Ware, Papier-Etikett mit Symbol; Bananenkisten
  mit Aufdruck und Grifflöchern, Fliesen auf Paletten mit Stretchfolie, Kartons Altkleider mit Klebeband und „XL“.
- Licht kommt auf dem Schirm immer von links oben (`PackLayout.light`, im gedrehten Handy-Modell links unten).
- Farben der Dinge als Inhalt in `PACK_MATERIALS` (wie `DESK_COLORS` bei den Papieren), Bedeutung aus den Tokens.

Gefühl:
- Ablegen: Teil fällt 0,13 s (größer, zum Licht versetzt, Schatten am Boden), setzt mit Staub (`spawnDust`), Ruck des
  Containers (schwerer = stärker), dumpfem Schlag und Vibration auf, federt kurz nach.
- Vorschau: Fußabdruck am Boden (grün/orange/rot) und das Teil schwebend darüber, leicht wippend.
- Ganz versteckte Ware rastet ein: grüner Haken mit Lichtring und Klang `seal` (`hiddenGoods` im Modell).
- Druck am Ende: In den letzten `SCANNER_APPROACH` (15) Sekunden rollt das Scanner-Portal auf der Schiene heran
  (`scannerNear`), Rundumleuchte blinkt schneller, Rumpeln `roll` und Hinweis „Der Scanner rollt an“, in den letzten 5 s
  piept die Leuchte jede Sekunde (`beacon`).
- Röntgen: dunkles Blau mit Zeilen, Ware hell, Deckladung als Umriss, Auffälliges rot mit Glühen.

Schwierigkeit (`model.ts`):
- Zeit nach Schwierigkeit: `TIME_FACTOR` 1,15 (leicht) bis 0,75 (schwer) mal Grundzeit (45/52/60 s).
- Altkleider füllen weniger (`fill` 0,45 → 0,25): ohne gekaufte Deckladung ist es jetzt messbar schwerer als mit Bananen.
- Test-Bot mit Tempo (`model.test.ts`, „machbar“), Mittel über Größen und Deckladung, Sekunden je Teil 2 / 3 / 4 / 5 / 6:
  leicht 0,99 0,99 0,99 0,98 0,97; mittel 0,93 0,93 0,93 0,90 0,87; schwer 0,88 0,88 0,86 0,82 0,73. Der Bot findet
  sofort den besten Platz; Menschen nicht, für sie drückt die Zeit bei „schwer“ deutlich früher.

## Papiere fälschen

Optik (`draw.ts`, `papers.css`):
- Papier mit Faser (Textur aus dem Code, `--pp-fiber`), Farbe je Formular (Frachtbrief creme, Lieferschein als rosa
  Durchschlag, Zollanmeldung als grünes Amtsformular), gedruckter Rahmen und Titel in Druckfarbe, Licht der Lampe von
  rechts oben, Ecke unten rechts hebt sich, weicher Schatten.
- Tisch: grüne Banker-Lampe mit Glühen, Stempelkissen mit Holzstempel, Kuli (am Handy nur der Kuli).
- Stempelfarbe abgenutzt (Maske `--pp-ink-wear`).

Gefühl:
- Stempel mit Wumms: Ein Holzstempel kommt herunter, staucht beim Aufschlag, hebt ab; Ton und Vibration beim Aufschlag
  (0,15 s verzögert), der Tisch ruckt (`is-thump-*`).
- Umschreiben: Tipp-Ex (unregelmäßig, leicht erhaben), Kuli schreibt den Wert von links (clip-path in Schritten).
- Schluss: großer Stempel „Abgefertigt“ schlägt ein (auch nach dem Schein), bei zwei Fehlern rot „Beanstandet“ auf dem
  Papier, das er liest; Klang `slam`.
- Zähler oben zeigt die **offenen** Widersprüche (`openCount`), was du richtig behebst, zählt herunter.

Fairness („finden, nicht raten“):
- Lupe: Maus über einer Zeile oder Auswahl per Tastatur markiert dasselbe Feld auf allen Papieren wie mit Textmarker,
  dazu die passende Vorlage (Waage, Kalender, Kamera). Stempel und Herkunft gehören zusammen.
- Der Wertewähler zeigt den Vergleich: dasselbe Feld auf den anderen Papieren (beim Stempel die Herkunft) und die
  Vorlage. Am Handy muss man so nicht mehr zwischen den Reitern hin und her.
- Schwierigkeit gemessen (Test „Schwierigkeit gemessen“), Fälscher prüft Feld für Feld, 0,8 / 1,2 / 1,6 / 2,0 / 2,6 s je
  Feld: leicht 100/100/100/100/6 %, mittel 100/100/100/75/0 %, schwer 100/100/100/1/0 %.

Dev-Haken: `window.koeln.dev.papers` (`setup`, `state`, `fix(n)` stellt n falsche Zeilen richtig).

## Messwerte (Leistung)

Playwright, Handy-Ansicht 390 × 844, CPU 4× gebremst, Software-Rendering (headless), Mittel / p95 / längstes Bild in ms:
- Container, Teil ablegen alle 300 ms: vorher 77 / 150 / 217, jetzt 74 / 117 / 150 (Teile vorab gezeichnet, Körnung
  als ein Pfad je Farbe, kein shadowBlur in den Teilen, Kranschatten und Vignette im Hintergrund statt pro Bild).
- Container, ruhig mit Vorschau: 78 ms im Mittel.
- Papiere: vorher etwa 46 bis 51, jetzt etwa 54 bis 65 (Faser und Schatten auf den Papieren kosten beim Malen; Finger
  und Lesebalken mit `will-change`). Am echten Handy unkritisch (DOM, kaum Arbeit pro Bild), beobachten.

## Offen

- Container: Kran, der das nächste Teil bringt, als echte Mechanik (Reihenfolge) statt freier Wahl; nur sinnvoll, wenn
  der Nutzer die freie Wahl nicht mehr will.
- Papiere: Zöllner mit mehr Leben (Blinzeln, Blick auf das Papier); braucht etwas im `Face` (gehört nicht zu diesem Teil).
- Papiere: Schwierigkeit an echten Spielern prüfen; der Bot kennt nur „prüfen in Lesereihenfolge“.
