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
Akku bleibt. **Auf einem echten Handy** (schmal und `pointer: coarse`, `useIsPhoneDevice()`) gibt es weder diese
Statusleiste noch die Kamera-Attrappe: Das Gerät hat beides selbst. Oben schwebt dann nur die Island als Pille mit der
Spielzeit (gleiche Live-Aktivitäten), unten steht statt des Home-Balkens eine Leiste mit „Start“ und „Weglegen“.

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

- **Über der Karte** steht das HUD im Look **„Glas“** (Abschnitt unten): Geld-Kapsel mit Heat (`placement: 'main'`;
  Schwarzgeld und sauberes Geld öffnen per Klick die Geldwäsche), Uhr-Kapsel mit Tempo und Menü (`'time'` ist seit
  Auftrag 26 leer), die Kennzahlen (`'more'`) als Kacheln (Lager, Ruf · Reviere; beide klappen beim Drüberfahren oder
  Antippen eine Karte auf, `HudPill` mit `details`) und Warnungen (`'alert'`). Dazu die Kartensteuerung und die
  Überlagerungen der Module (Slot `map.overlay`).
- **Alles andere läuft über das Spiel-Handy** (`phone/PhoneFrame.tsx`):
  - Tabs der Module (`registerTab`) sind Apps mit der ID `tab:<id>`. `ui.selectTab('staff')` öffnet also die App
    "Leute" im Handy.
  - Panels (`ui.openPanel`, z.B. ein Spot oder ein Veedel) erscheinen als Seite über der aktuellen App. Zurück
    schließt sie.
  - Der Startbildschirm ist seit Auftrag 26 **schwarz und ruhig**: sechs Apps im Raster (Kasse, Reviere, Gangs,
    Personal, Geldwäsche, Einstellungen; `HOME_ORDER`), unten das **Dock** (Nachrichten, Lieferanten, Personal, Kasse;
    `DOCK`), dazwischen die Widgets (`phone.home`: nur „Peters Quest“, solange Apps fehlen). Keine Heute-Zeile, keine
    Kennzahlen, keine Skyline. **Handy Schritt für Schritt** (Feedback 07.10.2026): In einem neuen Spiel stehen erst nur
    Nachrichten und Einstellungen da, jede weitere App kommt mit der Quest, die sie braucht (`PHONE_APP_STEPS` in
    `quests/config.ts`, über `hiddenWhen` der App bzw. des Tabs; abschaltbar in Einstellungen › Einstieg).
    Nur ein **dringender Rat** (`registerAdvisor`, Priorität ab 80, z.B. Chat mit Frist, Ware alle) steht als
    wegwischbare Zeile ganz oben; alle Empfehlungen stehen in der Suche (Strg/⌘+K). Apps und Tabs mit `hidden: true`
    (Verlauf, Lieferanten-Detail …) fehlen im Raster und in der Suche, `ui.openPhone(id)` öffnet sie trotzdem.
  - **Dock ja, Tab-Leiste nein:** Das Dock gibt es nur auf dem Startbildschirm (wie bei iOS). Apps sind Vollbild,
    zurück geht es über "‹" oben links, den Home-Balken unten oder Esc. Innerhalb einer App teilen Segmente
    (`SegmentedControl`) nahe Ansichten. Begründung in `docs/handy-design.md`, Abschnitt 5.
  - **Kleine Fenster:** Ist das Handy niedrig oder schmal, wird der Startbildschirm über Container-Queries kompakter
    (Container `phone`).
- **Desktop:** Das Handy ist rechts fest angedockt. Weglegen (T, runde Taste links neben dem Gerät) klappt es zu
  einer Lasche am Rand, der Seitenstapel bleibt gemerkt. HUD, Kartensteuerung, Überlagerungen und die Kamera der
  Karte rücken neben das Handy und folgen ihm mit derselben Feder (`--dock-ease`, `--dock-duration`).
- **Handy-Bildschirm:** Das Spiel-Handy füllt den Bildschirm unter dem HUD, unten die Leiste „Start“ / „Weglegen“
  (über dem sicheren Bereich, `env(safe-area-inset-*)`). In der Tasche zeigt eine Leiste unten den Nächsten Schritt und
  den Handy-Knopf mit Uhrzeit und ungelesenen Nachrichten.
