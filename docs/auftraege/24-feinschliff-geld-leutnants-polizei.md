# Auftrag 24 – Feinschliff: Geld im frühen Spiel, Leutnants mit Spots, Rechte Hand, Bilanz, Polizei nach Größe

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen, viel Kleinarbeit über mehrere Module). Neue Session auf
`main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/24-feinschliff-geld-leutnants-polizei.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, docs/handy-design.md, src/ui/README.md und
docs/auftraege/README.md.
```

## Wunsch aus dem Probespielen (01.10.2026)

> Das Spiel macht echt Spaß und man kommt rein. Aber im Early Game kann man nicht wirklich Geld ansammeln. Die
> Hierarchie muss besser werden: Die Stadtteile sind am Anfang zu teuer, weil in jedem Stadtteil nur ein oder zwei
> Spots sind. Lieber so, dass jeder Leutnant drei Spots kriegt. Der kann dann bestellen und Leute einstellen. Wenn Leute
> von der Polizei verhaftet werden, werden sie immer weiter bezahlt, obwohl sie gar nicht mehr arbeiten. Die Leutnants
> müssen neue Leute einstellen und alte feuern können, die nicht mehr da sind. Ich will auswählen können, bei wem sie
> die Ware bestellen und was genau. Das Layout schöner und übersichtlicher. Dazu ein oberster Leiter, der alles
> kontrolliert, und im Handy ein Menü mit Tagesumsatz, Arbeiterkosten, also einer Gewinn- und Verlustrechnung. Die
> Großrazzien der Polizei sind am Anfang zu krass, die machen einen kaputt. Großrazzien erst, wenn einem vier, fünf
> Gebiete in Köln gehören, sehr viele Spots, Hafen und alles. Wer drei Spots mit drei Läufern hat, bekommt auch keine
> riesige Razzia. Einfach mehr Sinnhaftigkeit.

## Rahmen

- **Vorbedingung prüfen, bevor du baust:** `git fetch origin main`. Auftrag 22 (Handy wie iOS) muss in `main` sein
  (`src/ui/phone/navModel.ts`, Bausteine `Sheet`, `ActionSheet`, `Stepper`, `ContextMenu`, `SwipeRow`). Dann prüfen, ob
  **Auftrag 23** (`docs/auftraege/23-mehr-leben-in-koeln.md`) schon in `main` ist (Kennzeichen z.B. Spot-Arten in
  `spots/config.ts`, Rolle Disponent in `staff`, Modul für Stadt-Events) oder gerade auf einem offenen Branch läuft.
  - In `main`: darauf aufbauen (Spot-Arten, Disponent, Fuhrpark mitdenken; Disponent und Rechte Hand nicht doppeln).
  - Offener Branch, noch nicht gemergt: **nicht gleichzeitig loslegen**, sondern dem Spieler Bescheid sagen. Beide
    Aufträge ändern `spots`, `staff`, `hierarchy`, `police`, `customers` und den Bot.
  - Weder noch: auf `main` arbeiten. Auftrag 23 baut dann auf diesem Auftrag auf.
- **Die Oberfläche aus Auftrag 22 ist der Maßstab:** Navigation als Stapel (`openPanel` = push),
  `Group`/`ListItem`/`ItemContent`/`SummaryTiles`, Werte rechts in der Zeile, keine Karten in Karten, `Sheet` für
  Auswahl und Formulare, `ActionSheet` für alles Gefährliche oder Teure, `Stepper` für Zahlen, `ContextMenu` bei langem
  Druck, Bedeutungsfarben (`color="money" | "dirty" | "danger" | "people" …`), `haptic(kind)`. Fehlt ein Baustein,
  erweitere ihn in `src/ui/components` (Props nur erweitern, nie brechen), statt eigene Varianten zu bauen.
- **Ganzer Code freigegeben**, aber jede Änderung an einem Modul bleibt in dessen Ordner, Kern nur wo nötig.
  Ordnerregeln aus `CLAUDE.md` gelten (`npm run lint` prüft sie).
- **Sprachregel:** Code-Bezeichner Englisch; Kommentare, UI-Texte, Nachrichten, Journal, Commits und PR Deutsch.
- **Determinismus:** Zufall nur über `ctx.random()/chance()/pick()/randomInt()`, Zeit nur in Spielminuten.
- **Migrationen:** Jede Änderung an der Form eines Zustands bekommt `version + 1`, eine Migration und einen Test. Alte
  Spielstände laden weiter und spielen sich sinnvoll weiter (vor allem: bestehende Leutnants behalten ihre Spots).
