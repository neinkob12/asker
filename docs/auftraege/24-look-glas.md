# Auftrag 24 – Look „Glas“ für Karte, HUD und Ereignisse

Prompt für eine eigene Claude-Code-Session auf `neinkob12/asker`. Erst starten, wenn Auftrag 22 (Handy wie iOS) in `main` ist.

```
Setze den Auftrag in docs/auftraege/24-look-glas.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, docs/handy-design.md (inkl. Abschnitt 7),
src/ui/README.md, src/map/README.md und docs/auftraege/README.md.
```

---

## Rahmen

- **Vorbedingung:** Auftrag 22 ist in `main` (`src/ui/phone/navModel.ts`, `spring.ts`, Bausteine `Sheet`, `ActionSheet`, `Stepper`, `ContextMenu`, `SwipeRow`). Fehlt das: aufhören und Bescheid sagen.
- **Ziel:** Gestaltungsrichtung **A „Glas“** aus Auftrag 22 („A Glas, B Lagebild, C Noir, D Kontor“) wird umgesetzt, für alles **außerhalb des Handys**. Dazu gehören Karte, HUD, Kartensteuerung, Spot-Marker, Gang-Hauptquartiere, Orte, Fahrzeuge, Effekte und Dialoge über der Karte (Konfrontation, Razzia, Lieferung, Veedel übernommen).
- **Das Handy aus Auftrag 22 bleibt, wie es ist.** Nur die Anbindung kommt dazu (Abschnitt 8). Bausteine aus Auftrag 22 nur erweitern, nie umbauen.
- Regeln aus `CLAUDE.md` gelten:
  - Ordnerregeln, UI liest Zustand und schickt Befehle.
  - Code Englisch; Kommentare, UI-Texte und Commits Deutsch.
  - Determinismus, Migrationen bei neuer Zustandsform, keine neuen npm-Pakete.
- Farben nur über Tokens. Neue Werte als Tokens in `src/ui/styles/tokens.css` (Kontrast-Test erweitern), auf der Karte über `mapToken()`.
- **Arbeite in Etappen** (Reihenfolge = Abschnitte). Nach jeder Etappe: `npm run check`, Screenshots ansehen, Commit, Push. Draft-PR nach Etappe 1.

## 1. Tokens und Schrift

- Neue Schrift für Spielzahlen und Titel über der Karte: **Barlow** (Text) und **Barlow Condensed** (Zahlen, Titel). Per Google Fonts in `index.html`, Tokens `--font-hud` und `--font-hud-display`. Das Handy behält SF/Inter.
- **Glas über der Karte** (neue Tokens):
  - `--hud-glass: rgba(18,20,24,0.66)`
  - `--hud-glass-strong: rgba(22,24,29,0.86)`
  - `--hud-glass-edge: rgba(255,255,255,0.09)`
  - `--hud-blur: blur(22px) saturate(160%)`
  - `--hud-radius: 20px`, Kacheln `16px`, Knöpfe `14px`
  - Schatten `0 12px 30px rgba(0,0,0,0.45)`
  - Bei weniger Transparenz bzw. mehr Kontrast deckend (`#16181d`).
- **Beschriftung:** 11 px, 700, Großbuchstaben, Laufweite 0.1em, in der Bedeutungsfarbe (Schwarzgeld `--cat-dirty`, Sauber `--cat-money`, Lager `--cat-goods`, Ruf `--cat-brand`, Köln `--cat-place`).
- **Spot-Zustände** (neue Tokens `--spot-idle/-waiting/-urgent/-raid`):
  - idle `rgba(24,26,31,0.92)`, Schrift weiß
  - waiting `#ff9f0a`, Schrift `#1a1004`
  - urgent `#ff453a`, Schrift weiß
  - raid `#2f7bff`, Schrift weiß
  - Lichtkegel je Zustand: `rgba(255,255,255,0.10)`, `rgba(255,159,10,0.45)`, `rgba(255,69,58,0.55)`, `rgba(47,123,255,0.55)`
