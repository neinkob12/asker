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
| gut, nachher | 88 % · 31 s | 93 % · 32 s | 70 % · 38 s |
| schwach, vorher | 3 bis 20 % | 3 bis 30 % | 0 bis 20 % |
| schwach, nachher | 42 % · 40 s | 35 % · 35 s | 18 % · 34 s |
| keine Eingabe | 0 % | 0 % | 0 % |

(„schwach, vorher“ je nach Reaktionszeit 0,2 bis 0,3 s und Unruhe; nachher mit 0,2 s und kleiner Unruhe.)
