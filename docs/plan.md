# Plan: Der Bogen vom Kleindealer zum Produzenten

Stand: 04.10.2026. Grundlage: die Ideensammlung [`docs/ideen.md`](ideen.md) und die Fragerunde dazu (Entscheidungen
unten). Dieses Dokument ist der Plan, nach dem die nächsten Aufträge geschnitten werden; die Ideensammlung bleibt als
Katalog mit allem, was verworfen wurde und warum. Was hier das Konzept ändert, muss nach der Abnahme noch nach
[`docs/konzept.md`](konzept.md) (Abschnitt „Offene Punkte“ am Ende).

## Entscheidungen vom 04.10.2026

| Thema | Entscheidung |
| --- | --- |
| Richtung | Tycoon vor Drama. Es bleiben die Mechaniken, die über alle Städte skalieren (Markt, Kapazität, Fahrzeuge, Hafen, Warenfluss, Verträge, Leute). Alles, was pro Stadt Drama oder Verwaltung aufbaut, fällt weg. Jede Stadt muss übersichtlich bleiben, weil man schnell expandiert. |
| Städte | Fünf: Köln als Einstieg, dann Hamburg, Berlin, München und vielleicht Frankfurt. Die Reihenfolge nach Köln ist frei. Jede Stadt wird komplett übernommen und an die Rechte Hand übergeben, die damit Statthalter wird. |
| Tempo | Spätere Städte werden kürzer, vor allem weil man mit mehr Geld ankommt. |
| Schlafende Städte | Laufen über den Statthalter weiter. Hin und wieder ein kleines Minus durch eine Razzia, nichts Schlimmes, kein Zurückrufen. |
| Nach Deutschland | Das Geschäft wird für eine feste Summe verkauft (Formel offen). Danach bist du Lieferant am Hafen in den Niederlanden: große Mengen, Zoll, Logistik. Lieferant für alle: die eigenen Organisationen, Gangs, fremde Städte. |
| Danach | Anrufe aus Südamerika, eigene Produktion, der Preis wird immer besser. Offenes Ende; Ziel ist, ganz Europa aus eigener Produktion zu versorgen. |
| Polizei | Keine Akte. Heat und Stufen bleiben wie heute. Der Zoll ist der Gegner der Hafen-Phase. |
| Ränge | Keine Perks für den Spieler. Die Ränge des Spielers sind die Stufen des Bogens. Im Personal zwei neue Titel: Capo und Statthalter. |
| Rechte Hand | Gibt Rat, hat keine eigene Haltung, verrät nicht. |
| Länge | Fünfzehn bis fünfundzwanzig Stunden für den ganzen Bogen sind in Ordnung. |

## Der Bogen

```
Phase 1  Stadt-Schleife   Köln ──► Hamburg · Berlin · München · Frankfurt   (Reihenfolge frei, jede kürzer)
                          je Stadt: ankommen · Lager · Spots · Leute · Leutnants · Capo · Rechte Hand · komplett · Statthalter
Phase 2  Deutschland      alle Städte komplett ──► „Boss von Deutschland“ ──► Verkauf des Geschäfts
Phase 3  Hafen            Rotterdam: Lieferant für alle ──► Kunden, Beschaffung, Schiffe, Container, Zoll, Konkurrenz
Phase 4  Produktion       Kolumbien und Marokko: Fincas, Ernte, Verschiffung ──► ganz Europa aus eigener Produktion
```

**Ränge des Spielers** (Titel im HUD und in der Bestenliste, keine Boni): Kleindealer, Händler, Großhändler (die drei
Stufen der Polizei gibt es schon), Boss von Köln (Meilenstein, gibt es), Boss von <Stadt> je komplette Stadt, Boss von
Deutschland, Importeur, Produzent.

## Phase 1: Die Stadt-Schleife

### Was bleibt

Der Ablauf einer Stadt ist der heutige: ankommen, Lager kaufen, Spots freischalten, selbst verkaufen, Läufer, Leutnants
mit bis zu drei Spots, Rechte Hand mit Aufgaben, Gangs zurückdrängen, alle Veedel, Übergabe. Ebenso Heat und
Polizei-Stufen, Lieferanten mit Vertrauen, Stadt-Events, Kneipen, Wetter und das Handy. Nichts davon wird tiefer, es
wird besser lesbar und schneller.

