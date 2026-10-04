# Auftrag 36: Deutschland: freie Reihenfolge, Autobahn-Netz, Statthalter, Startpaket, Ränge

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/36-deutschland.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 2.** Startet, wenn 33 gemergt ist. Läuft parallel zu 34. Danach starten die Städte 37 bis 39.

**Ordner:** `src/modules/city/`, `src/modules/roads/` (Autobahn-Netz), `src/modules/leaderboard/`, in `hierarchy` nur Übergabe, Vollmacht und Statthalter, in `quests` die Kapitel nach Hamburg.

## Ziel

Nach Köln wählt der Spieler die nächste Stadt selbst. Spätere Städte gehen schneller, weil man mit Geld, einem Startpaket und den Einnahmen der Statthalter ankommt. Das Spiel weiß, welche Stufe des Bogens der Spieler erreicht hat.

## Rahmen (gilt für alle Aufträge ab 32)

- **Grundlage:** [`docs/plan.md`](../plan.md) (Entscheidungen, Bogen, Mechaniken), Details der Ideen in
  [`docs/ideen.md`](../ideen.md). Was dort unter „Was raus ist“ steht, wird nicht gebaut.
- **Welle und Ordner:** Dieser Auftrag läuft in Welle 2 (Tabelle in [`README.md`](README.md)). Die Ordner unter
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

### 1. Freie Reihenfolge

- `NEXT_CITY` wird eine Liste der Städte nach Köln; jede Stadt hat in `CITIES` einen Kontakt mit Gesicht und Stimme und
  einen Satz Dreh. Nach „<Stadt> komplett“ melden sich die noch freien Städte per Handy (nächstgelegene zuerst), die
  Deutschland-Ansicht zeigt sie als Glas-Karten mit Dreh, ein Tipp löst den Anruf dieser Stadt aus (wie Fietes Anruf,
  `city.answerOffer` mit Stadt). Hamburgs bestehender Anruf bleibt der Fall für Hamburg.
- Städte mit `template: true` bleiben gesperrt und erscheinen als „bald“.

### 2. Autobahn-Netz

- Statt nur der A1 ein Graph aus Linien zwischen den Städten (A1 Köln–Hamburg, A3 Köln–Frankfurt, A3/A9 Frankfurt–
  München, A2/A24 Hamburg–Berlin, A9 Berlin–München, A7 Hamburg–Frankfurt), erzeugt mit `build-roads.py --autobahn`.
  Linien für Städte, die noch Schablone sind, dürfen schon da sein.
- `interCityRoute(a, b)` routet über den Graphen, auch über eine Stadt hinweg; Fahrten, Routen mit Fahrplan und Zoll auf
  der Autobahn funktionieren zwischen allen Städten. Deutschland-Ansicht zeigt alle Linien, laufende Fahrten in Gold.

### 3. Statthalter, Schlaf, Startpaket

- Die Rechte Hand mit Vollmacht heißt Statthalter (Titel, Porträt auf der Glas-Karte der Stadt, „Bericht aus <Stadt>“).
- Schlafende Städte: an etwa 3 von 100 Tagen eine Razzia im Schlaf, das Tagesergebnis halbiert sich oder wird leicht
  negativ, eine Zeile vom Statthalter. Keine Veedel gehen verloren.
- Übergabe-Dialog mit Startpaket: ein Capo (aus 34; solange es den nicht gibt, ein Leutnant ab Level 5) als neue Rechte
  Hand, die Level und freie Aufgaben behält, bis zu fünf Leute, Fahrzeuge (aus 33). Vertrauen der Lieferanten bleibt.
- Stellschrauben in `city/config.ts` bzw. `hierarchy/config.ts`: `FULL_POWER_SHARE`, Größe des Startpakets.

### 4. Ränge des Spielers

- Titel des Bogens als Daten: Kleindealer, Händler, Großhändler (aus `operationTier`), Boss von Köln, Boss von <Stadt>,
  Boss von Deutschland (alle spielbaren Städte komplett), Importeur, Produzent (Platzhalter für 40 und 42). Keine Boni.
- Banner und Ton beim Aufstieg, Titel im HUD und in der Bestenliste (`leaderboard` schickt ihn mit, `api/leaderboard.ts`
  nimmt ihn an).
- Peters Quests: ein Kapitel pro weiterer Stadt nach demselben Muster wie „Moin Hamburg“.

### 5. Bot, Balancing, Doku

- `simulateHamburg` wird zu „nächste Stadt“ verallgemeinert; der Bot wählt die Reihenfolge selbst. Bericht „Tage pro
  Stadt“. Richtwerte: Köln 22–27, zweite Stadt etwa 15, dritte 12, vierte 10, fünfte 8 (mit den Schablonen-Städten erst
  nach 37 bis 39 messbar; bis dahin Hamburg nach Köln messen und die Stellschrauben dokumentieren).

## Nicht in diesem Auftrag

- Inhalt von Berlin, München, Frankfurt (37 bis 39)
- Verkauf und Hafen-Phase (40)

## Fertig, wenn

- Die Reihenfolge nach Köln ist frei, das Autobahn-Netz trägt Fahrten zwischen allen Städten, Statthalter, Startpaket und Ränge funktionieren, der Bot spielt mehrere Städte nacheinander.
