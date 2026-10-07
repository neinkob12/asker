# Auftrag 47: Performance – Spätspiel ohne Ruckeln, Spielstände ohne 5-MB-Grenze

Anlass ist das Feedback des Spielers vom 07.10.2026 (sinngemäß):

> Das Spiel bekommt immer mehr Funktionen und läuft im Browser, fängt aber schnell an zu laggen, sobald einem viele
> Spots gehören oder viel auf einmal passiert. Wenn man nach Hamburg kommt, crasht das Spiel manchmal schon. Wie soll
> das dann in den anderen Städten werden? Entweder die Performance wird deutlich besser, ohne die Qualität zu
> verschlechtern, oder eine andere Art des Hostings.

## Befund

Ein anderes Hosting hilft nicht: Das Spiel läuft komplett im Browser, der Server liefert nur statische Dateien und die
Bestenliste. Die Zeit geht in der Simulation (die mit den Städten wächst, obwohl nur eine live ist), im Autosave und in
der Oberfläche verloren. Gemessen mit den Test-Spielständen (Node, Entwicklungsmaschine; am Handy etwa das Vierfache):

| Spielstand | Simulation pro Spieltag | längster Schritt | Spielstand (JSON) | Leute im Zustand |
| --- | --- | --- | --- | --- |
| Köln komplett | 389 ms | 11 ms | 446 kB | 60 |
| Hamburg komplett | 400 ms | 12 ms | 569 kB | 110 |
| Deutschland | 1064 ms | 50 ms (Mitternacht 80 ms) | 1393 kB | 672 |

Die Messung vom Oktober (`docs/perf/2026-10-messung.md`, „die Simulation ist nicht das Problem“) galt für ein neues
Spiel über 20 Tage. Im Spätspiel stimmt sie nicht mehr. Ursachen, nach Gewicht:

1. **Alle Leute aller Städte liegen in einer Liste, und 119 Stellen filtern bei jedem Zugriff die ganze Liste.**
   `getStaff` war im Browser-Profil die teuerste Spielfunktion (etwa 10 % der Rechenzeit); allein Berlin hatte 271
   Läufer im Zustand, die Köln jede Minute mit durchkämmte (Leutnants × Spots × Leute).
2. **Alle Stunden-Ticks fielen in dieselbe Minute.** Elf Module tickten bei Minute 0, dazu Mitternacht: bei Tempo 4×
   alle 15 Sekunden ein Hänger von 25 bis 80 ms, am Handy über 100 ms.
3. **Autosave alle 10 Sekunden schrieb bis 1,4 MB synchron in localStorage.** Dazu die Grenze von etwa 5 MB:
   Autosave plus drei Speicherplätze passten mit allen Städten nicht mehr hinein, spätestens in München scheiterte das
   Speichern.
4. 151 HTML-Marker für die Spots aller Städte hängen immer im DOM (Startbildschirm 5.200 Knoten, Nachrichten-App
   9.400); ein einziges Bundle mit 4,1 MB (1,6 MB gezippt) mit allen fünf Straßennetzen.
5. **Absturz bei Hamburg (Verdacht, nicht bewiesen):** Der Anruf aus Hamburg ist der erste Anruf im Spiel, Stimmen
   sind standardmäßig an. Genau dann lädt der Browser erstmals das ONNX-Runtime-WASM (14 MB) und das Sprachmodell
   (60 MB) und kompiliert beides, während die Karte zur neuen Stadt fliegt und Kacheln lädt. Es gibt keinen
   Fehlerfänger, deshalb bleibt ein Absturz unsichtbar.

## Punkte

- [x] **1. Leute pro Stadt indexieren, Ticks nur über die lebende Stadt.** `staff/members.ts` hält einen Index nach
  ID und nach Stadt (gültig, bis die Liste wächst, neu gebaut wird oder jemand die Stadt wechselt;
  `invalidateStaffIndex()` nach einem direkten Stadtwechsel, auch in Tests). `getStaff` mit `cityId`, `spotId` oder
  `veedelId` liest nur die Liste dieser Stadt, `getStaffMember`/`isEmployed` schlagen nach. Die Routinen des Personals
  (Haft, Kunden bedienen, Erfahrung, Löhne, Loyalität, Verrat) laufen über `liveMembers(state)`; `teamOf` und das
  Schließen eines Spots filtern nach Stadt bzw. Spot. Ergebnis (Node): Deutschland 1064 → 592 ms/Tag, Hafen 173 → 60,
  Mitternacht 80 → 10 ms, volle Stunde 23 → 6 ms; Köln und Hamburg unverändert (dort war die Liste klein).
