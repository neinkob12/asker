# Auftrag 28: Spots in jedem Veedel, Auftragsfahrer, Rechte Hand übernimmt das Handy

Prompt für eine eigene Claude-Session (hohe Denkstufe empfohlen). Neue Session auf `main` starten und einfügen:

```
Setze den Auftrag in docs/auftraege/28-spots-auftragsfahrer-rechte-hand.md vollständig um.
Lies vorher CLAUDE.md, docs/konzept.md, docs/architektur.md, src/ui/README.md und docs/auftraege/README.md.
```

Kann **gleichzeitig mit Auftrag 26** laufen. Dieser Auftrag ändert vor allem Spiellogik; Oberfläche nur so viel, wie
die neuen Funktionen brauchen (Einstellungen der Rechten Hand, Rolle Auftragsfahrer, neue Spots).

## Wunsch aus dem Probespielen (02.10.2026)

> Bitte in den Veedeln, wo es noch keine Spots gibt, Spots einfügen, die wir kaufen können, so dass jeder Bezirk
> übernehmbar ist. Auf der Schäl Sick gibt es zum Beispiel keine Spots, da kann man nichts übernehmen.
>
> Es gibt zu schnell zu viele Aufträge. Es ist sehr schwer hinterherzukommen, wenn man sich auf alles gleichzeitig
> konzentrieren will. Es sollte die Möglichkeit geben, jemanden aufs Handy zu setzen, der die Handysachen macht. Die
> Kuriere werden umbenannt in eine eigene Arbeitsgruppe: Läufer mit Auto, die die Aufträge übernehmen, die Nachrichten
> dazu beantworten und mit dem Auto ausliefern, was man sonst selbst macht. Man muss am Namen genau erkennen, was sie
> machen. Die Leutnants können weiter fürs Bestellen zuständig sein.
>
> Die Rechte Hand muss deutlich mehr Funktionen bekommen. Sie ist noch zu Standard. Sie soll zum Beispiel die
> Lieferung am Hafen automatisch abholen lassen und das Handy steuern, sie ist ja dein engster Vertrauter.
>
> Langfristige Idee: Wenn man mit Köln fertig ist, geht man in eine andere Stadt (Berlin, Frankfurt, Hamburg). Die
> Rechte Hand managt dann Köln. Wenn man sie hoch genug levelt, kann sie irgendwann alles übernehmen, Köln läuft
> vollautomatisch, und über Köln wird die Ware bezogen und logistisch an alle anderen Städte weitergeleitet. Später
> ruft vielleicht das kolumbianische Kartell an.

## Rahmen

- **Vorbedingung prüfen:** `git fetch origin main`. Ist Auftrag 23 (`docs/auftraege/23-mehr-leben-in-koeln.md`) in
  `main` oder auf einem offenen Branch? Dann mit dem Spieler klären, bevor du baust: Auftrag 23 plant einen
  **Disponenten** und Daueraufträge, das überschneidet sich mit den Auftragsfahrern und der Rechten Hand hier. Dieser
  Auftrag hat Vorrang; der Disponent aus 23 geht in der Rechten Hand auf.
- Den alten Branch `claude/magical-gauss-sztatp` ansehen (nicht in `main`): "Kunden schreiben nur noch direkt, wenn der
  Spieler es einschaltet" und Balancing. Übernimm daraus, was zu Etappe 2 passt, statt es neu zu erfinden.
- **Ganzer Code freigegeben**, Schwerpunkt `spots`, `veedel`, `customers`, `staff`, `hierarchy`, `logistics`,
  `src/playtest/bot.ts`. Ordnerregeln aus `CLAUDE.md` gelten.
- **Auftrag 26 läuft vielleicht parallel** und baut die Handy-Oberfläche um (Apps, Startbildschirm, Banner). In
  `ui/`-Ordnern nur das Nötigste ändern; bei Konflikten `main` mergen, nicht rebasen.
- **Migrationen:** Jede Zustandsänderung bekommt Version + Migration + Test. Bestehende Kuriere werden zu
  Auftragsfahrern, alte Spielstände laden und spielen weiter. **Befehle nur erweitern** (alte Payloads mit
  `by: 'courier'` weiter annehmen).
