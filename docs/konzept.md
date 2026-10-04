# Köln Tycoon – Konzept

Stand: 04.10.2026 (nach Auftrag 31, Auftrag 32 und der Fragerunde zum Bogen des Spiels, Plan in [`docs/plan.md`](plan.md)). Grundlage sind die Antworten aus den Fragerunden (50 + 5 Fragen, 16 Fragen zu den Städten, Fragerunde zur Ideensammlung [`docs/ideen.md`](ideen.md)).
Dieses Dokument ist die gemeinsame Referenz für beide im Duo und für alle Claude-Sessions.
Wer eine Entscheidung ändert, ändert sie hier.

## Eckpfeiler

| Thema | Entscheidung |
| --- | --- |
| Spielmodus | Erst Einzelspieler. Die Architektur muss aber Multiplayer tragen können. |
| Multiplayer (später) | Crews gegeneinander in derselben Stadt. |
| Zielgruppe | Privat im Freundeskreis. Veröffentlichung vielleicht später, wenn es gut ist. |
| Bereitstellung | Online mit Passwortschutz, bei jedem Update automatisch aktualisiert. |
| Zeit | Einzelspieler: läuft nur, während gespielt wird. Multiplayer: Die Welt läuft durch. |
| Spielstände | Mehrere Speicherplätze plus Autosave, Export und Import als Datei. Cloud-Speicher erst mit Multiplayer. |
| Geräte | PC und Handy gleichwertig. |
| Entwicklung | Duo, beide arbeiten parallel mit eigenen Claude-Sessions. Ablauf siehe [`docs/auftraege/`](auftraege/README.md). |

## Spielgefühl

- **Tonalität:** realistisch und düster.
- **Richtung (Entscheidung vom 04.10.2026):** Tycoon vor Drama. Es bleiben die Mechaniken, die über alle Städte skalieren (Markt, Lager, Fahrzeuge, Hafen, Warenfluss, Verträge, Leute). Was pro Stadt Drama oder Verwaltung aufbaut, kommt nicht. Jede Stadt muss übersichtlich bleiben, weil man schnell expandiert.
- **Kampagne als Bogen (Entscheidung vom 04.10.2026, Plan in [`docs/plan.md`](plan.md)):**
  1. **Stadt-Schleife:** Köln komplett übernehmen (alle 12 Veedel, 7 bleibt Meilenstein „Boss von Köln“), an die Rechte Hand übergeben, die damit Statthalter wird. Dann Hamburg, Berlin, München und vielleicht Frankfurt, die Reihenfolge nach Köln ist frei. Spätere Städte gehen schneller, vor allem weil man mit mehr Geld ankommt.
  2. **Boss von Deutschland:** Sind alle Städte komplett, verkauft man das Geschäft für eine feste Summe (Formel noch offen).
  3. **Hafen:** Danach ist man Lieferant am Hafen in den Niederlanden, für alle: die eigenen alten Organisationen, Gangs und fremde Städte. Große Mengen, Schiffe, Container, Zoll als Gegner, die alten Lieferanten als Konkurrenz.
  4. **Produktion:** Anrufe aus Südamerika, eigene Produktion im Ausland, der Preis wird immer besser. Offenes Ende; das Ziel ist, ganz Europa aus eigener Produktion zu versorgen.
- **Story:** lockere Aufträge von Figuren mit etwas Dialog, keine durchgehende Handlung.
- **Kampagnenlänge:** 15–25 Stunden für den ganzen Bogen (Entscheidung vom 04.10.2026), Köln allein etwa 2 Stunden bei 1x.
- **Session-Länge:** 10–20 Minuten.
- **Spielfigur:** Name beim ersten Start. Keine Charakter-Erstellung mit Aussehen und Herkunft, keine Perks (Entscheidung vom 04.10.2026).
- **Spielstil:** Am Anfang selbst verkaufen (an einen Spot stellen, dann läuft der Verkauf dort von allein), später alles delegieren. Vom Kleindealer zum Boss.
- **Einstieg:** Tipps und Tooltips, wenn etwas Neues auftaucht. Kein geführtes Tutorial.
- **Game Over:** wenn du pleite bist oder getötet wirst.
- **Modus:** wird beim Anlegen des Spielstands gewählt.
  - Normal: Nach einem Game Over darf ein älterer Stand geladen werden.
  - Hardcore: Der Spielstand wird bei Game Over gelöscht.

