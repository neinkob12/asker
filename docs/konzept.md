# Köln Tycoon – Konzept

Stand: 29.09.2026 (nach der Integration, Auftrag 20, und Logistik mit echten Straßen, Auftrag 21). Grundlage sind die Antworten aus zwei Fragerunden (50 + 5 Fragen).
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
- **Kampagne:** Ziel ist, Köln komplett zu übernehmen, also alle 12 Veedel zu kontrollieren (Entscheidung vom 02.10.2026, gebaut in Auftrag 30). 7 von 12 bleibt als Meilenstein „Boss von Köln“. Die Reihenfolge ist frei. Danach ruft der Hamburger Hafen an, und es geht in Hamburg weiter (Abschnitt „Mehrere Städte“); wer bleibt, spielt im Endlosmodus.
- **Story:** lockere Aufträge von Figuren mit etwas Dialog, keine durchgehende Handlung.
- **Kampagnenlänge:** 5–10 Stunden.
- **Session-Länge:** 10–20 Minuten.
- **Spielfigur:** eigener Charakter (Name, Aussehen, Hintergrund).
- **Spielstil:** Am Anfang selbst verkaufen (an einen Spot stellen, dann läuft der Verkauf dort von allein), später alles delegieren. Vom Kleindealer zum Boss.
- **Einstieg:** Tipps und Tooltips, wenn etwas Neues auftaucht. Kein geführtes Tutorial.
- **Game Over:** wenn du pleite bist oder getötet wirst.
- **Modus:** wird beim Anlegen des Spielstands gewählt.
  - Normal: Nach einem Game Over darf ein älterer Stand geladen werden.
  - Hardcore: Der Spielstand wird bei Game Over gelöscht.

## Welt

- **Umfang:** Köln detailliert als Einstieg, danach Hamburg (Auftrag 30), später eine dritte Stadt. Jede Stadt mit echten Stadtteilgrenzen und eigenem Charakter.
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
  - Eigener Anbau kommt später als Erweiterung.
- **Lieferanten:** mehrere, jeweils mit Preis, Qualität, Zuverlässigkeit und Lieferzeit. Nicht alle sind von Anfang an zu haben: Am Anfang liefert nur einer, die anderen melden sich erst mit genug Umsatz, eigenen Veedeln (Einfluss) oder einem Liegeplatz im Hafen und wollen eine Vermittlungsgebühr. Dazu Beziehungen: Vertrauen bringt Rabatt, Kredit und bessere Ware.
- **Preise:** Der Markt gibt einen Richtwert (Angebot, Nachfrage, Konkurrenz), der Spieler setzt seinen Preis drumherum.
- **Logistik:** Fahrzeuge fahren über echte Kölner Straßen, Kontrollen unterwegs, mehrere Lager (kaufen, beliefern lassen, umlagern), Fahrer für Abholungen am Hafen. Später: eigene Fahrzeugflotte.
- **Geld:**
  - Alles Illegale wird mit Schwarzgeld bezahlt.
  - Für Legales (Lagerhallen, Autos usw.) muss Geld gewaschen werden.
- **Geldwäsche (Auftrag 27):** drei Wege, die man nach und nach freischaltet: Kumpel mit Kiosk (klein, teuer,
  schnell, kein Risiko), Waschsalon und Shisha-Bar (mittel, Einstieg mit sauberem oder Schwarzgeld), Bauunternehmer
  (groß, billig, langsam, braucht Ruf oder Reviere, zu viel auf einmal bringt Heat).
- **Tarnfirmen:** Späti, Waschsalon, Shisha-Bar, Werkstatt usw. mit eigenem Gameplay (Umsatz, Personal, Upgrades);
  die Wege der Geldwäsche sind die Vorstufe.
- **Vertrieb:** Straßenverkauf an Spots, Lieferdienst per Spiel-Handy, Großhandel an andere Dealer. Kein Darknet.

## Personal