- **Befehle nur erweitern:** Alte Payloads (z.B. `hierarchy.appoint { staffId, veedelId }`) werden weiter angenommen,
  damit Bot, Tests und Handy-Antworten in alten Spielständen nicht brechen.
- **Keine neuen npm-Pakete.**
- **Arbeite in Etappen** (Reihenfolge unten). Nach jeder Etappe: `npm run check`, Commit, Push. Den Draft-PR nach der
  ersten Etappe anlegen. Wird `main` zwischendurch geändert: `main` mergen, nicht rebasen.

## Entscheidungen (vorab getroffen, beim Bauen nicht neu verhandeln)

| Thema | Entscheidung |
| --- | --- |
| Leutnant | Führt **bis zu drei Spots** (`MAX_SPOTS_PER_LIEUTENANT = 3` in `hierarchy/config.ts`), die der Spieler auswählt, **auch über Veedel-Grenzen**. Ein Spot hat höchstens einen Leutnant. Das Veedel als Posten fällt weg. |
| Leutnant-Rechte | Darf anheuern (Standard **an**, mit Tagesbudget), **Ausfälle ersetzen und Abwesende entlassen** (Haft, lange verletzt), bestellen nach **Bestellregeln mit Lieferant und Ware**. Aktive Leute entlässt er nie ohne den Spieler. |
| Haft | Kein voller Lohn mehr. Es gibt nur ein **Stillhaltegeld** (Startwert 25 % vom Lohn, `JAIL_WAGE_FACTOR`), das sich pro Person abstellen lässt (dann sinkt die Loyalität schneller und wer rauskommt oder entlassen wird, redet eher). Verletzte bekommen halben Lohn (`INJURED_WAGE_FACTOR`). |
| Oberster Leiter | Neue Stelle **Rechte Hand** über den Leutnants: genau eine Person, koordiniert alle Leutnants, schickt jeden Morgen einen Tagesbericht und warnt, bevor die Löhne nicht mehr reichen. Ohne Rechte Hand läuft alles wie bisher. |
| Bilanz | Neue Handy-App **„Kasse“** mit Gewinn- und Verlustrechnung (heute, gestern, 7 Tage), pro Spot und pro Leutnant. **Immer da**, auch ohne Rechte Hand. Dafür bekommt jede Kontobewegung eine Kategorie. |
| Polizei | Die Härte richtet sich nach der **Größe deines Geschäfts** (drei Stufen). **Großrazzia nur für Großhändler** (etwa ab vier, fünf kontrollierten Veedeln oder sehr vielen Spots plus Hafen und mehreren Lagern). Beute anteilig statt fester Mengen. |
| Ziel fürs frühe Spiel | Ein vorsichtiger Spieler mit zwei, drei Spots kann **sichtbar Geld ansparen**. Das mittlere und späte Spiel wird dadurch nicht leichter (Bot-Zahlen ab Tag 16 bleiben im bisherigen Bereich). |

## Ausgangslage (Stand `main` nach #16 und #17; selbst nachprüfen)

- **Leutnant pro Veedel:** `hierarchy` (Zustand Version 2) speichert `lieutenants: Record<veedelId, staffId>` und
  `posts` pro Veedel. `ai.ts: managedSpots` nimmt die Spots im Veedel nach Andrang, `lieutenantCapacity` =
  `BASE_CAPACITY (1) + level/2 + (Charisma ≥ 60)`. Die meisten Veedel haben nur ein, zwei Spots (`spots/config.ts:
  PRESET_SPOTS`), der Leutnant verlangt aber den 1,8-fachen Lohn (`LIEUTENANT_DEMAND`). Für wenig Wirkung zu teuer.
- **Leutnant-KI** (`hierarchy/ai.ts`): stellt Läufer an, zieht Läufer von schwachen Spots ab, setzt Preise, stellt
  Sicherheit, verkauft selbst, taucht bei Heat ab. **Anheuern** nur mit `mayHire` (Standard aus). **Entlassen kann er
  nicht.** `restock` wählt Lieferant und Paket selbst (nach `customer.missed`, nur Lieferanten ohne Hafen) und
  vergleicht den Mindestbestand mit dem **gesamten** Bestand (`getStock(state)`), obwohl Ware pro Lager liegt
  (`goods`: `warehouseId`). Mehrere Leutnants können sich so gegenseitig Bestellungen auslösen oder verhindern.
