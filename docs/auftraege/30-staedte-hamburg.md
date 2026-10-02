# Auftrag 30: Köln komplett, Vollmacht der Rechten Hand, Hamburg, Routen zwischen den Städten

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/30-staedte-hamburg.md vollständig um, Etappe für Etappe.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, src/ui/README.md, src/map/README.md und
docs/auftraege/README.md.
```

Dieser Auftrag ist **Spiellogik mit der nötigen Oberfläche**. Alles, was nur Optik der Karte ist (Verkehr, Leute an Spots,
Flüsse aus echten Daten, Deutschland-Ansicht hübsch), kommt danach in [Auftrag 31](31-karte-lebt.md). Die beiden laufen
**nacheinander**, erst 30, dann 31.

## Wunsch aus dem Probespielen (02.10.2026)

> Wenn man Köln gewinnt, was erst passieren soll, wenn man alle 12 Veedel hat, bekommt man einen Anruf: Du hast Köln
> komplett übernommen. Der Anruf kommt von einem Hafenarbeiter aus dem Hamburger Hafen. Der Lieferanten-Kontakt, den du in
> Frankfurt schon hast, ist dann dein neuer Lieferant. Um die Stadt zu verlassen, muss man seiner Rechten Hand volle Macht
> über die Stadt geben. Die Rechte Hand hat dann in Köln alles unter Kontrolle: Sie kann Leutnants ernennen, Leute feuern,
> Ware einkaufen, Preise setzen, Entscheidungen treffen, alles, was der Spieler gerade macht. Dafür bekommt sie 80 % vom
> Gewinn aus Köln. Hamburg soll in der Theorie funktionieren wie Köln, aber jede Stadt hat ihre Besonderheiten: In Hamburg
> kann man über den Hafen sehr große Mengen von allem bestellen, und der Preis ist höher wegen der reichen Leute. Unter
> Logistik im Handy soll man Fahrer-Routinen und feste Routen einstellen können, die Ware von Köln nach Hamburg bringen
> oder andersherum, mit den Auto-Animationen. Das Spiel war zuletzt sehr laggy, besonders wenn viele Aufträge kamen; bitte
> schauen, dass das Ganze effizient läuft.

Die Entscheidungen dazu sind in einer Fragerunde mit 16 Fragen gefallen (Tabelle unten). Was dort nicht gewählt wurde,
gehört **nicht** in diesen Auftrag (Abschnitt „Nicht in diesem Auftrag“).

## Rahmen

- **Ganzer Code freigegeben.** Ordnerregeln aus `CLAUDE.md` gelten (Module nur über `index.ts`, Kern importiert keine
  Module, UI und Karte nur im `ui/`-Ordner eines Moduls). Sprachregel: Code Englisch, Texte Deutsch.
- **Determinismus:** Zufall nur über `ctx.random()` und Geschwister, nie `Math.random()` oder `Date`. Alles, was nur Optik
  ist, bleibt aus der Simulation draußen.
- **Migrationen:** Jede Änderung an der Form eines Zustands bekommt `version` + Migration + Test. Alte Spielstände (nur
  Köln, Stand Auftrag 29) laden und spielen weiter: Alles Bestehende liegt dann in Köln, Hamburg ist noch verschlossen.
  **Befehle nur erweitern, nie brechen** (alte Payloads ohne Stadt gelten als Köln).
- **Geld immer mit Kategorie** (`MONEY_CATEGORIES` in `src/core/wallet.ts`). Neue Kategorien stehen unten.
- **Wege und Fahrzeiten nur über `roads`**, auch zwischen den Städten.
- **Keine neuen npm-Pakete.** Python mit pyarrow und shapely für `build-roads.py` ist erlaubt (gibt es schon).
- **Etappen** in der Reihenfolge unten. Nach jeder Etappe `npm run check`, Commit, Push; nach Etappe 2 einen Draft-PR
  aufmachen und ab dann nach jeder Etappe den PR-Text ergänzen. Vor dem letzten Push zusätzlich `npm run build`,
  `npm run e2e`, `npm run balance` (Bericht vorher/nachher im PR), `npm run screenshot -- --scenes=alle`,
  `npm run monkey:phone`.
- **Wird der Kontext knapp:** an einer Etappengrenze aufhören, den Stand im PR unter „Stand“ festhalten (was fertig ist,
  was die nächste Session zuerst macht) und pushen. Die nächste Session startet mit demselben Prompt und liest den PR.
- **Doku zum Schluss:** `CLAUDE.md` (Absatz zu Auftrag 30 in der Einleitung, Stadt-Regeln im Abschnitt „Ein Modul
  anlegen“), `docs/architektur.md` (neuer Abschnitt „Städte“ im Zusammenspiel, Modul `city`), `docs/konzept.md`
  (Abschnitt „Mehrere Städte“ auf „gebaut“ setzen), `docs/auftraege/README.md` (Stand).

## Entscheidungen (aus der Fragerunde, vorab getroffen)

| Thema | Entscheidung |
| --- | --- |
| Sieg | **7 von 12 bleibt Zwischenziel** „Boss von Köln“ (Quest-Titel, Bestenliste, Banner), ist aber kein Sieg mehr. **Erst alle 12 Veedel** lösen „Köln komplett“ (`campaign.won`, Sieg-Bildschirm, Bestenliste „gewonnen“) und danach den Anruf aus Hamburg aus. |
| Anruf | **Vollbild-Anruf im Handy:** Klingeln, Annehmen oder Ablehnen, dann Dialog in Sprechblasen, der danach als Chat beim neuen Kontakt gespeichert bleibt. Wiederverwendbar (später ruft das Kartell an). |
| Vollmacht | Die Rechte Hand braucht **Stufe 5 und alle sechs Aufgaben an**. Sonst sagt der Anrufer: erst das Haus in Ordnung bringen. |
| Köln danach | **Eingreifen jederzeit:** Du kannst jederzeit auf Köln schauen und Befehle geben, die Rechte Hand macht trotzdem ihr Ding. Vollmacht ist widerrufbar. |
| 80 Prozent | **80 % vom Tagesgewinn Kölns laut Kasse**, täglich um Mitternacht, **ein Konto für alle Städte**. Bei Verlust zahlt sie nichts und zieht nichts ab. |
| Lieferant | **Toni (Frankfurt) ist in Hamburg dein Startlieferant per Kurier** (Vertrauen und Rabatt bleiben). **Hein (Hamburg) wird zum Hafen-Großhändler** mit Containern direkt am Kai. |
| Stadtteile | **12 Hamburger Stadtteile mit echten Grenzen** (Liste unten), gleiche Pipeline wie Köln. |
| Hamburg | **Hafen mit Großmengen, höhere Preise, Nachtleben Reeperbahn, härtere Polizei und Zoll.** |
| Köln | **Stadt-Events (Karneval, FC, Kölner Lichter), Kölscher Klüngel, Studenten und Kneipen.** Nicht gewählt: „Rhein als Tor“ (Hafen bleibt wie er ist). |
| Start Hamburg | **Geld ja, Team nein:** Dein Geld bleibt, Spots, Lager und Leute gibt es in Hamburg nicht. Leute aus Köln können per Fahrt nachkommen. |
| Routen | **Fahrer mit Fahrplan** in der Logistik-App: Abfahrt, Produkt und Menge, von Lager A nach Lager B, Fahrt über die A1 mit Autobahnkontrollen. |
| Daten | **Pro Stadt ein Straßennetz** (zweite Box in `build-roads.py`), **Autobahn A1 als grobe Linie** dazwischen. Flüsse aus Overture kommen in Auftrag 31. |
| Architektur | **Nur eine Stadt live:** Die Stadt, die du gerade auf der Karte siehst, läuft voll. Die andere läuft im **Schlafmodus** (Tageszusammenfassung, unten). Umschalten wechselt, welche Stadt live ist. Das ist die Auflösung von „Eingreifen jederzeit“ und „nur eine Stadt live“ zugleich. |
| Nach Hamburg | **Dritte Stadt vorbereiten:** Hamburg komplett geht an eine zweite Rechte Hand; eine dritte Stadt ist als Datenschablone angelegt, ohne Inhalt. Bis dahin Endlosmodus. |
| Performance | Das Spiel laggt bei vielen Aufträgen. **Etappe 0 löst die gemessenen Bremsen**, bevor eine zweite Stadt dazukommt. |
| Umsetzung | Zwei große Aufträge nacheinander: **30 (dieser) Spiellogik**, 31 Karte und Optik. |

## Ausgangslage (Stand `main` nach Auftrag 29; selbst nachprüfen)

- **Sieg:** `src/modules/territory/index.ts`, `campaignProgress` rechnet `needed = floor(total / 2) + 1` (7 von 12) und
  ruft bei Erreichen `outcome.win(ctx)` (`src/core/outcome.ts`, Ereignis `campaign.won`). Darauf hören:
  `src/ui/builtin/index.ts` (Dialog `core.won`, Sound `win`), `leaderboard` (Ausgang „won“), die Quests vergeben den Titel
  „Boss von Köln“ in Kapitel 5 bei 50.000 € Vermögen (`quests/config.ts`).
- **Rechte Hand:** `src/modules/hierarchy/righthand.ts`, `tasks.ts`, `config.ts` (`RIGHT_HAND_TASKS` mit sechs Aufgaben
  und `rank` 1 bis 4, `RIGHT_HAND_RANK_XP`, `RIGHT_HAND_MAX_RANK` = 5, Betrags-Grenzen je Stufe). Sie handelt nur über
  `ctx.dispatch(…, { actor: 'staff:<id>' })`. Nachrichten tragen `routine`; Chefsache bleibt beim Spieler
  (`messages.openRoutine`, `answerAs`). Mit allen Aufgaben an läuft Köln ohne Spieler (`src/playtest/autopilot.test.ts`).
  Loyalität unter 40 lässt sie selten etwas abzweigen (`rightHandSkim`, `loss.betrayal`).
- **Städte gibt es nicht.** Alles ist Köln: `veedel/data.ts` (12 Veedel mit `purchasingPower`, `policePresence`,
  `density`, `startInfluence`), `veedel/boundaries.ts` (erzeugt von `tools/build-boundaries.mjs` aus den Offenen Daten
  Köln), `spots/config.ts` (`PRESET_SPOTS`, Veedel aus der Lage über `veedelAt`), `goods/config.ts` (`WAREHOUSES`),
  `gangs/data.ts` (vier Gangs mit `homeVeedelId`), `police` (Heat pro Veedel, `operationTier` fürs ganze Geschäft),
  `market` (Richtpreis pro Veedel), `customers` (Kunden pro Spot, Lieferanfragen, Großhandel), `finance` (Tagesbuch mit
  Summen pro Spot und Leutnant, Filter Köln/Veedel/Spot/Leutnant, `balance`), `logistics` (ein Hafen `PORT_ID`,
  Liegeplatz, Fahrten `pickup` und `transfer` innerhalb Kölns), `suppliers/config.ts` (Rotterdam als `port`, Frankfurt,
  Berlin, Hamburg, Amsterdam, Köln als `city`, je eine `deliveryTime`), `src/map/config.ts` (`KOELN_CENTER`,
  `KOELN_VIEW`, `EUROPA_VIEW`), `src/map/GameMap.ts` (`view: 'koeln' | 'europa'`, `flyToKoeln`, `flyToEuropa`).
- **Straßen:** `src/modules/roads/network.ts` ist nur der Köln-Ausschnitt (`BOX = (6.83, 7.07, 50.87, 51.02)`, etwa
  180 KB, 14.229 Knoten), erzeugt von `tools/build-roads.py` aus Overture Maps (Release `2026-09-23.1`, ODbL).
  `roadRoute`, `travelMinutes`, `roadEntryFrom(far)` (Autobahn-Einfahrt aus Richtung eines fernen Orts).
- **Nachrichten:** `src/core/messages.ts` kennt Chats mit Antwortoptionen und Frist, keine Anrufe. Handy-Oberfläche in
  `src/ui/phone/` (`MessagesApp.tsx`, `DynamicIsland.tsx`, `Notification.tsx`, `PhoneScreen.tsx`); Live-Activities über
  `registerLiveActivity`, Dialoge über der Karte über `registerDialog` mit `area: 'map'` und `MapDialog`.
- **Fahrzeuge:** `src/map/vehicles.ts` (3D-Klötze auf einer Linie, `createVehicle`, `setProgress`),
  `logistics/ui/map.ts` (Fahrten als Fahrzeuge über echte Straßen), `customers/ui/map.ts` (Rechte Hand fährt aus),
  `suppliers/ui/map.ts` (Schiff auf der handgezeichneten `RHINE_ROUTE`, Kuriere aus den Städten über `roadEntryFrom`).
- **Bot und Tests:** `src/playtest/bot.ts` spielt alle Module zusammen (für `npm run balance` und
  `autopilot.test.ts`), kennt nur Köln.

## Muss drin sein

Reihenfolge = Arbeitsreihenfolge. Jede Etappe bringt Simulation, Tests und ihre Handy-Seiten mit.

### 0. Bremsen lösen (Performance)

Der Spieler meldet starkes Ruckeln, besonders mit vielen offenen Aufträgen. Die Messung dazu steht in
[`docs/perf/2026-10-messung.md`](../perf/2026-10-messung.md) (Hotspots mit Datei und Zeile, Vorschläge, wie man misst).

- **Vorher messen** mit `npm run perf:sim` (Bot, 20 Spieltage, mit `PERF_SAVE` einen Spielstand schreiben) und
  `npm run perf:browser -- --save=<spielstand>` (Preact pro Neuzeichnen, Layer, Simulation, CPU-Profil, Szenen mit vielen
  Anfragen). Zahlen im PR notieren.
- **Die im Bericht als bestätigt markierten Hotspots beheben**, in der dortigen Reihenfolge. Typische Mittel: Arbeit pro
  Tick nicht mit der Zahl der Aufträge, Nachrichten oder Leute quadratisch wachsen lassen; Komponenten nur auf die Teile
  des Zustands hören, die sie zeigen; Karten-Layer nur dann `setData` aufrufen, wenn sich etwas geändert hat; keine
  Kopien des ganzen Zustands pro Schritt; Journal, Nachrichten und Protokolle begrenzt halten.
- **Nachher messen**, gleiche Skripte, gleicher Seed. Ziel: pro Spieltag im Bot höchstens die Hälfte der Vorher-Zeit, im
  Browser bei Tempo 4× keine Long Tasks über 50 ms im Normalbetrieb mit zehn offenen Aufträgen.
- **Benchmark als Leitplanke:** `src/playtest/perf.bench.test.ts` (läuft nur mit `PERF=1`) um eine Prüfung ergänzen, die
  bei grober Verschlechterung (Faktor 2 gegenüber einem Richtwert in der Datei) fehlschlägt, ohne auf langsamen
  CI-Rechnern zu flattern (Richtwert großzügig, nur lokal scharf).

### 1. Kampagne: Meilenstein bei 7, Köln komplett bei 12

- `campaignProgress`: `needed` wird `total` (alle Veedel der Stadt), neu `majority` (bisheriges `needed`). Das Ereignis
  bei `majority` heißt `campaign.milestone` mit `{ kind: 'majority', cityId }`: Banner mit Ton (`ui.toast` mit `urgent`),
  Journal, Quest-Titel „Boss von Köln“ (Quests hören darauf statt auf 50.000 € Vermögen; die Vermögens-Quest bleibt,
  nur der Titel wandert), Bestenliste bekommt den Titel. **Kein Sieg-Bildschirm mehr bei 7.**
- Bei allen Veedeln der Stadt: `outcome.win(ctx)` wie bisher, Journal und `core.won` heißen jetzt „Köln komplett“ mit
  Hinweis, dass gleich jemand anruft. Der Dialog hat „Weiter“, danach läuft das Spiel weiter (Endlosmodus wie bisher).
- Quests: kleines Kapitel 6 „Ganz Köln“ mit zwei Quests („Kontrolliere 9 Veedel“, „Übernimm alle 12 Veedel“), die
  letzte ohne Belohnung außer dem Satz, dass das Telefon gleich klingelt.
- Test: Sieg erst bei 12, Meilenstein bei 7, alte Spielstände mit `won` bei 7 behalten `won` (Migration setzt
  zusätzlich den Meilenstein).

### 2. Anrufe im Handy und der Anruf aus Hamburg

- **Kern:** `messages.call(ctx, { contact, lines, options, expiresIn? })` legt eine Nachricht mit `call` an:
  `{ lines: string[], state: 'ringing' | 'accepted' | 'missed' }`. Klingeln läuft höchstens `CALL_RING_MINUTES`
  Spielminuten (Config), dann `missed`: Der Anrufer schreibt kurz („Hab versucht dich zu erreichen“) und ruft nach
  `CALL_RETRY_MINUTES` wieder an, höchstens dreimal, danach bleibt nur der Chat mit denselben Optionen. Antworten gehen
  über den bestehenden Befehl `messages.answer`. Ablehnen ist ein eigener Befehl `messages.declineCall`. Alles im
  Zustand, deterministisch, mit Kernschema-Migration (siehe `CORE_MIGRATIONS` in `src/core/persistence.ts`).
- **Handy:** Eingehender Anruf als Vollbild im `PhoneScreen` (Name, Rolle, Avatar, Annehmen und Ablehnen als große Ziele
  ≥ 44 px), Klingelton und Vibrationsmuster (`src/audio`, `src/ui/haptics.ts`); die Dynamic Island zeigt den laufenden
  Anruf (`registerLiveActivity`). Nach Annehmen erscheinen die Zeilen nacheinander als Sprechblasen (Tempo wie Tippen,
  antippen überspringt), am Ende die Antwortoptionen. Auflegen speichert alles als Chat beim Kontakt. Ist das Handy zu,
  klappt es auf. Auf dem Handy-Bildschirm bildschirmfüllend. Prüfen mit `npm run audit:phone` und `npm run monkey:phone`.
- **Der Anruf aus Hamburg:** Kontakt `other:hamburg-harbor`, ein Hafenarbeiter vom Hamburger Hafen (Name frei
  erfunden, nordisch knapp, z.B. „Fiete Lührs“). Er ruft 30 Spielminuten nach „Köln komplett“ an (nicht während einer
  Konfrontation, sonst danach). Inhalt in sechs bis neun Zeilen, Ton realistisch und düster, hanseatisch kurz: Er weiß,
  dass dir ganz Köln gehört; in Hamburg laufe am Kai etwas, wofür er jemanden mit Format sucht; große Mengen, reiche
  Kundschaft, aber Zoll und Polizei sind wacher; und: Wer soll Köln führen, wenn du weg bist? Optionen:
  - **„Ich komme nach Hamburg“:** Hat die Rechte Hand Stufe 5 und alle Aufgaben an, öffnet sich die Übergabe (Etappe 3).
    Sonst antwortet er, du sollst erst dein Haus in Ordnung bringen, und schreibt dir eine Nachricht, was fehlt (Rechte
    Hand, Stufe, Aufgaben), die bleibt, bis es passt; dann ruft er von selbst noch einmal an.
  - **„Ich brauch noch Zeit“:** Er meldet sich alle 7 Spieltage per Chat, nicht per Anruf. Die Quest-Karte zeigt
    „Hamburg wartet“ mit dem, was fehlt.
  - **„Köln reicht mir“:** Endlosmodus, er schreibt einmal, dass das Angebot steht. Über seinen Chat kannst du später
    doch zusagen.
- Tests: Anruf klingelt, verpasst, ruft wieder an, Antwort wählt den richtigen Weg; Determinismus über zwei Durchläufe.

### 3. Vollmacht: die Rechte Hand übernimmt Köln

- **Befehl `hierarchy.grantFullPower`** (Chefsache, nur vom Spieler): Voraussetzung Stufe 5, alle Aufgaben an, alle
  Veedel der Stadt unter deiner Kontrolle. Zustand `rh.fullPower = { since, cityId, share: 0.8 }`. **`hierarchy.revokeFullPower`**
  zieht sie zurück: Loyalität −20, Zufriedenheit sinkt, ab dann wieder 100 % und du musst selbst ran; sie behält Stufe und
  Aufgaben. Ereignisse `hierarchy.fullPowerGranted` und `hierarchy.fullPowerRevoked`.
- **Übergabe-Dialog** über der Karte (`registerDialog` mit `area: 'map'`, Look Glas): die Rechte Hand mit Stufe und
  Erledigtem, der Deal (80 % ihr, 20 % dir, täglich um Mitternacht, nur bei Gewinn), was sie ab jetzt zusätzlich tut,
  dass du jederzeit zurückkommen und eingreifen kannst, und ein Knopf „Köln übergeben und nach Hamburg fahren“. Danach
  fährst du (Etappe 5, `city.travel`), Hamburg wird frei (Etappe 4).
- **Neue Aufgaben mit Vollmacht** in `hierarchy/tasks.ts`, alle über `ctx.dispatch` mit Actor und bestehenden Befehlen,
  stündlich bzw. täglich, jede im Protokoll und im Tagesbericht:
  - **Leutnants** (`lieutenants`): ernennt für Spots ohne Leutnant jemanden ab Level 3 mit genug Loyalität, gibt ihm bis zu
    drei Spots und eine Bestellregel; setzt Leutnants ab, deren Spots zwei Tage Verlust machen oder deren Loyalität
    unter 30 fällt.
  - **Preise** (`pricing`): setzt Spot-Preise um den Richtwert des Markts (`market`), reagiert auf Preiskrieg und Ruf.
  - **Personal führen** (`hr`): entlässt Leute mit Loyalität unter 25 oder ohne Einsatz seit drei Tagen, wenn die Löhne
    drücken; stellt nach wie „Personal“ heute.
  - **Ausbau** (`expansion`): schaltet Spots frei und kauft Lager, wenn das Tagesbudget es hergibt und die Kasse zwei
    Wochen Löhne deckt.
  - **Gangs und Chefsache** (`diplomacy`): beantwortet Köln-Nachrichten, die heute Chefsache sind (Schutzgeld bis zu
    einem Betrag zahlen, sonst ablehnen; Deals bis Betrag X); Konfrontationen in Köln laufen mit „Leute machen lassen“,
    wenn du nicht in Köln bist (Etappe 5, Aufenthalt).
  Die Aufgaben sind nur mit Vollmacht da (eigener Abschnitt auf ihrer Personal-Seite), einzeln abschaltbar wie die
  anderen. Fehler bleiben wie heute an Vorsicht und Loyalität geknüpft.
- **Der Anteil:** Jeden Tag um Mitternacht (Buchungstag wie in `finance`) rechnet `hierarchy` den Tagesgewinn Kölns aus
  der Kasse (`balance` mit Filter Stadt, Etappe 4) und zahlt bei Gewinn 80 % als Schwarzgeld an sie:
  `wallet.pay(ctx, amount, 'dirty', '…', { category: 'share.righthand', staffId, cityId: 'koeln' })`. Neue Kategorie
  `'share.righthand'` („Anteil Rechte Hand“, Gruppe `expense`). Der Tagesbericht wird zum **Bericht aus Köln** mit
  Ergebnis, Anteil, Erledigtem und Problemen.
- **Köln läuft allein, auch mit Vollmacht:** `autopilot.test.ts` erweitern: nach der Übergabe 10 Spieltage ohne Befehle,
  Köln macht Gewinn, der Anteil fließt, niemand geht pleite.

### 4. Städte als Grundlage: Modul `city`, Stadt-Kennung, Schlafmodus, Hamburg-Daten

- **Modul `city`** (neu, aus `_template`): statische Daten `CITIES` (`id`, `name`, `center`, `view` mit Zoom und
  Kamera, `bounds`, `roadsNetworkId`, `portId`, `wageFactor`, `propertyFactor`, Beschreibung) für `koeln`, `hamburg` und
  eine **Schablone `berlin`** (nur Daten-Skelett ohne Veedel, Spots, Gangs; im Spiel gesperrt, damit Stadt drei nur noch
  Inhalt braucht). Zustand: `{ active: 'koeln', present: 'koeln', unlocked: ['koeln'], travel: null, sleep: {…} }`.
  Befehle `city.switch` (Karte und Handy wechseln; die neue Stadt wird live, die alte schläft), `city.travel` (du selbst
  fährst um, Etappe 5), `city.unlock` (intern, nach der Zusage). Lesen: `activeCity(state)`, `cityOf(veedelId)`,
  `cityOfSpot`, `isCityLive`, `citiesUnlocked`. Ereignisse `city.switched`, `city.unlocked`, `city.arrived`.
- **Stadt-Kennung in den Daten:** `Veedel.cityId`, `Warehouse.cityId`, `Gang.cityId`, `PresetSpot` über das Veedel,
  `Supplier.cities` mit `deliveryTime` pro Stadt (`deliveryTimes: Record<cityId, number>`, Rückfall `deliveryTime`),
  `StaffMember.cityId` (wo die Person gerade ist; Migration: `koeln`). Alle Schleifen über `allVeedel()`, `getSpots()`,
  `getWarehouses()`, Gangs, Heat und Kunden laufen **pro Stadt** (`allVeedel(cityId)` usw., Standard = aktive Stadt),
  damit Hamburg nicht die Kölner Preise, Razzien oder Gang-Vorstöße bekommt. `veedelAt` kennt beide Städte.
  `police.operationTier` pro Stadt. `market` pro Veedel wie heute. `finance`: Tagesbuch bekommt Summen pro Stadt
  (`MoneyTag.cityId`, abgeleitet aus `spotId` oder `staffId`, sonst die aktive Stadt), Filter „Stadt“ in der Kasse,
  `balance` mit `{ kind: 'city', cityId }`.
- **Schlafmodus (nur eine Stadt live):** Die Module ticken nur für die aktive Stadt. Für jede schlafende Stadt läuft
  einmal pro Tag um Mitternacht eine Zusammenfassung in `city`:
  - **Ergebnis:** Durchschnitt der letzten 7 live gespielten Tage dieser Stadt aus der Kasse, mal Faktor 0,85 bis 1,15
    (`ctx.random`), gebucht als `'income.city'` („Ergebnis <Stadt> (Rechte Hand)“, Gruppe `income`) bzw. bei Verlust
    `'expense.city'`. Danach der Anteil der Rechten Hand (Etappe 3). Gibt es keine 7 Tage, nimmt sie, was da ist; ohne
    Daten 0.
  - **Ware:** Lagerbestände bleiben Daten und sinken nur durch Routen (Etappe 6). Was eine Route aus einem schlafenden
    Lager nimmt, kauft die Rechte Hand nach: täglich gebündelt `goods.purchase` zum Preis der Bestellregel, damit es
    keinen Trick mit kostenloser Ware gibt.
  - **Leute:** keine Einzel-Löhne, keine Loyalitätsverluste, keine Haft-Ereignisse; Löhne sind im Ergebnis drin.
  - **Gangs, Polizei, Kunden:** eingefroren; Heat fällt pro Tag auf den Ruhewert. Offene Nachrichten und Fahrten in der
    schlafenden Stadt laufen zu Ende oder warten.
  - Beim Aufwachen (`city.switch`) passiert kein Nachrechnen der Lücke, nur die Decays einmal.
  - Test: Köln schläft 10 Tage, Ergebnis und Anteil werden gebucht, Lager bleiben; Umschalten weckt Köln, die Rechte Hand
    arbeitet weiter (Autopilot-Test mit Umschalten).
- **Hamburg-Daten (frei erfunden, echte Orte):**
  - **12 Stadtteile:** St. Pauli, Sternschanze, Altona-Altstadt, Ottensen, St. Georg, HafenCity, Eimsbüttel, Eppendorf,
    Barmbek-Süd, Wilhelmsburg, Harburg, Blankenese. Grenzen mit `build-boundaries.mjs` (Parameter Stadt): Quelle
    Verwaltungsgrenzen der Freien und Hansestadt Hamburg (Landesbetrieb Geoinformation und Vermessung, Transparenzportal,
    WFS `https://geodienste.hamburg.de/HH_WFS_Verwaltungsgrenzen`, Layer-Namen im GetCapabilities nachsehen; Lizenz
    Datenlizenz Deutschland Namensnennung 2.0, Quellenangabe in die Datei). Geht der Dienst nicht: Overture Maps, Thema
    `divisions`, Typ `division_area` mit Subtyp Stadtteil (ODbL, wie die Straßen). Nachbarschaft wie in Köln, dazu
    Verbindungen ohne gemeinsame Grenze (Elbe: St. Pauli – Wilhelmsburg über die Elbbrücken; Wilhelmsburg – Harburg;
    Ottensen – Blankenese entlang der Elbchaussee). Werte: `purchasingPower` 1,3 bis 1,6 in Blankenese, Eppendorf,
    HafenCity, Eimsbüttel, Ottensen; 1,0 bis 1,2 in St. Pauli, Sternschanze, St. Georg, Altona-Altstadt, Barmbek-Süd;
    0,9 in Wilhelmsburg und Harburg. `policePresence` überall 1,2 bis 1,5. Neu `nightlife` (Nachtleben, Standard 1):
    St. Pauli 2,0, Sternschanze 1,6, St. Georg 1,3; `customers` multipliziert damit die Nachfrage zwischen 22 und 4 Uhr,
    Freitag und Samstag noch einmal × 1,3, und `police` die Kontroll-Chance nachts × `nightlife`. Köln: Zülpicher-Umfeld
    (Neustadt-Süd) 1,4, sonst 1.
  - **Spots:** mindestens zwei pro Stadtteil, mindestens einer zum Kaufen, mit `audience`: Spielbudenplatz und
    Hans-Albers-Platz (St. Pauli, party), Landungsbrücken (St. Pauli, tourist), Schulterblatt (Sternschanze, student,
    party), Fischmarkt (Altona-Altstadt, tourist), Ottenser Hauptstraße (Ottensen, banker, student), Hansaplatz und Lange
    Reihe (St. Georg), Überseeboulevard und Elbphilharmonie-Plaza (HafenCity, banker, tourist), Osterstraße
    (Eimsbüttel), Eppendorfer Baum und Isemarkt (Eppendorf, banker), Fuhlsbüttler Straße und Museumsplatz (Barmbek-Süd),
    Stübenplatz und Reiherstieg (Wilhelmsburg, stoner), Harburger Rathausplatz und Sand (Harburg), Blankeneser Markt und
    Strandweg (Blankenese, banker). `unlockCost` × 1,5 gegenüber Köln. Koordinaten mit der Karte prüfen (Beschriftung
    überdeckt nichts, siehe Regeln in `spots/config.ts`).
  - **Lager:** fünf zum Kaufen, kein kostenloses (Entscheidung „Geld ja, Team nein“): Werkstatt Ottensen, Keller
    St. Georg, Halle Wilhelmsburg, Garage Barmbek, Bootshaus Harburg; Preise × 1,5 (`propertyFactor`). Das erste Lager in
    Hamburg wird dir nach der Ankunft als Quest und Hinweis angeboten.
  - **Hafen:** eigener `PORT_ID` pro Stadt (`logistics` wird pro Stadt: Liegeplatz, Kai, Zoll). Hamburg: Liegeplatz
    12.000 € sauberes Geld, Ware ist nur `10 * 60` Minuten sicher, Zoll findet sie danach mit 8 % pro Stunde.
    **Hein** wird in Hamburg zum Lieferanten `kind: 'port'` mit Containern direkt am Kai: Pakete 1 kg, 2 kg und 5 kg Gras,
    1 kg Hasch, 500 Edibles, 200 Vapes, 500 ml Öl; Preisniveau etwa 10 % über Rotterdam, dafür doppelt so große Pakete
    und 6 Stunden Lieferzeit; freigeschaltet mit dem Hamburger Liegeplatz. Rotterdam liefert weiter nur nach Köln.
    **Toni** (Frankfurt) liefert in beide Städte, nach Hamburg mit 330 Minuten und 10 % Aufschlag; Berlin nach Hamburg
    schneller als nach Köln (180), Amsterdam 360; Kalle aus Kalk nur Köln. Freigeschaltete Lieferanten und Vertrauen
    gelten in beiden Städten.
  - **Gangs:** vier neue, `hh-`-Präfix, stärker als die Kölner (Kampfkraft, Geld, Startleute etwa +25 %, höherer
    `startInfluence`), mit eigener Stimme in `gangs/texts.ts`: ein Kiez-Kartell (St. Pauli, Rotlicht und Türsteher), eine
    Hafen-Truppe (Wilhelmsburg und Harburg, Container, grob), ein Schanzen-Kollektiv (Sternschanze, vernetzt, Razzien
    gleiten an ihnen ab) und ein Elbchaussee-Club (Blankenese und Eppendorf, reiche Söhne mit Anwälten, hohe Preise).
    Namen frei erfunden, keine echten Gruppen.
  - **Polizei und Zoll:** `operationTier` in Hamburg startet mindestens bei „Händler“, Kontroll-Chance × 1,3; auf
    Hafenware liegt der Zoll (oben); Autobahnkontrollen in Etappe 6.
  - **Preise und Kosten:** `purchasingPower` wirkt wie heute auf den Richtpreis; Löhne × 1,25 (`wageFactor`, in
    `staff` nach `cityId` der Person), Lager und Spots × 1,5.