## Welt

- **Umfang:** Köln detailliert als Einstieg, danach Hamburg (Auftrag 30), Berlin, München und vielleicht Frankfurt in freier Reihenfolge. Jede Stadt mit echten Stadtteilgrenzen und genau einem eigenen Dreh (Köln Klüngel und Karneval, Hamburg Hafen und Zoll, Berlin die Nacht, München teuer und streng, Frankfurt Geld und Flughafen). Danach Europa als Karte mit Häfen, Seewegen und fremden Städten.
- **Veedel:** echte Kölner Veedel mit eigenen Eigenschaften (z.B. Kaufkraft, Polizeipräsenz, Konkurrenz).
- **Spots:** einige vorgegeben und freischaltbar, zusätzlich eigene per Klick auf die Karte gründen.
- **Reviere:** Einfluss pro Veedel, auf der Karte sichtbar. Zu Beginn haben die Gangs Köln unter sich aufgeteilt.
- **Weltleben:** Tag-Nacht-Optik, Wetter, Wochentage. Keine Jahreszeiten.
- **Zufallsereignisse:** Razzien und Kontrollen, Lieferprobleme, Sonderaufträge, Stadt-Events (Karneval, FC-Heimspiel, Festivals, Kölner Lichter).

## Ware und Wirtschaft

- **Produkte:** alle Cannabis-Produkte (Weed-Sorten, Hasch, Edibles, Öl, Vapes), jeweils mit eigener Kundschaft.
- **Qualität:** Qualitätsstufen, und Ware kann gestreckt werden (mehr Gewinn, schlechterer Ruf, Risiko).
- **Beschaffung:**
  - Kleine Mengen kommen schnell aus anderen Großstädten.
  - Große Mengen werden am Hafen Rotterdam bestellt, kommen per Schiff über den Rhein in den Niehler Hafen und brauchen länger. Dafür braucht man einen eigenen Liegeplatz (mit sauberem Geld gemietet), und die Ware muss am Kai von einem Fahrer oder selbst abgeholt werden, bevor der Zoll neugierig wird.
  - Eigener Anbau kommt ganz am Ende des Bogens, als Produktion im Ausland (Phase 4 im Plan).
- **Lieferanten:** mehrere, jeweils mit Preis, Qualität, Zuverlässigkeit und Lieferzeit. Nicht alle sind von Anfang an zu haben: Am Anfang liefert nur einer, die anderen melden sich erst mit genug Umsatz, eigenen Veedeln (Einfluss) oder einem Liegeplatz im Hafen und wollen eine Vermittlungsgebühr. Dazu Beziehungen: Vertrauen bringt Rabatt, Kredit und bessere Ware.
- **Preise:** Der Markt gibt einen Richtwert (Angebot, Nachfrage, Konkurrenz), der Spieler setzt seinen Preis drumherum. Dazu ein milder Preisindex pro Produkt und Stadt (0,85 bis 1,2, langsame Drift), der auch die Einkaufspreise bewegt (zur Hälfte), mit Rabatt-Aktionen der Lieferanten über drei bis fünf Tage, Marktereignissen über zwei bis fünf Tage und einem Marktbericht am Montag. Gute Qualität macht ein Produkt an einem Spot beliebter (Entscheidung vom 04.10.2026, gebaut mit Auftrag 32). Ware altert nicht.
- **Logistik:** Fahrzeuge fahren über echte Kölner Straßen, Kontrollen unterwegs, mehrere Lager (kaufen, beliefern lassen, umlagern), Fahrer für Abholungen am Hafen. Dazu (Entscheidung vom 04.10.2026): Lager haben eine Kapazität, die man ausbauen kann; eigene Fahrzeuge mit festen Werten pro Modell (Ladung, Tempo, Zollrisiko, kein Alter, keine Kennzeichen); Routenwahl pro Fahrt (Autobahn, Landstraße, nachts); Hafen-Ausbau mit Liegeplatz-Stufen und Containern; eine Warenfluss-Übersicht.
- **Geld:**
  - Alles Illegale wird mit Schwarzgeld bezahlt.
  - Für Legales (Lagerhallen, Autos usw.) muss Geld gewaschen werden.
