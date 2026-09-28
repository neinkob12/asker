# Auftrag 13 – Personal und Hierarchie

## Rahmen

- **Voraussetzung:** Auftrag 00 (Fundament) ist in `main` gemergt.
- **Parallel dazu laufen:** die Aufträge 10 bis 12 und 14. Halte dich an die Regeln in `docs/auftraege/README.md`.
- **Deine Ordner:** `src/modules/staff/`, `src/modules/hierarchy/`, `src/modules/recruiting/`. Nur diese änderst du.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md` (dort steht, was du vorfindest).

## Ziel

Aus anonymen Läufern werden echte Leute mit Werten, Laufbahn und Loyalität. Dazu kommt eine Hierarchie mit Leutnants, die ihr Veedel selbstständig führen. So wird "erst selbst verkaufen, dann managen" spielbar.

Das ist ein erster spielbarer Prototyp, nicht die Endausbaustufe.

## Muss drin sein

### Mitarbeiter (`staff`)

- **Individuen** mit Name, Alter, kurzem Hintergrund, Porträt und Lohn. Für das Porträt gibt es ein Feld, vorerst mit Platzhalter. KI-Bilder kommen später.
- **Typen:** Läufer/Dealer, Kurier/Fahrer, Sicherheit und Spezialisten (Anwalt, Buchhalter, Kontakt bei der Polizei).
- **Werte je nach Typ** (z.B. Tempo, Vorsicht, Stärke, Charisma, Loyalität) und Erfahrung mit Level-Aufstieg. Durch Arbeit steigen die Werte.
- **Status:** aktiv, verletzt, in Haft, gekündigt. Auf `police.arrest` reagierst du mit dem Haft-Status.
- **Einsatz:**
  - Läufer an Spots, wie im Prototyp, aber mit ihren Werten
  - Kuriere für den Lieferdienst. Auftrag 12 findet und bindet freie Kuriere über `findAvailable` und `assign` (gibt es seit dem Fundament, nicht brechen).
  - Sicherheit an Spots und Lagern. Ihre Werte fließen über deine API in die Konfrontationen aus Auftrag 11 ein.
- **Spezialisten geben Boni** statt zu arbeiten, als abfragbare Werte über deine API:
  - Anwalt: Kaution billiger, Haft kürzer
  - Buchhalter: geringere Geldwäsche-Gebühr
  - Polizei-Kontakt: Warnung vor Razzien
- **Anwalt und Kaution:** Mit einem Befehl holst du Leute gegen Geld aus der Haft.
- **Loyalität:**
  - Sie sinkt bei zu niedrigem Lohn, Gefahr und Haft und steigt bei gutem Lohn und Beförderung.
  - Verrat ist selten und mild: Der Mitarbeiter klaut etwas Ware oder Geld, kündigt oder redet (etwas Heat über die `police`-API).
- **Löhne:** täglich, wie im Prototyp, aber pro Person.

### Hierarchie (`hierarchy`)

- **Leutnants pro Veedel:** Der Spieler befördert einen Mitarbeiter zum Leutnant eines Veedels.
- **Delegation:**
  - Ein Leutnant führt sein Veedel selbstständig: Er verteilt Läufer, bedient Spots und hält den Bestand.
  - Er handelt ausschließlich über dieselben Befehle, die auch der Spieler nutzt (`dispatch`), nie durch direktes Ändern fremder Zustände.
- **Delegations-Einstellungen** pro Leutnant, z.B. Mindestbestand, Preisniveau und Vorsicht.
- **Zufriedenheit:** Leutnants haben höhere Ansprüche, und ein guter Leutnant ist wertvoll.

### Rekrutierung (`recruiting`)

- **Bewerber-Pool:** In regelmäßigen Abständen kommen neue Kandidaten mit unterschiedlichen Werten.
- **Kontakte:** Leute tauchen über Ereignisse, Empfehlungen von Mitarbeitern oder Stammkunden auf. Sie sind oft besser, aber selten.
- **Bewerbung:** Vor der Einstellung sieht man einen Teil der Werte. Den Rest erfährt man erst mit der Zeit.

### UI

- **Personal-Übersicht:** filterbar nach Typ, Status und Veedel.
- **Mitarbeiter-Profil:** gestaltet wie eine Akte mit Porträt, Werten, Laufbahn und Aktionen (befördern, versetzen, Lohn ändern, entlassen, Kaution).
- **Kontakte-App** im Spiel-Handy für Bewerber und Kontakte.

## Nicht in diesem Auftrag

- Konfrontations-Mechanik (Auftrag 11, du lieferst nur die Werte)
- Verkaufslogik und Preise (Auftrag 12)
- endgültiger Look (Auftrag 14)

## Fertig, wenn

- man Leute über Pool und Kontakte findet, einstellt, einsetzt und befördert
- ein Leutnant ein Veedel spürbar selbstständig führt
- Haft, Kaution und seltener Verrat funktionieren
- Tests für Level-Aufstieg, Loyalität, Delegation (Leutnant schickt nur Befehle), Haft und Kaution vorhanden sind und `npm run check` grün ist
- die PR-Beschreibung die drei Abschnitte aus der README hat
