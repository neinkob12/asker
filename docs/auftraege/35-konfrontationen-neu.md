# Auftrag 35: Konfrontationen neu: sichtbare Absicht, zwei Zeiger, Polizei-Uhr, Crew

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/35-konfrontationen-neu.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 1.** Läuft parallel zu 23, 32 und 33. Auftrag 23 darf neue Anlässe als Daten in `encounters/kinds.ts` eintragen; beim Mergen auf das neue System umziehen.

**Ordner:** `src/modules/encounters/` (mit `ui/`). Die Auslöser in anderen Modulen nur, wo ein Anlass umzieht.

## Ziel

Konfrontationen sollen tiefgründiger werden und mehr Einfluss erlauben als Wahrscheinlichkeit und Drücken. Prinzip: Der Spieler sieht, was als Nächstes passiert, und antwortet darauf. Alles im bestehenden Akte-Dialog über der Karte und im Handy-Weg.

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

### 1. Engine

- Pro Runde eine **Absicht** der Gegenseite aus einer Liste je Anlass (z.B. „geht auf die Kasse“, „Anführer will reden“,
  „einer zieht ein Messer“, „sucht den Ausgang“), gewürfelt aus Lage und Zeigern.
- **Zwei Zeiger** 0–100: Aggression und Bereitschaft zu gehen. Jede Handlung verschiebt beide (Werte als Daten in
  `actions.ts`, modifiziert durch Werte der Beteiligten und die Absicht). Über `AGGRESSION_FIGHT` (70) beginnt der Kampf,
  unter `RETREAT_AT` (30) Bereitschaft zieht die Gegenseite ab. Der Würfel entscheidet nur die Stärke eines Effekts.
- **Polizei-Uhr:** Runden bis zur Streife aus Polizeipräsenz und Heat; läuft sie ab, verlieren beide Seiten (Festnahme-
  Chance, Ware weg). „Bullen rufen“ setzt sie auf 1.
- **Mehrere Einsätze:** Ware, Kasse, Leute, Spot, Lärm (Heat). Pro Runde schützt man einen; das Ergebnis ist eine Mischung
  (`EncounterResult` mit Teil-Ergebnissen), `effects` bleibt kompatibel.
- **Gegner mit Rollen:** Anführer, Nervöser, Schläger (Anzahl je Anlass). Handlungen können eine Rolle zielen
  (Anführer einschüchtern, Nervösen ansprechen).
- `autoResolveEncounter` nutzt dieselbe Logik mit einer einfachen Strategie (für Leute ohne Boss, Bot, Vollmacht).

### 2. Crew und Spezialzüge

- Im Briefing bis zu drei Leute wählen (freie Leute der Stadt, Vorschlag vorbelegt). Jede Person bringt einen
  Spezialzug aus Rolle und Werten, einmal pro Konfrontation: Sicherheit blockt einen Treffer, Fahrer mit Fahrzeug macht
  die Flucht sicher, hohes Charisma gibt eine zweite Verhandlung, hohes Tempo bringt die halbe Ware sofort weg.
  Eigenschaften aus Auftrag 34 kommen später über eine Lese-Funktion dazu (Haken vorsehen, z.B. `specialMoves(member)`).

### 3. Rat der Rechten Hand

- Ist eine Rechte Hand da, kommentiert sie im Dialog die Lage in einem Satz aus Daten (Gang-Stil, Zeiger, Uhr), z.B.
  „Die lassen sich nicht einschüchtern. Zahl oder lass sie ziehen.“ Keine eigene Meinung, nur Rat.

### 4. Oberfläche

- Akte-Dialog: Zeiger als zwei Balken, Absicht als Chip, Uhr als Zähler, Einsätze als Chips mit Schutz-Markierung, Crew
  mit Porträts und Spezialzug. Vor dem Tippen zeigt jede Handlung ihre Wirkung als kleine Pfeile an den Zeigern.
- Ergebnis-Karte mit den Teil-Ergebnissen. Handy-Weg (per Handy entscheiden) mit derselben Information, kompakt.

### 5. Anlässe umziehen, Zoll vorbereiten

- Alle bestehenden Anlässe (`raidDefense`, `policeChase`, `vehicleCheck`, `debtCollection`, `dealGoneWrong`,
  `gangSpotRaid`, Zoll auf der Autobahn) laufen über das neue System, mit je mindestens vier Situationstexten nach Ort,
  Tageszeit und Wetter.
- Zollkontrolle als eigener Anlass mit eigenen Handlungen (Papiere zeigen, bestechen, ablenken, Ladung aufgeben) für
  Hafen und Autobahn, damit die Hafen-Phase ihn nutzen kann.

### 6. Bot, Balancing, Doku

- Messen wie in Auftrag 24: 300 Überfälle ausgewürfelt, Erfolg, Rückzug, verloren, Verletzte vorher und nachher. Ziel:
  ähnliche Schwierigkeit, mehr Einfluss durch gute Entscheidungen (ein guter Spieler-Bot schneidet deutlich besser ab
  als ein zufälliger).

## Nicht in diesem Auftrag

- Benannte Gegner, Ausrüstung als Besitz, Nerven als Wert, Gedenkwand
- Eigenschaften der Leute (Auftrag 34; nur der Haken)

## Fertig, wenn

- Jede Konfrontation zeigt Absicht, Zeiger, Uhr, Einsätze und Crew, und gute Entscheidungen machen messbar einen Unterschied.
- Alle alten Anlässe laufen über das neue System, alte Spielstände mit laufender Konfrontation laden.
