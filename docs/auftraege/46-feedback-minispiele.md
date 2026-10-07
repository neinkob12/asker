# Auftrag 46: Feedback vom 07.10.2026 – Minispiele neu: Arcade-Jagd, Verstecken und Nerven, Lügendetektor

Grundlage ist das Feedback des Spielers vom 07.10.2026 (sinngemäß):

> Viele Minispiele schlagen viel zu selten aus, und sie sehen schlecht aus. Zivi oder Kunde ist schon ganz gut, aber
> die Verfolgungsjagd muss viel besser werden: mehr Action, mehr wie ein richtiges Autospiel, fette Karre, schnell,
> Blaulicht, Verfolgung, Spur wechseln, nicht nur Kurven und Abzweige. Ich will keine Wahrscheinlichkeits-Sachen mehr
> (außer man gibt es an jemanden ab), also keine Fragen mit Antworten. Alle Fragen zu den Minispielen bitte als Pop-up
> stellen und dann neu bauen bzw. verbessern.

Die Fragerunde (Pop-ups in der Session) ergab:

| Frage | Antwort |
| --- | --- |
| Optik der Verfolgungsjagd | Arcade von hinten (eigene Bühne im Canvas, Spuren, Verkehr, Streifen mit Blaulicht, Turbo, Sperren, Köln als Kulisse) |
| Wie entkommt man? | Balken „Abhängen“: füllt sich, solange die nächste Streife weit hinten liegt, voll = Tiefgarage; gefasst, wenn die Karre kaputt ist, sie dich stellen oder die Zeit abläuft |
| Verkehrskontrolle ohne Fragen | „Verstecken und Nerven“: Blick von oben ins Auto, der Beamte geht mit der Taschenlampe ums Auto, Ware rechtzeitig umräumen, Puls im Takt halten; Gas geben und Schein bleiben |
| Bewerbungsgespräch | Lügendetektor wie bei „Zivi oder Kunde“: Die Person redet (Stimme bleibt) und zeigt kurz Zeichen, die man rechtzeitig antippt |
| Häufigkeit | Etwas öfter (etwa doppelt so oft wie bisher, dieselben Auslöser mit höheren Chancen) |
| Optik der übrigen | Razzia-Countdown neu zeichnen; die anderen hatte der Spieler noch nicht gesehen, weil sie nicht kamen |

Branch `claude/minispiele-46-feedback`, eine Session.

## A. Verfolgungsjagd als Arcade-Rennspiel (`minigames/ui/games/chase/`)

- [x] Eigene Bühne (`layout: 'stage'`) statt der 3D-Karte: Pseudo-3D-Straße von hinten im Canvas (`draw.ts`), drei
  Spuren, Kurven aus dem Seed, Häuserzeilen mit Fenstern und Leuchtreklame, Laternen, Bäume, Schilder, Brücken, Skyline
  der Stadt am Horizont (`SKYLINES` je Stadt: Dom, Colonius, Kranhäuser; Elbphilharmonie; Fernsehturm; Frauenkirche;
  Bankentürme), Tag, Dämmerung und Nacht (Scheinwerfer, Rücklichter, Laternenlicht), Regen.
- [x] Fahren (`model.ts`): Spurwechsel mit Feder, Vollgas, Bremse, Turbo (lädt nach), Kurvenzug nach außen bei Tempo,
  Verkehr (Pkw, Transporter, Lkw; auffahren kostet Tempo und Schaden, seitlich streifen schiebt zurück), Streifen, die
  aufschließen, rammen, neben dir herfahren und dich zur Seite drücken, vor dir bremsen (blockieren) und im Verkehr
  auch mal verunglücken; Straßensperren mit einer freien Spur ab `BLOCK_FIRST`; Ware aus dem Fenster (Turbo voll, die
  Streifen zögern, pick `dumped`).
- [x] Ziel „Abhängen“ (`SHAKE_*`): Balken steigt ab `SHAKE_FAR` Metern Vorsprung, fällt unter `SHAKE_NEAR`; voll =
  entkommen (Tiefgarage, pick `hideout`). Gefasst bei Schaden 1, gestellt (`CATCH_*`) oder Zeit um (pick `time`).
  Score wie bisher: entkommen 0,6 + 0,4 · Restzeit, gefasst 0,05 bis 0,4. `applyChase` in `encounters` unverändert.
- [x] Deine Karre: breites Coupé in Graphit mit Goldstreifen, Spoiler, Leuchtband, Doppelauspuff mit Turboflammen,
  Beulen bei Schaden; Rückspiegel mit den Streifen von vorne; Blaulicht-Wash am Rand, Funken, Rauch, Tempo-Linien,
  Zeitlupe am Ende (Tiefgarage dunkel mit Gold, gefasst Blaulicht von allen Seiten).
