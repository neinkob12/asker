# Auftrag 00 – Fundament

## Ziel

Baue den Prototyp in eine Architektur um, auf der zwei Leute mit mehreren parallelen Claude-Sessions ein ganzes Spiel bauen können, ohne sich in die Quere zu kommen.

Nach diesem Auftrag starten fünf Sessions gleichzeitig (Aufträge 10 bis 14), jede in ihren eigenen Ordnern. Alles, was diese Sessions brauchen, um unabhängig voneinander zu arbeiten, muss nach diesem Auftrag vorhanden sein.

Diese Session arbeitet allein, niemand sonst ändert gerade Code.

## Vorher lesen

- `docs/konzept.md`: was das Spiel werden soll
- `docs/auftraege/README.md`: Phasenplan, welche Session welche Ordner besitzt, Regeln für Phase 1
- `docs/auftraege/10-*.md` bis `14-*.md`: was die parallelen Sessions bauen werden. Deine Schnittstellen müssen dafür reichen.
- den bestehenden Code in `src/`

## 1. Kern (`src/core/`)

- **Spielzustand:**
  - Ein einziges serialisierbares Objekt: nur JSON-Daten, keine Klassen, keine Funktionen.
  - Jedes Modul besitzt seinen eigenen Bereich `state.modules.<id>`.
  - Den Typ erweitern Module per TypeScript Declaration Merging (z.B. `interface ModuleStates`) aus ihrem eigenen Ordner. Kein Modul darf dafür eine zentrale Datei ändern müssen.
- **Feste Zeitschritte:**
  - Die Simulation läuft in festen Schritten (z.B. 1 Spielminute), unabhängig von der Bildrate.
  - Das Tempo (Pause, 1x, 2x, 4x) ändert nur, wie viele Schritte pro echter Sekunde laufen.
  - Die Zeit läuft nur, solange gespielt wird.
- **Zufall:**
  - Ein seedbarer Zufallsgenerator, dessen Zustand im Spielstand liegt.
  - Gleicher Spielstand plus gleiche Befehle ergeben das gleiche Ergebnis. Das ist die Voraussetzung für Tests und späteren Multiplayer.
- **Befehle:**
  - Jede Spieleraktion ist ein serialisierbarer Befehl (`{ type, payload }`), der über `dispatch()` läuft und von genau einem Modul verarbeitet wird.
  - Der Rückgabewert sagt, ob der Befehl geklappt hat und warum nicht.
  - Die UI verändert den Zustand nie direkt.
  - Befehlstypen werden ebenfalls per Declaration Merging erweitert.
  - Auch Leutnants (Auftrag 13) steuern später über dieselben Befehle.
- **Ereignisse:**
  - Ein typisierter Event-Bus, per Declaration Merging erweiterbar.
  - Module melden, was passiert ist (`sale.completed`, `shipment.arrived` …). Andere Module und die UI reagieren darauf.
  - Ereignisse aus einem Simulationsschritt werden in fester Reihenfolge zugestellt.
- **Modul-Registry:**
  - Module registrieren sich selbst über `import.meta.glob` aus `src/modules/*/index.ts`. Ein neues Modul anzulegen darf keine Datei außerhalb seines Ordners ändern.
  - Module geben Abhängigkeiten an. Die Registry initialisiert und tickt in passender Reihenfolge.
  - Module können sich auch seltener ticken lassen (z.B. stündlich).
- **Geld (`wallet`):** Schwarzgeld und sauberes Geld getrennt, mit einfacher API zum Einnehmen, Bezahlen und Prüfen.
- **Uhr:** Tag, Stunde, Minute und Wochentag, mit Hilfsfunktionen dafür.
- **Journal:** das Ereignis-Log aus dem Prototyp als Kerndienst, in das jedes Modul Einträge schreiben kann.
- **Nachrichten:**
  - Ein Kerndienst für Handy-Nachrichten von Figuren (Kunden, Lieferanten, Gangs, Mitarbeiter). Die Nachrichten liegen im Spielstand.
  - Eine Nachricht kann Antwort-Optionen haben, die Befehle auslösen.
  - Die Aufträge 11, 12 und 13 schicken darüber Nachrichten. Auftrag 14 baut die Handy-App dazu.