### Was spätere Städte kürzer macht

- **Geld.** Du kommst mit allem, was du hast, und jede Statthalter-Stadt zahlt dir täglich ihren Anteil. Der Anteil des
  Statthalters (`FULL_POWER_SHARE`, heute 80 %) ist die Stellschraube, mit der das Tempo der späteren Städte eingestellt
  wird.
- **Startpaket bei der Übergabe.** Im Übergabe-Dialog wählst du, was mitkommt: ein Capo als neue Rechte Hand (behält
  Level, Erfahrung und freigeschaltete Aufgaben), bis zu fünf Leute (`staff.relocate` gibt es), die Fahrzeuge, die du
  willst. Das Vertrauen der Lieferanten bleibt (gibt es), und die Statthalter-Städte können die neue Stadt über Routen mit
  Fahrplan beliefern (gibt es).
- **Richtwerte** (mit dem Bot gemessen, `simulateHamburg` in `balance.test.ts` wird zu „nächste Stadt“ verallgemeinert):
  Köln 22–27 Tage wie heute, Hamburg 15, dritte Stadt 12, vierte 10, fünfte 8.
- **Nichts Neues lernen.** Jede Stadt hat genau einen Dreh, und der steht auf einer Seite in der Stadt-Karte der
  Deutschland-Ansicht.

### Reihenfolge frei

- Nach „<Stadt> komplett“ ruft nicht mehr ein fester Hafenarbeiter an. Die Deutschland-Ansicht zeigt die noch freien
  Städte als Glas-Karten mit Dreh und Kontakt. Die Kontakte melden sich der Reihe nach per Handy (die nächstgelegene
  Stadt zuerst), und ein Tipp auf eine Karte löst den Anruf dieser Stadt aus. Der Rest läuft wie heute: Anruf, Vollmacht
  prüfen, Übergabe, Fahrt. `NEXT_CITY` wird eine Liste, `city.answerOffer` bekommt die Stadt.
- **Autobahn-Netz.** Statt nur der A1 ein Graph aus Linien zwischen den fünf Städten (A1 Köln–Hamburg, A3 Köln–Frankfurt,
  A3/A9 Frankfurt–München, A2/A24 Hamburg–Berlin, A9 Berlin–München, A7 Hamburg–Frankfurt), erzeugt mit
  `build-roads.py --autobahn`. `interCityRoute(a, b)` routet über den Graphen, auch über eine Stadt hinweg. Die
  Deutschland-Ansicht zeigt alle Linien, laufende Fahrten in Gold.

### Der Dreh jeder Stadt

| Stadt | Dreh | Daten |
| --- | --- | --- |
| Köln | Klüngel, Karneval, Kneipen, Studenten | fertig |
| Hamburg | Hafen mit großen Containern, Zoll, Reeperbahn, Polizei eine Stufe härter | fertig |
| Berlin | Die Nacht: Clubs rund um die Uhr, Nachfrage nachts und am Wochenende, viele Spots, starke Gangs, Polizei locker | Schablone steht, Inhalt fehlt |
| München | Teuer und streng: hohe Kaufkraft, teure Lager und Löhne, Polizei startet eine Stufe härter, Oktoberfest als Event | neu |
| Frankfurt | Geld und Flughafen: Banker-Kundschaft, Bahnhofsviertel als Brennpunkt, ein Lieferant über den Flughafen (klein, schnell, teuer, Zoll scharf), Geldwäsche mit mehr Kapazität | neu, vielleicht |

Jeder Dreh ist eine Zeile Daten in `CITIES` plus Events in `events/config.ts`, kein Sonderfall im Ablauf.

### Statthalter und schlafende Städte

- **Statthalter** ist der Titel der Rechten Hand nach der Übergabe: keine neue Person, nur ein Rang mit Gesicht auf der
  Deutschland-Ansicht und dem Bericht aus der Stadt, den es schon gibt.
- **Schlafen** läuft wie heute (Schnitt der letzten sieben live gespielten Tage mal 0,85 bis 1,15). Neu: an etwa drei von
  hundert Tagen eine Razzia in der schlafenden Stadt, das Tagesergebnis halbiert sich oder wird leicht negativ, der
  Statthalter schreibt eine Zeile dazu. Keine Veedel gehen verloren, niemand ruft dich zurück.

### Capo