- **Karte und Handy pro Stadt:** `GameMap.view` wird `city:<id>` oder `deutschland` (bisheriges `europa` bleibt für die
  Lieferanten-Karte). `flyToCity(id)` mit Kamera aus `CITIES`. Im HUD ein Stadt-Chip („Köln ▾“, `HudPill` mit Menü:
  Köln, Hamburg, Deutschland) nur, wenn mehr als eine Stadt frei ist. Reviere-App, Gangs-App, Personal, Lager, Lieferanten
  (Lieferzeit der aktiven Stadt) und Kasse (Filter Stadt) folgen der aktiven Stadt; Nachrichten bleiben global. Die
  Deutschland-Ansicht zeigt beide Städte als Glas-Karten (Name, Veedel x/12, Ergebnis heute, Fahrten unterwegs) und die
  Fahrten dazwischen (Etappe 6). Schöner wird sie in Auftrag 31.
- **Migration:** Alle Bestände, Leute, Spots, Lager, Heat, Einfluss der alten Stände gehören zu Köln; Hamburg-Gangs,
  Hamburg-Einfluss und Hamburg-Heat werden wie bei `init` angelegt; `city` kommt frisch. Testen mit einem alten
  Spielstand aus `src/core/persistence.test.ts` (Fixture erweitern).

