# Oberfläche (`src/ui/`)

Look **"Nachtschicht"**: dunkel, gedämpft, weich und aufgeräumt, angelehnt an iOS und moderne Tycoon-Spiele.
Kölsch-Gold ist die Marke (Hauptaktion, "Nächster Schritt"), jede andere Farbe hat genau eine Bedeutung (Geld grün,
Schwarzgeld violett, Gefahr rot …, Tabelle unten). Die Karte ist passend gedämpft (siehe `src/map/README.md`).
Desktop und Handy sind gleichwertig. Module importieren alles aus `src/ui/index.ts` (nur aus ihrem `ui/`-Ordner).
Registries und Hooks: siehe `docs/architektur.md` und das Beispiel in `src/modules/_template/ui/index.tsx`.
Warum das Handy so aussieht, wie es aussieht (HIG-Ableitungen, Plan, Kritik, Prüfung): `docs/handy-design.md`.

## Aufbau: Das Handy ist die Schaltzentrale

Das Spiel-Handy ist ein **iPhone (Pro)**: Titanrahmen mit Tasten, Gehäuse im Verhältnis 0,49 (`--phone-ratio`; ein
iPhone 16 Pro hat 0,478), Statusleiste mit **Dynamic Island**, App-Kacheln mit Farbverlauf, Glas-Dock,
Navigationsleiste "‹ Zurück" mit großen Titeln, Listen als eingerückte Gruppen wie in der Einstellungen-App.

**Statusleiste** (`phone/PhoneFrame.tsx`): drei Spalten wie bei iOS. Links die Uhrzeit, in der Mitte Platz für die
Island (so breit wie die größte kompakte Island, 230 pt, auf schmalen Handys schmaler), rechts Empfang, WLAN und Akku.
Uhrzeit und Symbole werden nie von der Island verdeckt. Bei einer zweiten Aktivität weichen Empfang und WLAN, der
Akku bleibt.

**Dynamic Island** (`phone/DynamicIsland.tsx`): zeigt laufende Live-Aktivitäten der Module.
- Anmelden mit `registerLiveActivity({ id, activities: (state) => LiveActivity | LiveActivity[] | null })`.
  Eine Aktivität hat `priority` (90 Gefahr, 70 Frist, 50 Lieferung, 30 Status), `icon`, `tone`, `leading`
  (kurzes Wort), `trailing` (Wert, z.B. `islandCountdown(minuten)`), `title`, `detail`, `progress` und `open(ui)`.
- **Restzeiten nur in Stunden:** `islandCountdown(minuten)` liefert `"2 Std."` (aufgerundet, "2 Std." sind höchstens
  zwei) und unter einer Stunde `"< 1 Std."`, nie Minuten. Der Wert springt so nur einmal pro Spielstunde und zappelt
  nicht mehr (`phone/islandModel.ts`, getestet).
- Kompakt: Symbol links, Wert rechts der Kamera, höchstens 230 pt breit. Eine zweite Aktivität hängt als Kreis daneben.
- Aufgeklappt: Maus drüber bzw. Tipp. Dann stehen alle Aktivitäten mit Fortschritt untereinander.
- Neue Aktivitäten ab Priorität 80 klappen kurz von selbst auf.
- `ui.pulseIsland({ icon, text, tone, kind?, amount? })` zeigt einen kurzen Auftritt, z.B. „+450 €“.
  Beträge gleicher `kind` werden dabei zusammengezählt.
- Liegt das Handy weg, schwebt die Island oben über der Karte, aber nur, wenn es etwas zu zeigen gibt.
- Bisher angemeldet: Überfälle, Razzia und hohe Heat, Gang-Vorstöße, Chat-Fristen, Aufträge mit Frist, Kuriere,
  Lieferungen mit Restzeit, Ware am Kai (Zeit bis zum Zoll), Fahrten und Verkehrskontrollen, der Spot, an dem du
  selbst stehst, und der Umsatz des Tages.

