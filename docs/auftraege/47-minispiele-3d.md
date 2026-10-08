# Auftrag 47: Feedback vom 07.10.2026 – Minispiele in 3D: Fundament, Verfolgungsjagd, Verkehrskontrolle

Grundlage ist das Feedback des Spielers vom 07.10.2026 (sinngemäß):

> Viele Minispiele sind vom Konzept schon gut (Container packen wie Tetris, das Prinzip der Verfolgungsjagd, der
> Straßenkampf, Zivi oder Kunde). Tresor knacken ist vom Grund her gut, aber etwas schwer zu lösen. Die Optik von
> manchen muss besser werden, die Qualität insgesamt richtig gut, besonders die Autoflucht. Bei der Verkehrskontrolle
> will ich im Auto sitzen, aus dem Fenster gucken und die richtigen Antworten geben. Fragen zur Design-Art und zu den
> anderen Minispielen bitte als Pop-ups.

Die Fragerunde (Pop-ups in der Session, vier Runden) ergab:

| Frage | Antwort |
| --- | --- |
| Design-Art für alle Minispiele | Fotorealistisch gemalt (nicht flach, nicht Comic, nicht Pixel) |
| Wie kommen die Bilder ins Spiel? | Echtes 3D mit three.js (keine vorgerenderten Bilder, kein Bildmaterial im Repo) |
| Woher die 3D-Modelle? | Im Code gebaut, stilisiert: Grundformen mit PBR-Material, echtem Licht, Schatten, Spiegelungen, Nebel |
| Welche Spiele in 3D? | Verfolgungsjagd, Verkehrskontrolle (Ego aus dem Auto), Razzia-Lauf im Lager, Bude (Ego mit Taschenlampe) |
| Reihenfolge | Erst Fundament + Jagd + Kontrolle (dieser Auftrag), Razzia, Bude, Gespräch als Auftrag 48 |
| Verkehrskontrolle: „richtige Antworten“ | Gespräch mit Widersprüchen: Der Beamte fragt, drei Antworten, richtig ist, was zu Kennzeichen, Uhrzeit, Ladung und den früheren Antworten passt; Lügen, die auffliegen, kosten Misstrauen |
| Was bleibt in der Kontrolle? | Schein zustecken (nur im richtigen Moment), Gas geben = Verfolgungsjagd. Kein Puls mehr, kein Pakete-Umräumen |
| Verfolgungsjagd: Fahrmodell | Freies Lenken auf der Straße (stufenlos, Kreuzungen, Querverkehr), keine Spuren mehr |
| Verfolgungsjagd: Ziel und Stadt | Straßennetz aus dem Seed (Blöcke, Kreuzungen, Parks, Fluss), Verkehr und Streifen fahren frei; Balken „Abhängen“ bleibt: voll = nächste Tiefgarage leuchtet, rein = entkommen |
| Verfolgungsjagd: Optik | Autos mit Detail, Licht und Spiegelung; Kamera und Tempo-Gefühl (Nachziehen, Blickwinkel bei Turbo, Wackeln); Kulisse als echte Stadt (erkennbare Wahrzeichen, Wetter, Tageszeit) |
| Steuerung am Handy | Linke Hälfte lenken (Finger ziehen), rechts Gas, Bremse, Turbo; Gas von selbst wie bisher |
| Leistung | Volle Optik, 30 fps am Handy reichen |
| Neu denken (Prinzip) | Razzia-Countdown als Lauf-Spiel im Lager, Bude als Ego-Blick mit Taschenlampe, Bewerbungsgespräch als „eigene Fragen, Druck steuern“ (alle drei: Auftrag 48) |
| Tresor | Leichter mit mehr Hinweisen (Stethoskop deutlicher, Klick bei der richtigen Zahl, Toleranz weiter, Fehler kostet weniger Zeit) |
| 2D-Spiele, die bleiben (Packen, Zivi, Kampf, Papiere) | Licht und Material (weiche Schatten, Verläufe, Glanz, Körnung), Figuren mit mehr Leben (Auftrag 48) |

Branch `claude/optimistic-fermi-qondfj`, eine Session.

