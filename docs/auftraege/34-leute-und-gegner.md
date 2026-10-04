# Auftrag 34: Leute mit Geschichte, Gangs mit Gedächtnis, Stammabnehmer, Capo

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/34-leute-und-gegner.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/plan.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und
docs/auftraege/README.md.
```

**Welle 2.** Startet, wenn 23 und 32 gemergt sind. Läuft parallel zu 36 (die ändert in `hierarchy` nur Übergabe und Statthalter).

**Ordner:** `src/modules/staff/`, `src/modules/recruiting/`, `src/modules/gangs/`, in `hierarchy` Capo und Rat im Tagesbericht, in `customers` die Dealer.

## Ziel

Leute werden Figuren mit Geschichten, Gangs erinnern sich und führen Kriege untereinander, die Dealer werden feste Abnehmer, und große Städte bekommen eine Führungsebene, die auch die nächste Stadt tragen kann.

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

### 1. Leute mit Geschichte

- Zwei bis drei Eigenschaften pro Person aus einer Liste in `staff/config.ts` (z.B. Familienvater, trinkt, spielt,
  ehrgeizig, Angsthase, Maulheld, treu), gewürfelt bei der Erzeugung, Migration würfelt für Bestehende fest aus der ID.
  Wirkung als kleine Faktoren (Loyalität, Ausfall, Lohnwunsch, Spezialzug aus Auftrag 35 über den Haken).
- Beziehungen zwischen Leuten (Freunde, Geschwister, Rivalen, Paar), wenige pro Team; Wirkung auf Loyalität beim Feuern,
  Tempo am selben Spot, Loyalität bei Haft.
- Ereignisse aus Eigenschaften und Beziehungen per Handy im Ton der Figur, mit Optionen und Abklingzeit (Geldbitte,
  Beförderungswunsch, betrunken den Spot stehen lassen …), mindestens zwölf Vorlagen mit Text-Helfer aus Auftrag 23.
- Personal-App: Eigenschaften als Chips, Beziehungen im Profil.

### 2. Gangs mit Gedächtnis

- Erinnerungen pro Gang als Liste (Ereignis, Wirkung auf die Beziehung, Verfall in Tagen), aus bestehenden Ereignissen
  (verpfiffen, Schutzgeld pünktlich, Überfall abgewehrt, Spot überfallen, Abkommen gebrochen). Gangs-App zeigt sie als
  Chips; Texte der Gang beziehen sich darauf; Preise für Waffenstillstand und Bündnis hängen daran.
- Beziehungen der Gangs untereinander als Daten in `gangs/data.ts`, Vorstöße auch gegen andere Gangs (Gang-Krieg), mit
  Nachricht an den Spieler und der Möglichkeit, Partei zu ergreifen (Ware liefern, einen Spot der anderen überfallen).
  Das Gedächtnis bleibt über die Städte hinweg für die Hafen-Phase erhalten.

### 3. Stammabnehmer

- Die Dealer (`DEALERS`) bekommen Vertrauen wie die Lieferanten: erfüllte Deals rauf, geplatzte stark runter. Stufen:
  regelmäßige Anfragen, Vorkasse, Exklusivität (nur bei dir, dafür Rabatt), Zwischenhändler für ein Veedel (wöchentliche
  Lieferung, Einfluss ohne Spot, geringere Marge). Wer zweimal hängengelassen wird, geht zu einer Gang.
- Dealer pro Stadt als Daten. Das Modell ist die Vorlage für die Kunden der Hafen-Phase (Auftrag 40).

### 4. Capo und Rat

- Capo in `hierarchy`: Leutnant ab Level 5 mit drei Spots führt bis zu drei Leutnants in benachbarten Veedeln (Bezirk),
  regelt dort Ausfälle und Nachschub, Lohnanspruch doppelt. Personal-Baum mit Ebene. Befehle `hierarchy.appointCapo`,
  `hierarchy.dismissCapo`. Die Rechte Hand spricht dann nur mit Capos.
- Der Tagesbericht der Rechten Hand bekommt einen Satz Rat aus Daten (Engpass, teurer Leutnant, Gang-Druck), keine
  eigene Haltung, kein Verrat.

### 5. Bot, Balancing, Doku

- Bot ernennt ab acht Leutnants einen Capo, antwortet auf Ereignisse vernünftig, nutzt Stammabnehmer.
- Messen: Kernzahlen vorher/nachher, Anzahl Gang-Kriege und Ereignisse pro Woche (Ziel: spürbar, nicht hagelnd).

## Nicht in diesem Auftrag

- Benannte Statthalter der Gangs, Information als Ressource, Korruption
- Rechte Hand mit eigener Haltung oder Verrat

## Fertig, wenn

- Leute haben Eigenschaften, Beziehungen und Ereignisse, Gangs ein Gedächtnis und Kriege, Dealer Vertrauen, große Städte einen Capo.
