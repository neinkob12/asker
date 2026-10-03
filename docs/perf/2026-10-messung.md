# Performance-Messung, Oktober 2026: Wo das Spiel ruckelt

Anlass: Beim Probespielen am 02.10.2026 war das Spiel „sehr laggy, besonders wenn viele Aufträge gekommen sind“.
Gemessen am Stand `main` nach Auftrag 29 (PR 29), ohne Code-Änderung. Grundlage für Etappe 0 in
[Auftrag 30](../auftraege/30-staedte-hamburg.md) und das Performance-Budget in [Auftrag 31](../auftraege/31-karte-lebt.md).

## Kurzfazit

**Die Simulation ist nicht das Problem.** In Node braucht ein Simulationsschritt (eine Spielminute) etwa 0,1 ms, selbst an
Tag 20 mit 59 Leuten, 26 Spots und 16 Leutnants nur rund 270 ms pro Spieltag. Bei Tempo 4× sind das 16 Schritte pro
Sekunde, also etwa 4 ms pro Sekunde.

**Die Zeit geht in der Oberfläche verloren.** Bei jedem Neuzeichnen (Ziel 10-mal pro Sekunde) rendert Preact den
kompletten Baum ab `App` neu (ohne Memoisierung, so in `src/ui/hooks.ts` vorgesehen). Alle Lese-Helfer (Chat-Liste,
Live-Aktivitäten, Advisor, Badges, Karten-Layer) rechnen dabei jedes Mal dasselbe neu, und die Dynamic Island erzwingt pro
Render ein synchrones Layout. Mit offenen Lieferanfragen wird genau dieser Teil teurer: Jede Anfrage ist eine Nachricht
mit Frist, also mehr Chats mit `awaitingAnswer` und `deadline`, eine Island-Aktivität mit laufendem Countdown (ändert sich
jede Spielminute und löst den Island-Morph aus), ein Advisor-Eintrag „Antworten“, eine Zeile in der Nachrichten-Liste mit
`SwipeRow` und `ContextMenu` (DOM verdoppelt sich), und angenommene Lieferungen sind Fahrzeuge auf der Karte, deren
GeoJSON-Quelle bis zu 40-mal pro Sekunde neu gesetzt wird.

## Messwerte

### A. Simulation ohne Oberfläche (`npm run perf:sim`, Bot, Seed 11, 20 Spieltage)

| | Tag 1 bis 5 | Tag 15 bis 20 | gesamt |
| --- | --- | --- | --- |
| ms pro Spieltag (inklusive Bot-Befehle) | 71 ms | 239 ms | 146 ms, also 0,10 ms pro Schritt |
| Zustand an Tag 20 | | 300 Nachrichten, 15 Orders, 59 Leute, 26 Spots, 16 Leutnants, 316 kB JSON | |

Modul-Ticks (Summe über 20 Tage): `hierarchy` 856 ms (148 µs je 5-Minuten-Tick, wächst mit Leutnants × Spots),
`customers` 270, `logistics` 168, `staff` 159, `territory` 148 (308 µs pro Stunde), `police` 115 (240 µs pro Stunde),
`gangs` 89 (186 µs pro Stunde). Alle Ereignis-Handler zusammen nur 179 ms (`finance` auf `wallet.changed` 4,4 µs mal
6.025 Aufrufe). Teuerster Befehl: `customers.acceptOrder` mit 1,85 ms pro Aufruf (A*-Route in `roads`, nur 73-mal).
Alle Listen sind begrenzt (`MESSAGE_LIMIT` 300, `JOURNAL_LIMIT` 60, `MAX_OPEN_ORDERS` 2, Auftrags-Verlauf 15); ein
quadratisches Wachstum im Tick ist nicht belegt.

### B. Browser (`npm run perf:browser`, Headless-Chromium, Dev-Server, Tempo 4×, Fenster 700 × 500)