Ein Leutnant ab Level 5 mit drei Spots kann Capo werden. Er führt bis zu drei Leutnants in benachbarten Veedeln, also
einen Bezirk: Ausfälle, Nachschub über die Bestellregeln seiner Leutnants, Sicherheit bei Gang-Druck im Bezirk. Die
Rechte Hand spricht nur noch mit Capos, der Personal-Baum bekommt eine Ebene. Ab etwa acht Leutnants in einer Stadt
braucht man ihn, und ein Capo ist die fertige Rechte Hand für die nächste Stadt. Lohnanspruch doppelt so hoch wie ein
Leutnant mit drei Spots. Alternativer Name: Veedelsboss.

## Phase 2: Boss von Deutschland und der Verkauf

- **Auslöser:** alle spielbaren Städte komplett (ist Frankfurt nicht gebaut, zählen vier). Titel, Banner, Bestenliste.
- **Der Anruf** kommt von Jansen aus Rotterdam, den der Spieler als Lieferanten kennt: „Ich hör auf. Mein Liegeplatz,
  meine Leute, meine Kunden. Aber das kostet.“ Gleichzeitig bieten die Statthalter an, dich auszuzahlen.
- **Vorschlag für die Summe (offen):** Verkaufspreis = 90 Tagesgewinne aller Städte (Kasse, Schnitt der letzten sieben
  Tage). Rotterdam kostet drei Viertel davon. Der Rest ist das Startkapital der Hafen-Phase. Das ist der Reset wie bei
  Köln nach Hamburg: Geld ja, Besitz nein.
- **Abnahmevertrag:** Die fünf Organisationen bestellen in den ersten vier Wochen garantierte Mengen zu fairem Preis, damit
  die neue Phase nicht mit leeren Büchern beginnt.
- **Nach dem Verkauf** sind die Städte nicht mehr deine: keine Kasse, keine Vollmacht, keine Statthalter-Berichte. Sie
  sind Kunden mit Vertrauen, das hoch beginnt. Geld bleibt ein Konto mit Schwarz und Sauber; Liegeplätze, Schiffe und
  Lkw sind legal und kosten sauberes Geld, die Geldwäsche bekommt höhere Obergrenzen (Jansens Reederei als vierter Weg).

## Phase 3: Hafen, Lieferant für alle

### Die Schleife einer Woche

1. **Montag kommen die Bestellungen.** Eine Kunden-App ersetzt die Lieferanten-App: wer, was, wie viel, Preisgrenze,
   Frist, Risiko. Du nimmst an, lehnst ab oder bietest einen anderen Preis.
2. **Beschaffung.** Du kaufst bei Produzenten im Ausland (Marokko für Hasch, Spanien und Albanien für Gras, später
   Kolumbien), jeder mit Preis, Qualität, Lieferzeit per Schiff und Zollrisiko nach Herkunft, oder teurer und schnell aus
   Jansens altem Netz.
3. **Ankunft im Hafen.** Container in Rotterdam, Antwerpen oder Hamburg. Jeder Container hat eine Zollkontrolle mit
   Chance aus Menge, Herkunft, Deckladung (Blumen, Bananen, Fliesen) und dem Zoll-Heat des Hafens.
4. **Auslieferung.** Lkw über das Autobahn-Netz zu den Kunden, mit Fahrplan-Routen und Autobahn-Zoll, die es schon gibt.
   Zahlung bei Ankunft, Vertrauen und Zuverlässigkeit steigen oder fallen.

### Kunden

- **Die eigenen Organisationen:** zuverlässige Zahler, große Mengen, erwarten Pünktlichkeit und Qualität, zahlen den
  Index-Preis.
- **Gangs:** zahlen ein Fünftel mehr, aber Deals können kippen (Konfrontation), und sie erinnern sich an alles aus
  Phase 1. Die Hafenkolonne, die du in Köln verpfiffen hast, kauft nicht bei dir, bis die Erinnerung verblasst ist.
- **Fremde Städte** als Nachfrage-Punkte ohne eigene Karte: Düsseldorf, Dortmund, Bremen, Hannover, Leipzig, Stuttgart,
  Nürnberg; später Europa: Amsterdam, Brüssel, Paris, Kopenhagen, Wien, Zürich, Mailand. Jeder mit Wochenbedarf,
  Preisgrenze, Vertrauen und Konkurrenz.

