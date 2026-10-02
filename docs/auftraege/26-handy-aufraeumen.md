# Auftrag 26: Handy aufräumen (weniger Apps, ruhiger Startbildschirm, Nachrichten, HUD)

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/26-handy-aufraeumen.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, docs/handy-design.md, src/ui/README.md und
docs/auftraege/README.md.
```

Kann **gleichzeitig mit Auftrag 28** laufen (der ändert vor allem Spiellogik). **Auftrag 27 startet erst, wenn dieser
Auftrag gemergt ist**, weil er auf der neuen App-Struktur aufbaut.

## Wunsch aus dem Probespielen (02.10.2026)

> Wir fokussieren uns aufs Handy. Auf dem Startbildschirm sollen Tag und Wetter weg. Das Pop-up-Fenster, das fast
> immer da ist, muss weg. Es dürfen nicht so viele Push-Benachrichtigungen kommen, nur das Allerwichtigste. Die drei
> Knöpfe Lager, Ruf und Köln braucht man da nicht. Von den zehn Apps: Wetter in die Einstellungen. Ereignisse weg oder
> in die Einstellungen als Historie, wo man seinen Stand exportieren kann. Kontakte sind nur Leute, die man einstellen
> kann, also mit Leute zusammenlegen und Personal nennen. Meldungen schaut man sich nie an, weg oder in die
> Einstellungen. Logistik sollte eigentlich Geldwäsche heißen, die Fahrer gehören zum Personal. Aufträge ist nur eine
> Historie und steht gleichzeitig in den Nachrichten. Das Geschäft im Dock ist nur eine Sammlung von Dingen, die es
> woanders auch gibt, das kann weg. Die Dock-Leiste ist nicht richtig zentriert. Nachrichten finde ich gut, aber sie
> sollten kompakter sein, man sollte die letzten Kontakte sehen, alle als gelesen markieren und Chats löschen können,
> auch alle auf einmal. Der Hintergrund mit dem Kölner Dom ist cool, aber lieber einfach schwarz.
>
> Über der Karte: Wetter weg. Revier-Anzeige (4 von 7) und Ruf zusammenlegen. Ruf lieber als Leiste von 0 bis 100 mit
> den Rängen links und rechts von mir, damit ich sehe, was bei besserem oder schlechterem Ruf passiert. Beim Lager
> weiß man nicht, was "2,1 kg + 489" ist: Beim Drüberfahren oder Antippen soll sich die genaue Aufstellung aufklappen,
> mit einem Knopf, der die Lieferanten-App öffnet. Schwarzgeld und sauberes Geld öffnen per Klick die Geldwäsche.
> Ziel: Von der Karte kommt man mit einem Schritt an die richtige Stelle im Handy.

## Rahmen

- **Ganzer Code freigegeben**, Schwerpunkt `src/ui/` und die `ui/`-Ordner der Module. Spiellogik nur, wo ein Punkt es
  verlangt (Banner-Regeln). Ordnerregeln aus `CLAUDE.md` gelten (`npm run lint`).
- **Auftrag 28 läuft vielleicht parallel** und ändert `customers`, `staff`, `hierarchy`, `spots`, `logistics` (Logik).
  Fass deren Logik nicht an. Konflikte in `ui/`-Ordnern löst, wer zuletzt merged (`main` mergen, nicht rebasen).
- **Nichts geht verloren, es zieht nur um.** Jede Funktion, die heute eine eigene App oder Kachel hat, ist danach
  höchstens zwei Tipps entfernt erreichbar (Einstellungen, Personal, Geldwäsche, Spot- oder Veedel-Seite).
- **Bausteine aus Auftrag 22 benutzen** (`Group`, `ListItem`, `SwipeRow`, `ActionSheet`, `Sheet`, `ContextMenu`),
  Bedeutungsfarben statt Hex, Look "Glas" über der Karte. Fehlt etwas, Baustein in `src/ui/components` erweitern.
- **Sprachregel, Determinismus, Migrationen, keine neuen npm-Pakete** wie immer. Gelöschte Chats sind Spielzustand
  (`core/messages`): Version hochzählen, Migration, Test.
- **Arbeite in Etappen** (unten). Nach jeder Etappe `npm run check`, Commit, Push. Draft-PR nach Etappe 1.
  Vor dem letzten Push zusätzlich `npm run build`, `npm run e2e`, `npm run screenshot:phone`, `npm run audit:phone`.

## Entscheidungen (vorab getroffen)

| Thema | Entscheidung |
| --- | --- |
| Startbildschirm | Schwarzer Hintergrund (keine Skyline). Keine Heute-Zeile (Tag, Wetter), keine Kennzahlen-Zeile (Lager, Ruf, Köln). Uhrzeit steht nur in der Statusleiste. |
| "Nächster Schritt" | Kein festes Widget mehr auf dem Startbildschirm. Ratschläge (`registerAdvisor`) erscheinen nur noch, wenn sie dringend sind (Priorität ab 80, z.B. Chat mit Frist), als eine Zeile ganz oben, wegwischbar. Der Rest ist über die Suche (Strg/⌘+K) erreichbar. |
| Apps im Raster | **Kasse, Reviere, Gangs, Personal, Geldwäsche, Einstellungen.** Sonst keine. |
| Dock | **Nachrichten, Lieferanten, Personal, Kasse** (vier Plätze, sauber zentriert, auch am Handy-Bildschirm). Geschäft fällt weg. |
| Personal | Eine App aus "Leute" (Tab `staff`) und "Kontakte" (`recruiting`): oben eigene Leute nach Rolle, darunter "Leute finden" mit Bewerbern und Rumfragen. Fahrer aus der Logistik stehen hier als eigene Rolle. |
| Geldwäsche | Die App "Logistik" heißt **Geldwäsche** und zeigt die Geldwäsche groß (Ausbau in Auftrag 27). Hafen, Lager und Routen ziehen in die Lager- bzw. Spot-Seiten; die Fahrer ins Personal. |
| Aufträge | Keine eigene App mehr. Offene Anfragen kommen wie bisher als Chat mit Antwort-Knöpfen, die Historie steht in den Einstellungen unter "Verlauf". (Auftrag 28 macht daraus später die Gruppe Auftragsfahrer.) |
| Einstellungen | Neue Abschnitte: **Wetter** (Vorhersage aus der Wetter-App), **Verlauf** (Ereignisse + Meldungen + Aufträge-Historie in einer Liste mit Filter, dazu Spielstand exportieren). |
| Banner | Nur noch **dringend**: Antwort mit Frist, Razzia/Konfrontation, Festnahme, Lieferung angekommen oder verloren, Löhne reichen nicht, Game-Over-Gefahr. Alles andere still (Badge an der App, Eintrag im Verlauf). Eine Einstellung "Mehr Benachrichtigungen" holt das alte Verhalten zurück. |
| Nachrichten | Liste kompakter (eine Zeile pro Chat plus Vorschau), oben eine Reihe mit den letzten Kontakten als Avatare, Knopf "Alle gelesen", Chat löschen per Wischen, "Alle löschen" im Menü (mit `ActionSheet`). Gelöschte Chats mit offener Frist: erst nachfragen. |
| HUD über der Karte | Bleibt: Uhr, Tempo, Schwarzgeld, sauberes Geld, Heat, Lager, Ruf. Weg: Wetter. **Ruf und Reviere werden eine Anzeige.** |

## Etappen

### 1. Startbildschirm und App-Liste

- `src/ui/phone/PhoneFrame.tsx`: `DOCK` und `HOME_ORDER` nach der Tabelle, Heute-Zeile und `phone__stats` raus,
  `Skyline` raus (Hintergrund `var(--color-bg)` bzw. schwarz in beiden Farbschemata), `NextStepWidget` nur bei
  dringendem Rat. Dock-Zentrierung prüfen (`phone.css`, `.phone__dock`, auch in `MobileDock`).
- Tab `business` (Geschäft) nicht mehr als App zeigen. Die Slots `tab:business` (Lager, Kasse, Kundschaft, Ruf,
  Geldwäsche, Logistik, Personal, Polizei-Stufe, Spots, Bestellen, Markt) einzeln prüfen: Was es woanders schon gibt,
  fällt weg; der Rest zieht an die passende Stelle (z.B. Spots-Liste nach Reviere, Polizei-Stufe nach Reviere oder
  Kasse). Tab `journal` (Ereignisse) nicht mehr als App.
- Apps `weather.app`, `core.alerts`, `customers.orders`, `logistics.app` (umbenennen, siehe Etappe 3) und
  `recruiting.contacts` (in Personal, Etappe 3) vom Startbildschirm nehmen. Die Registrierung darf bleiben, wenn
  andere Stellen sie per `openPhone` öffnen; dann nur ausblenden (z.B. `hidden: true` in `PhoneApp`, Baustein
  erweitern). Alle `openPhone('…')`-Aufrufe im Code auf die neuen Ziele umbiegen.

### 2. Einstellungen: Wetter und Verlauf

- `src/ui/phone/SettingsApp.tsx`: Abschnitt **Wetter** (Inhalt der bisherigen Wetter-App, Komponente aus
  `weather/ui` über den bestehenden Slot `'core.settings'` anmelden, nicht importieren). Abschnitt **Verlauf**: Journal,
  Meldungen und Auftrags-Historie in einer Liste, Filter (Alles, Geld, Leute, Polizei, Gangs, Aufträge), darunter
  "Spielstand exportieren" (gibt es schon im Menü Spielstände, dorthin verlinken oder Funktion teilen).

### 3. Personal und Geldwäsche

- **Personal:** Tab `staff` heißt "Personal". Die Kontakte-App (`recruiting/ui`) hängt sich als Abschnitt "Leute
  finden" in die Personal-Seite (Slot `tab:staff`), nicht mehr als eigene App. Fahrer (`logistics`) erscheinen in der
  Rollen-Liste. Filter oben als Segment (Alle, Läufer, Fahrer, Sicherheit, Spezialisten) statt drei Auswahllisten.
- **Geldwäsche:** `logistics.app` umbenennen bzw. eine App `laundering.app` (Name "Geldwäsche", Icon Geld, Farbe
  `money`) anlegen, die den Geldwäsche-Inhalt zeigt. Was die Logistik-App sonst zeigt (Hafen, Lager, Routen, Fahrer),
  zieht auf die Lager-Seite (`goods.warehouse`-Panel) und ins Personal. Größer ausgebaut wird die Geldwäsche in
  Auftrag 27, hier nur umziehen.

### 4. Nachrichten

- `src/ui/phone/MessagesApp.tsx` + `messagesModel.ts`: kompaktere Zeilen, "Zuletzt"-Reihe (die 5 zuletzt aktiven
  Kontakte als Avatare), "Alle gelesen", Wischen zum Löschen (`SwipeRow`), "Alle löschen" (`ActionSheet`).
- `src/core/messages.ts`: Befehle bzw. Funktionen zum Löschen und Alles-Gelesen-Markieren (Kern darf das, weil
  Nachrichten Kern sind). Gelöschte Chats tauchen wieder auf, wenn die Figur neu schreibt. Tests.

### 5. Weniger Banner

- Eine zentrale Regel statt Einzelfälle: `ui.notify` bzw. `messages.send` mit Wichtigkeit. Prüfen, wo Banner
  entstehen (`src/ui/runtime.ts: notify`, `toast`, Live-Activities der Dynamic Island, `messages.send` ohne `silent`)
  und alles, was nicht in der Banner-Zeile der Tabelle steht, still machen. Einstellung "Mehr Benachrichtigungen"
  (Prefs, pro Gerät). Mit `npm run playthrough` vorher/nachher zählen: Ziel höchstens ein Banner pro zwei Spielstunden
  im normalen Spiel ohne Krise.

### 6. HUD über der Karte

- Wetter-Anzeige (`weather.now`, `placement: 'time'`) raus aus dem HUD.
- **Ruf + Reviere:** eine Anzeige "Ruf" mit Leiste 0 bis 100 und der Revierzahl daneben (z.B. "4/7"). Beim
  Antippen/Drüberfahren klappt eine kleine Karte auf: aktueller Rang, nur der Rang links und rechts davon mit je einem
  Satz, was sich ändert (Daten aus `reputation`), und die Reviere als Mini-Liste. `territory.campaign` geht darin auf.
- **Lager:** Antippen/Drüberfahren zeigt die Aufstellung nach Produkt (Menge, Qualität, Lager), Knopf "Bestellen"
  öffnet die Lieferanten-App. Die Kurzanzeige zeigt eine Zahl mit Einheit, die man versteht (z.B. "2,1 kg Gras +
  489 Stück"), nicht "2,1 kg + 489".
- **Geld:** Schwarzgeld und sauberes Geld öffnen per Klick die Geldwäsche-App.

## Abnahme

- Startbildschirm: schwarz, 6 Apps im Raster, 4 im Dock, sauber zentriert, kein Widget im Normalfall (Screenshot
  Desktop und Handy in `screenshots/handy/`).
- Jede frühere App-Funktion ist erreichbar; `npm run e2e` grün (Test anpassen, wo er alte App-Namen nutzt).
- Nachrichten: alle gelesen, einzeln löschen, alle löschen funktionieren, auch nach Speichern und Laden.
- Playthrough zählt deutlich weniger Banner als vorher (Zahl im PR).
- HUD: kein Wetter, Ruf mit Leiste und Revieren, Lager klappt auf, Geld öffnet Geldwäsche.
- `npm run audit:phone` ohne Verstöße.
- PR-Beschreibung: "Was ist neu", "Wie testen", "Für Auftrag 27" (was noch offen ist).