- [x] HUD: Zeit, Abhängen mit Status („Im Nacken“, „Vorsprung“), Karre (Schaden), Tacho mit Turbo, Funk-Zeile, „Ware
  raus“. Touch: Pfeile oder Wischen für die Spur, Bremse und Turbo halten; am Handy gibt der Wagen von selbst Gas.
  Tastatur: ←/→ oder A/D Spur, ↑/W Gas, ↓/S/Leertaste Bremse, Umschalt Turbo, X Ware raus.
- [x] Ton: Motor nach Tempo mit vier Gängen, Martinshorn nach Abstand, Quietschen, Aufprall, Hupe, Turbo, Funk.
- [x] Tests: `model.test.ts` (Straße aus dem Seed, Schwierigkeit, Fahren, Verkehr, Rammen, Stellen, Ware aus dem
  Fenster, Abhängen, Zeit, Sperren).
- Gemessen (Simulation ohne Oberfläche): leichte Lage, guter Fahrer: entkommen nach etwa 20 s; mittlere Lage: 20 bis
  45 s; ohne jede Eingabe gestellt nach etwa 15 bis 40 s.

## B. Verkehrskontrolle als „Verstecken und Nerven“ (`minigames/ui/games/traffic/`)

- [x] Keine Fragen und Antworten mehr. Blick von oben ins aufgeschnittene Auto (`draw.ts`): Sitze, Lenkrad,
  Handschuhfach, Konsole, Türfächer, Rückbank, Kofferraum mit Reserveradmulde; am Desktop liegt das Auto quer
  (`TrafficLayout.rotated`), am Handy hochkant. Streifenwagen mit Blaulicht, Bordstein, Laterne, Regenringe.
- [x] Ablauf (`model.ts`): Begrüßung, dann Stationen aus dem Seed (Fahrerfenster, einmal ums Auto im oder gegen den
  Uhrzeigersinn, Kofferraum immer; leicht eine Seite weniger). An jeder Station leuchtet er nacheinander in ein bis
  drei Stellen (sichere Stellen immer, versteckte mit `0,25 + 0,6 · Schwierigkeit`). Pakete (3 bis 6, klein oder
  mittel) liegen anfangs offen auf Sitz, Bank, im Fußraum. Was in einer Stelle liegt, wenn das Licht kommt, ist
  gefunden (`FOUND_SUS`); beim zweiten Fund „Aussteigen“ (`MAX_FOUND`). Wo er schon war, ist es sicher.
- [x] Bewegen: Paket antippen oder ziehen, Stelle antippen (Leiste mit Belegung, Größe, „gleich“ und „Licht!“), Tastatur
  ←/→ und 1 bis 7. In eine beleuchtete Stelle (oder aus ihr heraus) geht nichts (`seen`).
- [x] Puls: im ruhigen Takt tippen (Leertaste, Herz) hält ihn grün; gelb und rot kosten Misstrauen pro Sekunde, ab
  `PULSE_NERVOUS` schaut er ein zweites Mal nach vorne (eine Station mehr, einmal).
- [x] Schein zustecken nur bei mittlerem Misstrauen (`BRIBE_MIN` bis `BRIBE_MAX`), sonst steigt es; Gas geben startet
  die Verfolgungsjagd. Score: „Gute Fahrt“ 0,6 bis 1, Schein 0,6, Gas 0,45, „Aussteigen“ 0,1 bis 0,4.
- [x] picks: `flee`, `bribe`, `found:<n>`. `applyTraffic`: ein Fund kostet bei Erfolg etwas Ware und er notiert das
  Kennzeichen (`TRAFFIC_NOTED_HEAT`, wie früher `lies:<n>`).
- [x] Tests: `model.test.ts` mit einem „schlauen Spieler“ (`smartMove`), der die Runde ohne Fund übersteht.

## C. Bewerbungsgespräch als Lügendetektor (`minigames/ui/games/interview/`)

- [x] Drei Fragen kommen fest aus dem Seed (am liebsten zu noch unbekannten Eigenschaften), keine Wahl, keine Deutung
  per Text. Die Person antwortet (Text tippt sich ab, Stimme über `audio.speak`) und zeigt dabei, wenn die Antwort
  etwas verrät, zwei bis drei **Zeichen** (`TELL_KINDS`: Blick weg, Schwitzen, Zappeln, Kratzen am Hals, nervöses
  Grinsen), dazwischen harmlose **Gesten** (`GESTURE_KINDS`: Nicken, Schluck, Schulterzucken, Vorbeugen). Zeichen
  rechtzeitig antippen (Leertaste, „Zeichen!“, die Person); eine Geste anzutippen ist ein Fehlalarm, zwei verderben die
  Runde. Mindestens die Hälfte der Zeichen erwischt: Die Eigenschaft steht in der Akte. Ehrliche Antworten haben nur
  Gesten. Schwerer heißt kürzere Zeichen und mehr Gesten (`TELL_WINDOW`, `DECOYS`).