### Konkurrenz und Preis

Toni, Hein, Mirko und Daan sind jetzt Konkurrenten mit Preis, Qualität und Zuverlässigkeit. Jeder Kunde kauft beim
besten Angebot; dein Anteil pro Kunde steht in der Kunden-App. Du setzt deinen Preis um den Marktindex, der aus Phase 1
weiterläuft. Zuverlässigkeit (pünktlich geliefert) und Qualität sind dein Ruf als Lieferant, genau die Werte, die die
Lieferanten heute haben, nur von der anderen Seite.

### Zoll als Gegner

Jeder Hafen hat einen Zoll-Heat wie ein Veedel: Menge treibt ihn hoch, Zeit kühlt ihn ab. Ein aufgeflogener Container
ist ein großer Verlust und treibt den Heat weiter. Die Kernentscheidung ist dieselbe wie bei den Lagern in Phase 1:
verteilen auf mehrere Häfen und kleinere Container, oder billiger in einem großen und alles riskieren. Die Zollkontrolle
ist eine Konfrontation nach dem neuen System (Papiere, Bestechung, Ablenken, Ladung aufgeben).

### Gerät und Karte

- **Schiffe:** gechartert pro Container oder eigene (Küstenmotorschiff, Frachter) mit Kapazität. **Lkw-Flotte** wie die
  Fahrzeuge aus Phase 1, nur größer. **Lager am Hafen** mit Kapazität und Ausbau.
- **Europa-Ansicht:** die Deutschland-Ansicht wächst: Häfen, Seewege (Nordsee gibt es aus Overture, Atlantik und
  Mittelmeer kommen mit `build-water.py` dazu), das Autobahn-Netz, fremde Städte als Glas-Karten, Schiffe und Lkw
  unterwegs.

### Was aus Phase 1 weiterlebt

Der Marktindex, die Qualität als Nachfrage-Treiber, das Stammabnehmer-Modell, der Warenfluss, die Konfrontationen,
Leute mit Geschichte (Fahrer, Hafenarbeiter, ein Disponent als Spezialist), die Wochenverträge als Bestellungen.

## Phase 4: Produktion

- **Auslöser:** einige Wochen als Lieferant mit genug Volumen, dann ein Anruf aus Kolumbien und einer aus Marokko: Du
  kennst die Produzenten, sie laden dich ein.
- **Fincas:** kaufen oder pachten mit sauberem Geld, Hektar, Arbeiter und Gärtner, Genetik als Qualität, Ernte alle sechzig
  Tage im Freien oder alle dreißig im Gewächshaus, Trocknen, Pressen für Hasch, Verpacken (gute Tarnung senkt das
  Zollrisiko), Verschiffung aus Cartagena oder Tanger mit drei bis vier Wochen Laufzeit. Das verlangt Planung: Was in
  acht Wochen in Berlin ankommen soll, wird heute gepflanzt.
- **Vor Ort:** ein lokales Kartell als Partner, dem man einen Anteil zahlt oder nicht (dann Verluste an der Finca), und eine
  Aufmerksamkeit der Behörden pro Region wie ein Heat. Kein neues Drama, zwei Zahlen.
- **Der Preis wird immer besser:** eigene Ware kostet ein Viertel des Einkaufs. Mehr Fincas, bessere Genetik, eigene
  Schiffe. Edibles, Vapes und Öl brauchen ein Labor in den Niederlanden als Verarbeitung (offen, siehe unten).
- **Ende:** offen. Meilenstein „Produzent“, sobald die Hälfte deiner Lieferungen aus eigener Produktion stammt, Titel
  „Europa“, sobald jeder Kunde auf der Europa-Karte aus eigener Produktion versorgt wird. Beides in der Bestenliste.

## Mechaniken, die bleiben

Kurzfassung mit den Anpassungen aus der Fragerunde. Details in [`docs/ideen.md`](ideen.md).

