# Auftrag 46a: Tour-Baukasten (Spotlight-Erklärungen über dem Spiel)

Teil von [Auftrag 46 „Intro neu“](46-intro-neu.md), Abschnitt „Grundregeln“ und „Technik“. Lies den zuerst, dazu
`CLAUDE.md` und `src/ui/README.md`. Dieser Teil baut nur das **Werkzeug**, mit dem später jede Stufe des Tutorials
erklärt wird. Die Inhalte (Peters Texte je Stufe) und die Freischalt-Logik kommen in anderen Teilaufträgen (46b, 46c).
Branch: `claude/46a-tour-baukasten`, PR gegen `main`.

## Ziel

Eine **Tour** ist eine Liste von Schritten. Jeder Schritt zeigt auf ein Element der Oberfläche: Das Element ist
umrandet und leicht eingefärbt, der Rest des Bildschirms ist ausgegraut, daneben steht eine Box mit Peters Porträt,
ein, zwei Sätzen und „Weiter“. Beim nächsten Schritt wandert die Umrandung weiter. Während der Tour steht die Uhr.
Der Spieler soll hinschauen und kurz nachdenken, nicht lesen.

## Was gebaut wird

### 1. Anker

Elemente der Oberfläche bekommen ein Attribut `data-tour="<id>"`. Die IDs sind Daten (Liste in
`src/ui/tour/anchors.ts` als `TOUR_ANCHORS`, mit Kommentar, wo das Element steht), damit die Inhalte später nur
Namen kennen. Mindestens diese Anker setzen (im UI-Kern und in den `ui/`-Ordnern der Module, dort nur das
Attribut, sonst nichts ändern):

| Anker | Element |
| --- | --- |
| `hud.money` | der Geld-Kasten (Schwarzgeld und sauberes Geld zusammen) |
| `hud.money.dirty`, `hud.money.clean` | die beiden Zahlen darin |
| `hud.heat` | die Heat-Anzeige |
| `hud.clock`, `hud.weather`, `hud.speed` | Uhr, Wetter, Tempo-Regler |
| `hud.stock`, `hud.reputation`, `hud.rank`, `hud.territory` | Lager, Ruf, Rang, Reviere im HUD |
| `hud.mission` | die Karte unter Geld und Heat (heute die Quest-Karte, später die Missions-Karte) |
| `phone` | das ganze Handy |
| `phone.home` | der Startbildschirm |
| `phone.app.<appId>` | jedes App-Symbol (Raster und Dock), `appId` wie bei `registerPhoneApp` bzw. `tab:<id>` |
| `phone.screen` | der Inhalt der offenen App |
| `spot.panel` | das Spot-Fenster |
| `spot.customer` | die Kundenanzeige am Spot (Zähler, rot bei Ablauf) |
| `spot.sell`, `spot.price`, `spot.runner` | Verkaufen, Preis ändern, Läufer einstellen im Spot-Fenster |
| `map` | die Kartenfläche |

Fehlt ein Anker zur Laufzeit (Element noch nicht gerendert), wartet der Schritt bis zu zwei Sekunden darauf und
zeigt sonst die Box mittig ohne Umrandung. Nie einen Fehler werfen.

### 2. Schnittstelle (Export aus `src/ui/index.ts`)

```ts
export interface TourStep {
  id: string;
  /** Anker aus TOUR_ANCHORS; ohne Anker steht die Box mittig. */
  anchor?: TourAnchor;
  /** Ein, zwei Sätze. Mehr nicht. */
  text: string;
  title?: string;
  /** Wer spricht: Kontakt mit look und voice (Peter). Ohne Sprecher eine neutrale Box. */
  speaker?: Contact;
  /** Vor dem Schritt ausführen, z.B. ui.openPhone('tab:staff') oder die Karte auf einen Spot fahren. */
  before?: () => void | Promise<void>;
  /**
   * 'next' (Standard): Weiter-Knopf. Sonst muss der Spieler selbst etwas tun: Die Box zeigt keinen Weiter-Knopf,
   * der Anker bleibt bedienbar, alles andere ist gesperrt; weiter geht es, sobald das Ereignis kommt oder die
   * Bedingung am Zustand gilt.
   */
  waitFor?: 'next' | { event: keyof GameEvents } | { state: (state: GameState) => boolean };
  /** Lage der Box zum Anker, Standard automatisch (wo Platz ist). */
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
  /** Farbe der Umrandung, Standard 'brand'. */
  tint?: ChipColor;
}

export interface TourDef {
  id: string;
  steps: readonly TourStep[];
  /** Uhr anhalten (Standard true); Tempo wird am Ende wiederhergestellt. */
  pause?: boolean;
  /** Darf übersprungen werden (kleiner Knopf, Standard false). */
  skippable?: boolean;
}

// in UiApi (ui.tour.*):
start(def: TourDef): Promise<'done' | 'skipped'>;   // läuft schon eine Tour, wird die neue eingereiht
active(): string | null;                             // ID der laufenden Tour
skip(): void;                                        // beendet die laufende Tour
```