Einschränkung: Headless ohne GPU (SwiftShader) zeichnet die Karte nur mit 2 bis 5 Bildern pro Sekunde, und WebGL-Aufrufe
dominieren das CPU-Profil künstlich. Deshalb misst das Skript die Preact-Zeit synchron (`options.debounceRendering`
sofort) und stoppt `GameMap.update`, die Layer und die Simulationsschritte einzeln. Diese Zahlen hängen nicht an der GPU.

| Szene (je 25 bis 30 s) | Komponenten-Renders pro Neuzeichnen | Preact ms pro Neuzeichnen (max) | GameMap.update | DOM-Knoten | Simulation ms pro Schritt |
| --- | --- | --- | --- | --- | --- |
| Tag 1, Startbildschirm | 101 | 2,1 (10,5) | 1,0 ms | 1.256 | 0,17 |
| Tag 14, Startbildschirm | 64 bis 100 | 2,7 bis 3,8 (17) | 1,0 bis 1,5 ms | 1.161 bis 1.305 | 0,3 bis 0,6 |
| Tag 14, Nachrichten-App offen (54 Chats) | **338** | **7,4 (33)** | 1,0 ms | **2.661** | 0,5 |
| Tag 14, 18 offene Anfragen, Nachrichten-App | **289 bis 376** | **8,2 (41,6)** | 1,3 ms | **2.412 bis 2.783** | 0,96 |
| Tag 14, offene Anfragen, Handy zu | 64 bis 74 | 1,6 bis 2,5 (30) | 0,9 ms | 1.220 | 0,25 |

Bei 10 Neuzeichnen pro Sekunde sind das auf dieser langsamen Maschine 25 bis 80 ms Preact pro Sekunde plus 10 bis 15 ms
Karte, noch ohne Layout und Paint des Browsers. Die Simulation im Browser liegt bei 0,25 bis 0,96 ms pro Schritt
(Dev-Build, UI-Reaktionen auf Ereignisse laufen im Schritt mit), bei 4× also 4 bis 15 ms pro Sekunde.

CPU-Profil, Self-Time der beschäftigten Hauptthread-Zeit (ohne WebGL-Artefakte), über alle Szenen gleich:

- `get offsetWidth` (erzwungenes Layout): **8 bis 9 %** (228 bis 292 ms je 25 s), Quelle `src/ui/phone/DynamicIsland.tsx`
- `formatNumber` in `src/core/format.ts:5` (`toLocaleString`): **2,5 bis 3 %** (73 bis 101 ms)
- `messages.thread` und `threads` (`src/core/messages.ts:153`, `:159`), `chatList` (`src/ui/phone/messagesModel.ts:138`): 1,5 bis 2,5 %
- MapLibre `receive` und `postMessage` (GeoJSON-Worker durch `setData`): 150 bis 190 ms je 25 s
- `getStaff` (`staff/members.ts:48`), `veedelAt` und `inRing` (`veedel/index.ts`), `distanceMeters`: je etwa 0,5 %

Mikro-Benchmarks pro Neuzeichnen (Tag 14, 54 Kontakte, 259 bis 279 Nachrichten): `chatList` 0,3 ms; `hasOpenDeadline`
für alle Chats 0,6 ms; `collectLiveActivities` 0,9 ms, mit 18 Anfragen 1,1 ms (`customers.orders` von 0 auf 0,42 ms,
`core.deadlines` 0,3 ms); `collectAdvice` und `urgentAdvice` 0,35 bis 0,55 ms (`core.answer` 0,3 ms, rechnet `chatList`
noch einmal); `JSON.stringify(state)` fürs Autosave 1,1 bis 1,3 ms alle 10 s (unkritisch). Zusammen etwa 2 bis 2,5 ms reine
Zustands-Lektüre, die 10-mal pro Sekunde identisch neu berechnet wird.

Long Tasks über 50 ms: nur einzelne (171 bis 1.078 ms) beim Laden, bei Dialogen und bei der Speicherbereinigung in
Headless, nicht zuzuordnen (Vermutung: Shader-Kompilierung in SwiftShader oder `importSave`). Browser-Fehler: 0,
Kachel-Fehler: 0.