- **Geldwäsche (Auftrag 27):** drei Wege, die man nach und nach freischaltet: Kumpel mit Kiosk (klein, teuer,
  schnell, kein Risiko), Waschsalon und Shisha-Bar (mittel, Einstieg mit sauberem oder Schwarzgeld), Bauunternehmer
  (groß, billig, langsam, braucht Ruf oder Reviere, zu viel auf einmal bringt Heat).
- **Tarnfirmen:** entfallen (Entscheidung vom 04.10.2026, zu kompliziert). Die drei Wege der Geldwäsche bleiben.
- **Vertrieb:** Straßenverkauf an Spots, Lieferdienst per Spiel-Handy, Großhandel an andere Dealer. Kein Darknet. Die Dealer werden Stammabnehmer mit Vertrauen (größere Mengen, Vorkasse, Exklusivität, am Ende Zwischenhändler für ein Veedel). Dazu Wochenverträge (Auftrag 32): jeden Montag um 8 Uhr drei Angebote von Figuren mit Gesicht, eins wird angenommen, Frist Sonntag 23:59, Ziele nach Größe des Geschäfts, Belohnung plus Vertrauen bei einem Lieferanten.

## Personal

- **Typen:** Läufer und Dealer, Fahrer (Abholung am Hafen, Umlagern), Sicherheit, Spezialisten (Anwalt, Buchhalter, Kontakt bei der Polizei). Lieferungen fährt die Rechte Hand (keine Kuriere mehr).
- **Tiefe:** Individuen mit Namen, Porträt und Werten (z.B. Tempo, Loyalität, Vorsicht), die im Level aufsteigen. Dazu (Entscheidung vom 04.10.2026) zwei bis drei Eigenschaften pro Person, Beziehungen untereinander und kleine Ereignisse im Ton der Figur.
- **Loyalität:** Verrat kommt selten vor und hat milde Folgen.
- **Hierarchie:** Boss → Rechte Hand (nach der Übergabe einer Stadt: Statthalter) → Capo (ab Leutnant Level 5, führt bis zu drei Leutnants in einem Bezirk, Entscheidung vom 04.10.2026) → Leutnants mit bis zu drei Spots → Läufer und Sicherheit. Die Rechte Hand gibt Rat (Tagesbericht, Konfrontationen), hat aber keine eigene Haltung und verrät nicht. Leutnants führen
  ihre Spots selbstständig (Preise, eigenes Personal, Nachbestellen nach Regeln, Ausfälle), die Rechte Hand hält
  die Löhne zusammen, verteilt Leute und schickt jeden Morgen einen Tagesbericht.
- **Rechte Hand als Auftragsfahrer (Auftrag 28):** Nur sie nimmt Lieferanfragen an, sagt im Chat für dich zu und
  fährt selbst mit dem Auto aus; Kuriere gibt es nicht mehr. Sie bekommt Aufgaben, jede einzeln schaltbar und nach
  Stufe frei (Aufträge und Handy, Hafen abholen, Nachbestellen für ganz Köln, Personal, Großhandel, Geldwäsche),
  steigt mit erledigten Aufgaben und guten Tagesberichten auf und kann Fehler machen (Vorsicht, Loyalität). Mit allen
  Aufgaben an läuft Köln ohne den Spieler weiter.
- **Haft und Ausfälle:** Wer sitzt, bekommt nur Stillhaltegeld (ein Viertel des Lohns), Verletzte den halben Lohn.
  Ohne Stillhaltegeld redet ein Häftling eher. Ausfälle lassen sich ersetzen, auslösen oder aussitzen.
- **Rekrutierung:** über Kontakte, Empfehlungen und Aufträge, dazu ein Bewerber-Pool.

## Gangs, Risiko und Konflikte

- **Gangs:** Die Gangs sind mächtig und aktiv, man muss gegen sie arbeiten. Sie haben ein Gedächtnis mit Verfall (verpfiffen, Schutzgeld pünktlich gezahlt …) und Beziehungen untereinander, daraus entstehen Gang-Kriege (Entscheidung vom 04.10.2026). Keine benannten Statthalter der Gangs.
  - Sie expandieren, verteidigen ihre Veedel, drücken Preise und greifen an.
  - Am Anfang bist du deutlich schwächer als sie.