- **Löhne in Haft:** `staff/routines.ts: payWages` zahlt jedem Mitglied den vollen Lohn, auch `status: 'jailed'`
  (`JAIL_DURATION` 3 Spieltage) und `'injured'`. Der Spieler kann zwar entlassen (`staff.fire`), aber nur versteckt
  über langen Druck oder das Profil; niemand sagt ihm, dass ein Inhaftierter weiter Geld kostet. `afterFired`: Wer mit
  wenig Loyalität geht, redet (Heat).
- **Polizei** (`police/index.ts`, `config.ts`): Razzia ab Heat 60 (`RAID_THRESHOLD`, `RAID_CHANCE_PER_HOUR`), nimmt
  **fest** 10–30 Einheiten (`RAID_GOODS`) und 200–900 € (`RAID_MONEY`), durchsucht jedes eigene Lager im Veedel
  (`RAID_WAREHOUSE_SHARE` 20 %) und nimmt jede Person mit 55 % fest (`RAID_ARREST_CHANCE`). Das gilt gleich für
  jemanden mit einem Spot wie für ein Imperium. Bei 1.500 € Startgeld (`core/config.ts`) ist eine frühe Razzia fast das
  Ende. Die Heat-Stufe ab 85 heißt schon „Großeinsatz“, ist aber nur ein Journal-Text ohne eigene Wirkung.
- **Geld:** `wallet.pay/earn/lose/convert` (`src/core/wallet.ts`) haben nur einen freien Text `reason`; das Ereignis
  `wallet.changed` hat keine Kategorie. Es gibt keine Übersicht über Einnahmen und Ausgaben, nur `revenueToday` pro
  Leutnant-Posten und `customers.getSalesStats`. Kontobewegungen gibt es in `customers`, `encounters`, `gangs`,
  `goods`, `laundering`, `logistics`, `police`, `recruiting`, `spots`, `staff`, `suppliers` (`grep -rn "wallet\."`).
- **Kosten im frühen Spiel** (zum Einordnen): Läufer 400–900 € plus 80 € am Tag (`staff/config.ts`), Spot freischalten
  300–700 €, eigener Spot 800 €, Schutzgeld ab 250 €, Kundschaft startet bei 55 % und wächst über zwei Tage
  (`customers/config.ts: WARMUP_*`), Lieferant Kalle in Köln 10 g für 60 €, 25 g für 145 € (Richtpreis Gras 11 €/g).

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge. Jede Etappe bringt Simulation, Tests und ihre Handy-Seiten mit.

### 0. Vorbereitung

- Vorbedingungen prüfen (oben). Branch von `main`.
- **Vorher-Messung:** `npm run balance` laufen lassen und die Kernzahlen (erstes Veedel, drei Veedel, Umsatz pro Tag,
  Pleiten) für den PR notieren. Zusätzlich den **Kontostand am Ende von Tag 1 bis 7** pro Seed (Bot) festhalten.

### 1. Geldbuch und Kassen-App

- **Kategorien im Kern:** `wallet.pay/earn/lose/convert` bekommen eine optionale Kategorie (Typ `MoneyCategory` in
  `src/core/wallet.ts`, über `core/index.ts` exportiert), `wallet.changed` trägt sie mit (optionales Feld, alte
  Listener brechen nicht). Vorschlag für die Kategorien: Straßenverkauf, Lieferaufträge, Großhandel, Sonstige
  Einnahmen; Einkauf Ware; Löhne (getrennt nach Läufer, Sicherheit, Kuriere/Fahrer, Leutnants und Rechte Hand,
  Spezialisten), Stillhaltegeld (Haft), Anheuern, Kaution; Ausbau (Spots freischalten/gründen, Lager, Liegeplatz);
  Schutzgeld und Tribut; Geldwäsche-Gebühr; Verluste (Polizei, Überfälle und Diebstahl, Verrat, Konfrontationen).
- **Alle Aufrufe** in den Modulen bekommen ihre Kategorie. Test: Ein Bot-Lauf über einige Tage erzeugt keine
  Kontobewegung ohne Kategorie.
