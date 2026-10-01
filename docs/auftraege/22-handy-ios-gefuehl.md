# Auftrag 22 – Das Spiel-Handy fühlt sich an wie iOS

Prompt für eine eigene Claude-Session (Opus 5.5). Entweder diese Datei committen und die Session so starten:

```
Setze den Auftrag in docs/auftraege/22-handy-ios-gefuehl.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/handy-design.md, src/ui/README.md und docs/auftraege/README.md.
```

oder den ganzen Text ab „Rahmen“ direkt als Prompt einfügen.

## Rahmen

- **Allein-Auftrag:** Während er läuft, baut niemand sonst am Handy (`src/ui/phone/`, `src/ui/shell/phone*.css`).
- **Deine Ordner:** `src/ui/` (vor allem `phone/`, `shell/`, `components/`, `styles/`), `scripts/phone-*.mjs` und die
  `ui/`-Ordner der Module, deren Handy-Seiten du umbaust. Simulation, Befehle, Ereignisse und Spielstände bleiben
  unverändert (die Navigation ist `UiState`, nicht Spielstand).
- **Nicht dein Thema:** Karte, HUD, Kartensteuerung und Dialoge außerhalb des Handys. Dafür gibt es eigene
  Gestaltungsrichtungen (A Glas, B Lagebild, C Noir, D Kontor), die später entschieden werden.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/handy-design.md` (warum das Handy heute so aussieht, mit
  HIG-Ableitungen), `src/ui/README.md` (Tokens, Bausteine, Registries), `src/ui/phone/PhoneFrame.tsx`,
  `src/ui/phone/PhoneScreen.tsx`, `src/ui/runtime.ts` (`UiState`, `api.openPhone`, `openPanel`, `selectTab`,
  `openSection`). Ist in deiner Session der Skill `apple-design` verfügbar, nutze ihn wie in `docs/handy-design.md`.
- **Regeln aus `CLAUDE.md` gelten:** Ordnerregeln, UI liest Zustand und schickt nur Befehle, Code-Bezeichner Englisch,
  Kommentare, UI-Texte, Commits und PR Deutsch. `performance.now()` und `requestAnimationFrame` nur in `src/ui`, nie in
  der Simulation.
- **Keine neuen npm-Pakete.** Federn und Gesten sind zusammen wenige hundert Zeilen; selbst bauen und testen.
- **Keine Apple-Assets:** kein Apple-Logo, keine SF-Symbols-Dateien, keine Apple-Hintergründe oder -Töne. Schrift nur
  über den System-Stack (`-apple-system`, sonst Inter), Icons aus `src/ui/components/icons.ts`. Es soll sich wie iOS
  *anfühlen*, nicht iOS kopieren.

## Ziel

Wer ein iPhone kennt, soll das Spiel-Handy ohne Nachdenken bedienen: Es **reagiert** wie iOS (Gesten, Federn,
Übergänge, Haptik), nicht nur sieht so aus. Der Look bleibt: Nachtschicht, Kölsch-Gold für die Hauptaktion,
Bedeutungsfarben, Skyline auf dem Startbildschirm. Desktop (Maus, Trackpad, Tastatur) und Handy-Bildschirm (Touch)
sind gleichwertig.

## Ausgangslage

Gut und bleibt: Statusleiste in drei Spalten, Dynamic Island mit Live-Aktivitäten, Large Title, der beim Scrollen in
die Leiste wandert, gruppierte Listen, Dock nur auf dem Startbildschirm, Segmente, iOS-Schalter, Banner, Hell und
Dunkel in den Tokens, Kontrast-Tests und `npm run audit:phone`.

Was heute fehlt (selbst nachprüfen, bevor du baust):

1. **Keine Gesten.** In `src/ui/phone/` gibt es keinen einzigen Pointer- oder Touch-Handler. Kein Wischen vom Rand
   zurück, kein Hochwischen am Home-Balken, kein Herunterziehen von Blättern oder Bannern.
2. **Keine Navigation als Stapel.** `UiState.phone` kennt nur `app`, dazu je ein `ui.panel` und `ui.section`. Es gibt
   keine Richtung (vor/zurück), der Zurück-Knopf heißt „Zurück“ statt Titel der Vorseite, und jede Seite wird über
   `key={screenKey}` neu montiert: nur Einblenden (`screen-in`), kein Ausblenden, Scrollposition geht verloren.
3. **Bewegung nur über CSS-Kurven** (`--ease-ios`, 100–320 ms). Keine Federn, kein Öffnen einer App aus ihrer Kachel und
   kein Zurückschrumpfen, keine Übernahme der Geschwindigkeit aus einer Geste.
4. **Fehlende iOS-Muster:** Blatt mit Rasterhöhen und Griff, Kontextmenü bei langem Druck, Wisch-Aktionen in Zeilen,
   Mitteilungszentrale, Stepper, Suchfeld unter dem Large Title, Aktionsblatt zum Bestätigen.
5. **Nicht umgebaute Seiten** (`docs/handy-design.md`, Abschnitt 6.5): Geschäft-Abschnitte, Spot, Veedel, Markt, Gangs,
   Aufträge. Sichtbar heute: Spot „Hier hinstellen“ ist abgeschnitten, der Preis sind zwei lose Kästen statt eines
   Steppers, „Anheuern (650 €)“ hängt frei unter der Liste, Karten liegen in Karten. Gangs: Kennzahlen als
   KeyValue-Raster, der Revier-Wert bricht um, der Schließen-Knopf liegt über dem Inhalt.
6. **Doppelte Hardware am echten Handy:** Auf dem Handy-Bildschirm (390 × 844) zeichnet das Spiel ein zweites Gerät mit
   eigener Statusleiste (Uhrzeit, Empfang, Akku) und Kamera-Island in den echten Bildschirm.

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge. Nach jedem Schritt `npm run check` und Screenshots ansehen, dann erst weiter.

### 1. Navigation als Stapel

- `UiState.phone.stack`: Einträge `{ kind: 'home' | 'app' | 'tab' | 'section' | 'panel', id, params?, title }`.
  Reine Funktionen in `src/ui/phone/navModel.ts` (`push`, `pop`, `replace`, `popToRoot`, `top`), getestet wie
  `islandModel.ts`.
- Die bestehende API bleibt und wird auf den Stapel abgebildet: `openPhone(appId, params)` (Wurzel einer App),
  `selectTab`, `openSection`, `openPanel` (push), `closePanel` (pop). Kein Modul muss angefasst werden, damit es weiter
  funktioniert.
- Der Zurück-Knopf trägt den Titel der Vorseite (kurz, sonst „Zurück“). Seiten im Stapel bleiben montiert (höchstens
  zwei unter der sichtbaren), damit Scrollposition und Eingaben beim Zurückgehen erhalten bleiben.
- Esc, Home-Balken, „T“ und die Buchstaben-Kürzel funktionieren wie bisher.

### 2. Federn

- `src/ui/phone/spring.ts`: gedämpfte Feder mit `response` und `dampingFraction` (wie SwiftUI), übernimmt eine
  Startgeschwindigkeit, liefert Werte pro Frame. Tests: erreicht das Ziel, schießt bei Dämpfung 1 nicht über, ist
  unterbrechbar (neues Ziel mitten in der Bewegung ohne Sprung).
- Startwerte (nach Gefühl justieren und im Code begründen): Push/Pop `response 0.35, damping 0.86`, App öffnen und
  schließen `0.45 / 0.8`, Blätter `0.4 / 0.85`, Island `0.3 / 0.7`.
- Nur `transform` und `opacity` animieren, `will-change` nur während der Bewegung.

### 3. Übergänge

- **App öffnen:** von der Kachel (Position aus dem DOM) auf Vollbild, Ecken vom Kachel-Radius auf den Bildschirmradius,
  Startbildschirm dahinter leicht verkleinert (≈ 0,94) und abgedunkelt. **Schließen:** zurück auf die Kachel; ist sie
  nicht sichtbar, in die Mitte schrumpfen.
- **Push/Pop:** neue Seite von rechts, die alte wandert auf −30 % und wird abgedunkelt; der Large Title wandert in die
  Leiste.
- **Blätter:** von unten mit Feder; bei der großen Rasterhöhe rückt die Seite dahinter wie bei iOS nach hinten
  (verkleinert, oben gerundet).
- **Kachel und Zeile drücken:** Rückmeldung beim Drücken (nicht erst beim Loslassen), Kachel ≈ 0,96.
- **Island:** Wechsel kompakt ↔ aufgeklappt als *eine* Form (Breite, Höhe, Radius per Feder), Inhalt blendet versetzt ein.
- **Weniger Bewegung** (`prefers-reduced-motion`): alles wird zu kurzem Überblenden, kein Zoom, keine Parallaxe.

### 4. Gesten (Pointer Events: Maus, Trackpad und Touch gleich)

- **Rand-Wischen zurück:** Start höchstens 24 px vom linken Rand. Die Seite folgt dem Finger, die Vorseite parallax
  darunter. Loslassen nach mehr als der Hälfte oder schnell (> 0,5 px/ms) = Pop mit Restgeschwindigkeit, sonst
  zurückfedern. Jederzeit abbrechbar.
- **Home-Balken hochwischen:** zur Startseite (App schrumpft auf ihre Kachel); auf der Startseite = Handy weglegen.
- **Blatt am Griff ziehen:** zwischen mittel und groß wechseln, nach unten schließen.
- **Banner:** hochwischen = weg, herunterziehen = Mitteilungszentrale (Liste aus `ui.notifications`).
- **Langer Druck** (≈ 500 ms) auf App-Kachel, Chat, Person, Spot-Zeile = Kontextmenü: Glas, Vorschau oben, Aktionen
  darunter, Hintergrund weichgezeichnet. Am Desktop zusätzlich Rechtsklick.
- **Wisch-Aktionen in Zeilen** nur dort, wo es schon einen Befehl gibt (z. B. Chat als gelesen markieren). Gefährliches
  (Entlassen) nie per Wisch allein auslösen, sondern über das Aktionsblatt bestätigen.
- Gesten sind Abkürzungen: Alles bleibt per Knopf und Tastatur erreichbar. Pointer-Capture nur innerhalb des Handys,
  die Karte darf nicht mitziehen oder zoomen. `overscroll-behavior: contain` bleibt.

### 5. Haptik und Ton

- `haptic(kind)` in `src/ui` mit `selection`, `light`, `medium`, `success`, `warning`, `error`: kurze
  `navigator.vibrate`-Muster, wo der Browser das kann, dazu leise Klicks aus `src/audio` (Schalter, Segment, Rasten
  eines Blatts, langer Druck). Folgt der vorhandenen Einstellung „Vibrieren“. Nicht beim Scrollen.
- iOS Safari kann `navigator.vibrate` nicht. Dort bleibt es beim Ton; keine Umwege bauen.

### 6. Bausteine (in `src/ui/components`, mit Tokens für Hell und Dunkel)

`Sheet` (Rasterhöhen `medium`/`large`, Griff), `ActionSheet` (gefährliche Aktion rot, „Abbrechen“ getrennt unten),
`ContextMenu`, `SwipeRow`, `Stepper` (Pille mit − | +, für Preise), `SearchField` (unter dem Large Title, erscheint beim
Herunterziehen), `NotificationCenter`. Bestehende Bausteine nur erweitern, nie brechen; die Module benutzen sie.

### 7. Restliche Seiten auf iOS-Muster bringen

Spot (`spots.spot`), Veedel, Markt, Gangs, Aufträge (`customers.orders`) und die Abschnitte im Geschäft: `Group`,
`ListItem`, `ItemContent`, `SummaryTiles` statt eigener Karten. Keine Karten in Karten, Werte rechts in der Zeile,
die Hauptaktion als Knopf in der Navigationsleiste oder als Zeile mit Kachel, Bestätigungen über `ActionSheet`, Preise
über `Stepper`. Die oben genannten Fehler (abgeschnittener Knopf, umbrechende Werte, überlagerter Schließen-Knopf) sind
danach weg.

### 8. Handy-Bildschirm ohne doppelte Hardware

- Auf echten Handys (schmal und `pointer: coarse`) kein gezeichnetes Gehäuse und keine gezeichnete Statusleiste mit
  Uhrzeit, Empfang und Akku: Die echte ist ja da. Die Seite nutzt `env(safe-area-inset-*)` (`viewport-fit=cover` ist in
  `index.html` gesetzt).
- Die Island wird dort keine Kamera-Attrappe, sondern eine schwebende Live-Aktivitäts-Pille direkt unter dem sicheren
  Bereich, mit denselben Daten aus `registerLiveActivity`. Die Spielzeit steht in der Pille.
- Am Desktop bleibt das Gerät mit Rahmen, Statusleiste und Island wie heute.
- Als Web-App vom Home-Bildschirm prüfen, dass nichts unter der echten Island oder dem Home-Balken verschwindet.

## Nicht in diesem Auftrag

- Karte, HUD, Kartensteuerung, Dialoge außerhalb des Handys
- neue Spielmechaniken, Befehle, Ereignisse, Spielstand-Migrationen
- Sperrbildschirm, App-Umschalter und Kontrollzentrum (bewusst weggelassen; wer das anders sieht, fragt vorher und
  begründet es in `docs/handy-design.md`)
- ein Hell-Schalter im Spiel (die Tokens können es schon, das ist ein eigener kleiner Auftrag)

## Prüfen

- `npm run check`, `npm run build`, `npm run e2e`, alles grün.
- Neue Szenen in `scripts/phone-scenes.mjs`: Kontextmenü, Blatt mittel und groß, Aktionsblatt, Mitteilungszentrale,
  halbes Rand-Wischen, Spot, Gangs, Markt umgebaut. `npm run screenshot:phone` dunkel und hell, Desktop und
  Handy-Bildschirm, selbst ansehen.
- `npm run audit:phone` ohne Verstöße (Ziele ≥ 44 px, Schrift ≥ 11 px, Kontrast 4,5:1), auch für die neuen Szenen.
- Gesten-Test mit Playwright (Maus und Touch): Rand-Wischen 60 % → zurück, 20 % → bleibt; schnelles kurzes Wischen →
  zurück; Hochwischen → Startbildschirm; langer Druck → Kontextmenü, Esc schließt es; Blatt nach unten → zu.
- Bildrate: Playwright-Trace beim App-Öffnen und Rand-Wischen auf Desktop-Größe, keine langen Frames durch Layout.
- Kurze Videos der Übergänge (`recordVideo` in Playwright) für den PR.

## Fertig, wenn

- Navigation als Stapel mit Titeln, Gesten, Federn, Übergänge und Haptik wie oben laufen, mit Tests für `navModel`
  und `spring`.
- Die neuen Bausteine dokumentiert sind (`src/ui/README.md`) und die genannten Seiten sie benutzen.
- Am echten Handy keine doppelte Statusleiste mehr zu sehen ist.
- `docs/handy-design.md` einen neuen Abschnitt „7. Interaktion wie iOS“ hat: welche Gesten, welche Federwerte, was
  bewusst fehlt und warum, plus Vorher/Nachher.
- Die PR-Beschreibung die drei Abschnitte aus der README hat: „Was ist neu“, „Wie testen“, „Für die Integration“.