- **Typen:** Läufer und Dealer, Fahrer (Abholung am Hafen, Umlagern), Sicherheit, Spezialisten (Anwalt, Buchhalter, Kontakt bei der Polizei). Lieferungen fährt die Rechte Hand (keine Kuriere mehr).
- **Tiefe:** Individuen mit Namen, Porträt und Werten (z.B. Tempo, Loyalität, Vorsicht), die im Level aufsteigen.
- **Loyalität:** Verrat kommt selten vor und hat milde Folgen.
- **Hierarchie:** Boss → Rechte Hand → Leutnants mit bis zu drei Spots → Läufer und Sicherheit. Leutnants führen
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

- **Gangs:** Die Gangs sind mächtig und aktiv, man muss gegen sie arbeiten.
  - Sie expandieren, verteidigen ihre Veedel, drücken Preise und greifen an.
  - Am Anfang bist du deutlich schwächer als sie.
- **Mittel gegen die Gangs:**
  - Gewalt: Überfälle auf ihre Spots, Lager und Kuriere
  - wirtschaftlich: Preiskrieg, bessere Ware, Kunden und Lieferanten abwerben
  - Polizei ausnutzen: Gangs verpfeifen und Razzien bei ihnen auslösen
  - Diplomatie: Deals, Waffenstillstand, Bündnisse, Schutzgeld zahlen oder kassieren
- **Polizei:** vorhanden, aber leicht (Heat-System als Würze, nicht als Kern).
- **Festnahme:** Ware und Geld werden beschlagnahmt, Mitarbeiter kommen in Haft, Anwalt und Kaution holen sie raus. Der Spieler selbst kommt nicht in Haft.
- **Action:** spielbar als taktische, rundenbasierte Entscheidungen (fliehen, kämpfen, bestechen …). Die Werte der eigenen Leute entscheiden mit. Anlässe:
  - Überfälle abwehren
  - Polizeiflucht
  - Schulden eintreiben
  - Deals, die kippen
- **Tod:** Du kannst nur sterben, wenn du selbst bei einer Konfrontation dabei bist. Wer nur seine Leute schickt, ist sicher, hat aber weniger Einfluss auf den Ausgang.

## Kunden und Ruf

- **Kunden:** Kundentypen (Student, Banker, Tourist …) mit eigenen Wünschen, dazu Stammkunden mit Namen, die wiederkommen.
- **Ruf:** ein globaler Ruf für das ganze Geschäft.

## Fortschritt

- Upgrade-Baum
- Rang-Stufen (vom kleinen Fisch zum Paten von Köln)
- Besitz und Immobilien als sichtbarer Aufstieg

## Optik und Sound

- **Karte:**
  - Gedämpft und übersichtlich ("Nachtschicht"): Grau- und Schieferflächen, runde Straßen, wenig Details,
    3D-Gebäude in Grautönen mit Schatten, Wahrzeichen (Dom, Hohenzollernbrücke, Colonius, Kranhäuser,
    KölnTriangle; in Hamburg Elbphilharmonie, Michel, Heinrich-Hertz-Turm, Köhlbrandbrücke, Landungsbrücken,
    Elbbrücken) als schlichte Klötze. Vier Tageszeiten, nachts fast schwarz mit bernsteinfarben glühenden
    Hauptstraßen. Farbe tragen nur Reviere (feine Grenzen, schwach getönt), Spots und Gangs.
  - Das Überwachungs-Overlay (Scanlines, Koordinaten) gibt es noch als Schalter, standardmäßig aus.
- **Kamera:** 3D schräg als Standard, per Knopf auf 2D-Draufsicht umschaltbar.
- **Auf der Karte sichtbar:** 3D-Mini-Fahrzeuge auf echten Straßen (sie halten an der Straße, die letzten Meter sind ein gepunkteter Fußweg; Kuriere kommen über die Autobahn ihrer Richtung herein), Schiffe auf den echten Wasserwegen (Rhein ab Rotterdam über Waal und Merwede, Elbe ab Cuxhaven, aus Overture-Daten), pulsierende Hotspots wo etwas los ist, Effekte (Geld-Popups, Blaulicht, Heat-Färbung der Veedel). Seit Auftrag 31: **Verkehr als Kulisse** (Autos, Transporter, Lkw, Streifenwagen in Grautönen, nachts mit Scheinwerfern, rein optisch, Einstellung aus/wenig/normal) und **kleine Figuren an Spots** (Läufer und Sicherheit, bis zu vier wartende Kunden, eine Streife in Veedeln mit hoher Heat); alles mit festem Performance-Budget und ohne Einfluss auf die Simulation. Keine Gang-Fahrzeuge, keine Frachter als Kulisse.
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

