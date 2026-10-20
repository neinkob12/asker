# Auftrag 48, Teil Einbruch: Razzia-Countdown, Bude, Tresor

Branch `claude/minispiele-48-einbruch`, eine Session (Kollegin der Lead-Session aus Auftrag 48). Wunsch des Nutzers
vom 07.10.: „Razzia-Countdown als Lauf-Spiel im Lager (3D, seitlich)“ und „Bude als Ego-Blick mit Taschenlampe (3D)“,
Tresor war zu schwer. Alle Minispiele bleiben im Spiel aus (`MINIGAMES_ENABLED`), ausprobieren über `?minispiel=stash`,
`?minispiel=search`, `?minispiel=safe` bzw. die Test-Spielstände `?spielstand=minispiel-<art>`.

## Bestandsaufnahme (vorher)

| Spiel | Stand | Problem |
| --- | --- | --- |
| Razzia | Draufsicht 2D, Pakete ziehen | Kein Lauf-Spiel; man zieht Kästchen, der Druck kommt nur aus der Uhr. Wenig Gefühl von Körper und Raum. |
| Bude | Draufsicht 2D mit Lichtkreis | Alles auf einen Blick, die Taschenlampe ist nur eine Maske; Spuren sind gemalte Striche. |
| Tresor | 2D, Auftrag 47 schon leichter | Wer über die Zahl hinausdreht und zurückkorrigiert, gilt sofort als „falsche Richtung“ und muss einmal ganz herum. Das war der eigentliche Frust. |

## Entscheidung: 3D für Razzia und Bude, Tresor bleibt 2D

- **Razzia in 3D:** Ein Lauf-Spiel lebt vom Körper: Anlaufen, schwer tragen, sich bücken, die Leiter hoch. Mit three.js
  gibt es das aus Grundformen (Figur mit Gelenken), dazu echtes Licht (Hallenlampen, Licht durch die Fenster, Blaulicht,
  das die Halle flutet) und Schatten der Figur. Seitlich im Schnitt (Puppenhaus) bleibt es lesbar wie ein 2D-Spiel,
  sieht aber gebaut aus. In 2D hätte ich Licht und Schatten jeder Bewegung von Hand malen müssen.
- **Bude in 3D:** Die Taschenlampe ist hier die Spielmechanik (Spuren sieht man nur im Licht). Ein echtes Spotlicht mit
  harten Schatten, Staub im Strahl und Dingen, die sich öffnen, ist in 3D billig und überzeugend; in 2D wäre jeder
  Schatten eine Fälschung. Der Ego-Blick macht aus „alles sehen und antippen“ ein Suchen.
- **Tresor bleibt 2D:** Das Spiel ist ein Rad und ein Ohr. 3D bringt dort nichts, was das Gefühl verbessert; die Arbeit
  steckt besser in der Regel (Korrektur) und im Einrasten.
- three.js lädt erst beim Start (`lazyView`), wie Jagd und Kontrolle. `kit/scene3d.ts` und `kit/stage3d.ts` nur genutzt,
  nicht geändert (`buildCar`, `setBlueLight`, `disposeObject`, `phaseOf`, `useStage3d`).

## Razzia-Lauf (`games/stash/`)

- **Modell neu** (`model.ts`): Strecke in Metern (`length`, Lager 28 m mit Tor bei 20 m, am Spot 21 m), du läufst selbst
  (`RUN_SPEED`, `CARRY_SPEED` je Größe, `RUN_ACCEL`), Aufheben dauert (`PICKUP_TIME`, oben im Regal `PICKUP_HIGH`),
  Verstauen je Versteck (`stow`). Ziel und Folge-Ziel (`goal`, `queued`): Antippen eines Pakets = hinlaufen und
  aufheben, eines Verstecks = hinbringen; Tasten 1–5 (`sendTo`) holen das nächste passende Paket und bringen es hin.
  Leertaste (`act`) macht, was gerade geht (aufheben, verstauen, ablegen). Tor zu (`closeAt`, `STREET_CLOSES_BEFORE`):
  Wer draußen steht, wird reingeschoben, Wege nach draußen fallen weg, was dort schon verstaut wird, ist drin. Zeit um:
  Was offen liegt oder in der Hand ist, ist weg. **Score, picks und Folgen unverändert** (`police/stash.ts` liest nur den
  Score). Zeit `DURATION_EASY` 34 s bis `DURATION_HARD` 25 s, am Spot `STREET_TIME` 70 % davon.
