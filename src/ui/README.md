# Oberfläche (`src/ui/`)

Look **"Nachtschicht"**: dunkel, gedämpft, eckig und aufgeräumt, angelehnt an moderne Tycoon- und Management-Spiele.
Haarlinien statt dicker Konturen, weiche Schatten statt Sockel, Radien von 2–6 px, schmale Tycoon-Zahlen
(Barlow Semi Condensed) und Inter als Textschrift. Eine Akzentfarbe (Kölsch-Gold) für Hauptaktionen, sonst nur Farben
mit Bedeutung. Die Karte ist passend gedämpft (siehe `src/map/README.md`). Desktop und Handy sind gleichwertig. Module
importieren alles aus `src/ui/index.ts` (nur aus ihrem `ui/`-Ordner). Registries und Hooks: siehe
`docs/architektur.md` und das Beispiel in `src/modules/_template/ui/index.tsx`.

## Aufbau: Das Handy ist die Schaltzentrale

Das Spiel-Handy ist ein **iPhone (Pro) im Dunkelmodus**: Titanrahmen mit Tasten, Seitenverhältnis 393 × 852,
Statusleiste mit **Dynamic Island**, dunkle iOS-Icons, Glas-Dock, Navigationsleiste „‹ Zurück“ mit großen Titeln,
Listen als eingerückte Gruppen wie in der Einstellungen-App. Maße nach Apples HIG (Skill `apple-design`).

**Dynamic Island** (`phone/DynamicIsland.tsx`): zeigt laufende Live-Aktivitäten der Module.
- Anmelden mit `registerLiveActivity({ id, activities: (state) => LiveActivity | LiveActivity[] | null })`.
  Eine Aktivität hat `priority` (90 Gefahr, 70 Frist, 50 Lieferung, 30 Status), `icon`, `tone`, `leading`
  (kurzes Wort), `trailing` (Wert, z.B. `islandCountdown(minuten)`), `title`, `detail`, `progress` und `open(ui)`.
- Kompakt: Symbol links, Wert rechts der Kamera. Eine zweite Aktivität hängt als Kreis daneben.
- Aufgeklappt: Maus drüber bzw. Tipp. Dann stehen alle Aktivitäten mit Fortschritt untereinander.
- Neue Aktivitäten ab Priorität 80 klappen kurz von selbst auf.
- `ui.pulseIsland({ icon, text, tone, kind?, amount? })` zeigt einen kurzen Auftritt, z.B. „+450 €“.
  Beträge gleicher `kind` werden dabei zusammengezählt.
- Liegt das Handy weg, schwebt die Island oben über der Karte, aber nur, wenn es etwas zu zeigen gibt.
- Bisher angemeldet: Überfälle, Razzia und hohe Heat, Gang-Vorstöße, Chat-Fristen, Aufträge mit Frist, Kuriere,
  Lieferungen mit Restzeit und der Umsatz des Tages.

- **Über der Karte** steht nur das Nötigste: eine schmale HUD-Leiste mit Geld und Heat (`placement: 'main'`),
  Warnungen (`'alert'`), rechts Spieltempo und Menü (Meldungen, Suche, Spielstände, Einstellungen, Ton). Dazu die
  Kartensteuerung.
- **Alles andere läuft über das Spiel-Handy** (`phone/PhoneFrame.tsx`):
  - Tabs der Module (`registerTab`) sind Apps mit der ID `tab:<id>`. `ui.selectTab('staff')` öffnet also die App
    "Leute" im Handy.
  - Panels (`ui.openPanel`, z.B. ein Spot oder ein Veedel) erscheinen als Seite über der aktuellen App. Zurück
    schließt sie.
  - Der Startbildschirm zeigt Datum und Wetter (`placement: 'time'`), den **Nächsten Schritt**, die Kennzahlen
    (`placement: 'more'`, z.B. Lager, Ruf, Köln), die Widgets (`phone.home`), das App-Raster und unten ein Dock
    (Nachrichten, Geschäft, Lieferanten, Leute).
  - Die Statusleiste zeigt nur die Uhrzeit.