- **Kampagnenlänge:** Köln ist der Einstieg, Hamburg die zweite Stadt. Laut Balancing-Simulation (`npm run balance`)
  erstes Veedel nach etwa 7 Spieltagen, drei nach etwa 8, fünf nach 13–17, „Boss von Köln“ (7 von 12) nach 17–20,
  Köln komplett nach 22–27 Spieltagen, bei Tempo 1x (4,8 Minuten pro Spieltag) grob 2 Stunden. In Hamburg fällt das
  erste Stadtteil-Revier etwa eine Woche nach der Ankunft. Die Polizei bleibt in den ersten gut zwei Wochen bei
  1–2 Flammen und zieht erst als Großhändler an.
- **Session-Länge:** In 20 Minuten (etwa 8 Spieltage bei 2x) kommen Verkauf, Nachschub, Personal, Leutnants,
  Gang-Drohungen, Konfrontationen, Polizei-Kontrollen, Wetter und das erste Veedel vor (`npm run playthrough`,
  Screenshots in `docs/integration/`).
- **Noch nicht umgesetzt** (spätere Aufträge, siehe `docs/auftraege/README.md`): eigener Charakter und Aufträge von
  Figuren, Tarnfirmen, Upgrade-Baum und Rang-Stufen, weitere Immobilien, eigene Fahrzeugflotte (größere Fahrzeuge
  für Routen), Leutnants, die selbst am Hafen abholen lassen, eine dritte Stadt (Daten-Schablone steht), das Kartell,
  die lebendige Karte (Auftrag 31), KI-Porträts, Multiplayer.

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
- **Nach Hamburg:** Hamburg komplett geht an eine zweite Rechte Hand; eine dritte Stadt (Berlin oder Frankfurt) ist als
  Datenschablone vorbereitet. Der Anruf des Kartells aus Kolumbien kommt später.

Gebaut mit Auftrag 30 genau so wie oben, mit diesen Werten: Hamburg-Fahrt 4,5 bis 5 Spielstunden, Route mit Fahrer
etwa 4 Stunden 45 Minuten, höchstens 5 kg je Fahrt; Karneval ab Tag 30 alle 90 Tage, FC jeden zweiten Samstag,
Kölner Lichter an Tag 60; Klüngel × 1,5 (Hamburg × 0,8), Freikaufen und Kaution −25 % (Hamburg +20 %); in Hamburg
bringt ein Verkauf 60 % Einfluss. Die Rechte Hand plant keine Routen (das macht der Fahrer nach Fahrplan).

## Offene Punkte

1. **Offline im Multiplayer:** In der Multiplayer-Welt läuft die Zeit durch. Was passiert mit deinem Imperium, während du offline bist? Führen die Leutnants weiter? Gibt es einen Schutz vor Angriffen? Muss erst entschieden werden, wenn Multiplayer drankommt.
2. **Straßenrouten:** Gelöst (Auftrag 21): Das Straßennetz liegt als Daten im Repo (`src/modules/roads/network.ts`, erzeugt aus Overture Maps / OpenStreetMap, ODbL), Routen rechnet das Spiel selbst (A*). Die Quellenangabe „© OpenStreetMap-Mitwirkende, Overture Maps Foundation“ steht seit Auftrag 31 im Spiel (unten rechts auf der Karte und in Einstellungen › Über), dort auch die Wasserwege.
3. **Kartenlizenz:** Die Esri-Satellitenbilder sind raus. Die OpenFreeMap-Kacheln (OpenStreetMap-Daten, ODbL) brauchen nur die Quellenangabe, die unten rechts steht. Vor einer Veröffentlichung trotzdem kurz prüfen, ob OpenFreeMap die erwartete Last trägt.