### 5. Ankommen in Hamburg: Fahrt, Aufenthalt, Anfang

- **`city.travel`:** Du selbst fährst mit dem Auto über die A1 (Weg und Zeit aus `roads`, Etappe 6; etwa 4 bis 5
  Spielstunden). Unterwegs gilt `isPlayerOnTheRoad` (kein `standAt`, keine eigene Lieferung oder Abholung). Die Kamera
  wechselt in die Deutschland-Ansicht und folgt dem Fahrzeug, ein Knopf „Fahrt überspringen“ setzt das Tempo auf
  Maximum, bis du da bist (kein Zeitsprung). Ankunft: `city.arrived`, die Zielstadt wird aktiv und live, Banner.
- **Aufenthalt (`present`):** Selbst an einen Spot stellen, selbst ausfahren, selbst abholen und bei Konfrontationen dabei
  sein geht nur in der Stadt, in der du bist. In der anderen Stadt laufen Konfrontationen mit „Leute machen lassen“ (mit
  Vollmacht entscheidet das die Rechte Hand, sonst der Standardweg). Umschauen und Befehle geben geht überall.
- **Erste Schritte in Hamburg:** Der Hafenarbeiter schreibt nach der Ankunft (Chat): Lager kaufen, Spot freischalten,
  Liegeplatz, dann Container. Quest-Kapitel 7 „Moin Hamburg“ mit vier Quests (Lager, erster Spot, erster Verkauf, Liegeplatz
  im Hamburger Hafen). Kein Startgeld, dein Konto reicht ja.
