# Auftrag 43: Feedback vom 05.10.2026 – Städte sauber trennen, Spielstände pro Stadt, Hafen-Phase verständlich

Grundlage ist das Feedback des Spielers vom 05.10.2026:

> In jeder Stadt ist nur das Personal, das du auch in dieser Stadt eingestellt hast. Hast du die alte Stadt an die Rechte
> Hand abgegeben, bleibt das Personal dort. In Hamburg musst du dann selber wieder bestellen, und es gibt dort noch keine
> Handelsrouten. Dazu Spielstände von allen Städten zu jedem Zeitpunkt (Köln übernommen, dann Hamburg, dann die
> weiteren), damit man jeweils den Stand der nächsten Stadt laden kann. Und in den späteren Phasen (Lieferant in den
> Niederlanden, Großkunden) checkt man nicht, wie alles funktioniert: Es braucht eine Einleitung für den neuen Job,
> Routen und Versorgung der Kunden müssen planbar und übersichtlich sein.

Die Arbeit läuft als Loop in einer Session (Branch `claude/dazzling-thompson-dzjuma`). Jede Runde nimmt den obersten
offenen Punkt, baut ihn, prüft ihn (`npm run check`, `npm run build`, bei UI zusätzlich Screenshots bzw.
`npm run monkey:phone -- --apps <app>`), committet und pusht und hakt ihn hier ab. Neue Funde kommen unten in die
passende Liste. Regeln aus `CLAUDE.md` gelten wie immer (Befehle, Migrationen, Optik-Regeln, deutsche Texte).

## A. Personal bleibt in seiner Stadt

- [x] A1 Übergabe ohne Startpaket mit Leuten: Es kommen keine neue Rechte Hand und keine Leute mehr mit, nur Startgeld
  und auf Wunsch Fahrzeuge (`city.handOver` mit `pack.vehicleIds`). Der Übergabe-Dialog sagt, wie viele Leute beim
  Statthalter bleiben. Migration `city` 7 (ohne `startLeader`).
- [x] A2 Kein Versetzen in eine andere Stadt (`staff.relocate` und der Knopf im Profil sind weg). Wer in einem alten
  Spielstand noch unterwegs ist, kommt an.
- [x] A3 Fahrer auf Routen in eine andere Stadt gehören weiter zu ihrer Stadt und kommen immer zurück (ohne Rückfracht
  leer, mit demselben Fahrzeug).
- [x] A4 Die neue Stadt erklärt den Neuanfang: Begrüßung des Kontakts (`CITY_OFFERS[…].welcome`) und Peters Kapitel
  sagen, dass man selbst ein Lager kauft, Leute anheuert und bestellt (neue Quests „Läufer anheuern“ und „Ware
  bestellen“ pro Stadt, Migration `quests` 5, `shipment.ordered` mit `cityId`). Lieferanten-App, Island, Lieferung
  live, Schiffs-Tracker, Banner (Ware da, Schiff im Hafen, Fahrt angekommen) und Fahrer-Zahlen zeigen nur die Stadt,
  in der du spielst (`shipmentsInTransit(state, cityId)`, `tripTouchesCity`, `placeCity`); der Routen-Editor bietet
  nur Fahrer aus der Stadt des Startlagers an.
- [x] A5 Bot und Balancing: Ohne Startpaket neu messen (`npm run balance`, Bericht „Tage pro Stadt“). Ziel bleibt
  Hamburg etwa 15 Tage, dritte Stadt 12, vierte 10, fünfte 8; Stellschrauben `START_MONEY_MIN_BY_CITY`,
  `HANDOVER_START_MONEY_DAYS`. Zahlen in `docs/architektur.md`, Abschnitt „Balancing“. Gemessen: Hamburg 6–8 (ein
  Ausreißer 38), Berlin 6–9, München 5–9, Frankfurt 3–6 Tage; schneller als die Richtwerte, keine Änderung nötig.

## B. Test-Spielstände für jede Stadt in jeder Phase

- [x] B1 Feste Reihenfolge Köln → Hamburg → Berlin → München → Frankfurt (Bot `cityOrder`), Hamburg direkt nach Köln.
- [x] B2 Pro Stadt nach Köln drei Stände: „Ankunft in <Stadt>“ (gerade angekommen, alte Städte beim Statthalter),
  „Boss von <Stadt>“ (Mehrheit gerade gefallen) und „<Stadt> fast komplett“ (ein Veedel fehlt und fällt gleich nach
  dem Laden, danach ruft die nächste Stadt an), wie bei Köln.
