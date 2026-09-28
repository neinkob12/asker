# Auftrag 11 – Gangs und Konfrontationen

## Rahmen

- **Voraussetzung:** Auftrag 00 (Fundament) ist in `main` gemergt.
- **Parallel dazu laufen:** die Aufträge 10 und 12 bis 14. Halte dich an die Regeln in `docs/auftraege/README.md`.
- **Deine Ordner:** `src/modules/gangs/`, `src/modules/encounters/`. Nur diese änderst du.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md`.

## Ziel

Die Gangs sind die Hauptgegner: mächtig, aktiv, und man muss gegen sie arbeiten. Dazu kommt ein taktisches, rundenbasiertes Konfrontationssystem, in dem der Spieler sterben kann, wenn er selbst dabei ist.

Das ist ein erster spielbarer Prototyp, nicht die Endausbaustufe.

## Muss drin sein

### Gangs (`gangs`)

- **3 bis 4 Gangs mit eigener Identität:** Name, Boss, Heimat-Veedel, Farbe, Stil und Stärken (z.B. brutal, gut vernetzt, billige Ware). Der Ton ist realistisch und düster, alle Gangs sind frei erfunden, keine realen Gruppen.
- **Stärke jeder Gang:** Geld, Leute und Ware als einfache Werte.
- **Gang-KI** (tickt z.B. stündlich):
  - Sie expandiert in benachbarte oder schwache Veedel und verteidigt ihre eigenen. Dafür nutzt sie die APIs von `territory` und `veedel`.
  - Sie drückt die Preise in ihren Veedeln. Gibt `market` dafür keine Schnittstelle her: Ereignis auslösen und unter "Für die Integration" notieren.
  - Sie reagiert auf dich. Anfangs ignoriert sie dich als kleinen Fisch. Je mehr du in ihren Veedeln verkaufst, desto feindseliger wird sie: Drohungen, dann Überfälle auf Spots, Kuriere und Lager.
  - Die Gangs sollen spürbar mächtiger sein als der Spieler am Anfang.
- **Beziehung und Feindseligkeit** pro Gang zum Spieler.
- **Diplomatie** als Befehle: Waffenstillstand, Schutzgeld zahlen oder kassieren, Bündnis gegen eine andere Gang. Jeweils mit Bedingungen und Folgen.
- **Gegen Gangs arbeiten:**
  - Gewalt: Überfall auf einen Gang-Spot als Konfrontation
  - wirtschaftlich: Gangs verlieren Einfluss, wenn du in ihren Veedeln erfolgreich verkaufst (über `territory`)
  - Polizei: Verpfeifen über die API von `police`
- **Nachrichten:** Drohungen und Angebote der Gangs kommen als Handy-Nachricht über den Nachrichtendienst des Kerns. Antwort-Optionen lösen deine Diplomatie-Befehle aus.

### Konfrontationen (`encounters`)

- **Generisches, rundenbasiertes System:**
  - Jede Konfrontation hat eine Situation mit Text, Beteiligte (eigene Leute mit ihren Werten aus der `staff`-API, dazu Gegner) und mehrere Runden.
  - Jede Runde bietet Optionen wie kämpfen, fliehen, verhandeln, bestechen, einschüchtern.
  - Der Ausgang hängt von Werten und Zufall ab.
- **Folgen:** Verlust oder Gewinn von Ware, Geld und Leuten, Verletzungen, Einfluss und Heat, jeweils über die APIs der anderen Module oder über Ereignisse.
- **Vier Anlässe als Daten-Definitionen:** Überfall abwehren, Polizeiflucht, Schulden eintreiben, Deal kippt. Neue Anlässe sollen sich als reine Daten ergänzen lassen.
- **Selbst dabei sein:**
  - Der Spieler kann persönlich teilnehmen. Dann gibt es bessere Chancen und mehr Optionen, aber Todesgefahr.
  - Stirbt der Spieler, wird Game Over mit Grund `killed` über den Kerndienst ausgelöst.
  - Schickt er nur seine Leute, ist er sicher, der Ausgang wird aber automatisch ausgewürfelt oder er hat weniger Optionen.
- **UI:**
  - ein Konfrontations-Dialog: düster, klar, gut auf dem Handy bedienbar
  - eine Gang-Übersicht mit Stärke, Veedeln, Beziehung und Diplomatie-Aktionen

## Nicht in diesem Auftrag

- Veedel-Grenzen und Einfluss-Mechanik (Auftrag 10)
- Mitarbeiter-Werte selbst (Auftrag 13, du nutzt nur deren API)
- endgültiger Look (Auftrag 14)

## Fertig, wenn

- die Gangs sichtbar agieren (Expansion, Drohung, Überfall) und man mit allen vier Mitteln gegen sie vorgehen kann
- mindestens ein Anlass von Anfang bis Ende durchspielbar ist, auch mit Tod und Game Over
- Tests für die Gang-KI (deterministisch mit Seed), Diplomatie und die Auflösung von Konfrontationen vorhanden sind und `npm run check` grün ist
- die PR-Beschreibung die drei Abschnitte aus der README hat