- [x] Zeichen als Overlay über dem Porträt (`Tells.tsx`: Schweiß, Hand am Hals, Becher) und als Bewegung am Porträt
  (CSS: Kopf dreht sich weg, zappelt, nickt, zuckt, beugt sich vor); nervöses Grinsen über den Mund im Look.
- [x] Score und picks wie bisher (richtige Runden / 3, aufgedeckte Eigenschaften), `recruiting` unverändert.
- [x] Tests: `model.test.ts` (Aufbau, perfektes Tippen, nichts tippen, Fehlalarme, einmal je Zeichen); der
  e2e-Schritt tippt „Zeichen!“, bis das Ergebnis steht.

## D. Razzia-Countdown neu gezeichnet (`minigames/ui/games/stash/draw.ts`)

- [x] Lager: Betonboden mit Fugen, Ölflecken und Lichtpfützen der Deckenlampen, gelbe Bodenmarkierung und
  Warnstreifen vor dem Rolltor, Holzpaletten unter den Paketen, Stahlregale mit Holzkisten und Säcken, Werkbank,
  Tresor mit Zahlenrad, Griff und Scharnieren, doppelter Boden aus Dielen mit offener Ecke, Lüftungsgitter mit
  Schrauben, Gully aus Gusseisen mit nassem Glanz, weißer Lieferwagen mit Rädern, Spiegeln, Zierstreifen und
  Warnblinkern, Gehwegplatten, Bordstein, Laternenlicht, Ziegeldächer der Nachbarn.
- [x] Straße: Fassade mit erleuchteten Schaufenstern und Markisen, Gehwegplatten im Versatz, Holzbank, Laterne mit
  Lichtpfütze, Fahrrad, Blumenkübel aus Beton mit Blüten, gelber Briefkasten, grüne Mülltonne mit Rädern, parkendes
  Auto.
- [x] Pakete: Karton in Warenfarbe mit Lichtkante, Klebeband, Etikett und größerem Symbol; Streifenwagen mit Band und
  Blaulicht-Schein.

## E. Minispiele etwa doppelt so oft

Nur Pfade, die der Spieler selbst auslöst; Bot, Würfelfolgen, Szenario-Tests und `npm run balance` bleiben gleich.

- [x] Zivis (`police/config.ts`): Grundrauschen `UNDERCOVER_BASE_CHANCE_PER_HOUR` 3 % → 6 % pro Stunde, Abklingzeit
  `UNDERCOVER_COOLDOWN` 8 h → 5 h.
- [x] Kontrollen gegen dich (`police`): Stehst du selbst am Spot, kommen Kontrollen in dem Veedel schon ab Heat
  `PLAYER_CHECK_THRESHOLD` 15 (statt 30), und sie kippen mit `PLAYER_CHASE_CHANCE` 50 % (statt 30 %) in die
  Verfolgungsjagd. Derselbe eine Wurf wie bisher: Für Veedel ohne dich ändert sich nichts.
- [x] Fahrten (`logistics`): Fährst du selbst (Abholung am Kai, Umlagern), treffen dich Kontrolle und Zoll
  `PLAYER_CHECK_FACTOR` 2-mal so oft wie einen durchschnittlichen Fahrer (Verkehrskontrolle, Papiere, Jagd).
- [x] Überfälle (`gangs/ai.ts`): Überfällt eine Gang den Spot, an dem du gerade stehst, bist du mittendrin
  (`playerPresent`), statt dass die Akte fragt: Zuschlagen startet den Straßenkampf.
- Unverändert: Razzien (Tipp kam schon), Tresor und Bude (nach eigenen Überfällen bzw. Eintreiben), Container (nach
  dem Verkauf), Papiere bei Lieferungen (Wahl bei drohender Beschlagnahme), Gespräch (Knopf).

## F. Rest

- [x] `scripts/perf-browser.mjs --scenes=jagd` misst die neue Jagd (Tasten wie bisher, `window.chase.view.current.perf`).
- [x] `CLAUDE.md`, `docs/architektur.md` (Abschnitt „Minispiele“), `docs/auftraege/README.md`.
- [x] `npm run check`, `npm run build`, `npm run e2e`, Screenshots mit `npm run screenshot:minigames`.