- [x] B3 Spielstände-Dialog: eine Gruppe pro Stadt (Köln, Hamburg, Berlin, München, Frankfurt), dann Deutschland, Hafen,
  Produktion.
- [x] B4 `testSaves.test.ts`: In jeder Ankunft hat die Stadt keine Leute, keine Rechte Hand und keine Routen, und der
  Spieler ist dort; „fast komplett“ wird nach dem Laden komplett, und die nächste Stadt meldet sich.

## C. Hafen-Phase: Lieferant in Rotterdam

- [x] C1 Einleitung für den neuen Job: Kapitel „Rotterdam“ (Quests, `voice: 'jansen'`, erst nach der Ankunft über
  `requires`): Bestellung annehmen → ausliefern → Container kaufen → Lkw → fünfmal pünktlich; jeder Schritt misst den
  Zustand und führt mit „Hinführen“ in die Kunden-App (`goTo` `trade`/`tradeHarbor`, `openPhone('trade.app', { view })`).
  Mit dem Verkauf fallen die offenen Kapitel aus Deutschland und der Wochenvertrag weg. „So läuft der Hafen“ oben in den
  Bestellungen (die ersten zwei Wochen offen).
- [x] C2 Erste Woche fair: Bestellungen kommen wie angesagt am Montag (oder Jansen sagt es richtig), längere
  Antwortfrist in der ersten Woche, Startware passend zu den ersten Bestellungen.
- [x] C3 „Nächster Schritt“ für die Hafen-Phase: Ware fehlt → Einkauf; kein Lkw → Lkw kaufen; Container am Kai bzw.
  Lager voll → Halle; Zoll-Heat hoch → zweiter Hafen oder Deckladung; Bestellung kurz vor der Frist. Der alte Rat
  „Ware ist alle → Lieferanten-App“ schweigt nach dem Verkauf.
- [x] C4 Keine Sackgasse in „Zu liefern“: Fehlt Ware, führt ein Knopf direkt zum Einkauf mit vorausgefüllter Ware und
  Menge.
- [x] C5 Versorgung planbar (`trade/plans.ts`, Migration `trade` 4): Fenna übernimmt für alle Kunden oder pro Kunde
  (`trade.setPlan`): annehmen (selbst, mit Ware, alle) und ausliefern, sobald die Ware im Hafen liegt (selbst, Lkw sonst
  Spedition, Spedition). Nachkauf-Regeln (`trade.addRestock`): unter einer Menge (Hafen und unterwegs) bestellt sie einen
  Container beim gewählten Produzenten. Sie arbeitet stündlich und zahlt wie du. Übersicht „Diese Woche“ (bestellt, im
  Hafen, auf See, fehlt; Tipp führt zum Einkauf).
- [x] C6 Großkunden mit eigener Seite (`trade.customer`): Gesicht, Anteil, Vertrauen, stärkste Konkurrenz, Grenze, Bedarf
  pro Woche, eigener Lieferplan, Zuverlässigkeit, letzte Bestellungen; antippbar in der Kunden-Liste, auf der
  Europa-Karte und auf den Karten der alten Städte.
- [x] C7 Lkw dort kaufen, wo man ihn braucht (Kunden-App, Hafen › Fahrzeuge); das Liefer-Blatt weist darauf hin.
- [x] C8 HUD und Handy nach dem Verkauf: Zoll statt Heat (wachster Hafen), „Ruf als Lieferant“ (pünktlich, Qualität)
  statt Ruf und Reviere; Reviere, Gangs, Lieferanten und Lager verschwinden vom Startbildschirm (`hiddenWhen` für Apps
  und Tabs in `src/ui/registry.ts`).
- [x] C9 „Dein Preis“ wirkt jetzt wirklich: Er geht als Faktor in das Angebot pro Gramm ein (außer beim
  Abnahmevertrag) und verschiebt weiter den Anteil. Vorher war ein niedriger Preis geschenkter Mehrumsatz.
- [x] C10 Banner in der Hafen-Phase: Container angekommen (dringend), Lager voll am Kai, Lieferung aufgeflogen, zu spät
  geplatzt, neuer Kunde in Europa; „Bestellung läuft ab“ steht als Rat (C3).
- [x] C11 Gegenangebot zeigt vorher, ob man damit vor der Konkurrenz liegt (`counterOutcome`, rechnet mit deinem
  Preis); Europa-Kunden nennen die nötige Pünktlichkeit als Zahl.