- **Leute nachholen:** Auf der Personal-Seite einer Person in Köln „Nach Hamburg schicken“ (`staff.relocate`, Fahrt über
  die A1 mit Fahrzeit, Lohn läuft weiter); mit Vollmacht muss die Rechte Hand die Person freigeben (sie lehnt Leutnants
  und Leute an vollen Spots ab, antwortet im Chat). Umgekehrt genauso.
- **Hamburg komplett:** Alle 12 Hamburger Stadtteile: Meilenstein und `campaign.won` pro Stadt (Bestenliste zählt
  Städte), Sieg-Bildschirm „Hamburg komplett“, dann Endlosmodus. Eine zweite Rechte Hand pro Stadt (`rightHand` wird
  pro Stadt gespeichert, Vollmacht pro Stadt) ist vorzubereiten, damit Berlin später nur Inhalt braucht; der Anruf des
  Kartells kommt **nicht** in diesem Auftrag.

### 6. Logistik zwischen den Städten: Autobahn, Routen mit Fahrplan, Kontrollen

- **Straßendaten:** `build-roads.py` bekommt Städte als Parameter (`--city hamburg`, Box `(9.80, 10.08, 53.44, 53.63)`,
  alle Stadtteile, der Hafen und die Anschlussstellen drin) und schreibt `network-hamburg.ts`; Köln bleibt `network.ts`.
  Dazu `--autobahn koeln hamburg`: aus Overture-Segmenten der Klasse `motorway` die A1 von Köln-Nord bis Hamburg-Süd
  (über `routes`/`ref` „A 1“, sonst Korridor-Box und kürzester Weg im Motorway-Graph), vereinfacht mit 50 m Toleranz,
  als `autobahn.ts` (wenige KB). Kopf der Dateien mit Quelle und Lizenz wie heute. `roads` wählt das Netz nach der Box,
  in der Start und Ziel liegen; liegen sie in verschiedenen Städten, baut `interCityRoute(from, to)` den Weg aus
  Stadt-Anfahrt, Autobahn und Stadt-Zufahrt; `travelMinutes` rechnet die Autobahn mit `ROAD_SPEEDS.motorway`.
  Routen-Cache bleibt. Tests: Köln–Hamburg etwa 400 bis 450 km, Fahrzeit mit Fahrer 4 bis 5 Stunden.
