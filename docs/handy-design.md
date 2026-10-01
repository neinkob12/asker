# Handy-Design: Plan, Ableitungen aus der HIG und Prüfung

Umbau des Spiel-Handys nach dem Skill `apple-design` (Apple Human Interface Guidelines, "Design improvement mode").
Dieses Dokument hält fest, **was aus welcher HIG-Datei abgeleitet wurde**, wie der Plan aussah, was an ihm kritisiert
wurde und wie das Ergebnis geprüft ist. Tokens und Bausteine stehen in [`src/ui/README.md`](../src/ui/README.md),
die Schnittstellen in [`architektur.md`](architektur.md).

## 1. Worum es geht (Grundlage)

- **Produkt:** Köln Tycoon, Browserspiel: vom Kleindealer zum Boss auf der Karte von Köln. Das Spiel-Handy ist die
  Schaltzentrale (Nachrichten, Geschäft, Leute, Lieferanten, Reviere …). Die Zielgruppe ist der Freundeskreis am
  Desktop und am iPhone, also Leute, die iOS kennen.
- **Aufgabe jeder Handy-Seite:** in wenigen Sekunden sehen, was Aufmerksamkeit braucht, und dorthin springen. Das Handy
  soll sich wie iOS anfühlen (vertraut) und wie ein Tycoon-Spiel aussehen (Farbe, Symbole, Zahlen, die etwas sagen).
- **Stimmung:** Nachtschicht in Köln. Dunkel, Kölsch-Gold als Marke, Farbe nur mit Bedeutung.

## 2. Was aus welcher HIG-Datei abgeleitet wurde

| Datei (`references/hig/…`) | Regel (Kurzfassung) | Umsetzung im Handy |
| --- | --- | --- |
| `design-principles.md` | Simplicity: "every element earning its place"; Delight ist nicht Dekoration | Alles ohne Aufgabe fliegt raus (großes Wetter-Widget, Musik-Titelbild, doppelter Kartentitel im Journal). Farbe und Icons tragen Information. |
| `accessibility.md` | 17 pt Standard, 11 pt Minimum; Kontrast 4.5:1 (bis 17 pt), 3:1 (ab 18 pt oder fett); Ziele 44 × 44 pt; nicht nur Farbe; Reduce Motion | Typo-Skala nach iOS-Textstilen, alle Farbpaare per Test mit echten Hex-Werten geprüft, Ziele 44 px, jede Farbe hat Icon oder Text dabei, `prefers-reduced-motion` und `reduced-transparency` |
| `typography.md` | Body 17, Large Title 34 bold, Footnote 13, Caption 12/11; wenige Schriften; Hierarchie über Gewicht und Größe | Tokens `--type-*` (Large Title 34 bis Caption 2 11), eine Schrift (System/Inter), Zahlen tabellarisch |
| `color.md` | Eine Farbe, eine Bedeutung; Farben mit Hell- und Dunkelvariante; Farbe sparsam auf Glas | Bedeutungsfarben mit `light-dark()`, nur auf Kacheln und Zeichen, Glas bleibt neutral |
| `dark-mode.md` | Basis- und erhöhte Flächen, weiche Weißtöne, min. 4.5:1 | Flächenstufen `--phone-bg` / `--phone-group` / `--phone-group-2`, Text nie reines Weiß auf Reinschwarz für Fließtext-Sekundärfarben |
| `designing-for-ios.md` | Wenige Bedienelemente, Wichtiges mittig oder unten, Swipe zurück | Dock unten, Zurück links, Antwortknöpfe als Blatt unten |
| `layout.md` | Safe Areas, Gruppen, keine Vollbreiten-Knöpfe, Layout auf dem Rand fortsetzen | Statusleiste in Ohren links/rechts der Island, Inhalt läuft unter Leisten weiter, Abstände im 4er-Raster (16 px Rand) |
| `status-bars.md` | Statusleiste zeigt Zeit, Empfang, Akku; Inhalt darunter nicht mit ihr überlappen | Drei Spalten: Uhrzeit links, Island Mitte, Empfang/WLAN/Akku rechts, feste Ohren |
| `live-activities.md` | Kompakt: eng um die Kamera, ausgewogen; Island 230 pt breit; Radius 44; kräftige Farben auf Schwarz; weniger, wichtigere Updates | Kompakt höchstens 230 px, links Symbol, rechts Wert; nur Stunden statt Minuten (kein Zappeln), Aufklappen nur bei Priorität 80 |
| `tab-bars.md` | Tab-Leiste für Navigation, sichtbar, wenige Tabs, nicht verstecken | Entscheidung siehe Abschnitt 5 (Dock statt Tab-Leiste) |
| `toolbars.md` | Large Title wird beim Scrollen zum Standardtitel; Zurück mit Symbol; eine Hauptaktion rechts; Glas nur für die Leiste | `PhoneScreen`: Large Title mit Übergang zum Inline-Titel, Leiste bekommt beim Scrollen Glas und Haarlinie |
| `sheets.md` | Cancel/Done-Logik, Grabber, Sheet unten | Antwortblatt im Chat unten mit Griff, Dialoge am Handy als Blatt |
| `lists-and-tables.md` | Gruppierte Listen, Disclosure-Pfeil nur bei Navigation, kurze Texte | Einstellungen-Stil: eingerückte Gruppen, Icon-Kachel, Titel, Wert, Pfeil |
| `settings.md` | Wenige Einstellungen, allgemeine gehören in die Einstellungen, aufgabenbezogene zur Aufgabe; Systemoptionen nicht doppeln | Musik und Einstellungen sind eine App "Einstellungen" mit den Abschnitten Ton & Musik, Anzeige, Spiel |
| `toggles.md`, `segmented-controls.md` | Schalter nur in Listenzeilen; Segmente für nahe Ansichten, höchstens ca. 5 | iOS-Schalter (Pille) in Zeilen, `SegmentedControl` statt Eigenbau (Alle/Offen) |
| `icons.md`, `sf-symbols.md` | Ein Stil, gleiche Strichstärke, Gewicht passend zum Text, Alternativtexte, keine Emoji-Mischung | Ein Linien-Set (24er-Raster, Strich 1.75), Kachel-Glyphen 2.0, Emojis der Staff-Rollen ersetzt |
| `app-icons.md` | Einfaches Symbol auf Farbverlauf, klare Kanten, kein Text | App-Kacheln mit weißem Symbol auf Verlauf, Radius 22,5 % |
| `materials.md`, `liquid-glass.md` | Glas nur für die schwebende Ebene (Leisten, Island, Dock), sparsam, Fallback bei reduzierter Transparenz | Glas: Navigationsleiste beim Scrollen, Dock, Antwortblatt, Banner. Karten und Zeilen bleiben flach. |
| `motion.md` | Kurz, abbrechbar, nicht bei häufigen Aktionen, optional | Federn nur für Island und Seitenwechsel, sonst 100–180 ms, alles aus bei Reduce Motion |
| `writing.md` | Klare Verben, konsistente Großschreibung, leere Zustände zeigen den nächsten Schritt | Beschriftungen "Antworten", "Öffnen", "Rumfragen"; Leerzustände mit Aktion |
| `branding.md` | Marke weicht dem Inhalt, eine Akzentfarbe, Logo nicht überall | Gold nur für Hauptaktion und "Nächster Schritt"; Skyline nur auf dem Startbildschirm |
| `notifications.md` | Badge nur für Ungelesenes; kurze Titel | Rote Zähler nur für Ungelesenes/Offenes, Banner zeigt Absender und Text |