- **Szene** (`scene.ts`, `figure.ts`, `textures.ts`): Lager im Schnitt mit Satteldach, Boden im Schnitt darunter (unter
  der Bodenklappe sieht man das Versteckte im Hohlraum liegen), Regale, Paletten, Tresor mit Tür, Schacht mit Leiter
  (die Figur klettert), Bodenklappe, draußen dein Wagen mit Kofferraumdeckel und der Gully. Am Spot: Gehweg vor dem
  Büdchen mit Bank, Kübel, gelbem Briefkasten, Tonne. Licht nach Tageszeit (`phase`, neu in den params von `police`),
  Staub, Lichtstrahlen. Kamera folgt mit Vorlauf, am Handy hochkant näher dran.
- **Druck:** Sirene immer näher, Streife fährt vor, Rolltor knallt runter (Wackeln, Ton `slam`), Blaulicht durch die
  Fenster dort, wo du gerade bist, Licht unter dem Tor, ab 6 s Klopfen (`knock`) und „Polizei! Aufmachen!“, Herzschlag,
  roter Rand. Am Ende schwenkt die Kamera zum Tor, es fliegt auf, Flutlicht, zwei Beamte mit Taschenlampen stürmen rein
  (Zeitlupe). Alles versteckt: Licht dimmt, Ruhe.
- **Rückmeldung:** Schritte im Takt, Aufheben/Verstauen mit Ton und Haptik, Funken und Licht beim Verstauen, „+7.700 €“
  steigt auf, Platschen und „nass“ beim Gully, rote Funken und Satz bei Ablehnung. Beschriftungen der Verstecke über der
  Szene (antippbar), zeigen beim Tragen sofort, ob das Paket passt („zu klein“, „voll“, „zu“); außerhalb des Bilds am
  Rand mit Pfeil, überlappen sich nie (weichen aus). Leiste der ganzen Strecke unter dem HUD (Verstecke, Pakete, du,
  Tor). Sprechblase über dem Kopf: was du trägst bzw. was vor dir liegt.
- **Schwierigkeit gemessen** (Bot `bestMove` mit 0,35 s Bedenkzeit, 30 Seeds, Test in `model.test.ts`):

  | Lage | leicht 0,2 | mittel 0,5 | schwer 0,9 |
  | --- | --- | --- | --- |
  | Lager mit Tresor | 0,99 | 0,89 | 0,65 |
  | Lager ohne Ausbau | 0,91 | 0,68 | 0,48 |
  | Am Spot | 1,00 | 1,00 | 0,87 |

  Ohne Tresor ist es spürbar enger: Der Ausbau lohnt sich auch im Minispiel. Der Bot ist besser als ein Mensch (kennt den
  besten Zug); leicht bleibt trotzdem gut machbar.

## Bude im Ego-Blick (`games/search/`)

- **Modell unverändert** (Wohnung aus dem Seed, Suchen, Lärm, Zeit, Score, picks). Neu ist nur ein Bot-Test, der die
  Raumwechsel mitrechnet (0,6 s pro Wechsel, 0,35 s Bedenkzeit, Spuren zuerst, laute Dinge zuletzt): leicht 1,0,
  mittel 0,89, schwer 0,66 (40 Seeds).
- **Szene** (`room3d.ts`, `scene.ts`): fünf Räume aus Grundformen (Raufaser, Parkett, Fliesen, Jalousie mit Licht in
  Streifen am Boden), alle 27 Dinge mit beweglichem Teil (Tür, Schublade, Deckel, Kissen, Diele), das beim Suchen
  aufgeht und offen bleibt. Spuren sind echte Geometrie: das Teil sitzt schief, davor Kratzer am Boden; der lugende Schein
  glänzt im Licht. Taschenlampe als `SpotLight` mit Schatten aus der rechten Hand, sichtbarer Kegel, Staub im Strahl,
  Kamera schaut mit (am Handy weiter). Fund: Scheine fliegen dir entgegen, warmes Aufblitzen, „+520 €“. Leer: Staub.
  Lärm: alles zittert. Nachbar hämmert: Putz rieselt, danach Blaulicht am Fenster. Schritte: Licht unter der
  Wohnungstür flackert. Am Ende dreht sich der Schlüssel, die Tür geht auf, die Lampe flackert und geht aus.