Die Tour ist **reine Oberfläche**: kein Zustand im Spielstand, kein `ctx`. Wer eine Tour zu einem Zeitpunkt des
Spiels braucht, startet sie aus seinem `ui/`-Ordner (später das Modul `tutorial`).

### 3. Overlay und Box

- Overlay über allem (unter Dialogen des Kerns, über Handy und HUD), ausgegraut mit dunklem Glas (Tokens
  `--hud-glass*`, siehe `src/ui/README.md` „Über der Karte: Look Glas“), Ausschnitt um den Anker mit 6 px Rand, runde
  Ecken wie das Element, Umrandung 2 px in der `tint`-Farbe plus leichte Füllung (10 bis 15 %) im Ausschnitt.
  Technik frei (SVG-Maske oder vier Flächen), muss auf dem Handy-Bildschirm und bei Größenänderung mitlaufen
  (`ResizeObserver`, Scroll im Handy) und bei Wechsel des Ankers weich wandern (Transition 250 ms, bei
  `prefers-reduced-motion` ohne).
- Alles außer dem Anker ist nicht bedienbar (bei `waitFor: 'next'` auch der Anker nicht).
- Box im Look Glas: links Peters Porträt (`<Avatar look>` aus `speaker.look`, 44 px), Name, darunter der Text (höchstens
  ein Satz pro Zeile Umbruch frei), unten rechts „Weiter“ (Primärknopf), unten links Punkte für den Fortschritt und, wenn
  `skippable`, klein „Überspringen“. Bei `waitFor` ohne `'next'` statt des Knopfs ein Hinweis „Mach das jetzt“ mit
  Pfeil-Symbol. Ein Pfeil oder Keil der Box zeigt zum Anker. Auf schmalen Bildschirmen (`useIsMobile`) liegt die Box
  immer unten als Blatt, der Ausschnitt bleibt.
- Tastatur: Enter oder Leertaste = Weiter. Esc tut nichts (kein Überspringen aus Versehen). Fokus liegt auf der Box
  (`role="dialog"`, `aria-live="polite"` für den Text).
- Ton: ein kurzer Klick beim Wechsel des Schritts (`audio`, vorhandener Sound), und wenn der Sprecher eine `voice` hat
  und die Sprachausgabe an ist, spricht er den Text mit `audio.speak` wie im Anruf. Fehlt das Modell, bleibt es still,
  keine Wartezeit.
- `pause`: beim Start `ui.setSpeed(0)`, am Ende das vorige Tempo zurück. Läuft die Tour, zeigt der Tempo-Regler
  „Pause“, lässt sich aber nicht bedienen (außer er ist selbst der Anker).

### 4. Vorschau und Prüfung

- `?tour=demo` startet nach dem Laden eine Demo-Tour über HUD, Handy (öffnet die Personal-App) und zurück. Daten in
  `src/ui/tour/demo.ts`.
- `npm run screenshot -- --scenes=tour` macht Bilder von drei Schritten (HUD-Anker, Handy-Anker, Blatt auf dem
  Handy-Bildschirm) nach `screenshots/tour/`.
- `npm run audit:phone` und `npm run monkey:phone` müssen weiter laufen (die Tour startet dort nicht).
- Tests: Lagebestimmung der Box (reine Funktion: Anker-Rechteck, Fenstergröße, Platzierung → Position), Reihenfolge
  und Warten (`waitFor` mit Ereignis und Zustand), Tempo zurück nach dem Ende, Verhalten ohne Anker.

## Regeln

- Nur `src/ui/` (neuer Ordner `src/ui/tour/`), `scripts/screenshot.mjs` für die Szene, und `data-tour`-Attribute in
  den `ui/`-Ordnern der Module. Keine Spiellogik, kein Modul-Zustand.
- Bausteine aus `src/ui/components`, Design-Tokens, Look Glas. Keine freien Hex-Werte.
- Texte Deutsch, Bezeichner Englisch. `src/ui/README.md` bekommt einen Abschnitt „Tour“ mit Schnittstelle und
  Anker-Liste; `docs/architektur.md` einen kurzen Verweis.
- Vor dem Push `npm run check`, `npm run build`, `npm run format`, `npm run e2e`. PR mit „Was ist neu“, „Wie
  testen“, „Für die Integration“ (dort: welche Anker fehlen noch, was 46b/46c wissen müssen).