## 3. Plan

### 3.1 Farben: eine Farbe, eine Bedeutung

Bedeutungsfarben (Namen im Code: `--cat-*`), jede mit Text-/Symbolfarbe, getöntem Grund und Füllung für Kacheln
(Hell und Dunkel per `light-dark()`, Werte und Kontrast siehe Abschnitt 6):

| Bedeutung | Farbe | Wo |
| --- | --- | --- |
| Geld, Gewinn, Aufträge, "in Ordnung" | Grün | Geld sauber, Kasse, Kunden/Aufträge, Status gut, Schalter an |
| Schwarzgeld | Violett | Schwarzgeld, Geldwäsche |
| Gefahr | Rot | Heat, Gangs, Überfälle, Fehler |
| Frist, Achtung | Orange | Meldungen, Fristen, Status Achtung |
| Dein Geschäft, Nächster Schritt | Kölsch-Gold | Geschäft, Hauptaktion, Marke |
| Ort, Info | Blau | Reviere, Spots, Karte, Anzeige |
| Ware, Lieferung | Braun | Lager, Lieferungen, Lieferanten |
| Personen | Türkis | Leute, Kontakte, Bewerber |
| Nachrichten | Mint | Nachrichten, Chat-Blase des Spielers |
| Himmel | Cyan | Wetter |
| Recht | Indigo | Polizei |
| Ton | Rosa | Ton und Musik |
| Neutral | Grau (System), Papier (Protokoll) | Einstellungen, Ereignisse |

Flächen: Nachtschwarz (`--phone-bg`), Gruppen `#1c1c1e`, erhöht `#2c2c2e`; Text weiß, sekundär 60 %.
Marke: Kölsch-Gold `#e2ae4a` (Hauptknopf, "Nächster Schritt", Fokus).

### 3.2 Typografie

Eine Schrift (San Francisco, sonst Inter), Zahlen tabellarisch. Skala nach iOS-Textstilen:
Large Title 34/41 bold, Title 2 22/28, Headline 17/22 semibold, Body 17/22, Subhead 15/20, Footnote 13/18,
Caption 12/16, Caption 2 11/13. Fließtext (Blasen, Journaltext, Leerzustände) 17, Hinweise 15, Metadaten 11–13.

### 3.3 Layout

```
Handy (Desktop 0,5 · 1:2, Handy-Bildschirm füllt den Platz)     Statusleiste (54 px, drei Spalten)
┌────────────────────────────────────┐                          ┌────────┬───────────┬────────┐
│ 06:00  [ Island 126–230 ]  ▂▄▆ ᯤ ▭ │                          │ 06:00  │  Island   │ ▂▄▆ ᯤ ▭│
│                                    │                          └────────┴───────────┴────────┘
│ Samstag, Tag 2         ☀ 7° Klar  │  Start: Heute-Zeile
│ ┌ NÄCHSTER SCHRITT (Gold) ───────┐ │  Signature: Kölner Skyline im Hintergrund,
│ │ [Symbol] 2 Chats warten [Los]  │ │  Himmel folgt der Spielzeit
│ └────────────────────────────────┘ │
│ ┌ Lager ┬ Ruf ┬ Köln ────────────┐ │  Kennzahlen als drei Kacheln mit Symbol
│ [Reviere][Gangs][Aufträge][Kontakte]│  App-Raster: 4 Spalten, 2 Zeilen
│ [Ereign.][Meldung.][Wetter][Einst.] │
│ ╭ Dock (Glas): Nachr. Geschäft Lief. Leute ╮
│              ▬▬▬                   │
└────────────────────────────────────┘
App-Seite:  ‹ Start        [Titel erscheint beim Scrollen]   [Aktion]   (Glas beim Scrollen)
            Großer Titel
            Gruppen (Icon-Kachel · Titel · Wert · ›)
```

