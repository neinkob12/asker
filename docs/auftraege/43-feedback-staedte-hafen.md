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
- [x] D10 Ziel „Europa“: wen man noch versorgen muss (Liste `missing`), Titel und Regel passen zusammen, zwei Hinweise.
  Erledigt: Ziel „Europa“ mit Regel als Satz, den fehlenden Kunden und Städten als Chips (bis sechs, dann „+N“) und einer Zeile „So kommst du hin“ (Ruf für neue Städte, eigene Ernte für Kunden).
- [x] D11 „Nächste Ernte“ netto nach dem Kartell-Anteil (oder beides).
- [x] D12 Karte „Angebot“ auf der Karte öffnet ein Panel mit „Angebot annehmen“ (keine Sackgasse).
- [x] D13 Finca-Panel lesbar: Leute ohne Pacht, „Als Nächstes pflanzen“, Währung an jedem Preis, Zoll-Faktor in Worten.
- [x] D14 Kartell und Behörden mit Zahlen („von 100“, Chance und Verlust ohne Anteil); stilles Zurückfallen der
  Verpackung melden.
- [x] D15 HUD „Anbau“: Ausfuhr-kg, Tage bis zur Ernte, Warnfarbe bei Behörden oder Pacht.
  Erledigt: HUD „Anbau“ (`grow.hud`): Ware im Ausfuhrlager bzw. Tage bis zur Ernte, rot bei offener Pacht, offenen Löhnen, Stillstand oder Behörden ab 45; Tipp öffnet Handel › Anbau.
- [x] D16 Europa-Ansicht am Desktop: Das Handy verdeckt Rotterdam und Marokko (Padding rechts mit dem Handy).
  Erledigt: Der Rahmen der Übersicht rechnet am Desktop die Breite des Handys ein.

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
- [x] E6 Spezialisten (Anwalt, Buchhalter, Polizei-Kontakt) der alten Stadt wirken in der neuen (`bonus`, `bonusProvider`).
  Erledigt: `bonus`/`bonusProvider`/`jailDuration` mit Stadt (ohne Angabe die aktive); Kaution, Haft, Razzia-Warnung und Rechte Hand fragen die Stadt der Person bzw. des Veedels.
- [x] E7 Leute der alten Stadt schreiben Empfehlungen in der neuen; Hintergründe mit Kölner Ortsnamen in jeder Stadt.
  Erledigt: Empfehlungen nur von Leuten der aktiven Stadt, nach dem Verkauf keine; `BACKGROUNDS` mit `{veedel}`, gefüllt fest aus Name und Zeit mit einem Veedel der Stadt.
- [x] E8 Event-Ankündigungen und Rabatt-Aktionen der alten Stadt kommen in der neuen an.
  Erledigt: Rabatt-Aktionen und Event-Ankündigungen schreiben nur für die aktive Stadt (die Aktion gilt weiter), nach dem Verkauf keine Aktionen mehr.
- [x] E9 Neue Stadt ohne sichtbaren ersten Schritt: Willkommen still, Rat „Läufer anheuern“ aus, sobald irgendwo
  jemand arbeitet, „Liegeplatz“ vor dem ersten Lager, Reviere-Ziel fest auf Köln, zu wenig sauberes Geld fürs Lager.
  Erledigt: Begrüßung nicht mehr still; Rat „Lager in <Stadt> kaufen“ bzw. „Geld waschen für ein Lager“ (fehlender Betrag); Liegeplatz-Rat erst mit Lager; Reviere-Ziel und Spielende-Statistik pro Stadt (`campaignProgress` stand ohne Stadt auf Köln). Läufer-Rat war schon pro Stadt.
- [x] E10 Sicherheitsleute schlafender Städte sammeln Erfahrung, Level-Meldungen kommen in der neuen Stadt.
  Erledigt: Erfahrung im Dienst nur in der Stadt, die live ist; Banner für Level, Verletzung und Ärger nur für Leute der aktiven Stadt.
- [x] E11 Fahrer-Zählung über Städte bei Rechter Hand und Bestellregeln (`orders.ts`, `tasks.ts`).
  Erledigt: Fahrer der aktiven Stadt in `isPortSupplierAllowed` und im Hinweis der Aufgabe „Hafen abholen“.
- [x] E12 Personal-Aufgabe der Rechten Hand läuft über Leutnants aller Städte; `replaceAbsent` prüft die Stadt nicht.
  Erledigt: Die Aufgabe „Personal“ der Rechten Hand schaut nur auf Leutnants ihrer Stadt; `staff.replace` ersetzt nur in der aktiven Stadt.
