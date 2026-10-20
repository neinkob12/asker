# Auftrag 49 (Minispiele, zweite Runde), Teil D: Razzia (`stash`) und Bude (`search`)

Branch `claude/auftrag-48-razzia-bude` (Name aus dem Start, gemeint ist Auftrag 49), Plan in
`docs/auftraege/49-minispiele-runde-2.md`. Ausgangslage: Beide Spiele sind seit Auftrag 48
(`docs/auftraege/48-minispiele-einbruch.md`) schon 3D (Razzia seitlich, Bude im Ego-Blick). Diese Runde baut nichts
neu, sondern arbeitet die Prüfliste „fühlt sich gut an“ aus `48-minispiele-gefuehl.md` und „Offen“ aus Auftrag 48 ab.

## Bestandsaufnahme (selbst gespielt, Playwright mit echten Eingaben, Desktop und Handy)

Vorschau startet sauber (`?minispiel=stash`, `npm run screenshot:minigames -- --kind=stash,search` ohne Hänger).

**Bude**
- **Fehler:** Ein Mausklick sucht oft nichts. Die Kamera dreht mit dem Zeiger mit, das Ding wandert unter dem
  Mauszeiger weg; der Name bleibt aber stehen (Hover wird nur bei Mausbewegung neu bestimmt). Klick ins Leere, keine
  Rückmeldung.
- Außerhalb des Lichtkegels ist alles schwarz, der Kegel hat einen harten Rand: Man sieht nicht, wo Möbel stehen,
  sucht blind. Wohnzimmer und Küche sind auch im Licht dunkel und schwer zu lesen.
- Kein Hinweis, was durchsuchbar ist, bis man genau draufzeigt.
- Druck: Schritte im Treppenhaus einmal, danach Ruhe; Lärm sieht man nur im Balken.
- Fund ohne Gewicht (kein Hit-Stop), leer ohne Ton-Unterschied außer dem Klang.

**Razzia**
- Meldungen bleiben stehen, bis die nächste kommt („Hier liegt nichts …“ stand 20 s da).
- Nachts ist die Straße fast schwarz: Kofferraum und Wagen kaum zu sehen.
- Handy hochkant: oberes Drittel nur Dach und Himmel, die Figur ist klein.
- Verstauen, Tor runter und Reinstürmen ohne Hit-Stop; die Haptik ist da.
- Schwierigkeit gemessen nur als mittlerer Score eines perfekten Bots, nicht als Gewinnrate (Score ≥ 0,5) für guten,
  schwachen und keinen Spieler.

## Was neu ist

- **Bude als Gang durch die Wohnung** (aus „Offen“ in Auftrag 48): Statt der Raumleiste hat der Flur vier Zimmertüren
  (halb offen, `innerDoor` in `room3d.ts`, `RoomView.exits`): geradeaus Schlafzimmer, links Wohnzimmer, rechts Küche und
  Bad. Tippen auf die Tür oder ihre Beschriftung (Name und Zahl der offenen Dinge) geht ein paar Schritte hin
  (`scene.walk`, `WALK_MS` 380 ms, Kamera wippt und dreht zur Tür), im Dunkeln des Überblendens kommt der Raum. Türen
  außerhalb des Bilds stehen am Rand mit Pfeil und weichen den anderen aus. Aus einem Zimmer geht es mit „Flur“ unten
  links zurück (du schaust erst zur Tür, aus der du kommst); von Zimmer zu Zimmer also durch den Flur (zwei Türen).
  Tasten 1–5 und Q/E laufen den Weg selbst, Rücktaste = Flur. Der Schirmständer steht jetzt unter dem Spiegel.

- **`kit/indoor3d.ts`** (Baukasten für Innenräume, beide Spiele nutzen ihn): `ParticlePool` (ein Punkt-System für
  Funken, Staub, Spritzer; nichts wird pro Bild angelegt, ohne lebende Teilchen kein Hochladen), `softDotTexture`,
  `createFlashlight` (SpotLight mit Schatten, sichtbarer Kegel, Staub im Strahl; `aim`, `setPower`, `update`),
  `createCrackLight` (Licht unter Tür oder Tor), `policeBlink`/`policeColor` (Takt wie `setBlueLight`), `HitStop`
  (40–90 ms Stillstand, bei reduzierter Bewegung halb so lang; kann nach `kit/juice.ts`, sobald es den gibt).
- **Bude:** Die Kamera dreht erst außerhalb der Bildmitte mit (`DEAD_ZONE` 0,4); was unter dem Zeiger liegt, wird
  jedes Bild neu bestimmt; ein Klick daneben nimmt das Ding im Licht, sonst kurzer Klick-Ton und einmal ein Satz.
  Kegel breiter und weicher (`BEAM_ANGLE` 0,5, Halbschatten 0,85, `BEAM_POWER` 12), mehr Restlicht (`AMBIENT`),
  Streulicht um dich (`SPILL`). Hit-Stop bei Fund (85 ms) und Lärm (50 ms), Schritte im Treppenhaus wiederholen sich
  und werden lauter und schneller, Herzschlag in den letzten 5 s, ein Satz zum Einstieg.