| Mechanik | Anpassung | Phasen | Auftrag |
| --- | --- | --- | --- |
| Markt in Bewegung (A1) | Mild: Index zwischen 0,85 und 1,2, langsame Drift, Rabatt-Aktionen eines Lieferanten über drei bis fünf Tage, ein bis zwei Schocks pro Stadt, Marktbericht am Montag | 1, 3, 4 | 32 |
| Qualität treibt Nachfrage (statt A2) | Die Nachfrage an einem Spot folgt der Qualität der letzten Verkäufe: Premium ein Viertel mehr, Dreck ein Drittel weniger, als Chip am Spot; keine Trends, kein Produkt-Ruf | 1, 3 | 32 |
| Warenfluss-Übersicht (C3) | wie beschrieben, dazu die Karten-Ebene Lieferwege | alle | 32 |
| Wochenverträge (H1) | wie beschrieben; in Phase 3 werden sie zur Bestell-Schleife | 1, 3 | 32 |
| Lager mit Kapazität und Ausbau (C1) | Kapazität, Regale als Ausbau, Tresor, Tarnung; keine Kamera, kein Klima | 1, 3 | 33 |
| Fahrzeuge (C2) | Roller, Kombi, Transporter, später Lkw: feste Ladung, festes Tempo, fester Zollfaktor pro Modell; kein Alter, keine Kennzeichen, keine Werkstatt | 1, 3 | 33 |
| Routenwahl (C4) | Autobahn, Landstraße, nachts | 1, 3 | 33 |
| Hafen-Ausbau (C5) | Liegeplatz-Stufen, ganze und geteilte Container, Schiffs-Tracker; kein Zollbeamter | 1, 3 | 33 |
| Stammabnehmer (A4) | wie beschrieben; wird in Phase 3 zum Kunden-Modell | 1, 3 | 34 |
| Gangs mit Gedächtnis (D1) | wie beschrieben, mit Beziehungen untereinander und Gang-Kriegen | 1, 3 | 34 |
| Leute mit Geschichte (G1) | wie beschrieben | alle | 34 |
| Rechte Hand als Ratgeber (statt G3) | Rat im Tagesbericht und in Konfrontationen, keine Haltung, kein Verrat | alle | 34, 35 |
| Capo und Statthalter | wie oben | 1, 2 | 34, 36 |
| Konfrontationen neu (statt D3) | sieben Bausteine, nächster Abschnitt | alle | 35 |
| Anbau (B1) | als Produktion im Ausland, ganz am Ende | 4 | 42 |

## Konfrontationen neu

Prinzip: Zeig dem Spieler, was als Nächstes passiert, und lass ihn darauf antworten. Alles passt in den heutigen
Akte-Dialog.

1. **Absicht sichtbar.** Jede Runde ein Chip, was die Gegenseite vorhat („Sie gehen auf die Kasse“, „Der Anführer will
   reden“, „Einer zieht ein Messer“). Die Handlung antwortet darauf.
2. **Zwei Zeiger statt einer Chance.** Aggression und Bereitschaft zu gehen, je 0 bis 100. Drohen, Anbieten, Bluffen und
   Hinhalten verschieben beide, der Dialog zeigt vor dem Tippen, um wie viel. Über 70 Aggression beginnt die Schlägerei,
   unter 30 Bereitschaft ziehen sie mit dem Angebot ab. Der Würfel entscheidet nur die Stärke.
3. **Die Polizei-Uhr.** „Streife in 4 Runden“ aus Polizeipräsenz und Heat. Läuft sie ab, verlieren beide Seiten. Hinhalten
   wird eine Taktik, „Bullen rufen“ stellt die Uhr auf eins.
4. **Wer geht hin, mit welchem Zug.** Bis zu drei Leute, jede mit einem Spezialzug aus Rolle und Eigenschaft, einmal pro
   Konfrontation: Türsteher blockt einen Treffer, Fahrer mit Auto macht die Flucht sicher, Charismatiker bekommt eine
   zweite Verhandlung, der Flinke bringt die halbe Ware ab Runde eins in Sicherheit.
5. **Mehrere Einsätze.** Ware, Kasse, Leute, Spot und Lärm stehen getrennt auf dem Spiel; pro Runde schützt man eins. Das
   Ergebnis ist eine Mischung auf einer Karte statt Sieg oder Niederlage.
6. **Gegner mit Rollen, ohne Namen.** Anführer, Nervöser, Schläger. Den Anführer einschüchtern schickt alle weg, den
   Nervösen ansprechen nimmt einen raus.
7. **Rat der Rechten Hand.** Sie kommentiert die Optionen aus ihren Werten.