- **Tastatur (Desktop):** Leertaste Pause, 1/2/3 Tempo, T Handy, Buchstabe eines Tabs öffnet dessen App (noch
  einmal: zurück zum Startbildschirm; nicht für Tabs, die gerade `hiddenWhen` ausblendet), Strg/⌘+K Suche. Esc schließt zuerst ein offenes Blatt oder Menü, geht sonst
  eine Seite zurück und legt am Ende das Handy weg.
- **Meldungen und Banner (Auftrag 26: nur das Allerwichtigste stört):** `ui.toast(text, kind, { urgent? })` bleibt
  die API. Als Banner im Handy (bzw. oben rechts, wenn es weggelegt ist; höchstens eines, weitere warten) erscheint
  eine Meldung nur, wenn sie dringend ist: Standard bei `'bad'` und `'warn'` (Razzia, Kontrolle, Festnahme,
  Lieferung verloren), erzwingbar mit `urgent: true` (Lieferung ist da, Fahrt angekommen, Löhne nicht gedeckt),
  unterdrückbar mit `urgent: false` (Ärger, der nur ins Journal gehört). Weitere Optionen: `title` (Überschrift statt
  „Meldung“, z.B. der Absender), `color` (Kachel in einer Bedeutungsfarbe, z.B. `'brand'` für Quests), `appId` und
  `params` (ein Tipp öffnet die App statt des Verlaufs) und `duration` (Millisekunden, länger als die Routine). Alles
  landet im **Verlauf** (Einstellungen ›
  Verlauf bzw. Seite `core.history`: Journal, Meldungen und Auftrags-Historie mit Filter). Fehlermeldungen von
  Befehlen erscheinen als Banner, landen aber nicht im Verlauf. `ui.notify({ …, urgent? })` ebenso: Nachrichten
  vibrieren nur mit Antwortfrist, der Rest zählt still am Badge und steht in der Mitteilungszentrale. Die Einstellung
  **„Mehr Benachrichtigungen“** (pro Gerät, `UiState.moreNotifications`) holt das alte Verhalten zurück.
  `runtime.stats.banners` zählt die Banner (das Durchspielen gibt die Zahl aus).
- **Benachrichtigungen** erscheinen wie bei iOS oben im Handy (Glas, Kachel in der Farbe der App). Liegt es weg,
  erscheinen sie oben rechts über der Karte.
- **Nächster Schritt:** kommt aus `registerAdvisor`. In den ersten zwei Spieltagen pulsiert das Ziel (`highlight`)
  sanft. Es wird nichts gesperrt. Auf dem Startbildschirm steht nur ein dringender Rat (ab Priorität 80), am
  Handy-Bildschirm der wichtigste in der Leiste unten, alle in der Suche.
- **Listen-Tabs** (`layout: 'rows'`): Jede `Card` mit `title` wird zu einer Zeile einer Liste (`icon` als Kachel in
  der Bedeutungsfarbe, `summary`, `status`). Ein Tipp öffnet den Abschnitt. Seit Auftrag 26 gibt es keinen solchen Tab
  mehr (das Geschäft ist aufgelöst), der Mechanismus bleibt.

### Apps des Kerns

| App | Farbe | Inhalt |
| --- | --- | --- |
| Nachrichten (`core.messages`) | Mint | Oben die fünf zuletzt aktiven Kontakte als Avatare, darunter die Chats kompakt nach Kontaktart gruppiert (Gangs, Polizei, Lieferanten, Team, Kunden, Kontakte), Avatar in der Farbe der Art, Fristen, ungelesen; „Alle gelesen“, Löschen per Wischen oder Kontextmenü, „Alle löschen“ im Menü (Aktionsblatt, Rückfrage bei offener Frist); Chat mit Antwortblatt |
| Einstellungen (`core.settings`) | Grau | Abschnitte **Ton & Musik** (Lautstärken, Musik, kleiner Player), **Anzeige** (Overlay, Kamera), die Abschnitte der Module (Slot `core.settings` mit `title`, `icon`, `color`: **Wetter** mit Vorhersage, **Anfragen** der Kunden), **Verlauf** (Journal, Meldungen, Aufträge mit Filter; Spielstand exportieren) und **Spiel** (Mehr Benachrichtigungen, Vibrieren, Spielstände, Export) |
| Verlauf (`core.history`, versteckt) | Papier | Die ganze Zeitachse nach Tagen mit Filter (Alles, Geld, Leute, Polizei, Gangs, Aufträge) und Export; öffnet sich aus den Einstellungen, dem Menü über der Karte, Banner-Meldungen und der Suche (`builtin/historyModel.ts`, getestet) |