- **Mittel gegen die Gangs:**
  - Gewalt: Überfälle auf ihre Spots, Lager und Kuriere
  - wirtschaftlich: Preiskrieg, bessere Ware, Kunden und Lieferanten abwerben
  - Polizei ausnutzen: Gangs verpfeifen und Razzien bei ihnen auslösen
  - Diplomatie: Deals, Waffenstillstand, Bündnisse, Schutzgeld zahlen oder kassieren
- **Polizei:** vorhanden, aber leicht (Heat-System als Würze, nicht als Kern). Keine Akte und keine Ermittlungen über die Heat hinaus, kein Korruptionsnetz (Entscheidung vom 04.10.2026). In der Hafen-Phase ist der Zoll der Gegner.
- **Festnahme:** Ware und Geld werden beschlagnahmt, Mitarbeiter kommen in Haft, Anwalt und Kaution holen sie raus. Der Spieler selbst kommt nicht in Haft.
- **Action:** spielbar als taktische, rundenbasierte Entscheidungen (fliehen, kämpfen, bestechen …). Die Werte der eigenen Leute entscheiden mit. Neu (Entscheidung vom 04.10.2026): Die Absicht der Gegenseite ist sichtbar, zwei Zeiger (Aggression, Bereitschaft zu gehen) statt einer Chance, eine Polizei-Uhr, Crew-Wahl mit Spezialzug, mehrere Einsätze statt Sieg oder Niederlage, Gegner mit Rollen und Rat der Rechten Hand (Details in `docs/plan.md`). Anlässe:
  - Überfälle abwehren
  - Polizeiflucht
  - Schulden eintreiben
  - Deals, die kippen
- **Tod:** Du kannst nur sterben, wenn du selbst bei einer Konfrontation dabei bist. Wer nur seine Leute schickt, ist sicher, hat aber weniger Einfluss auf den Ausgang.

## Kunden und Ruf

- **Kunden:** Kundentypen (Student, Banker, Tourist …) mit eigenen Wünschen, dazu Stammkunden mit Namen, die wiederkommen.
- **Ruf:** ein globaler Ruf für das ganze Geschäft.

## Fortschritt

- Ränge des Spielers sind die Stufen des Bogens, als Titel ohne Boni: Kleindealer, Händler, Großhändler, Boss von Köln, Boss von <Stadt>, Boss von Deutschland, Importeur, Produzent.
- Kein Upgrade-Baum, keine Perks, kein Besitz und keine Immobilien als eigenes System (Entscheidung vom 04.10.2026). Ausbau gibt es an Lagern, Hafen und Fahrzeugen.

## Optik und Sound

- **Karte:**
  - Gedämpft und übersichtlich ("Nachtschicht"): Grau- und Schieferflächen, runde Straßen, wenig Details,
    3D-Gebäude in Grautönen mit Schatten, Wahrzeichen (Dom, Hohenzollernbrücke, Colonius, Kranhäuser,
    KölnTriangle; in Hamburg Elbphilharmonie, Michel, Heinrich-Hertz-Turm, Köhlbrandbrücke, Landungsbrücken,
    Elbbrücken) als schlichte Klötze. Vier Tageszeiten, nachts fast schwarz mit bernsteinfarben glühenden
    Hauptstraßen. Farbe tragen nur Reviere (feine Grenzen, schwach getönt), Spots und Gangs.
  - Das Überwachungs-Overlay (Scanlines, Koordinaten) gibt es noch als Schalter, standardmäßig aus.