### 3.4 Signature

**Die Kölner Skyline auf dem Startbildschirm**, deren Himmel der Spielzeit folgt (Nacht mit goldenen Fenstern, Dämmerung,
Tag). Sie ist das Einzige, was das Handy als Köln Tycoon erkennbar macht (Dom, Rheinbrücke, Colonius, Kranhäuser
kennt man von der Karte). Alles andere bleibt ruhig und iOS-typisch.

### 3.5 Bewegung

Ein orchestrierter Moment: die Island. Sie klappt bei Gefahr (Priorität ab 80) mit einer Feder auf. Sonst nur kurze
Übergänge (Seitenwechsel, Large Title, Badge). Bei Reduce Motion alles ohne Bewegung. Seit Auftrag 22 laufen alle
Übergänge über Federn und folgen Gesten (Abschnitt 7).

## 4. Kritik am Plan (vor der Umsetzung)

1. **Wäre derselbe Plan für ein anderes Produkt entstanden?** Dunkel plus eine Akzentfarbe plus SF ist die zweite
   der drei Standard-Looks aus dem Skill ("near-black with one accent"). Rein iOS-Dunkelmodus wäre also generisch.
   → Die Skyline mit zeitabhängigem Himmel und die Bedeutungsfarben (Braun für Ware, Violett für Schwarzgeld, Mint für
   Nachrichten) stammen aus dem Spiel. Kölsch-Gold ist Marke und bleibt an genau einer Rolle hängen. **Beibehalten.**
2. **Zu viele Farben?** Zwölf Kategorien sind viel. Gegenmittel: Farbe steht nur in Kachel und Symbol, nie als
   Vollfläche im Inhalt; Text bleibt weiß/grau; jede Farbe kommt immer mit Symbol und Beschriftung (kein Farbcode
   allein). Türkis/Mint/Cyan liegen nah beieinander → unterscheiden sich durch Helligkeit und immer durch das Symbol.
   **Beibehalten, mit Prüfung auf dem Screenshot.**
3. **Tab-Leiste in jeder App?** Sie würde 83 px der ohnehin kürzeren Höhe kosten, kollidiert mit dem Antwortblatt im
   Chat und dupliziert das Dock. → Dock nur auf dem Startbildschirm (Abschnitt 5). **Kein Tab-Balken.**
4. **Glas überall?** Nein, nur schwebende Ebene: Navigationsleiste beim Scrollen, Dock, Antwortblatt, Banner, Island.
   Karten, Zeilen und Widgets sind flach (Materials: "Don't use Liquid Glass in the content layer").
5. **Musik-App streichen?** Musik ist eine Einstellung mit Player, keine eigene App (Settings: allgemeine, selten
   geänderte Optionen; aufgabenbezogenes gehört zur Aufgabe). → Abschnitt "Ton & Musik" mit kleinem Player.
6. **Hell-Modus?** Das Spiel bleibt dunkel (Karte, HUD). Das Handy trägt aber beide Varianten, weil `color.md` das
   auch für Ein-Modus-Apps verlangt. → Tokens per `light-dark()`, das Handy folgt der Systemeinstellung. Getestet
   mit beiden Schemata.

## 5. Tab- oder Dock-Leiste? Entscheidung

- **Dock ja, Tab-Leiste nein.** Das Handy ist das Betriebssystem des Spiels: Apps sind Vollbild, das Dock hält die vier
  wichtigsten (Nachrichten, Geschäft, Lieferanten, Leute) am unteren Rand des Startbildschirms, dort erreicht man sie
  mit dem Daumen. Das ist genau das, was iOS macht (`designing-for-ios.md`: wichtige Bedienelemente unten).
- **Warum keine Tab-Leiste in den Apps:** `tab-bars.md` sagt, Tabs sind Top-Level-Bereiche *einer* App und müssen immer
  sichtbar sein. Hier wechseln Spieler ohnehin über den Home-Balken und Tastenkürzel (T, Buchstabe) zwischen Apps; eine
  Leiste in jeder App kostet Höhe, verdoppelt das Dock und beißt sich mit dem Antwortblatt (`sheets.md`).
  Innerhalb einer App teilen Segmente (`segmented-controls.md`) nahe Ansichten (Alle/Offen, Kontakte/Bewerber).

## 6. Prüfung (Stand der Umsetzung)

### 6.1 Vorher / Nachher