- **Routen mit Fahrplan** in `logistics`: `routes: Route[]` mit `id`, `name`, `driverId`, `fromId` (Lager), `toId`
  (Lager, andere Stadt oder dieselbe), `items: { productId, amount }[]` oder `fillTo: { productId, target }[]` (auffüllen
  bis Zielbestand im Ziellager), `departure` (Minute des Tages), `days` (Wochentage oder täglich), `roundTrip` mit
  eigenen Rückfracht-Items, `active`. Befehle `logistics.addRoute`, `logistics.updateRoute`, `logistics.removeRoute`,
  `logistics.runRouteNow`. Zur Abfahrt: Fahrer frei und in der Startstadt, Ware da, dann eine Fahrt `kind: 'route'`
  (bestehendes `Trip` erweitern) mit Kapazität `INTERCITY_CAPACITY` je Fahrt (Gewicht pro Einheit in `goods/config.ts`,
  Gramm für Gras, 5 g je Edible, 20 g je Vape, 1 g je ml Öl; Standard 5.000 g, „Fuhrpark“ mit größeren Fahrzeugen kommt
  später). Fehlt etwas, fährt sie mit dem, was da ist, oder fällt aus und steht im Protokoll. Der Fahrer ist danach in
  der Zielstadt (`cityId`), bei `roundTrip` kommt er zurück.