- **Kamera:** 3D schräg als Standard, per Knopf auf 2D-Draufsicht umschaltbar.
- **Auf der Karte sichtbar:** 3D-Mini-Fahrzeuge auf echten Straßen (sie halten an der Straße, die letzten Meter sind ein gepunkteter Fußweg; Kuriere kommen über die Autobahn ihrer Richtung herein), Schiffe auf den echten Wasserwegen (Rhein ab Rotterdam über Waal und Merwede, Elbe ab Cuxhaven, aus Overture-Daten), pulsierende Hotspots wo etwas los ist, Effekte (Geld-Popups, Blaulicht, Heat-Färbung der Veedel). Seit Auftrag 31: **Verkehr als Kulisse** (Autos, Transporter, Lkw, Streifenwagen in Grautönen, nachts mit Scheinwerfern, rein optisch, Einstellung aus/wenig/normal) und **kleine Figuren an Spots** (Läufer und Sicherheit, bis zu vier wartende Kunden, eine Streife in Veedeln mit hoher Heat); alles mit festem Performance-Budget und ohne Einfluss auf die Simulation. Dazu die **Deutschland-Ansicht** (beim Herauszoomen: die Städte als Glas-Karten, die A1 in Gold, solange eine Fahrt läuft), Kneipen mit Bierglas am Schild und Stadt-Events auf der Karte (Feuerwerk bei den Kölner Lichtern, Schiffe zum Hafengeburtstag). Keine Gang-Fahrzeuge, keine Frachter als Kulisse.
- **Bedienoberfläche:** "Nachtschicht": dunkel, gedämpft, eckig und aufgeräumt (Haarlinien statt dicker Konturen, schmale Tycoon-Zahlen, eine Akzentfarbe Kölsch-Gold, sonst nur Farben mit Bedeutung). Über der Karte stehen nur Geld, Heat und das Spieltempo. **Das Spiel-Handy ist die Schaltzentrale:** alle Bereiche (Geschäft, Reviere, Gangs, Leute …), Details zu Spots und Veedeln, Chats, Bestellungen und Kontakte laufen als Apps darüber. Desktop: Handy rechts fest angedockt (einklappbar), Handy-Bildschirm: Handy bildschirmfüllend, in der Tasche eine Leiste unten. Desktop und Handy sind gleichwertig.
- **Grafiken:** KI-generierte Illustrationen (z.B. Porträts) plus einfache Icons.
- **Sound:** Musik und Soundeffekte.
- **Sprache:** nur Deutsch.

## Stand der Umsetzung

Nach Phase 2 (Integration) spielbar und verbunden: Veedel mit echten Grenzen, Reviere und Kampagne "Köln
übernehmen" (7 von 12 Veedeln), Polizei mit Kontrollen, geplanten Razzien und Warnung durch den Polizei-Kontakt,
vier Gangs mit KI, Diplomatie und Überfällen, rundenbasierte Konfrontationen, sieben Produkte mit Qualität und
Strecken, Lieferanten mit Vertrauen und Kredit, Markt mit Richtpreis, Kundentypen und Stammkunden, Lieferdienst
und Großhandel (Deals können kippen), eigene Spots, Ruf, Geldwäsche, Personal mit Werten und Level, Leutnants,
Bewerber und Kontakte, Wetter, Tag und Nacht, Spiel-Handy, Musik und Sound, Normal- und Hardcore-Modus.

Mit Auftrag 21 dazu: echtes Kölner Straßennetz (OpenStreetMap über Overture Maps) für alle Fahrzeuge und
Fahrzeiten, Lieferanten zum Freischalten (Umsatz, Veedel, Liegeplatz; neu: Amsterdam), Liegeplatz im Niehler Hafen,
Schiffsware am Kai mit Abholung durch Fahrer oder selbst, Zoll bei zu langem Warten, Verkehrskontrollen unterwegs,
mehrere Lager (mit sauberem Geld gekauft, Umlagern, Razzien durchsuchen Lager im Veedel), Fahrer als neue Rolle,
Logistik-App im Handy und selbst an einen Spot stellen (automatisch verkaufen ohne Läufer). Sauberes Geld hat damit
zum ersten Mal einen Zweck (Liegeplatz, Lager).

Mit Auftrag 24 dazu: Geldbuch mit Kategorien und die Kassen-App im Handy (Gewinn und Verlust für Heute, Gestern und
7 Tage, Verlauf, Ergebnis pro Spot und pro Leutnant, Warnung, wenn die Löhne nicht mehr für zwei Nächte reichen),
kein voller Lohn mehr in Haft (Stillhaltegeld) und Entscheidungen bei Ausfällen (ersetzen, Kaution, entlassen),
Leutnants mit bis zu drei Spots statt einem Veedel, mit eigenem Personal-Budget und Bestellregeln, die Rechte Hand
über den Leutnants mit Tagesbericht, Personal als Baum im Handy und eine Polizei, deren Härte sich nach der Größe
des Geschäfts richtet (Kleindealer, Händler, Großhändler mit Großrazzien). Im frühen Spiel bleibt mehr Geld übrig.