- **Karte:** Nachts hat das Leuchten der Hauptstraßen etwas weniger Deckkraft (Palette `night.glow` ≈ 0.6). Land wird dunkler `#121519`, Gebäude `#1b1f25 / #21262d / #282d35 / #30363f`. Tag bleibt.
- Über die Kartenfläche (nicht unter das Handy) eine leichte Vignette: `radial-gradient(ellipse 60% 70% at 36% 50%, transparent 40%, rgba(0,0,0,0.55))`.

## 2. HUD (`src/ui/shell/Hud.tsx`, `shell.css`, `builtin/CoreHud.tsx`, `police/ui`)

Mittlere Dichte, drei Gruppen. Alle in der freien Kartenfläche links vom angedockten Handy (`--map-right` bleibt die Grenze).

- **Oben links, Geld-Kapsel:** Kachel 40 px (Verlauf `--cat-dirty-a/-b`, Beutel-Icon). Darüber „Schwarzgeld“, Wert in Barlow Condensed 32/600 mit `CountUp`. Haarlinie, dann „Sauber“ mit Wert 20 px. Darunter eine Heat-Pille: „Heat“, **5 Flammen-Icons** (gefüllt grün/orange/rot nach Stufe, sonst `rgba(255,255,255,0.16)`) und das Stufenwort.
- **Oben Mitte, Uhr-Kapsel:** „Sa · Tag 9“ (11 px Caps) über der Uhrzeit (Barlow Condensed 28), daneben Wetter-Icon (`--cat-sky`) mit Temperatur. Daneben das Tempo als Segmente mit 40 × 36 px und Radius 11 (Pause gold, aktiv `rgba(255,255,255,0.2)`). Menü wandert in die Kartensteuerung oder bleibt rechts daneben.
- **Oben rechts (vor dem Handy):** drei Kacheln **Lager**, **Ruf** und **Köln x/7** mit 7 Segmenten (12 × 8 px, gold gefüllt). Das sind die bisherigen `placement: 'more'`-Kennzahlen. Sie stehen zusätzlich weiter auf dem Startbildschirm des Handys.
- **Keine Meldungsliste über der Karte** (ausdrücklicher Wunsch). Toasts unten links entfallen am Desktop. Meldungen laufen über Banner und Island des Handys und die App Meldungen. `ui.toast` bleibt als API und landet dort.
- **Kartensteuerung unten rechts vor dem Handy:** zwei Glas-Gruppen mit 44 px Knöpfen und Radius 16. Erste Gruppe Zoom +/−/Norden, zweite 3D (gold) / Ebenen (Kontrolle/Heat) / Köln.

## 3. Spot-Marker (`src/modules/spots/ui/map.ts`, `spots.css`)

Statt der Quadrate ein **Achteck-Schild an einem Mast** (wie ein Straßenschild):

- **Fußpunkt** am Spot: Punkt 6 px in Zustandsfarbe mit dunklem Ring, darüber ein **Lichtkegel** (Ellipse 60 × 22 px, Zustandsfarbe, weich).
- **Mast:** 2 × 20 px, Verlauf von der Zustandsfarbe nach transparent.
- **Achteck:** 36 × 36 px, `clip-path: polygon(29.3% 0,70.7% 0,100% 29.3%,100% 70.7%,70.7% 100%,29.3% 100%,0 70.7%,0 29.3%)`.
  - Außen `rgba(255,255,255,0.75)` als Rand, innen 32 px in der Zustandsfarbe.
  - Darin die Zahl der Wartenden in Barlow Condensed 19/700.
  - Schatten `drop-shadow(0 4px 8px rgba(0,0,0,0.7))`.
  - Bei urgent und raid ein pulsierender Ring (aus bei weniger Bewegung).
- **Plakette** neben dem Schild, je Spot links oder rechts, damit sich in der Innenstadt nichts überdeckt. Seite und Versatz als Daten in `spots/config.ts` (`labelSide`, `labelOffsetY`).
  - Glas `rgba(15,17,21,0.86)`, Radius 8, Kante links 3 px in der Zustandsfarbe.
  - Zeile 1: Name (13/700) und ein Personal-Etikett: grün mit Läufer-Icon und Vorname, gold „du“ (`playerSpot`) oder gestrichelt „frei“.
  - Zeile 2: **6 Striche** (9 × 4 px) für wartende Kunden, gefüllt in der Zustandsfarbe.