- **Autobahnkontrollen (Zoll):** pro Fahrt zwischen den Städten eine Chance `AUTOBAHN_CHECK_CHANCE` 0,15 × Heat-Faktor der
  Zielstadt × Vorsicht des Fahrers; Konfrontation `vehicleCheck` mit Zoll-Kulisse (Texte), Aufenthalt 60 Minuten; fliegt
  die Ladung auf, ist sie ganz weg, der Fahrer landet eher in Haft (`SEIZE_ARREST_CHANCE`), Heat in der Zielstadt.
- **Logistik-App:** neue Seite „Routen“ (Liste als `Group` mit Chips: Fahrer, Abfahrt, Ladung, Richtung, nächster Start,
  letzte Fahrt; Schalter aktiv; Blatt zum Anlegen und Ändern mit `Select`, `Stepper`, Wochentag-Chips). Die Fahrt läuft als
  Fahrzeug über echte Straßen und die Autobahn (`logistics/ui/map.ts`, Deutschland-Ansicht und in beiden Stadtansichten
  bis zur Einfahrt), Live-Activity in der Dynamic Island, Banner nur bei Zoll und Ankunft (dringend). Seite „Fahrer“: wo
  der Fahrer ist, nächste Route.
- **Rechte Hand:** „Hafen abholen“ gilt pro Stadt; Routen plant sie nicht (Entscheidung „Fahrer mit Fahrplan“).
- Tests: tägliche Route bringt Ware von Köln nach Hamburg, Bestand sinkt und steigt, schlafendes Köln kauft nach
  (Etappe 4), Zoll zieht ein, Rückfahrt bringt Hafenware aus Hamburg nach Köln.

