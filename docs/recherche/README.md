# Recherche: reale Gang-Szene

Grundlage, um die Gangs in `src/modules/gangs/data.ts` echter wirken zu lassen. Je Stadt eine Datei, Stand 12.10.2026:
[Köln](gangs-koeln.md), [Hamburg](gangs-hamburg.md), [Berlin](gangs-berlin.md), [München](gangs-muenchen.md),
[Frankfurt](gangs-frankfurt.md). Jede Datei geht die 12 Veedel durch (Rocker, Clans, organisierte Kriminalität,
Rapper, Orte, Slang), mit Quelle und Sicherheit, und endet mit Vorschlägen und Spielideen. Eine zweite Runde hat
die Lücken nachgearbeitet ("Runde 2" in den Dateien). Dazu:

- [Kölner Randbezirke](koeln-randbezirke.md): Kandidaten, um Köln größer zu machen.
- [Südstadt und Rosenthaler Platz](suedstadt-und-rosenthaler-platz.md): Goon Gang am Chlodwigplatz, Imbiss-Boss in Berlin.

## Stufen

- **ECHT:** kann so ins Spiel (Orte, Straßen, Slang, Postleitzahlen, Arten von Ereignissen, erfundene Namen).
- **NAH:** erkennbare Anspielung auf eine echte Gruppe oder Person, aber mit anderem Namen.
- **HEIKEL:** echte lebende Personen, Familien, Rocker-Clubs und Labels (Persönlichkeitsrecht, Markenschutz,
  Kennzeichen verbotener Vereine). Nur zur Info, nie ins Spiel.

## Grenzen

Seiten ließen sich nicht direkt abrufen (DNS-Fehler, Wikipedia gesperrt), alles stammt aus Suchauszügen. Viele
Bezirke sind als „nicht belegt“ markiert, Angaben aus Allgemeinwissen als solche. Zahlen und Daten vor Verwendung
im Spiel gegenprüfen.

## Kurz: was die Recherche für die Gangs vorschlägt

| Stadt | Gang heute | Vorschlag | Stufe |
|---|---|---|---|
| Köln | Hafenkolonne | bleibt; Hafen-Kokain über Rotterdam, Bestechung im Hafen | ECHT |
| Köln | Venloer Syndikat | bleibt; Kioske, Wettbüros, Shisha, Kontrollen | ECHT |
| Köln | Schäl Sick | bleibt; Anspielung auf die Kalker Bande aus dem Drogenkrieg 2024 | NAH |
| Köln | Marienburger Kreis | bleibt; Klüngel, Treuhänder | ECHT |
| Köln | (neu, optional) | Rocker-Club rechtsrheinisch (Buchheim, Dellbrück) | NAH |
| Hamburg | Neonkrone | bleibt; Muster der alten Kiezbanden (GMBH, Nutella-Bande) | NAH |
| Hamburg | Containerjungs | bleibt; Hafenlogistiker, Prozess 2024 | ECHT |
| Hamburg | Das Kollektiv, Elbchaussee-Club | bleiben | ECHT |
| Hamburg | (neu, optional) | Stahlhelm MC, Die 040 (Rap-Crew), Harburger Phoenix | NAH/ECHT |
| Berlin | Die Türsteher | „Die Tür“ oder „Warschauer 77“ | ECHT |
| Berlin | Kotti-Familie | Großfamilie mit erfundenem Namen (Immobilien, Spätis, Autohandel) | NAH |
| Berlin | Leo-Gang | „Leo 65“, Verlagerung zu Schäfersee und Arnimplatz | ECHT |
| Berlin | Kudamm-Kreis | bleibt, erfundener Boss (Juwelen, Galerien) | ECHT |
| Berlin | (neu, optional) | kaukasische Gruppe, Rocker-Club, Rap-Posse, Zigaretten-Händler | NAH |
| München | alle vier | bleiben; „von Arnim“ ersetzen, Giesing nicht als Ultra-Kriminalität | ECHT/NAH |
| München | (neu, optional) | Rocker-Charter, calabrische Gastro-Familie | NAH |
| Frankfurt | Kaisersack-Clan | „Kaisersack-Crew“ (Hessen: Clans kaum Thema) | ECHT |
| Frankfurt | Mainkapital, Die Bembel, Farbwerker | bleiben, neue erfundene Bosse | ECHT/NAH |
| Frankfurt | (neu, optional) | Flughafen-Connection, Rödelheim-Crew, Sprenger aus NL | ECHT/NAH |

Doppelte Namen fallen auf: „von Arnim“ in Berlin und München, „der Schaffner“ in München und Frankfurt,
„Dr. Konstantin“ in Köln und Frankfurt. Die sollten beim Umbau verschieden werden.

## Wünsche aus der Fragerunde vom 12.10.2026

**Goon Gang (Köln, Südstadt am Chlodwigplatz), stärkster Gegner in Köln.** Kein reales Vorbild in Köln gefunden, der
Name ist international als Allerweltsname in Gebrauch (Markenregister nicht geprüft). Profil, Sprüche und Spielideen in
[suedstadt-und-rosenthaler-platz.md](suedstadt-und-rosenthaler-platz.md), Teil A. Achtung: Der Chlodwigplatz liegt auf
der Grenze von Altstadt-Süd und Neustadt-Süd. Heimat-Veedel `altstadt-sued`, für die Stärke zählen im Code `fighting`,
`start.people`, `start.money` und `aggression` in `traits`.

**Köln größer.** Vorschlag der Recherche: 8 neue Stadtteile (Chorweiler, Meschenich/Kölnberg, Finkenberg, Vingst, Niehl,
Ossendorf, Rodenkirchen, Godorf), Werte und Texte in [koeln-randbezirke.md](koeln-randbezirke.md). Für die Goon Gang
lägen Raderberg oder Zollstock nah an der Südstadt. Technisch:
- Straßennetz Köln reicht bis 51,02 °N und 7,07 °O: Chorweiler liegt außerhalb, Porz-Finkenberg, Meschenich und Godorf
  am Rand. Netz mit `build-roads.py` und größerem `box` neu bauen (Overture ist erreichbar).
- Grenzen: Das Geoportal der Stadt Köln ist aus der Umgebung gesperrt, Weg über `fetch-divisions.py` (Overture) wie in
  Hamburg.
- Sieg und Meilenstein rechnen aus der Zahl der Veedel (`Math.floor(total / 2) + 1`), mehr Veedel machen Köln länger.
  Tests (`territory.test.ts`), Test-Spielstände (`npm run saves:build`), Tutorial und `npm run balance` prüfen.
- Neue Spots müssen `scripts/check-roads.mjs` bestehen.

**Boss in Berlin am Rosenthaler Platz, der auch in Köln auftaucht.** Gewünscht war der echte Inhaber von City Chicken.
Den stellen wir nicht als Drogenboss dar: Er ist eine reale, lebende Person mit echtem Geschäft, und eine erfundene
Straftat über ihn wäre Verleumdung, egal wie satirisch das Spiel ist. Stattdessen eine erfundene Figur mit einem
erfundenen Hähnchen-Imbiss am Rosenthaler Platz und einer zweiten Filiale in Köln (drei Varianten in Teil B). Der echte
Hype (Schlangen, Eröffnung in der Breite Straße) kann als harmloses Easter Egg ohne Kriminalität vorkommen.
