# Köln Tycoon – Konzept

Stand: 29.09.2026 (nach der Integration, Auftrag 20). Grundlage sind die Antworten aus zwei Fragerunden (50 + 5 Fragen).
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
- **Kampagne:** Ziel ist, Köln zu übernehmen, also die Mehrheit der Veedel zu kontrollieren. Die Reihenfolge ist frei. Danach geht es im Endlosmodus weiter.
- **Story:** lockere Aufträge von Figuren mit etwas Dialog, keine durchgehende Handlung.
- **Kampagnenlänge:** 5–10 Stunden.
- **Session-Länge:** 10–20 Minuten.
- **Spielfigur:** eigener Charakter (Name, Aussehen, Hintergrund).
- **Spielstil:** Am Anfang selbst verkaufen, später alles delegieren. Vom Kleindealer zum Boss.
- **Einstieg:** Tipps und Tooltips, wenn etwas Neues auftaucht. Kein geführtes Tutorial.
- **Game Over:** wenn du pleite bist oder getötet wirst.
- **Modus:** wird beim Anlegen des Spielstands gewählt.
  - Normal: Nach einem Game Over darf ein älterer Stand geladen werden.
  - Hardcore: Der Spielstand wird bei Game Over gelöscht.

## Welt

- **Umfang:** nur Köln, dafür detailliert.
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
  - Große Mengen werden am Hafen Rotterdam bestellt und brauchen länger.
  - Eigener Anbau kommt später als Erweiterung.
- **Lieferanten:** mehrere, jeweils mit Preis, Qualität, Zuverlässigkeit und Lieferzeit. Dazu Beziehungen: Vertrauen bringt Rabatt, Kredit und bessere Ware.
- **Preise:** Der Markt gibt einen Richtwert (Angebot, Nachfrage, Konkurrenz), der Spieler setzt seinen Preis drumherum.
- **Logistik:** Fahrzeugflotte, echte Straßenrouten, Kontrollen unterwegs, mehrere Lager.
- **Geld:**
  - Alles Illegale wird mit Schwarzgeld bezahlt.
  - Für Legales (Lagerhallen, Autos usw.) muss Geld gewaschen werden.
- **Tarnfirmen:** Späti, Waschsalon, Shisha-Bar, Werkstatt usw. mit eigenem Gameplay (Umsatz, Personal, Upgrades).
- **Vertrieb:** Straßenverkauf an Spots, Lieferdienst per Spiel-Handy, Großhandel an andere Dealer. Kein Darknet.

## Personal

- **Typen:** Läufer und Dealer, Kuriere und Fahrer, Sicherheit, Spezialisten (Anwalt, Buchhalter, Kontakt bei der Polizei).
- **Tiefe:** Individuen mit Namen, Porträt und Werten (z.B. Tempo, Loyalität, Vorsicht), die im Level aufsteigen.
- **Loyalität:** Verrat kommt selten vor und hat milde Folgen.
- **Hierarchie:** Boss → Leutnants pro Veedel → Läufer. Leutnants managen ihr Gebiet selbstständig.
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
  - Stilisiert und freundlich wie die Snapchat-Map ("Candy-Look"): Pastellflächen, dicke runde Straßen, wenig Details,
    3D-Gebäude in weichen Farben mit Schatten, Wahrzeichen (Dom, Hohenzollernbrücke, Colonius, Kranhäuser,
    KölnTriangle) als Toon-Klötze. Vier Tageszeiten, nachts dunkelblau mit glühenden Hauptstraßen.
  - Das Überwachungs-Overlay (Scanlines, Koordinaten) gibt es noch als Schalter, standardmäßig aus.
- **Kamera:** 3D schräg als Standard, per Knopf auf 2D-Draufsicht umschaltbar.
- **Auf der Karte sichtbar:** 3D-Mini-Fahrzeuge (später auf echten Straßen), Schiffe auf dem Rhein, pulsierende Hotspots wo etwas los ist (keine Figuren), Polizeistreifen, Effekte (Geld-Popups, Blaulicht, Heat-Färbung der Veedel).
- **Bedienoberfläche:** Spiel-Handy für Chats, Bestellungen und Kontakte. Übrige Menüs clean und dunkel.
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

- **Kampagnenlänge:** laut Balancing-Simulation (`npm run balance`) erstes Veedel nach etwa 8–10 Spieltagen,
  drei nach 10–26, danach bremsen die Gangs spürbar. Sieg etwa nach 80–120 Spieltagen, das sind bei Tempo 1x
  (4,8 Minuten pro Spieltag) grob 5–10 Stunden.
- **Session-Länge:** In 20 Minuten (etwa 8 Spieltage bei 2x) kommen Verkauf, Nachschub, Personal, Leutnants,
  Gang-Drohungen, Konfrontationen, Polizei-Kontrollen, Wetter und das erste Veedel vor (`npm run playthrough`,
  Screenshots in `docs/integration/`).
- **Noch nicht umgesetzt** (spätere Aufträge, siehe `docs/auftraege/README.md`): eigener Charakter und Aufträge von
  Figuren, Stadt-Events, Tarnfirmen, Upgrade-Baum und Rang-Stufen, Immobilien, Fahrzeugflotte mit echten Routen und
  mehreren Lagern, KI-Porträts, Hosting, Multiplayer.

## Offene Punkte

1. **Offline im Multiplayer:** In der Multiplayer-Welt läuft die Zeit durch. Was passiert mit deinem Imperium, während du offline bist? Führen die Leutnants weiter? Gibt es einen Schutz vor Angriffen? Muss erst entschieden werden, wenn Multiplayer drankommt.
2. **Straßenrouten:** Echte Routen brauchen Routing-Daten. Vorschlag: Routen vorab berechnen und als Daten ins Repo legen, statt zur Laufzeit einen Dienst abzufragen.
3. **Kartenlizenz:** Die Esri-Satellitenbilder sind raus. Die OpenFreeMap-Kacheln (OpenStreetMap-Daten, ODbL) brauchen nur die Quellenangabe, die unten rechts steht. Vor einer Veröffentlichung trotzdem kurz prüfen, ob OpenFreeMap die erwartete Last trägt.