- Wege und Fahrzeiten immer über `roads`. Geld immer mit Kategorie. Determinismus, Sprachregel, keine npm-Pakete.
- **Etappen**, nach jeder `npm run check`, Commit, Push, Draft-PR nach Etappe 1. Vor dem letzten Push zusätzlich
  `npm run build`, `npm run e2e`, `npm run balance` (Bericht vorher/nachher im PR).

## Entscheidungen (vorab getroffen)

| Thema | Entscheidung |
| --- | --- |
| Spots | **Jedes Veedel hat mindestens zwei Spots**, mindestens einer davon zum Kaufen (`unlockCost`). Heute haben Ehrenfeld, Sülz, Nippes, Kalk, Mülheim und Bayenthal keinen, Deutz nur einen (Rheinpark). Echte Kölner Orte mit passenden Koordinaten und Publikum. |
| Aufträge | **Weniger und planbarer:** Lieferanfragen deutlich seltener (Startwert halbieren), höchstens zwei offene gleichzeitig, längere Antwortfrist. Wer Auftragsfahrer hat, bekommt mehr (die Fahrer schaffen sie ja). |
| Auftragsfahrer | Die Rolle `courier` heißt in der Oberfläche **Auftragsfahrer** (Code-ID bleibt `courier`, damit nichts bricht). Sie haben ein Auto, **nehmen Lieferanfragen selbst an**, antworten im Chat für dich (der Chat zeigt "Ali hat zugesagt") und liefern aus. Regeln pro Fahrer: annehmen ja/nein, nur bis Betrag X, nur in eigenen Revieren. Großhandel bleibt Chefsache (fragt dich, außer die Rechte Hand darf). |
| Leutnants | Bleiben fürs Bestellen und ihre Spots zuständig (wie Auftrag 24). |
| Rechte Hand | Bekommt **Aufgaben**, jede einzeln an- und abschaltbar, freigeschaltet nach Level: **Hafen abholen** (Level 1: schickt einen freien Fahrer, sobald Ware am Kai liegt), **Handy führen** (Level 2: beantwortet Routine-Chats, verteilt Lieferanfragen an Auftragsfahrer, lehnt ab, was keiner schafft), **Nachbestellen für ganz Köln** (Level 2: Lieferant und Ware nach Regeln, mit Budget), **Personal** (Level 3: stellt Bewerber ein und ersetzt Ausfälle über alle Leutnants), **Großhandel** (Level 4: nimmt Großhandels-Deals bis Betrag X an), **Geldwäsche** (Level 4: wäscht nach Regel, z.B. "über 5.000 € Schwarzgeld die Hälfte"). |
| Leveln | Die Rechte Hand bekommt Erfahrung für jede erledigte Aufgabe und jeden guten Tagesbericht. Sie kann Fehler machen (Loyalität, Vorsicht zählen). |
| Mehrere Städte | **Nicht bauen.** Nur in `docs/konzept.md` als Ziel festhalten (siehe Etappe 5), damit spätere Aufträge darauf hinarbeiten. Die Rechte Hand so bauen, dass "alle Aufgaben an" Köln ohne Spieler am Laufen hält. |

## Etappen

### 1. Spots in jedem Veedel

- `src/modules/spots/config.ts`: neue `PRESET_SPOTS` für Ehrenfeld, Sülz, Nippes, Kalk, Mülheim, Bayenthal und einen
  zweiten in Deutz, Lindenthal und Altstadt-Nord. Vorschläge (Koordinaten selbst prüfen, Spot muss per `veedelAt` im
  richtigen Veedel liegen und nah an einer Straße aus `roads` sein): Ehrenfeld (Venloer Straße/Bahnhof Ehrenfeld,
  Herbrandstraße), Sülz (Zülpicher Wall/Berrenrather Straße, Hermeskeiler Platz), Nippes (Wilhelmplatz, Neusser
  Straße/Florastraße), Kalk (Kalk Post, Kalker Hauptstraße/Ottmar-Pohl-Platz), Mülheim (Wiener Platz, Mülheimer
  Hafen), Bayenthal (Südpark/Bonner Straße, Rheinufer Bayenthal), Deutz (Deutzer Bahnhof/Ottoplatz), Lindenthal
  (Stadtwald/Decksteiner Weiher), Altstadt-Nord (Hauptbahnhof/Domplatte).
- Freischalt-Preise und Andrang so, dass die Schäl Sick (Deutz, Kalk, Mülheim) und Bayenthal echte Ziele fürs
  mittlere Spiel sind. Gangs, Reviere (`territory`) und Polizei kommen mit den neuen Spots klar (Tests).