- **Desktop:** Das Handy ist rechts fest angedockt. Weglegen (T, Pfeil unten rechts) klappt es zu einer Lasche am
  Rand, die zuletzt offene App bleibt gemerkt. HUD, Kartensteuerung und Toasts rücken neben das Handy.
- **Handy-Bildschirm:** Das Spiel-Handy füllt den Bildschirm unter dem HUD. In der Tasche zeigt eine Leiste unten den
  Nächsten Schritt und den Handy-Knopf mit Uhrzeit und ungelesenen Nachrichten.
- **Tastatur (Desktop):** Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstabe eines Tabs öffnet dessen App (noch
  einmal: zurück zum Startbildschirm), Strg/⌘+K Suche. Esc geht einen Schritt zurück (Details, Abschnitt, App) und
  legt am Ende das Handy weg.
- **Meldungen:** Höchstens ein Toast ist sichtbar, weitere warten. Alles landet in der App **Meldungen**
  (Dringend, Achtung, Routine; "Hin" springt zum Ort). Fehlermeldungen von Befehlen landen dort nicht.
- **Benachrichtigungen** erscheinen wie bei iOS oben im Handy. Liegt es weg, erscheinen sie oben rechts über der
  Karte.
- **Nächster Schritt:** kommt aus `registerAdvisor`. In den ersten zwei Spieltagen pulsiert das Ziel (`highlight`)
  sanft. Es wird nichts gesperrt.
- **Listen-Tabs** (`layout: 'rows'`, z.B. "Geschäft"): Jede `Card` mit `title` wird zu einer Zeile einer Liste
  (`icon`, `summary`, `status`). Ein Tipp öffnet den Abschnitt, der Zurück-Pfeil des Handys führt zur Übersicht.

## Tokens (`styles/tokens.css`)

Nur Variablen verwenden.

- **Farben:**
  - Grundpalette `--ink`, `--paper`, `--dom`, `--money`, `--gold`, `--rhine`, `--lila`, `--dirty`, jeweils mit
    `-edge`. Die Namen stammen aus dem alten Look und zeigen jetzt auf die gedämpften Farben.
  - Semantisch: `--color-bg/panel/surface…` und für Text `text/muted/faint`.
  - Akzente `accent/warn/bad/info`: Der Grundname ist die Textfarbe auf dunkler Fläche, `-strong` die Fläche, `-soft`
    der getönte Hintergrund, `-edge` die Kante. `--color-primary` ist Kölsch-Gold.
- **Form:**
  - `--radius-xs/sm/md/lg/xl` (4/6/8/12/16 px): Knöpfe 8 wie bei Claude, Karten und Gruppen 12.
  - `--radius-round` nur für Zähler und Punkte.
  - `--stroke` (1 px).
  - `--shadow-panel`, `--shadow-float`. `--shadow-pop` bleibt nur aus Kompatibilität bestehen und ist leer.
- **Bewegung:** `--ease-out`, `--duration(-fast/-slow)`.
- **Layout:** `--phone-width`, `--hud-height`, `--touch-target` (am Handy 44 px), `--safe-*`, `--z-*`.
- **Schrift:** `--font-display` (Barlow Semi Condensed, für Überschriften und Zahlen), `--font-body` (Inter).

**Farbe sparsam:**
- Getönte Flächen (`-soft`) mit farbiger Schrift statt bunter Vollflächen.
- Icons stehen auf getönten Kacheln (`IconChip`), nicht in bunten Kreisen.
- Keine Emojis als Schmuck.

**Karte:** Sie hat ihren eigenen gedämpften Look (`src/map`).
- Ihre Marker nutzen `--color-marker-*`, `--color-label-bg` und `--shadow-marker-soft`.
- Karten-Layer lesen Farbwerte über `token()` (siehe `src/modules/territory/ui/map.ts`).

Bewegung respektiert `prefers-reduced-motion` (Tokens und Animationen werden dann fast aus).

## Bausteine (`components/`)