## D. Produktion

- [x] D1 Einleitung für den Anbau: Kapitel „Produktion“ (`voice: 'grow'`, der Anrufer der Region; Angebot → Finca →
  Arbeiter → erste Ernte → verschiffen → eigene Ware ausliefern), erst nach den Anrufen (`requires`).
- [x] D2 Zwischenziel bis zum Anruf: Kunden-App › Kunden „Als Nächstes: eigene Produktion“ mit Wochen und Umsatz.
- [x] D3 Finca ohne Arbeiter erntet 0 kg, ohne Warnung (`grow/index.ts` Ernte × Arbeiter): nach dem Kauf das
  Finca-Panel öffnen, Rat „<Finca> hat keine Arbeiter“ (dringend, solange die Ernte nah ist), Journal „Ernte
  ausgefallen: keine Arbeiter“; Nutzen des Gärtners in einem Satz.
- [x] D4 Falle beim sauberen Geld: Löhne und Dünger zahlen zuerst sauber (`payLocal`), die Pacht geht nur sauber, die
  Finca ist weg, obwohl Schwarzgeld da ist. Laufende Kosten zuerst schwarz (oder Reserve für die Pacht), Banner bei
  knapper Pacht mit Sprung zur Geldwäsche, „Finca verloren“ als Banner.
- [x] D5 Land-Gruppe im Region-Panel nach oben, im Anbau-Tab „Land kaufen oder pachten“ pro Region; ausgegrautes
  Kaufen sagt, was fehlt, mit Knopf zur Geldwäsche.
- [x] D6 „Kaufen ist auf Dauer billiger“ ehrlich machen (Break-even etwa 60 Wochen; Pachten zum Start).
- [x] D7 Meldungen der Produktion sichtbar: Ware verpackt im Ausfuhrlager und Ziele als dringende Banner mit Sprung,
  Feld brach, Löhne unbezahlt, Pacht fällig, Kartell-Treffer als Banner `bad`.
- [x] D8 „Nächster Schritt“ für die Produktion: erste Finca fehlt, Arbeiter fehlen, Ausfuhr bereit (Sprung zum
  Verschiffen), Behörden hoch, Pacht knapp; mehrere Räte statt einem, Angebot höher gewichten, `view: 'grow'`.
- [x] D9 Eigene Ware zuerst: Fehlt Ware, bietet das Spiel zuerst das eigene Ausfuhrlager an (`producersFor`,
  `trade.missing`, „Diese Woche“); „Alles verschiffen“ im Verschiff-Panel; eigene Ernte im Hafen-Tab.
- [ ] D10 Ziel „Europa“: wen man noch versorgen muss (Liste `missing`), Titel und Regel passen zusammen, zwei Hinweise.
- [x] D11 „Nächste Ernte“ netto nach dem Kartell-Anteil (oder beides).
- [x] D12 Karte „Angebot“ auf der Karte öffnet ein Panel mit „Angebot annehmen“ (keine Sackgasse).
- [x] D13 Finca-Panel lesbar: Leute ohne Pacht, „Als Nächstes pflanzen“, Währung an jedem Preis, Zoll-Faktor in Worten.
- [x] D14 Kartell und Behörden mit Zahlen („von 100“, Chance und Verlust ohne Anteil); stilles Zurückfallen der
  Verpackung melden.
- [ ] D15 HUD „Anbau“: Ausfuhr-kg, Tage bis zur Ernte, Warnfarbe bei Behörden oder Pacht.
- [ ] D16 Europa-Ansicht am Desktop: Das Handy verdeckt Rotterdam und Marokko (Padding rechts mit dem Handy).

## E. Prüfer „Städte“ (Sonnet-Agent, 05.10.2026): Was aus der alten Stadt noch durchsickert

- [x] E1 Kritisch: In Hamburg lässt sich ein Kölner zur Rechten Hand ernennen; das setzt Kölns Statthalter ab
  (`canBeRightHand`, `appointRightHand`, `installPost` prüfen die Stadt nicht; Listen in `RightHand.tsx` ohne Stadt).
- [x] E2 Personal-Tab der neuen Stadt zeigt den Kölner Baum (Leutnants, Capos, Ergebnis), „Leutnant ernennen“ bietet
  Kölner an, „In anderen Städten“ und die Suche öffnen Kölner Akten mit Aktionen (`Tree.tsx`, `AppointSheet.tsx`,
  `staff/ui/index.tsx`).
