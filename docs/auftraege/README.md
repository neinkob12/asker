# Bauplan: Aufträge für parallele Claude-Sessions

Hier liegen die Aufträge, mit denen der Prototyp zu einem richtigen Spiel ausgebaut wird.
Jeder Auftrag ist ein Prompt für eine eigene Claude-Session.
Der Plan ist so geschnitten, dass mehrere Sessions gleichzeitig arbeiten können, ohne sich in die Quere zu kommen.

## Ablauf

```
Phase 0  Fundament          1 Session, allein          00-fundament.md
            │  PR mergen
            ▼
Phase 1  Systeme            5 Sessions gleichzeitig    10 bis 14
            │  PRs nacheinander mergen
            ▼
Phase 2  Integration        1 Session, allein          20-integration.md
```

1. **Phase 0 (Fundament):** Eine Session baut den Prototyp in die neue Architektur um. Danach hat jedes Spielsystem einen eigenen Ordner mit fester Schnittstelle. Solange Phase 0 läuft, arbeitet niemand sonst am Code.
2. **Phase 1 (Systeme):** Wenn der PR aus Phase 0 in `main` ist, starten fünf Sessions gleichzeitig. Jede arbeitet nur in ihren eigenen Ordnern (Tabelle unten).
3. **Phase 2 (Integration):** Wenn alle fünf PRs gemergt sind, verbindet eine Session die Systeme miteinander, balanciert und testet das Ganze.

## Wie eine Session gestartet wird

Neue Claude-Code-Session auf diesem Repo starten und diesen Prompt einfügen (Dateinamen anpassen):

```
Setze den Auftrag in docs/auftraege/00-fundament.md vollständig um.
Lies vorher CLAUDE.md (falls vorhanden), docs/konzept.md und docs/auftraege/README.md.
```

## Wer arbeitet wo (Phase 1)

| Auftrag | Thema | Ordner, die nur diese Session ändert |
| --- | --- | --- |
| [10](10-veedel-reviere-polizei.md) | Veedel, Reviere und Polizei | `src/modules/veedel/`, `src/modules/territory/`, `src/modules/police/` |
| [11](11-gangs-konfrontationen.md) | Gangs und Konfrontationen | `src/modules/gangs/`, `src/modules/encounters/` |
| [12](12-wirtschaft-ware.md) | Wirtschaft und Ware | `src/modules/goods/`, `src/modules/market/`, `src/modules/suppliers/`, `src/modules/customers/`, `src/modules/spots/`, `src/modules/reputation/`, `src/modules/laundering/` |
| [13](13-personal-hierarchie.md) | Personal und Hierarchie | `src/modules/staff/`, `src/modules/hierarchy/`, `src/modules/recruiting/` |
| [14](14-look-handy.md) | Look, Spiel-Handy und Sound | `src/ui/`, `src/map/`, `src/audio/`, `src/modules/weather/`, `public/` |

`src/core/`, `src/main.tsx`, `index.html`, `scripts/`, `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md`, `package.json`, `package-lock.json`, die Konfigurationsdateien im Repo-Root (`tsconfig.json`, `vite.config.ts`, `biome.json`) und `.github/` gehören in Phase 1 niemandem. Die ändert erst wieder die Integration.

Was jede Session nach dem Fundament vorfindet und welche Schnittstellen sie nutzen kann, steht in [`docs/architektur.md`](../architektur.md) im Abschnitt "Was die parallelen Sessions vorfinden".

## Regeln für alle Sessions in Phase 1

1. **Nur die eigenen Ordner ändern.** Alles außerhalb der Tabellenzeile ist tabu.
2. **Fehlt etwas bei einem anderen Modul, nicht dort einbauen.** Stattdessen im eigenen Modul mit einer Übergangslösung arbeiten und den Wunsch im PR unter "Für die Integration" aufschreiben.
3. **Öffentliche Schnittstellen nur erweitern, nie brechen.** Andere Sessions benutzen sie gleichzeitig. Muss etwas wegfallen, kommt das unter "Für die Integration".
4. **Andere Module nur über ihre öffentliche Schnittstelle nutzen:** die Exporte aus `index.ts`, ihre Befehle und ihre Ereignisse.
5. **Keine neuen npm-Pakete, außer es geht wirklich nicht ohne.** Dann im PR begründen.
6. **Ändert sich die Form des eigenen Spielzustands:** Version hochzählen und eine Migration schreiben, damit alte Spielstände weiter laden.
7. **Vor jedem Push `npm run check` ausführen.** Es muss grün sein, und das eigene Modul braucht Tests. `npm run check` prüft auch die Ordnerregeln aus `CLAUDE.md`.
8. **Selbst ausprobieren:** das Spiel im Browser starten (z.B. `npm run screenshot`, siehe `scripts/screenshot.mjs`) und prüfen, dass das Neue funktioniert.
9. **Wurde `main` zwischendurch geändert, weil andere PRs gemergt wurden:** `main` in den eigenen Branch mergen, nicht rebasen.
10. **PR-Beschreibung mit drei Abschnitten:** "Was ist neu", "Wie testen", "Für die Integration".