- [x] E13 Die Kasse zeigt in der neuen Stadt zuerst alle Städte (Standardfilter = aktive Stadt).
  Erledigt: Ab zwei Städten zeigt die Kasse zuerst die aktive Stadt (nach dem Verkauf alles).
- [x] E14 Quest-Belohnungen „Team-Erfahrung“ und „Loyalität“ gehen an alle Städte.
  Erledigt: „Erfahrung fürs Team“ und „Loyalität fürs Team“ gehen an die Leute der aktiven Stadt.
- [x] E15 Fest verdrahtete „Köln“-Texte in jeder Stadt (Rechte Hand, Kasse, Hafen, Reviere).
  Erledigt: Kasse („Ganz <Stadt>“ bzw. „Alle Städte“), Rechte Hand (Stadtname), Aufgabe „Nachbestellen für die ganze Stadt“; Reviere-Ziel war schon in E9.
- [x] E16 Bewerber-Pool beim Stadtwechsel nicht erneuert (Lohn und Handgeld der alten Stadt).
  Erledigt: Bewerber tragen `cityId` (Migration `recruiting` 5), Pool und Kontakte pro Stadt, einstellen nur in der aktiven Stadt; bei Ankunft oder Wechsel in eine Stadt ohne Bewerber kommen gleich `POOL_START` von dort.
- [x] E17 Lieferant begrüßt „Du bist in Berlin“ schon bei der Abfahrt (auf `city.arrived` legen).
  Erledigt: Hein, Mirko, Toni und Kofi sind mit der Stadt frei, melden sich aber erst bei der ersten Ankunft (`city.arrived`).
- [x] E18 (Designfrage) Zurück in einer übergebenen Stadt: Hinweis, dass man die Vollmacht zurücknehmen kann.
  Erledigt: Rat „<Name> führt <Stadt>“ in einer Stadt mit Statthalter: Vollmacht widerrufen auf seiner Seite (niedrige Priorität, nur ein Hinweis).

## F Hafen-Prüfer (Spieltest Rotterdam ab `deutschland`, 05.10.2026)

- [x] F1 Kritisch: Zollkontrolle im Hafen endet immer mit Totalverlust (`trade/index.ts` `startEncounter` ohne
  `playerPresent`/`staffIds` → `nobodyThere` → `failure`); in Rotterdam bist du da, anderswo Fenna als Fernhilfe oder
  `ifNobody: 'retreat'` mit Bußgeld; Erfolgstext für `setting: 'port'` („Weiter geht die Fahrt“).
  Erledigt: Bist du im Hafen (`presentCity`), stehst du selbst am Kai (`playerPresent: true`, Papiere, Ablenken, Bestechen, Aufgeben); in einem anderen Hafen reden die Hafenarbeiter mit dem Zoll (`UNATTENDED_CUSTOMS_PASS` 0,5), ohne Konfrontation. Erfolgstext ohne „Weiter geht die Fahrt“.
- [x] F2 Alte Städte fluten das Handy nach dem Verkauf: Tagesberichte der Statthalter, Empfehlungen, Lieferanten-Aktionen,
  Rang-Text, Festnahme-Banner. Nach `isBusinessSold` abstellen, alte Chats beim Verkauf als gelesen markieren.
  Erledigt: Beim Verkauf sind alle alten Chats gelesen, offene Fragen erledigt, Jansens Verkaufsanruf ruft nicht zurück. Statthalter schreiben nur bei Verlust (nach dem Verkauf nie), Stufen-Meldung, Polizei-Stufe, Kontrolle und Festnahme nur aus der aktiven Stadt; Empfehlungen und Milieu-Kontakte nach dem Verkauf aus.
- [x] F3 Doppelte Bestellungen: Erste Runde bei Ankunft plus Montag-Runde kurz danach (32 offene am ersten Morgen).
  Kein zweiter Auftrag, solange ein Kunde noch einen offenen derselben Woche hat; Fennas Montag-Text anpassen.
  Erledigt: Ein Kunde mit offener (unbeantworteter) Bestellung bestellt nicht neu; Fenna sagt am Montag, wie viele noch auf Antwort warten.
- [x] F4 Sauberes Geld als unsichtbare Sperre (Lkw 63.000, Halle, Liegeplatz, Schiff ausgegraut ohne Grund): Zeile
  „Dir fehlen … € sauber“ mit Knopf zur Geldwäsche (Jansens Reederei), Texte in `rtBuy`/`rtTruck` und Geldwäsche-Rat.
  Erledigt: Zeile „Dir fehlen … € sauber“ unter Lkw, Halle, Liegeplatz und Schiffen (`trade/ui/clean.tsx`) mit Sprung zur Geldwäsche; Rat der Geldwäsche nennt nach dem Verkauf Lkw, Halle, Liegeplatz, Schiffe und Jansens Reederei; `rtTruck` sagt, dass es sauberes Geld braucht.