- **Neues Modul `finance`** (Vorlage `_template`): hört auf `wallet.changed` und `sale.completed` und führt ein Buch pro
  Spieltag (heute plus die letzten 14 Tage, danach fällt der älteste weg; nur JSON, begrenzte Größe). Pro Tag: Summen je
  Kategorie und Geldart, Umsatz und Löhne pro Spot und pro Leutnant (Lohn einer Person zählt für den Spot bzw.
  Leutnant, bei dem sie an dem Tag eingesetzt war). Öffentliche Lese-Funktionen, z.B. `dayReport(state, daysAgo)`,
  `periodReport(state, days)`, `spotResult(state, spotId, days)`, `lieutenantResult(state, staffId, days)`,
  `wageRunway(state)` (wie viele Tage die Löhne aus dem Schwarzgeld noch reichen).
- **Handy-App „Kasse“** (`registerPhoneApp`), aufgebaut wie eine Seite aus Auftrag 22:
  - Oben `SummaryTiles`: Schwarzgeld, sauberes Geld, Gewinn heute bis jetzt.
  - `SegmentedControl` **Heute | Gestern | 7 Tage**, darunter die **Gewinn- und Verlustrechnung** als Gruppen
    (Einnahmen, Ausgaben, Verluste, Ergebnis), Betrag rechts in der Zeile, Bedeutungsfarben (`money`, `danger`). Eine
    Zeile führt zu den Buchungen dieser Kategorie.
  - **Verlauf:** einfacher Balken je Tag (Gewinn oder Verlust) für die letzten 7 Tage, mit Design-Tokens.
  - **Pro Spot** und **pro Leutnant:** Umsatz, Kosten der Leute dort, Ergebnis. Wer Verlust macht, ist markiert
    („Der Läufer am Breslauer Platz kostet mehr, als er bringt“).
  - **Reichweite:** „Löhne morgen: 340 €, die Kasse reicht für 4 Tage“; unter zwei Tagen in Warnfarbe.
- Dazu: eine Zeile „Bilanz heute“ im Geschäft-Tab (`registerSlot('tab:business', …)`), ein Eintrag in der Suche
  (`registerSearch`), ein Hinweis in „Nächster Schritt“ (`registerAdvisor`), wenn die Löhne in weniger als zwei Tagen
  nicht mehr reichen.

### 2. Haft und Ausfälle

- **Löhne:** In Haft nur noch Stillhaltegeld (`JAIL_WAGE_FACTOR`, Startwert 0,25), verletzt halber Lohn
  (`INJURED_WAGE_FACTOR`, Startwert 0,5). Pro Person lässt sich das Stillhaltegeld abstellen (neuer Befehl z.B.
  `staff.setJailSupport { staffId, enabled }`); dann kostet sie nichts, verliert aber pro Haft-Tag mehr Loyalität
  (`LOYALTY.jailDayUnsupported`) und redet beim Rauskommen oder Entlassen eher (bestehende Mechanik `FIRED_TALK_*`
  mitbenutzen). Beides als eigene Zeilen in der Kasse.
- **Benachrichtigung bei Festnahme** (vom Leutnant, sonst von der Person selbst über den Anwalt, still): „Murat sitzt
  bis Tag 9. Was machen wir?“ mit Antworten **Kaution (X €)** (nur wenn möglich), **Ersetzen** (neuen Läufer an den
  Spot, Murat kommt danach in den freien Pool), **Entlassen und ersetzen**, **Abwarten**.
- **Kein Doppelt-Besetzt:** Ist der Spot bei der Rückkehr besetzt, kommt die Person frei in den Pool (oder der
  Leutnant setzt sie an einen leeren Spot). Test dafür.
- **Personal-Übersicht:** eigene Gruppe **„Fällt aus“** (Haft, verletzt) mit Rückkehr-Tag, Kosten pro Tag, Kaution
  und sichtbarem „Entlassen“ (über `ActionSheet`, mit Hinweis, ob die Person reden könnte). Entlassen nicht mehr nur
  über langen Druck erreichbar.

### 3. Leutnants mit bis zu drei Spots

- **Modell:** Ein Leutnant führt eine Liste von Spots (`spotIds`, höchstens `MAX_SPOTS_PER_LIEUTENANT`), in beliebigen
  Veedeln. Zustand `hierarchy` Version 3: Posten pro Leutnant (`posts: Record<staffId, LieutenantPost>` mit
  `spotIds`), Migration von Version 2: Jeder Veedel-Posten wird ein Posten mit den bis zu drei Spots dieses Veedels mit
  dem meisten Andrang (wie `managedSpots` heute), Einstellungen, Protokoll und Umsatz bleiben.