## Stand

Phase 0, Phase 1 und Phase 2 (Integration, Branch `claude/integration-20`) sind erledigt, dazu
[Auftrag 21](21-logistik-strassen.md) (Logistik mit echten Straßen, Hafen, Fahrern, mehreren Lagern und
Lieferanten zum Freischalten), Auftrag 22 (Handy wie iOS), [Auftrag 24 „Look Glas“](24-look-glas.md) und
[Auftrag 24 „Feinschliff“](24-feinschliff-geld-leutnants-polizei.md) (Kasse mit Gewinn- und Verlustrechnung, Stillhaltegeld statt
vollem Lohn in Haft, Leutnants mit bis zu drei Spots, eigenem Personal und Bestellregeln, Rechte Hand mit
Tagesbericht, Polizei-Härte nach Größe des Geschäfts, mehr Geld im frühen Spiel; neues Modul `finance`). Neue Arbeit kommt als eigene Aufträge (unten), jede Session darf dann wieder den
ganzen Code ändern, sofern der Auftrag nichts anderes sagt. Vor jedem Push: `npm run check`, `npm run build`,
`npm run e2e`.

[Auftrag 26](26-handy-aufraeumen.md) ist erledigt: sechs Apps im Raster, vier im Dock, schwarzer Startbildschirm, Wetter und
Verlauf (Ereignisse, Meldungen, Aufträge) in den Einstellungen, Personal mit „Leute finden“, Geldwäsche als App, Hafen und
Umlagern auf der Lager- bzw. Hafen-Seite, Nachrichten kompakt mit Löschen, Banner nur für Dringendes, HUD mit Ruf · Reviere
und aufklappbarem Lager. [Auftrag 27](27-handy-inhalte-bilanz.md) ist erledigt: Optik-Regeln in den Bausteinen (Chips statt
„a · b“, Gruppen mit Unterlage und farbiger Kopfzeile, „Mehr dazu“ statt langer Hinweise, kein Umbruch im Wort), Kasse als
Bilanz mit Zeitraum und Filter, Geldwäsche mit drei Wegen, mehr Bewerber und Rumfragen mit Rollenwahl, Gangs-Kopf mit Stärke.

Zwei Aufträge tragen die Nummer 24 (parallel entstanden). [Auftrag 24 „Look Glas“](24-look-glas.md) setzt den Look „Glas“ für alles außerhalb des Handys um (HUD, Spot-Schilder, Marker,
Konfrontation als Akte mit sechs Wegen, Razzia, Lieferung live, Veedel übernommen).

Geplant: [Auftrag 23](23-mehr-leben-in-koeln.md) (Spot-Arten und Ausbau, Kunden-Anfragen mit automatischem Übergang,
eigene Stimmen und Methoden der Gangs, Einbruch und Abwerben, Lieferprobleme mit Entscheidungen, Fuhrpark,
Daueraufträge mit Disponent, Stadt-Events). Baut auf Auftrag 24 „Feinschliff“ auf: Leutnants führen Spots (nicht Veedel), Geld
immer mit Kategorie buchen, Lieferanten mit Liegeplatz für Leutnants über `isPortSupplierAllowed` in
`src/modules/hierarchy/orders.ts` freigeben, sobald es den Disponenten gibt.

### Nächste Runde: Feedback vom 02.10.2026 (Handy und Spielablauf)

```
Auftrag 26  Handy aufräumen          ─┐  gleichzeitig möglich
Auftrag 28  Spots, Rechte Hand        ─┘
            als Auftragsfahrer
               │  26 mergen
               ▼
Auftrag 27  Handy-Inhalte (Bilanz, Geldwäsche, Personal, Gangs, Optik)
```