- [x] F5 „Alle annehmen (9 ohne Ware)“ und Fennas „Alle“ ohne Warnung (Ruf 0,85 → 0,28): Rückfrage mit Folge und
  „Erst einkaufen“, Summe als „nur wenn alles geliefert wird“.
  Erledigt: „Alle annehmen (N ohne Ware)“ fragt nach (Nachfrist, Abschlag, Vertrauen, Ruf, Europa-Grenze) mit „Nur gedeckte“, „Erst einkaufen“, „Trotzdem“; Summe als „bis zu“; Fennas „Alle“ sagt die Folge.
- [x] F6 Lkw-Quest ehrlich (lohnt erst bei vielen Fahrten, doppelte Kontrollchance), `rtTruck` ans Ende oder optional,
  Abwägung im Liefer-Blatt.
  Erledigt: `rtTruck` ehrlich („lohnt bei vielen Fahrten, doppelt so oft kontrolliert“) und als letzter Schritt des Kapitels nach „fünfmal pünktlich“.
- [x] F7 Fristen und Folgen erklären: Fußnote aus der echten Frist, Guide mit Ankunfts-Runde, Strafe für Platzen,
  sauberes Geld, Laufzeit der Container gegen die Frist.
  Erledigt: Fußnote aus der echten Frist; Guide mit fünf Schritten (wo tippen, Ankunftsrunde, Laufzeit der Container aus den Daten, Frist, Nachfrist, Abschlag, Folgen, sauberes Geld).
- [x] F8 Gesperrte Gang-Kunden (Anteil 0 %, Rache) mit Chip und Grund oder ausblenden.
  Erledigt: `customerBlocked` (exportiert): Chip „kauft nicht bei dir“ in der Kundenliste, Satz mit Grund auf der Kunden-Seite.
- [x] F9 Europa-Karte: Karten überlappen (Rotterdam/Amsterdam/Antwerpen, Düsseldorf über Köln), Knopf „Europa“.
  Erledigt: `declutterCards` in `src/map` (Klasse `MAP_CARD`, `data-priority`): Karten, die eine wichtigere überdecken würden, werden zum Punkt (Häfen vor Kunden mit Bestellung vor dem Rest, eigene Stadt zuerst). Knopf „Übersicht“ (Globus) in der Kartensteuerung.
- [x] F10 Einkaufsliste mit Preis ab €/g und „Tage“ ausgeschrieben, alle Waren; im Panel offener Bedarf.
  Erledigt: Einkaufsliste mit „ab … €/g“ (großer Container mit Fracht), allen Waren und „Tage“ ausgeschrieben; im Einkauf-Panel offener Bedarf gegen Bestand und Container unterwegs.
- [x] F11 „Zoll X %“ heißt dreierlei: Kontrollchance, Grenzchance, Strenge. Eindeutig benennen.
  Erledigt: „Kontrolle X %“ an Lieferungen (mit Satz zur Beschlagnahme), „Grenzkontrolle X %“ bei Europa, Häfen „Zoll lasch/normal/streng“.
- [x] F12 Personal-App in Rotterdam lockt mit Bewerbern (Badge), die dort nichts tun können.
  Erledigt: Reiter Personal nach dem Verkauf aus (`hiddenWhen`), Badge zählt nur Inhaftierte der aktiven Stadt; nach dem Verkauf kommen keine Bewerber mehr.
- [x] F13 Gegenangebot: „du bleibst vorn“ hervorheben, Vertrag „Fester Preis“, Konkurrenz erklären.
  Erledigt: Gegenangebot-Stufen ohne Doppelte, Stufen mit Verlust an die Konkurrenz rot; Vertrag „Fester Preis aus dem Abnahmevertrag“; Satz zur Preisgrenze und zur Konkurrenz (alte Lieferanten).
- [x] F14 Großrazzia der alten Stadt im Dynamic Island (`police/ui/island.ts` ohne Stadtfilter); beim Verkauf leeren.
  Erledigt: Island zeigt die Großrazzia nur in der aktiven Stadt; beim Verkauf fallen geplante Razzien weg; eine wartende Großrazzia einer schlafenden Stadt blockiert die aktive Stadt nicht mehr.
- [x] F15 „Alle ausliefern (Spedition)“; Lkw-Stufe im Plan nur mit Lkw; Verträge vor Gangs bei der Deckung.
  Erledigt: „Alle mit Ware ausliefern (Spedition)“ in „Zu liefern“; Plan-Stufe „Lkw“ erst mit eigenem Lkw; Verträge zuerst bei der Deckung (`orderCoverage`).