- **Befehle:** `hierarchy.appoint { staffId, spotIds }`, neu `hierarchy.setSpots { staffId, spotIds }`,
  `hierarchy.dismiss { staffId }`, `hierarchy.configure { staffId, settings }`. Die alten Formen mit `veedelId`
  weiter annehmen (Spots dieses Veedels bzw. der Leutnant dort). Prüfungen: Spot existiert und ist offen, gehört
  keinem anderen Leutnant (sonst Fehlertext mit Namen), höchstens drei.
- **Öffentliche API** anpassen und erweitern: `lieutenantOfSpot(state, spotId)`, `lieutenantSpots(state, staffId)`,
  `lieutenantVeedels(state, staffId)`; `getLieutenant(state, veedelId)` bleibt als Kompatibilität (ein Leutnant mit
  Spot in dem Veedel). Alle Nutzer anpassen (`territory/index.ts: lieutenantInfluence`, Bot, UI, Tests).
- **Einfluss (territory):** Der Leutnant bringt Einfluss in jedes Veedel, in dem er einen Spot führt, aufgeteilt nach
  Zahl seiner Spots dort. Drei Spots in einem Veedel wirken also stärker als drei verstreute (Anreiz, Gebiete
  geschlossen aufzubauen). Die Zahlen so wählen, dass das erste Veedel im Bot-Lauf weiter etwa an Tag 8–12 fällt.
- **Polizei und Heat:** Razzia-Warnung und Abtauchen bleiben pro Veedel; ein Leutnant reagiert für seine Spots in dem
  betroffenen Veedel. Vorsicht (`caution`) richtet sich nach dem Heat des jeweiligen Spot-Veedels.
- **Lohnanspruch** wächst mit der Zahl der Spots (z.B. 1 Spot ×1,3, 2 Spots ×1,55, 3 Spots ×1,8; Werte in config).
  Ein Leutnant mit drei vollen Spots soll sich klar rechnen.
- **Personal-Rechte** (Einstellungen, gruppiert):
  - **Anheuern** (Standard an) mit Tagesbudget (`hireBudgetPerDay`) und Rücklage, die er nie anfasst.
  - **Ausfälle:** `onAbsent: 'wait' | 'replace' | 'fireAndReplace'` mit „nach N Tagen“ (Standard: ersetzen sofort,
    entlassen nach zwei Tagen Haft). Entlassen über `staff.fire` mit `actor: 'staff:<id>'`, nur Leute seines Teams,
    die in Haft oder länger verletzt sind. Jede Personal-Entscheidung ins Protokoll und still aufs Handy.
  - **Team:** Wer an seinen Spots steht oder von ihm angeheuert wurde, gehört zu seinem Team (für Übersicht und Kasse).
- **Einkauf mit Bestellregeln** statt eines einzigen Mindestbestands:
  - Pro Regel: **Ware** (Produkt), **Lieferant** (oder „automatisch: günstigster“ wie heute), **Paket** (oder
    „passend“), **Mindestbestand**, Ziel-Lager (Standard: das Lager, aus dem seine Spots verkaufen). Mehrere Regeln pro
    Leutnant; Vorlage für neue Leutnants aus der letzten Einstellung des Spielers.
  - Bestand **im Ziel-Lager** zählen plus was dorthin unterwegs ist, nicht den Gesamtbestand. Lieferungen anderer
    Leutnants ins selbe Lager mitzählen, damit nicht doppelt bestellt wird.
  - Gesperrter, noch nicht freigeschalteter oder blockierter Lieferant: Regel pausiert, Meldung im Protokoll und still
    aufs Handy, kein stilles Ausweichen auf einen anderen Lieferanten (außer bei „automatisch“).
  - Hafen-Lieferanten nur auswählbar, wenn jemand die Ware automatisch abholt (Disponent aus Auftrag 23, falls da);
    sonst ausgegraut mit Erklärung.
- **Migration der Einstellungen:** alte `minStock` wird eine Regel „automatisch“ über alles wie heute, alte
  `mayHire`/`mayOrder` bleiben erhalten.

### 4. Rechte Hand (oberster Leiter)