- **Über der Karte** steht nur das Nötigste: eine schmale HUD-Leiste mit Geld (Schwarzgeld mit Beutel-Symbol, sauberes
  Geld mit Münze) und Heat (`placement: 'main'`), Warnungen (`'alert'`), rechts Spieltempo und Menü (Meldungen, Suche,
  Spielstände, Einstellungen, Ton). Dazu die Kartensteuerung.
- **Alles andere läuft über das Spiel-Handy** (`phone/PhoneFrame.tsx`):
  - Tabs der Module (`registerTab`) sind Apps mit der ID `tab:<id>`. `ui.selectTab('staff')` öffnet also die App
    "Leute" im Handy.
  - Panels (`ui.openPanel`, z.B. ein Spot oder ein Veedel) erscheinen als Seite über der aktuellen App. Zurück
    schließt sie.
  - Der Startbildschirm zeigt die **Heute-Zeile** (Wochentag, Spieltag, Tageszeit und das Wetter als Knopf), den
    **Nächsten Schritt**, die Kennzahlen (`placement: 'more'`, z.B. Lager, Ruf, Köln) als drei Kacheln, die Widgets
    (`phone.home`), das App-Raster (4 Spalten) und unten das **Dock** (Nachrichten, Geschäft, Lieferanten, Leute).
    Der Hintergrund ist die **Kölner Skyline**, deren Himmel der Spielzeit folgt (`phone/Skyline.tsx`).
  - **Dock ja, Tab-Leiste nein:** Das Dock gibt es nur auf dem Startbildschirm (wie bei iOS). Apps sind Vollbild,
    zurück geht es über "‹" oben links, den Home-Balken unten oder Esc. Innerhalb einer App teilen Segmente
    (`SegmentedControl`) nahe Ansichten. Begründung in `docs/handy-design.md`, Abschnitt 5.
  - **Kleine Fenster:** Ist das Handy niedrig oder schmal, wird der Startbildschirm über Container-Queries kompakter
    (Container `phone`).
- **Desktop:** Das Handy ist rechts fest angedockt. Weglegen (T, Pfeil unten rechts) klappt es zu einer Lasche am
  Rand, die zuletzt offene App bleibt gemerkt. HUD, Kartensteuerung und Toasts rücken neben das Handy.
- **Handy-Bildschirm:** Das Spiel-Handy füllt den Bildschirm unter dem HUD. In der Tasche zeigt eine Leiste unten den
  Nächsten Schritt und den Handy-Knopf mit Uhrzeit und ungelesenen Nachrichten.
- **Tastatur (Desktop):** Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstabe eines Tabs öffnet dessen App (noch
  einmal: zurück zum Startbildschirm), Strg/⌘+K Suche. Esc geht einen Schritt zurück (Details, Abschnitt, Chat,
  App) und legt am Ende das Handy weg.
- **Meldungen:** Höchstens ein Toast ist sichtbar, weitere warten. Alles landet in der App **Meldungen**
  (Dringend, Achtung, Routine; "Hin" springt zum Ort; ungelesene als Zähler am Icon). Fehlermeldungen von Befehlen
  landen dort nicht.
- **Benachrichtigungen** erscheinen wie bei iOS oben im Handy (Glas, Kachel in der Farbe der App). Liegt es weg,
  erscheinen sie oben rechts über der Karte.
- **Nächster Schritt:** kommt aus `registerAdvisor`. In den ersten zwei Spieltagen pulsiert das Ziel (`highlight`)
  sanft. Es wird nichts gesperrt.
- **Listen-Tabs** (`layout: 'rows'`, z.B. "Geschäft"): Jede `Card` mit `title` wird zu einer Zeile einer Liste
  (`icon` als Kachel in der Bedeutungsfarbe, `summary`, `status`). Ein Tipp öffnet den Abschnitt, der Zurück-Pfeil des
  Handys führt zur Übersicht.

### Apps des Kerns