Mit Auftrag 27 dazu: die Kasse als Bilanz (Heute, Gestern, 7 und 30 Tage; ganz Köln, ein Veedel, ein Spot oder ein
Leutnant; ein Satz, warum es Gewinn oder Verlust gab), Geldwäsche mit drei Wegen, mehr Bewerber und gezieltes
Rumfragen, der Gangs-Kopf mit deiner Stärke im Vergleich und klare Optik im Handy (Chips, Gruppen mit Unterlage,
ausklappbare Erklärungen, kein Umbruch im Wort).

Mit Auftrag 30 dazu: Köln komplett erst mit allen 12 Veedeln (7 ist der Meilenstein „Boss von Köln“), Anrufe im
Handy, die Vollmacht der Rechten Hand, Hamburg als zweite Stadt (eigene Stadtteile, Spots, Lager, Gangs, Hafen,
Straßennetz), nur eine Stadt läuft live (die andere schläft mit Tagesergebnis), die Fahrt über die A1, Routen mit
Fahrplan zwischen den Lagern beider Städte mit Zoll auf der Autobahn, Stadt-Events (Karneval, FC, Kölner Lichter;
Hafengeburtstag, Schlagermove, Dom), Kölscher Klüngel gegen hanseatisch kühl, Veedel-Kneipen und mehr Studenten.

Mit Auftrag 32 dazu: ein milder Preisindex pro Ware und Stadt (0,85 bis 1,2, jeden Tag ein Schritt mit Rückkehr zur
Mitte; Straßenpreise folgen ganz, der Einkauf zur Hälfte), Rabatt-Aktionen der Lieferanten (ein Paket 10–25 % billiger
für 3–5 Tage, etwa einmal pro Woche), Marktereignisse wie Zollfund in Rotterdam oder gute Ernte in den Niederlanden
(2–5 Tage, halb rauf, halb runter), ein Marktbericht am Montag, Bestellregeln mit Preisgrenze, Premium-Ware macht ein
Produkt am Spot beliebter (bis +25 % Nachfrage, Dreck bis −33 %) und Wochenverträge (montags drei Angebote von
Figuren wie Ali vom Spätkauf oder Marlene aus dem Club, einer wird angenommen, Frist Sonntag).

- **Kampagnenlänge:** Köln ist der Einstieg, Hamburg die zweite Stadt. Laut Balancing-Simulation (`npm run balance`)
  erstes Veedel nach etwa 6–7 Spieltagen, drei nach etwa 8, fünf nach 13–16, „Boss von Köln“ (7 von 12) nach 16–19,
  Köln komplett nach 21–24 Spieltagen (Stand Auftrag 32), bei Tempo 1x (4,8 Minuten pro Spieltag) grob 2 Stunden. In Hamburg fällt das
  erste Stadtteil-Revier etwa eine Woche nach der Ankunft. Die Polizei bleibt in den ersten gut zwei Wochen bei
  1–2 Flammen und zieht erst als Großhändler an.
- **Session-Länge:** In 20 Minuten (etwa 8 Spieltage bei 2x) kommen Verkauf, Nachschub, Personal, Leutnants,
  Gang-Drohungen, Konfrontationen, Polizei-Kontrollen, Wetter und das erste Veedel vor (`npm run playthrough`,
  Screenshots in `docs/integration/`).
- **Konfrontationen neu (Auftrag 35):** Die Akte zeigt jede Runde, was die Gegenseite vorhat (Absicht), zwei Zeiger
  (Aggression, Entschlossenheit), die Polizei-Uhr, was auf dem Spiel steht (Ware, Kasse, Leute, Spot, Lärm; einen pro
  Runde schützen) und die Crew mit Spezialzügen; vor dem Tippen zeigt jede Handlung ihre Wirkung als Pfeile. Der Würfel
  entscheidet nur die Stärke, das Ergebnis ist eine Mischung. Die Rechte Hand gibt Rat, die Zollkontrolle (Autobahn,
  später Hafen) hat eigene Handlungen. Gute Entscheidungen machen messbar einen Unterschied (siehe `docs/architektur.md`,
  Balancing).