- **Stelle:** genau eine Person (`hierarchy.rightHand: staffId | null`), Befehle `hierarchy.appointRightHand
  { staffId }` und `hierarchy.dismissRightHand`. Voraussetzungen in config (Vorschlag: Level 4, Loyalität ab 50,
  erst sinnvoll ab zwei Leutnants, die Stelle wird dann im Handy angeboten). Höherer Lohnanspruch (Vorschlag ×2,5).
  Die Rechte Hand steht an keinem Spot.
- **Aufgaben** (jede einzeln abschaltbar in ihren Einstellungen):
  - **Tagesbericht** jeden Morgen um 8 Uhr per Handy, still (mit Banner nur bei Problemen): Umsatz gestern, Kosten,
    Gewinn, Kasse, Reichweite der Löhne, bis zu drei Empfehlungen aus der Kasse (schwächster Spot, wer fällt aus, wo
    ist der Heat hoch). Antwort-Knöpfe führen direkt zur passenden Handy-Seite oder lösen den Befehl aus.
  - **Koordinieren:** freie Leute dorthin, wo ein Spot leer ist, auch über Leutnant-Grenzen; Bestellungen der Leutnants
    abgleichen (keine doppelten); gemeinsames **Tagesbudget** für Anheuern und Bestellen verteilen.
  - **Lohnsicherung:** hält immer die Löhne für `PAYROLL_RESERVE_DAYS` (Vorschlag 2) zurück, sperrt Ausgaben der
    Leutnants, die diese Rücklage angreifen würden, und warnt mit Banner, wenn sie trotzdem nicht reicht.
  - **Ausfälle:** entscheidet nach Regeln über Kaution (nur mit Anwalt und für wertvolle Leute, Level ab 3) oder
    Ersetzen, wenn der Leutnant das nicht tut.
- Handelt nur über `ctx.dispatch(…, { actor: 'staff:<id>' })` wie Leutnants. Sitzt sie in Haft oder ist weg, laufen die
  Leutnants allein weiter, Meldung an den Spieler.
- Ohne Rechte Hand bleibt alles spielbar wie bisher; die Kasse gibt es trotzdem.

### 5. Polizei nach Größe des Geschäfts

- **Größe** als öffentliche Lese-Funktion (z.B. `police.operationTier(state)`, Werte in `police/config.ts`), berechnet
  aus: kontrollierten Veedeln, aktiven Spots, Leuten im Einsatz, Leutnants, eigenen Lagern, Liegeplatz am Hafen,
  Umsatz pro Tag (Schnitt über 7 Tage aus `finance`). Drei Stufen mit Hysterese, damit sie nicht hin- und herspringt:
  1. **Kleindealer** (z.B. bis drei Spots, bis vier Leute, kein Veedel, kein Hafen): nur **Kontrollen** und höchstens
     eine **Razzia am Spot**: ein Spot, keine Lager-Durchsuchung, Beute anteilig und klein, Festnahmen nur bei den
     Leuten an diesem Spot. Razzien seltener als heute.
  2. **Händler** (mehrere Spots, ein bis drei Veedel, Leutnants): **Razzia im Veedel** wie heute, aber die Beute ist ein
     Anteil dessen, was dort ist (Ware am Ort bzw. im Lager dort, ein Anteil vom Schwarzgeld mit Obergrenze), statt
     fester Mengen.
  3. **Großhändler** (etwa ab vier, fünf kontrollierten Veedeln oder sehr vielen Spots plus Hafen und mehreren Lagern):
     erst hier die **Großrazzia**: vorbereitet durch Ermittlungen (längere Vorlaufzeit, der Polizei-Kontakt warnt einen
     Tag vorher), mehrere Veedel und Lager zugleich, große Beschlagnahme, mehr Festnahmen.
- **Aufstieg spürbar machen:** Steigt die Stufe, kommt eine Nachricht (Polizei-Kontakt oder Lokal-Ticker: „Die Kripo
  hat eine Ermittlungsgruppe gegen dich gebildet“) und ein Journal-Eintrag. Das Polizei-Panel zeigt „So sieht dich die
  Polizei: Kleindealer“ und was zur nächsten Stufe führt.
- **Meldungen** nennen die Art: Kontrolle, Razzia am Spot, Razzia in Ehrenfeld, Großrazzia. Ereignis `police.raid`
  bekommt ein Feld für die Art (`scope: 'spot' | 'veedel' | 'major'`), Listener (Toast, Ton, Live-Aktivität,
  Leutnant-Protokoll) anpassen.