- **Gesperrte Spots:** Achteck 20 px, dunkel `#15171b`, Rand `rgba(255,255,255,0.22)`, Schloss-Icon. Ohne Plakette, Name nur beim Überfahren.
- Eigene Spots behalten ihr Erkennungszeichen (gestrichelte Kante am Achteck).
- **Hover-Karte** (nur Maus): Glas 230 px, Radius 16, über dem Schild. Inhalt: Name (Barlow Condensed 20 Caps), Veedel · Status, dann Wartend / Verkauft von / Preis, Fußzeile „Klick: im Handy öffnen ›“ in Gold.
- **Klick** öffnet wie bisher `ui.openPanel('spots.spot')` im Handy (Push im Stapel aus Auftrag 22).
- **Hotspots** (Heatmap-Blobs) werden leiser oder entfallen zugunsten des Lichtkegels. Entscheide nach Screenshot und begründe es.
- **Geld-Popups** (`mapEffects.money`) werden zur grünen Pille `rgba(48,209,88,0.95)` mit dunkler Schrift (Barlow Condensed 17/700), steigen ca. 40 px und verblassen.

## 4. Weitere Marker auf der Karte

- **Gang-Hauptquartier:** Kachel 32 px, Radius 10, in Gang-Farbe, weißes Icon (`anchor`, `web`, `flame`, `crown` statt Emoji), Glow `0 0 26px <Gangfarbe>`. Name darunter in Barlow Condensed 13 Caps mit Textschatten.
- **Lager / Hafen:** runde 28 px Kachel mit Verlauf (Lager `--cat-place`, Hafen `--cat-goods`), darunter eine Glas-Pille mit Name und bei Lagern dem Bestand („Lager Ehrenfeld · 640 g“). Beschriftungen dürfen sich nicht überlappen (heute: Lager Ehrenfeld gegen Niehler Hafen).
- **Fahrzeuge** (`createVehicle` bleibt 3D). Dazu ein Glas-Label „Kemal · 500 g“ bzw. „500 g Haze · 62 %“. Strecke gestrichelt (Schiff `--cat-goods`, Lkw Gold), solange eine Fahrt läuft.

## 5. Konfrontation (`src/modules/encounters/ui/*`)

Der Dialog überdeckt **nur die Kartenfläche**, nicht das Handy. Am Handy-Bildschirm wird er zum `Sheet` mit großer Rasterhöhe und gleichem Inhalt.

- **Hintergrund:** `radial-gradient(ellipse at 50% 45%, rgba(90,20,16,0.35), rgba(4,5,7,0.88) 72%)` mit `backdrop-filter: blur(4px) saturate(0.7)`, dazu ein Rasterpunkt-Korn bei 5 % Deckkraft.
- **Akte** (leichter Noir-Anteil):
  - Äußerer Rahmen: Radius 26, Füllung `rgba(201,178,133,0.16)`, Kante `rgba(201,178,133,0.35)`, Blur 22.
  - Oben ein beiger Reiter (Courier Prime 13/700 Caps): „Akte 0912 · Neumarkt · Runde 1 von 5“.
  - Innenfläche: `rgba(20,22,27,0.94)`, Radius 18, Schrift `#f1ece2`.
- **Kopf:**
  - Kicker in Courier Prime rot (`#ff7b73`): „Konfrontation · Einsatz 1.240 € und 85 g“.
  - Titel Barlow Condensed 56 Caps, Lage (`situation`) in Barlow 17.
  - Rechts zwei **Polaroids**: Spieler bzw. Mitarbeiter mit Werten, Gegner mit Kampfkraft. Porträt als Platzhalter, später KI-Bilder. Dazwischen ein „VS“-Stempel.
- **Kräftebalken:**
  - 10 px hoch, Radius 5, Verlauf blau `#075fb7→#2287ed` gegen rot `#ea5249→#b53129`.
  - Darüber links „Deine Seite x %“, mittig `edgeText` in DM Serif kursiv, rechts der Gegner.
  - Darunter „Du bist vor Ort“ bzw. „Du gibst Anweisungen per Handy“.