- [x] F16 Waren-Leiste bei Jansen abgeschnitten (ab 4 Waren `Select`).
  Erledigt: Ab vier Waren eine Auswahl (`Select`) statt Reitern.
- [x] F17 Tippfehler „lange genug genug“ (`NextStageGroup`).
  Erledigt: Tippfehler behoben.
- [x] F18 Köln-Reste in der Suche (Spots, Veedel) und Texten (Kasse, Geldwäsche) nach dem Verkauf.
  Erledigt: Suche nur mit Spots und Veedeln der aktiven Stadt, Polizei-Eintrag nach dem Verkauf aus, Kasse-Untertitel ohne Veedel/Spot/Leutnant.
- [x] F19 Test-Spielstände `hafen`/`hafen-europa` neu erzeugen, „Ankunft in Rotterdam“ vor dem ersten Bot-Zug.
  Erledigt: Alle Test-Spielstände neu gebaut (`npm run saves:build`); „hafen“ ist der Moment der Ankunft in Rotterdam, vor dem ersten Bot-Zug.
- [x] F20 App „Kunden“ heißt besser „Handel“ (Reiter „Kunden“ bleibt).
  Erledigt: App heißt „Handel“ (Titel, Quest-Hinweise, Texte), der Reiter „Kunden“ bleibt.

## G Zweiter Prüfer (Neustart in Hamburg, Stichproben Berlin und München, 05.10.2026)

- [x] G1 Kritisch: Die Kölner Rechte Hand fährt Hamburger Aufträge aus, sobald Köln aktiv ist (`hierarchy/tasks.ts`
  `handleOrders` nimmt Aufträge aller Städte, `customers.acceptOrder` mit `by: 'rightHand'` prüft die Stadt nicht).
  Erledigt: `rightHandDriver(state, cityId)` nimmt die Rechte Hand der Stadt des Auftrags; `handleOrders` nur Aufträge ihrer Stadt; `customers.acceptOrder` mit `by: 'rightHand'` lehnt ohne Rechte Hand dort ab.
- [x] G2 Hafen-Chats des Kölner Hafens mit Antworten in Hamburg, wenn das Kölner Lager voll ist (`receiveCargo` sendet
  nach `collectSleeping` = false die normale Frage).
  Erledigt: `receiveCargo` fragt für eine schlafende Stadt nie; passt die Ware nicht ins Lager, wartet sie still am Kai (Journal).
- [x] G3 Fragen aus der alten Stadt (z.B. Rotterdam-Lieferproblem für Köln) im Rat „Nächster Schritt“, in der Island
  und als Banner (`core.answer`, `core.deadlines` ohne Stadtfilter).
  Erledigt: Bei jeder Ankunft erledigen sich offene Fragen der verlassenen Stadt (außer Angeboten der Städte), der Verlauf gilt als gelesen.
- [x] G4 Kasse in Hamburg: „Pro Leutnant“, Filter-Auswahl und Karte „Kundschaft“ mit Köln (`filterTargets`,
  `PerLieutenant`, Stammkunden); `getSpots(state)` ohne Stadt liefert alle Städte.
  Erledigt: `filterTargets` und „Pro Leutnant“ nach Stadt; Stammkunden in der Karte „Kundschaft“ nur der aktiven Stadt, Gesamtzahlen als „alle Städte“ beschriftet.
- [x] G5 Quest-Karten: „Spot freischalten“ tut nichts (kein aktiver Spot), „Lager kaufen“ öffnet „Lager Ehrenfeld“.
  Erledigt: „Spot freischalten“ fliegt zum ersten sperrbaren Spot der Stadt, „Lager kaufen“ ohne Lager öffnet die Lager-App.
- [x] G6 Rat für „Spot freischalten“ und „Ware bestellen“ fehlt; `hhOrder` zählt nur Bestellungen nach dem Start.
  Erledigt: Bestell-Quests zählen auch Lieferungen, die schon unterwegs sind (`orderedFor`); Rat „Ersten Spot freischalten“; der Nachbestell-Rat schaut nur auf Lager und Ware der aktiven Stadt.
- [x] G7 Hafen-Seite „Zuletzt“ zeigt Kölner Fahrten (`getLogisticsLog` ohne Stadt), Text abgeschnitten.
  Erledigt: „Zuletzt“ nur mit Fahrten in die aktive Stadt, Ziel als Titel, Fahrer und Zeit darunter.
- [x] G8 Markt-Kasten auf der Lager-Seite zeigt Kölner Veedel (`hotSpots` ohne Stadt).
  Erledigt: Markt-Kasten nur mit Veedeln der aktiven Stadt.
- [x] G9 Nachrichten der alten Stadt beim Umzug: gelesen markieren (wie beim Verkauf).
  Erledigt: siehe G3.