Vorbilder: Into the Breach und Slay the Spire (sichtbare Absicht), Griftlands (Verhandlung als Kampf), King of Dragon
Pass (Berater). Die Zollkontrolle in Phase 3 nutzt dasselbe System mit eigenen Handlungen (Papiere, Bestechung, Ablenken,
Ladung aufgeben).

## Aufträge

```
23  Mehr Leben in Köln (geplant; die Fuhrpark-Etappe geht in 33)        ─┐  parallel möglich
32  Markt und Warenfluss                                                 ─┘
               │
33  Lager, Fahrzeuge, Hafen
               │
34  Leute und Gegner
               │
35  Konfrontationen neu
               │
36  Deutschland: Reihenfolge frei, Autobahn-Netz, Statthalter, Startpaket, Ränge, kürzere Städte
               │
37  Berlin (Inhalt)        ─┐
38  München (Inhalt)        ├  parallel, reine Daten nach der Checkliste in docs/architektur.md, Abschnitt „Städte“
39  Frankfurt (Inhalt)     ─┘  optional
               │
40  Boss von Deutschland, Verkauf, Hafen-Phase: Kunden, Konkurrenz, Zoll-Heat, Europa-Ansicht
               │
41  Schiffe, Container, Häfen, Europa-Kunden
               │
42  Produktion: Fincas, Kette, Kartell, Ziel Europa
```

Warum diese Reihenfolge: Die Stadt-Schleife wird fünfmal gespielt, also kommen ihre Verbesserungen zuerst (32 bis 35).
36 vor den Inhalts-Städten, damit jede Stadt ein reiner Daten-Auftrag ist. 40 bis 42 bauen auf allem davor auf.

### 32 · Markt und Warenfluss

- Preisindex pro Produkt und Stadt in `market`, mild, mit Rückkehr zur Mitte; `suppliers.packagePrice` liest ihn.
- Rabatt-Aktionen und ein bis zwei Schocks pro Stadt als Marktereignisse in `events` (Art ohne Gebiet), Marktbericht
  am Montag per Handy.
- Qualität der letzten Verkäufe als Nachfrage-Faktor pro Spot in `customers`, Chip am Spot.
- Seite „Warenfluss“ in der Lager-App, Karten-Ebene Lieferwege.
- Wochenverträge in `quests` als zweiter Typ mit Wahl aus drei und Frist, Karte unter der Quest.
- Messen: Umsatz und Tage bis Köln komplett wie bisher, dazu neu „Entscheidungen pro Spielstunde“ (Befehle des Spielers
  mit echter Wahl) im Bot und im Playthrough.

### 33 · Lager, Fahrzeuge, Hafen

- Kapazität pro Lager in Gramm (`UNIT_WEIGHT_GRAMS`), `goods.store` prüft, volle Lager lehnen ab; Ausbau Regale, Tresor,
  Tarnung mit sauberem Geld.
- Modul `fleet` nach Auftrag 23, Etappe 6, mit festen Werten pro Modell; Fahrten nehmen ein freies Fahrzeug, ohne
  Fahrzeug das Privatauto des Fahrers wie heute.
- Routenwahl pro Fahrt und als Einstellung der Fahrplan-Routen; `roadRoute` mit Gewicht pro Straßenart.
- Liegeplatz-Stufen, ganze und geteilte Container, Tracker in der Lieferanten-App.

### 34 · Leute und Gegner

- Eigenschaften, Beziehungen und Ereignisse in `staff` mit Abklingzeiten, Text-Helfer aus Auftrag 23.
- Erinnerungen mit Verfall und Beziehungen untereinander in `gangs`, Gang-Kriege als Vorstöße gegen andere Gangs.
- Dealer mit Vertrauen in `customers`, Exklusivität und Zwischenhändler.
- Rat der Rechten Hand im Tagesbericht; Capo in `hierarchy` mit Migration des Personal-Baums.

### 35 · Konfrontationen neu

- Engine in `encounters` um Absicht, zwei Zeiger, Polizei-Uhr, Crew-Wahl mit Spezialzug, mehrere Einsätze und
  Gegner-Rollen erweitern; alte Anlässe auf das neue System umziehen, Zollkontrolle als Anlass vorbereiten.
- Akte-Dialog über der Karte mit Zeigern, Chips und Wirkungs-Vorschau pro Handlung; Rat der Rechten Hand.
- Messen: 300 Überfälle ausgewürfelt wie in Auftrag 24, Erfolg, Rückzug, Verletzte vorher und nachher.