## Hotspots mit Ursache und Vorschlag

Reihenfolge = empfohlene Arbeitsreihenfolge. „Sim/UI“ gehört in Auftrag 30, Etappe 0; „Karte“ in Auftrag 31, Etappe 0.

1. **Ganzer Baum rendert bei jedem Tick (UI, bestätigt).** `src/ui/shell/App.tsx:21-22` (`setVersion` bei jedem
   `runtime.subscribe`), `src/ui/runtime.ts:300-313` und `:355-365` (`requestRender` nach jedem Frame, 100 ms Drossel),
   `src/ui/hooks.ts:17-25` (Kommentar verbietet `memo`). 64 bis 376 Komponenten je Neuzeichnen, davon `Icon` 25 bis 35 %,
   `ErrorBoundary`, `AppTile`, `ContextMenu` und `Badge` pro Kachel, in der Nachrichten-App `SwipeRow`, `ContextMenu`,
   `Avatar` und `Badge` pro Chat. Vorschlag: Selektor-Hook (`useGameSelector(fn, equals)`) mit eigener Subscription statt
   `setVersion` an der Wurzel; `memo()` für reine Bausteine (`Icon`, `IconChip`, `AppTile`, `SwipeRow`, `Avatar`); HUD,
   Island und Handy getrennt abonnieren und nur neu zeichnen, wenn ihr Auszug sich geändert hat (Uhr nur beim
   Minutenwechsel, Geld nur bei `wallet`). Handy-Seiten unter der obersten stehen schon still (`PageStack.tsx:30-33`),
   dieselbe Idee für HUD-Kacheln und Startbildschirm.
2. **Erzwungenes Layout pro Render (UI, bestätigt).** `src/ui/phone/DynamicIsland.tsx:52-58`: `useLayoutEffect` ohne
   Dependency-Array liest `getComputedStyle` und `offsetWidth`/`offsetHeight` bei jedem Render, 8 bis 9 % der
   Hauptthread-Zeit. Mit Fristen-Countdown ändert sich der Inhalt jede Spielminute und löst zusätzlich den Spring-Morph
   aus. Vorschlag: Dependencies auf einen Inhalts-Schlüssel (`ids`, `expanded`, Titel, Trailing-Text) oder ein
   `ResizeObserver` auf dem Island-Element.
3. **Nachrichten O(Kontakte × Nachrichten) pro Render (UI, bestätigt).** `src/core/messages.ts:153-155` (`thread` filtert
   die ganze Liste), `src/ui/phone/messagesModel.ts:138-141` (`chatList`: `threads()` plus pro Thread noch einmal
   `thread()`), `src/ui/phone/MessagesApp.tsx:83-96` (`chatList`, drei Filter, `hasOpenDeadline` pro Chat, also noch
   einmal `thread` je Chat), `src/ui/builtin/index.ts:121` (Advisor `core.answer`: `chatList`) und `:145`
   (Live-Aktivität `core.deadlines`: `chatList`), `src/ui/phone/PhoneFrame.tsx:212` (`appActions`: `chatList`). Jede
   offene Anfrage erhöht die Arbeit an `awaitingAnswer` und `deadline`. Vorschlag: einen Index pro Zustandsstand bauen
   (ein Durchlauf über `list`, Map Kontakt → letzte Nachricht, ungelesen, offene, früheste Frist) und cachen; da
   `messages.list` in place verändert wird, Cache-Schlüssel aus `state.time`, `list.length`, letzter `id` und `hidden`,
   oder ein `version`-Zähler in `MessagesState` (Kern-Migration). `chatList` einmal pro Render berechnen und an Advisor
   und Island weitergeben.
4. **`formatNumber` und `formatEuro` per `toLocaleString` (UI, bestätigt).** `src/core/format.ts:3-9` erzeugt bei jedem
   Aufruf intern einen `Intl.NumberFormat`; 3 % Self-Time (HUD-Geld mit `CountUp` per rAF, Preise, Lagerzeilen).
   Vorschlag: `Intl.NumberFormat('de-DE', …)` je `digits` einmal anlegen und `format()` nutzen.