| | Vorher | Nachher |
| --- | --- | --- |
| Form | Seitenverhältnis 0,46 (das des Bildschirms, mit Rahmen zu schmal), Breite `min(430px, (100dvh − 24px) × 0,4613)`, Höhe fest 940 px | Seitenverhältnis 0,49 des ganzen Geräts (iPhone 16 Pro: 0,478), Breite `min(440px, (100dvh − 24px) × 0,49)`, Höhe folgt der Breite: passt immer ins Fenster |
| Statusleiste | kleine Uhrzeit und Symbole, dicht an der Island | drei Spalten: Uhrzeit links, Island in der Mitte, Empfang/WLAN/Akku rechts, mit Sicherheitszone; nichts wird verdeckt |
| Island | Fristen als "45 Min." und "1:30 h" | nur Stunden ("2 Std.", unter einer Stunde "< 1 Std."), zweite Aktivität als Kreis daneben |
| Startbildschirm | Widgets, Wetter-Karte, App-Liste mit dunklen Kacheln | Heute-Zeile mit Wetter-Knopf, "Nächster Schritt", drei Kennzahlen, Raster mit farbigen Verlaufs-Icons, Dock, Skyline von Köln |
| Musik und Einstellungen | zwei Apps und ein Dialog | eine App "Einstellungen" mit Ton & Musik (Player), Anzeige, Spiel |
| Ereignisse | eine Karte mit rotem Text für fast alle Zeilen | Zeitachse nach Tagen mit Filter, Papier-Farbe, Zeitstempel |
| Nachrichten | flache Liste, dieselbe blaue Kachel für alle, Text nach einer Zeile abgeschnitten | gruppiert nach Kontaktart, Avatare in Kategorie-Farbe, Ungelesen-Zähler, Tag "Antwort · Frist", Segmente Alle/Offen |
| Leute, Kontakte | Karten mit Auswahlfeldern, leer ohne Bilder | Porträt mit Rollen-Icon, Status-Tag, Kennzahlen, Gruppen nach Rolle |
| Farbe | dunkle Kacheln mit getönten Symbolen, Farben ohne feste Bedeutung | 14 Bedeutungsfarben, eine Farbe = eine Bedeutung, jede mit Hell/Dunkel |
| Icons | Emoji und Symbole gemischt | ein Set (Strichstärke, Stil), Icon-Kacheln mit Verlauf, Statusbadges, Geld mit Beutel (schwarz) und Münze (sauber) |

Bilder: `screenshots/handy/` (mit `npm run screenshot:phone` selbst erzeugen; das Verzeichnis ist nicht eingecheckt).

### 6.2 Kontraste (echte Werte aus `tokens.css`, geprüft von `contrast.test.ts`)

Text und Symbol in der Bedeutungsfarbe auf der Gruppenfläche (hell `#ffffff`, dunkel `#1c1c1e`), Symbol weiß bzw.
dunkel auf dem schwächeren Ende des Kachel-Verlaufs. Grenzen: Text 4,5:1, Symbol auf Kachel 3:1.

| Bedeutung | Hell | Dunkel | Text hell | Text dunkel | Symbol auf Kachel |
| --- | --- | --- | --- | --- | --- |
| `money` | `#1d7031` | `#30d158` | 6,2:1 | 8,4:1 | 3,7:1 |
| `dirty` | `#8b41ab` | `#d891ff` | 6,1:1 | 7,6:1 | 3,7:1 |
| `danger` | `#b72a22` | `#ff7b73` | 6,2:1 | 6,8:1 | 3,6:1 |
| `warn` | `#994e00` | `#ff9f0a` | 6,1:1 | 8,3:1 | 5,6:1 |
| `brand` | `#835a00` | `#e2ae4a` | 6,1:1 | 8,4:1 | 7,0:1 |
| `place` | `#095fbe` | `#6ab2ff` | 6,2:1 | 7,6:1 | 3,6:1 |
| `goods` | `#755e42` | `#c8aa85` | 6,1:1 | 7,7:1 | 3,7:1 |
| `people` | `#1a6b7b` | `#40c8e0` | 6,1:1 | 8,6:1 | 3,6:1 |
| `chat` | `#006d69` | `#63e6e2` | 6,2:1 | 11,3:1 | 3,7:1 |
| `sky` | `#1e688c` | `#64d2ff` | 6,2:1 | 9,9:1 | 3,7:1 |
| `law` | `#5452cb` | `#a7a5ff` | 6,1:1 | 7,7:1 | 4,2:1 |
| `media` | `#b32a49` | `#ff899f` | 6,3:1 | 7,6:1 | 3,6:1 |
| `system` | `#5c5c61` | `#b4b4b9` | 6,6:1 | 8,2:1 | 3,6:1 |
| `log` | `#6b6247` | `#d9d2bf` | 6,1:1 | 11,3:1 | 6,5:1 |

Dazu geprüft (79 Tests): Beschriftungen (primär, sekundär, tertiär) auf allen Flächen, Text auf dem getönten Grund
jeder Kategorie, Hauptknopf, Schalter und Fokusring (3:1), Chat-Blase, Himmel des Startbildschirms, die dunkle Island.
Am laufenden Spiel misst `npm run audit:phone` zusätzlich Zieltreffer, Schriftgrößen und Kontrast aus den
berechneten Farben: **31 Szenen je Größe (Startbildschirm, alle Apps, Detailseiten, Island-Zustände), dunkel und hell, Desktop und Handy-Bildschirm, keine Verstöße** (Stand dieser
Änderung; Text auf Verläufen misst der Audit nicht, dafür gelten die Token-Tests).

### 6.3 Checkliste der fünf Lenses

**Accessibility**
- [x] Zieltreffer mindestens 44 × 44 px (Audit; die Island und ihr Kreis erreichen das über eine größere Trefferfläche)
- [x] Fließtext 17 px, nichts unter 11 px (Audit)
- [x] Kontrast 4,5:1 Text, 3:1 große Schrift und Bedienelemente (Tests und Audit)
- [x] Farbe trägt nie allein: Status haben Text oder Symbol (Tags, Badges, Rollen-Icons)
- [x] `prefers-reduced-motion`: Animationen aus; `prefers-reduced-transparency`: Glas wird deckend;
      `prefers-contrast`: stärkere Linien und Text
- [x] Fokusring sichtbar (`--color-focus`), Schalter mit `role="switch"`
- [ ] VoiceOver/Screenreader nicht mit echtem Gerät getestet (nur Rollen und Beschriftungen im Code geprüft)

