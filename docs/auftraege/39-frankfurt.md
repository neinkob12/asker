# Auftrag 39: Frankfurt (optional) als spielbare Stadt

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/39-frankfurt.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 3.** Startet, wenn 36 gemergt ist. 37, 38 und 39 laufen parallel; Konflikte entstehen nur in Listen von Daten, beim Mergen beide Einträge behalten.

**Ordner:** Neue Daten-Dateien der Stadt; Einträge in `city/data.ts`, `roads/graph.ts`, `events/config.ts`, `suppliers/config.ts`, `spots`, `goods` (Lager), `gangs/data.ts`, `quests/config.ts`. Kein Ablauf-Code außer Daten.

## Ziel

Frankfurt (optional) wird eine vollwertige Stadt nach demselben Muster wie Hamburg, mit genau einem eigenen Dreh. Reiner Inhalts-Auftrag: Wenn Ablauf-Code nötig ist, ist das ein Fehler in Auftrag 36 und gehört in den PR unter „Für die Integration“.

## Rahmen (gilt für alle Aufträge ab 32)

- **Grundlage:** [`docs/plan.md`](../plan.md) (Entscheidungen, Bogen, Mechaniken), Details der Ideen in
  [`docs/ideen.md`](../ideen.md). Was dort unter „Was raus ist“ steht, wird nicht gebaut.
- **Welle und Ordner:** Dieser Auftrag läuft in Welle 3 (Tabelle in [`README.md`](README.md)). Die Ordner unter
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

### 1. Daten nach der Checkliste

Nach `docs/architektur.md`, Abschnitt „Städte“, Absatz „Eine dritte Stadt“:
- Eintrag in `CITIES` (ohne `template`), Kamera (`view` mit `pitch`, `bearing`), Rahmen, Faktoren, Kontakt für den Anruf
  mit Gesicht und Stimme, Dreh in einem Satz.
- Zwölf Stadtteile mit echten Grenzen (`veedel/data-<id>.ts`, `boundaries-<id>.ts`, Quelle Overture Maps oder offene Daten
  der Stadt, Quellenangabe), Kaufkraft, Polizeipräsenz, Dichte, Nachtleben, Startverteilung der Gangs.
- Spots (mindestens zwei pro Stadtteil, alle zum Freischalten), Lager-Standorte, Hafen falls vorhanden.
- Vier Gangs mit Boss, Stil, Stärken (frei erfunden, keine echten Gruppen) und Gang-Beziehungen (aus 34).
- Straßennetz mit `build-roads.py --city <id>`, in `roads/graph.ts` eintragen, Autobahn-Zufahrten; `scripts/check-roads.mjs`
  muss bestehen.
- Lieferanten-`cities`, Events in `events/config.ts`, Wahrzeichen als schlichte Klötze, Peters Kapitel.

### 2. Der Dreh

- **Geld und Flughafen:** Banker-Kundschaft mit hoher Kaufkraft, das Bahnhofsviertel als Brennpunkt (viel Nachfrage, viel Polizei), ein Lieferant über den Flughafen (klein, schnell, teuer, Zoll scharf), Geldwäsche mit höherer Obergrenze in dieser Stadt.
- Events: Messe, Museumsuferfest.
- Toni ist hier zu Hause (bessere Preise in Frankfurt).

### 3. Bot, Balancing, Doku

- Bot spielt die Stadt nach Köln; Tage bis komplett im Bericht „Tage pro Stadt“, Richtwert je nach Position 8–15 Tage.
- Screenshots der Stadt bei Tag und Nacht, Desktop und Handy, in `docs/integration/auftrag-39/`.

## Nicht in diesem Auftrag

- Neue Mechaniken, Sonderfälle im Ablauf

## Fertig, wenn

- Frankfurt (optional) ist spielbar, `check-roads` grün, der Bot übernimmt die Stadt, Screenshots liegen im PR.
