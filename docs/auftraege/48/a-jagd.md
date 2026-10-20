# Auftrag 48, Teil A: Verfolgungsjagd – zweite Runde

Branch `claude/auftrag-48-jagd`. Baut auf dem Stand aus PR #141 auf (Notizen: `../48-minispiele-jagd.md`); hier steht
nur, was diese Runde dazu kommt.

## Bestandsaufnahme (vorher, Stand main 227d2a5)

- **Schwierigkeit:** Ein guter Spieler (Fahr-Bot) entkam bei 0,9 nur in 45 % (Ziel 60 bis 80 %), ein schwacher
  Spieler (Reaktionszeit 0,2 s, unruhige Hand, kein Turbo, achtet nicht auf die Ramm-Warnung) bei 0,5 in 3 bis 30 %
  (Ziel 30 bis 60 %), auch bei 0,2 kaum besser. Schaden kam beim schwachen Spieler vor allem aus Unfällen (Wände,
  Verkehr, Sperren) und Rammstößen; die leichte Stufe verzieh Fahrfehler nicht. Der Bot fuhr in Sperren, die nach
  seiner Entscheidung an der nächsten Kreuzung auftauchten.
- **Bedrohung:** Nach 3 s ist keine Streife im Bild („Sichtkontakt verloren“), die Streifen sind fast immer hinter dir;
  nur ein Pfeil am unteren Rand zeigt sie.
- **Karre:** Lack 0x23272e liest sich in Dämmerung und Nacht als schwarzer Block, nur das Leuchtband hebt sich ab.
- **Treffer:** Wackeln und Funken, aber kein Hit-Stop.

## Schwierigkeit (Modell, `model.ts`, `bot.ts`, Test `model.balance.test.ts`)

- `CRASH_FACTOR` (leicht 0,45 bis schwer 0,8): Unfälle (Wände, Sperren, Verkehr) kosten je nach Stufe weniger Schaden.
- `RAM_DAMAGE` ist jetzt `{ easy: 0,045, hard: 0,07 }`.
- `COP_SPEED.hard` 0,95 statt 1,0: Auf der schwersten Stufe sind die Streifen nicht mehr ganz so schnell wie du.
- Fahr-Bot fährt durch die Lücke einer Sperre auf seiner Straße (`BLOCK_GAP_LANE`, `BLOCK_GAP_SPEED`), wie es ein
  guter Spieler tut. Neu: schwacher Spieler `createClumsyPilot`/`clumsyInput` für die Messung.

Messung (40 Seeds je Zelle im Test, hier 60 Seeds, Schritte zu 1/30 s):

| Spieler | 0,2 | 0,5 | 0,9 |
| --- | --- | --- | --- |
| gut, vorher | 85 % · 28 s | 93 % · 31 s | 45 % · 36 s |
| gut, nachher | 90 % · 31 s | 93 % · 32 s | 70 % · 38 s |
| schwach, vorher | 3 bis 20 % | 3 bis 30 % | 0 bis 20 % |
| schwach, nachher | 42 % · 40 s | 35 % · 35 s | 18 % · 34 s |
| keine Eingabe | 0 % | 0 % | 0 % |

(„schwach, vorher“ je nach Reaktionszeit 0,2 bis 0,3 s und Unruhe; nachher mit 0,2 s und kleiner Unruhe.)

## Bedrohung und Gefühl (`scene.ts`, `ChaseGame.tsx`, `chase.css`)

- **Rückspiegel**: Ist eine Streife hinter dir näher als `MIRROR_RANGE` (120 m), blendet oben in der Mitte ein
  Spiegel ein (`.chase-mirror`, am Handy unter dem Funk) und zeigt sie echt in 3D: zweite Kamera über dem Dach,
  Blickwinkel `MIRROR_FOV`, Sichtweite `MIRROR_FAR`, dahinter Nebelfarbe. Setzt sie zum Rammen an, glüht der Rahmen
  rot. Die Szene zeichnet in eine kleine Textur und kopiert sie ins Rechteck des Rahmens (`setMirror`, `mirrorOn`);
  am Handy in halber Auflösung und nur jedes dritte Bild neu, ohne Bloom und Linse. Liegt der Spiegel da, rückt die
  Ziel-Pille darunter.
- **Hit-Stop**: Harte Unfälle (ab Stärke 0,25) stehen 40 bis 90 ms, Sperre 90 ms, Rammstoß 70 ms, Streife zerlegt
  60 ms; Kamera und Wackeln laufen weiter. Bei `prefers-reduced-motion` die Hälfte.
- **Knapp vorbei lädt den Turbo** (`NEAR_MISS_TURBO` 0,2 der Ladung, nicht, solange er brennt); Einblendung
  „Knapp vorbei! Turbo +“. Riskant fahren zahlt sich doppelt aus.
- **Karre in Rot** (`PLAYER_COLOR` 0x7a1016, Metallic mit Klarlack): hebt sich in Dämmerung und Nacht ab; vorher ein
  schwarzer Block.

## Leistung

`npm run perf:browser -- --scenes=jagd --mobile --throttle=4` (SwiftShader, keine GPU: die Bilder pro Sekunde sagen
nichts, die Rechenzeit pro Bild schon):

| | Rechenzeit pro Bild (Mittel) | schlimmstes Bild |
| --- | --- | --- |
| vorher (15 s) | 22,3 ms | 69 ms |
| Spiegel direkt ins Canvas, jedes Bild (15 s) | 36,0 ms | 81 ms |
| nachher, Spiegel als Textur, Handy jedes dritte Bild (30 s) | 24,0 ms | 58 ms |

Offen bleibt die Messung auf einem echten Handy (30 fps ist das Ziel). Falls der Spiegel dort zu teuer ist:
`MIRROR_FAR` kleiner oder am Handy jedes vierte Bild.