- Alte Spielstände bekommen die neuen Spots dazu (Migration in `spots`), gesperrt.

### 2. Weniger Aufträge

- `customers/config.ts`: `DELIVERY_CHANCE_PER_HOUR`, `MAX_OPEN_ORDERS`, `ORDER_EXPIRES_IN` nach der Tabelle; Chance
  steigt mit der Zahl aktiver Auftragsfahrer. Balancing prüfen (`npm run balance`), Umsatz im frühen Spiel darf nicht
  einbrechen (Straßenverkauf trägt ihn).

### 3. Auftragsfahrer

- `staff`: Rolle `courier` überall in Texten "Auftragsfahrer" (`ROLE_INFO`), Beschreibung "fährt mit dem Auto
  Lieferaufträge aus und kümmert sich ums Handy". Regeln pro Fahrer im Zustand (Version + Migration).
- `customers/orders.ts`: Fahrer mit "annehmen" übernehmen passende Anfragen selbst (`acceptOrder(…, 'courier')` mit
  `actor: 'staff:<id>'`), der Chat bekommt eine stille Antwort im Namen des Fahrers. Fahrt über `roads`, Dauer nach
  Tempo-Wert. Fehler (Kontrolle, Überfall) wie bisher über `encounters`/`police`.
- Bewerber mit Rolle Auftragsfahrer in `recruiting` (Auftrag 27 baut die Personal-Seite um; hier nur Logik + die
  nötigste Anzeige).

### 4. Rechte Hand mit Aufgaben

- `hierarchy/righthand.ts`: Aufgabenliste nach der Tabelle, `RightHandSettings` erweitern (Version + Migration).
  Jede Aufgabe handelt nur über `ctx.dispatch(…, { actor: 'staff:<id>' })` mit bestehenden Befehlen
  (`logistics.pickup`, `customers.acceptOrder`/`declineOrder`, `suppliers.order`, `recruiting.hire`,
  `laundering.launder` …). Fehlt ein Befehl, im jeweiligen Modul ergänzen.
- **Handy führen:** Chats mit Antwort-Knöpfen bekommen eine Kennzeichnung "Routine" oder "Chefsache" (beim Senden,
  `messages.send` erweitern). Die Rechte Hand beantwortet nur Routine; Chefsache (Gangs, Polizei, Großhandel über dem
  Limit, Leute mit Frist) bleibt beim Spieler.
- Tagesbericht nennt, was sie erledigt hat ("3 Lieferungen abgeholt, 5 Anfragen verteilt, 1 abgelehnt").
- `hierarchy/ui/RightHand.tsx`: Aufgaben als Schalter mit Level-Schloss und je einer Regel-Zeile. Nur das Nötigste,
  Optik übernimmt Auftrag 27.
- Bot (`src/playtest/bot.ts`): setzt ab dem mittleren Spiel eine Rechte Hand mit allen Aufgaben ein. Neuer Test:
  Mit Rechter Hand auf höchster Stufe und allen Aufgaben an läuft Köln 10 Spieltage ohne Befehle des Spielers, ohne
  Pleite (Seed fest).

### 5. Ziel mehrere Städte festhalten

- `docs/konzept.md`: Abschnitt "Später: mehrere Städte" (Köln als Basis und Warenquelle, Rechte Hand übernimmt eine
  Stadt, neue Herausforderungen in Berlin, Frankfurt, Hamburg, Logistik zwischen den Städten, am Ende Anruf vom
  Kartell). Keine Umsetzung.

## Abnahme

- Jedes Veedel hat mindestens zwei Spots, auch nach dem Laden eines alten Spielstands; jedes Veedel ist übernehmbar.
- Lieferanfragen kommen spürbar seltener (Zahl pro Spieltag vorher/nachher im PR).
- Auftragsfahrer nehmen Anfragen selbst an, antworten im Chat und liefern aus.
- Rechte Hand: alle Aufgaben schaltbar, Level-Schlösser, Tagesbericht mit erledigten Aufgaben; Test "Köln läuft 10
  Tage allein" grün.
- `npm run check`, `npm run build`, `npm run e2e` grün, Balancing-Bericht im PR.
- PR-Beschreibung: "Was ist neu", "Wie testen", "Für die Oberfläche (Auftrag 27)".