- [x] G10 Verlauf mit Kölner Journal-Einträgen; Geldwäsche bucht in die aktive Stadt statt in die Stadt des Beginns.
  Erledigt: Geldwäsche bucht in die Stadt, in der sie begann (`LaunderingBatch.cityId`); Lieferungen anderer Städte stehen mit Stadtname im Verlauf.
- [x] G11 „Kölsch“ in Geschichten anderer Städte, „Der Elbphilharmonie-Plaza“; Frau Krämer (Nachbarin) in jeder Stadt.
  Erledigt: Bier statt Kölsch in den Geschichten, „Heute Abend steht am Spot keiner: {spot}“; Nachbarin pro Stadt (Petersen, Schulze, Huber, Becker).
- [x] G12 Kleinigkeiten: App „Handel“ in der Suche vor dem Verkauf, Suche findet eigene Lager nicht, Seite Rechte Hand
  ohne Hinweis, HUD-Kacheln am Handy abgeschnitten.
  Erledigt: App „Handel“ vor dem Verkauf aus (`hiddenWhen`), eigene Lager in der Suche, Seite Rechte Hand sagt, wie man eine ernennt, HUD-Kacheln am Handy höchstens drei pro Reihe.

## H Dritter Prüfer (Hafen-Phase nach den Fixes, 06.10.2026)

- [x] H1 „Ware da“ und „Alle mit Ware ausliefern“ falsch: `missingFor` prüft jede Bestellung allein gegen den Bestand,
  `ready` zählt schon Teile; „Ware da“ bei neuen Bestellungen schon mit Container auf See.
  Erledigt: `deliveryReadiness` verteilt den Bestand der Häfen auf die angenommenen Bestellungen (Verträge zuerst, dann
  nach Frist), „Alle mit Ware ausliefern“ nimmt nur ganz gedeckte, neue Bestellungen zeigen „Ware da“ nur für Ware in
  der Halle, sonst „kommt rechtzeitig“ bzw. „fehlt“.
- [x] H2 Stille Verluste: verfallene Bestellungen (486.000 €) ohne Meldung, Ende des Abnahmevertrags ohne Hinweis,
  Rat ohne Frist.
  Erledigt: Fenna schreibt, was verfallen ist (Kunden, Wert), und eine Woche vor dem Ende des Abnahmevertrags sowie am
  Ende (`contractEndsAt`, `CONTRACT_WARN_DAYS`); Kunden-Seite „Vertrag bis …“, Gruppe „Alte Organisationen“ mit Frist,
  der Rat „Bestellungen warten“ nennt die Antwortfrist. Test in `trade/plans.test.ts`.
- [x] H3 Nach dem Verkauf läuft die alte Stadt während der Fahrt nach Rotterdam live (Dialoge, Banner).
  Erledigt: `sellBusiness` schaltet sofort auf Rotterdam (`switchCity`), du fährst noch hin, aber die alte Stadt ist
  nicht mehr live. Test in `trade/onboarding.test.ts`.
- [x] H4 „Diese Woche: reicht“ zählt Container, die nach der Frist ankommen; Einkauf ohne Warnung zur Frist.
  Erledigt: „Diese Woche“ und der Rat „fehlt“ zählen nur Container bis zur Frist (Rest als „nach der Frist“), der
  Einkauf zeigt Ankunft mit Uhrzeit und warnt, wenn Bestellungen vorher fällig sind.
- [x] H5 Fenna-Gruppe klappt beim ersten Tipp zu; teuerster Produzent (Jansens Netz) als Standard; „1 Tage“.
  Erledigt: Gruppe nur beim Öffnen aufgeklappt; `bestProducer` nimmt den günstigsten, der bis zur Frist ankommt
  (Nachkauf: den günstigsten), Auswahl mit Preis pro kg und „1 Tag“.
- [x] H6 Fenna liefert Teile aus (eine Fahrt pro Posten, je Grundfracht).
  Erledigt: Fenna liefert nach `deliveryReadiness` nur ganze Bestellungen, Teile erst 24 Stunden vor der Frist
  (`PARTIAL_DELIVERY_BEFORE`), Test in `trade/plans.test.ts`.
- [x] H7 Einkauf: keine Hallen-Warnung, gesperrter Knopf ohne Grund (Schwarzgeld), Mindestmenge 20 kg ohne Hinweis.
  Erledigt: Zeile „Platz in der Halle“ (mit allem, was unterwegs ist), „Dir fehlen … Schwarzgeld“ bzw. „passt nicht
  aufs Schiff“ unter dem Knopf, Hinweis, wenn nur ein Teil der Kiste gebraucht wird.
