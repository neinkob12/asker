# Auftrag 48: Straßenkampf und Zivi oder Kunde

Teil der Runde „Minispiele sollen sich richtig gut anfühlen“ (20.10.2026). Ordner: `minigames/ui/games/brawl/` und
`minigames/ui/games/undercover/`. Vertrag (`onFinish(score, picks)`, `applyBrawl`, `undercoverOutcome`) unverändert.

## Bestandsaufnahme

- Straßenkampf: Figuren standen steif, Haltungen wurden nur weich überblendet (kein Ausholen mit Gewicht, kein
  Nachschwingen), Licht flach. Spielerisch: Ein Kampf war nach etwa 16 s vorbei, und wer nur draufhaute, gewann auf
  schwer trotzdem 70 % (Test-Bot). Der Block drehte sich zum nächsten Gegner statt zu dem, der ausholt (Konter gingen
  dann ins Leere). Am Handy nahm die obere Leiste ein Fünftel des Bildschirms.
- Zivi oder Kunde: Alle Merkmale standen sofort als Text auf der Karte, man musste nur zählen („geschenkt“). Figuren
  ohne Bewegung, Kulisse aus flachen Rechtecken.

## Was neu ist

### Straßenkampf

- **Spielregeln:** Ein gehaltener Block hält den schweren Schlag der Gegner (Flamme) nicht mehr: Deckung durch, du
  taumelst und kriegst `HELD_BLOCK_HEAVY` (45 %) ab. Gegen die Flamme hilft Ausweichen oder der Block im letzten
  Moment (Konter). Der Block dreht sich zum Gegner, der gerade auf dich ausholt (`urgentThreat`).
- **Schwierigkeit:** Gegner mit `FOE_HP` 120 statt 80, Kraft `0,9 + 0,7 · d` statt `0,95 + 0,5 · d`, ab d 0,6 greifen
  zwei an (vorher 0,7).
- **Test-Bot** (`bot.ts`, Tests in `model.test.ts`): drei Spielweisen. Messung über 40 Seeds, drei Gegner und eine
  Crew (Gewinnquote, Dauer):

  | Schwierigkeit | geübt (Konter) | locker (Block, weicht der Flamme aus) | wild (nur Schlag) | Dauer |
  | --- | --- | --- | --- | --- |
  | 0,2 | 100 % | 100 % | 78 % | 22 s |
  | 0,5 | 100 % | 100 % | 53 % | 23 s |
  | 0,9 | 88 % | 78 % | 35 % | 25 s |

  Vorher: wild auf 0,9 noch 70 %, Kämpfe 16 s.
- **Figuren mit Leben** (`draw.ts`): Haltungen federn (`springPose`, `springFor`: Schlag und Treffer schwingen nach,
  Ausholen kommt weich), Ausfallschritt (`Pose.shift`), Kopf fliegt beim Treffer zurück (`Pose.head`), Ausholen mit
  Gewicht nach hinten, je weiter, desto näher der Schlag. Im Stand federn alle nach Rolle (`STANCE`: Schläger langsam
  und schwer, Nervöser zappelig mit Blick zur Seite, Anführer lässig mit tiefen Händen). Im Treffer-Stopp steht die
  Haltung, in der Zeitlupe läuft sie langsam.
- **Licht und Material:** Glanz von der nächsten Laterne (am Tag vom Himmel), Schatten auf der anderen Seite, farbiges
  Randlicht vom nächsten Leuchtschild (`FigureLight`, `lightOn` in `BrawlGame.tsx`), Kopf mit Verlauf. Spiegelung und
  Nachbild ohne Licht (Kosten).
- **Treffer mit Gewicht:** Rückstoß in der Haltung (`knock`), Funken und Schweiß- bzw. Regentropfen in Schlagrichtung,
  Druckwelle (`Ring`, `drawRings`), Kamera-Ruck zum Treffer bei harten Schlägen und Kontern, Serien-Zähler im HUD
  („3er-Serie“, aus `state.combo`).
- **Handy:** Uhr und Kräfteverhältnis in einer flachen Zeile, Ansagen rücken nach oben, Figuren etwas größer.

### Zivi oder Kunde

- **Hinschauen** (`model.ts`): Jedes Merkmal hat `reveal` (Sekunden seit die Karte offen ist). Gesagtes steht sofort
  da, die Frage nach dem Lieferanten am Ende des Satzes (`LINE_SECONDS`), alles andere zeigt sich nach und nach; leicht
  früh, schwer über die Karte verteilt, immer mit `REVEAL_MARGIN` (1,6 s) Luft zum Entscheiden. `visibleTells`,
  `cardElapsed`. Solange noch etwas kommt, steht ein gestrichelter Chip „…“ da (fair: man weiß, wann man genug gesehen
  hat). Neue Chips springen herein, im Bild blitzt Neues kurz auf, dazu ein leiser Klick.
- **Test-Bot** (`model.test.ts`): Wer bis zum letzten Merkmal wartet, liegt mit der Faustregel immer richtig. Wer nach
  0,9 s wischt: leicht 89 % richtig, schwer 86 % (bei zwei Zivis unter acht heißt das: schwer rutscht etwa jeder
  zweite Zivi durch).
- **Figuren mit Leben:** Das Porträt atmet und pendelt; wer zum Auto schaut, dreht den Kopf immer wieder dorthin (das
  Auto gegenüber reagiert erst, wenn man es gesehen hat), mit Knopf im Ohr dreht er das Ohr ins Bild, Nervöse zappeln,
  wer aufs Handy tippt, schaut runter. Der Satz wird gesprochen (tippt sich, der Rest ist durchsichtig, kein Springen).
- **Kulisse mit Licht:** Himmel mit Verlauf, ferne Dächer, Häuser mit Verlauf und Kanten, leuchtende Fenster mit
  Schein, Laterne mit Lichtkegel und Lichtfleck, nasser Gehweg mit Spiegelungen, Passanten im Hintergrund, Auto mit
  Glanz und Schatten. Farben über `--uc-*`-Variablen aus den Tokens, Tag und Nacht.

## Messung Leistung

Headless (Software-Rendering, ganze Seite mit Karte, Handy 390 × 844) Straßenkampf: vorher 2,8 bis 3,0 Bilder/s, nachher
2,8. Absolut wenig aussagekräftig, aber: kein Rückschritt. Pro Figur zwei zusätzliche Striche je Glied und ein Verlauf
am Kopf; Spiegelung ohne Licht.

## Offen / Ideen

- Zuschauer am Rand des Straßenkampfs, die bei harten Treffern jubeln (Silhouetten, nicht gebaut).
- Zivi oder Kunde: die ganze Figur statt Porträt plus Unterkörper (würde Gesten wie zum Auto zeigen deutlicher machen).
- Am echten Handy die Bildrate messen (hier nur Software-Rendering).