| App | Farbe | Inhalt |
| --- | --- | --- |
| Nachrichten (`core.messages`) | Mint | Chats nach Kontaktart gruppiert (Gangs, Polizei, Lieferanten, Team, Kunden, Kontakte), Avatar in der Farbe der Art, Fristen, ungelesen; Chat mit Antwortblatt |
| Meldungen (`core.alerts`) | Orange | Dringend, Achtung, Routine |
| Ereignisse (Tab `journal`) | Papier | Journal als Zeitachse nach Tagen, Filter Alle/Gutes/Ärger |
| Einstellungen (`core.settings`) | Grau | Abschnitte **Ton & Musik** (Lautstärken, Musik, kleiner Player), **Anzeige** (Overlay, Kamera), **Spiel** (Vibrieren, Spielstände) und Beiträge der Module (Slot `core.settings`) |

Musik ist keine eigene App mehr, sondern ein Abschnitt der Einstellungen. Ereignisse und Einstellungen sind bewusst
verschieden gebaut (Zeitachse ohne Kästen gegen Gruppen mit Schaltern und Reglern).

## Tokens (`styles/tokens.css`)

Nur Variablen verwenden.

- **Bedeutungsfarben** `--cat-<name>` (eine Farbe = eine Bedeutung), je mit `-soft` (getönter Grund), `-a`/`-b`
  (Verlauf einer Kachel) und `-on` (Symbol auf der Kachel). Hell und Dunkel stehen als `light-dark(hell, dunkel)`
  im selben Token. `contrast.test.ts` prüft alle Paare mit den echten Hex-Werten (Text 4.5:1, Kachel-Symbol 3.5:1).

  | Name | Bedeutung | Wo |
  | --- | --- | --- |
  | `money` (grün) | Geld, Gewinn, Aufträge, in Ordnung | Kasse, Kunden, Status gut, Schalter an |
  | `dirty` (violett) | Schwarzgeld | Schwarzgeld, Geldwäsche |
  | `danger` (rot) | Gefahr | Heat, Gangs, Überfälle, Fehler |
  | `warn` (orange) | Frist, Achtung | Meldungen, Fristen |
  | `brand` (Gold) | dein Geschäft, Hauptaktion | Geschäft, Nächster Schritt |
  | `place` (blau) | Ort, Info | Reviere, Spots, Anzeige |
  | `goods` (braun) | Ware, Lieferung | Lager, Lieferanten |
  | `people` (türkis) | Personen | Leute, Kontakte |
  | `chat` (mint) | Nachrichten | Nachrichten, eigene Blase |
  | `sky` (cyan) | Himmel | Wetter |
  | `law` (indigo) | Recht | Polizei |
  | `media` (rosa) | Ton | Ton und Musik |
  | `system` (grau), `log` (Papier) | neutral | Einstellungen, Ereignisse |

- **Flächen im Handy:** `--phone-bg`, `--phone-group`, `--phone-group-2`, `--phone-fill`, `--phone-separator`,
  `--phone-label` (`-2`, `-3`), `--phone-glass` (schwebende Ebene, bei reduzierter Transparenz deckend).
- **Alt, weiterhin gültig:** Grundpalette `--ink`, `--paper`, `--dom`, `--money`, `--gold`, `--rhine`, `--lila`,
  `--dirty` (zeigen auf die Bedeutungsfarben), semantisch `--color-bg/panel/surface…` und `text/muted/faint`.
  Akzente `accent/warn/bad/info`: Grundname = Textfarbe, `-strong` = Fläche, `-soft` = getönter Grund.
  `--color-primary` ist Kölsch-Gold.
- **Hell und Dunkel:** Das Spiel läuft dunkel (`:root { color-scheme: dark }`, HIG: eine Ein-Modus-App liefert trotzdem
  beide Farbsätze). Das Handy lässt sich mit `data-appearance="light"` (immer hell) oder `"auto"` (folgt dem System)
  am `.phone`-Element hell schalten. Karten-Layer lesen Tokens mit `mapToken()` aus `src/map` (nimmt die
  Dunkelvariante, MapLibre versteht kein `light-dark()`).
- **Schrift:** `--font-body`/`--font-display` (San Francisco, sonst Inter). Textstile nach iOS: `--type-large-title`
  34, `--type-title-2` 22, `--type-body` 17 (Fließtext, Zeilentitel, Knöpfe), `--type-subhead` 15 (Zweitzeilen,
  Hinweise), `--type-footnote` 13, `--type-caption` 12, `--type-caption-2` 11 (kleinste erlaubte Größe). Im Handy
  zeigen `--font-size-xs/sm/md/lg` auf Footnote, Subhead, Body, Title 3, damit auch Module iOS-Größen bekommen.