**Plattform-Konventionen**
- [x] Statusleiste, Island, Home-Balken, Dock, gruppierte Listen, Large Title → Inline-Titel, Segmente, iOS-Schalter
- [x] Zurück links, Hauptaktion unten im Antwortblatt, Abschnittsüberschriften in Großbuchstaben
- [x] Glas nur auf der schwebenden Ebene (Leisten, Island, Dock, Banner), Inhalte flach
- [x] Tab-Leiste bewusst ersetzt durch Dock (Abschnitt 5)

**Craft**
- [x] Ein Icon-Set, eine Strichstärke, Verlaufs-Kacheln aus Tokens; keine Emoji in der Oberfläche der umgebauten Apps
- [x] Abstände aus `--space-*`, Radien aus `--radius-*`, Schrift aus `--type-*`
- [x] Ein Signature-Element: die Skyline (Dom, Groß St. Martin, Kranhäuser, KölnTriangle), nachts mit leuchtenden Fenstern
- [x] Kleine Fenster (Container-Queries) und große Fenster geprüft

**Interaktion**
- [x] Rückmeldung: Zähler zählen, Zahlen fliegen, Island wächst, Blasen gleiten ein
- [x] Klare Wege zurück (Zurück-Knopf, Esc im Chat geht zur Liste, Home-Balken)
- [x] Keine Sackgassen: Leerzustände mit Aktion ("Kontakte öffnen")

**Writing**
- [x] Deutsch, kurze Verben ("Antworten", "Öffnen"), einheitliche Großschreibung
- [x] Fristen in der Island nur in Stunden ("2 Std.", "< 1 Std.")
- [x] Leerzustände sagen, was man tun kann

### 6.4 Nachgezogen mit Auftrag 21 (Logistik)

Die neuen Oberflächen aus Auftrag 21 sind nach denselben Regeln gebaut und stehen im Audit (`phone-scenes.mjs`:
`lieferant-gesperrt`, `lieferant-bereit`, `logistik`, `logistik-hafen`, `geschaeft-logistik`, `spot-hinstellen`;
dunkel und hell ohne Verstöße):

- **Logistik** (neue App, Braun = Ware, Symbol `route`, im Raster bei den Spiel-Apps nach Aufträge): Kennzahlen als
  Kacheln (Am Kai, Fahrten, Fahrer), Abschnitte Hafen, Unterwegs, Lager, Zu kaufen, Fahrer, Zuletzt. Fristen als Etikett
  mit Symbol (`timer` „bis 08:00“, `alert` „Zoll“), Leerzustände mit nächstem Schritt („Liegeplatz mieten“, „Zu Jansen“,
  „Fahrer anheuern“), keine Vollbreiten-Knöpfe.
- **Lieferanten:** Liste in zwei Gruppen („Liefern an dich“, „Noch kein Geschäft“) mit Kachel (Transporter, Schiff,
  Schloss), was noch fehlt als Zweitzeile, Status als Etikett. Gesperrte Lieferanten zeigen ihre Bedingungen als
  Zeilen mit Haken bzw. Schloss und Fortschritt. Ein Lieferant lässt sich direkt öffnen
  (`ui.openPhone('suppliers.app', { supplierId })`, wie ein Chat).
- **Spot:** „Selbst verkaufen“ als Zeile mit Gold-Kachel (dein Geschäft) und Knopf „Hier hinstellen“ bzw. „Weggehen“.
- **Leute:** Rolle Fahrer mit Symbol `truck` in Braun (wie Kuriere), eigene Gruppe.
- Neue gemeinsame Bausteine statt Kopien pro Modul: `Group`, `ItemContent`, `SummaryTiles` (in `src/ui/components`).

### 6.5 Offene Punkte

- **Hell-Modus** ist in den Tokens vorbereitet und wird getestet (Audit `--appearance=light`), aber nicht angeboten:
  Das Spiel bleibt dunkel wie die Karte. Ein Schalter in "Anzeige" wäre der nächste Schritt.
- **Tief umgebaut** sind Startbildschirm, Nachrichten, Meldungen, Einstellungen, Ereignisse, Leute, Kontakte,
  Lieferanten und Logistik, mit Auftrag 22 auch Spot, Veedel, Markt, Gangs, Aufträge und die Geschäft-Abschnitte
  (Gruppen, Zeilen, Kennzahl-Kacheln, Stepper, Blätter; Abschnitt 7).
- **Sehr niedrige Fenster** (unter ca. 700 px Höhe): Das Handy wird schmal, der Inhalt scrollt.
- **Neun Apps im Raster:** Mit Logistik hat der Startbildschirm eine dritte Reihe (nur Einstellungen). Das Wetter hat
  zusätzlich den Knopf in der Heute-Zeile; wenn die Skyline mehr Platz braucht, könnte die Wetter-Kachel aus dem
  Raster weichen.
- **Text auf Verläufen** (Startbildschirm, Kachel-Beschriftung im Wallpaper) misst der Audit nicht; er ist über die
  Token-Tests abgedeckt.
- **Biome-Warnungen** (`noDescendingSpecificity` in den Handy-Stilen, `!important` in `base.css` für reduzierte
  Bewegung) sind nur Warnungen und ändern das Verhalten nicht.
- **Kein Test mit echten Geräten** (iPhone Safari, Android): Die Größen und Sicherheitszonen stützen sich auf Chromium
  und `env(safe-area-inset-*)`. Ränder wie auf einem iPhone (oben 59 px, unten 34 px) sind nachgestellt geprüft
  (Abschnitt 7.6), Touch über das DevTools-Protokoll (`scripts/phone-gestures.mjs`).