- **Spielende:**
  - Ein zentraler Dienst, über den Module Game Over mit Grund auslösen (`bankrupt`, `killed`).
  - Die Pleite-Regel ist die erste Bedingung: kein Geld, keine Ware und keine laufende Lieferung.
  - Analog ein Sieg-Ereignis (`campaign.won`), danach läuft das Spiel im Endlosmodus weiter.
- **Spielstände:**
  - Mehrere Speicherplätze plus Autosave.
  - Beim Anlegen wird der Modus gewählt: Normal oder Hardcore. Bei Hardcore wird der Spielstand bei Game Over gelöscht.
  - Export und Import als JSON-Datei.
  - Jedes Modul versioniert seinen State-Bereich selbst und bringt eigene Migrationen mit, damit alte Spielstände Updates überleben.
  - Alte Spielstände aus dem Prototyp dürfen verworfen werden.

## 2. Modul-Vertrag

- Eine Funktion wie `defineModule({ id, version, dependsOn, init, tick, commands, migrations, ... })`. Die genaue Form legst du fest.
- Jedes Modul hat eine `index.ts`: Registrierung plus öffentliche API. Andere Module importieren nur daraus.
- Wenn es mit vertretbarem Aufwand geht, erzwingt eine Lint-Regel das.
- Tests liegen neben dem Code im Modulordner.
- Lege `src/modules/_template/` als kommentierte Kopiervorlage an (wird nicht registriert).

## 3. Schnittstellen für die parallelen Sessions

Lege für jedes Modul aus der Tabelle in `docs/auftraege/README.md` den Ordner mit öffentlicher API an.

- Die API ist dokumentiert und minimal, aber lauffähig implementiert. Die parallelen Sessions ersetzen später das Innere und erweitern die API.
- Lies dazu die Aufträge 10 bis 14 und überlege, was jede Session von den anderen braucht. Genau das muss es als Schnittstelle schon geben.

Mindestens:

| Modul | Was die Schnittstelle können muss |
| --- | --- |
| `veedel` | ca. 12 zentrale Kölner Stadtteile mit ID, Name und Mittelpunkt (u.a. Altstadt-Nord, Altstadt-Süd, Neustadt-Nord, Neustadt-Süd, Deutz, Ehrenfeld, Lindenthal, Sülz, Nippes, Kalk, Mülheim). `veedelAt(lng, lat)` als Näherung über den nächsten Mittelpunkt. Die echten Grenzen folgen in Auftrag 10. |
| `territory` | Einfluss pro Veedel und Fraktion lesen und ändern, Kontrolle eines Veedels abfragen. Fraktionen sind der Spieler und die Gangs. |
| `police` | Heat pro Veedel lesen und erhöhen, Ereignisse für Razzia und Festnahme, Befehl oder Funktion zum Verpfeifen einer Gang. |
| `gangs` | Liste der Gangs mit ID, Name und Farbe. Vorerst 3 Platzhalter-Gangs. |
| `encounters` | Konfrontation starten. Der Stub entscheidet sofort per Zufall. |
| `goods` | Produkte, Bestand pro Lager (vorerst ein Lager), Ware entnehmen und einlagern. |
| `market` | Richtpreis pro Produkt und Veedel. |
| `customers`, `spots` | aus dem Prototyp portiert. Spots bekommen eine `veedelId`. Verkauf löst `sale.completed` aus (Spot, Veedel, Produkt, Menge, Erlös). |
| `suppliers` | Bestellung in Rotterdam und Transporter aus dem Prototyp portiert. |
| `reputation`, `laundering` | leere Module mit minimaler API (Ruf lesen, Geld waschen). |
| `staff` | die Läufer aus dem Prototyp als erste Mitarbeiter. Werte eines Mitarbeiters lesen (für Konfrontationen), Mitarbeiter-Status (aktiv, in Haft). |
| `hierarchy`, `recruiting` | leere Module mit minimaler API. |
| `weather` | aktuelles Wetter lesen (Stub: immer klar). |

