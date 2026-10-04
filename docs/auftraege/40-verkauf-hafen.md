# Auftrag 40: Boss von Deutschland, Verkauf, Hafen-Phase als Lieferant für alle

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/40-verkauf-hafen.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 4.** Startet, wenn die Welle 3 gemergt ist (mindestens Berlin und München).

**Ordner:** Neues Modul `src/modules/trade/`, `src/modules/city/` (Verkauf), Erweiterungen in `logistics` (Häfen im Ausland), `suppliers` (Konkurrenz), `police` (Zoll-Heat).

## Ziel

Sind alle spielbaren Städte komplett, verkauft der Spieler sein Geschäft und wird Lieferant am Hafen in den Niederlanden, für alle: die eigenen alten Organisationen, Gangs und fremde Städte. Neue Schleife: Bestellungen annehmen, beschaffen, verschiffen, ausliefern, gegen den Zoll und die alten Lieferanten als Konkurrenz.

## Rahmen (gilt für alle Aufträge ab 32)

- **Grundlage:** [`docs/plan.md`](../plan.md) (Entscheidungen, Bogen, Mechaniken), Details der Ideen in
  [`docs/ideen.md`](../ideen.md). Was dort unter „Was raus ist“ steht, wird nicht gebaut.
- **Welle und Ordner:** Dieser Auftrag läuft in Welle 4 (Tabelle in [`README.md`](README.md)). Die Ordner unter
  „Ordner“ gehören dir. Andere Module nur über ihre öffentliche Schnittstelle nutzen; fehlt dort etwas, die Schnittstelle
  **klein erweitern, nie brechen**, und es im PR unter „Für die Integration“ nennen, weil parallel andere daran arbeiten.
- **Ordnerregeln, Sprachregel, Determinismus** aus `CLAUDE.md` (`npm run lint` prüft sie). Zufall nur über `ctx.random()`
  und Geschwister, Optik liest nur.
- **Städte:** Alles, was an einem Ort hängt, hat eine Stadt; Werte pro Stadt als Daten (`CITIES` oder `…_BY_CITY`), nie
  `if (cityId === 'hamburg')` im Ablauf. Ticks nur für die Stadt, die live ist.
- **Migrationen:** Jede Änderung an der Form eines Zustands bekommt `version` + Migration + Test. Alte Spielstände und die
  Test-Spielstände (`npm run saves:build`, `testSaves.test.ts`) laden und spielen weiter.
- **Geld immer mit Kategorie** (`MONEY_CATEGORIES` in `src/core/wallet.ts`), Legales mit sauberem Geld.
- **Übersichtlich bleiben:** Das Spiel expandiert schnell über fünf Städte. Jede neue Anzeige hat höchstens einen Satz
  Erklärung sichtbar, mehr in `Disclosure`. Optik-Regeln und Bausteine aus `src/ui/README.md`, Handy-Muster aus
  `docs/handy-design.md`.
- **Keine neuen npm-Pakete.**
- **Bot und Balancing:** `src/playtest/bot.ts` nutzt das Neue sinnvoll (muss nicht alles können). `npm run balance` vorher
  und nachher, Kernzahlen (erstes Veedel, Boss von Köln, Köln komplett, Umsatz pro Tag, Pleiten) in den PR.
- **Etappen:** nach jeder Etappe `npm run check`, Commit, Push. Draft-PR gegen `main` nach der ersten Etappe. Wird `main`
  geändert: `main` mergen, nicht rebasen. Konflikte in `package-lock.json` mit `npm install` lösen.
- **Doku:** `docs/architektur.md` (Modultabelle, Befehle, Ereignisse, Zusammenspiel, Balancing), `docs/konzept.md` (Stand
  der Umsetzung), `docs/auftraege/README.md` (Stand), `CLAUDE.md`, wenn ein neues Modul oder Muster dazukommt.
- **PR-Beschreibung** mit drei Abschnitten: „Was ist neu“, „Wie testen“, „Für die Integration“.

## Prüfen