## A. Fundament: three.js im Minispiel-Baukasten

- [x] `three` als Abhängigkeit (`package.json`), nur im `ui/`-Ordner eines Moduls erlaubt (`UI_PACKAGES` in
  `scripts/check-boundaries.mjs`, wie `preact` und `maplibre-gl`). Begründung (Regel 5 im README): Fotorealismus mit
  Licht, Schatten und Spiegelungen geht im 2D-Canvas nicht; three.js ist die Standardbibliothek dafür.
- [x] `minigames/ui/kit/stage3d.ts`: `useStage3d(canvasRef, onResize)` wie `useStageCanvas`, aber mit
  `WebGLRenderer` (Antialias, ACES-Tonemapping, sRGB, Schatten), Größe über ResizeObserver, Pixelverhältnis bis
  `MAX_DPR`, Aufräumen beim Unmount (`renderer.dispose`, Kontext verlieren).
- [x] `minigames/ui/kit/scene3d.ts`: gemeinsame Bausteine: `buildCar` (Karosserie, Kabine, Räder, Scheinwerfer,
  Rücklichter, Lack mit Clearcoat; Varianten Pkw, Transporter, Lkw, Streifenwagen mit Lichtbalken, deine Karre in
  Graphit mit Goldstreifen), `skyFor(phase)` (Himmel, Nebel, Sonne/Mond, Hemisphärenlicht), `setBlueLight`
  (Blaulicht im Wechsel), `disposeGroup`.

## B. Verfolgungsjagd in 3D mit freiem Lenken (`minigames/ui/games/chase/`)

- [x] Modell neu (`model.ts`): Stadtraster aus dem Seed (`GRID` Blöcke, `PITCH` Meter Abstand, Straßen `ROAD_W` breit,
  Blöcke mit Gebäuden, Parks und einem Fluss mit Brücken), freies Lenken (`steer` −1 bis 1, Lenkrate nach Tempo,
  Drift: die Fahrtrichtung folgt der Nase mit Verzug), Vollgas, Bremse, Turbo, Zusammenstöße mit Gebäuden (Abprallen,
  Schaden nach Aufprall), Verkehr auf den Straßen (rechts fahren, an Kreuzungen abbiegen, bremsen vor dir), Streifen
  mit Wegsuche über das Raster (an jeder Kreuzung die Ausfahrt, die den Abstand zu dir verkleinert), rammen von hinten,
  Sperren an Kreuzungen vor dir mit einer Lücke, Balken „Abhängen“ (`SHAKE_*`), Tiefgarage (`hideout`: erscheint bei
  vollem Balken an einem Block nahe bei dir, rein = entkommen), gefasst bei Schaden 1, gestellt (`CATCH_*`) oder Zeit
  um, Ware aus dem Fenster. Score und picks wie bisher (`applyChase` in `encounters` unverändert).
- [x] Szene (`scene.ts`, three.js): Boden mit Asphalt-Kacheln (Fahrbahn, Gehweg, Markierungen als CanvasTexture pro
  Block), Gebäude als eine zusammengeführte Geometrie mit Fenstertextur (nachts leuchtend), Parks mit Bäumen, Fluss mit
  spiegelnder Fläche und Brücken, Laternen mit Lichtkegeln, Wahrzeichen der Stadt am Rand (Dom, Colonius, Kranhäuser;
  Elbphilharmonie; Fernsehturm; Frauenkirche; Bankentürme), Himmel nach Tageszeit, Regen als Partikel, Scheinwerfer
  (SpotLights) an deiner Karre, Blaulicht an jeder Streife, Kamera hinter dem Wagen mit Nachziehen, Blickwinkel nach
  Tempo und Turbo, Rollen in Kurven, Wackeln bei Treffern, Zeitlupe am Ende.
- [x] Komponente (`ChaseGame.tsx`): Tastatur ←/→ oder A/D lenken, ↑/W Gas, ↓/S/Leertaste Bremse, Umschalt Turbo, X
  Ware raus. Touch: linke Hälfte ziehen = Lenkwinkel, rechts Bremse und Turbo, Gas von selbst. HUD wie bisher plus
  Minikarte (Raster, du, Streifen, Tiefgarage). Funk, Ton-Schleifen und `window.chase` bleiben.