| Auftrag | Thema | Wann |
| --- | --- | --- |
| [26](26-handy-aufraeumen.md) | Weniger Apps, schwarzer Startbildschirm, Personal und Geldwäsche als Apps, Nachrichten (gelesen, löschen), weniger Banner, HUD (Ruf + Reviere, Lager klappt auf) | erledigt |
| [28](28-spots-rechte-hand.md) | Spots in jedem Veedel, weniger Aufträge, Kuriere fallen weg, nur die Rechte Hand nimmt Aufträge an und fährt aus, Rechte Hand mit Aufgaben bis "Köln läuft allein" | erledigt |
| [27](27-handy-inhalte-bilanz.md) | Kasse als Bilanz, Geldwäsche mit drei Wegen, mehr Bewerber, Gangs-Kopf, Chips statt "·", keine Umbrüche im Wort | erledigt |

Auftrag 23 (geplant) überschneidet sich mit 28 (Disponent, Daueraufträge). Wird 23 später gestartet, gilt: Der
Disponent ist in der Rechten Hand aus Auftrag 28 aufgegangen.

**Stand Auftrag 28:** umgesetzt und gemergt. Jedes Veedel hat mindestens zwei
Spots, Lieferanfragen kommen halb so oft, Kuriere sind weg, die Rechte Hand fährt Aufträge und hat sechs Aufgaben mit
Stufen (`hierarchy/tasks.ts`); das Ziel "mehrere Städte" steht in `docs/konzept.md`.

**Stand Auftrag 27:** umgesetzt. Offen geblieben (spätere Aufträge): Regel-Blätter für die Aufgaben der Rechten Hand,
Tarnfirmen mit eigenem Gameplay (die drei Wege der Geldwäsche sind die Vorstufe), Chips im Chat (Routine/Chefsache).

### Nächste Runde: Städte (Fragerunde vom 02.10.2026, 16 Fragen)

```
Auftrag 30  Köln komplett, Vollmacht, Hamburg, Routen   (Spiellogik, zuerst; Etappe 0 löst die Performance-Bremsen)
               │  mergen
               ▼
Auftrag 31  Die Karte lebt                             (Verkehr, Leute an Spots, Flüsse und Straßen aus Daten, Budget)
```

| Auftrag | Thema | Wann |
| --- | --- | --- |
| [30](30-staedte-hamburg.md) | Sieg erst bei allen 12 Veedeln (7 bleibt Meilenstein „Boss von Köln“), Vollbild-Anruf aus dem Hamburger Hafen, Vollmacht der Rechten Hand (Stufe 5, alle Aufgaben, 80 % vom Kölner Tagesgewinn, Eingreifen jederzeit), Modul `city` mit Schlafmodus (nur die sichtbare Stadt läuft voll), Hamburg mit 12 Stadtteilen, Hafen-Großmengen, höheren Preisen, Reeperbahn, härterer Polizei und Zoll, Toni als Startlieferant, Routen mit Fahrplan über die A1, Charakter der Städte (Köln: Stadt-Events, Klüngel, Studenten und Kneipen), Schablone für Stadt drei | als Nächstes |
| [31](31-karte-lebt.md) | Verkehr und Leute an Spots als Kulisse mit Performance-Budget, Rhein und Elbe aus Overture-Daten, Prüfskript „Fahrzeuge überall auf der Straße“, Hamburger Wahrzeichen, schöne Deutschland-Ansicht, Quellenangabe im Spiel | nach 30 |

Die Messung zum Ruckeln (Hotspots, Skripte, Zahlen) steht in [`docs/perf/2026-10-messung.md`](../perf/2026-10-messung.md).
Beide Aufträge messen damit vorher und nachher.

## Mergen

- Ein PR wird gemergt, sobald er fertig und die CI grün ist. Die Reihenfolge in Phase 1 ist egal.
- Meldet GitHub nach einem Merge einen Konflikt in einem anderen PR, schreibst du dessen Session: "Merge main in deinen Branch und löse die Konflikte."
- Konflikte in `package-lock.json` nie von Hand lösen, sondern mit `npm install` neu erzeugen.

## Fahrplan nach Auftrag 30 und 31 (Entwurf vom 03.10.2026)