### 7. Charakter der Städte

Alles in `config.ts`-Werten pro Stadt, damit das Balancing im Bot messbar bleibt. Jede Besonderheit braucht einen Satz im
Handy an der Stelle, wo man sie merkt (`Disclosure` oder `Group more`).

- **Hamburg** ist mit Etappe 4 weitgehend da (Hafen, Preise, Nachtleben, Polizei und Zoll). Hier noch: zwei bis drei
  Hamburger Stadt-Events analog zu Köln (Hafengeburtstag drei Tage an den Landungsbrücken mit Nachfrage × 2,5 und Polizei
  × 1,5; Schlagermove ein Tag St. Pauli × 2; Hamburger Dom vier Wochen Heiligengeistfeld × 1,4), und die Gang-Stimmen.
- **Köln, Stadt-Events** (Modul `events`, neu, oder in `veedel` als Kalender; Kalender in Spieltagen, es gibt kein Datum
  und keine Jahreszeiten): **Karneval** ab Tag 30 alle 90 Tage für sechs Tage (Nachfrage × 2 in Altstadt-Nord,
  Altstadt-Süd, Neustadt-Nord, Neustadt-Süd, Heat pro Verkauf × 0,7, Kontrollen × 0,5, keine Razzien, danach zwei Tage
  Kater × 0,8), **FC-Heimspiel** jeden zweiten Samstag 15 bis 22 Uhr (Lindenthal und Ehrenfeld × 1,6, Überfall-Chance der
  Gangs × 1,5), **Kölner Lichter** Tag 60 alle 90 Tage (Spots am Rhein × 2,5, Polizei × 1,5). Ankündigung einen Tag vorher
  per Handy (Kontakt frei erfunden, z.B. ein Kiosk-Kumpel) und als Chip im HUD während des Events; Journal; Ereignisse
  `events.started` und `events.ended`, auf die `customers`, `police`, `gangs` hören. Nur in der jeweiligen Stadt.
