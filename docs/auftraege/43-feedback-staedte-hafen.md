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
- [ ] C5 Versorgung planbar: Lieferplan pro Kunde (Dauerauftrag): Die Disponentin liefert jede Bestellung dieses
  Kunden selbst aus, sobald die Ware im Hafen liegt (Lkw oder Spedition nach Wahl), und kauft auf Wunsch nach einer
  Regel nach. Übersicht „Diese Woche“: Bedarf, Bestand, unterwegs, fehlt.
- [ ] C6 Großkunden mit eigener Seite: Bedarf pro Woche, Anteil, Konkurrenz, Vertrauen, Pünktlichkeit, Preisgrenze,
  letzte Bestellungen; antippbar in der Liste und auf der Europa-Karte.
- [x] C7 Lkw dort kaufen, wo man ihn braucht (Kunden-App, Hafen › Fahrzeuge); das Liefer-Blatt weist darauf hin.
- [ ] C8 HUD und Handy nach dem Verkauf: Zoll-Heat statt Veedel-Heat, leere Apps (Reviere, Gangs, Lieferanten) aus dem
  Raster oder mit einem Satz, warum.
- [ ] C9 „Dein Preis“ ehrlich beschriften (er verschiebt den Anteil, nicht den Preis pro Gramm) oder wirklich wirken
  lassen.
- [ ] C10 Banner für Dringendes in der Hafen-Phase: Container angekommen, Zollkontrolle, Bestellung läuft ab.
- [ ] C11 Gegenangebot zeigt vorher, ob man damit vor der Konkurrenz liegt; Europa-Kunden nennen die Pünktlichkeit als
  Zahl.

## D. Produktion

- [ ] D1 Einleitung für den Anbau wie C1 (Anruf aus Kolumbien bzw. Marokko → Finca → Ernte → Ausfuhr → Schiff).
- [ ] D2 Zwischenziel bis zum Anruf: zeigen, ab wann die Produzenten anrufen (Wochen und Umsatz).

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