- **Form:** `--radius-xs/sm/md/lg/xl` (4/6/8/12/16 px), `--radius-group` 16 (Gruppen, Karten), `--radius-tile` 22,5 %
  (App-Kacheln), `--radius-round` für Pillen und Zähler. `--stroke` (1 px). `--shadow-panel`, `--shadow-float`.
- **Bewegung:** `--ease-out`, `--ease-ios`, `--duration(-fast/-slow)`. `prefers-reduced-motion` schaltet Animationen
  aus, `prefers-reduced-transparency` und `prefers-contrast: more` machen Glas deckend.
- **Layout:** `--phone-ratio`, `--phone-width`, `--phone-status-height`, `--phone-nav-height`, `--phone-home-inset`,
  `--hud-height`, `--touch-target` (am Handy 44 px), `--touch-target-phone` (44 px), `--safe-*`, `--z-*`.
- **Hardware und Wallpaper:** `--hw-*` (Gehäuse, Island), `--wall-*` und `--home-*` (Himmel und Schrift des
  Startbildschirms, immer dunkel bzw. hell).

**Farbe sparsam:**
- Farbe steht in Kacheln (`IconChip`), Zeichen und Etiketten, nie als Vollfläche im Inhalt. Jede Farbe kommt mit Symbol
  oder Beschriftung, nie allein.
- Glas nur auf der schwebenden Ebene (Navigationsleiste beim Scrollen, Dock, Antwortblatt, Banner, Island).
- Keine Emojis als Schmuck.

**Karte:** Sie hat ihren eigenen gedämpften Look (`src/map`).
- Ihre Marker nutzen `--color-marker-*`, `--color-label-bg` und `--shadow-marker-soft`.
- Karten-Layer lesen Farbwerte über `mapToken()` (siehe `src/modules/territory/ui/map.ts`).

## Bausteine (`components/`)

`Group` (Abschnitt wie in den iOS-Einstellungen: Kachel, Titel in Großbuchstaben, Zähler, Fußnote), `ItemContent`
(Zeileninhalt in einem `ListItem`: Kachel in der Bedeutungsfarbe, Titel, Zweitzeile, darunter z.B. ein Fortschritt),
`SummaryTiles` (zwei oder drei Kennzahlen als Kacheln oben auf einer Seite),
`Button` (`variant`: default, primary, success, danger, subtle, link; `icon`, `badge`, `big`), `IconButton`,
`SegmentedControl` (`wide`, Segmente mit `badge`), `Card` (`icon`, `color`, `tone`, `summary`, `status`), `Hint`,
`Empty` (mit `action` für den nächsten Schritt), `KeyValue`, `Stat`, `Badge`, `ProgressBar`, `List`/`ListItem`, `Tabs`,
`Dialog` (`icon`, `tone`, `kicker`), `Icon`, `IconChip`, `StatusDot`, `Tag` (`category`), `Avatar` (`tone`), `Toggle`
(iOS-Schalter, nur in Zeilen), `Slider`, `Select`, `HudPill` (Kennzahl: in der HUD-Leiste bzw. als Kachel auf dem
Handy-Startbildschirm).

- **`IconChip`:** Symbol auf einer Kachel in einer Bedeutungsfarbe (`color="money"`, `"goods"` …; alte Namen wie
  `green`, `red`, `bad` gehen weiter). Mit `solid` kräftig mit Farbverlauf und weißem Symbol (App-Icon, Zeilen der
  Listen-Tabs), mit `shape="tile"` als App-Kachel (Radius 22,5 %).
- **`Tag`/`Avatar`:** `category`/`tone` nehmen eine Bedeutungsfarbe. Status immer mit Symbol und Wort, nie mit Farbe
  allein (`Tag category="warn" icon="jail">In Haft</Tag>`).
- **`readableOn(hex)`:** Weiß oder Fast-Schwarz, was auf einer beliebigen Farbe (z.B. einer Gang) lesbar ist.