- **Noch nicht umgesetzt** (Aufträge 33 bis 42, siehe `docs/auftraege/README.md` und `docs/plan.md`): Lager mit Kapazität, Fahrzeuge, Routenwahl, Hafen-Ausbau, Warenfluss, Stammabnehmer, Gangs mit
  Gedächtnis, Leute mit Geschichte, Capo, freie Reihenfolge der Städte mit Autobahn-Netz, Berlin,
  München, Frankfurt, Verkauf und Hafen-Phase, Produktion im Ausland, KI-Porträts, Multiplayer. Verworfen: Tarnfirmen,
  Charakter-Erstellung, Perks, Besitz, Akte, Korruption.

## Mehrere Städte (Auftrag 30 gebaut, Auftrag 31 für die Karte)

Köln ist der Einstieg und bleibt die Basis. Entschieden am 02.10.2026 in einer Fragerunde mit 16 Fragen; die
Spiellogik ist mit [Auftrag 30](auftraege/30-staedte-hamburg.md) gebaut, die lebendige Karte (Wasserwege, Verkehr,
schönere Deutschland-Ansicht) kommt mit [Auftrag 31](auftraege/31-karte-lebt.md). Wie es technisch zusammenhängt:
`docs/architektur.md`, Abschnitt „Städte“.

- **Köln komplett:** Erst mit allen 12 Veedeln ist Köln übernommen. 7 von 12 bleibt als Meilenstein „Boss von Köln“
  (Titel, Banner, Bestenliste), ist aber kein Sieg mehr.
- **Der Anruf:** 30 Spielminuten nach „Köln komplett“ ruft ein Hafenarbeiter aus dem Hamburger Hafen an, als
  Vollbild-Anruf im Handy (Klingeln, Annehmen, Dialog in Sprechblasen, danach als Chat gespeichert). Anrufe sind
  danach ein allgemeines Mittel (später ruft das Kartell).
- **Vollmacht der Rechten Hand:** Die Stadt verlassen kann nur, wer seiner Rechten Hand Köln übergibt. Dafür braucht
  sie Stufe 5 und alle sechs Aufgaben an. Mit Vollmacht macht sie alles, was der Spieler macht (Leutnants ernennen und
  absetzen, Leute feuern und einstellen, Ware kaufen, Preise setzen, Spots und Lager, Gangs und Chefsache), und
  bekommt 80 % vom Kölner Tagesgewinn (laut Kasse, um Mitternacht, nur bei Gewinn). Es bleibt ein Konto für alle
  Städte. Der Spieler darf jederzeit nach Köln schauen und eingreifen; die Vollmacht ist widerrufbar (kostet Loyalität).
  Ihr Tagesbericht wird zum Bericht aus Köln.
- **Nur eine Stadt läuft voll:** Die Stadt, die auf der Karte zu sehen ist, wird simuliert. Die andere läuft im
  Schlafmodus: einmal am Tag eine Zusammenfassung (Ergebnis aus den letzten live gespielten Tagen, Anteil der Rechten
  Hand, Lager bleiben Daten, Gangs und Polizei eingefroren). Umschalten wechselt, welche Stadt live ist. Selbst an
  einem Spot stehen, selbst fahren und bei Konfrontationen dabei sein geht nur in der Stadt, in der man gerade ist;
  umziehen ist eine Autofahrt über die A1.
- **Hamburg:** 12 Stadtteile mit echten Grenzen (St. Pauli, Sternschanze, Altona-Altstadt, Ottensen, St. Georg,
  HafenCity, Eimsbüttel, Eppendorf, Barmbek-Süd, Wilhelmsburg, Harburg, Blankenese). Besonderheiten: Hafen mit sehr
  großen Containern direkt am Kai (Hein wird zum Hafen-Großhändler), höhere Preise durch Kaufkraft (dafür teurere Löhne,
  Lager und Spots), Nachtleben auf Reeperbahn und Schanze (Nachfrage nachts und am Wochenende, mehr Kontrollen),
  Polizei startet eine Stufe härter, Zoll am Kai und auf der Autobahn. Vier eigene, stärkere Gangs. Startlieferant in
  Hamburg ist Toni aus Frankfurt (Vertrauen bleibt). Man fängt mit seinem Geld an, aber ohne Spots, Lager und Leute;
  Leute aus Köln können nachkommen.