- [x] Tests (`model.test.ts`): Raster aus dem Seed, Lenken, Zusammenstoß mit Gebäude, Verkehr, Streifen holen auf,
  rammen, gestellt, Sperre, Abhängen und Tiefgarage, Zeit, Ware aus dem Fenster.

## C. Verkehrskontrolle als Gespräch aus dem Auto (`minigames/ui/games/traffic/`)

- [x] Modell neu (`model.ts`): Fakten aus dem Seed, die der Beamte sehen kann (Uhrzeit, Kennzeichen eigene oder fremde
  Stadt, Fahrzeugart, was hinten sichtbar liegt), und Fakten, die erst deine Antworten festlegen (woher, wohin, wessen
  Wagen, Zweck, Ladung). Fünf bis sechs Fragen aus dem Katalog (`questions.ts`), je drei Antworten: eine passt zu allem,
  zwei widersprechen etwas Sichtbarem oder einer früheren Antwort. Ein Widerspruch: er merkt es (Satz nennt den
  Widerspruch), Misstrauen steigt, Treffer; zwei Treffer: „Aussteigen“. Zwischen den Fragen geht er ums Auto, leuchtet
  nach hinten, funkt das Kennzeichen durch. Schein nur bei mittlerem Misstrauen (`BRIBE_MIN` bis `BRIBE_MAX`), Gas
  geben jederzeit. Score: durch ohne Treffer 0,85 bis 1, mit einem Treffer 0,6 (pick `lies:1`, er notiert das
  Kennzeichen), Schein 0,6, Gas 0,45, Aussteigen 0,15. `applyTraffic` in `encounters` unverändert.
- [x] Szene (`scene.ts`, three.js): Ego-Blick vom Fahrersitz nach links aus dem Fenster: Armaturenbrett, Lenkrad,
  A-Säule, Türverkleidung, Außenspiegel; draußen Gehweg, Fassaden, Laterne, Streifenwagen mit Blaulicht, der Beamte
  (Uniform, Mütze, Taschenlampe, beugt sich zum Fenster), Regen auf der Scheibe, Tag und Nacht. Das Gesicht des Beamten
  kommt aus dem Look-System (`Officer`, `Face` mit `hat: 'police'`) als HTML über der projizierten Kopfposition.
- [x] Komponente (`TrafficGame.tsx`): Sprechblase mit der Frage, drei Antworten (1 bis 3), Misstrauen-Balken, Treffer,
  „Schein“ (B) und „Gas geben“ (G). Die Zeilen spricht der Beamte mit `audio.speak` (Stimme fest aus dem Seed).
- [x] Tests (`model.test.ts`): Fragen aus dem Seed, genau eine passende Antwort je Frage, Widerspruch zu Sichtbarem,
  Widerspruch zu einer früheren Antwort, zwei Treffer = Aussteigen, Schein nur dazwischen, Gas, Score und picks.

## D. Tresor leichter (`minigames/ui/games/safe/`)

- [x] Toleranz 4 bis 2 Striche statt 3 bis 1, Strafsekunden 2 bzw. 3 statt 3 bzw. 5, Zeit 50 statt 45 s, Nähe über 16
  statt 12 Striche; beim Überfahren der richtigen Zahl in der richtigen Richtung ein eigener Klick und ein Aufblitzen
  am Stethoskop.

## E. Rest

- [x] `CLAUDE.md`, `docs/architektur.md` (Abschnitt „Minispiele“), `docs/auftraege/README.md`.
- [x] `scripts/perf-browser.mjs --scenes=jagd` fährt mit den neuen Tasten.
- [x] `npm run check`, `npm run build`, Screenshots mit `npm run screenshot:minigames -- --kind=chase,traffic,safe`.

## Auftrag 48 (danach)

Razzia-Lauf im Lager (3D, seitlich), Bude als Ego-Blick mit Taschenlampe (3D), Bewerbungsgespräch „eigene Fragen,
Druck steuern“, Licht und Material für die 2D-Spiele, Figuren mit mehr Leben im Straßenkampf und bei den Kunden.