- `npm run check`, `npm run build`, `npm run e2e`, alles grün.
- Tests für jede neue Mechanik, Migrationstests, Determinismus (gleicher Seed = gleiche Ereignisse).
- Neue Handy-Seiten als Szenen in `scripts/phone-scenes.mjs`, `npm run screenshot:phone` dunkel und hell selbst ansehen,
  `npm run audit:phone` und `npm run monkey:phone` ohne Verstöße.

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge. Jede Etappe bringt Simulation, Tests und ihre Oberfläche mit.

### 1. Boss von Deutschland und Verkauf

- Auslöser: alle spielbaren Städte komplett. Titel, Banner, Bestenliste.
- Anruf von Jansen aus Rotterdam (bekannter Lieferant): Er hört auf und verkauft Liegeplatz, Leute und Kunden.
  Gleichzeitig bieten die Statthalter an, dich auszuzahlen.
- Verkaufspreis nach Formel in `city/config.ts` (Startvorschlag: 90 Tagesgewinne aller Städte, Schnitt der letzten
  sieben Tage); Rotterdam kostet einen Anteil davon (Startvorschlag drei Viertel). Formel im PR begründen, mit dem Bot
  einstellen. Abnahmevertrag: vier Wochen garantierte Bestellungen der alten Organisationen.
- Nach dem Verkauf sind die Städte Kunden (Vertrauen hoch), nicht mehr Besitz: keine Kasse pro Stadt, keine Vollmacht,
  Karte zeigt Europa. Alte Spielstände ohne Verkauf bleiben unberührt.

### 2. Modul `trade`

- Kunden: die eigenen Organisationen (zuverlässig, Index-Preis), Gangs (zahlen mehr, Deals können kippen, Gedächtnis aus
  34 zählt), fremde Städte als Nachfrage-Punkte ohne eigene Karte (Startliste: Düsseldorf, Dortmund, Bremen, Hannover,
  Leipzig, Stuttgart, Nürnberg). Jeder mit Wochenbedarf, Preisgrenze, Vertrauen, Zuverlässigkeits-Erwartung.
- Bestellungen jeden Montag (aus Bedarf und Vertrauen), annehmen, ablehnen, Gegenangebot. Lieferung mit Frist; Zahlung bei
  Ankunft. Zuverlässigkeit und Qualität sind dein Ruf als Lieferant.
- Konkurrenz: Toni, Hein, Mirko, Daan bieten den Kunden ebenfalls an; jeder Kunde kauft beim besten Angebot aus Preis,
  Qualität, Zuverlässigkeit. Anteil pro Kunde sichtbar.
- Kunden-App ersetzt in dieser Phase die Lieferanten-App im Dock.

### 3. Beschaffung und Zoll

- Einkauf bei Produzenten im Ausland (Marokko Hasch, Spanien und Albanien Gras, Niederlande Edibles/Vapes/Öl) mit Preis,
  Qualität, Laufzeit, Zollrisiko nach Herkunft; oder teurer und schnell aus Jansens Netz.
- Zoll-Heat pro Hafen wie ein Veedel (Menge treibt, Zeit kühlt). Jeder ankommende Container wird mit Chance kontrolliert
  (Zollkontrolle aus Auftrag 35). Verteilen auf kleinere Container senkt das Risiko.
- Auslieferung mit Lkw (Fahrzeugmodell aus 33) über das Autobahn-Netz, Routen mit Fahrplan wie gehabt.

### 4. Europa-Ansicht

- Die Deutschland-Ansicht wächst: Rotterdam, Antwerpen, Hamburg als Häfen, fremde Städte als Glas-Karten, Lkw und Schiffe
  unterwegs. Autobahn-Linien nach Rotterdam ergänzen.

### 5. Bot, Balancing, Doku

- Szenario „nach Deutschland“ im Balancing (Test-Spielstand bauen), Bot spielt 30 Tage Hafen. Messen: Umsatz, Anteil am
  Markt, aufgeflogene Container, keine Pleite.

## Nicht in diesem Auftrag

- Eigene Schiffe und europäische Kunden (41)
- Produktion (42)

## Fertig, wenn

- Verkauf, Rotterdam, Kunden, Konkurrenz, Zoll und Auslieferung bilden eine spielbare Woche, der Bot übersteht 30 Tage.