- **Bedienung:** Maus leuchtet, Klick sucht; Finger ziehen führt die Lampe, Tippen sucht; Pfeile wählen, Leertaste
  sucht, 1–5 bzw. Q/E wechseln den Raum (Leiste unten mit Zahl der offenen Dinge, grün mit Fund). Name des Dings im
  Licht, Fortschrittsring während der Suche, danach „✓ 520 €“ bzw. „leer“ am Ding.
- Alte 2D-Dateien `draw.ts` und `layout.ts` sind weg (nur hier genutzt).

## Tresor (`games/safe/`)

- **Korrektur erlaubt:** Nach dem Überdrehen darf man bis `CORRECTION` (6) Striche zurück, ohne dass es als falsche
  Richtung zählt (`comingRight`, Zustand `ahead`/`back`). Vorher musste man einmal ganz herum.
- **Rad hakt:** Beim Ziehen und Halten wird das Rad kurz vor der richtigen Zahl langsamer (`STICKY` 0,45), man landet
  leichter drauf. Tippen auf ←/→ bleibt genau ein Strich.
- Klick, Zittern, Stethoskop und der satte Klick beim Überfahren (Auftrag 47) bleiben; die Spannung kommt aus Herzschlag
  und Strafsekunden. Tests ergänzt.

## Leistung

- Gemessen headless mit Software-Rendering (SwiftShader, kein echter Grafikchip, daher nur zum Vergleich), Handy-Größe:
  Razzia 3,4 Bilder/s, Bude 4,2, zum Vergleich Verfolgungsjagd 0,4 und Kontrolle 0,3. Die neuen Szenen sind also etwa
  zehnmal billiger als die vorhandenen 3D-Spiele: wenige Lichter, ein Schatten-Licht (Sonne bzw. Taschenlampe, am Handy
  512er Schatten in der Bude), geteilte Geometrie, nur der aktuelle Raum wird gezeichnet.
- Pro Bild höchstens einmal zeichnen, auch wenn die Schleife vorgespult mehrere Schritte macht (sonst hängt
  `minigameAdvance`). Beschriftungen per `transform`, Breiten nur nach HUD-Wechseln gemessen. Aufräumen mit
  `disposeObject` und Texturen beim Unmount.
- Pakete: `StashGame` 19 kB, `SearchGame` 14 kB (gzip), beide eigene Pakete.

## Für die Integration

- `stash/draw.ts` enthält nur noch `readPalette`/`StashPalette`, weil der Container (`container/`) sie von dort holt.
  Gehört eigentlich in `kit/` (z.B. `kit/palette.ts`).
- Der Regressionstest „Razzia-Countdown, Ware unterwegs, wenn die Straße zu ist“ ist aus
  `games/minigame-ui.regression.test.ts` nach `stash/model.test.ts` umgezogen (neue Regeln: Ware bleibt in der Hand).
- `police/stash.ts`: `StashParams.phase` (Tageszeit der Razzia, `clock.dayPhase(raid.at)`), nur für Licht und Himmel.
- Am Handy (Karte zuerst) liegen Tab-Leiste und „Nächster Schritt“ noch über den Knöpfen bzw. der Raumleiste; das behebt
  der Fix in `minigames.css` der Lead-Session.
- Wünsche an den Baukasten: ein gemeinsamer Baustein für „Beschriftung an einem 3D-Punkt, weicht aus, Pfeil am Rand“
  (Razzia und Kontrolle haben je eine eigene Lösung), und eine Figur aus Grundformen (`stash/figure.ts`) könnte nach
  `kit/` wandern, falls Kampf oder Zivi sie in 3D brauchen.

## Offen

- Ein echtes Handy statt Software-Rendering messen (Ziel 30 Bilder/s).
- Bude: Türen zwischen den Räumen sind nur eine Leiste, kein Gang durch die Wohnung.
- Razzia: Hindernisse zum Drüberspringen wären möglich, würden aber Antippen und Tasten ungleich machen; bewusst weg.