`Button` (`variant`: default, primary, success, danger, subtle, link; `icon`, `badge`, `big`), `IconButton`,
`SegmentedControl`, `Card` (`icon`, `color`, `tone`, `summary`, `status`), `Hint`, `Empty`, `KeyValue`, `Stat`, `Badge`,
`ProgressBar`, `List`/`ListItem`, `Tabs`, `Dialog` (`icon`, `tone`, `kicker`), `Icon`, `IconChip` (Icon auf getönter Kachel),
`StatusDot`, `Tag`, `Avatar`, `Toggle`, `Slider`, `Select`, `HudPill` (Kennzahl: in der HUD-Leiste bzw. als Kachel auf
dem Handy-Startbildschirm).

**Juice** (`Juice.tsx`, rein visuell): `CountUp` (Zahl zählt), `FloatingNumber` (+120 € steigt auf), `Stamp` (Stempel),
`Confetti`, `SegmentMeter` (Stufen-Balken, z.B. Heat), `DuelBar` (Kräfte-Vergleich).

**Icons:** eigenes Set in `components/icons.ts` (24er-Raster, nur Linien, kein npm-Paket). `<Icon name="truck" />`,
als `icon`-Prop an vielen Bausteinen und bei `registerPhoneApp({ icon: 'truck' })`. Unbekannte Namen (z.B. Emoji)
werden als Text gezeigt. Neue Icons in `icons.ts` ergänzen.

## Spiel-Handy (`phone/`)

- `registerPhoneApp({ id, name, icon, order, component, badge?, color?, chrome? })`: `color` färbt die Kachel im Raster,
  `chrome: 'none'` heißt, die App zeichnet ihre Kopfleiste selbst mit `<PhoneScreen title onBack actions footer>`.
  Sonst setzt das Handy eine Leiste mit Zurück und App-Namen darüber.
- Kein Sperrbildschirm: Das Handy zeigt immer den **Startbildschirm** (Heute, Nächster Schritt, Kennzahlen, Widgets,
  App-Raster, Dock) oder die zuletzt offene App.
- Tabs der Module erscheinen automatisch als Apps (`tab:<id>`), Panels als Seiten über der aktuellen App.
- `ui.openPhone(appId, params)` öffnet eine App, z.B. `ui.openPhone('core.messages', { contactId: 'gang:nord' })`.
- Widgets auf dem Startbildschirm: `registerSlot('phone.home', { id, order, component })`.
- `ui.notify({ title, text, icon, appId, params, sound })` zeigt ein Banner, lässt das Handy vibrieren und spielt
  einen Ton. Neue Nachrichten lösen das automatisch aus.
- **Nachrichten:** Kontakte "tippen" (drei Punkte, nur Optik) bevor eine neue Nachricht erscheint. Die Blasenform
  hängt an der Kontaktart (schmaler Farbstreifen: Gang rot, Polizei blau, Team gold, Lieferant violett). Offene Fragen tragen den Stempel
  "Antwort!", die Antwortknöpfe stehen als Blatt unten. Die Aufbereitung ist in `messagesModel.ts` (getestet).

## Ton (`src/audio/`, über `src/ui` erreichbar)

```ts
import { audio, soundOnEvent } from '../../../ui';
audio.play('cash');                                   // SOUND_IDS: message, notification, cash, click, tap, error,
                                                      // success, alert, siren, thunder, gameOver, win, vibrate, delivery
audio.playThrottled('cash', 400);
audio.setAmbience('rain', 0.7);                       // rain | storm | wind, 0 = aus
audio.registerSound('gangs.shot', { kind: 'file', url: 'audio/sfx/shot.ogg' });
soundOnEvent('police.raid', 'siren');                 // Sound an ein Ereignis binden
```

Musik: selbst erzeugte Playlist, Stimmung nach Tageszeit. Lautstärke, Stummschalten und Musik an/aus merkt sich jedes
Gerät. Ton startet erst nach der ersten Interaktion.

## Einstellungen pro Gerät

`UiState.overlay`, `camera`, `vibration` (`prefs.ts`, `localStorage` `koeln-tycoon:ui`), Ton unter `koeln-tycoon:audio`.