## 7. Interaktion wie iOS (Auftrag 22)

Bis hier **sah** das Handy aus wie ein iPhone, fühlte sich aber nicht so an: kein einziger Pointer-Handler, Seiten
tauschten hart, Übergänge waren feste CSS-Kurven, es gab weder Blätter noch Menüs noch Rückmeldung beim Drücken, und am
echten Handy lag eine gezeichnete Statusleiste unter der echten. Grundlage der Werte: HIG (Gestures, Sheets, Menus,
Context menus, Playing haptics, Motion) und das Verhalten von UIKit/SwiftUI.

### 7.1 Navigation als Stapel

`ui.phone.stack` (`src/ui/phone/navModel.ts`, reine Funktionen mit Tests): Startbildschirm, App bzw. Tab, Abschnitt,
Panel. Jede Seite kennt ihren Titel, der Zurück-Knopf zeigt den Titel der Seite darunter („‹ Geschäft“, bis 14 Zeichen,
sonst „Zurück“). Die alte API (`openPhone`, `selectTab`, `openSection`, `openPanel`, `closePanel`) bleibt und wird auf
den Stapel abgebildet, Module mussten nichts ändern. Darunter liegende Seiten bleiben gemountet (höchstens zwei, dazu der
Startbildschirm), deshalb stimmt beim Zurückgehen die Scrollposition, und während einer Geste ist die Vorseite schon da.

### 7.2 Federn

Gedämpfte Federn wie SwiftUI `.spring(response:dampingFraction:)`, geschlossen gerechnet (`phone/spring.ts`, getestet:
Ankommen, Überschwingen, Startgeschwindigkeit, Umlenken mitten in der Bewegung, lange Bilder).

| Feder | response | dampingFraction | Wofür, warum so |
| --- | --- | --- | --- |
| `push` | 0,35 s | 0,86 | Seiten vor und zurück. Fast kritisch: Die Seite darf nicht über den Rand schwingen (sonst blitzt die Vorseite rechts auf). Fühlt sich an wie UINavigationController. |
| `app` | 0,45 s | 0,8 | App aus der Kachel öffnen und hinein schließen. Größere Fläche, etwas träger, mit ca. 1,5 % Nachfedern („Aufploppen“). |
| `sheet` | 0,4 s | 0,85 | Blätter, Mitteilungszentrale. Rasten spürbar, aber nicht wackelig. |
| `island` | 0,3 s | 0,7 | Dynamic Island. Klein und lebendig, ca. 5 % Überschwingen. |
| `snap` | 0,25 s | 1 | Kleine Rückmeldungen (Zeile, Banner zurück). |

Eine Geste übergibt beim Loslassen ihre Geschwindigkeit, eine laufende Bewegung lässt sich jederzeit umkehren (zweimal
schnell Zurück und wieder hinein springt nicht). Bewegt werden nur `transform`, `opacity` und `clip-path`;
`will-change` und `<html data-moving>` gibt es nur, solange sich etwas bewegt. Gemessen mit `--trace` auf Desktop-Größe:
App öffnen 5 Layouts (zusammen 11 ms, längstes 6–8 ms, das ist der Aufbau der neuen Seite), Rand-Wischen 3 Layouts
(zusammen 1,6 ms, längstes unter 1 ms). Die Bilder selbst kosten im Test vor allem Rastern ohne Grafikkarte, nicht Layout.

### 7.3 Übergänge

- **App öffnen:** Die App wächst aus ihrer Kachel (Rechteck mit runden Ecken, `clip-path`), eine Kopie des Icons blendet
  darüber aus, der Startbildschirm weicht zurück (94 %, abgedunkelt). Schließen läuft genau umgekehrt in die Kachel,
  ohne Kachel (z.B. App aus der Suche) in die Mitte.
- **Push/Pop:** Die neue Seite kommt von rechts, die alte gleitet um 30 % nach links und wird um 16 % dunkler (Parallaxe).
  Der große Titel der alten Seite wandert in den Zurück-Knopf der neuen (und beim Zurückgehen wieder heraus).
- **Blätter:** von unten mit Griff, mittel und groß. Bei groß rückt die Seite dahinter zurück (93 %, runde Ecken oben),
  wie bei iOS-Sheets. Die Seite dahinter ist dann `inert` (modal) und trägt `data-modal`, damit der Seitenstapel
  (`stackAnimator.ts`) sie beim nächsten Zeichnen nicht wieder bedienbar macht.
- **Drücken:** Kacheln schrumpfen auf 96 %, Zeilen werden grau, sofort beim Aufsetzen, Loslassen federt zurück.
- **Island:** eine einzige Form, die zwischen kompakt, Puls und aufgeklappt morpht (FLIP mit `island`-Feder), statt zwei
  Kästen, die überblenden.
- **Reduzierte Bewegung:** Seiten blenden in 160 ms über, nichts gleitet oder federt.

### 7.4 Gesten

Alle über Pointer Events, Maus und Touch gleich (Regeln in `phone/gestureModel.ts`, getestet). Jede Geste ist eine
Abkürzung: Es gibt immer auch einen Knopf oder eine Taste.