- Die Heat-Stufe „Großeinsatz“ ab 85 umbenennen, damit sie nicht mit der Großrazzia verwechselt wird.
- Razzien gegen Gangs bleiben, wie sie sind.

### 6. Oberfläche: Hierarchie übersichtlich

- **Personal-Tab als Baum:** Du (Boss) → Rechte Hand → Leutnants (je mit ihren Spots, Team, Status und Ergebnis heute)
  → „Ohne Leutnant“ (Spots, die du selbst führst) → „Fällt aus“ (Etappe 2) → freie Leute → Bewerber.
- **Leutnant-Seite:** Kopf mit Name, Level, Zufriedenheit, Lohn und Ergebnis heute/gestern (`SummaryTiles`), Gruppe
  „Spots“ mit drei Plätzen (leere Plätze mit „Spot zuweisen“, je Spot der Läufer mit Status), Gruppe „Team“, Gruppen
  „Personal“, „Einkauf“ (Bestellregeln, je Regel eine Zeile, Bearbeiten im `Sheet` mit `Select` und `Stepper`) und
  „Straße“ (Preise, Vorsicht), Protokoll (letzte Einträge, mehr auf eigener Seite), Abberufen rot über `ActionSheet`.
- **Ernennen in einem Fluss:** `Sheet` Person wählen → Spots wählen (bis zu drei, mit Andrang, Veedel und Fahrzeit
  zwischen den Spots über `roads`) → Bestätigen mit neuem Lohn. Erreichbar aus Personal-Tab, Profil und Spot-Seite.
- **Spot-Seite:** „Geführt von <Leutnant>“ oder „Leutnant zuweisen“. **Veedel-Seite:** Liste der Leutnants mit Spots
  dort statt eines einzelnen Veedel-Leutnants.
- **Rechte-Hand-Seite:** Aufgaben-Schalter, Budget, letzter Tagesbericht, Protokoll.
- Bestehende Seiten aus Auftrag 22 nur erweitern, keine eigenen Varianten von Bausteinen.

### 7. Geld im frühen Spiel (Balancing)

- **Erst messen, dann drehen:** Mit der Kasse aus Etappe 1 den Geldfluss der Tage 1–7 im Bot über mindestens sechs
  Seeds aufschlüsseln (Ausgabe in `npm run balance` ergänzen) und die größten Abflüsse benennen. Erwartung (prüfen):
  Löhne in Haft, frühe Razzien mit fester Beute, Anheuerkosten und Lohn im Verhältnis zum Umsatz eines Spots,
  langsames Aufwärmen der Kundschaft.
- **Reihenfolge:** zuerst unfaire Abflüsse weg (Etappen 2 und 5), dann erst Feinjustierung an Preisen und Kosten.
- **Richtwerte** (an den Messungen ausrichten und im PR begründen, wenn du abweichst):
  - Tag 1–2: mit selbst Verkaufen und einem Läufer im Plus, keine Pleite ohne grobe Fehler.
  - Bis Tag 5: Ein vorsichtiger Spieler mit zwei, drei Spots und Läufern macht nach Einkauf und Löhnen jeden Tag
    Gewinn (Richtwert ab 25 % vom Umsatz) und kann ein paar Tausend Euro Schwarzgeld ansparen, wenn er nicht weiter
    ausbaut.
  - Ein neuer Spot mit Läufer hat sich nach zwei bis drei Spieltagen bezahlt gemacht (Freischalten plus Anheuern).
  - Der erste Leutnant mit drei Spots trägt sich selbst (sein Lohn deutlich unter dem, was er mehr einbringt).
  - Ab Tag 16 bleibt alles im bisherigen Bereich: Umsatz pro Tag wie vorher, erstes Veedel an Tag 8–12, drei Veedel
    etwa an Tag 10–30, nicht mehr Pleiten als vorher.
- Stellschrauben (Auswahl): `customers/config.ts` (`WARMUP_*`, `BASE_SPAWN_INTERVAL`), `staff/config.ts`
  (`RUNNER_HIRE_COST*`, `RUNNER_DAILY_WAGE`), `spots/config.ts` (`unlockCost`, `FOUND_SPOT_COST`),
  `hierarchy/config.ts` (Lohnanspruch), `police/config.ts` (Stufen, Beute), `gangs/config.ts` (`TRIBUTE_*`).

