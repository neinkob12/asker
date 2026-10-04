# Auftrag 41: Schiffe, Container, weitere Häfen, Europa-Kunden

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/41-schiffe-europa.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 4.** Startet, wenn 40 gemergt ist.

**Ordner:** `src/modules/trade/`, `src/modules/logistics/`, `src/modules/fleet/`, `src/modules/roads/` (Seewege).

## Ziel

Die Hafen-Phase bekommt Tiefe in der Logistik: eigene Schiffe, Container mit Deckladung, mehrere Häfen und Kunden in ganz Europa.

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

### 1. Seewege und Häfen

- Seewege aus Overture mit `tools/build-water.py`: Nordsee, Ärmelkanal, Atlantik bis Spanien und Marokko, Mittelmeer;
  Antwerpen und Hamburg als weitere Häfen mit Liegeplatz und Zoll-Heat.

### 2. Schiffe und Container

- Schiffe chartern pro Container oder eigene kaufen (Küstenmotorschiff, Frachter) mit Kapazität und Tempo (`fleet`).
- Container mit Deckladung (Blumen, Bananen, Fliesen …): bessere Tarnung kostet mehr und senkt das Zollrisiko.
- Schiffs-Tracker für alle Schiffe, Ankunft im Hafen-Lager mit Kapazität (aus 33).

### 3. Europa-Kunden

- Fremde Städte in Europa als Kunden (Startliste: Amsterdam, Brüssel, Paris, Kopenhagen, Wien, Zürich, Mailand), mit
  Grenze und Zoll auf der Straße, Lkw-Routen.

### 4. Bot, Balancing, Doku

- Bot nutzt Charter und ein eigenes Schiff, beliefert mindestens drei Europa-Kunden. Messen wie in 40.

## Nicht in diesem Auftrag

- Produktion (42)

## Fertig, wenn

- Schiffe, Container, drei Häfen und Europa-Kunden funktionieren; die Europa-Ansicht zeigt den Verkehr.
