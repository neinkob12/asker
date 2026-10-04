# Auftrag 42: Produktion im Ausland: Fincas, Kette, Ziel Europa

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/42-produktion.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 4.** Startet, wenn 41 gemergt ist.

**Ordner:** Neues Modul `src/modules/grow/`, Erweiterungen in `trade`, `fleet`, `city` (Regionen).

## Ziel

Nach einigen Wochen als Lieferant rufen Produzenten aus Kolumbien und Marokko an. Der Spieler baut eigene Produktion auf, der Preis wird immer besser. Offenes Ende; Ziel ist, ganz Europa aus eigener Produktion zu versorgen.

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

### 1. Auslöser

- Nach genug Volumen als Lieferant zwei Anrufe (Kolumbien, Marokko) mit Figuren mit Gesicht und Stimme; Regionen werden
  frei, Karte zoomt bis Südamerika und Nordafrika.

### 2. Modul `grow`

- Fincas kaufen oder pachten (sauberes Geld), Größe in Hektar, Arbeiter und Gärtner (Rollen in `staff`), Genetik als
  Qualität, Ernte alle 60 Tage im Freien oder 30 im Gewächshaus, Trocknen, Pressen für Hasch, Verpacken (Tarnung senkt
  Zollrisiko), Verschiffung aus Cartagena oder Tanger mit drei bis vier Wochen Laufzeit.
- Ein lokales Kartell als Partner mit Anteil (zahlen oder nicht, dann Verluste an der Finca) und eine Aufmerksamkeit der
  Behörden pro Region wie eine Heat. Zwei Zahlen, kein neues Drama.
- Eigene Ware kostet einen Bruchteil des Einkaufs. Edibles, Vapes und Öl: Entscheidung im PR vorschlagen (Labor in den
  Niederlanden oder weiter zukaufen).

### 3. Ziele

- Meilenstein „Produzent“ (Hälfte der Lieferungen aus eigener Produktion), Titel „Europa“ (jeder Kunde auf der
  Europa-Karte aus eigener Produktion versorgt). Beides in der Bestenliste. Danach offen weiterspielen.

### 4. Bot, Balancing, Doku

- Bot baut zwei Fincas und erreicht „Produzent“ im Szenario. Messen: Tage bis Produzent, Preis pro Gramm über Zeit.

## Nicht in diesem Auftrag

- Weitere Phasen nach Europa

## Fertig, wenn

- Fincas, Kette, Verschiffung und die beiden Ziele funktionieren; der Bogen ist von Köln bis Europa durchspielbar.