### 8. Bot, Doku

- **Bot** (`src/playtest/bot.ts`): ernennt Leutnants mit Spots (`spotIds`), setzt einfache Bestellregeln, beantwortet
  die Haft-Nachricht sinnvoll (ersetzen, bei guten Leuten Kaution), stellt später eine Rechte Hand ein. Er muss nicht
  alles Neue nutzen.
- **Nachher-Messung** mit `npm run balance` (gleiche Seeds und Tage wie vorher) inklusive Kontostand Tag 1–7.
- **Doku:** `docs/architektur.md` (Modultabelle mit `finance`, neue Befehle und Ereignisse, „Zusammenspiel der
  Systeme“, Balancing), `docs/konzept.md` („Stand der Umsetzung“), `docs/auftraege/README.md` („Stand“), `CLAUDE.md`
  (Geld mit Kategorie: `wallet.pay(ctx, amount, kind, reason, category)`; Leutnants führen Spots, nicht Veedel).

## Nicht in diesem Auftrag

- Inhalte aus Auftrag 23 (Spot-Arten, Gang-Methoden, Lieferprobleme, Fuhrpark, Disponent, Stadt-Events). Ist er schon
  in `main`, nur sauber anbinden.
- Mehrere Rechte Hände, Leutnants unter Leutnants, Beförderungen über die Rechte Hand hinaus.
- Kredite, Zinsen, Steuern, Buchhaltung über 14 Tage hinaus.
- Umbau von Bausteinen oder Navigation aus Auftrag 22 (nur erweitern).

## Prüfen

- `npm run check`, `npm run build`, `npm run e2e`, alles grün. E2E erweitern: Leutnant mit Spots ernennen, Kasse
  öffnen.
- Tests für jede neue Mechanik: Kategorien an allen Kontobewegungen, Tagesbuch mit Tageswechsel und Begrenzung,
  Ergebnis pro Spot und Leutnant, Löhne in Haft und verletzt (mit und ohne Stillhaltegeld), Ersetzen und Entlassen
  durch den Leutnant, keine Doppelbesetzung nach der Haft, Leutnant mit drei Spots über zwei Veedel (Einfluss, Razzia-
  Warnung, Vorsicht), Bestellregeln (Lieferant gesperrt, Lager-Bestand, keine Doppelbestellung zweier Leutnants),
  Rechte Hand (Tagesbericht, Lohnsicherung, Budget), Polizei-Stufen (mit drei Spots und drei Läufern bei Heat 90 in
  zehn Tagen keine Großrazzia und keine Lager-Durchsuchung; als Großhändler schon), Migrationstests für `hierarchy`
  Version 3 und jede andere neue Version, Determinismus (gleicher Seed = gleiche Ereignisse).
- `npm run screenshot:phone` mit neuen Szenen in `scripts/phone-scenes.mjs` (Kasse heute und 7 Tage, Kasse pro Spot,
  Personal-Baum, Leutnant-Seite, Ernennen-Fluss, Bestellregel-Blatt, Rechte Hand mit Tagesbericht, „Fällt aus“,
  Polizei-Panel mit Stufe), dunkel und hell, Desktop und Handy-Bildschirm, selbst ansehen. `npm run audit:phone` ohne
  Verstöße.
- `npm run playthrough`: Screenshots von Festnahme mit Ersetzen, Tagesbericht und Kasse für den PR.

## Fertig, wenn

- Alle Etappen 1–8 laufen, mit Tests, Migrationen und Handy-Seiten im Stil von Auftrag 22.
- Ein Spieler sieht jederzeit in der Kasse, was er heute verdient und wofür das Geld weggeht, und kann im frühen Spiel
  sichtbar ansparen.
- Wer in Haft sitzt, kostet nur noch Stillhaltegeld; Leutnants ersetzen und entlassen Ausfälle selbst.
- Ein Leutnant führt bis zu drei frei gewählte Spots und bestellt bei dem Lieferanten und die Ware, die der Spieler
  vorgibt.
- Großrazzien treffen nur Großhändler; ein kleiner Dealer erlebt Kontrollen und höchstens eine Razzia an einem Spot.
- Die Balancing-Zahlen vorher/nachher (inklusive Kontostand Tag 1–7) stehen im PR.
- Die PR-Beschreibung hat die drei Abschnitte aus der README: „Was ist neu“, „Wie testen“, „Für die Integration“.