Musik ist keine eigene App mehr, sondern ein Abschnitt der Einstellungen. Meldungen, Ereignisse, Wetter, Aufträge,
Kontakte und Logistik sind seit Auftrag 26 keine Apps mehr: Sie sind in Verlauf, Einstellungen, Personal, Lager- und
Hafen-Seite aufgegangen. Verlauf und Einstellungen sind bewusst verschieden gebaut (Zeitachse ohne Kästen gegen
Gruppen mit Schaltern und Reglern).

## Über der Karte: Look „Glas“ (Auftrag 24)

Alles außerhalb des Handys (HUD, Kartensteuerung, Marker, Überlagerungen, Dialoge über der Karte) ist dunkles Glas
über der Karte, auch am Tag; die Karte selbst folgt der Tageszeit. Das Handy behält seinen Look.

- **Schrift:** Barlow (`--font-hud`) für Text, Barlow Condensed (`--font-hud-display`) für Zahlen und Titel. In der
  Konfrontation (nur dort) Courier Prime (`--font-file`) und DM Serif Display (`--font-file-display`).
- **Glas:** `--hud-glass` (66 %), `--hud-glass-strong` (86 %, Menüs, Karten), `--hud-glass-solid` (deckend bei
  weniger Transparenz oder mehr Kontrast), `--hud-glass-edge`, `--hud-glass-fill(-active)`, `--hud-glass-line`,
  `--hud-blur`, `--hud-radius` 20, `--hud-radius-tile` 16, `--hud-radius-button` 14, `--hud-shadow`. Schrift darauf:
  `--hud-ink`, `--hud-ink-2`; Gold für Hauptaktionen `--hud-gold` mit `--hud-gold-on`; leere Stufe `--hud-empty`.
- **Beschriftung:** 11 px, 700, Großbuchstaben, Laufweite 0,1 em, in der Bedeutungsfarbe (`.hud-label.is-dirty`,
  `.is-money`; Kacheln über `--hud-tint`, das `HudPill` aus `color` setzt).
