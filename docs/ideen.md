# Köln Tycoon – Was dem Spiel noch fehlt

Stand: 04.10.2026, nach Auftrag 31. Grundlage: `docs/konzept.md`, `docs/architektur.md`, die Aufträge 0–31, der
geplante Auftrag 23 und die `config.ts` aller Module. Dieses Dokument ist eine Ideensammlung, keine Entscheidung:
Es ordnet ein, wo das Spiel im Vergleich zu den großen Tycoon-, Simulations- und Logistikspielen steht, und
schlägt vor, was als Nächstes den größten Unterschied macht. Jede Idee nennt ihr Vorbild, warum sie zu Köln Tycoon
passt, wo sie im Code andockt und wie groß sie ist (S = Tage, M = eine Session wie Auftrag 27, L = ein Auftrag wie 30).

> **Stand nach der Fragerunde vom 04.10.2026:** Dieses Dokument bleibt der Katalog. Entschieden ist: Tycoon vor Drama,
> fünf Städte in freier Reihenfolge, danach Verkauf des Geschäfts, Lieferant am Hafen für alle, zuletzt eigene Produktion mit
> dem Ziel ganz Europa. **Drin:** A1 (mild), Qualität treibt Nachfrage (statt A2), A4, C1, C2 (ohne Alter und Kennzeichen),
> C3, C4, C5, D1, Konfrontationen neu (statt D3), G1, Rechte Hand als Ratgeber (statt G3), Capo und Statthalter, H1, B1 ganz
> am Ende als Produktion im Ausland. **Raus:** A3, D2, D4, E1, E2, F1 bis F5, G2, H2, H3, I1 bis I3, J1. Der Plan dazu, mit
> Phasen und Aufträgen 32 bis 42: [`docs/plan.md`](plan.md).

## Kurzfassung: die zehn Ideen mit der größten Wirkung

