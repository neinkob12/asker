# Auftrag 20 – Integration

## Rahmen

- **Voraussetzung:** Die Aufträge 10 bis 14 sind in `main` gemergt.
- **Diese Session arbeitet allein** und darf alle Dateien ändern.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md`, `docs/auftraege/README.md`.

## Ziel

Aus fünf einzeln gebauten Systemen wird ein zusammenhängendes, spielbares Spiel.

## Muss drin sein

1. **Wünsche einsammeln und umsetzen:**
   - Lies die PR-Beschreibungen der Aufträge 10 bis 14 auf GitHub.
   - Arbeite jeden Punkt unter "Für die Integration" ab.
   - Ersetze die Übergangslösungen durch echte Verbindungen.
2. **Systeme verbinden:**
   - Verkäufe wirken auf Einfluss, Heat und Ruf.
   - Gangs wirken auf Marktpreise, überfallen Lager und Spots und treffen Mitarbeiter.
   - Leutnants stärken den Einfluss in ihrem Veedel.
   - Wetter und Wochentage wirken auf die Nachfrage.
   - Der Polizei-Kontakt warnt vor Razzien.
   - Konfrontationen nutzen die echten Mitarbeiter-Werte.
   - Alle Figuren-Nachrichten laufen über das Spiel-Handy.
   - Transporter und Kuriere nutzen die Effekt-Werkzeuge der Karte.
3. **Spielende prüfen:** Game Over bei Pleite und bei Tod, der Sieg "Köln übernehmen", Normal- und Hardcore-Modus.
4. **Balancing:**
   - Schreibe eine Simulation als Test oder Skript: z.B. 30 Spieltage mit einer einfachen Bot-Strategie.
   - Stelle die Werte in den `config.ts` der Module so ein, dass:
     - der Anfang machbar ist
     - die Gangs spürbar Druck machen
     - die Kampagne ungefähr 5 bis 10 Stunden dauert
5. **Ende-zu-Ende-Test:** mit Playwright. Neues Spiel, verkaufen, bestellen, Mitarbeiter einstellen, speichern und laden.
6. **Doku:** `CLAUDE.md`, `docs/architektur.md` und `docs/konzept.md` auf den neuen Stand bringen, erledigte offene Punkte streichen.
7. **Nächste Schritte vorschlagen:** Bugs und Unstimmigkeiten, die nicht in diesen Auftrag passen, als Liste in den PR schreiben. Daraus entstehen die nächsten Aufträge.

## Fertig, wenn

- eine 20-minütige Session von Anfang an Spaß macht und alle Systeme darin vorkommen (selbst durchgespielt, per Playwright und Screenshots belegt)
- `npm run check`, `npm run build` und der Ende-zu-Ende-Test grün sind