- **Kölscher Klüngel:** In Köln wachsen Beziehungen schneller (Lieferanten-Vertrauen × 1,5, Gang-Beziehung bei Deals und
  Waffenstillstand × 1,5, Polizei-Kontakt `raidWarning` + 0,1), Freikaufen in Konfrontationen und Kaution −25 %. Hamburg:
  Faktor 0,8 bzw. +20 % (kühl und korrekt). Werte als `relationFactor`, `bribeFactor` pro Stadt in `CITIES`, gelesen von
  `suppliers`, `gangs`, `encounters`, `staff`.
- **Studenten und Kneipen:** Neue Spot-Art `kind: 'kneipe'` (Veedel-Kneipe): weniger Laufkundschaft, dafür Stammkunden
  doppelt so oft (`REGULAR_CHANCE` × 2), Ruf wirkt doppelt (positiv und negativ), Öffnungszeiten 17 bis 1 Uhr, Preis-
  Toleranz höher. Drei bis vier Kneipen-Spots in Köln (Südstadt, Ehrenfeld, Nippes, Sülz) zum Kaufen, in Hamburg eine
  Kiez-Bar in St. Pauli. Studenten: `audience.student` in Sülz, Lindenthal und Neustadt-Süd anheben, der Kundentyp zahlt
  weniger, kommt dafür oft (Werte in `customers/config.ts: CUSTOMER_TYPES` prüfen, nicht neu erfinden).
- Balancing: `npm run balance` für Köln darf sich nur wenig ändern (Bericht im PR). Für Hamburg braucht der Bot
  Stadt-Wissen (`bot.ts`: aktive Stadt, Spots und Lager pro Stadt, Umzug nach der Vollmacht); ein Balance-Lauf „Hamburg
  nach Köln komplett“ (Seed, 20 Spieltage) kommt in den Bericht: erstes Hamburger Veedel nach etwa 7 bis 10 Tagen,
  keine Pleite.

### 8. Abnahme

- `npm run check`, `npm run build`, `npm run e2e` (erweitern: Stadt wechseln, Route anlegen), `npm run balance`,
  `npm run screenshot -- --scenes=alle` (neue Szenen: Anruf, Übergabe, Deutschland-Ansicht, Hamburg bei Nacht),
  `npm run screenshot:phone` (neue Seiten: Anruf, Routen, Kasse mit Filter Stadt), `npm run audit:phone`,
  `npm run monkey:phone` (neue Seiten in die App-Liste).
- Determinismus-Test über zwei Städte (gleicher Seed, gleiche Befehle inklusive `city.switch`, gleicher Zustand).
- Alter Spielstand (Auftrag 29) lädt, zeigt Köln, hat keinen Stadt-Chip, bis Hamburg frei ist.
- Performance nach Etappe 0 nicht wieder verschlechtert (`perf.test.ts`, Browser-Messung im PR).

## Nicht in diesem Auftrag

- Verkehr, Leute an Spots, Flüsse aus Overture-Daten, Hamburger Wahrzeichen, schöne Deutschland-Ansicht, Fahrzeuge
  „überall richtig auf der Straße“: [Auftrag 31](31-karte-lebt.md).
- Fuhrpark mit Fahrzeugen zum Kaufen und Ladekapazitäten (nur die eine Kapazität je Fahrt hier).
- Getrennte Kassen pro Stadt, Geldtransporte.
- Anruf des Kartells, Inhalt für Berlin oder Frankfurt (nur die Schablone).
- Gangs sichtbar auf der Karte, Tarnfirmen, Multiplayer.
- Ein Serverschema für die Bestenliste ändern: Städte nur als zusätzliches optionales Feld, wenn der Server es
  verträgt (`api/leaderboard.ts` prüfen), sonst im PR notieren.

## Neue Geld-Kategorien

| Kategorie | Label | Gruppe |
| --- | --- | --- |
| `share.righthand` | Anteil Rechte Hand | expense |
| `income.city` | Ergebnis einer Stadt im Schlafmodus (Rechte Hand) | income |
| `expense.city` | Verlust einer Stadt im Schlafmodus | expense |
| `loss.customs` | Zoll (Autobahn und Kai) | loss |

## PR-Beschreibung

Drei Abschnitte wie immer: „Was ist neu“ (nach Etappen), „Wie testen“ (Befehle und Klickwege, auch
`?neu=normal&seed=1&tempo=0` plus ein Weg, Köln komplett schnell zu erreichen, z.B. ein Entwickler-Befehl in
`window.koeln.session` nur im Dev-Build), „Für die Integration“ (was Auftrag 31 vorfinden soll: Datei- und
Funktionsnamen für Netze, Autobahn, Städte, Deutschland-Ansicht). Dazu „Stand“, falls eine Session an einer Etappengrenze
abgibt, und die Messwerte aus Etappe 0 (vorher/nachher) und `npm run balance` (vorher/nachher).