- **Briefing: „Wie gehst du vor?“** (DM Serif kursiv 24) mit **sechs Wegen** als Karten im 3er-Raster.
  - Karten: Radius 14, Kante oben 4 px in der Farbe des Etiketts, Fläche `rgba(255,255,255,0.05)`.
  - Inhalt: Icon, Etikett rechts oben, Titel in DM Serif 22, Text in Courier 12.
  - Die sechs Wege:
    1. **Selbst hin**: Etikett „Tod möglich“ (rot). Bestehend: `present: true`.
    2. **Leute machen lassen**: „Sicher“ (grün). Bestehend: `present: false`.
    3. **Verstärkung schicken**: „−300 €“ (violett). Weitere freie Leute fahren hin, Start-`edge` höher.
    4. **Sofort freikaufen**: „−600 €“. Endet sofort mit Erfolg, Beziehung zur Gang sinkt.
    5. **Anonym die Bullen rufen**: „+ Heat“ (blau). Endet mit Rückzug, Heat im Veedel steigt, etwas Ware geht verloren.
    6. **Ware retten, Spot räumen**: „Ware weg“ (orange). Rückzug, Ware bleibt, die Kasse geht verloren.
  - Die Wege 3–6 sind **neue Spielmechanik**:
    - `encounters.join` um `mode: 'self' | 'crew' | 'backup' | 'payoff' | 'tipoff' | 'abandon'` erweitern. Die alte Form `{ present }` weiter annehmen.
    - Werte in `encounters/config.ts`.
    - Welche Wege ein Anlass anbietet, als Daten in `kinds.ts` (`briefingOptions`). Nicht jeder Anlass hat alle; Polizeiflucht z.B. ohne „Bullen rufen“.
    - Tests und ein Balancing-Lauf vorher/nachher (`npm run balance`).
- **Runden:**
  - Handlungen als Karten im 3er-Raster: Label in DM Serif 22, Chance in Barlow Condensed 26, gefärbt grün ≥ 60 %, orange, rot < 35 %.
  - Darunter ein 4 px Balken und der Hinweis in Courier. Bei Bestechen „Kostet x €“ violett.
  - **Mehr Auswahl aus der Ferne:** `remoteActions` von `raidDefense` auf `fight`, `hold`, `negotiate`, `bribe`, `flee` erweitern. Balancing prüfen.
- **Ergebnis:**
  - Stempel mit Doppelrand (50 px Caps, −8°) in Erfolg grün / Rückzug orange / verloren rot.
  - Daneben der Ergebnistext in DM Serif 22, Knopf „Akte schließen“ in Gold.
  - Verlauf darunter in Courier: „Runde n, Handlung (Chance) ✓/✗ Text“.
- Schriften DM Serif Display und Courier Prime **nur** in diesem Dialog.

## 6. Razzia, Lieferung, Veedel übernommen

- **Razzia** (`police.raid` gegen dich):
  - Oben mittig ein Banner: dunkelrotes Glas `rgba(120,16,20,0.78)`, Kante `rgba(255,123,115,0.5)`, Sirenen-Kachel, Titel „Razzia · Neustadt-Süd“ (Barlow Condensed 26 Caps), eine Zeile Lage.
  - Am Rand der Kartenfläche pulsiert ein Schein blau/rot (aus bei weniger Bewegung). `mapEffects.blueLight` bleibt, das Veedel wird rot getönt.
  - Danach eine **Bilanz-Karte** (Glas, Radius 26, Titel „Das hat gekostet“): Ware beschlagnahmt, Schwarzgeld weg, wer in Haft ist (mit Kaution), Heat im Veedel.
  - Knöpfe: „Anwalt schicken · Kaution“ (Gold, vorhandener Befehl aus `staff` für Anwalt bzw. Kaution) und „Später“.
- **Lieferung live:**
  - Unten links in der Kartenfläche eine Tracking-Karte (Glas, 420 px), solange eine Schiffslieferung, Ware am Kai oder eine Abholung läuft.
  - Inhalt: Ware · Lieferant, Status als Zeile (Schiff auf dem Rhein · %, am Kai · Zoll in x Std., Fahrer fährt ins Lager · %).
  - Darunter ein zweiteiliger Fortschritt Rhein → Kai → Lager. Am Kai der Gold-Knopf „Fahrer schicken“ (`logistics.pickup`).
  - Die Island-Aktivität bleibt; die Karte ist die Ansicht am Desktop.
