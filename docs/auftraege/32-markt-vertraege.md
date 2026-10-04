# Auftrag 32: Markt in Bewegung, Qualität und Wochenverträge

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/32-markt-vertraege.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 1.** Läuft parallel zu 23, 33 und 35.

**Ordner:** `src/modules/market/`, `src/modules/quests/`, `src/modules/events/`; in `customers` nur der Qualitäts-Faktor, in `suppliers` nur Preis und Rabatt-Aktionen.

## Ziel

Preise bewegen sich ein wenig, auch beim Einkauf, mit Rabatten über längere Zeit und ab und zu einer teuren Phase. Gute Qualität macht ein Produkt an einem Spot beliebter. Jede Spielwoche hat ein wählbares Ziel. Alles mild und übersichtlich: Das Spiel bleibt ein Tycoon, kein Börsenspiel.

## Rahmen (gilt für alle Aufträge ab 32)

- **Grundlage:** [`docs/plan.md`](../plan.md) (Entscheidungen, Bogen, Mechaniken), Details der Ideen in
  [`docs/ideen.md`](../ideen.md). Was dort unter „Was raus ist“ steht, wird nicht gebaut.
- **Welle und Ordner:** Dieser Auftrag läuft in Welle 1 (Tabelle in [`README.md`](README.md)). Die Ordner unter
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

### 1. Preisindex pro Produkt und Stadt

- Zustand in `market` (Version + Migration): pro Stadt und Produkt ein Index, Start 1. Um Mitternacht ein Schritt eines
  deterministischen Zufallspfads mit Rückkehr zur Mitte, Spanne `INDEX_MIN` 0,85 bis `INDEX_MAX` 1,2 (`config.ts`),
  schlafende Städte driften mit.
- `priceIndex(state, productId, cityId?)` öffentlich. `referencePrice` und `suppliers.packagePrice` multiplizieren damit
  (Einkauf etwas gedämpft, z.B. halbe Ausschläge, damit die Marge nicht kippt).
- Anzeige: Chip „Gras ↑ 8 %“ in der Lieferanten-App am Paket und am Produkt im Spot, nur ab ±5 %.

### 2. Rabatt-Aktionen und Marktereignisse

- Rabatt-Aktion eines Lieferanten: ein Paket 10–25 % billiger für 3–5 Tage, etwa einmal pro Woche und Stadt, per Handy
  angekündigt (still, ohne Banner), sichtbar als Chip im Paket. Daten in `suppliers/config.ts`.
- Marktereignisse als neue Art in `events` (ohne Gebiet, mit Produkt und Faktor auf den Index, Dauer 2–5 Tage): z.B.
  Zollfund in Rotterdam (Gras teurer), gute Ernte in den Niederlanden (Haze billiger), Großrazzia bei einer Gang
  (Knappheit, teurer), Semesterstart (Nachfrage). Höchstens ein bis zwei gleichzeitig pro Stadt, Hälfte Chancen, Hälfte
  Probleme.
- Marktbericht jeden Montag um 9 Uhr per Handy vom Lieferanten mit dem meisten Vertrauen: zwei Sätze, was steigt, was
  fällt, welche Aktion läuft.
- Leutnants und die Rechte Hand: Bestellregel optional „nur, wenn der Index unter X liegt“ (Standard aus, bestehende
  Regeln unverändert). Vorsicht: `hierarchy` gehört in dieser Welle niemandem fest, Änderung dort klein halten.

### 3. Qualität treibt Nachfrage

- Pro Spot ein gleitender Schnitt der Qualität der letzten Verkäufe pro Produkt (Zustand in `customers`, Version +
  Migration). Faktor auf die Nachfrage nach diesem Produkt am Spot: Premium bis +25 %, Dreck bis −33 %, Solide = 1.
  Werte in `customers/config.ts`.
- Chip am Spot („Gras gefragt“ / „Gras verschrien“), ein Satz Erklärung in `Disclosure`.
- Keine Trends, kein eigener Ruf pro Produkt.

### 4. Wochenverträge

- In `quests` ein zweiter Typ neben Peters Kette: jeden Montag um 8 Uhr drei Angebote von Figuren mit Gesicht
  (`look`, `voice`), eins wird per Handy angenommen (`quests.acceptContract`), Frist Sonntag 23:59. Mechanik wie die
  Quests (`count`, `measure`, `streak`), Belohnungen wie dort plus Vertrauen bei einem Lieferanten.
- Mindestens zwölf Vorlagen, gemischt aus Verkaufen, Liefern, Ruhe halten, Veedel halten, Ware einer Qualität; Ziele
  skalieren mit der Größe des Geschäfts (`operationTier`) und gelten für die aktive Stadt.
- HUD-Karte unter der Quest-Karte (Platz `'below'`), Liste in derselben Seite wie „Alle Quests“.

### 5. Bot, Balancing, Doku

- Bot nimmt jede Woche den Vertrag mit der höchsten Belohnung, den er schaffen kann, und kauft bei Rabatt-Aktionen.
- Messen: Kernzahlen vorher/nachher, dazu Spanne des Index über 30 Tage und Anteil erfüllter Verträge.

## Nicht in diesem Auftrag

- Ware altert, Trends, Produkt-Ruf
- Warenfluss-Übersicht (Auftrag 33)
- Stammabnehmer (Auftrag 34)

## Fertig, wenn

- Preise bewegen sich sichtbar, aber mild; Kernzahlen des Balancings bleiben im selben Bereich.
- Verträge kommen jede Woche, lassen sich annehmen, laufen ab und zahlen aus.
- Die PR-Beschreibung hat die drei Abschnitte und die Zahlen vorher/nachher.