- [x] **2. Stunden-Ticks verteilen.** Neues Feld `tickOffset` im Modul-Vertrag (`module.ts`, `sim.ts`): Mit
  `tickEvery: 60` und `tickOffset: 7` tickt ein Modul um x:07. Versetzt sind police 7, gangs 19, recruiting 23,
  fleet 29 und grow 41 (alle lesen höchstens `clock.hour`, das bleibt innerhalb der Stunde gleich). Nicht versetzt:
  goods, market, weather, events (prüfen `now % MINUTES_PER_DAY === 0`), spots (leicht), territory (ein Veedel fällt
  zur vollen Stunde, die Test-Spielstände „fast komplett“ sind darauf gebaut), hierarchy (tickt ohnehin alle fünf
  Minuten; ein Versatz verschob die Würfe der Vollmacht) und alles, was an `clock.dayStarted` hängt (Löhne, Kasse,
  Tagesbericht). Deterministisch wie zuvor; die Würfelfolgen der versetzten Module verschieben sich.
- [x] **3. Autosave nach IndexedDB, nur bei Änderung.** `saves.ts`: `mirroredStorage` legt einen Spiegel im
  Arbeitsspeicher über einen asynchronen Speicher (`indexedDbBackend`), liest beim Start einmal alles ein und
  schreibt danach im Hintergrund; `openBrowserSaveStorage` nimmt IndexedDB, sonst localStorage wie bisher. Alte
  Spielstände wandern beim ersten Start aus dem localStorage in die Datenbank (erst dort weg, wenn die Datenbank sie
  hat). Was beim Verlassen der Seite noch nicht bestätigt ist, geht in den Notfallspeicher (`koeln-tycoon:pending:*`)
  und wird beim nächsten Start nachgetragen. Die Sitzung merkt sich, ob sich etwas geändert hat (`dirty`): Der Takt
  schreibt nur dann, dafür auch in der Pause (ein Kauf in der Pause ging beim Schließen des Tabs sonst verloren).
  Einstellungen bleiben im localStorage. `startApp` ist dafür asynchron.
- [ ] 4. Marker nur für die aktive Stadt mounten (`spots/ui/map.ts`, `getAllSpots` → Spots der aktiven Stadt plus
  eigene), dasselbe für Lager, Gangs, Lieferanten.
- [ ] 5. Straßennetze und Sprachmodul als eigene Chunks laden (`import()` je Stadt in `roads`, Piper-Worker erst beim
  ersten Anruf), MapLibre als eigener Chunk.
- [x] 6. Perf-Leitplanke um die großen Test-Spielstände erweitert (`perf.bench.test.ts`, `PERF=1 npm run perf:sim`:
  ein Spieltag je Stand mit Richtwert, schlägt bei mehr als dem Doppelten fehl).
- [ ] 7. Absturz bei Hamburg aufklären: Fehlerfänger (`window.onerror`, `unhandledrejection`) in den Verlauf und den
  Export; Ankunft in Hamburg mit Stimmen aus und mit Stimmen an auf dem Handy vergleichen; Sprachmodell erst laden,
  wenn der Spieler den Anruf annimmt, statt beim Klingeln.

## Offen und Entscheidungen

- Der Zustand selbst wurde nicht schlanker gemacht: Mit IndexedDB ist die Größe kein Speicherproblem mehr, und die
  Serialisierung (etwa 10 ms je 1,4 MB alle 10 Sekunden) liegt im Rahmen. Wer sie drücken will: `career` der Leute
  (`CAREER_LIMIT`), `finance.days` (30 Tage mit Spot-Zeilen, etwa 180 kB), Kontakte in `messages.contacts`.
- Die Simulation in einen Web Worker zu verlagern wäre die strukturelle Lösung gegen Hänger, kostet aber viel Umbau,
  weil 197 Stellen der Oberfläche den Zustand direkt lesen (`useGame()`). Erst nach Punkt 4 und 5 entscheiden.
- IndexedDB schreibt asynchron: Schließt jemand den Tab im selben Augenblick, in dem der Autosave läuft, kann die
  Bestätigung ausbleiben. Dafür gibt es den Notfallspeicher; Chromium und Safari führen laufende Transaktionen in der
  Regel noch zu Ende.

## Messen

- Simulation: `PERF=1 npm run perf:sim` (Bot 20 Tage und ein Spieltag je großem Test-Spielstand).
- Browser: `node scripts/perf-browser.mjs --save=public/spielstaende/deutschland.json --seconds=12 --speed=4
  --scenes=ui` (Preact, GameMap.update, Simulation, Long Tasks, CPU-Profil).