5. **Hotspot-Puls zwingt die Karte zum Dauer-Repaint (Karte, bestätigt).** `src/map/hotspots.ts:92-103`:
   `setPaintProperty('heatmap-radius', …)` und `heatmap-intensity` mit 15 Bildern pro Sekunde per rAF, also
   Stil-Neubewertung und voller Karten-Repaint, die Karte wird nie „idle“. Vorschlag: nur `heatmap-intensity` animieren
   (die Radius-Expression ist zoomabhängig und teurer), Rate höchstens 6 pro Sekunde, bei `document.hidden` und Pause
   stoppen; oder Puls per CSS auf einem eigenen Canvas.
6. **Fahrzeuge: zwei GeoJSON-Quellen per `setData` bis 40-mal pro Sekunde (Karte, bestätigt).** `src/map/vehicles.ts:145`
   (`MAX_FPS = 40`), `:311-313`, `:362-363` (`source.setData` und `lights.setData` bei jeder Bewegung; GeoJSON geht per
   Worker, `postMessage` und `receive` 150 bis 190 ms je 25 s). Mehr Lieferungen bedeuten mehr Fahrzeuge, jede Bewegung
   löst `draw` aus. Vorschlag: `MAX_FPS` 20, `setData` nur, wenn sich eine Position mehr als ε bewegt hat, `updateData`
   (GeoJSON-Diff von MapLibre) oder Fahrzeuge als `CustomLayer` statt Worker-Quelle; Lichter nur nachts erzeugen.
7. **Spots-Layer rechnet pro Spot und Render alles neu (Karte, bestätigt).** `src/modules/spots/ui/map.ts:222-247`: je
   Spot `waitingAt` (`customers/index.ts:258`, Filter und Sortierung über alle Wartenden), `seller()` über `getStaff`
   (`staff/members.ts:48-57`, Filter über alle Leute), `spotLook` über `activeEncounters`, `drawHotspots` über
   `spotActivity` mit `spotDemand` und noch einmal `waitingAt`. O(Spots × (Kunden + Personal)) alle 100 ms, 16 bis 35 ms
   je 25 s, wächst mit Spots (26 an Tag 20) und Team (59). Vorschlag: am Anfang von `update` einmal Wartende nach Spot und
   Personal nach Zuordnung gruppieren; bei unverändertem `state.time` sofort zurück.
8. **Nachrichten-Liste als schwere DOM-Struktur (UI, bestätigt).** `src/ui/phone/MessagesApp.tsx:147-160`: `SwipeRow` und
   `ContextMenu` je 702 Renders in 25 s bei 54 Chats, DOM von 1.200 auf 2.700 Knoten. Vorschlag: `ContextMenu` und
   Swipe-Aktionen erst beim Long-Press oder Swipe mounten, Liste auf sichtbare Gruppen begrenzen oder virtualisieren,
   Chat-Zeile memoisieren (Props: Name, Vorschau, ungelesen, Frist).
9. **Startbildschirm, Advisor und Island rechnen pro Render (UI, bestätigt).** `src/ui/phone/PhoneFrame.tsx:339-347`
   (`homeApps` mit allen Badges plus `urgentAdvice` über `collectAdvice`), `src/ui/registry.ts:334-346` und
   `DynamicIsland.tsx:139` (`collectLiveActivities` etwa 1 ms, alle Quellen), `src/ui/shell/NextStep.tsx:12-24`.
   Vorschlag: je `state.time` memoisieren (Modul-Cache `{ time, result }`), Island nur bei geänderten `ids` oder Text neu
   rendern. Vermutung, nicht gemessen: `appActions` (`PhoneFrame.tsx:212`) läuft nur beim Öffnen des Menüs.
10. **Kern und Simulation (klein, optional).** `src/core/sim.ts:281-283` filtert `modules` bei jedem Schritt für
    `checkSolvency` (einmal im Konstruktor berechnen); `sim.ts:254` `queue.shift()` ist O(n) (Index statt `shift`).
    `hierarchy` ist der teuerste Tick (148 µs je 5 Minuten), bleibt aber unkritisch.