- [x] E3 Berichte der Statthalter anderer Städte kommen als offene Fragen mit Frist und Ton, mit Lohnreserve der
  aktiven Stadt (`sendReport`, `buildReport`, `wageRunway`).
- [x] E4 Hafen- und Fahrer-Chats der alten Stadt mit Frist und nicht ausführbaren Antworten; Container einer schlafenden
  Stadt bleiben ewig am Kai.
- [x] E5 Routen-Seite der neuen Stadt zeigt und bedient Routen der alten (`routes.tsx` `getRoutes` ohne Stadt).
  Erledigt: `getRoutes(state, cityId)` (Stadt des Startlagers), Seite und Zeile „Routen“ nur mit Routen der aktiven Stadt,
  Hinweis auf Routen anderswo, Start nur in der aktiven Stadt; `logistics.addRoute`/`updateRoute` lehnen fremde Städte ab.
- [ ] E6 Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) der alten Stadt wirken in der neuen (`bonus`, `bonusProvider`).
- [ ] E7 Leute der alten Stadt schreiben Empfehlungen in der neuen; Hintergründe mit Kölner Ortsnamen in jeder Stadt.
- [ ] E8 Event-Ankündigungen und Rabatt-Aktionen der alten Stadt kommen in der neuen an.
- [ ] E9 Neue Stadt ohne sichtbaren ersten Schritt: Willkommen still, Rat „Läufer anheuern“ aus, sobald irgendwo
  jemand arbeitet, „Liegeplatz“ vor dem ersten Lager, Reviere-Ziel fest auf Köln, zu wenig sauberes Geld fürs Lager.
- [ ] E10 Sicherheitsleute schlafender Städte sammeln Erfahrung, Level-Meldungen kommen in der neuen Stadt.
- [ ] E11 Fahrer-Zählung über Städte bei Rechter Hand und Bestellregeln (`orders.ts`, `tasks.ts`).
- [ ] E12 Personal-Aufgabe der Rechten Hand läuft über Leutnants aller Städte; `replaceAbsent` prüft die Stadt nicht.
- [ ] E13 Die Kasse zeigt in der neuen Stadt zuerst alle Städte (Standardfilter = aktive Stadt).
- [ ] E14 Quest-Belohnungen „Team-Erfahrung“ und „Loyalität“ gehen an alle Städte.
- [ ] E15 Fest verdrahtete „Köln“-Texte in jeder Stadt (Rechte Hand, Kasse, Hafen, Reviere).
- [ ] E16 Bewerber-Pool beim Stadtwechsel nicht erneuert (Lohn und Handgeld der alten Stadt).
- [ ] E17 Lieferant begrüßt „Du bist in Berlin“ schon bei der Abfahrt (auf `city.arrived` legen).
- [ ] E18 (Designfrage) Zurück in einer übergebenen Stadt: Hinweis, dass man die Vollmacht zurücknehmen kann.

## Neue Funde

- [x] N0 (Spieler, 05.10.2026) „Man kann im Hafen in Rotterdam keine Ware bestellen, es steht sogar, dass es keinen
  Hafen gäbe“: Die alte Hafen-Seite (`logistics.port`, auch über den Anker auf der Karte) zeigte in Rotterdam den
  Kölner Niehler Hafen mit „Liegeplatz mieten“, die Lieferanten-App war leer. Beide führen jetzt nach dem Verkauf in
  die Kunden-App, Bereich Hafen (Einkauf im Ausland); der Rat „Ware ist alle“ schweigt nach dem Verkauf.

- [ ] N1 Lieferanten schreiben nach dem Umzug weiter Chats über Lieferungen in die alte Stadt („Freie Bahn. Bin früher
  da.“). Lieferungen für eine Stadt mit Statthalter still oder als Bericht des Statthalters.
- [ ] N2 Peters Quest-Leiste zeigt nach dem Umzug alte Kölner Quests (z.B. „Setz einen eigenen Preis“), wenn sie in
  Köln liegen geblieben sind; beim Umzug in eine neue Stadt sollte ihr Kapitel vorgehen.
- [ ] N3 Bot, Seed 4: Hamburg hängt nach neun Stadtteilen 33 Tage an den letzten drei. Herausfinden, was blockiert
  (Gang zu stark, Bot verkauft dort nicht, Spots fehlen) und ob ein Spieler dort auch hängen bliebe.
