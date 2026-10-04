# Auftrag 33: Lager mit Kapazität, Fahrzeuge, Routenwahl, Hafen-Ausbau, Warenfluss

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/33-lager-fahrzeuge-hafen.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 1.** Läuft parallel zu 23, 32 und 35. Übernimmt die Fuhrpark-Etappe 6 aus Auftrag 23.

**Ordner:** `src/modules/goods/`, `src/modules/logistics/`, neues Modul `src/modules/fleet/`, in `roads` nur das Gewicht pro Straßenart; in `suppliers` nur Container-Pakete.

## Ziel

Logistik bekommt Engpässe und damit ein Puzzle: Lager sind voll oder nicht, Fahrzeuge haben Ladung, Fahrten haben ein Risiko, das man wählt, und eine Übersicht zeigt, wo die Ware knapp wird. Alles mit festen Werten, nichts, was gepflegt werden muss.

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

### 1. Lager mit Kapazität und Ausbau

- Pro Lager eine Kapazität in Gramm (Gewicht über `UNIT_WEIGHT_GRAMS`), Werte in `goods/config.ts` (Garage klein, Halle
  groß). `store` nimmt nur, was passt, und meldet den Rest zurück; Lieferungen, Abholungen und Umlagern gehen mit dem
  Rest sinnvoll um (Rest bleibt am Kai bzw. beim Fahrer und wartet, Meldung im Handy).
- Ausbau mit sauberem Geld in Stufen: **Regale** (Kapazität ×1,5 / ×2 / ×3), **Tresor** (weniger Verlust bei Einbruch und
  Überfall), **Tarnung** (Razzia nimmt weniger aus diesem Lager). Lese-Funktion `warehouseModifiers(state, id)`, die
  `police` und `gangs` zur Laufzeit fragen. Befehl `goods.upgradeWarehouse`.
- Lager-Seite: Füllstand als Balken, Ausbau als Gruppe mit Kosten in der Zeile, `ActionSheet` zum Bestätigen.

### 2. Fahrzeuge

- Neues Modul `fleet`: Modelle als Daten (Roller, Kombi, Transporter, später Lkw für Phase 3) mit Ladung, Tempo,
  Kontrollfaktor und Preis (sauberes Geld). Kein Alter, keine Kennzeichen, keine Werkstatt.
- Fahrten (Abholen am Hafen, Umlagern, Routen mit Fahrplan) nehmen ein freies Fahrzeug der Stadt; ohne eigenes Fahrzeug
  das Privatauto des Fahrers mit einer Ladung, die die heutigen Fahrten abdeckt. Wer nichts kauft, spielt wie heute.
  `INTERCITY_CAPACITY` wird pro Fahrzeug bestimmt.
- Fliegt eine Ladung auf, ist das Fahrzeug mit Chance beschlagnahmt.
- Handy: Gruppe „Fahrzeuge“ in der Lager-App (kaufen, Status frei/unterwegs/beschlagnahmt), Fahrzeugwahl beim Abholen,
  Umlagern und in Routen. Karte: unterscheidbare Modelle über `createVehicle`.

### 3. Routenwahl

- Drei Optionen pro Fahrt mit Ware: **Autobahn** (wie heute), **Landstraße** (länger, Kontrollchance halbiert),
  **Nachts** (Abfahrt ab 23 Uhr, Kontrollchance ein Drittel). `roadRoute` bekommt optional ein Gewicht pro Straßenart
  (Autobahn meiden). Standard wie heute; Routen mit Fahrplan haben die Wahl als Einstellung.

### 4. Hafen-Ausbau

- Liegeplatz in Stufen pro Stadt (Kai → Halle am Kai → Kran): Ware steht länger sicher am Kai, Abholung schneller.
- Container-Pakete bei den Hafen-Lieferanten: ganzer Container (groß, billig pro Gramm) und geteilter Container (billiger,
  fliegt die fremde Hälfte auf, ist die eigene mit weg). Nur als Pakete mit Merkmal in `suppliers/config.ts`, kein neues
  System.
- Schiffs-Tracker in der Lieferanten-App: Ort auf dem Wasserweg (`roads.shipRoute`) und Ankunft.

### 5. Warenfluss

- Seite „Warenfluss“ in der Lager-App: pro Produkt Verbrauch pro Tag (aus `finance` oder eigenem Zähler), Bestand,
  unterwegs, „reicht noch N Tage“, pro Lager und Spot aufklappbar; Engpass rot mit Knopf zur Lieferanten-App.
- Karten-Ebene „Lieferwege“ (`registerMapLayerOption`): welcher Spot aus welchem Lager bedient wird.

### 6. Bot, Balancing, Doku

- Bot kauft bei Bedarf Regale und einen Transporter, wählt nachts für Hafen-Abholungen.
- Messen: Kernzahlen vorher/nachher, dazu Anteil abgelehnter Einlagerungen.

## Nicht in diesem Auftrag

- Fahrzeug-Alter, Werkstatt, Kennzeichen, Zollbeamter
- Kamera und Klima im Lager
- Lkw und Schiffe der Hafen-Phase (Aufträge 40, 41)

## Fertig, wenn

- Lager haben Kapazität und Ausbau, Fahrzeuge Ladung, Fahrten eine Routenwahl, der Hafen Stufen und Container.
- Ein Spieler ohne Ausbau und ohne Fahrzeuge spielt wie heute.
- Warenfluss-Seite und Ebene funktionieren in beiden Städten.