Warum es „mit vielen Bestellungen schlimmer“ wird: Jede Anfrage ist eine Nachricht mit `options` und `expiresIn`, also
Banner mit Ton, Chat mit `awaitingAnswer` (Punkte 3, 8, 9), Island-Aktivität mit minütlich wechselndem Countdown (Punkt 2:
Layout und Morph je Spielminute), Advisor „Antworten“ (Punkt 9); angenommene Lieferungen sind Fahrzeuge (Punkt 6) und
Ziel-Marker. Die Simulation selbst wächst dabei praktisch nicht (0,96 ms pro Schritt in der Anfragen-Szene gegen 0,5 davor
liegt im Rauschen der UI-Reaktionen; in Node bleibt es bei etwa 0,1 ms).

## Messung wiederholen

1. **Simulation:** `npm run perf:sim` (Vitest `src/playtest/perf.bench.test.ts`, nur mit `PERF=1`). Umgebung: `PERF_DAYS`
   (Standard 20), `PERF_SEED` (11), `PERF_SAVE=/tmp/perf-save.json` schreibt den Endstand als Spielstand.
2. **Browser:** `npm run perf:browser -- --save=/tmp/perf-save.json --seconds=25 --speed=4` (ohne `--save` wird ein
   frisches Spiel um `--days` Spieltage vorgespult). Das Skript misst Preact synchron, `GameMap.update` je Layer,
   Simulationsschritte, Long Tasks, DOM, CPU-Profil (CDP `Profiler`) und Mikro-Benchmarks; dann erzeugt es 20 Anfragen
   über `offerDelivery` und `offerWholesale` (umgeht `MAX_OPEN_ORDERS`) und misst Nachrichten-App offen, Chat offen und
   Handy zu. Headless mit SwiftShader liefert nur 2 bis 5 Bilder pro Sekunde; für echte fps und Long Tasks auf einem
   Rechner mit GPU `--gpu` anhängen (Fenster mit echter Grafik) oder im Spiel `?perf=1` nutzen.
   **Karte (seit Auftrag 31):** `--scenes=karte` misst den Normalbetrieb auf der Karte (zehn offene Aufträge, eine
   Lieferung, Zoom 14,5) über die Messhilfe `?perf=1` (`src/map/perf.ts`): Bild-Arbeit der Animationen, Layer-Updates,
   `setData` pro Quelle, Anzahl der Fahrzeuge. `--hour=8` spult in den Berufsverkehr vor, `--width=1440 --height=900`
   für den Desktop (unter 760 px gilt die Handy-Zahl an Fahrzeugen), `--mobile --throttle=4` für das Handy mit 4× CPU-
   Drossel, dazu `--reduced-motion` und `--traffic=off`. Budget und Messwerte: `src/map/README.md`, Abschnitt
   „Performance-Budget“, und der PR zu Auftrag 31.
3. **Vorher und nachher** immer mit gleichem Seed, gleicher Dauer und gleichem Fenster vergleichen; die Zahlen gehören in den
   PR-Text des jeweiligen Auftrags.

## Ergebnis nach Auftrag 30, Etappe 0

Gleiche Skripte, gleicher Seed, gleicher Spielstand (`PERF_SAVE` aus `npm run perf:sim`, Tag 20), Vergleich abwechselnd
gegen einen Checkout von `main` auf derselben Maschine. Das Skript `perf-browser.mjs` schließt jetzt während der Messung
Dialoge, die das Spiel anhalten (Konfrontation, Übernahme), hält die erzeugten Anfragen über alle Szenen offen, gibt am
Ende eine Zusammenfassung aus und ordnet jeden Long Task den Funktionen zu, die in seinem Zeitfenster liefen.

**Browser (Tempo 4×, 700 × 500, je 25 s):**