- **Veedel übernommen** (Ereignis, wenn du ein Veedel übernimmst; Namen in `territory` prüfen):
  - Das Veedel färbt sich animiert gold.
  - Über die Kartenfläche ein goldener Schein mit „Veedel übernommen“ (13 Caps), dem Veedel-Namen (Barlow Condensed 92, `#f2c766`, Glow) und einer Zeile Text.
  - Darunter eine Glas-Leiste mit dem Köln-Fortschritt (7 Segmente), Ruf und Reaktion der Gang, Knopf „Weiter“.
  - Pausiert kurz (wie Dialoge mit `pausesGame`).

## 7. Tag und Nacht

Alles oben funktioniert in allen vier Tageszeiten. Glas und Marker bleiben dunkel; die Karte folgt `look.ts`. Screenshots von Tag und Nacht für jeden Moment.

## 8. Anbindung an das Handy aus Auftrag 22

- **Desktop:**
  - HUD, Steuerung, Overlays und Tracking-Karte halten sich an `--map-right` und folgen dem Ein- und Ausklappen des Handys mit derselben Feder.
  - Dialoge über der Karte überdecken das Handy nicht. Das Handy bleibt bedienbar, außer bei Konfrontationen, die das Spiel pausieren (dann abgedunkelt und `inert`).
- **Klicks** auf Spot, Veedel, Gang, Lager und Hafen öffnen die passende Seite im Handy als Push (`openPanel`, `openPhone`). Der Zurück-Titel stimmt.
- **Meldungen:** Was bisher als Toast über der Karte kam, erscheint als Banner im Handy (bzw. oben rechts, wenn es weggelegt ist) und in der App Meldungen.
- **Island:** Live-Aktivitäten für Razzia, Konfrontation, Lieferung und Übernahme bleiben die Quelle; die Karte zeigt dieselben Daten.
- **Handy-Bildschirm** (≤ 760 px):
  - Oben nur Geld-Kapsel und Uhr kompakt, der Rest steht im Handy.
  - Spots ohne Plakette (nur Achteck und Striche), Tippen öffnet direkt die Spot-Seite.
  - Konfrontation, Bilanz und Übernahme als `Sheet`.
  - Nichts verdeckt die echte Statusleiste oder den Home-Balken.

## Nicht in diesem Auftrag

- Umbau des Handys oder seiner Bausteine
- Richtungen B, C und D
- KI-Porträts (nur Platzhalter in den Polaroids)
- neue Anlässe für Konfrontationen

## Prüfen

- `npm run check`, `npm run build`, `npm run e2e` grün.
- Kontrast-Test für neue Tokens: Text auf Glas 4.5:1, Zahl auf jeder Spot-Farbe 4.5:1.
- `npm run screenshot` mit neuen Szenen: Normalbetrieb Tag und Nacht, Spot-Hover, Konfrontation (Briefing, Runde, Ergebnis), Razzia (Alarm, Bilanz), Lieferung (See, Kai, Lkw), Veedel übernommen. Desktop mit offenem und weggelegtem Handy, dazu Handy-Bildschirm. Selbst ansehen.
- `npm run audit:phone` ohne Verstöße.
- `prefers-reduced-motion`: keine Pulse, kein Sirenenschein, Übergänge kurz.
- Keine überlappenden Beschriftungen in der Innenstadt (Rudolfplatz, Neumarkt, Zülpicher, Friesenplatz) bei Standard-Zoom.

## Fertig, wenn

Alle Abschnitte laufen, Tests und Balancing (vorher/nachher) stehen im PR. `src/ui/README.md` und `src/map/README.md` beschreiben den neuen Look und die Tokens. `docs/handy-design.md` hat einen kurzen Abschnitt „Über der Karte: Look Glas“. Die PR-Beschreibung hat „Was ist neu“, „Wie testen“, „Für die Integration“.