- **Spot-Zustände:** `--spot-idle/-waiting/-urgent/-raid` (Füllung), `-on` (Zahl, 4,5:1), `-glow` (Schein am Boden),
  `-edge` (Stiel, Ring, Kante); `--spot-ring`, `--spot-plate`, `--spot-locked(-edge)`, `--spot-shadow`. Rot und Blau
  sind als Füllung eine Spur dunkler als im Entwurf (#d93025, #1f6cf0), sonst hätte die weiße Zahl nur 3,4:1 bzw. 3,9:1.
- **Weitere:** Geld-Popup `--map-money(-on)`, `--map-money-loss(-on)`; Vignette `--map-vignette`; Akte `--file-*`,
  Kräftebalken `--duel-*`; Razzia `--raid-glass`, `--raid-edge`; Übernahme `--takeover-glow`. Bewegung mit dem Handy:
  `--dock-ease`, `--dock-duration` (Feder `SPRINGS.app` als CSS-Kurve, `springEasing()` in `phone/spring.ts`).

**HUD** (`shell/Hud.tsx`): drei Gruppen links vom Handy (`--map-right` ist die Grenze). Oben links die Geld-Kapsel
(Kachel mit Beutel, Schwarzgeld 32 px, Haarlinie, Sauber; beide Zeilen sind Knöpfe und öffnen die Geldwäsche; darunter
die Heat-Pille der Polizei mit fünf Flammen), oben in der Mitte die Uhr-Kapsel (Wochentag · Tag, Uhrzeit, Tempo als
Segmente 40 × 36, Menü mit Verlauf, Suche, Spielständen, Einstellungen, Ton), oben rechts die Kennzahl-Kacheln:
**Lager** („40 g Gras + 2 weitere“, Karte mit Aufstellung nach Produkt, Qualität und Lager, Knopf „Bestellen“) und
**Ruf · Reviere** (Leiste 0–100 über `HudBar` mit Marken an den Stufen, Revierzahl „4/7“; Karte mit der Stufe, der
darunter und darüber mit je einem Satz, und den eigenen Veedeln). Die Karte klappt beim Drüberfahren oder Antippen auf
(`HudPill` mit `details`, `detailsAction`). Ist die Kartenfläche schmal (Container-Query `hud`, unter 1000 px), rücken
die Kacheln unter die Uhr. Am Handy-Bildschirm stehen Geld (Heat als eine Flamme mit Stufenwort) und Uhr kompakt
nebeneinander, die Kacheln flach darunter; das Menü steht dort in der Kartensteuerung.

**Kartensteuerung** (`shell/MapControls.tsx`): zwei Glas-Gruppen mit 44-px-Knöpfen: Zoom +/−/Norden, dann 3D/2D
(gold bei 3D), **Ebenen** und Köln. Das Menü Ebenen füllen Module mit
`registerMapLayerOption({ id, order, group, label, icon?, toggle?, active(ui), select(api, ui) })`, z.B. Veedel nach
Kontrolle oder Heat (territory) und das Überwachungs-Overlay (Kern).

**Überlagerungen und Dialoge über der Karte:**

| Baustein | Wofür |
| --- | --- |
| `registerSlot('map.overlay', { id, order, component })` | Elemente über der freien Kartenfläche (Razzia-Banner, Tracking-Karte einer Lieferung). Der Bereich reicht bis `--map-right` und folgt dem Handy; Beiträge positionieren sich selbst und setzen `pointer-events` für Knöpfe. |
| `registerDialog({ …, area: 'map', lockPhone? })` | Dialog nur über der Kartenfläche, das Handy bleibt sichtbar. `lockPhone` (Standard: wie `pausesGame`) dunkelt das Handy ab und macht es `inert` (`dialogLocksPhone`). Konfrontation: gesperrt; Razzia-Bilanz und Übernahme: frei. |
| `MapDialog({ label, onClose, scrim?, detent?, class? })` | Darstellung dazu: Glas-Karte in der Mitte der Kartenfläche, am Handy-Bildschirm ein Blatt (`Sheet`). |
| `useIsMobile()` | Handy-Aufbau (≤ 760 px), z.B. um statt einer Akte ein Blatt zu zeigen. |
| `iconElement(name, { size?, strokeWidth?, class? })` | Icon als DOM-Element für Karten-Marker, die ohne Preact gebaut werden. |

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

**Optik-Regeln (Auftrag 27):**
- Nie mitten im Wort umbrechen: Zeilentitel (`.ui-item__title`) bleiben auf einer Zeile und werden mit „…“ gekürzt,
  Fließtext bricht nur an Wortgrenzen (`overflow-wrap: normal`, `hyphens: manual`, im ganzen Handy).
- Mehrere Eigenschaften stehen als Chips (`ItemContent tags`), nicht als „a · b · c“. Status immer mit Symbol und Wort.
- Höchstens ein kurzer Satz Erklärung pro Abschnitt sichtbar (`Group note`), alles Weitere in `Group more` oder
  `Disclosure`.

**Farbe sparsam:**
- Farbe steht in Kacheln (`IconChip`), Zeichen und Etiketten, nie als Vollfläche im Inhalt. Jede Farbe kommt mit Symbol
  oder Beschriftung, nie allein.
- Glas nur auf der schwebenden Ebene (Navigationsleiste beim Scrollen, Dock, Antwortblatt, Banner, Island).
- Keine Emojis als Schmuck.

**Karte:** Sie hat ihren eigenen gedämpften Look (`src/map`).
- Ihre Marker sind Glas (`--spot-plate`, `--hud-*`, siehe "Über der Karte: Look Glas"); ältere Marker nutzen noch
  `--color-marker-*`, `--color-label-bg` und `--shadow-marker-soft`.
- Karten-Layer lesen Farbwerte über `mapToken()` (siehe `src/modules/territory/ui/map.ts`).

## Bausteine (`components/`)

`Group` (Abschnitt mit sichtbarer Unterlage und farbiger Kopfzeile nach Bedeutung: Kachel, Titel in Großbuchstaben,
Zähler, `value` rechts, Fußnote `note` (ein Satz), `more` zum Ausklappen, `collapsible`), `ItemContent`
(Zeileninhalt in einem `ListItem`: Kachel in der Bedeutungsfarbe, Titel, Zweitzeile, `tags` als Chips, darunter z.B. ein
Fortschritt), `Chip`/`Chips` (Eigenschaft als kleine Fläche in der Bedeutungsfarbe, nie „a · b · c“ als Text),
`Disclosure` („Mehr dazu“, ausklappbar, merkt sich nichts),
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

**Wie bei iOS** (Auftrag 22, alles in `src/ui/components/`, Aussehen in `overlays.css`). Blätter, Menüs und die
Mitteilungszentrale liegen im Handy in einer eigenen Ebene (`Portal`), Esc schließt immer das oberste
(`overlays.ts`: `useOverlay(open, onClose)`), jeder Seitenwechsel schließt alle.

| Baustein | Wofür | Wichtigste Props |
| --- | --- | --- |
| `Sheet` | Blatt von unten (Bündnis wählen …), Griff zum Ziehen | `open`, `onClose`, `title`, `detents` (`'medium'`, `'large'`), `initial`, `action` |
| `ActionSheet` | Rückfrage vor Gefährlichem (Entlassen, Verpfeifen), Aktionen unten, „Abbrechen“ extra | `open`, `onClose`, `title`, `message`, `actions: { label, onSelect, destructive?, disabled?, icon? }[]` |
| `ContextMenu` | Langer Druck (500 ms), Rechtsklick oder Shift+F10 auf eine Zeile oder Kachel: Vorschau und Schnellaktionen | `label`, `actions`, `preview?`, `disabled?`; umschließt das Element |
| `SwipeRow` | Zeile nach links wischen gibt Aktionen frei (nur für vorhandene Befehle) | `actions: { label, onSelect, icon?, color? }[]`, `fullSwipe` |
| `Stepper` | − \| + statt zweier loser Knöpfe (Preise, Lohn, Beträge), gedrückt halten wiederholt | `value`, `onChange`, `label`, `min`, `max`, `step`, `format?` |
| `SearchField` | graue Suchpille mit Lupe und Löschen; im Handy über `PhoneScreen search` | `value`, `onInput`, `placeholder`, `onEscape?` |
| `NotificationCenter` | Mitteilungszentrale (Banner oder Statusleiste herunterziehen) | `open`, `items`, `onOpen`, `onClear`, `onClose`, `heading` |

- **Gefährliches nie direkt:** Entlassen, Verpfeifen & Co. laufen über ein `ActionSheet` (rote Aktion, „Abbrechen“).
- **Wischaktionen und Kontextmenüs** bieten nur an, was es schon als Knopf oder Befehl gibt. Sie sind Abkürzungen,
  nie der einzige Weg.
- **Haptik:** `haptic(kind)` aus `src/ui` mit `'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error'`
  (`haptics.ts`). Nutzt `navigator.vibrate`, sonst einen leisen Klick; folgt der Einstellung „Vibrieren“. Schalter,
  Segmente und Stepper geben `selection`, Rasten von Blättern `light`, langer Druck `medium`.
- **Drück-Rückmeldung:** Kacheln, Zeilen, Knöpfe werden beim Drücken kurz kleiner bzw. dunkler (`phone/press.ts`).
  Eigene Elemente bekommen sie mit `data-press`.

## Spiel-Handy (`phone/`)

**Navigation als Stapel** (`phone/navModel.ts`, reine Funktionen, getestet): `ui.phone.stack` ist eine Liste von
Seiten `{ kind: 'home' | 'app' | 'tab' | 'section' | 'panel', id, params?, title, key }`, unten immer der
Startbildschirm. Die bekannte API bildet sich darauf ab: `openPhone(appId, params)` (Wurzel einer App, ist sie schon im
Stapel, geht es dorthin zurück), `selectTab`, `openSection`, `openPanel` (legt eine Seite oben drauf; dasselbe Panel
mit anderen Werten ersetzt die oberste), `closePanel`, dazu `ui.back()` (eine Seite zurück). `ui.phone.app`,
`ui.panel`, `ui.tab` und `ui.section` werden aus dem Stapel abgeleitet. Darunter liegende Seiten bleiben gemountet
(höchstens zwei, Scrollposition bleibt), nur die oberste wird bei jedem Neuzeichnen aktualisiert. Der Zurück-Knopf
zeigt den Titel der Seite darunter (bis 14 Zeichen, sonst „Zurück“; neben einem Avatar nur den Pfeil).

**Bewegung** (`phone/spring.ts`, `motion.ts`, `stackAnimator.ts`): gedämpfte Federn wie in SwiftUI
(`response`/`dampingFraction`, unterbrechbar, Startgeschwindigkeit aus der Geste). `SPRINGS.push` 0,35/0,86,
`app` 0,45/0,8, `sheet` 0,4/0,85, `island` 0,3/0,7. Bewegt werden nur `transform` und `opacity`; `will-change` und
`<html data-moving>` nur, solange sich etwas bewegt. Bei „Bewegung reduzieren“ blenden Seiten nur kurz über.

**Gesten** (Pointer Events, Maus und Touch gleich; Regeln in `phone/gestureModel.ts`, getestet):
- vom linken Rand (≤ 24 px) wischen: eine Seite zurück, die Seite folgt dem Finger (über die Hälfte oder schneller
  als 0,5 px/ms zählt);
- am Home-Balken bzw. auf „Start“ hochwischen: App schrumpft auf ihre Kachel, auf dem Startbildschirm: weglegen;
- Statusleiste oder Banner herunterziehen: Mitteilungszentrale; Banner hoch: weg;
- Blatt am Griff ziehen (rastet bei mittel/groß, nach unten zu); langer Druck: Kontextmenü; Zeile nach links:
  Wischaktionen.


- `registerPhoneApp({ id, name, icon, order, component, badge?, color?, chrome?, hidden? })`: `color` ist eine Bedeutungsfarbe
  (`'money'`, `'goods'`, `'people'` … eine Farbe = eine Bedeutung; für alte Module geht auch eine CSS-Farbe, aus der der
  Verlauf abgeleitet wird), `badge(state, ui)` liefert den Zähler am Icon, `chrome: 'none'` heißt, die App zeichnet
  ihre Kopfleiste selbst mit `<PhoneScreen title onBack actions footer>`. Sonst setzt das Handy eine Leiste mit Zurück
  und App-Namen darüber.
- `PhoneScreen`: Navigationsleiste mit Large Title. Der große Titel scrollt mit, dann erscheint der kleine in der Mitte
  und die Leiste bekommt Glas und eine Haarlinie. Mit `leading` (Avatar) oder `inlineTitle` steht er von Anfang an klein.
  `onBack` und `backLabel` sind optional (Standard: `ui.back()` und der Titel der Seite darunter). Mit
  `search={{ value, onInput, placeholder }}` steht ein Suchfeld unter dem großen Titel; es erscheint, wenn man oben
  herunterzieht oder die Lupe antippt.
- **Abschnitte als eigene Seite:** Ein `Card` in einem Abschnitt (Listen-Tab) zeichnet im Handy keine Karte, ihre
  `actions` stehen rechts in der Navigationsleiste. Den Seitentitel liefert `registerSlot(…, { title })`.
- Kein Sperrbildschirm: Das Handy zeigt immer den **Startbildschirm** oder die zuletzt offene App.
- Tabs der Module erscheinen automatisch als Apps (`tab:<id>`), Panels als Seiten über der aktuellen App.
- `ui.openPhone(appId, params)` öffnet eine App, z.B. `ui.openPhone('core.messages', { contactId: 'gang:nord' })`.
- Widgets auf dem Startbildschirm: `registerSlot('phone.home', { id, order, component })`.
- `ui.notify({ title, text, icon, appId, params, sound, urgent? })` zeigt ein Banner, lässt das Handy vibrieren und
  spielt einen Ton; mit `urgent: false` nur still in die Mitteilungszentrale. Neue Nachrichten lösen das automatisch
  aus (Banner nur mit Antwortfrist).
- **Nachrichten:** Kontakte "tippen" (drei Punkte, nur Optik) bevor eine neue Nachricht erscheint. Kontaktart und Farbe:
  Gang rot, Polizei indigo, Team türkis, Lieferant braun, Kunde grün (Avatar, Gruppenkopf, Streifen an der Blase).
  Offene Fragen tragen den Stempel "Antwort!", die Antwortknöpfe stehen als Glasblatt unten (erster Knopf Gold). Die
  Aufbereitung ist in `messagesModel.ts` (getestet).

## Neuzeichnen und Selektoren

Die `UiRuntime` zeichnet nach Simulationsschritten höchstens zehnmal pro Sekunde neu, `App` und alles darunter ohne
`memo`. `useGame()` bleibt der Normalfall. Für Teile, die oft gezeichnet werden und sich selten ändern (HUD-Kacheln,
Startbildschirm des Handys, Flyouts), gibt es zusätzlich `useGameSelector(selector, equals?)` und
`useRuntimeSelector(…)` (`hooks.ts`, Kern in `selector.ts`): Sie lesen einen kleinen Auszug, vergleichen ihn bei jedem
Neuzeichnen der Runtime mit dem letzten und zeichnen die Komponente nur bei Änderung. Zusammen mit `memo()` auf
einer Komponente **ohne Props** überspringt das auch das Neuzeichnen von oben.

- Der Zustand ist veränderbar: Der Selektor liefert Zahlen, Texte oder frisch gebaute Auszüge (dann
  `shallowEqual`), nie eine Referenz auf ein Objekt aus dem Zustand.
- `memo()` nur, wenn die Komponente **alles**, was sie zeigt, über Selektoren liest (auch `useRuntimeSelector` für
  UI-Zustand wie Popover) und keine Daten aus dem Zustand in Props bekommt. Den Zustand nie beim Zeichnen in einer
  Closure festhalten (Klick-Handler lesen `runtime.state` erst beim Klick).
- Teure Lesefunktionen pro Spielstand einmal rechnen: `memoState(fn)`, mit Argumenten `memoStateKeyed(fn, keyOf)`
  (beide aus `src/ui`). Beispiele: `police/ui` (`hottestPresent`), `goods/ui` (`stockView`), Kasse (`reportOf` …).
- `details` einer `HudPill` als Komponente übergeben (`details={<StockFlyout />}`), nicht als fertigen Inhalt: Er
  rechnet dann erst, wenn die Karte aufgeklappt ist.

## Prüfen

- `npm test` prüft u.a. `styles/contrast.test.ts` (Kontrast aller Farbpaare, Hell und Dunkel, dazu Glas über der hellsten
  und dunkelsten Kartenfarbe, Zahl auf jeder Spot-Farbe, Akte, Razzia-Banner), `phone/islandModel.test.ts`
  (Stunden statt Minuten), `phone/messagesModel.test.ts`, `builtin/historyModel.test.ts`.
- `npm run screenshot:phone` (alle Handy-Seiten, Desktop und Handy-Bildschirm, `--appearance=light` für Hell).
- `npm run screenshot -- --scenes=alle` bzw. `npm run screenshot:glas` (Look Glas: Normalbetrieb in vier Tageszeiten,
  weggelegt, Spot-Hover, Orte, Konfrontation Briefing/Runde/Ergebnis, Razzia Alarm/Bilanz, Lieferung See/Kai/Lkw,
  Veedel übernommen; Desktop und Handy-Bildschirm nach `screenshots/glas/`, `--motion=reduce` für weniger Bewegung).
- `npm run audit:phone` misst am laufenden Spiel Zielgrößen (mindestens 44 px), Schriftgrößen (nie unter 11 px) und
  Textkontrast (4.5:1) in jeder Handy-Seite und endet mit Fehlercode bei Verstößen.
- `node scripts/phone-gestures.mjs` bedient das Handy mit Maus (Desktop) und Finger (Handy-Bildschirm, Touch) und prüft
  Rand-Wischen (60 % zurück, 20 % bleibt, schnell und kurz zurück), Hochwischen, langen Druck mit Esc und das Blatt.
  `--trace` schreibt einen Chrome-Trace für App-Öffnen und Rand-Wischen und meldet das Layout darin, `--video` nimmt
  einen Rundgang durch alle Übergänge auf (`screenshots/handy-videos/`).
- Tests der Modelle: `phone/navModel.test.ts`, `phone/spring.test.ts`, `phone/gestureModel.test.ts`, `haptics.test.ts`.

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

Stimmen im Anruf (`src/audio/piper/`): `audio.speak(text, contactVoice(contact), onEnd)` spricht mit dem Sprachmodell
Piper im Browser (Worker, Modelle einmalig von Hugging Face in den Cache), die Sprachausgabe des Browsers ist nur die
Notlösung. `audio.prepareVoice(voice)` lädt das Modell schon beim Klingeln, `audio.prepareSpeech(lines, voice)` rechnet
die Zeilen eines Gesprächs vor, `audio.setCall(true)` schaltet Musik, Effekte und Geräusche aus, solange gesprochen
wird. Stand der Modelle: `audio.voiceModels`, `audio.voiceState(voice)` (Einstellungen › Ton & Musik zeigt Fortschritt,
Laden und Entfernen; `CallScreen` zeigt „Stimme wird geladen …“ unter dem Namen).

## Einstellungen pro Gerät

`UiState.overlay`, `camera`, `vibration`, `moreNotifications` (`prefs.ts`, `localStorage` `koeln-tycoon:ui`), Ton unter
`koeln-tycoon:audio`.
