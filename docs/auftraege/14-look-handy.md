# Auftrag 14 – Look, Spiel-Handy und Sound

## Rahmen

- **Voraussetzung:** Auftrag 00 (Fundament) ist in `main` gemergt.
- **Parallel dazu laufen:** die Aufträge 10 bis 13. Halte dich an die Regeln in `docs/auftraege/README.md`.
- **Deine Ordner:** `src/ui/`, `src/map/`, `src/audio/`, `src/modules/weather/`, `public/`. Nur diese änderst du.
- **Wichtig:** Die anderen Sessions bauen gleichzeitig Panels mit den Bausteinen aus `src/ui/components/`. Deren Schnittstellen (Props, Exporte) darfst du erweitern, aber nicht brechen. Den Look änderst du über Design-Tokens und das Innere der Bausteine.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md` (dort steht, was du vorfindest).

## Ziel

Das Spiel bekommt seinen Look: realistisch und düster, eine Nacht-Satellitenkarte mit Überwachungs-Elementen, ein Spiel-Handy als zentrale Bedienung, eine dunkle, klare Oberfläche, Wetter, Musik und Sounds. PC und Handy sind gleichwertig.

## Muss drin sein

### Karte (`src/map/`)

- **Nacht-Satellit:**
  - Das Luftbild ist abgedunkelt, entsättigt und hat einen kalten Blaustich (Raster-Paint-Eigenschaften).
  - Die Straßen aus den OpenFreeMap-Vektordaten leuchten wie Laternen und werden nachts stärker.
  - Die 3D-Gebäude sind dunkel und haben nachts einen Effekt wie beleuchtete Fenster.
- **Tag und Nacht:** Übergang mit Dämmerung, an die Spieluhr gekoppelt. Tagsüber heller, nachts richtig finster.
- **Überwachungs-Elemente:** dezentes Raster, Scanlines, Koordinaten-Anzeige und Marker im Überwachungsstil (Zielkreuz, Label-Kästen). Als Overlay, abschaltbar.
- **Kamera:** 3D schräg als Standard, per Knopf auf 2D-Draufsicht umschaltbar. Die Europa-Ansicht für Lieferungen bleibt.
- **Effekt-Werkzeuge für andere Module** als API in `src/map/`:
  - Geld-Popups an einer Position
  - Blaulicht-Effekt
  - Fahrzeug entlang einer Linie animieren
  - Figuren-Marker an Spots
  Dokumentiere sie in `src/map/`, damit die Integration sie anbinden kann.

### Wetter (`src/modules/weather/`)

- **Wetterzustand:** klar, bewölkt, Regen, Gewitter, Schnee, Hitze. Es wechselt glaubwürdig über die Tage, deterministisch mit dem Spiel-Zufall.
- **Optik:** Regen- oder Schnee-Overlay und Farbstimmung auf der Karte.
- **API:** `getWeather(state)` und ein Nachfrage-Faktor, den Auftrag 12 bzw. die Integration nutzt.

### Oberfläche (`src/ui/`)

- **Look "clean und dunkel":** Design-Tokens (Farben, Schrift, Abstände, Radien, Schatten) passend zu Nacht-Satellit und Überwachungs-Look.
- **Bausteine** in `src/ui/components/` im neuen Look überarbeiten, ohne ihre Schnittstellen zu brechen.
- **Layout für Desktop und Handy gleichwertig:** Bottom-Sheet am Handy, große Touch-Ziele, nichts wird verdeckt.
- **Einheitliches Icon-Set:** Ein Icon-Paket ist erlaubt, im PR begründen.

### Spiel-Handy (`src/ui/phone/`)

- **Rahmen als zentrale Bedienung:** am Desktop seitlich eingeblendet, am Handy bildschirmfüllend.
- **Startbildschirm** mit App-Icons. Module melden ihre Apps über die Registry an.
- **Nachrichten-App:**
  - Die Nachrichten selbst verwaltet der Nachrichtendienst im Kern (aus dem Fundament). Die Aufträge 11, 12 und 13 schicken gleichzeitig darüber.
  - Du baust die App dazu: Chats pro Figur, Antwort-Optionen als Buttons, ungelesene Nachrichten.
  - Fehlt dem Dienst etwas, schreibst du das unter "Für die Integration".
- **Benachrichtigungen:** Badge, Vibrier-Animation und Sound.

### Sound (`src/audio/`)

- **Audio-Dienst:**
  - Musik-Playlist mit Stimmung je nach Tageszeit
  - Soundeffekte, die an Ereignisse gebunden werden
  - Lautstärke und Stummschalten, gemerkt pro Gerät
- **Platzhalter-Sounds:** frei lizenziert oder selbst erzeugt. Die Lizenz vermerkst du in `public/` bzw. in `docs`.
- **Erst nach Interaktion starten:** Audio beginnt erst nach der ersten Nutzerinteraktion (Browser-Regel).

## Nicht in diesem Auftrag

- Spielmechaniken der anderen Module
- die Panels der anderen Module (die bauen sie selbst, mit deinen Bausteinen)
- KI-generierte Porträts und Illustrationen (später)

## Fertig, wenn

- die Karte Tag, Nacht und Wetter sichtbar darstellt und zwischen 3D und 2D umschaltet
- das Spiel-Handy mit Nachrichten-App und App-Registry funktioniert
- Sound läuft
- Desktop und Handy geprüft sind (Screenshots in beiden Größen, z.B. per Playwright)
- Tests für Wetterverlauf und die Nachrichten-App vorhanden sind und `npm run check` grün ist (der Nachrichtendienst selbst liegt im Kern und ist dort getestet)
- die PR-Beschreibung die drei Abschnitte aus der README hat
