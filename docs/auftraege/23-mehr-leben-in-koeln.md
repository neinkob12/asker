# Auftrag 23 – Mehr Leben in Köln: Spots, Gangs, Lieferungen, Fuhrpark, Stadt-Events

Prompt für eine eigene Claude-Session. **Erst starten, wenn Auftrag 22 (Handy wie iOS, Branch
`claude/auftrag-22-handy-ios`) in `main` gemergt ist.** Dann eine neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/23-mehr-leben-in-koeln.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, docs/handy-design.md, src/ui/README.md und
docs/auftraege/README.md.
```

## Wunsch aus dem Probespielen (01.10.2026)

> Ich möchte, dass es mehr Funktionen gibt, z.B. Spots selber gründen. Kunden sollen einem ab einem Punkt nicht mehr
> schreiben, sondern zu den Spots kommen müssen, weil man das sonst nicht alles gleichzeitig händeln kann; dann sollen
> nur noch Großkunden schreiben. Mehr unterschiedliche Ereignisse und Nachrichten: Gerade schicken alle Gangs ähnliche
> Nachrichten, und die Überfälle, Razzien und Verspätungen der Lieferungen sind immer dasselbe. Da muss es viel mehr
> Abwechslung geben. Gerne auch Logistisches.

Die Entscheidungen dazu sind in einer Fragerunde mit zehn Fragen gefallen (Tabelle unten). Was dort nicht gewählt
wurde, gehört **nicht** in diesen Auftrag (Abschnitt „Nicht in diesem Auftrag“).

## Rahmen

- **Vorbedingung prüfen, bevor du irgendetwas baust:** `git fetch origin main` und nachsehen, ob Auftrag 22 in `main`
  ist (z.B. `src/ui/phone/navModel.ts`, `src/ui/phone/spring.ts`, `docs/auftraege/22-handy-ios-gefuehl.md` und die
  Bausteine `Sheet`, `ActionSheet`, `Stepper`, `ContextMenu`, `SwipeRow` in `src/ui/components`). Fehlt das, **hör auf
  und sag dem Spieler Bescheid**, statt ohne die neue Handy-Oberfläche loszulegen.
- **Die Oberfläche aus Auftrag 22 ist der Maßstab.** Neue Handy-Seiten benutzen dessen Bausteine und Muster: Navigation
  als Stapel (`openPanel` = push), `Group`/`ListItem`/`ItemContent`/`SummaryTiles`, Werte rechts in der Zeile, keine
  Karten in Karten, `Sheet` für Auswahl und Formulare, `ActionSheet` für alles Gefährliche oder Teure, `Stepper` für
  Zahlen, `ContextMenu` bei langem Druck, Bedeutungsfarben (`color="money" | "dirty" | "danger" …`), `haptic(kind)`.
  Lies vorher `docs/handy-design.md` (auch Abschnitt 7 aus Auftrag 22) und schau dir die umgebauten Seiten (Spot,
  Gangs, Aufträge, Logistik) an, bevor du sie erweiterst. Baue keine eigenen Varianten von Bausteinen, die es schon
  gibt; fehlt etwas, erweitere den Baustein in `src/ui/components` (Props nur erweitern, nie brechen).
- **Ganzer Code freigegeben** (siehe `docs/auftraege/README.md`, Abschnitt „Stand“), aber jede Änderung an einem Modul
  bleibt in dessen Ordner, Kern nur wo nötig. Ordnerregeln aus `CLAUDE.md` gelten (`npm run lint` prüft sie).
- **Sprachregel:** Code-Bezeichner Englisch; Kommentare, UI-Texte, Nachrichten, Journal, Commits und PR Deutsch.
- **Determinismus:** Zufall nur über `ctx.random()/chance()/pick()/randomInt()`, Zeit nur in Spielminuten.
- **Migrationen:** Jede Änderung an der Form eines Zustands bekommt `version + 1`, eine Migration und einen Test.
  Alte Spielstände laden weiter und spielen sich sinnvoll weiter.
- **Keine neuen npm-Pakete.**
- **Arbeite in Etappen** (Reihenfolge unten). Nach jeder Etappe: `npm run check`, Commit, Push. Den Draft-PR nach der
  ersten Etappe anlegen, damit nichts verloren geht. Wird `main` zwischendurch geändert: `main` mergen, nicht rebasen.

## Entscheidungen aus der Fragerunde

| Thema | Entscheidung |
| --- | --- |
| Spots | Spot-Arten, Anlaufzeit und Bekanntheit, Ausbau sowie Verlegen, Umbenennen, Aufgeben. **Keine** Gang-Reaktion auf neue Spots, **keine** „verbrannten“ Spots. |
| Kunden-Anfragen | **Automatisch, abschaltbar:** Am Anfang schreiben Kunden. Ab einem Meilenstein kommen sie an die Spots, dann schreiben nur noch Großkunden. Der Schalter bleibt (manuell wieder an oder ganz aus). |
| Gangs | **Eigene Stimme und eigene Methoden** pro Gang. Kein Gedächtnis über frühere Ereignisse (später). |
| Neue Gang-Aktionen | **Einbruch und Diebstahl**, **Abwerben und Einschüchtern**. Nicht: Hinterhalt/Geisel, Sabotage/Rufmord. |
| Lieferprobleme | **Gründe und Entscheidungen**: viele echte Gründe, ein Teil mit Entscheidung per Handy, jeder Lieferant mit eigener Stimme. Keine tagelangen Ausfälle von Lieferanten. |
| Logistik | **Eigene Fahrzeugflotte** und **Daueraufträge mit Disponent**. Nicht: Lager-Ausbau, Routenwahl. |
| Stadt-Events | **Kalender und spontane Ereignisse**, per Handy angekündigt, mit Wirkung auf Nachfrage, Heat, Preise. |
| Ton | **Gemischt:** etwa die Hälfte der neuen Ereignisse sind Chancen, die andere Hälfte Probleme. Die Schwierigkeit bleibt laut Bot-Balancing etwa gleich, das Spiel wird abwechslungsreicher, nicht härter. |
| Umsetzung | Ein Auftrag, eine Session, erst nach Auftrag 22. |

## Ausgangslage (Stand `main` nach #15, vor Auftrag 22; selbst nachprüfen)

- **Spots gründen** gibt es schon, aber flach: `spots.found` kostet 800 € Schwarzgeld, Klick auf die Karte, höchstens
  6 eigene Spots, Name automatisch „Ecke <Veedel>“ (`src/modules/spots/index.ts`, `config.ts`: `FOUND_SPOT_COST`,
  `MAX_CUSTOM_SPOTS`, `CUSTOM_SPOT_DEMAND`). Ein neuer Spot ist sofort voll da, hat keine Art, keinen Ausbau und lässt
  sich nicht verlegen, umbenennen oder aufgeben.
- **Kunden-Anfragen:** Seit #15 gibt es `customers.directOrders` (Zustand Version 4, Befehl
  `customers.setDirectOrders`, Schalter „Kunden dürfen mir schreiben“ in der Aufträge-App), **standardmäßig aus**. Dann
  kommen nur Großhandelsanfragen (`offerWholesale`, fünf Dealer in `customers/config.ts: DEALERS`). Es gibt keinen
  automatischen Übergang und nur eine Art von Großkunde.
- **Gang-Nachrichten:** Alle vier Gangs teilen sich `GANG_TEXTS` in `src/modules/gangs/texts.ts` mit 1–2 Varianten pro
  Anlass, obwohl `gangs/data.ts` jeder Gang Stil, Stärken und Schwäche gibt. Ausgewählt wird mit `ctx.pick`, dieselbe
  Variante kann direkt wiederkommen.
- **Überfälle:** Immer die Konfrontation `raidDefense` (`encounters/kinds.ts`), nur in drei Kulissen (Spot, Kurier,
  Lager, `gangs/ai.ts: launchRaid`) mit je einem festen Situationstext. Alle Gangs greifen gleich an.
- **Lieferprobleme:** `suppliers/index.ts: revealProblems` und `deliver`: Verspätung immer „Kontrolle auf der Strecke,
  der Fahrer muss warten“, Beschlagnahme und schlechte Ware je ein Text, keine Entscheidung. Lieferanten
  (`suppliers/config.ts`): Frankfurt (Toni), Hamburg (Hein), Berlin (Mirko), Amsterdam (Daan), Rotterdam (Jansen),
  Köln (Kalle aus Kalk).
- **Hafen und Fahrten:** `logistics/index.ts`: je ein Text für Container da, Zoll, Willkommen. Fahrzeuge gibt es nicht
  als Besitz; jede Fahrt fährt ohne Kapazitätsgrenze. Verkehrskontrolle = Konfrontation `vehicleCheck`.
- **Weitere Routine-Nachrichten** mit nur einem Text: Lohn-Beschwerde, Kündigung, Razzia-Warnung des Polizei-Kontakts
  (`staff/routines.ts`), Gehaltswunsch des Leutnants (`hierarchy/index.ts`), Leutnant-Meldungen (`hierarchy/ai.ts`).
- **Namensgleichheit:** Drei Figuren heißen Kalle: Lieferant Köln („Kalle aus Kalk“), Hafenmeister
  (`logistics/config.ts: HARBOR_CONTACT`) und der Boss der Schäl Sick („Kalle Brenner“, Heimat Kalk). Den
  **Hafenmeister umbenennen** (Kontakt-ID `other:harbor` bleibt). Lieferant und Gang-Boss bleiben, wie sie sind.
- **Stadt-Events** stehen im Konzept, gebaut ist nichts davon.

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge. Jede Etappe bringt Simulation, Tests und ihre Handy-Seiten mit.

### 0. Vorbereitung

- Vorbedingung prüfen (oben). Branch von `main`.
- **Vorher-Messung:** `npm run balance` laufen lassen und die Kernzahlen (erstes Veedel, drei Veedel, Umsatz pro Tag,
  Pleiten) für den PR notieren. Am Ende wird damit verglichen.

### 1. Abwechslung in Texten (Grundlage für alles Weitere)

- **Text-Helfer ohne direkte Wiederholung:** Eine kleine Hilfe, die aus einer Liste von Varianten wählt und die zuletzt
  benutzten pro Schlüssel (z.B. `gang:nord:warning`) nicht sofort wiederholt, mit Platzhaltern (`{boss}`, `{veedel}` …).
  Empfehlung: im Kern (`src/core/texts.ts`, exportiert über `core/index.ts`), mit einem kleinen Gedächtnis im
  Spielstand (Kernschema + `CORE_MIGRATIONS`), deterministisch über `ctx.random()`. Wenn du es lieber pro Modul löst,
  begründe es im PR.
- **Gang-Stimmen:** `gangs/texts.ts` wird pro Gang aufgeteilt, jede Gang hat für jeden Anlass **mindestens fünf**
  eigene Varianten. Vorlage für den Ton (so vom Spieler ausgewählt):
  - ⚓ Hafenkolonne (Jupp „Kran“ Wendeler): grob, kölsch, kurz. „Jung, du verkaufst am Ebertplatz. Dat is unser
    Pflaster. Nächstes Mal reden wir nicht.“
  - 🕸 Venloer Syndikat (Nadine Schrader, „die Notarin“): förmlich, juristisch, droht über Dritte. „Frau Schrader lässt
    ausrichten: Ihre Aktivitäten in Ehrenfeld sind aufgefallen. Man könnte das dem Präsidium gegenüber erwähnen.“
  - 🔥 Schäl Sick (Kalle Brenner): rotzig, Preise, Masse. „Bei uns kostet dat Gramm 6 €. Bei dir 9? Viel Glück,
    Bruder.“
  - ♛ Marienburger Kreis (Dr. Konstantin Aldenhoven): leise, gebildet, kalt. „Dr. Aldenhoven bittet um ein Gespräch.
    Diskret. Er schätzt Vernunft.“
  Hochdeutsch mit kölschen Einsprengseln, wo es zur Figur passt. Keine Beleidigungen von echten Gruppen, düster aber
  nicht platt.
- **Lieferanten-Stimmen:** jeder Lieferant eigener Ton (Toni hektisch, Hein wortkarg norddeutsch, Mirko Berliner
  Schnauze, Daan locker holländisch, Jansen geschäftsmäßig, Kalle kölsch) für alle seine Nachrichten.
- **Mehr Varianten** (mindestens vier) für alle Routine-Nachrichten oben (Lohn, Kündigung, Razzia-Warnung,
  Gehaltswunsch, Leutnant-Meldungen, Hafen, Zoll) und für die **Situationstexte der Konfrontationen**
  (`raidDefense`, `policeChase`, `vehicleCheck`, `debtCollection`, `dealGoneWrong`, `gangSpotRaid`): `situation` darf
  eine Liste sein, Auswahl nach Ort, Tageszeit (Nacht/Tag), Wetter und Gang, wo das passt.
- **Hafenmeister umbenennen** (siehe oben).
- **Test:** Jede Textliste hat genug Varianten, alle Platzhalter werden ersetzt (kein `{…}` im Ergebnis), dieselbe
  Variante kommt nicht zweimal hintereinander.

### 2. Gangs: eigene Methoden und neue Aktionen

- **Methoden pro Gang** als Daten in `gangs/data.ts` (z.B. `traits.methods` mit Gewichten), die KI wählt danach, *wie*
  sie Druck macht. Richtung:
  - Hafenkolonne: Überfälle (wie heute), Einschüchtern an Spots.
  - Venloer Syndikat: hetzt dir die Polizei auf den Hals (Tipp an die Polizei → mehr Heat oder eine geplante Razzia in
    deinem Veedel; dafür eine kleine öffentliche Funktion in `police`, z.B. `tipOffAgainstPlayer`), saubere Einbrüche.
  - Schäl Sick: Preiskrieg (gibt es schon) und Abwerben deiner Leute.
  - Marienburger Kreis: diskrete Erpressung (sie wissen, wo dein Lager ist: zahlen oder sie geben es der Polizei),
    professionelle Einbrüche.
- **Einbruch und Diebstahl** (neu): nachts in ein Lager ohne Wache, ohne Kampf. Du merkst es am Morgen (Journal,
  Nachricht). Verlust abhängig von Wachen am Lager (`crewFor`, Sicherheitsleute). Danach eine Entscheidung per Handy:
  **Täter suchen** (neue Konfrontation, z.B. `recoverLoot`, holt einen Teil zurück), **verpfeifen** (wenn die Spur zu
  einer Gang führt: `police.snitch`) oder **abhaken**. Die Spur führt nicht immer zu einer Gang (Junkies,
  ein eigener Mann).
- **Abwerben** (neu): Eine Gang bietet einem deiner Leute mit niedriger Loyalität mehr Geld. Er schreibt dir („Die
  Schäl Sick bietet mir 40 € mehr am Tag“): **Lohn erhöhen** (`staff.setWage`), **gehen lassen** oder **drohen**
  (Loyalitäts-Wurf: bleibt mit weniger Loyalität oder geht und plaudert, also etwas Heat). Passt zu `staff.betrayed`.
- **Einschüchtern** (neu): Gang-Leute stehen an einem deiner Spots, dort kommen für einige Stunden deutlich weniger
  Kunden (öffentliche Lese-Funktion, die `customers` beim Erzeugen der Kunden fragt). Meldung vom Läufer oder dir
  selbst. Antworten: **Sicherheit hinschicken** (beendet es früher oder führt zur Konfrontation), **abwarten**,
  **Schutzgeld** (bestehende Diplomatie).
- **Chancen von Gangs** (Ton „gemischt“): eine Gang mit guter Beziehung warnt dich vor einem Überfall der Rivalen,
  bittet um einen Gefallen gegen Geld oder Beziehung (z.B. Ware zwischenlagern, einen Rivalen-Spot hochgehen lassen),
  ein Überläufer verkauft Infos über eine Gang (Stärke, nächster Vorstoß).
- Bestehende Eskalation (Warnung → Drohung → Überfälle), Diplomatie und Schutzgeld bleiben. Neue Aktionen haben
  Abklingzeiten und Grenzen in `gangs/config.ts`, damit es nicht hagelt.
- Handy: Die Gangs-Seite zeigt die Stil-Zeile und die letzten Aktionen der Gang gegen dich. Neue Ereignisse
  (`gang.burglary`, `gang.poachAttempt`, `gang.intimidation` o.ä.) mit Toast, Ton und Live-Aktivität, wo sinnvoll.

### 3. Lieferprobleme mit Gründen und Entscheidungen

- **Gründe als Daten** pro Weg (Straße aus einer Großstadt, Grenze NL, Schiff, Köln lokal), je mindestens acht für
  Verspätung, vier für Beschlagnahme, vier für schlechte Ware. Beispiele: Stau auf der A3, Unfall am Kreuz Köln-Ost,
  Panne, Fahrer krank, Grenzkontrolle bei Venlo, Zoll in Rotterdam, Niedrigwasser (Schiff darf weniger laden), Hochwasser
  (Schiff wartet), Hafenstreik, Tankstellen-Kontrolle. Die Texte im Ton des Lieferanten.
- **Entscheidungen** für einen Teil der Probleme, als Nachricht mit Optionen und Frist, neuer Befehl z.B.
  `suppliers.resolveProblem { shipmentId, choice }`:
  - **Umweg** gegen Aufpreis (Schwarzgeld): Verspätung deutlich kürzer.
  - **Teillieferung jetzt:** ein Teil kommt pünktlich, der Rest später.
  - **Umleiten** in ein anderes eigenes Lager.
  - **Schmieren** bei drohender Beschlagnahme: zahlen, dann eine Chance, die Ware zu retten.
  - Keine Antwort bis zur Frist = **abwarten** (Verhalten wie heute).
- **Chancen** (Ton „gemischt“): Lieferung früher da, etwas Ware obendrauf, bessere Qualität als bestellt, ein
  Sonderangebot des Lieferanten.
- Wahrscheinlichkeiten bleiben im Mittel wie heute (`rollShipmentProblem`), nur die Gründe und Folgen werden vielfältig.
- Handy: Lieferanten-App und Lieferungen zeigen den Grund und die gewählte Entscheidung; Live-Aktivität „Lieferung“
  zeigt die Verspätung mit Grund.

### 4. Kunden-Anfragen: automatischer Übergang, dann nur Großkunden

- `customers.directOrders` (boolean) wird zu einem Modus `'auto' | 'on' | 'off'` (Zustand Version 5, Migration:
  `true` → `'on'`, `false` → `'auto'`; ist der Meilenstein beim Laden schon erreicht, ohne Nachricht umstellen).
  Befehl `customers.setDirectOrders` nimmt den Modus (alte Form `{ enabled }` weiter annehmen).
- **Neues Spiel:** `'auto'`. Kunden schreiben wie vor #15 (Lieferanfragen helfen beim Start).
- **Meilenstein** (in `customers/config.ts`, Startwert zum Balancen): z.B. zwei Spots dauerhaft besetzt (aktiver Läufer
  oder Leutnant) oder Ruf ab 50, frühestens ab Tag 3. Dann:
  - Zwei, drei Stammkunden melden sich in eigenen Worten („Hab gehört, du hast jetzt feste Plätze. Ich komm ab jetzt zum
    Ebertplatz.“), Journal-Eintrag, Hinweis im Handy. Offene Aufträge laufen zu Ende.
  - Stammkunden kommen ab jetzt an ihren Spot (`regular.spotId`); als Ausgleich etwas häufiger als vorher.
  - Danach schreiben **nur noch Großkunden**.
- **Großkunden mit Abwechslung:** neben dem Großhandel der Dealer (Rabatt, wie heute) neue Großbestellungen zum normalen
  Preis oder mit Aufschlag, aber mit Frist, Ort und Risiko: Club-Betreiber, WG-Party, Agentur mit Firmenfeier,
  Festival-Crew, bei Stadt-Events auch Karnevalsgesellschaft oder Fanclub. Mindestens acht Figuren mit eigener Stimme.
  Großkunden kommen mit Banner (nicht still), aber selten.
- Handy: In der Aufträge-App statt des Schalters ein Segment „Kunden-Anfragen: Automatisch | Immer | Nie“ mit einer
  Zeile, was gerade gilt („Seit Tag 6 kommen Kunden an deine Spots“). Dieselbe Einstellung auch unter Einstellungen.

### 5. Spots: Arten, Bekanntheit, Ausbau, verlegen, umbenennen, aufgeben

- **Spot-Arten** als Daten in `spots/config.ts`, z.B. Straßenecke, Späti-Hinterzimmer, Club, Park,
  Bahnhof/Haltestelle, Campus.
  Jede Art mit Gründungskosten, Andrang, Kundschaft (`audience`), Heat-Faktor, Tageskurve bzw. Öffnungszeiten (Club nur
  abends und nachts, am Wochenende stark; Park tagsüber und wetterabhängig) und Preisniveau. Die vorgegebenen Spots
  bekommen auch eine Art (Ebertplatz: Straßenecke; Neumarkt, Breslauer Platz: Bahnhof/Haltestelle; Zülpicher,
  Rudolfplatz, Friesenplatz: Club; Aachener Weiher, Rheinpark, Stadtgarten: Park; Uni-Wiese: Campus), ohne ihre
  Wirkung heute spürbar zu verändern.
- **Bekanntheit** (0–1) pro Spot: Ein neuer eigener Spot startet niedrig (Startwert z.B. 0,2), die Kundschaft
  spricht sich über einige Tage herum (Verkäufe, Stammkunden, Ruf beschleunigen). Steht dort tagelang niemand, sinkt
  sie langsam. Andrang = Art × Veedel × Bekanntheit. Vorgegebene Spots starten voll bekannt.
- **Ausbau** pro Spot (Schwarzgeld), z.B. **Späher** (seltener Kontrollen am Spot, Warnung vorher), **Versteck**
  (weniger Verlust bei Kontrolle oder Überfall), **Stammplatz** (mehr Stammkunden, schneller bekannt). Wirkung über eine
  öffentliche Lese-Funktion (`spotModifiers(state, spotId)` o.ä.), die `police`, `customers` und `gangs` zur Laufzeit
  fragen.
- **Eigene Spots verlegen** (kostet etwas, behält einen Teil der Bekanntheit), **umbenennen** (kostenlos) und
  **aufgeben** (Leute dort werden frei, Stammkunden wechseln zum nächsten Spot oder gehen verloren).
- Befehle z.B. `spots.found` (erweitert um `type`), `spots.upgrade`, `spots.move`, `spots.rename`, `spots.close`;
  Zustand `spots` Version 3 mit Migration (alte eigene Spots: Art Straßenecke, voll bekannt).
- Handy und Karte: Nach dem Klick auf die Karte öffnet sich ein `Sheet` mit Art-Auswahl (Kosten, erwartete Kundschaft
  im Veedel, Heat-Hinweis, Öffnungszeiten), Name optional, Bestätigen. Spot-Seite: Bekanntheit als Fortschritt, Gruppe
  „Ausbau“ mit Kosten in der Zeile, Verlegen/Umbenennen, Aufgeben über `ActionSheet` (rot). Marker auf der Karte nach
  Art unterscheidbar (Icon), schwacher Spot blasser.

### 6. Eigene Fahrzeugflotte

- Fahrzeuge kaufen mit **sauberem Geld** (Legales), z.B. Roller (wenig Ladung, schnell in der Stadt, unauffällig),
  Kombi (mittel), Transporter (viel Ladung, langsamer, auffälliger = mehr Kontrollen). Werte in einer `config.ts`.
  Eigenes Modul (z.B. `fleet`) oder Teil von `logistics`, entscheide nach Größe (`logistics/index.ts` hat schon ~760
  Zeilen) und begründe es.
- **Fahrten** (Abholen am Hafen, Umlagern) nutzen ein freies Fahrzeug; die Ladekapazität begrenzt, was in einer Fahrt
  mitgeht (Rest bleibt am Kai bzw. im Lager oder braucht eine zweite Fahrt). **Ohne eigenes Fahrzeug** nimmt der
  Fahrer sein Privatauto mit einer Kapazität, die die heutigen Lieferungen abdeckt: Wer keine Flotte kauft, spielt wie
  heute. Die Flotte bringt mehr Ladung, Tempo oder Tarnung.
- **Kontrollen:** Chance hängt zusätzlich von der Tarnung des Fahrzeugs ab. Fliegt eine Ladung auf, kann das Fahrzeug
  beschlagnahmt werden.
- Optional, wenn es klein bleibt: Kuriere des Lieferdienstes fahren mit einem freien Roller schneller.
- Handy und Karte: Gruppe „Fuhrpark“ in der Logistik-App (kaufen mit `ActionSheet`, Status frei/unterwegs/
  beschlagnahmt), Fahrzeugwahl beim Abholen und Umlagern, auf der Karte unterscheidbare 3D-Mini-Fahrzeuge
  (`createVehicle` aus `src/map`).

### 7. Daueraufträge und Disponent

- **Disponent** als neue Spezialisten-Rolle in `staff` (wie Anwalt und Buchhalter über den Bewerber-Pool, mit Lohn).
  Ohne Disponent laufen keine Automatiken; das Automatisieren ist also eine bezahlte Entscheidung im späten Spiel.
- **Daueraufträge** bei Lieferanten (z.B. `suppliers.setStandingOrder`): Paket, Ziel-Lager, Mindestbestand; fällt der
  Bestand darunter und ist nichts unterwegs, bestellt der Disponent (wenn das Geld reicht, sonst eine stille Meldung).
- **Hafen automatisch abholen:** ein freier Fahrer holt angekommene Schiffsware ins gewählte Lager.
- **Umlager-Regeln:** „Halte in Lager X mindestens N von Produkt Y“, der Disponent schickt Fahrten.
- **Leutnants** lassen für ihr Veedel Hafenware abholen bzw. umlagern (über die Einstellungen in `hierarchy.configure`).
- Alle Automatiken melden sich still (Badge, kein Banner) mit eigenem Kontakt (der Disponent), Protokoll in der
  Logistik-App. Automatiken laufen über dieselben Befehle wie der Spieler (`ctx.dispatch(..., { actor: 'staff:<id>' })`).
- Handy: Dauerauftrag in der Lieferanten-App pro Lieferant, Regeln in der Logistik-App, beides mit `Sheet` und `Stepper`.

### 8. Stadt-Events

- Neues Modul (z.B. `cityevents`) mit **Kalender** und **spontanen Ereignissen**. Es gibt keine Jahreszeiten (Konzept),
  also ein wiederkehrender „Kölner Kalender“ über eine feste Zahl Spieltage, so dass in einer Kampagne (80–120 Tage)
  jedes Event mehrmals vorkommt. Tag 1 ist ein Freitag.
  - Kalender, z.B.: FC-Heimspiel (alle zwei Wochen samstags, rund um Müngersdorf/Lindenthal und die Innenstadt),
    Karneval (Weiberfastnacht bis Rosenmontag, Altstadt und Zülpicher Viertel, riesige Nachfrage, viel Polizei),
    Elfter im Elften, Kölner Lichter (Rheinufer, Touristen), CSD (Innenstadt, Party), Gamescom (Deutz), Ringfest (Ringe).
  - Spontan (Ton „gemischt“), z.B.: Schwerpunktaktion der Polizei in einem Veedel (mehr Kontrollen), Großdemo (Polizei
    gebunden, woanders weniger Kontrollen), Rhein-Hochwasser (Schiffe warten, Rheinufer-Spots zu), Niedrigwasser,
    Straßensperrung oder Baustelle (längere Fahrzeiten in einem Veedel), Semesterstart (Studenten), Festival im
    Rheinpark, Großrazzia bei einer Gang (Gang geschwächt).
- **Wirkung** über öffentliche Lese-Funktionen, die andere Module zur Laufzeit fragen (kein Top-Level-Import): z.B.
  `activeCityEvents`, `upcomingCityEvents`, `eventDemandFactor(state, veedelId, typeId?)`, `eventHeatFactor`,
  `eventCheckFactor`, `eventPriceFactor`, `eventTravelFactor`, `eventShipDelay`. Eingebaut in `customers` (Kunden und
  Kundschaft), `police` (Heat, Kontrollen), `market` (Richtpreis), `suppliers`/`logistics` (Schiff, Fahrzeiten), `spots`
  (geschlossen).
- **Ankündigung** einen Tag vorher per Handy (eigener Kontakt, z.B. ein Lokal-Ticker; große Events mit Banner, kleine
  still), Ereignisse `cityevent.announced`, `cityevent.started`, `cityevent.ended`. Bei großen Events Großkunden-Aufträge
  (Etappe 4) und ein Eintrag im „Nächsten Schritt“ („Karneval morgen: Lager auffüllen“).
- Handy und Karte: Widget „Diese Woche in Köln“ auf dem Startbildschirm (`phone.home`), Live-Aktivität während großer
  Events, pulsierender Hotspot am Ort (`createHotspots`), Event in der Suche.
- In einer ersten 20-Minuten-Session (etwa 8 Spieltage bei 2x) kommen mindestens ein Kalender-Event und ein spontanes
  Ereignis vor.

### 9. Balancing, Bot, Doku

- **Bot** (`src/playtest/bot.ts`) beantwortet die neuen Nachrichten sinnvoll (z.B. abwarten, Lohn erhöhen bei guten
  Leuten, Täter suchen lassen ohne selbst hinzugehen) und kommt mit Spot-Arten, Fahrzeugkapazität und dem Übergang der
  Kunden-Anfragen klar. Er muss nicht alles Neue nutzen.
- **Nachher-Messung** mit `npm run balance` (gleiche Seeds und Tage wie vorher). Ziel: erstes Veedel an Tag 8–12, drei
  Veedel etwa an Tag 10–30, nicht mehr Pleiten als vorher, Umsatz pro Tag im selben Bereich. Abweichungen begründen
  oder nachstellen.
- **Doku:** `docs/architektur.md` (Modultabelle, neue Befehle und Ereignisse, „Zusammenspiel der Systeme“, Balancing),
  `docs/konzept.md` („Stand der Umsetzung“, offene Punkte), `docs/auftraege/README.md` („Stand“), `CLAUDE.md`, wenn
  ein neues Modul oder Muster dazukommt (z.B. der Text-Helfer).

## Nicht in diesem Auftrag

- Gang-Reaktion auf neue Spots, „verbrannte“ Spots
- Hinterhalt/Geisel, Sabotage/Rufmord, Gedächtnis der Gangs über frühere Ereignisse
- Tagelange Ausfälle von Lieferanten, schwankende Einkaufspreise
- Lager-Ausbau (Kapazität, Sicherheit, Tarnung), Routenwahl schnell/unauffällig, Boot
- Pro-Chat-Stummschalten, „Nicht stören“, Mitteilungen pro Kategorie (gewünscht ist nur der Übergang der
  Kunden-Anfragen)
- Tarnfirmen, eigener Anbau, Charakter-Erstellung, Upgrade-Baum, Multiplayer
- Umbau von Bausteinen oder Navigation aus Auftrag 22 (nur erweitern)

## Prüfen

- `npm run check`, `npm run build`, `npm run e2e`, alles grün. E2E erweitern: eigenen Spot mit Art gründen.
- Tests für jede neue Mechanik (Text-Helfer, Gang-Methoden, Einbruch mit allen drei Antworten, Abwerben,
  Einschüchtern, Lieferentscheidungen, Übergang der Kunden-Anfragen inklusive Migration, Spot-Arten/Bekanntheit/
  Ausbau/Verlegen/Aufgeben, Fahrzeugkapazität und Beschlagnahme, Daueraufträge mit und ohne Disponent,
  Kalender-Termine und Wirkungen der Stadt-Events), Migrationstests für jede neue Version, Determinismus
  (gleicher Seed = gleiche Ereignisse).
- `npm run screenshot:phone` mit neuen Szenen in `scripts/phone-scenes.mjs` (Spot-Gründen-Blatt, Spot mit Ausbau,
  Fuhrpark, Dauerauftrag, Stadt-Event-Widget, Einbruch-Nachricht, Gang-Chat je Gang), dunkel und hell, Desktop und
  Handy-Bildschirm, selbst ansehen. `npm run audit:phone` ohne Verstöße.
- `npm run playthrough`: Screenshots der neuen Momente (Event, Einbruch, Abwerben, Lieferentscheidung, Übergang der
  Anfragen) für den PR.

## Fertig, wenn

- Alle Etappen 1–8 laufen, mit Tests, Migrationen und Handy-Seiten im Stil von Auftrag 22.
- Jede Gang klingt im Chat erkennbar anders und macht auf ihre Art Druck; Überfälle, Lieferprobleme und
  Routine-Nachrichten wiederholen sich in einer 20-Minuten-Session nicht wortgleich.
- Die Balancing-Zahlen vorher/nachher stehen im PR.
- Die PR-Beschreibung hat die drei Abschnitte aus der README: „Was ist neu“, „Wie testen“, „Für die Integration“.