| Geste | Wo | Zählt, wenn | Ohne Geste |
| --- | --- | --- | --- |
| Rand-Wischen zurück | Start höchstens 24 px vom linken Rand | über die Hälfte oder schneller als 0,5 px/ms; die Seite folgt dem Finger | „‹ Titel“, Esc |
| Hochwischen | Home-Balken (Desktop) bzw. „Start“ (Handy-Bildschirm) | ein Achtel der Höhe oder schnell; die App schrumpft dabei auf ihre Kachel | Antippen, Esc |
| Herunterziehen | Statusleiste oben, Banner | 40 bzw. 56 px oder schnell | — (Mitteilungen auch in der App „Meldungen“) |
| Banner hoch | Banner | 24 px oder schnell | verschwindet von selbst |
| Blatt ziehen | Griff und Kopf des Blatts | rastet bei mittel und groß; mehr als ein Drittel unter „mittel“ (mit Schwung gerechnet): zu | ×, Esc, Tipp daneben |
| Langer Druck | Kacheln, Chats, Spots, Leute | 500 ms ohne Bewegung (auch Rechtsklick, Shift+F10) | die Aktionen gibt es auf der Seite selbst |
| Zeile nach links | Chats, Aufträge | Aktion freilegen, ganz durchziehen löst die erste aus | Knopf in der Zeile bzw. auf der Seite |

Gefährliches (Entlassen, eine Gang verpfeifen) läuft nie direkt über eine Geste oder einen Knopf, sondern über ein
Aktionsblatt mit roter Aktion und „Abbrechen“. Wischaktionen bieten nur Harmloses an, das es schon als Knopf gibt
(gelesen, Auftrag ablehnen). Innerhalb des Handys gilt `overscroll-behavior: contain`, Gesten halten
den Zeiger fest (Pointer Capture), und waagerechtes Wischen blättert nie im Browser-Verlauf.

### 7.5 Haptik

`haptic(kind)` (`src/ui/haptics.ts`): `selection` (Schalter, Segmente, Stepper), `light` (Blatt rastet), `medium`
(langer Druck), `success`, `warning`, `error`. Kurze Muster mit `navigator.vibrate` (6–24 ms, wie die Taptic Engine,
nie ein Brummen), dazu ein leiser Klick. Folgt der Einstellung „Vibrieren“. iOS Safari kann nicht vibrieren, dort bleibt
nur der Klick.

### 7.6 Echtes Handy

Auf schmalen Bildschirmen mit Touch (`(max-width: 760px) and (pointer: coarse)`) zeichnet das Spiel keine zweite
Statusleiste (Uhrzeit, Empfang, Akku) und keine Kamera-Attrappe mehr. Die Island wird eine schwebende Pille mit der
Spielzeit und denselben Live-Aktivitäten. Statt des gezeichneten Home-Balkens (er läge direkt über dem echten) steht
unten eine Leiste „Start“ / „Weglegen“ über dem sicheren Bereich; Hochwischen auf „Start“ wirkt wie der Home-Balken.
Nachgestellt mit iPhone-Rändern (oben 59 px, unten 34 px): HUD, Pille und Leiste bleiben frei von Island und
Home-Balken. Am Desktop bleibt das Gerät mit Rahmen, Statusleiste und Island; der Knopf zum Weglegen sitzt jetzt neben
dem Gerät statt über dem Inhalt.

### 7.7 Was bewusst fehlt und warum

- **Sperrbildschirm:** Das Handy ist die Schaltzentrale eines laufenden Spiels. Ein Sperrbildschirm wäre ein Tipp mehr
  vor jeder Handlung, ohne etwas zu schützen.
- **App-Umschalter:** Apps sind leicht (ein Tipp vom Startbildschirm, Tastenkürzel am Desktop, Suche mit Strg/⌘+K). Ein
  Umschalter bräuchte mehrere Stapel nebeneinander und die Halte-Geste am Home-Balken, die am echten Handy dem System
  gehört.
- **Kontrollzentrum:** Ton, Musik und Tempo stehen schon im HUD und in den Einstellungen. Oben rechts herunterziehen
  kollidiert am echten iPhone mit dem echten Kontrollzentrum.
- **Hell/Dunkel-Schalter:** Das Spiel bleibt dunkel wie die Karte (6.5); die Tokens können beides, das Audit prüft
  beides.
- **Blatt am Inhalt ziehen:** Blätter zieht man am Griff und Kopf. Scrollender Inhalt, der am oberen Ende das Blatt
  übernimmt, wäre wie bei iOS möglich, kostet aber eine zweite Gestenlogik für wenig Gewinn.
- **Rand-Wischen in Safari:** Im Browser-Tab gehört der linke Rand Safari (Zurück im Verlauf). Als Web-App vom
  Home-Bildschirm gehört er dem Spiel.
- **Zoomen im Handy:** Die Scrollflächen erlauben nur senkrechtes Wischen (`touch-action: pan-y`), damit waagerechte
  Gesten ankommen. Apps auf iOS zoomen auch nicht.

### 7.8 Vorher / Nachher

| | Vorher | Nachher |
| --- | --- | --- |
| Navigation | `ui.phone.app` plus einzelnes Panel, Zurück mit festem Text | Stapel mit Titeln, Zurück zeigt die Vorseite, Seiten bleiben gemountet |
| Übergänge | CSS mit fester Dauer, Seiten tauschen hart | Federn, unterbrechbar, App aus der Kachel, Parallaxe, wandernder Titel |
| Gesten | keine | Rand-Wischen, Hochwischen, Herunterziehen, Blatt, langer Druck, Wischzeilen |
| Rückmeldung | keine | Drücken (96 %, grau), Haptik und leiser Klick |
| Bausteine | Dialoge außerhalb des Handys, zwei lose Knöpfe für Preise | Sheet, ActionSheet, ContextMenu, SwipeRow, Stepper, SearchField, NotificationCenter |
| Modul-Seiten | Karten in Karten, abgeschnittene Knöpfe, umbrechende Werte, Schließen über dem Inhalt | Gruppen, Zeilen mit Wert rechts, Kennzahl-Kacheln, Aktionen in der Leiste |
| Echtes Handy | zweite Statusleiste und Kamera im echten Bildschirm, Home-Balken doppelt | Live-Aktivitäts-Pille mit Spielzeit, Leiste „Start“ / „Weglegen“, sichere Bereiche |