- [x] H8 Kasse in Rotterdam: Pro Leutnant, Kundschaft, Pro Spot aus der Stadt-Phase.
  Erledigt: Nach dem Verkauf keine Abschnitte Pro Spot, Pro Leutnant, Löhne, Kundschaft und Stammabnehmer.
- [x] H9 Köln-Reste: Nachrichten-Liste, „Alle Quests“ mit alten Kapiteln und Wochenverträgen, Geldwäsche-Wege,
  Wetter „über Köln“, Polizei-Stufe, Einstellung „Anfragen“.
  Erledigt: `messages.archive` legt beim Verkauf alle Chats eingeklappt unter „Frühere Städte“ ab (Jansen und Fenna
  oben); Quest-Seite zeigt nach dem Verkauf die Hafen-Kapitel, Deutschland eingeklappt, keine Wochenverträge;
  Geldwäsche ohne gesperrte Wege aus den Veedeln, Text für den Hafen; Wetter nennt die Stadt; keine Polizei-Stufe und
  keine Bewerber mehr nach dem Verkauf; „Anfragen“ in den Einstellungen ausgeblendet (`hiddenWhen` für Slots).
- [x] H10 Banner „Container angekommen“ nennt den ganzen Container, nicht was ins Lager passte.
  Erledigt: `trade.containerArrived` trägt `stored`, ein Banner sagt „X im Lager, Y warten am Kai“.
- [x] H11 Frist in „Zu liefern“ ohne Uhrzeit.
  Erledigt: „bis Di 06:00“ wie bei den neuen Bestellungen.
- [x] H12 Karte: Hafen-Kachel hinter den Knöpfen, Rotterdam-Karte unter der Quest-Karte, Auto-Marker bleibt sichtbar.
  Erledigt: Kamera in Rotterdam mittig auf dem Liegeplatz, Übersicht mit Platz links für Geld und Quest,
  `.city-car[hidden]`, Karten mit Text über den Fahrzeugen.
- [x] H13 Handy: HUD-Pillen der Hafen-Phase je eine Zeile, Namen und Auswahl abgeschnitten.
  Erledigt: drei Kacheln pro Reihe auch ohne Karte, breite Bausteine bleiben in der Gruppe, Segment mit Zahl breiter,
  „Anteil“ statt „Marktanteil“, Organisationen in der Liste nur mit Stadt.
- [x] H14 Kleinigkeiten: doppelter Titel im Journal, Reiter „Aufträge“, Konkurrenz beim Vertrag, Guide „5 bis 9 Tage“.
  Erledigt: kein doppelter Titel, Quest-Hinweis im Anbau nennt „Aufträge“, unter Vertrag keine Konkurrenz, Guide mit
  allen Wegen (1 Tag per Lkw), ein Gegenangebot, das immer verliert, als eine Zeile statt drei.
- [x] H15 Kein Ziel zwischen Lkw-Quest und Anbau-Anruf.
  Erledigt: Quest „Mach dir einen Namen“ (Umsatz bis zum Anruf, `HARBOR_NAME_REVENUE`), Migration 6 der Quests.

## I Prüfer „Produktion und Europa“ (Sonnet-Agent, `hafen-europa` bis Rang Produzent, 06.10.2026)

- [x] I1 Quest „Verschiffe deine eigene Ware“ kommt bei der Ernte, die Ware trocknet aber noch 9–12 Tage; HUD „Anbau“
  zeigt dann „Ernte in 42 T.“ statt „trocknet“.
  Erledigt: „Bring die erste Ernte ins Ausfuhrlager“ zählt erst verpackte Ware (`stats.packed`); `batchStoredAt` sagt,
  wann sie im Ausfuhrlager liegt (Finca-Seite, HUD „im Lager in N T.“).
- [x] I2 Ein dringendes Banner pro Container (Charter mit 4 Containern = 4 Banner), dazu zwei Banner beim Rang.
  Erledigt: ein Banner pro Hafen und Schritt („4 Container …“, „Eigene Ernte angekommen …“, `own`/`productId` am
  Ereignis); das Ziel-Banner von grow steht nur im Verlauf, das Rang-Banner bleibt.
- [x] I3 Ziel „Europa“: Nenner springt (7, 21, 10, 24), Chips nennen alte Organisationen, Banner sagt „alle Kunden“, die
  Regel verlangt die Hälfte.
  Erledigt: `europeProgress` liefert `cities` (fester Nenner) und `customers` (letzte vier Wochen) getrennt, zwei Zeilen
  in den Zielen, Banner nennt die Hälfte.