Fünf Aufträge, geschnitten so, dass jeder allein auf `main` laufen kann. Reihenfolge = Empfehlung; 32 und 33 könnten
parallel laufen (verschiedene Module), alles andere nacheinander. Vor jedem Auftrag eine kurze Fragerunde zu den offenen
Punkten, dann wird daraus der Prompt wie bei 30 und 31.

```
Auftrag 32  Fuhrpark und Fahrer          ─┐  gleichzeitig möglich (logistics/staff gegen quests/encounters/gangs)
Auftrag 33  Das Kartell ruft             ─┘
               │  beide mergen
               ▼
Auftrag 34  Tarnfirmen
               │
               ▼
Auftrag 35  Gesichter, Geschichte, Rückblick
               │
               ▼
Auftrag 36  Online für Freunde (Hosting, Cloud-Stände, Spielmodi)
```

### 32: Fuhrpark und Fahrer

- **Ziel:** Die Routen aus Auftrag 30 bekommen echte Fahrzeuge. Logistik wird ein eigenes Spielfeld statt einer Zahl.
- **Inhalt:** Fahrzeuge kaufen mit sauberem Geld (Transporter, Sprinter, Kastenwagen, Lkw; später Boot für die Elbe),
  Ladekapazität ersetzt die eine Kapazität je Fahrt, Verschleiß und Werkstatt, Kennzeichen, die die Polizei nach einer
  Kontrolle wiedererkennt (umlackieren, abmelden), Fahrzeug pro Fahrer und pro Route, Rechte Hand und Leutnants fahren
  mit dem, was frei ist. Fahrer bekommen Werte für Autobahn (Vorsicht, Tempo) und ein eigenes Profil in der Personal-App.
  Garage als Lager-Typ (Stellplätze). Fahrzeuge auf der Karte in Art und Farbe des Fuhrparks.
- **Module:** `logistics` (Fuhrpark, Kapazität, Werkstatt), `staff` (Fahrer-Werte), `goods` (Garage), `police`
  (Kennzeichen), Karte (`vehicles.ts` Arten).
- **Offen (Fragerunde):** Wie viele Fahrzeugtypen und Preise; Verschleiß ja oder nein; Kennzeichen-Gedächtnis der Polizei
  wie hart; Boot auf der Elbe schon hier oder später; Fahrzeuge klaubar durch Gangs.

### 33: Das Kartell ruft (Endspiel)

- **Ziel:** Wer zwei Städte komplett hält, bekommt den Anruf aus Kolumbien. Ein echtes Endspiel mit eigenem Druck statt
  Endlosmodus.
- **Inhalt:** Anruf (Mittel aus Auftrag 30), Kartell als Lieferant mit Mengen in Kilo direkt per Container in jede Hafenstadt,
  Preise weit unter allem, dafür Mindestabnahme pro Woche und Strafen bei Nichterfüllung (Geld, dann Leute, dann du).
  Neuer Gegner: eine konkurrierende Organisation, die die Kartell-Ware auch will und in beiden Städten gleichzeitig
  drückt (Gang-KI über Städte hinweg). Bundespolizei und Europol als neue Polizei-Stufe über Großhändler mit
  Großrazzien in mehreren Städten. Drei Enden: aussteigen (alles übergeben, Abspann), durchhalten (Kartell zufrieden,
  Pate, Abspann), untergehen. Quest-Kapitel „Das Kartell“ als roter Faden, Abspann im Look Glas mit Zahlen des
  Durchgangs und Bestenliste.
- **Module:** `suppliers` (Kartell), `gangs` (Organisation über Städte), `police` (neue Stufe), `quests`, `encounters`
  (neue Anlässe: Übergabe am Kai kippt, Erpressung), `outcome` (Enden), UI (Abspann).
- **Offen:** Ab wie vielen Städten der Anruf kommt (zwei oder drei); Mindestabnahme als Stress-Kern ja oder nein; soll
  Ablehnen des Kartells möglich sein und was folgt; wie hart die neue Polizei-Stufe.

### 34: Tarnfirmen