Bilder: `npm run screenshot:phone` (neue Szenen `kontextmenue`, `blatt-mittel`, `blatt-gross`, `aktionsblatt`,
`mitteilungen`, `rand-wischen`, `suche`, `wischzeile`, `spot`, `gang`, `gangs`, `marktdetail`). Videos aller Übergänge:
`node scripts/phone-gestures.mjs --video`.

### 7.9 Prüfung

- Tests: `navModel` (Stapel, Titel, Zurück-Beschriftung), `spring`, `gestureModel`, `haptics`.
- `node scripts/phone-gestures.mjs`: Maus (Desktop) und Touch (Handy-Bildschirm) je Rand-Wischen 60 % → zurück,
  20 % → bleibt, schnell und kurz → zurück, Hochwischen → Startbildschirm, langer Druck → Kontextmenü, Esc schließt es,
  Blatt nach unten → zu. Alle grün.
- `npm run audit:phone` (Dunkel und Hell, Desktop und Handy-Bildschirm, mit den neuen Szenen): keine Verstöße.
- `npm run e2e` unverändert grün (Desktop und Handy-Bildschirm).
- Gefunden und behoben beim Prüfen: Touch-Wischen vom Rand blätterte im Browser-Verlauf zurück (fehlendes
  `touch-action` auf den Scrollflächen), der Klick beim Loslassen nach einem langen Druck schloss das Kontextmenü
  sofort wieder, wenn man länger als 0,6 s hielt, und die Seite hinter einem großen Blatt blieb bedienbar.

## 8. Über der Karte: Look Glas (Auftrag 24)

Von den vier Richtungen aus Auftrag 22 (A Glas, B Lagebild, C Noir, D Kontor) ist **A „Glas“** umgesetzt, und zwar für
alles außerhalb des Handys. Das Handy selbst bleibt, wie es ist; neu ist nur, wie es mit der Karte zusammenspielt.

- **Eine Sprache für die Karte:** dunkles Glas (`--hud-glass*`, immer dunkel, auch am Tag), Barlow für Text und Barlow
  Condensed für Zahlen und Titel, Beschriftungen in 11-px-Versalien in der Bedeutungsfarbe. Damit ist klar getrennt:
  SF/Inter und iOS-Flächen im Handy, Glas und Barlow über der Karte. Bei weniger Transparenz oder mehr Kontrast wird
  das Glas deckend (`#16181d`).
- **HUD in drei Gruppen** links vom Handy (Geld mit Heat, Uhr mit Wetter und Tempo, Kennzahl-Kacheln). Die Kacheln
  stehen zusätzlich weiter auf dem Startbildschirm des Handys.
- **Keine Meldungsliste über der Karte:** `ui.toast` landet als Banner im Handy (Glas, Kachel in der Farbe der Meldung,
  Wischen wie bei Benachrichtigungen) bzw. oben rechts, wenn es weggelegt ist, und in der App Meldungen.
- **Folgen mit derselben Feder:** HUD, Kartensteuerung, Überlagerungen, Dialoge über der Karte und die Kamera der Karte
  halten sich an `--map-right` und gleiten beim Ein- und Ausklappen mit `SPRINGS.app` (als CSS-Kurve, `springEasing`);
  das Handy blendet mit derselben Kurve ein.
- **Dialoge über der Karte überdecken das Handy nicht** (`registerDialog({ area: 'map' })`). Nur eine Konfrontation, die
  das Spiel pausiert, dunkelt das Handy ab und sperrt es (`inert`), damit man nicht nebenher weiterspielt. Razzia-Bilanz
  und „Veedel übernommen“ lassen es bedienbar. Am Handy-Bildschirm sind dieselben Inhalte Blätter (`Sheet`, `MapDialog`).
- **Klicks auf der Karte** öffnen die passende Seite im Handy als Push mit stimmendem Zurück-Titel: Spot und Veedel
  (`openPanel`), Gang (`gangs.gang`, neu statt des ganzen Tabs), Lager (`goods.warehouse`), Hafen (`openPhone`).
- **Island bleibt die Quelle** für das Live-Geschehen (Razzia, Konfrontation, Lieferung; die Übernahme als kurzer
  Auftritt); die Karte zeigt dieselben Daten groß (Banner, Akte, Tracking-Karte, goldener Schein).
- **Handy-Bildschirm:** oben nur Geld und Uhr, Spots ohne Plakette (Schild und Striche), Menü in der Kartensteuerung.
  Nichts liegt unter der echten Statusleiste oder dem Home-Balken (sichere Bereiche über `--top` und `--safe-*`).

Geprüft: Kontrast-Test für alle neuen Tokens (Text auf Glas über der hellsten und dunkelsten Kartenfarbe 4,5:1, Zahl auf
jeder Spot-Farbe 4,5:1, Akte, Razzia-Banner, Gold-Knöpfe), `npm run audit:phone` ohne Verstöße, Bilder aller Momente in
vier Tageszeiten (`npm run screenshot -- --scenes=alle`), „Bewegung reduzieren“ ohne Pulse, Sirenenschein und Federn.