Nicht jede Zeile muss genau so heißen. Ordner und Zuständigkeiten aus der README-Tabelle müssen aber stimmen. Weichst du ab, passe die README-Tabelle und die Aufträge 10 bis 14 an.

## 4. Bestehende Features portieren

Alles, was der Prototyp kann, muss danach wieder spielbar sein, nur in der neuen Struktur:

- Spots und Kunden
- Bestellung in Rotterdam mit Transporter auf der Karte
- Läufer und Löhne
- Tempo und Pause
- Log und Statistik

Das Balancing darf gleich bleiben. Einstellbare Werte liegen im jeweiligen Modul in einer `config.ts`.

## 5. Oberfläche (`src/ui/`)

- **Framework:** Preact mit JSX. Kein Zusammenbauen von HTML-Strings mehr.
- **UI-Shell** mit festen Bereichen:
  - HUD oben
  - Seitenleiste mit Tabs am Desktop, Bottom-Sheet am Handy
  - Dialoge und Toasts
  - ein Platzhalter-Rahmen für das Spiel-Handy
- **Module liefern ihre eigenen Oberflächen:**
  - Jedes Modul legt seine Oberflächen in `src/modules/<id>/ui/` ab.
  - Angemeldet werden sie über Registries: HUD-Anzeigen, Seitenleisten-Tabs, Panels, Dialoge und Handy-Apps.
- **Gemeinsame Bausteine** (Button, Card, Liste, Fortschrittsbalken, Tabs, Dialog …) liegen in `src/ui/components/`.
- **Design-Tokens:** Farben, Abstände und Schriften als CSS-Variablen. So kann Auftrag 14 den Look zentral ändern.
- **Datenfluss:** Die UI liest den Zustand und schickt Befehle, sonst nichts.
- **Neuzeichnen:** Die UI aktualisiert sich nach Simulationsschritten, gedrosselt auf ca. 10 Mal pro Sekunde.

## 6. Karte (`src/map/`)

- Die Basis bleibt MapLibre.
- Module fügen eigene Layer und Marker über eine Registry hinzu. Der Kartencode eines Moduls liegt in dessen Ordner.
- Die Grundkarte (Stil, Kamera, Umschalten Köln/Europa) liegt in `src/map/`.

## 7. Qualität und Zusammenarbeit

- **`CLAUDE.md` im Repo-Root** mit:
  - Architektur in Kürze und Ordnerregeln
  - Sprachregel: Code-Bezeichner Englisch, Kommentare, UI-Texte, Commits und PRs Deutsch
  - wie man ein Modul anlegt, Befehle und Ereignisse definiert und Migrationen schreibt
  - was vor jedem Push laufen muss
  - einen Verweis auf `docs/auftraege/README.md` für die Regeln bei parallelen Sessions
- **`docs/architektur.md`:** ausführliche Beschreibung mit Übersicht aller Module und ihrer öffentlichen APIs, Befehle und Ereignisse.
- **Lint und Format:** Biome, mit den Scripts `lint`, `format` und `check`. `check` führt Typecheck, Lint und Tests aus.
- **CI:** GitHub Actions führt bei jedem PR und jedem Push auf `main` Typecheck, Lint, Tests und Build aus.
- **Tests:**
  - Kern: fester Zeitschritt, Determinismus bei gleichem Seed, Befehle, Speichern und Laden inklusive Migration, Game Over
  - jedes portierte Modul
- **README:** an die neue Struktur anpassen.

## Nicht in diesem Auftrag

- neue Spielinhalte (Gangs-KI, Veedel-Grenzen, Produkte, Mitarbeiter-Werte …), nur die Schnittstellen dafür
- kein neuer Look

## Fertig, wenn

- `npm run check` und `npm run build` grün sind und die CI grün ist
- die Features des Prototyps im Browser spielbar sind (selbst ausprobiert, z.B. per Playwright-Screenshot)
- belegt ist (Test oder Beispiel), dass ein neues Modul angelegt werden kann, ohne eine Datei außerhalb seines Ordners zu ändern
- der PR beschreibt, was jede der fünf parallelen Sessions vorfindet und welche Schnittstellen sie nutzen kann
