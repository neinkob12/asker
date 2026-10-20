# Auftrag 48: Verfolgungsjagd (`chase`)

Branch `claude/minispiele-48-jagd`, Teil der Minispiel-Runde vom 20.10.2026 (Lead: `claude/minigames-verbesserung-u7gczr`).
Wunsch des Nutzers: „Qualität insgesamt richtig gut, besonders die Autoflucht“, „mehr Action, wie ein richtiges
Autospiel, fette Karre, schnell, Blaulicht“.

## Bestandsaufnahme (vorher)

- Stadt wie ein alter Render: glatte Kästen, riesige gelbe Fensterflächen ohne Rahmen, Erdgeschosse ohne Läden,
  leere Straßen. Laternen konnte man durchfahren, Parks auch.
- Die Karre las sich von hinten als schwarzer Kasten, Rücklichter ein roter Strich.
- Kaum Tempo-Gefühl, Streifen sah man nicht (sie sind fast immer hinter dir).
- Handy: Minikarte über der Funk-Zeile, Minikarte zeigte die ganze Stadt in 96 px (nichts zu erkennen).
- Himmel als feste Farbe; ein Teil der Szene lag hinter der Sichtweite (schwarze Keile am Himmel, siehe unten).
- Kein Test-Bot: Schwierigkeit war nicht messbar.

## Was neu ist

### Spaß und Schwierigkeit (Modell, `model.ts`, `bot.ts`)

- **Parkende Autos** am Bordstein (`addParking`, `PARKING`, eigener Zufall aus dem Seed, die übrige Stadt bleibt
  gleich): Wände, etwas schmaler als sie aussehen (Streifen auf ihrer Spur streifen sie nicht), nie an Kreuzungen und
  nie vor der Blockmitte (da kann die Tiefgarage liegen). Aufprall kostet weniger (`PARKED_DAMAGE`), Autoalarm.
- **Laternen, Straßenbäume, Ampeln** sind Wände (`addPosts`, `POSTS`, `POST_DAMAGE`): Wer über den Gehweg abkürzt,
  trifft sie. Die Optik liest dieselben Daten (`city.posts`).
- **Knapp vorbei**: schnell (`NEAR_MISS_SPEED`) und dicht (`NEAR_MISS_GAP`) am Verkehr vorbei füllt den Balken
  „Abhängen“ (`NEAR_MISS_SHAKE`), einmal je Begegnung. **Durch die Lücke einer Sperre**: `BLOCK_PASS_SHAKE`.
  Riskantes Fahren wird belohnt, nicht nur Weglaufen.
- **Ramm-Warnung**: `Cop.charging` und Ereignis `charge`, bevor eine Streife rammt (dicht hinter dir, Rammen bereit,
  `CHARGE_GAP`). Die Oberfläche zeigt den Pfeil rot („Rammt!“), Lichthupe, Warnton, roter Rand. Wer reagiert
  (Spurwechsel, Turbo), weicht aus: fair statt Pech.
- **Abhängen dauert schwerer länger**: `SHAKE_RATE` ist jetzt `{ easy, hard }`, im Setup `shakeRate`.
- **Fahr-Bot** (`bot.ts`, `createPilot`, `pilotInput`): fährt über das Raster weg von den Streifen bzw. zur Tiefgarage,
  bremst vor Kurven, wechselt die Spur im Verkehr, nutzt den Turbo und weicht bei der Ramm-Warnung aus. Test
  „Schwierigkeit mit dem Fahr-Bot“ in `model.test.ts`, im Dev-Build `window.chase.autopilot()`.

Messung mit dem Bot (24 Seeds je Stufe, Stand dieses PR):

| `difficulty` | entkommen | Dauer im Mittel | Knapp vorbei je Spiel |
| --- | --- | --- | --- |
| 0,2 | 20 von 24 | 29 s | 1,0 |
| 0,5 | 22 von 24 | 31 s | 1,9 |
| 0,9 | 11 von 24 | 36 s | 3,1 |

Der Bot fährt sauberer als ein neuer Spieler (kaum Unfälle); für Menschen ist jede Stufe schwerer als die Zahl
sagt. Vorher (ohne Ausweichen, alter `SHAKE_RATE`): 0,2 → 21/24 in 24 s, 0,9 → 12/24 in 31 s, also kürzer.

### Optik (three.js)