- **Köln:** Stadt-Events (Karneval, FC-Heimspiel, Kölner Lichter mit Wirkung auf Nachfrage, Polizei und Gangs),
  Kölscher Klüngel (Beziehungen wachsen schneller, Freikaufen und Kaution billiger; Hamburg ist kühl und korrekt),
  Studenten und Kneipen (Veedel-Kneipen als Spot-Art mit Stammkunden und doppeltem Ruf, Studentenviertel mit viel
  Volumen zu kleinen Preisen).
- **Logistik zwischen den Städten:** Fahrer der Logistik bekommen Routen mit Fahrplan (Abfahrt, Ladung, von Lager zu
  Lager, Rückfracht) über die echte A1 mit Autobahnkontrollen (Zoll). Die Fahrten sind auf der Karte zu sehen, in der
  Stadt bis zur Einfahrt und in einer Deutschland-Ansicht ganz. Die Ware kann in beide Richtungen fließen; der Niehler
  Hafen bleibt wie er ist (kein besonderer Vorteil für Köln).
- **Daten:** pro Stadt ein Straßennetz aus Overture Maps und die A1 als Linie (409 km, gebaut); Rhein und Elbe als
  echte Wasserwege und mehr Leben auf der Karte (Verkehr, kleine Figuren an Spots, festes Performance-Budget) kommen
  mit Auftrag 31.
- **Nach Hamburg (Entscheidung vom 04.10.2026):** Hamburg komplett geht an eine zweite Rechte Hand (Statthalter). Danach
  Berlin, München und vielleicht Frankfurt in freier Reihenfolge, verbunden über ein Autobahn-Netz statt nur der A1.
  Schlafende Städte laufen über ihren Statthalter weiter, ab und zu gibt es dort ein kleines Minus durch eine Razzia,
  nichts Schlimmes, niemand ruft zurück. Danach Verkauf, Hafen und Produktion, siehe Abschnitt „Spielgefühl“.

Gebaut mit Auftrag 30 genau so wie oben, mit diesen Werten: Hamburg-Fahrt 4,5 bis 5 Spielstunden, Route mit Fahrer
etwa 4 Stunden 45 Minuten, höchstens 5 kg je Fahrt; Karneval ab Tag 30 alle 90 Tage, FC jeden zweiten Samstag,
Kölner Lichter an Tag 60; Klüngel × 1,5 (Hamburg × 0,8), Freikaufen und Kaution −25 % (Hamburg +20 %); in Hamburg
bringt ein Verkauf 60 % Einfluss. Die Rechte Hand plant keine Routen (das macht der Fahrer nach Fahrplan).

## Offene Punkte

1. **Offline im Multiplayer:** In der Multiplayer-Welt läuft die Zeit durch. Was passiert mit deinem Imperium, während du offline bist? Führen die Leutnants weiter? Gibt es einen Schutz vor Angriffen? Muss erst entschieden werden, wenn Multiplayer drankommt.
2. **Straßenrouten:** Gelöst (Auftrag 21): Das Straßennetz liegt als Daten im Repo (`src/modules/roads/network.ts`, erzeugt aus Overture Maps / OpenStreetMap, ODbL), Routen rechnet das Spiel selbst (A*). Die Quellenangabe „© OpenStreetMap-Mitwirkende, Overture Maps Foundation“ steht seit Auftrag 31 im Spiel (unten rechts auf der Karte und in Einstellungen › Über), dort auch die Wasserwege.
3. **Kartenlizenz:** Die Esri-Satellitenbilder sind raus. Die OpenFreeMap-Kacheln (OpenStreetMap-Daten, ODbL) brauchen nur die Quellenangabe, die unten rechts steht. Vor einer Veröffentlichung trotzdem kurz prüfen, ob OpenFreeMap die erwartete Last trägt.
