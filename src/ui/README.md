# Oberfläche (`src/ui/`)

Look **"Kölsch-Sticker"**: hell, clean und App-artig, dazu überzeichnet und comichaft. Weiße Karten mit dicker dunkler
Kontur und hartem Sockel-Schatten (wie Aufkleber) schweben über der pastelligen Candy-Karte (siehe `src/map/README.md`). Runde Schrift,
viele Icons in Farbkreisen, federnde Animationen. Desktop und Handy sind gleichwertig. Module importieren alles aus
`src/ui/index.ts` (nur aus ihrem `ui/`-Ordner). Registries und Hooks: siehe `docs/architektur.md` und das Beispiel in
`src/modules/_template/ui/index.tsx`.

## Aufbau

- **Desktop:** HUD als Pillen oben, schmales **Icon-Dock** links (Tooltips mit Kürzel), daneben der schwebende
  **Inspector** mit dem Inhalt des Tabs (Esc schließt), rechts das **Panel** (z.B. ein Spot), das **Handy** als Fenster
  unten rechts, Kartensteuerung rechts unten.
- **Handy:** HUD in zwei Reihen, unten eine **Tab-Leiste** und darüber ein **Bottom-Sheet** mit drei Rastpunkten
  (klein, mittel, voll). Es lässt sich am Griff ziehen, die Karte bleibt bei klein und mittel bedienbar. Das Panel ist
  ein eigenes Sheet, das Handy füllt den Bildschirm.
- **Tastatur (Desktop):** Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstabe des Tabs (steht im Tooltip),
  Strg/⌘+K Suche, Esc schließt das Oberste.
- **Meldungen:** Es ist höchstens ein Toast sichtbar, weitere warten. Alles landet in der **Alarm-Zentrale** (Glocke:
  Dringend, Achtung, Routine; "Hin" springt zum Ort). Fehlermeldungen von Befehlen landen dort nicht.
- **Nächster Schritt:** Karte oben im Tab "Geschäft" und Zeile im kleinen Sheet. Kommt aus `registerAdvisor`.
  In den ersten zwei Spieltagen pulsiert das Ziel (`highlight`) sanft. Es wird nichts gesperrt.
- **Listen-Tabs** (`layout: 'rows'`, z.B. "Geschäft"): Jede `Card` mit `title` wird zu einer tippbaren Zeile
  (`icon`, `summary`, `status`). Ein Tipp öffnet den Abschnitt ganz, Zurück führt zur Übersicht.

## Tokens (`styles/tokens.css`)

Nur Variablen verwenden. Farben: Grundpalette `--ink`, `--paper`, `--dom`, `--money`, `--gold`, `--rhine`, `--lila`,
`--dirty` (jeweils mit `-edge` für Kanten). Semantisch: `--color-bg/panel/surface…`, Text `text/muted/faint`, Akzente
`accent/warn/bad/info` (Grundname = Textfarbe auf Weiß, `-strong` = Fläche, `-soft` = Hintergrund, `-edge` = Kante),
Schrift auf Flächen `--color-on-*`. Form: `--stroke` (Kontur), `--radius-sm/md/lg`, `--shadow-pop` (harter Sockel),
`--shadow-panel`. Bewegung: `--ease-spring`, `--duration(-fast/-slow)`. Layout: `--touch-target` (am Handy 44 px),
`--safe-*`, `--z-*`. Schrift: `--font-display` (Baloo 2, Überschriften und Zahlen), `--font-body` (Nunito).

**Kontrast:** Gelb, Grün und Blau sind Flächenfarben, darauf immer dunkle Schrift. Als Textfarbe auf Weiß nur
`--color-accent`, `--color-warn`, `--color-bad`, `--color-info`.

**Karte:** Sie hat ihren eigenen Candy-Look (`src/map`). Ihre Marker nutzen `--color-marker-*` und `--shadow-marker-soft`.
Karten-Layer lesen Farbwerte über `token()` (siehe `src/modules/territory/ui/map.ts`).

Bewegung respektiert `prefers-reduced-motion` (Tokens und Animationen werden dann fast aus).

## Bausteine (`components/`)

`Button` (`variant`: default, primary, success, danger, subtle, link; `icon`, `badge`, `big`), `IconButton`,
`SegmentedControl`, `Card` (`icon`, `color`, `tone`, `summary`, `status`), `Hint`, `Empty`, `KeyValue`, `Stat`, `Badge`,
`ProgressBar`, `List`/`ListItem`, `Tabs`, `Dialog` (`icon`, `tone`, `kicker`), `Icon`, `IconChip` (Icon im Farbkreis),
`StatusDot`, `Tag`, `Avatar`, `Toggle`, `Slider`, `Select`, `HudPill` (Kennzahl im HUD, im Mehr-Popover eine Zeile).

**Juice** (`Juice.tsx`, rein visuell): `CountUp` (Zahl zählt), `FloatingNumber` (+120 € steigt auf), `Stamp` (Stempel),
`Confetti`, `SegmentMeter` (Stufen-Balken, z.B. Heat), `DuelBar` (Kräfte-Vergleich).

**Icons:** eigenes Set in `components/icons.ts` (24er-Raster, nur Linien, kein npm-Paket). `<Icon name="truck" />`,
als `icon`-Prop an vielen Bausteinen und bei `registerPhoneApp({ icon: 'truck' })`. Unbekannte Namen (z.B. Emoji)
werden als Text gezeigt. Neue Icons in `icons.ts` ergänzen.

## Spiel-Handy (`phone/`)

- `registerPhoneApp({ id, name, icon, order, component, badge?, color?, chrome? })`: `color` färbt die Kachel im Raster,
  `chrome: 'none'` heißt, die App zeichnet ihre Kopfleiste selbst mit `<PhoneScreen title onBack actions footer>`.
  Sonst setzt das Handy eine Leiste mit Zurück und App-Namen darüber.
- Das Handy beginnt mit dem **Sperrbildschirm** (Uhr und bis zu drei gestapelte Meldungen, "+N weitere"), wenn es
  Neues gibt, sonst mit dem **Startbildschirm** (Uhr, Widgets, App-Raster).
- `ui.openPhone(appId, params)` öffnet eine App, z.B. `ui.openPhone('core.messages', { contactId: 'gang:nord' })`.
- Widgets auf dem Startbildschirm: `registerSlot('phone.home', { id, order, component })`.
- `ui.notify({ title, text, icon, appId, params, sound })` zeigt ein Banner, lässt das Handy vibrieren und spielt
  einen Ton. Neue Nachrichten lösen das automatisch aus.
- **Nachrichten:** Kontakte "tippen" (drei Punkte, nur Optik) bevor eine neue Nachricht erscheint. Die Blasenform
  hängt an der Kontaktart (Gang eckig und rot, Polizei blau, Team gelb …). Offene Fragen tragen den Stempel
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