- **Stadt** (`city3d.ts`, `textures.ts`): Erdgeschoss mit Ladenzeilen (Büdchen, Döner, Späti, Apotheke, Wettbüro …,
  Schild mit Leuchtschrift, Auslage, Rollgitter mit Tag), darüber Fassaden in vier Stilen (Altbau mit Stuck,
  Backstein, Nachkriegsputz mit Rollläden, Bandfenster) mit Rahmen, Sprossen, Simsen und Gardinen im richtigen
  Maßstab (Feld 3 m × Geschoss 3,3 m), Anteile je Stadt (`STYLE_MIX`: Hamburg Backstein, Köln Putz, Berlin Altbau …),
  Glastürme mit Spiegelung und Bürolicht, Gesimse und Dachkranz, Balkone, Markisen, Leuchtreklame, Bordsteine,
  Laternen mit Lichtkegeln am Boden, Straßenbäume, Ampeln, parkende Autos, Kaimauer und Brücken (der Fluss lag
  vorher über den Brücken), Wahrzeichen mit mehr Form.
- **Nasse Straße**: Rauheit mit Pfützen (`roadTiles`), Umgebungslicht spiegelt, und Lichtstreifen auf der Straße
  (`createStreaks`: im Shader zur Kamera gedreht) unter Laternen, Ampeln, Leuchtreklame, Rück- und Scheinwerfern und
  Blaulicht. Bei Regen kräftig, nachts trocken schwach.
- **Umgebungslicht** (`cityEnvironment` im Baukasten): kleine Stadt-Szene aus Grundformen, mit PMREM gefiltert; Lack,
  Glas, Wasser und Asphalt spiegeln.
- **Deine Karre** (`buildHeroCar` im Baukasten): flaches, breites Coupé aus extrudiertem Seitenprofil mit runden
  Kanten, getönte Kabine, breite Hüften, Heck mit durchgehendem Leuchtband, Diffusor, vier Endrohren, Kennzeichen der
  Stadt (`K TY 48`, `HH TY 48` …), Felgen mit Speichen und roten Bremssätteln, Goldstreifen, Turbo-Flammen,
  Rückfahrlicht. Ein Licht von hinten zeigt nachts Lack und Kanten.
- **Effekte** (`effects.ts`): Rauch beim Driften und Vollbremsen, Qualm aus der Haube ab halbem Schaden, Funken und
  Staub bei Treffern, Bremsspuren (Ringpuffer), Tempo-Linien ab 75 % Tempo und beim Turbo.
- **Kamera**: tiefer und näher, folgt der Fahrtrichtung statt der Nase (der Drift ist sichtbar), Blickwinkel und
  Abstand wachsen mit dem Tempo, Turbo-Kick, leichtes Rütteln bei hohem Tempo.
- **Linse** (`LENS_SHADER`, nach dem Bloom): Radial-Unschärfe bei Tempo und Turbo, Farbsäume, Vignette, Körnung,
  Blaulicht-Schimmer am Rand, wenn sie dir im Nacken sitzen.
- **Himmel** als Kuppel mit Verlauf, die mit der Kamera wandert. Vorher lag die Kuppel im Ursprung und ragte teils
  über die Sichtweite (schwarze Keile am Himmel).

### Oberfläche (`ChaseGame.tsx`, `chase.css`)

- **Pfeile am Rand** zu Streifen außerhalb des Bildes mit Abstand; rot und größer beim Ansetzen zum Rammen.
- **Radar** statt Gesamtkarte: rund, Blick nach vorn, 190 m Umkreis, Häuser, Parks, Wasser, Sperren, Streifen
  (blinkend, rot beim Rammen), Tiefgarage (am Rand, wenn weiter weg).
- **Ziel**: Pille „Tiefgarage 120 m“ mit Pfeil zur Einfahrt; in der Szene eine goldene Lichtsäule ohne Nebel und ein
  pulsierender Ring vor der Einfahrt.
- **Einblendungen**: „Knapp vorbei! +5 %“, „Durch die Sperre! +10 %“, „Streife zerlegt!“, „Gerammt!“.
- **Handy**: Funk über die ganze Breite unter der Leiste, Radar darunter rechts, Ziel links; nichts überdeckt sich.

### Ton (`sounds.ts`)

- Martinshorn mit **Doppler** (Tonhöhe aus der Annäherung der nächsten Streife) und **Stereo** (von wo sie kommt).
- Reifenquietschen als Dauerklang beim Driften und Vollbremsen (`skid`), Luftstoß bei Knapp vorbei (`whoosh`),
  Autoalarm (`alarm`), Warnton bei der Ramm-Warnung (`warn`).