- **Razzia:** Meldungen stehen 2,6 s (`MESSAGE_MS`, auch in der Bude). Hinweis am Ort: Mit leeren Händen leuchtet das
  nächste Paket, mit Paket das nächste passende Versteck (trockene zuerst). Aufhelllicht von vorn (`FILL`), nachts
  sind Wagen und Figur lesbar. Hochkant näher und tiefer (`viewW` 5,4 m). Hit-Stop beim Verstauen, Tor runter und
  Reinstürmen. Die Figur atmet im Stand (schneller, je näher die Streife) und schaut beim Klopfen über die Schulter.
  Licht unter dem Tor als `createCrackLight`.
- **Ruckler weg:** `scene.warm` zeichnet beim Aufbau (unter der Einleitung) einmal die ganze Strecke mit den Beamten:
  Geometrie, Texturen und Shader sind fertig. Vorher stand das Bild bis zu 1 s, wenn die Kamera zum ersten Mal Richtung
  Tor schwenkte, und beim Reinstürmen (die Lampen der Beamten ändern die Zahl der Lichter, three.js baut dann alle
  Shader neu).

## Schwierigkeit (Simulation, 40 Seeds, Gewinn = Score ≥ 0,5)

Tests: `stash/model.balance.test.ts`, `search/model.balance.test.ts` (`BALANCE_PRINT=1 npx vitest run … --silent=false`
druckt die Tabelle). Guter Spieler: bester Zug nach 0,5 s (Razzia) bzw. Spuren zuerst, 0,35 s pro Ding und 0,6 s pro Tür (Bude).
Schwacher: 1 s bzw. 0,9 s, zufällige Wahl, jedes vierte Mal daneben (Razzia) bzw. übersieht Spuren (Bude).

| Lage | Spieler | leicht 0,2 | mittel 0,5 | schwer 0,9 |
| --- | --- | --- | --- | --- |
| Razzia, Lager ohne Ausbau, vorher | gut / schwach | 85 / 65 % | 95 / 40 % | 38 / 8 % |
| Razzia, Lager ohne Ausbau, nachher | gut / schwach | 100 / 80 % | 100 / 30 % | 73 / 3 % |
| Razzia, Lager mit Tresor, vorher | gut / schwach | 100 / 95 % | 100 / 73 % | 100 / 20 % |
| Razzia, Lager mit Tresor, nachher | gut / schwach | 100 / 95 % | 100 / 55 % | 100 / 3 % |
| Razzia am Spot, vorher | gut / schwach | 100 / 100 % | 100 / 95 % | 100 / 68 % |
| Razzia am Spot, nachher | gut / schwach | 100 / 93 % | 100 / 53 % | 100 / 10 % |
| Bude, vorher (Raumleiste) | gut / schwach | 100 / 57 % | 95 / 48 % | 75 / 30 % |
| Bude, nachher (Gang durch den Flur) | gut / schwach | 100 / 55 % | 95 / 43 % | 73 / 28 % |

Keine Eingabe gewinnt nie. Stellschrauben der Razzia: im Lager 4 bis 9 Pakete (vorher 8), am Spot 3 bis 6 (vorher 5),
`DURATION_HARD` 23 s (vorher 25), `STREET_TIME` 0,56 (vorher 0,7), doppelter Boden ohne Ausbau 4 Plätze (vorher 3).
Der Tresor-Ausbau macht es bewusst leichter. Dauer: Lager 24 bis 32 s, am Spot 13 bis 18 s (kurz, kleine Mengen),
Bude 30 s.

## Leistung

`node scripts/perf-browser.mjs --scenes=razzia,bude [--mobile --throttle=4]` (neue Szenen; headless mit SwiftShader,
Bilder pro Sekunde sind deshalb nicht aussagekräftig, die Rechenzeit pro Bild schon):

| Szene | Zeichnen pro Bild (Mittel / schlimmstes) | Long Tasks |
| --- | --- | --- |
| Razzia, Desktop, vorher | 19,1 / 650 ms | 2 (bis 653 ms) |
| Razzia, Desktop, nachher | 4,4 / 12 ms | 0 |
| Razzia, Handy 4× gedrosselt, vorher | 26,9 / 605 ms | 9 (bis 625 ms) |
| Razzia, Handy 4× gedrosselt, nachher | 12,7 / 32 ms | 6 (bis 75 ms) |
| Bude, Desktop | 2,2 / 14 ms | 0 |
| Bude, Handy 4× gedrosselt | 6,4 / 29 ms | 2 (bis 73 ms) |

## Für die Integration

- `kit/indoor3d.ts` ist neu; `HitStop` kann in einen gemeinsamen `kit/juice.ts` wandern.
- Messhilfe: Beide Spiele schreiben in `window.__mgPerf` (nur, wenn das Skript es anlegt).
- Doku für `CLAUDE.md`/`architektur.md`: Abschnitt „Was neu ist“ und die Stellschrauben oben.

## Offen

- Echtes Handy messen (Ziel 30 Bilder/s); headless gibt es nur Software-Grafik.
- Razzia: unter dem Boden bleibt am Handy ein dunkler Streifen (dort liegt das Versteckte im Hohlraum).
- Pause-Knopf `<PauseButton />` in die HUD-Leisten, sobald PR #142 in `main` ist.