### 36 · Deutschland

- `NEXT_CITY` wird eine Liste, Angebote pro Stadt mit eigenem Kontakt, Deutschland-Ansicht mit Glas-Karten und Dreh.
- Autobahn-Graph, `interCityRoute` über Knoten, Fahrten und Routen zwischen allen Städten.
- Statthalter als Titel, Razzia im Schlaf, Startpaket im Übergabe-Dialog, Ränge des Spielers, Titel in der Bestenliste.
- Bot: spielt Städte in freier Reihenfolge, Bericht „Tage pro Stadt“ für alle Städte.

### 37 bis 39 · Berlin, München, Frankfurt

Je ein Daten-Auftrag nach der Checkliste in `docs/architektur.md`, Abschnitt „Städte“: Eintrag in `CITIES`, zwölf
Stadtteile mit Grenzen, Spots (`check-roads` muss bestehen), Lager, vier Gangs mit Stil, Straßennetz, Autobahn-Linien,
Events, Lieferanten-`cities`, Wahrzeichen, Kamera. Dazu der Dreh als Daten.

### 40 · Boss von Deutschland, Verkauf und Hafen-Rahmen

- Auslöser und Titel, Anruf von Jansen, Verkauf mit Formel und Abnahmevertrag, Städte werden Kunden.
- Modul `trade` (Kunden, Bestellungen, Preisgrenzen, Vertrauen, Konkurrenz, Zuverlässigkeit) und Kunden-App.
- Zoll-Heat pro Hafen, Zollkontrolle als Konfrontation.
- Europa-Ansicht mit Häfen und fremden Städten als Glas-Karten.

### 41 · Schiffe, Container, Häfen, Europa-Kunden

- Produzenten im Ausland als Lieferanten mit Schiffsweg, Seewege aus Overture für Atlantik und Mittelmeer.
- Gecharterte und eigene Schiffe, Container mit Deckladung, Antwerpen und Hamburg als weitere Häfen.
- Europäische Städte als Kunden, Lkw-Flotte und Routen über das Netz.

### 42 · Produktion

- Modul `grow` mit Fincas, Arbeitern, Genetik, Ernte, Trocknen, Pressen, Verpacken, Verschiffung mit Laufzeit.
- Kartell-Anteil und Aufmerksamkeit der Behörden pro Region als zwei Zahlen.
- Meilensteine „Produzent“ und „Europa“, Bestenliste, offenes Ende.

## Was raus ist

Ware altert, Statthalter der Gangs mit Gesicht, Information als Ressource, Korruptionsnetz, die Akte, Perks,
Charakter-Erstellung, Besitz und Immobilien, Tarnfirmen, Rückblick und Erfolge, Figuren-Bögen, Rechte Hand mit eigener
Haltung, Szenarien und Tages-Seed, Druck im Spätspiel, Zeitung, Daten-Ebenen, Wochenbilanz (gibt es in der Kasse),
asynchroner Freundeskreis. Begründungen und Details bleiben in [`docs/ideen.md`](ideen.md), falls eines davon später
doch gebraucht wird.

## Offene Punkte

1. **Verkaufsformel.** Vorschlag oben (90 Tagesgewinne, Rotterdam kostet drei Viertel). Entscheidung steht aus.
2. **Frankfurt** ja oder nein. Bis dahin gilt: vier Städte, Frankfurt optional.
3. **Fremde Städte** in Deutschland und Europa: Vorschlag oben, Liste darf kleiner sein.
4. **Edibles, Vapes und Öl** im Ausland: Vorschlag ein Labor in den Niederlanden als Verarbeitung in Phase 4, oder weiter
   zukaufen.
5. **Stellschrauben** für das Tempo der späteren Städte: Statthalter-Anteil, Startpaket, Startgeld. Werden mit dem Bot
   eingestellt, nicht geraten.
6. **Konzept nachziehen:** Nach der Abnahme dieses Plans gehören die Entscheidungen oben nach `docs/konzept.md`
   (Abschnitte „Spielgefühl“, „Welt“, „Mehrere Städte“, „Noch nicht umgesetzt“), und `docs/auftraege/README.md` bekommt
   die Aufträge 32 bis 42 als Zeilen.