## Leistung

- Stadt in **Kacheln** (`CHUNK` = 6 Blöcke): je Material eine Geometrie pro Kachel, damit three.js Unsichtbares
  weglässt; Wiederholtes als `InstancedMesh` je Kachel.
- **Autos zusammengeführt** (`buildCar(kind, color, { merged: true })`, `mergeCar`): gleiche Materialien in eine
  Geometrie, je Achse beide Räder in ein Teil (vorher 8 Draw Calls nur für die Räder). Ein Verkehrsauto hat 7 statt
  rund 20 Draw Calls.
- **Blaulicht über einen festen Satz Lampen** (3, am Handy 2) an den nächsten Streifen und Sperren statt einer Lampe
  je Streifenwagen: Ändert sich die Zahl der Lichter, kompiliert three.js alle Shader neu (Ruckler, wenn eine Streife
  dazukommt oder eine Sperre auftaucht).
- **Handy**: Pixelverhältnis höchstens 1,5 (`useStage3d(…, { maxDpr })`), Bloom in halber Auflösung, Linse mit
  3 statt 7 Abtastungen, keine Schatten, kein Fülllicht, weniger Partikel, kleinere Texturen.
- Rechenzeit der Bildschleife (Modell, Szene nachführen, HUD) headless: 6 bis 8 ms je Bild am Desktop.

Draw Calls und Dreiecke je Bild (`window.chase.info()`, alle Durchgänge, gemessen mit Software-Grafik):

| Szene | Draw Calls | Dreiecke |
| --- | --- | --- |
| Desktop 960 × 600, Tag (mit Schatten) | 220 | 456 000 |
| Desktop 960 × 600, Nacht mit Regen | 180 bis 200 | 380 000 bis 410 000 |
| Handy 390 × 844, Nacht mit Regen | 175 | 330 000 |

Vorher und nachher vergleichbar (WebGL-Aufrufe direkt gezählt, inklusive Karte darunter, Handy Nacht mit Regen,
70 s): siehe PR-Beschreibung.

Mit Software-Grafik (SwiftShader, keine GPU) ist die neue Szene langsamer als die alte (mehr Pixel-Arbeit: PBR mit
Spiegelungen, Bloom, Linse). **Offen: auf einem echten Handy messen** (30 fps sind das Ziel); Stellschrauben dafür in
`scene.ts`: `hi` (alles Teure), `BLUE_LAMPS_LOW`, Bloom-Auflösung, `uTaps`, `maxDpr`.

## Werkzeuge (nur Entwicklung)

- `window.chase.autopilot(true|false)`: der Fahr-Bot fährt.
- `window.chase.sim(sekunden)`: vorspulen mit festen Schritten, gezeichnet wird nur am Ende (Bilder mit Effekten auch
  ohne echte Bildrate, z.B. headless).
- `window.chase.info()`: Draw Calls, Dreiecke, Geometrien, Texturen, Programme.

## Für die Integration

- Vertrag unverändert: `onFinish(score, picks)`, picks `dumped`, `hideout`, `time`; `applyChase` in `encounters`
  unberührt.
- Baukasten nur erweitert (die Verkehrskontrolle läuft wie bisher): `cityEnvironment`, `mergeCar`, `buildHeroCar`,
  `buildCar(…, { merged })` (ohne Option wie bisher), `useStage3d(…, { maxDpr })` (ohne Option wie bisher),
  Schattenart `PCFShadowMap` statt des entfernten `PCFSoftShadowMap` (three.js fiel ohnehin darauf zurück und warnte).
- Die Regressionstests in `games/minigame3d.regression.test.ts` laufen unverändert (`Vehicle.missed` ist optional).
- Headless erscheint `.mg-intro` manchmal nicht: Ein Dialog des frischen Spiels ersetzt die Vorschau. Abhilfe in
  Skripten: die Vorschau erneut öffnen, solange weder `.mg-intro` noch `.mg-run` da ist.

## Offen

- Messung auf echtem Handy (siehe Leistung).
- Seitenansicht der Karre (bei Drehern) ist schlichter als das Heck.
- Bewegungsunschärfe auf dem Handy ist an, aber mit 3 Abtastungen; bei Bedarf dort ganz aus.