| # | Idee | Was sie dem Spiel gibt | Aufwand |
| --- | --- | --- | --- |
| 1 | [Markt in Bewegung](#a1--markt-in-bewegung-preisindex-zyklen-schocks): Preisindex, Zyklen, Schocks, Marktbericht | Kaufen und Verkaufen wird zur Entscheidung, nicht zur Routine | M |
| 2 | [Ränge und Perks des Bosses](#f1--ränge-und-perks-des-bosses): sechs Ränge, pro Rang ein Perk aus drei | Jeder Durchgang bekommt eine eigene Handschrift | S–M |
| 3 | [Die Akte](#e1--die-akte-ermittlungen-statt-nur-heat): Ermittlungen, die langsam gegen dich wachsen | Die Polizei wird zum Gegenspieler, ohne das Spiel härter zu machen | M–L |
| 4 | [Gegner mit Gesicht](#d2--namhafte-gegenspieler-nemesis-light): benannte Statthalter der Gangs mit Porträt | Ein Veedel nehmen heißt, jemanden besiegen | M |
| 5 | [Gangs mit Gedächtnis](#d1--gangs-mit-gedächtnis-und-beziehungsgeflecht) und Beziehungen untereinander | Diplomatie bekommt Folgen, Gang-Kriege werden spielbar | M |
| 6 | [Eigener Anbau](#b1--eigener-anbau-als-produktionskette) als Produktionskette | Das fehlende Tycoon-Standbein: produzieren statt nur handeln | L |
| 7 | [Lager als Einrichtung](#c1--lager-als-einrichtung-kapazität-sicherheit-tarnung) mit Kapazität, Sicherheit, Tarnung | Logistik bekommt Engpässe und damit ein Puzzle | M |
| 8 | [Besitz als Aufstieg](#f3--besitz-und-immobilien-als-sichtbarer-aufstieg): Wohnung, Auto, Statussymbole | Sauberes Geld bekommt ein Ziel, der Aufstieg wird sichtbar | S–M |
| 9 | [Zeitung „Express“](#i1--die-zeitung-express-als-newsfeed) als Newsfeed aus der Simulation | Die Welt wird lesbar, alles Geschehen bekommt einen Ort | S |
| 10 | [Wochenverträge](#h1--wochenverträge-eins-aus-drei) und [Szenarien mit Tages-Seed](#h2--szenarien-startlagen-und-tages-seed) | Ziele zwischen Peters Kette und dem Endlosmodus, Wiederspielwert | S–M |

Vorschlag für die Reihenfolge als Aufträge: Abschnitt [5](#5-vorschlag-für-die-nächsten-aufträge).

## 1. Wo das Spiel heute steht

Köln Tycoon hat etwas, das die meisten Tycoons nicht haben: eine **echte Stadt**. Echte Veedel-Grenzen, ein
Straßennetz aus OpenStreetMap, Fahrzeuge, die wirklich über die Venloer fahren, der Rhein ab Rotterdam, Hamburg als
zweite Stadt mit eigener A1-Fahrt. Dazu eine Simulation, die tiefer ist als bei vielen kommerziellen Spielen dieses
Genres: Leutnants mit Bestellregeln, eine Rechte Hand mit sechs Aufgaben und Stufen, eine Kasse als echte Bilanz pro
Spot und Leutnant, Haft mit Stillhaltegeld, eine Polizei, deren Härte an der Größe des Geschäfts hängt. Das Handy
als Schaltzentrale, Figuren mit Gesicht und Stimme, der deterministische Kern mit Bot und Balancing-Bericht: Das
Fundament ist ungewöhnlich solide.

Was auffällt, wenn man das Spiel neben Transport Fever, Anno, RimWorld, Cartel Tycoon oder Empire of Sin legt: Die
**Systeme** sind stark, die **Entscheidungen des Spielers** sind vergleichsweise dünn. Der Spieler kauft, heuert an,
beantwortet Nachrichten und wartet. Vieles, was im Konzept als Versprechen steht (vom Kleindealer zum Boss, Besitz,
Rang-Stufen, eigener Charakter, Tarnfirmen, Anbau), ist noch nicht da. Und die Welt reagiert zwar, aber sie
**erinnert sich nicht** und **erzählt nicht**: Gangs ohne Gedächtnis, Polizei ohne Akte, Leute ohne Geschichte.

## 2. Die Diagnose: sieben Lücken aus Sicht der großen Tycoons

1. **Zu wenig interessante Entscheidungen.** Sid Meiers Satz „ein Spiel ist eine Reihe interessanter
   Entscheidungen“ trifft die Lücke. Preise sind heute fast immer „Richtpreis“, Lieferanten wählt man nach
   Freischaltung, Spots nach Lage. Es fehlen Entscheidungen mit Abwägung und Nachwirkung: Jetzt kaufen oder auf den
   Preis warten? Schnell über die Autobahn oder unauffällig über Land? Den Statthalter bestechen oder ausschalten?
2. **Der Markt steht still.** Sieben Produkte mit festen Grundpreisen, der Richtwert schwankt nur um ±25 % mit dem
   Druck am Spot. Dope Wars lebt seit 1984 allein davon, dass Preise sich bewegen. Ohne Bewegung gibt es keinen
   Grund für Vorrat, Timing oder Spekulation, und damit auch keinen Grund für mehr Lager.
3. **Kein eigenes Produkt.** Jeder große Tycoon hat eine Produktionskette (Anno, Factorio, Transport Fever,
   Capitalism). Köln Tycoon kauft und verkauft nur. Der im Konzept angekündigte Anbau ist das fehlende Standbein.
4. **Logistik ist ein Vorgang, kein Puzzle.** Fahrten haben keine Kapazität, Lager keine Grenze, Fahrzeuge keinen
   Besitz. Es gibt nichts zu optimieren. Transport Tycoon ist genau das Gegenteil: Kapazität, Alter, Auslastung,
   Gewinn pro Linie.
5. **Gegner ohne Gesicht und Gedächtnis.** Vier Gangs mit Stil in den Daten, aber gleichen Texten und gleichem
   Verhalten (Auftrag 23 plant Stimmen und Methoden). Kein Gang erinnert sich, dass du sie verpfiffen hast. Es gibt
   keine benannten Gegner, obwohl das Porträt-System (`personLook`, `Face`) jedem Namen ein Gesicht geben könnte.
6. **Risiko ohne Spannung.** Heat ist bewusst Würze, nicht Kern. Aber ein Verbrecher-Tycoon lebt von der Frage „wie
   lange geht das gut?“. Heute gibt es nur kurzfristige Heat, die abkühlt. Nichts wächst langfristig gegen den
   Spieler; wer vorsichtig spielt, wird nie wirklich bedroht.
7. **Aufstieg ohne Bild.** Fortschritt ist eine Zahl (Veedel, Geld). Keine Ränge, keine Perks, kein Besitz, keine
   Erinnerung an den Durchgang außer dem höchsten Vermögen in der Bestenliste. Sauberes Geld hat drei Verwendungen
   (Liegeplatz, Lager, Geldwäsche-Freischaltung) und sammelt sich danach nur an.

Dazu zwei kleinere: Der **Endlosmodus** nach Köln komplett hat keinen Druck mehr, und der **Spieler selbst** hat
feste Werte (`PLAYER_STATS` in `encounters/config.ts`) ohne Entwicklung.

## 3. Ideen im Detail

### A · Markt und Ware

#### A1 · Markt in Bewegung: Preisindex, Zyklen, Schocks

**Vorbild:** Drug Wars bzw. Dope Wars (seit 1984: Preisunterschiede und Zufallsschocks sind das ganze Spiel), Offworld Trading Company (der
Markt ist das Schlachtfeld), Capitalism Lab, Patrician und Port Royale (Städte mit eigenem Preisniveau).

**Heute:** `market.referencePrice` = Grundpreis × Kaufkraft × Angebot/Nachfrage (±25 %) × Konkurrenz. Einkaufspreise
der Lieferanten sind fest (`priceLevel`, `priceFactors` pro Stadt). Es gibt keinen Grund, heute statt morgen zu kaufen.

**Idee:**
- Ein **Preisindex pro Produkt und Stadt**, der täglich driftet (deterministischer Zufallspfad mit Rückkehr zur
  Mitte, Spanne etwa 0,7–1,5) und sowohl den Richtpreis als auch die Einkaufspreise der Lieferanten skaliert.
- **Schocks** als Ereignisse mit Grund und Dauer: Großrazzia bei einer Gang (Knappheit, Preise +40 % für drei Tage),
  Ernte in den Niederlanden (Haze billig), Zoll fängt einen Container in Rotterdam ab (Gras teuer), Sommerloch,
  Semesterstart (Nachfrage), ein neues Produkt wird Mode. Etwa die Hälfte Chancen, die Hälfte Probleme (wie Auftrag 23).
- Ein **Marktbericht** einmal die Woche per Handy (Kalle aus Kalk oder ein neuer Kontakt „Marktplatz-Micha“) und ein
  Chip „Gras ↑ 12 %“ in der Lieferanten-App. Lieferanten machen **Sonderangebote** („500 g Hasch, diese Woche
  −20 %, aber ich brauch die Antwort heute“).
- Folge: Vorrat anlegen lohnt sich, kostet aber Lagerplatz und Razzia-Risiko (A3, C1). Das ist die Abwägung, die
  heute fehlt.

**Andocken:** `market` (Index im Zustand, `priceIndex(state, productId, cityId)`), `suppliers.packagePrice` liest
den Index, `events` bekommt eine zweite Art Event („Marktereignis“ ohne Gebiet), Journal und Zeitung (I1).

**Aufwand/Wirkung:** M / sehr hoch. Die Stellschraube mit dem besten Verhältnis im ganzen Dokument.

#### A2 · Trends und Produkt-Lebenszyklus

**Vorbild:** Game Dev Tycoon (Genres kommen in Mode), Two Point Hospital (Wellen von Krankheiten), Schedule I
(Kunden mit Vorlieben, die man bedienen muss).

**Heute:** Kundentypen haben feste Produktlisten (`audiences`), Anteile und Spitzenzeiten. Nichts verändert sich.

**Idee:** Pro Kundentyp ein wechselnder **Trend** (zwei Wochen „Vapes bei Partygängern“, dann „Edibles bei
Touristen“), angekündigt durch Stammkunden („Alle fragen nach Vapes, hast du welche?“). Ein **Produkt-Ruf**
getrennt vom Gesamt-Ruf: Wer gestreckte Edibles verkauft, verkauft eine Woche lang keine Edibles mehr, egal wie
gut der Rest läuft. Später neue Produkte als Belohnung (Konzentrate, Moonrocks, CBD-Linie für Banker) über Lieferanten
mit Vertrauen.

**Andocken:** `customers` (Trend im Zustand, Faktor im Spawn), `reputation` (zweite Ebene pro Produkt oder eigene
Lese-Funktion in `customers`), `goods.PRODUCTS` erweitern.

**Aufwand/Wirkung:** S–M / mittel. Gut mit A1 zusammen, allein eher Würze.

#### A3 · Ware altert

**Vorbild:** Jedes Restaurant- und Supermarkt-Tycoon (Frische), Anno 1800 (Waren verderben nicht, aber Lager sind
voll), RimWorld (Verderben ohne Kühlung).

**Idee:** Qualität sinkt im Lager langsam (Gras und Hasch trocknen aus, Haze schneller als Gras, Edibles und Vapes
halten), sichtbar als Chip „noch 9 Tage gut“. Lager-Upgrade „Klimatisiert“ (C1) stoppt das. Macht A1 ehrlich:
Vorrat hat einen Preis.

**Andocken:** `goods` (Alter pro Posten, Abzug um Mitternacht), `qualityTier` zeigt es, Leutnants bestellen nach
Regel „frische Ware zuerst“.

**Aufwand/Wirkung:** S / mittel.

#### A4 · Großhandel als eigener Kanal mit Stammabnehmern

**Vorbild:** Patrician (feste Abnehmer), Cartel Tycoon (Abnehmer mit Nachfrage und Verhandlung), Schedule I (Dealer
als Zwischenhändler, die man beliefert).

**Heute:** Fünf Dealer (`DEALERS`) fragen zufällig an, Rabatt fest, Deal kann kippen.

**Idee:** Dealer werden Figuren mit **Beziehung** wie Lieferanten: Vertrauen bringt größere Mengen, Vorkasse,
Exklusivität („Ich nehm nur noch bei dir, dafür will ich 10 % weniger“). Ein Abnehmer, den man hängen lässt, geht
zur Gang. Mit genug Vertrauen wird aus dem Dealer ein **Zwischenhändler**, der ein Veedel für dich bedient, ohne dass
du dort Spots brauchst (Einfluss ohne Präsenz, aber weniger Marge). Das ist der Großhändler-Weg im Gegensatz zum
Straßen-Weg.

**Andocken:** `customers` (Dealer als Kontakte mit `relations` wie in `suppliers`), `territory.addInfluence` für
Zwischenhändler, `finance` Kategorie `sales.wholesale` gibt es schon.

**Aufwand/Wirkung:** M / hoch, weil es einen zweiten Spielstil öffnet.

### B · Produktion

#### B1 · Eigener Anbau als Produktionskette

**Vorbild:** Anno und Factorio (Ketten mit Durchsatz), Big Pharma (Qualität aus Prozessparametern), Schedule I,
Weed Inc und Hempire (Anbau-Schleife: pflanzen, pflegen, ernten, trocknen), Cartel Tycoon (Farm → Labor → Lager).

**Heute:** Alles wird gekauft. Das Konzept nennt Anbau als „spätere Erweiterung“.

**Idee:** Eine Kette mit vier Stufen, jede ein Ausbau mit sauberem Geld (Strom, Miete und Technik sind legal):
1. **Zelt im Lager**: 2–4 Pflanzen, Ernte alle 10 Spieltage, kleine Mengen, Qualität nach Gärtner.
2. **Keller**: mehr Pflanzen, Stromverbrauch fällt auf (Heat über „Stadtwerke“, zusätzliche Ermittlungsspur in E1).
3. **Halle im Umland** (neuer Ort auf der Karte: Bergisches Land, Eifel; Landstraße, kein Veedel, eigene Fahrzeit):
   größere Mengen, Geruch (Nachbarn), Überfall-Ziel.
4. **Gewächshaus mit Tarnfirma** (Gärtnerei, F4): legal nach außen, teuer, die größte Menge.

Pro Stufe: Stecklinge vom Lieferanten (Amsterdam liefert Genetik mit Qualität), Dünger und Strom als laufende
Kosten, eine neue Rolle **Gärtner** (Werte: Vorsicht, ein neuer Wert „Hand“ für Qualität), Ernte → Trocknen (drei
Tage) → Posten im Lager mit Qualität aus Genetik × Gärtner × Pflege. Risiken: Schimmel (Verlust), Brand (Lager
weg, Heat), Stromausfall. Eigene Ware ist billiger als jeder Lieferant, aber langsam und bindet Kapital.

**Warum das hier zieht:** Es verwandelt das Spiel von „kaufen und weiterverkaufen“ in „produzieren“, gibt sauberem
Geld einen großen Zweck, bringt die Umland-Karte ins Spiel (neue Fahrten, neue Orte) und schafft mit Genetik und
Qualität einen Grund, Premium zu verkaufen (Banker, Marienburg).

**Andocken:** neues Modul `grow` (Zustand pro Anlage, `tickEvery: 60`), `goods.store` für die Ernte, `staff` neue
Rolle, `police` liest `grow.exposure(state, veedelId)`, `roads` braucht Landstraßen bis zum Umland (Overture-Ausschnitt
erweitern, `build-roads.py`), Karte: Anlage als 3D-Klotz mit Lichtschein nachts.

**Aufwand/Wirkung:** L / sehr hoch. Ein eigener Auftrag.

### C · Logistik als Puzzle

#### C1 · Lager als Einrichtung: Kapazität, Sicherheit, Tarnung

**Vorbild:** Prison Architect (Räume mit Ausstattung und Sicherheit), Transport Fever (Depots und Lager mit
Kapazität), Anno (Lagerkapazität als Engpass), Cartel Tycoon (Gebäude mit Upgrades).

**Heute:** Lager sind Punkte mit Preis ohne Grenze. Auftrag 23 hat Lager-Ausbau bewusst ausgeklammert; mit A1
(Vorrat) und B1 (Ernte) wird er nötig.

**Idee:** Jedes Lager bekommt **Kapazität** (Gramm, über `UNIT_WEIGHT_GRAMS`), **Sicherheit** (Tresor: weniger
Verlust bei Einbruch; Kamera: Einbruch wird erkannt, Täterspur; Wachhund; Wache als Sicherheits-Einsatz gibt es
schon), **Tarnung** (Deckfirma davor: weniger Razzien, Lkw fallen nicht auf) und **Klima** (A3). Ausbau mit sauberem
Geld, Miete monatlich für Hallen. Ein volles Lager verweigert die Annahme (Lieferung wartet beim Fahrer, Zoll-Risiko
am Kai steigt): Das ist der Engpass, der Logistik zum Puzzle macht.

**Andocken:** `goods` (Kapazität und Upgrades pro Lager, `store` prüft), `police.RAID_SCOPES` liest Tarnung,
`gangs` (Einbruch aus Auftrag 23) liest Sicherheit, Karte: Lager als 3D-Marker mit sichtbaren Upgrades.

**Aufwand/Wirkung:** M / hoch.

#### C2 · Fuhrpark mit Alter, Werkstatt und Kennzeichen

**Vorbild:** Transport Tycoon und OpenTTD (Fahrzeuge altern, Zuverlässigkeit sinkt, Ersatz), Euro Truck Simulator 2
(Fahrzeugkauf, Werkstatt), Transport Fever 2 (Kapazität und Tempo pro Modell).

**Heute:** Keine Fahrzeuge. Auftrag 23, Etappe 6, plant Roller, Kombi, Transporter mit Kapazität und Tarnung.

**Idee (über Auftrag 23 hinaus):** Fahrzeuge altern (Panne auf der Fahrt mit Entscheidung: warten, Abschleppen,
Ware umladen), eine **Werkstatt** (Tarnfirma, F4) repariert billiger und tauscht Kennzeichen (ein Fahrzeug, das bei
einer Kontrolle „bekannt“ wurde, zieht öfter Kontrollen, bis es neue Nummern hat). Beschlagnahmte Fahrzeuge kann
der Anwalt zurückholen. Jedes Fahrzeug hat ein Gewinn-und-Verlust-Konto in der Kasse (Transport-Tycoon-Gefühl).

**Andocken:** Modul `fleet` (von Auftrag 23), `logistics.startTrip` nimmt ein Fahrzeug, `finance` Kategorie
`vehicle.*`, Karte: unterschiedliche 3D-Modelle (`createVehicle`).

**Aufwand/Wirkung:** M / mittel bis hoch (zusammen mit C1 und A1 hoch).

#### C3 · Warenfluss-Übersicht mit Engpass-Anzeige

**Vorbild:** Factorio (Produktionsstatistik), Anno (Warenfluss pro Insel), Transport Fever (Linienübersicht mit
Auslastung), Supply-Chain-Spiele wie Rise of Industry.

**Heute:** Die Kasse zeigt Geld, nicht Ware. Ob ein Spot morgen leer läuft, sieht man nur im Spot selbst.

**Idee:** Eine Seite „Warenfluss“ in der Lager-App: pro Produkt Verbrauch pro Tag (aus `sale.completed`), Nachschub
unterwegs, Bestand, „reicht noch 2,3 Tage“, pro Spot und Lager, mit roter Zeile beim Engpass und einem Knopf „Rechte
Hand: nachbestellen“. Dazu eine Karten-Ebene **Lieferwege** (welche Spots aus welchem Lager bedient werden, Linien
in Gold). Das ist reine Lesbarkeit und macht die bestehende Logistik erst spielbar.

**Andocken:** `finance` zählt schon Mengen pro Spot (Umsatz), `goods.stockSummary`, `logistics.inTransitAmount`,
neue Seite in `goods/ui`, Ebene über `registerMapLayer`.

**Aufwand/Wirkung:** S–M / hoch für das Gefühl, das Geschäft im Griff zu haben.

#### C4 · Routenwahl pro Fahrt: schnell, unauffällig, nachts

**Vorbild:** Euro Truck Simulator 2 (Maut oder Umweg), Dope Wars (Grenzübertritt), Patrician (Konvoi oder allein).

**Idee:** Beim Start einer Fahrt mit Ware eine kleine Wahl: **Autobahn** (schnell, Zoll- und Kontrollrisiko wie
heute), **Landstraße** (länger, weniger Kontrollen, nur mit Fahrer mit Vorsicht ab 40 sinnvoll), **Nachts** (Abfahrt
wird verschoben, Risiko halbiert, Fahrer müde: am nächsten Tag langsamer). Nur drei Optionen, Standard bleibt wie
heute. Auftrag 23 hatte „Routenwahl“ ausgeklammert; als Chip in der Fahrt-Ansicht ist es klein.

**Andocken:** `roads.roadRoute` mit einem Gewicht pro Straßenart (Autobahn meiden), `logistics.CHECK_CHANCE` mal
Faktor der Wahl, Routen mit Fahrplan (`routes.ts`) bekommen die Wahl als Einstellung.

**Aufwand/Wirkung:** S–M / mittel.

#### C5 · Hafen ausbauen: Container, Zollbeamter, Liegeplatz-Stufen

**Vorbild:** Port Royale und Patrician (Hafen als Logistikzentrum), Shipping-Sims, Cartel Tycoon (Schmuggelwege).

**Idee:** Der Liegeplatz bekommt Stufen (Kai → Halle am Kai → eigener Kran: größere Mengen, kürzere Zeit am Kai).
Ganze **Container** mieten (groß, billig pro Gramm) oder **Teilcontainer** mit einem Fremden teilen (billiger,
aber wenn dessen Hälfte auffliegt, auch deine). Ein benannter **Zollbeamter** mit Beziehung (E2): bezahlt schaut er
weg, aber jede Zahlung ist eine Spur in der Akte (E1). Schiffe auf dem Rhein zeigen ihre Ladung als Tracker in der
Lieferanten-App („Rotterdam → Niehl, bei Düsseldorf, 6 Std.“).

**Andocken:** `logistics` (`berths` mit Stufe), `suppliers` (Container-Pakete), `roads.shipRoute` für den Tracker.

**Aufwand/Wirkung:** M / mittel.

### D · Gegner mit Gesicht und Gedächtnis

#### D1 · Gangs mit Gedächtnis und Beziehungsgeflecht

**Vorbild:** Crusader Kings 3 (Meinungs-Modifikatoren mit Verfall: „hat mich verraten −40, verblasst über 10
Jahre“), Empire of Sin (Beziehungen zwischen allen Bossen, nicht nur zum Spieler), Civilization (Diplomatie-Gedächtnis).

**Heute:** Eine Gang hat Feindseligkeit und Beziehung als Zahl. Auftrag 23 hat „Gedächtnis über frühere Ereignisse“
ausdrücklich auf später verschoben. Gangs haben keine Beziehung zueinander.

**Idee:**
- **Erinnerungen** als Liste pro Gang: Ereignis, Wirkung, Verfall (verpfiffen: −30 für 20 Tage; Schutzgeld
  pünktlich: +3 pro Woche; Statthalter getötet: −60 ohne Verfall; Gefallen getan: +15). Die Gangs-App zeigt sie als
  Chips („Erinnert sich: Razzia durch deinen Tipp“). Texte der Gang beziehen sich darauf.
- **Beziehungen untereinander** in `gangs/data.ts`: Die Hafenkolonne hasst die Schäl Sick, das Syndikat und der
  Marienburger Kreis dulden sich. Daraus entstehen **Gang-Kriege** ohne den Spieler (sichtbar als Vorstoß gegen
  eine andere Gang, Zeitung), in denen man Partei ergreifen kann: Infos verkaufen, Ware liefern, Spot der anderen
  hochgehen lassen. Wer eine Gang schwächt, stärkt die Nachbarin; Köln komplett heißt, am Ende gegen die Stärkste zu
  stehen, die alle anderen gefressen hat.

**Andocken:** `gangs` (Zustand `memories`, `relations` zwischen Gangs; `ai.ts` wählt Ziele danach), `territory`
(Vorstöße gegen Gangs), Zeitung (I1).

**Aufwand/Wirkung:** M / hoch. Macht die bestehende Diplomatie erst bedeutsam.

#### D2 · Namhafte Gegenspieler (Nemesis light)

**Vorbild:** Shadow of Mordor (Nemesis-System: benannte Gegner, die sich an dich erinnern und aufsteigen), XCOM 2
(die „Auserwählten“), Empire of Sin (Bosse mit Eigenheiten), Yakuza (jeder Gegner hat Namen und Gesicht).

**Heute:** Gangs haben einen Boss (Name, Stil). Die Angreifer in Konfrontationen heißen „Die Angreifer“.

**Idee:** Jede Gang hat 2–3 **Statthalter** mit Namen, Porträt (`personLook` aus dem Namen, kostet nichts), Rolle
(Eintreiber, Schläger, Buchhalter, Kopf im Veedel) und zwei Eigenschaften (brutal, gierig, feige, loyal, trinkt).
Sie tauchen in Konfrontationen namentlich auf („Murat ‚Hammer‘ führt die Angreifer“), ihre Eigenschaften ändern
die Chancen (gierig: Freikaufen billiger; feige: Einschüchtern wirkt). Ein Veedel übernimmt man, indem man seinen
Statthalter **schlägt, kauft, verpfeift oder abwirbt** (ein Überläufer bringt Infos, D4, und wird dein Leutnant mit
Vorgeschichte). Wer eine Konfrontation gegen dich gewinnt, steigt auf (mehr Stärke, Titel), wer verliert, trägt eine
Narbe (das Look-System kann das: `scar`). Stirbt ein Statthalter, rückt ein neuer nach, die Gang erinnert sich (D1).

**Andocken:** `gangs/data.ts` (Statthalter als Daten mit Seed), `encounters.startEncounter` bekommt `opponent.person`,
`messages`-Kontakte `gang:<id>:<person>`, Gangs-App zeigt die Köpfe als `<Avatar look>`.

**Aufwand/Wirkung:** M / hoch. Das billigste Mittel, um aus Druck Charaktere zu machen.

#### D3 · Konfrontationen vertiefen: Ort, Ausrüstung, Narben

**Vorbild:** Darkest Dungeon (Stress und Macken mit Folgen), XCOM (benannte Soldaten, Verletzungen mit Ausfallzeit,
Gedenkwand), Battle Brothers (Ausrüstung und Verletzungen, die bleiben).

**Heute:** Rundenbasiert mit sechs Handlungen und Werten, das funktioniert. Aber jede Konfrontation fühlt sich gleich
an, und was passiert, hinterlässt außer Verletzung und Haft keine Spur.

**Idee:** **Ort-Modifikatoren** (Nacht: Flucht leichter; Kneipe: Zeugen, Heat höher; Hafen: keine Zeugen; Regen:
Tempo runter), **Ausrüstung** für die Crew als Besitz (Weste: weniger Verletzte; Schlagstock: Stärke; Funk: Verstärkung
kommt schneller; keine Schusswaffen-Eskalation, bleibt realistisch-düster), **bleibende Folgen**: Narben und
Veilchen im Porträt (das Look-System hat beides), ein Wert „Nerven“ pro Person, der nach verlorenen Konfrontationen
sinkt (Vorsicht hoch, Stärke runter) und sich mit Ruhe erholt, eine **Gedenkwand** in der Personal-App für Gefallene.
Die Akte der Konfrontation zeigt die Beteiligten mit Gesicht.

**Andocken:** `encounters` (Modifikatoren aus `place`, Zeit, Wetter; `effects`), `staff` (Ausrüstung als Besitz,
`look`-Änderung bei Verletzung), `goods` oder neues kleines `gear`.

**Aufwand/Wirkung:** M / mittel bis hoch.

#### D4 · Information als Ressource: Gerüchte, Späher, Informanten

**Vorbild:** Prison Architect (Informanten decken Schmuggel auf), Civilization (Spionage), Crusader Kings (Intrigen),
Phantom Doctrine.

**Heute:** Die Gangs-App zeigt Stärke, Leute und Geld jeder Gang direkt.

**Idee:** Nebel: Ohne Quelle sieht man nur **Gerüchte** („stark“, „angeschlagen“). Quellen: ein **Späher** (Ausbau
aus Auftrag 23) sieht Vorstöße kommen, ein **Informant** in der Gang (Überläufer aus D2, oder ein Statthalter mit
„gierig“ für Geld) zeigt Zahlen, nächstes Ziel und den Ort ihres Lagers. Ein Lager, dessen Ort man kennt, kann man
**überfallen** (Konfrontation mit Beute) oder **verpfeifen** (statt nur „irgendeine Razzia bei der Gang“). Informanten
fliegen auf (Ereignis, Gang erinnert sich, D1).

**Andocken:** `gangs` (Sichtbarkeit pro Gang, `intel` im Zustand), `police.snitchOnGang` mit Ziel, `encounters` neuer
Anlass `warehouseRaid`.

**Aufwand/Wirkung:** M / mittel.

### E · Polizei: von der Würze zum Gegenspieler

#### E1 · Die Akte: Ermittlungen statt nur Heat

**Vorbild:** This Is the Police (Ermittlungen als Beweiskette), GTA (Fahndungsstufen, die eskalieren), Cartel Tycoon
(Druck der Behörden, bis der Capo fällt und der Nächste übernimmt), Payday 2 (Heat und Flucht), Gangsters: Organized Crime
(Anklage als Spielende).

**Heute:** Heat pro Veedel, kurzfristig, kühlt ab. Wer vorsichtig spielt, wird nie wirklich bedroht. Das Konzept will
die Polizei „leicht“, aber „wie lange geht das gut?“ ist die Spannung, die jedem Verbrecher-Tycoon den Reiz gibt.

**Idee:** Neben Heat (Wetter) eine **Akte** (Klima): ein langsam wachsender Wert mit **Beweisen** als Einträge, jeder
mit Quelle und Ziel: ein Mitarbeiter, der in Haft redet (gibt es: `talkChance`), eine aufgeflogene Ladung (Fahrzeug
bekannt), ein Zollbeamter, der gekauft wurde und auffliegt, zu viel Geld durch den Bauunternehmer, Stromverbrauch
einer Anlage (B1), ein Statthalter, der verpfiffen wurde und zurückschlägt. Die Akte kennt **Ziele**: ein Lager, ein
Leutnant, die Rechte Hand, dich. Schwellen lösen aus: **Observation** eines Spots (Kundschaft halbiert, sichtbar als
Zivilwagen auf der Karte), **Durchsuchungsbeschluss** (Razzia ohne Vorwarnung), **Haftbefehl gegen einen Leutnant**,
zuletzt **Anklage gegen dich**: Du musst abtauchen (für N Tage keine eigenen Handlungen in der Stadt, Rechte Hand
führt; passt zur Vollmacht aus Auftrag 30) oder die Akte **verschwinden lassen** (Anwalt, Kommissar aus E2, teuer).
Die Akte sinkt langsam von selbst, schneller mit Anwalt, und gar nicht, solange ein Informant der Polizei im Team
sitzt (D4 umgekehrt: Der Polizei-Kontakt kann ihn finden).

Wichtig fürs Konzept: Die Akte ist **lesbar** (Seite „Akte“ in der Personal- oder Einstellungen-App: Was wissen
sie, woher, was droht als Nächstes) und **beeinflussbar**. Sie macht das Spiel nicht härter, sondern gibt dem
vorsichtigen Spieler etwas, das er pflegen kann, und dem wilden Spieler ein Ende, das sich verdient anfühlt.

**Andocken:** `police` (Zustand `file` mit Einträgen, `tickEvery: 60`, Schwellen in `config.ts`), Ereignisse
`police.evidence`, `police.observation`, `police.indictment`; `staff.betrayed` und `logistics` liefern Beweise;
`city` für Abtauchen (wie `travel`); `outcome` bekommt kein neues Ende, Anklage ist ein Zustand, kein Game Over.

**Aufwand/Wirkung:** M–L / sehr hoch.

#### E2 · Korruptionsnetz: Beamte mit Namen, Preis und Gier

**Vorbild:** Tropico (Fraktionen bestechen), Cartel Tycoon (Politiker und Polizei kaufen, mit Risiko), Mafia-Filme
(der gekaufte Kommissar), Yakuza (Beziehungen pflegen).

**Heute:** Ein Polizei-Kontakt als Spezialist mit Bonus `raidWarning`. Freikaufen in Konfrontationen.

**Idee:** Vier benannte Beamte mit Porträt, jeder mit **Preis, Gier und Risiko**: Streifenpolizist (warnt vor
Kontrollen in einem Veedel), Kommissar (bremst die Akte, E1), Zollbeamter (Kai und A1, C5), Stadtrat (Genehmigungen
für Tarnfirmen, F4). Beziehung wächst mit Zahlungen und Gefallen, Gier steigt mit der Zeit (die Preise ziehen an), bei
Pech **fliegt einer auf**: Beweis in der Akte, Beamter weg, Heat überall. Kölscher Klüngel (`relationFactor`) wirkt
hier natürlich; Hamburg ist teurer und kühler.

**Andocken:** `police` oder neues kleines Modul `officials` (Zustand pro Beamten), `staff.bonus` liest Boni, Buchung
`expense.bribe` gibt es sinngemäß schon.

**Aufwand/Wirkung:** M / hoch zusammen mit E1.

### F · Aufstieg, Identität, Besitz

#### F1 · Ränge und Perks des Bosses

**Vorbild:** Cartel Tycoon (Capo-Fähigkeiten), Payday 2 und GTA Online (Fertigkeitsbäume), Civilization und Stellaris
(Traditionen: wenige, prägende Wahlen), Slay the Spire (Relikte, die den Lauf definieren).

**Heute:** Der Spieler hat feste Werte (`PLAYER_STATS`), keine Entwicklung, keine Wahl. Die Polizei kennt drei Stufen
des Geschäfts (`operationTier`), die Bestenliste einen Titel.

**Idee:** Sechs **Ränge** mit Titel und Schwelle aus Dingen, die es gibt (Vermögen, Veedel, Leute, Städte):
Kleindealer → Händler → Großhändler → Boss von Köln → Pate → Kartell-Partner. Jeder Rang schaltet eine
**Wahl aus drei Perks** frei (einmalig, bleibt), etwa: „Kölsche Schnauze“ (Charisma +15 in Verhandlungen),
„Buchhalter-Hirn“ (Geldwäsche-Gebühr −3 Punkte), „Straßenköter“ (Konfrontations-Bonus, wenn du selbst dabei bist),
„Unsichtbar“ (Heat pro Verkauf −10 %), „Menschenfänger“ (Loyalität steigt schneller), „Hafenratte“ (Zoll-Risiko
−25 %). Dazu heben Ränge langsam die eigenen Werte. Die Perks sind Daten (`perks.ts`), die anderen Module über eine
Lese-Funktion `playerPerk(state, 'launderingFee')` fragen.

**Warum das hier zieht:** Jeder Durchgang bekommt eine Handschrift (der Diplomat, der Schläger, der Logistiker),
die Bestenliste zeigt den Rang, und „vom Kleindealer zum Boss“ wird vom Satz im Konzept zum Spielgefühl.

**Andocken:** neues Modul `rank` (Zustand: Rang, gewählte Perks; Befehl `rank.choosePerk`; Ereignis
`rank.promoted` mit Banner und Ton), Lese-Funktionen in den Modulen, die Perks betreffen.

**Aufwand/Wirkung:** S–M / sehr hoch für den Wiederspielwert.

#### F2 · Charakter-Erstellung: Herkunft, Gesicht, Start

**Vorbild:** Mount & Blade und Crusader Kings (Herkunft bestimmt Start), Stardew Valley (Gesicht bauen), jedes RPG.

**Heute:** Name beim ersten Start (`src/ui/player.ts`). Kein Gesicht, keine Herkunft.

**Idee:** Beim Intro: **Gesicht** aus dem bestehenden Look-System wählen (Alter, Frisur, Bart, Kette; `<Avatar>`
zeigt es, der Chat zeigt dich als Blase mit Porträt), **Herkunft** mit Folgen: „Kalker Jung“ (Start-Veedel Kalk,
Schäl Sick kennt dich: Beziehung +20, Hafenkolonne −10), „Zugezogen aus Berlin“ (Mirko liefert ab Tag 1, kein
Klüngel-Bonus), „Ex-Türsteher vom Ring“ (Stärke +15, Sicherheit billiger), „Studentin aus Sülz“ (Studenten-Nachfrage,
weniger Startgeld). Herkunft = ein Start-Perk aus F1 plus ein Kontakt.

**Andocken:** `core` (Spielerprofil im `meta`), `rank` (Start-Perk), `gangs` (Startbeziehung aus Daten), Intro-Dialog.

**Aufwand/Wirkung:** S / mittel, aber es ist das erste, was ein neuer Spieler sieht.

#### F3 · Besitz und Immobilien als sichtbarer Aufstieg

**Vorbild:** GTA (Unterschlüpfe, die man kauft), Yakuza 0 (Immobilien und Clubs als Spiel im Spiel), Mafia, Cartel
Tycoon (Villa des Capos), Anno (das eigene Herrenhaus).

**Heute:** Sauberes Geld kauft Liegeplatz, Lager, Geldwäsche-Freischaltung; danach sammelt es sich nur an.
Kein Zuhause, kein Auto, nichts, das den Aufstieg zeigt.

**Idee:** **Wohnung** in vier Stufen, auf der Karte sichtbar: Hinterhofzimmer Ehrenfeld (Start) → Altbau Nippes →
Loft im Belgischen Viertel → Villa in Marienburg (direkt im Revier des Marienburger Kreises: Provokation, Beziehung
−10, Ruf +10). Wirkung: Ruf-Bonus, „Zuhause ausschlafen“ senkt deine Nerven-Last (D3), Partys (Beziehungen zu
Gangs und Beamten pflegen, E2). **Statussymbole**: ein Auto (schneller selbst fahren, aber „auffällig“: +Heat bei
Kontrollen), Uhr, Kette (Ruf, Charisma). Alles kostet sauberes Geld und ist bei einer Anklage (E1) beschlagnahmbar:
Besitz wird zum Einsatz.

**Andocken:** neues kleines Modul `estate` (Besitz als Daten, Lese-Funktionen für Boni), `leaderboard.netWorth`
zählt Besitz mit, Karte: Marker mit `addHtmlMarker`.

**Aufwand/Wirkung:** S–M / hoch für das Gefühl von Fortschritt.

#### F4 · Tarnfirmen mit eigenem Gameplay

**Vorbild:** Empire of Sin (Rackets: Bars, Kasinos mit Personal und Ausbau), Cartel Tycoon (legale Betriebe waschen
Geld und werfen selbst etwas ab), Yakuza 0 (Cabaret Club), Mafia (Fronts), Weed Inc.

**Heute:** Drei Geldwäsche-Wege als Zahlen (Gebühr, Dauer, Obergrenze). Das Konzept nennt Tarnfirmen als nächste
Stufe.

**Idee:** Aus den Wegen werden **Betriebe**, die man besitzt: Späti, Waschsalon, Shisha-Bar, Kfz-Werkstatt,
Kneipe, Gärtnerei. Jeder: legaler Umsatz (klein), Waschkapazität (statt Gebühr: je mehr Umsatz, desto mehr lässt sich
unauffällig verbuchen; zu viel Waschen über einen kleinen Laden ist ein Beweis in der Akte, E1), legales Personal
(Minijobber als neue Rolle, günstig, kein Heat), zwei Ausbaustufen. Und **Synergien** mit dem Rest: Werkstatt →
Fuhrpark billiger und Kennzeichen (C2); Kneipe → Spot-Art Kneipe mit Stammkunden (gibt es); Späti → Spot plus
kleines Lager; Shisha-Bar → Partygänger und ein Treffpunkt für Gangs (Diplomatie-Gespräche dort); Gärtnerei → Anbau
(B1). Betriebe haben Öffnungszeiten, Konkurrenz im Veedel und können Ziel von Gang-Einschüchterung werden.

**Andocken:** `laundering` wird zu `businesses` (Migration: Wege → Betriebe), `finance` Kategorien `income.legal`,
`staff` neue Rolle, `spots` (Spot an einem Betrieb), Karte: Schild am Betrieb.

**Aufwand/Wirkung:** L / hoch. Eigener Auftrag, sinnvoll nach C1 und F3.

#### F5 · Erfolge und Rückblick auf den Durchgang

**Vorbild:** Slay the Spire und Balatro (Lauf-Historie), Civilization (Hall of Fame, Replay-Karte), Steam-Erfolge,
RimWorld (Chronik).

**Heute:** Game-Over-Bildschirm mit wenigen Kennzahlen (`registerGameStat`), Bestenliste nach Vermögen.

**Idee:** Ein **Rückblick** bei Sieg und Game Over: Zeitstrahl (Veedel über Tage, Einnahmen, größte Verluste,
Konfrontationen), Karte mit Reviergewinn als Animation (die Karte kann das), „Dein Durchgang in Zahlen“ (Leute
gekommen und gegangen, Kunden bedient, Kilometer gefahren, Geld gewaschen). **Erfolge** als Liste, deterministisch
aus Ereignissen („Ohne eine Razzia bis Boss von Köln“, „Alle vier Gangs gleichzeitig im Waffenstillstand“, „1 Tonne
über die A1“), gespeichert pro Gerät, sichtbar in Einstellungen und auf der Bestenliste.

**Andocken:** `leaderboard` (Verlauf pro Tag ist fast da: `peakWorth`, `peakVeedel`), `finance.days` für den
Zeitstrahl, `journal` für Momente, Erfolge als Modul `achievements`, das auf Ereignisse hört.

**Aufwand/Wirkung:** S / mittel, aber jeder Durchgang endet damit.

### G · Figuren und Erzählung

#### G1 · Leute mit Geschichte: Eigenschaften, Beziehungen, Ereignisse

**Vorbild:** RimWorld (Hintergrund, Eigenschaften, Beziehungen, der „Geschichtenerzähler“), Crusader Kings
(Charaktere als Motor der Geschichte), Football Manager (Persönlichkeit, Moral, Unruhe im Kader), XCOM (Bindung).

**Heute:** Leute haben Namen, Alter, Hintergrund, Werte, Level, Loyalität, Porträt. Ihr Verhalten ist aber nur
Loyalität (kündigen, verraten). Sie haben keine Beziehung zueinander.

**Idee:** Zwei bis drei **Eigenschaften** pro Person (Familienvater, trinkt, spielt, ehrgeizig, Angsthase, Maulheld,
treu wie Gold), die Verhalten färben und **kleine Ereignisse** erzeugen, im Ton der Figur per Handy: „Chef, meine
Mutter braucht 800 € für die Reha. Ich zahl’s zurück“ (zahlen: Loyalität +20; ablehnen: −10; „abarbeiten“: Lohn
runter); „Yusuf hat gesoffen und den Spot stehen lassen“; „Kim will Leutnant werden, sonst geht sie zur Schäl Sick“.
**Beziehungen** zwischen Leuten (Freunde, Geschwister, Rivalen): Wer einen feuert, verliert den anderen; zwei
Rivalen am selben Spot streiten (Tempo runter); ein Paar im Team ist loyaler, bis einer sitzt. Eine **Gedenkwand**
für Gefallene (D3) im Ton „realistisch und düster“: keine Helden, nur Namen.

**Andocken:** `staff` (Eigenschaften im Profil, `routines.ts` erzeugt Ereignisse mit Abklingzeit), `recruiting`
würfelt Eigenschaften, Personal-App zeigt Chips, Text-Helfer aus Auftrag 23 für Varianten.

**Aufwand/Wirkung:** M / hoch. Das ist der RimWorld-Effekt: Spieler erzählen hinterher Geschichten über ihre Leute.

#### G2 · Figuren-Bögen statt Tutorial-Kette

**Vorbild:** Yakuza (Nebengeschichten mit wiederkehrenden Figuren), Cartel Tycoon (Story-Ereignisse mit Wahl),
GTA und Mafia (Figuren, die sich entwickeln), Disco Elysium (Figuren mit Haltung).

**Heute:** Peter schickt 26 Quests in Reihe; sie sind ein gutes Tutorial, aber kein Erzählstoff. Das Konzept will
„lockere Aufträge von Figuren mit etwas Dialog“.

**Idee:** Vier **Bögen** mit je 4–6 Momenten über die Kampagne verteilt, jeder mit einer Wahl und einer Folge, kein
verzweigter Plot: **Peter** (Mentor, der mit deinem Aufstieg kleiner wird: Hilft er, neidet er, verrät er?), der
**Polizei-Kontakt** (eigene Probleme: innere Ermittlungen, will aussteigen, braucht Geld), eine **Journalistin**
vom Express (schreibt über „den neuen Mann in Ehrenfeld“: Ruf hoch, Akte hoch; man kann sie füttern oder fürchten;
verbindet sich mit I1), ein **alter Pate im Ruhestand** in Marienburg (Rat, Kontakte, am Ende vielleicht sein Erbe
oder sein Verrat), später das **Kartell** (geplant). Momente kommen als Anruf (gibt es seit Auftrag 30, mit Stimme).

**Andocken:** `quests` (ein zweiter Strang neben Peters Kette, ausgelöst von Zustand und Ereignissen statt der Reihe
nach), `messages.call`, Kontakte mit `look` und `voice`.

**Aufwand/Wirkung:** M (vor allem Schreibarbeit) / hoch für Erinnerungswert.

#### G3 · Die Rechte Hand als Person mit Meinung

**Vorbild:** Football Manager (Co-Trainer mit Rat und Widerspruch), Crusader Kings (Rat mit eigenen Interessen),
Frostpunk (Berater, die drängen).

**Heute:** Tagesbericht, Aufgaben mit Stufen, Vollmacht. Sie ist ein hervorragendes System, aber kein Charakter.

**Idee:** Sie bekommt eine **Haltung** aus ihren Werten (vorsichtig oder gierig, loyal oder ehrgeizig) und sagt im
Tagesbericht, **was sie anders machen würde** („Ich hätte Kalk nicht angegriffen. Die Hafenkolonne vergisst das
nicht.“). Mit Vollmacht entscheidet sie nach ihrer Haltung, nicht nach deiner, und man spürt den Unterschied. Eine
ehrgeizige Rechte Hand mit Vollmacht und viel Geld kann am Ende **ihren eigenen Laden** aufmachen (Verrat als
Spätspiel-Ereignis, mit Vorwarnung über G1-Ereignisse). Das gibt der Vollmacht aus Auftrag 30 ein Risiko, das heute fehlt.

**Andocken:** `hierarchy/righthand.ts` (Haltung aus Werten), `hierarchy/fullpower.ts` (Entscheidungen gewichtet),
`staff.betrayed` neue Art.

**Aufwand/Wirkung:** S–M / mittel bis hoch.

### H · Ziele, Rhythmus, Wiederspielwert

#### H1 · Wochenverträge: eins aus drei

**Vorbild:** RollerCoaster Tycoon (Szenario-Ziele), Two Point Hospital (Sterne-Ziele pro Klinik), Game Dev Tycoon
(Auftragsarbeiten), Stardew Valley (Aufgabenbrett), Spiele mit „Daily Quests“.

**Heute:** Peters Kette (linear, Tutorial) und das Fernziel 12 Veedel. Dazwischen nichts, was eine Session rahmt.

**Idee:** Jeden Montag drei **Verträge** von Figuren, einer wird gewählt: „Liefer 300 g Haze bis Sonntag nach Deutz“
(Club-Betreiber, Geld), „Halt die Heat in Ehrenfeld eine Woche unter 30“ (Syndikat, Beziehung), „Verkauf 200 Vapes
an Partygänger“ (Lieferant, Rabatt), „Keine Verletzten in der Crew diese Woche“ (Rechte Hand, Loyalität fürs Team).
Mit der Session-Länge von 10–20 Minuten (etwa eine Spielwoche bei 2x) ist ein Vertrag genau eine Session.
Verträge nutzen Peters Mechanik (`count`, `measure`, `streak`), nur mit Wahl und Frist.

**Andocken:** `quests` (zweiter Typ `contract` mit `offeredAt`, `expiresAt`, Befehl `quests.accept`), HUD-Karte unter
der Quest.

**Aufwand/Wirkung:** S–M / hoch für den Session-Rhythmus.

#### H2 · Szenarien, Startlagen und Tages-Seed

**Vorbild:** OpenTTD und RollerCoaster Tycoon (Szenarien), Civilization (Spieloptionen beim Start), Slay the Spire
und Balatro (Tages-Lauf mit festem Seed und eigener Bestenliste), Roguelikes allgemein.

**Heute:** Normal oder Hardcore, Seed in der URL, eine Bestenliste nach Vermögen.

**Idee:** Beim Neuanfang **Startlagen** aus Daten: „Klassisch“ (heute), „Hafenratte“ (Liegeplatz ab Tag 1, kein
Geld, kein Lager), „Erbe“ (drei Spots und zwei Leutnants, aber 20.000 € Schulden bei Toni), „Hamburg zuerst“, „Polizeistaat“
(Großhändler-Härte ab Tag 1), „Friedenspflicht“ (Gangs greifen nie an, dafür Preiskrieg ×2). Und ein **Tages-Seed**: Alle
spielen am selben Tag denselben Seed, die Bestenliste hat dafür eine eigene Spalte (der Server kann das: ein zweiter
Schlüssel). Ein Freundeskreis vergleicht sich so viel direkter als über das höchste Vermögen überhaupt.

**Andocken:** `core` (Szenario im `meta`, Module lesen `state.meta.scenario` beim `init`), Startdialog,
`api/leaderboard.ts` (zweite Liste pro Tag).

**Aufwand/Wirkung:** S (meist Daten und Oberfläche) / mittel bis hoch für den Freundeskreis.

#### H3 · Spätes Spiel: Druck im Endlosmodus

**Vorbild:** Frostpunk (der große Sturm als Finale), They Are Billions (Wellen), Civilization (Spätspiel-Krisen), XCOM
(der Avatar-Countdown).

**Heute:** Nach Köln komplett ruft Hamburg; wer bleibt, hat Ruhe. Die Gangs ohne Revier holen sich nur ihr Heimat-Veedel.

**Idee:** Köln komplett löst eine **neue Lage** aus: Die geschlagenen Gangs bilden ein **Bündnis** gegen dich (ein
großer Vorstoß pro Woche, angekündigt), die Polizei gründet eine **Sonderkommission** (Akte wächst schneller, E1),
eine **neue Gang aus Düsseldorf** oder Leverkusen rückt an (Daten wie die anderen), das **Kartell** meldet sich mit
Forderungen (geplant). Jede dieser Lagen ist eine Woche mit Ziel, nicht ewig. Wer sie übersteht, hat den Endlosmodus
mit Ruhe verdient und einen Titel in der Bestenliste.

**Andocken:** `gangs` (Bündnis-Zustand), `police` (SoKo-Modus), `events` (als Stadt-Event mit Wirkung), `quests`.

**Aufwand/Wirkung:** M / mittel. Betrifft nur, wer bis zum Ende spielt, aber die bleiben dann.

### I · Lesbarkeit: Karte, Kasse, Zeitung

#### I1 · Die Zeitung „Express“ als Newsfeed

**Vorbild:** Tropico (Zeitung und Radio kommentieren dein Handeln), SimCity und Cities: Skylines (Nachrichten-Ticker
und Chirper), Democracy (Presse als Spiegel), Crusader Kings (Ereignis-Chronik).

**Heute:** Journal (nüchtern), Verlauf in den Einstellungen, Ömer vom Büdchen kündigt Events an. Das Geschehen in der
Stadt (Gang-Vorstöße, Razzien bei anderen, Preise) ist kaum sichtbar.

**Idee:** Ein **Startbildschirm-Widget** oder eine stille App „Express“: drei Schlagzeilen pro Tag, aus Ereignissen
gebaut („Razzia in Kalk: Polizei stellt 4 kg sicher“, „Schießerei am Ebertplatz, zwei Verletzte“, „Gras in Köln so
teuer wie nie“, „Karneval: Stadt rechnet mit einer Million Jecken“), mit Wirkung zurück ins Spiel: Wer in der
Zeitung steht, bekommt Ruf und Akte (E1, G2). Die Texte kommen aus Vorlagen mit Platzhaltern (Text-Helfer aus
Auftrag 23). Das ist das billigste Mittel, die reiche Simulation für den Spieler **sichtbar** zu machen.

**Andocken:** Modul `news` hört auf Ereignisse aller Module, hält die letzten 30 Schlagzeilen, Widget über
`registerSlot('phone.home')`, Seite in den Einstellungen oder eigene stille App (`hidden` nicht nötig, Begründung:
sie ersetzt den Verlauf teilweise).

**Aufwand/Wirkung:** S / hoch.

#### I2 · Daten-Ebenen auf der Karte

**Vorbild:** Cities: Skylines und SimCity (Info-Ansichten), Anno (Einflussbereiche), Transport Fever (Auslastung).

**Heute:** Reviere, Heat-Färbung, Marker, Ebenen-Menü (`registerMapLayerOption`).

**Idee:** Umschaltbare Ebenen: **Nachfrage** (wo Kunden warten und weggehen, als Wärmekarte), **Preisniveau**
(Kaufkraft × Index, A1), **Gang-Druck** (wo Vorstöße laufen, Pfeile), **Lieferwege** (C3), **Polizei** (Observation
und Kontrollen der letzten 24 Stunden). Jede Ebene liest nur und ist eine Funktion des Zustands, wie es die
Karten-Regeln vorsehen.

**Aufwand/Wirkung:** S–M / mittel, aber Tycoon-Standard.

#### I3 · Wochenbilanz als Ritual und Verläufe in der Kasse

**Vorbild:** Transport Fever und OpenTTD (Finanzgrafiken über Jahre), Football Manager (Monatsbericht des Vorstands),
jede Tycoon-Bilanz.

**Idee:** Sonntagnacht eine **Wochenbilanz** von der Rechten Hand (oder dem Buchhalter): Umsatz zur Vorwoche,
bester und schlechtester Spot, größter Verlust, ein Rat, ein Satz Haltung (G3). In der Kasse **Verläufe**: Sparkline
pro Spot und Leutnant (`finance.days` hat 30 Tage), Trendpfeile, „Was lief anders als letzte Woche“. Die
Bilanz-Logik (`explainReport`) gibt es schon; es fehlen Zeitachse und Ritual.

**Aufwand/Wirkung:** S / mittel.

### J · Multiplayer vorbereiten, ohne Multiplayer zu bauen

#### J1 · Asynchron zuerst: Geister, Rivalen, gemeinsame Seeds

**Vorbild:** Rennspiele (Geisterfahrer), Clash of Clans (asynchrone Angriffe), Civilization PBEM, Dark Souls
(Spuren anderer Spieler), Tages-Läufe in Roguelikes.

**Heute:** Bestenliste mit Vermögen. Die Architektur ist auf Server-Simulation vorbereitet, aber Echtzeit-Multiplayer
ist ein großes Projekt mit offenen Fragen (Konzept, offener Punkt 1).

**Idee:** Drei kleine Schritte, die der Freundeskreis sofort spürt: **Geister** (bei gleichem Seed zeigt die Karte,
an welchem Tag ein Freund welches Veedel genommen hat, als blasse Linie in der Revier-Ansicht; Daten: ein Verlauf
pro Durchgang auf dem Server), **Rivale** (ein Freund aus der Bestenliste wird als fünfte Gang simuliert: Name, Stärke
aus seinem Ergebnis, Porträt aus dem Namen; er „spielt“ nach dem Bot), **Tages-Seed** (H2). Alles ohne Echtzeit, ohne
Konflikte, mit dem bestehenden Server.

**Andocken:** `leaderboard` (Verlauf hochladen), `api/leaderboard.ts`, `gangs` (eine Gang aus Daten erzeugen),
`territory/ui` (Geister-Ebene).

**Aufwand/Wirkung:** S–M / mittel bis hoch für genau die Zielgruppe (Freundeskreis).

## 4. Was ich bewusst nicht vorschlage

- **Echtzeit-Multiplayer jetzt.** Die offenen Fragen (Offline-Schutz, durchlaufende Welt) sind groß, und J1 bringt dem
  Freundeskreis 80 % des Gefühls mit 10 % des Aufwands.
- **Darknet, Jahreszeiten, harte Gewalt-Eskalation (Schusswaffen).** Das Konzept hat sie verneint; die Ideen oben
  kommen ohne sie aus.
- **Noch mehr Automatik.** Die Rechte Hand kann schon fast alles. Mehr Delegation macht das Spiel leerer. Die Ideen
  oben geben dem Spieler Entscheidungen zurück, statt sie wegzunehmen.
- **Eine dritte Stadt vor den Ideen aus A–F.** Berlin als Daten ist vorbereitet, aber eine dritte Stadt ist mehr vom
  Gleichen. Mehr Tiefe in zwei Städten schlägt mehr Breite in dreien. Erst danach lohnt sich die Schablone.
- **Grind-Mechaniken** (Energie, Wartezeiten mit Echtgeld-Logik). Passt nicht zu „privat im Freundeskreis“.

## 5. Vorschlag für die nächsten Aufträge

Nach dem Muster von `docs/auftraege/README.md`: Jeder Block ist eine Session mit eigenem Prompt, Tests, Migrationen,
Bot-Anpassung und Vorher-nachher-Messung mit `npm run balance`.

```
Auftrag 23  Mehr Leben in Köln (geplant, wie beschrieben)      ─┐  parallel möglich: 23 ändert Texte, Gangs,
Auftrag 32  Markt in Bewegung  (A1, A2, A3, I1 Zeitung)        ─┘  Lieferanten, Spots; 32 ändert market, goods, news
               │  mergen
               ▼
Auftrag 33  Aufstieg  (F1 Ränge und Perks, F2 Charakter, F3 Besitz, F5 Rückblick, H1 Wochenverträge, H2 Szenarien)
               │
               ▼
Auftrag 34  Gegner mit Gesicht  (D1 Gedächtnis, D2 Statthalter, D3 Konfrontationen, D4 Information, G1 Leute mit Geschichte)
               │
               ▼
Auftrag 35  Die Akte  (E1 Ermittlungen, E2 Beamte, G2 Figuren-Bögen, G3 Rechte Hand mit Meinung, H3 Spätspiel)
               │
               ▼
Auftrag 36  Produktion und Lager  (C1 Lager, B1 Anbau, C2 Fuhrpark über 23 hinaus, C3 Warenfluss, C4 Routenwahl, C5 Hafen)
               │
               ▼
Auftrag 37  Tarnfirmen  (F4, baut auf C1, F3 und B1 auf)
Danach      J1 Asynchron, dritte Stadt, Kartell, Echtzeit-Multiplayer
```

Warum diese Reihenfolge:
- **32 vor allem anderen**, weil ein bewegter Markt jede spätere Idee (Lager, Anbau, Verträge, Zeitung) wertvoller
  macht und für sich allein das Verhältnis von Aufwand zu Wirkung am besten ist.
- **33 früh**, weil Ränge, Perks und Besitz jedes Probespielen im Freundeskreis sofort besser machen und wenig
  Simulation brauchen; die Perk-Lesefunktionen sind der Haken, an dem die späteren Aufträge Boni aufhängen.
- **34 vor 35**, weil die Akte Beweise aus benannten Figuren und Ereignissen braucht; benannte Statthalter und
  Erinnerungen sind die Zutaten.
- **36 und 37 spät**, weil sie am größten sind und ihre Wirkung erst mit bewegtem Markt und sichtbarem Besitz entfaltet.

Jeder Auftrag sollte zwei Zahlen vorher und nachher ausweisen: die Balancing-Kernzahlen (erstes Veedel, Köln
komplett, Pleiten) und eine neue, die bisher fehlt: **Entscheidungen pro Spielstunde** (Befehle des Spielers mit
echter Wahl, also nicht „markRead“), gemessen im Bot und im Playthrough. Wenn die Zahl steigt, ohne dass die Session
länger wird, ist die Diagnose aus Abschnitt 2 getroffen.

## Anhang: Die Vorbilder und was man von ihnen mitnimmt

| Spiel | Wofür es steht | Was Köln Tycoon davon nimmt |
| --- | --- | --- |
| Drug Wars / Dope Wars | Preise, die sich bewegen, und Schocks | A1 Preisindex und Marktereignisse |
| Offworld Trading Company | Der Markt als Schlachtfeld | A1 Schocks, A4 Abnehmer, Gangs als Marktteilnehmer |
| Transport Tycoon / Transport Fever 2 | Fahrzeuge mit Kapazität, Alter, Gewinn pro Linie | C2 Fuhrpark, C3 Warenfluss, I3 Verläufe |
| Anno 1800 / Factorio | Produktionsketten, Engpässe, Durchsatz-Statistik | B1 Anbau, C1 Lagerkapazität, C3 Engpass-Anzeige |
| Patrician / Port Royale | Städte mit Preisniveau, Konvois, Lager, Hafen | A1 Index pro Stadt, C4 Routen, C5 Hafen |
| Euro Truck Simulator 2 | Routenwahl, Fahrer, Werkstatt | C2, C4 |
| Prison Architect | Räume mit Sicherheit, Informanten, Schmuggel | C1 Lager-Ausbau, D4 Informanten |
| Cartel Tycoon | Capos mit Fähigkeiten, Geldwäsche über Betriebe, Behörden-Druck, Nachfolge | F1 Perks, F4 Tarnfirmen, E1 Akte |
| Empire of Sin | Bosse mit Persönlichkeit, Rackets, Diplomatie zwischen allen | D1 Beziehungen untereinander, D2 Statthalter, F4 |
| Gangsters: Organized Crime | Revier Block für Block, Anklage als Ende | E1 Anklage, Territory |
| Shadow of Mordor (Nemesis) | Benannte Gegner, die aufsteigen und sich erinnern | D2 |
| Crusader Kings 3 | Meinungen mit Verfall, Charaktere als Motor | D1 Erinnerungen, G1, G3 |
| RimWorld | Eigenschaften, Beziehungen, Ereignisse, die Geschichten erzeugen | G1 |
| XCOM / Darkest Dungeon / Battle Brothers | Benannte Kämpfer, Verletzungen mit Folgen, Gedenkwand | D3 |
| This Is the Police / GTA | Ermittlungen und Fahndung, die eskalieren | E1 |
| Tropico | Fraktionen bestechen, Zeitung kommentiert | E2 Beamte, I1 Zeitung |
| Yakuza 0 | Immobilien und Clubs als Spiel im Spiel, Nebengeschichten | F3 Besitz, F4, G2 |
| Football Manager | Co-Trainer mit Meinung, Berichte, Moral im Kader | G3 Rechte Hand, I3 Wochenbilanz |
| RollerCoaster Tycoon / Two Point Hospital | Szenario-Ziele, Sterne, lesbare Rückmeldung | H1 Verträge, H2 Szenarien |
| Game Dev Tycoon | Trends, Auftragsarbeiten, Forschung | A2 Trends, H1 |
| Slay the Spire / Balatro | Tages-Seed, Lauf-Historie, Relikte als Handschrift | H2 Tages-Seed, F5 Rückblick, F1 Perks |
| Schedule I / Weed Inc | Anbau-Schleife, Kunden mit Vorlieben, Dealer als Zwischenhändler | B1, A2, A4 |
| Frostpunk / They Are Billions | Finale mit Druck statt leerem Endlosmodus | H3 |
| Cities: Skylines / SimCity | Info-Ansichten auf der Karte, Nachrichten-Ticker | I2, I1 |
