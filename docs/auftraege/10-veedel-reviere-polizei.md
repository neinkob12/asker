# Auftrag 10 – Veedel, Reviere und Polizei

## Rahmen

- **Voraussetzung:** Auftrag 00 (Fundament) ist in `main` gemergt.
- **Parallel dazu laufen:** die Aufträge 11 bis 14. Halte dich an die Regeln in `docs/auftraege/README.md`.
- **Deine Ordner:** `src/modules/veedel/`, `src/modules/territory/`, `src/modules/police/`. Nur diese änderst du.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md` (dort steht, was du vorfindest).

## Ziel

Köln wird zu einer Stadt aus echten Veedeln, um die gekämpft wird. Du baust:
- die Veedel mit echten Grenzen und Eigenschaften
- den Einfluss der Fraktionen pro Veedel
- das Kampagnenziel "Köln übernehmen"
- eine leichte Polizei mit Heat

Das ist ein erster spielbarer Prototyp dieser Systeme, nicht die Endausbaustufe.

## Muss drin sein

### Veedel (`veedel`)

- **Grenzen:** echte Stadtteilgrenzen der ca. 12 zentralen Veedel aus dem Fundament.
  - Quelle: Offene Daten Köln (Stadtteile als GeoJSON). Die Lizenz prüfst du und vermerkst sie im Modul.
  - Die Geometrie wird vereinfacht und bleibt klein, als Datendatei im Modul.
  - Klappt der Download nicht, zeichnest du grobe Polygone von Hand und markierst das mit TODO.
- **Eigenschaften pro Veedel:** Kaufkraft, Polizeipräsenz, Nachfrage bzw. Dichte und ein kurzer Beschreibungstext im düsteren Ton.
- **`veedelAt(lng, lat)`:** echte Punkt-in-Polygon-Prüfung.
- **Nachbarschaft:** welche Veedel aneinandergrenzen. Die Gangs aus Auftrag 11 brauchen das für die Expansion.

### Reviere (`territory`)

- **Einfluss pro Veedel und Fraktion:**
  - Er steigt durch Verkäufe (`sale.completed`) und Präsenz und sinkt ohne Präsenz langsam.
  - Ab einer Schwelle kontrolliert eine Fraktion das Veedel.
  - Kontrollwechsel lösen Ereignisse aus.
- **Startverteilung:** Zu Beginn haben die Gangs Köln unter sich aufgeteilt, der Spieler startet bei null. Die Startwerte kommen aus den Veedel-Daten.
- **Kampagnenziel "Köln übernehmen":** Kontrolliert der Spieler die Mehrheit der Veedel, wird `campaign.won` über den Kerndienst ausgelöst. Danach geht es im Endlosmodus weiter.
- **Karte:**
  - Veedel-Grenzen, eingefärbt nach kontrollierender Fraktion. Die Farbe kommt aus der Gangs-API, der Spieler hat eine eigene.
  - Die Ansicht ist umschaltbar: Kontrolle oder Heat.
  - Ein Klick auf ein Veedel öffnet ein Info-Panel mit Eigenschaften, dem Einfluss aller Fraktionen und dem Heat.
  - Der Stil ist schlicht, Auftrag 14 macht den Look.

### Polizei (`police`, leicht)

- **Heat pro Veedel:** steigt durch Verkäufe und Gewalt und sinkt mit der Zeit.
- **Kontrollen und Razzien:** Ab Schwellen passieren sie als Zufallsereignisse, die Wahrscheinlichkeit hängt von Heat und Polizeipräsenz ab.
  - Folgen: Ware und Geld am Spot werden beschlagnahmt.
  - Mitarbeiter können festgenommen werden (Ereignis `police.arrest` mit Mitarbeiter-ID). Den Haft-Status setzt Auftrag 13, du meldest nur das Ereignis.
- **Verpfeifen:** Mit einem Befehl kann eine Gang verpfiffen werden. Das erhöht den Heat in ihren Veedeln und kann dort eine Razzia gegen die Gang auslösen, die Einfluss kostet.
- **Polizeiflucht:** Eine Kontrolle kann eine Konfrontation "Polizeiflucht" starten, über die API von `encounters`.
- **Anzeige:** Heat-Anzeige im HUD (über die HUD-Registry) und im Veedel-Panel, dazu Einträge im Journal.

## Nicht in diesem Auftrag

- Gang-KI (Auftrag 11)
- Mitarbeiter-Details (Auftrag 13)
- Streifenwagen-Animation (später)
- endgültiger Look (Auftrag 14)

## Fertig, wenn

- Veedel mit Grenzen sichtbar und anklickbar sind und der Einfluss sich durch Verkäufe spürbar verändert
- Heat steigt und Razzien passieren
- eine Siegbedingung existiert und getestet ist
- Tests für Einfluss, Kontrollwechsel, Heat und Siegbedingung vorhanden sind und `npm run check` grün ist
- die PR-Beschreibung die drei Abschnitte aus der README hat