- [x] I4 Nach Rang „Produzent“ kein Ziel Richtung „Europa“ (keine Quest, kein Rat), nach „Europa“ kein Abschluss.
  Erledigt: Quests „Werde Produzent“ und „Versorge ganz Europa“ am Ende des Kapitels Produktion, mit Abschlusstext.
- [x] I5 Mobil abgeschnitten: Hafen-Kacheln „Contai…“, „Aufgefl…“, „Zoll schaut rein (je Contain…“.
  Erledigt: „Gekauft“, „Erwischt“, „Zollrisiko je Container“.
- [x] I6 „Grenze an der Grenze am Walserberg“ auf den Kundenseiten der Europa-Städte.
  Erledigt: Chip „Zoll an der Grenze am Walserberg“.
- [x] I7 Verschiffen eigener Ernte: Standard 50-kg-Container bei 10 kg, Hallen-Hinweis rechnet den ganzen Container.
  Erledigt: kleinster Container, in den alles passt; Hallen-Hinweis mit der echten Menge.
- [x] I8 Einkauf „Im Hafen oder unterwegs“ zählt Container nach der Frist mit.
  Erledigt: „Bis zur Frist im Hafen“ zählt nur Container, die vor der frühesten Frist ankommen.
- [x] I9 Wetter füllt das Journal (21 von 60 Einträgen), Ernte und Verpacken fallen raus.
  Erledigt: nach dem Verkauf kein Wetter im Journal.
- [x] I10 „Aufträge“/„Bestellungen“ gemischt, Entwicklernotiz „(vorher „Bestellungen“)“ im Quest-Hinweis.
  Erledigt: Der Reiter heißt immer „Aufträge“, Quests und Fenna sagen dasselbe.
- [x] I11 Kleinigkeiten: Zoll-Heat durch die Menge im Kauf nicht erklärt; Region-Seite doppelt, wenn alles gepachtet;
  eingeklappter Punkt liegt auf dem Text der Rotterdam-Karte; keine Rückmeldung bei „Verschiffen“/„Ablegen“; eigenes
  Schiff gegen Charter nicht gegenübergestellt; Angebote im Anbau-Reiter weit unten; Lkw-Nummern mit Lücken.
  Erledigt: Einkauf nennt den Zoll-Anstieg (`customsHeatForArrival`) und das Linienschiff zum Vergleich; Journal beim
  Kauf/Verschiffen, danach öffnet der Hafen; Gruppe „Land“ fällt weg, wenn alles vergeben ist; Angebote stehen oben,
  solange keine Region offen ist; Karten mit Text liegen über eingeklappten Punkten (H12). Lkw-Nummern bleiben fest
  (Journal und Fahrten nennen sie), Lücken nach Verlust sind gewollt.

## J Prüfer „Anfang“ (Sonnet-Agent, Neustart Köln, `koeln-anfang`, `koeln-veedel`, `ankunft-hamburg`, 06.10.2026)

- [x] J1 Handy-HUD abgeschnitten: „Ruf · Reviere“ (0/12 über dem Rand), Lager „215 g Gras + 4 weitere“.
  Erledigt: Text und Zusatz bleiben in der Kachel und enden mit „…“, die Ruf-Leiste gibt nach, Lager „+3“.
- [x] J2 Quest-Fortschritt geht verloren: Ereignisse in der Startminute der Quest zählen nicht; „Bestell Ware“ und
  „Läufer anheuern“ zählen Vorheriges nicht (Köln ohne `measure`).
  Erledigt: Die Sperre hängt an `fresh` bis zum eigenen `quest.started` (Migration 7); „Bestell Ware“ und „Läufer anheuern“ zählen auch Vorheriges.
- [x] J3 Doppelter Punkt „6 Std. 15 Min..“ in Lieferanten-Texten.
  Erledigt: `fillText` setzt hinter einen Wert mit Punkt keinen zweiten, `withPeriod` im Kern; Tests füllen alle Vorlagen.
- [x] J4 Falscher Artikel „am Uni-Wiese“, „am Neusser Straße“ (Spot-Name mit festem „am“).
  Erledigt: `spots/places.ts` (`atSpot`, `atSpotStart`, `spotVars`, Feld `Spot.at`), alle festen „am“ und rund 110 Vorlagen umgestellt.
- [x] J5 Dringend-Banner schneidet den Ort ab („2 Kunden warten am E…“).
  Erledigt: Ort zuerst („Uni-Wiese: 2 Kunden warten“), bis zu zwei Zeilen.
- [x] J6 Intro: „Sieben davon, und Köln gehört dir“ (Köln komplett erst mit 12).
  Erledigt: Sieben Veedel machen dich zum Boss von Köln, alle zwölf gehören dir.
- [x] J7 Polizei-Stufe im Handy: Bedingungen abgeschnitten.
  Erledigt: Bedingung als Titel, Stand als Chips darunter.
- [x] J8 Chat-Leiste kürzt „Der Holländer“ zu „Der“.
  Erledigt: Nur Personen aufs erste Wort, sonst ganzer Name mit „…“.
- [x] J9 „Rechte Hand: Rechte Hand hat zugesagt: …“ doppelt in der Chatvorschau.
  Erledigt: „Ich komm vorbei.“ ohne Absender im Text.
- [x] J10 Neu eingestellter Läufer steht „ohne Einsatz“ herum, kein Rat, keine Spot-Wahl nach dem Einstellen.
  Erledigt: Spot-Wahl beim Einstellen eines Läufers, Rat „X an einen Spot stellen“, Preisunterschied erklärt.
- [x] J11 Lager-App in neuer Stadt: „Zu kaufen“ unter Warenfluss und Fahrzeugen; Kauf ohne Rückfrage.
  Erledigt: „Zu kaufen“ oben ohne Lager in der Stadt, Kauf mit Rückfrage.
- [x] J12 Hinführen der Fahrer-Quest landet auf „Hafen“ statt beim Anheuern.
  Erledigt: Die Fahrer-Quest führt ins Personal.
- [x] J13 „Logistik-App“ in Texten, die es nicht gibt.
  Erledigt: „Lieferanten-App, unter Logistik den Hafen“ bzw. „Personal-App“.
- [x] J14 In einer neuen Stadt: Chats der alten Stadt oben, offene Rückfrage von Jansen zu einer Kölner Lieferung.
  Erledigt: Bei jeder Ankunft liegen die Chats bis dahin unter „Vor der Fahrt nach …“, offen bleiben nur Fragen mit `city.`-Befehl.
- [x] J15 Kleinigkeiten: „1 Tage“ bei der Rechten Hand, Wochenverträge schon am ersten Montag, „Preise 90 %“ ohne
  Erklärung.
  Erledigt: `formatDays` im Kern, Wochenverträge erst nach Kapitel 1 (`CONTRACTS_FROM_CHAPTER`, Bot setzt einmal einen Preis), „Was heißen Preise und Andrang?“ am Spot.

## Neue Funde

- [x] N0 (Spieler, 05.10.2026) „Man kann im Hafen in Rotterdam keine Ware bestellen, es steht sogar, dass es keinen
  Hafen gäbe“: Die alte Hafen-Seite (`logistics.port`, auch über den Anker auf der Karte) zeigte in Rotterdam den
  Kölner Niehler Hafen mit „Liegeplatz mieten“, die Lieferanten-App war leer. Beide führen jetzt nach dem Verkauf in
  die Kunden-App, Bereich Hafen (Einkauf im Ausland); der Rat „Ware ist alle“ schweigt nach dem Verkauf.

- [x] N1 Lieferanten schreiben nach dem Umzug weiter Chats über Lieferungen in die alte Stadt („Freie Bahn. Bin früher
  da.“). Lieferungen für eine Stadt mit Statthalter still oder als Bericht des Statthalters.
  Erledigt: `tellAbout`/`shipmentHere` in suppliers: Verspätung, Beschlagnahme, schlechte Ware und „früher da“ schreiben nur für Lieferungen in die aktive Stadt (sonst nur Journal), Rückfragen mit Frist nur dort.
- [x] N2 Peters Quest-Leiste zeigt nach dem Umzug alte Kölner Quests (z.B. „Setz einen eigenen Preis“), wenn sie in
  Köln liegen geblieben sind; beim Umzug in eine neue Stadt sollte ihr Kapitel vorgehen.
  Erledigt: `followCity` im Quest-Tick: Bist du in einer Stadt mit eigenem Kapitel und die aktive Quest gehört woanders hin, macht Peter mit dem Kapitel der Stadt weiter; Liegengebliebenes aus Köln gilt als übersprungen.
- [x] N3 Bot, Seed 4: Hamburg hängt nach neun Stadtteilen 33 Tage an den letzten drei. Herausfinden, was blockiert
  (Gang zu stark, Bot verkauft dort nicht, Spots fehlen) und ob ein Spieler dort auch hängen bliebe.
  Erledigt: Nicht mehr nachzustellen (Seed 4: Hamburg nach 9–10 Tagen komplett, Seeds 1 und 2 nach 6 bzw. 5). Dabei gefunden: Ware am Kai einer schlafenden Stadt wurde jede Stunde gegen ein volles Lager versucht und zählte jedes Mal als abgewiesen (94 % statt 2 %); der Bot baute deshalb Regale in der aktiven Stadt. `collectSleeping` versucht es nur noch mit Platz, Test in `logistics/sleeping.test.ts`.