| Szene | Preact pro Neuzeichnen vorher → nachher | Komponenten pro Neuzeichnen | Simulation ms/Schritt |
| --- | --- | --- | --- |
| Handy Startbildschirm | 3,7 → 1,5 ms | 65 → 38 | 0,79 → 0,59 |
| Nachrichten-App offen (68 Chats) | 4,3 → 1,6 ms | 218 → 55 | 0,54 → 0,38 |
| 20 offene Anfragen, Nachrichten-App | 5,1 → 1,9 ms | 263 → 77 | 0,49 → 0,32 |
| 20 offene Anfragen, Chat mit Frist | 3,0 → 1,5 ms | 84 → 49 | 0,43 → 0,28 |
| 20 offene Anfragen, Handy zu | 2,3 → 1,0 ms | 64 → 38 | 0,32 → 0,25 |

`get offsetWidth` (Dynamic Island) fiel von 9 bis 12 % auf unter 2 % der beschäftigten Zeit, `formatNumber` aus der
Liste der teuersten Funktionen. Die verbliebenen Long Tasks (einzelne mit 100 bis 600 ms, vorher wie nachher) liegen in
`getUniformBlockIndex` und `getProgramParameter`: Shader-Kompilierung von MapLibre in SwiftShader (Headless ohne GPU),
also Karte, nicht Oberfläche oder Simulation (Auftrag 31). In den Szenen mit offenen Anfragen und geöffnetem Handy
gab es keine Long Tasks.

**Simulation (`npm run perf:sim`, Bot, Seed 11, 20 Tage, je dreimal abwechselnd gemessen):** 114 bis 123 ms pro Spieltag
vorher, 86 bis 92 nachher (etwa −25 %), bei identischem Spielverlauf (gleiche Zahl an Bot-Befehlen, alle Tests gleich).
Die Hälfte ist das nicht: Was bleibt, ist echte Arbeit, verteilt über viele Stellen (A*-Routen beim Annehmen von
Aufträgen, Bestellregeln der Leutnants, Kunden am Spot, Bot selbst etwa 20 %, dazu Speicherbereinigung und die
Modul-Bindungen des Test-Runners). Ein weiterer Schritt wäre ein Index der Leute nach Einsatzort im Modul `staff`;
er braucht eine Versionszählung aller Änderungen an Einsätzen und lohnt sich erst mit deutlich mehr Leuten.

Was geändert wurde:

- **Simulation:** `formatNumber`/`formatEuro` mit einem `Intl.NumberFormat` je Nachkommastellen; `getSpots` gemerkt
  pro Zustand, `getSpot` und `isSpotActive` über eine Tabelle der vorgegebenen Spots; `veedelAt` merkt sich Punkte;
  Leutnant-Tick rechnet seine Spots nur, wenn er sie braucht (Einkauf braucht sie nicht, Verkauf nur, wenn jemand
  wartet), Hauptlager und Budget erst, wenn eine Regel wirklich bestellt; Pleite-Prüfung bricht beim ersten Posten ab;
  Liste der tickenden Module einmal bestimmt; erledigte Hafen-Fragen und abgelaufene Fristen nur prüfen, wenn sich etwas
  geändert hat. Nachrichten haben einen Index nach Kontakt (`thread`, `threads`, `unreadCount`, `hasOpenDeadline` ohne
  Kontakte × Nachrichten).
- **Oberfläche:** `chatList`, `collectLiveActivities` und `collectAdvice` werden einmal pro Spielstand gerechnet
  (`src/ui/stateMemo.ts`, Revision der `UiRuntime`); Chat-Zeilen sind memoisiert (`ChatRow`), ebenso `Icon`,
  `IconChip`, `Badge`, `Avatar`, `Tag` und `Chip`; die Dynamic Island misst ihre Größe nur, wenn sich ihr Inhalt ändert;
  Kontextmenüs der App-Kacheln rechnen ihre Aktionen erst beim Öffnen.
- **Leitplanke:** `src/playtest/perf.bench.test.ts` schlägt fehl, wenn ein Spieltag mehr als doppelt so lange dauert wie
  der Richtwert (90 ms).