- **Ziel:** Die drei Wege der Geldwäsche werden Betriebe mit eigenem Gameplay und sichtbarem Aufstieg.
- **Inhalt:** Betriebe kaufen (Späti, Waschsalon, Shisha-Bar, Werkstatt, Immobilien), jeder mit echtem Umsatz (legal,
  sauber), Personal (Geschäftsführer mit Loyalität), Waschkapazität pro Tag und Risiko (Betriebsprüfung,
  Finanzamt, Steuerfahndung als neue Behörde neben der Polizei), Ausbau (Stufen), Bücher fälschen als Entscheidung.
  Tarnfirmen auf der Karte als Gebäude mit Schild, in der Geldwäsche-App als Seite pro Betrieb, in der Kasse als eigene
  Spalte. Betriebe als Deckung: Lager hinter einer Werkstatt wird bei Razzien seltener durchsucht.
- **Module:** `laundering` (Betriebe), `finance` (Sauber-Umsatz), `police` oder neues Modul `tax` (Prüfung), `goods`
  (Lager mit Deckung), Karte.
- **Offen:** Wie viele Betriebsarten; Steuerfahndung als eigene Behörde ja oder nein; Betriebe pro Stadt oder überall; soll
  ein Betrieb pleitegehen können.

### 35: Gesichter, Geschichte, Rückblick

- **Ziel:** Entscheidungen fühlen sich an, weil Menschen dranhängen. Dazu der Blick zurück auf den Durchgang.
- **Inhalt:** KI-Porträts für Leute, Gangs-Bosse, Lieferanten, Kontakte (einmal erzeugt, als Dateien im Repo, Stil
  einheitlich düster), Avatar-Baustein nutzt sie. Figuren-Bögen über Städte hinweg (der Hafenarbeiter, Toni, ein
  überlebender Gangs-Boss, Peter) als Quest-Kapitel mit Dialogen. Verrat mit Folgen: ein Spitzel in der Crew, der
  Polizei füttert (Hinweise im Tagesbericht, Verhör als Konfrontation). Statistik-Seite: Verlauf von Vermögen, Ruf,
  Reviere über Tage, Zeitraffer der Karte, Rekorde und Erfolge (Achievements) in den Einstellungen. Musik pro Stadt
  und Stimmung. Charakter-Erstellung beim ersten Start (Herkunft, Stärke) als kleiner Startbonus.
- **Module:** `staff`, `gangs`, `suppliers` (Porträt-Felder), `quests`, `encounters`, neues Modul `stats` oder in `finance`,
  `src/audio`, `src/ui/player.ts`.
- **Offen:** Porträts erzeugen womit und wie viele; Charakter-Erstellung ja oder nein; welche Figuren Bögen bekommen;
  Spitzel-Mechanik wie hart.

### 36: Online für Freunde

- **Ziel:** Das Spiel läuft gehostet mit Passwort, Spielstände liegen in der Cloud, Freunde vergleichen sich.
- **Inhalt:** Passwortschutz (Vercel Middleware, ein geteiltes Passwort oder Einladungslinks), Cloud-Spielstände
  (Upstash wie die Bestenliste: Autosave hoch, auf jedem Gerät weiterspielen, Konflikt bei zwei Geräten),
  Spielmodi beim Start („Entspannt“, „Normal“, „Hardcore“, Saisons mit festem Seed für alle), Bestenliste mit Filter
  pro Saison und Modus, Tutorial-Kapitel als Quest-Kette für Neue, Fehlerberichte aus dem Spiel (ein Knopf schickt
  Spielstand und Journal). Vorbereitung für Multiplayer: Zeit läuft weiter, wenn der Spieler offline ist, als
  Experiment im Schlafmodus aus Auftrag 30 (Zusammenfassung pro Tag), ohne echte Interaktion zwischen Spielern.
- **Module:** `api/` (Vercel), `leaderboard`, `src/core/persistence.ts` und `saves.ts`, `quests`, Einstellungen.
- **Offen:** Ein Passwort oder Konten; Offline-Zeit ja oder nein; Saisons ja oder nein; welche Modi.

### Was danach bleibt

- Eigener Anbau (Plantage, Strom und Hitze, eigene Sorten), Justiz (Verfahren, Zeugen), Stadt vier.
- Multiplayer (Crews gegeneinander in derselben Stadt), erst nach 36 und der Entscheidung zur Offline-Zeit.
- Upgrade-Baum, wenn Fuhrpark, Tarnfirmen und Ränge zeigen, welche Stellschrauben Spieler wirklich wollen.