**Juice** (`Juice.tsx`, rein visuell): `CountUp` (Zahl zählt), `FloatingNumber` (+120 € steigt auf), `Stamp` (Stempel),
`Confetti`, `SegmentMeter` (Stufen-Balken, z.B. Heat), `DuelBar` (Kräfte-Vergleich).

**Icons:** eigenes Set in `components/icons.ts` (24er-Raster, nur Linien, Strich 1.75, auf Kacheln 2, kein npm-Paket).
`<Icon name="truck" />`, als `icon`-Prop an vielen Bausteinen und bei `registerPhoneApp({ icon: 'truck' })`. Emojis
gehen nur noch durch die Tabelle `EMOJI_ICONS` (alte Daten wie Gang-Wappen), unbekannte werden als Text gezeigt.
Neue Icons in `icons.ts` ergänzen (Symbole für Geld: `coinEuro` sauber, `moneyBag` Schwarzgeld).

## Spiel-Handy (`phone/`)

- `registerPhoneApp({ id, name, icon, order, component, badge?, color?, chrome? })`: `color` ist eine Bedeutungsfarbe
  (`'money'`, `'goods'`, `'people'` … eine Farbe = eine Bedeutung; für alte Module geht auch eine CSS-Farbe, aus der der
  Verlauf abgeleitet wird), `badge(state, ui)` liefert den Zähler am Icon, `chrome: 'none'` heißt, die App zeichnet
  ihre Kopfleiste selbst mit `<PhoneScreen title onBack actions footer>`. Sonst setzt das Handy eine Leiste mit Zurück
  und App-Namen darüber.
- `PhoneScreen`: Navigationsleiste mit Large Title. Der große Titel scrollt mit, dann erscheint der kleine in der Mitte
  und die Leiste bekommt Glas und eine Haarlinie. Mit `leading` (Avatar) oder `inlineTitle` steht er von Anfang an klein.
- Kein Sperrbildschirm: Das Handy zeigt immer den **Startbildschirm** oder die zuletzt offene App.
- Tabs der Module erscheinen automatisch als Apps (`tab:<id>`), Panels als Seiten über der aktuellen App.
- `ui.openPhone(appId, params)` öffnet eine App, z.B. `ui.openPhone('core.messages', { contactId: 'gang:nord' })`.
- Widgets auf dem Startbildschirm: `registerSlot('phone.home', { id, order, component })`.
- `ui.notify({ title, text, icon, appId, params, sound })` zeigt ein Banner, lässt das Handy vibrieren und spielt
  einen Ton. Neue Nachrichten lösen das automatisch aus.
- **Nachrichten:** Kontakte "tippen" (drei Punkte, nur Optik) bevor eine neue Nachricht erscheint. Kontaktart und Farbe:
  Gang rot, Polizei indigo, Team türkis, Lieferant braun, Kunde grün (Avatar, Gruppenkopf, Streifen an der Blase).
  Offene Fragen tragen den Stempel "Antwort!", die Antwortknöpfe stehen als Glasblatt unten (erster Knopf Gold). Die
  Aufbereitung ist in `messagesModel.ts` (getestet).

## Prüfen

- `npm test` prüft u.a. `styles/contrast.test.ts` (Kontrast aller Farbpaare, Hell und Dunkel), `phone/islandModel.test.ts`
  (Stunden statt Minuten), `phone/messagesModel.test.ts`, `builtin/journalModel.test.ts`.
- `npm run screenshot:phone` (alle Handy-Seiten, Desktop und Handy-Bildschirm, `--appearance=light` für Hell).
- `npm run audit:phone` misst am laufenden Spiel Zielgrößen (mindestens 44 px), Schriftgrößen (nie unter 11 px) und
  Textkontrast (4.5:1) in jeder Handy-Seite und endet mit Fehlercode bei Verstößen.

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
Gerät (Einstellungen › Ton & Musik). Ton startet erst nach der ersten Interaktion.

## Einstellungen pro Gerät

`UiState.overlay`, `camera`, `vibration` (`prefs.ts`, `localStorage` `koeln-tycoon:ui`), Ton unter `koeln-tycoon:audio`.
