# Plan: Köln mit 16 Veedeln und Goon Gang

Stand 12.10.2026, noch kein Code. Entscheidungen aus der Fragerunde: 4 neue Stadtteile, ab Spielstart da, Goon Gang
in der Südstadt als stärkster Gegner in Köln. Grundlage: [koeln-randbezirke.md](koeln-randbezirke.md) und
[suedstadt-und-rosenthaler-platz.md](suedstadt-und-rosenthaler-platz.md).

## Größe im Blick

| | heute | nachher |
|---|---|---|
| Veedel in Köln | 12 | 16 |
| Spots in Köln | 30 (2 bis 3 pro Veedel, 4 von Anfang an offen) | 38 |
| Gangs in Köln | 4 | 5 |
| „Boss von Köln“ (Mehrheit) | 7 Veedel | 9 Veedel |
| „Köln komplett“ | 12 Veedel | 16 Veedel |

Die neuen Spots sind alle freizuschalten (keiner mit `unlockCost: 0`), damit der Anfang und das Tutorial gleich
bleiben. Die neuen Veedel liegen am Rand, also lange Fahrwege: Sie sind eher Ziele für die Mitte des Kölner Spiels.
Der Mehrheits-Schritt von 7 auf 9 ist die größte Folge; wird das zu zäh, kann die Mehrheit über eine Zahl in den Daten
bei 7 bleiben (eigene Stellschraube, heute fest `Math.floor(total / 2) + 1`).

## Die vier neuen Veedel

Werte: 1 = Kölner Durchschnitt (`purchasingPower`, `policePresence`, `density`, `nightlife`).

| Veedel | Stadtbezirk | Kaufkraft | Polizei | Dichte | Nacht | Gang zu Beginn |
|---|---|---|---|---|---|---|
| Zollstock | Rodenkirchen | 0,95 | 0,9 | 1,0 | 0,8 | Goon Gang (Hinterland der Südstadt) |
| Chorweiler | Chorweiler | 0,6 | 1,2 | 1,4 | 0,6 | Hafenkolonne (Norden, wie Nippes) |
| Vingst | Kalk | 0,7 | 1,3 | 1,2 | 0,8 | Schäl Sick |
| Rodenkirchen | Rodenkirchen | 1,5 | 0,8 | 0,7 | 0,7 | Marienburger Kreis |

Warum Zollstock statt Raderberg: größer, grenzt an Neustadt-Süd und Bayenthal, und mit Höninger Platz und Südstadion
gibt es zwei klare Orte. Raderberg (Großmarkt) wäre die Alternative.

Texte (aus der Recherche, Zollstock neu):

- **Zollstock:** „Reihenhäuser, Kleingärten und das Südstadion, alles eine Spur leiser als die Südstadt nebenan. Wer hier
  wohnt, kennt die Jungs vom Chlodwigplatz, und wer klug ist, grüßt sie.“
- **Chorweiler:** „Zwanzig Stockwerke Beton, in denen jeder die Schritte im Treppenhaus erkennt. Die Wache steht am Rand,
  und was in den Wohnungen verkauft wird, wissen die Nachbarn lange vor den Beamten.“
- **Vingst:** „Hinter der Kalker Hauptstraße ein Friseursalon mit Hinterzimmer und Männer, die Äxte für Gartenarbeit
  halten. Das Brennpunktteam kennt die Straßen, aber nicht alle Türen.“
- **Rodenkirchen:** „Villen am Rhein, hohe Hecken, Nachbarn, die nichts hören und nichts sehen. Hier wird nicht verkauft,
  hier wird bestellt, und man kennt den Namen am Telefon.“

## Spots (8 neue)

Koordinaten ungefähr, gegen das heutige Straßennetz gemessen (Regel: höchstens 60 m bis zur Straße, mindestens 200 m
Abstand zu anderen Spots). Vor dem Einbau auf der Karte setzen und mit `node scripts/check-roads.mjs` prüfen.

| Veedel | Spot | Art | Lage (lng, lat) | Straße | Nachfrage | Preis | Freischalten | Publikum |
|---|---|---|---|---|---|---|---|---|
| Zollstock | Höninger Platz | corner | 6.9405, 50.9068 | 1 m | 1,0 | 1,0 | 500 | stoner 1,3 |
| Zollstock | Südstadion | park | 6.9335, 50.9075 | 29 m | 0,9 | 0,95 | 450 | party 1,3 (Spieltage) |
| Chorweiler | Pariser Platz | corner | 6.8965, 51.0275 | außerhalb des Netzes | 1,2 | 0,8 | 400 | stoner 1,6, banker 0,2 |
| Chorweiler | Liverpooler Platz | station | 6.8990, 51.0252 | außerhalb des Netzes | 1,0 | 0,8 | 350 | stoner 1,4 |
| Vingst | Haltestelle Vingst | station | 7.0255, 50.9412 | 21 m | 1,1 | 0,85 | 400 | stoner 1,4 |
| Vingst | Kuthstraße | corner | 7.0300, 50.9425 | 60 m (knapp, verschieben) | 1,0 | 0,85 | 350 | stoner 1,3 |
| Rodenkirchen | Maternusplatz | corner | 6.9912, 50.8905 | 9 m | 0,8 | 1,3 | 700 | banker 1,8 |
| Rodenkirchen | Rheinufer Rodenkirchen | park | 6.9978, 50.8893 | 33 m | 0,9 | 1,25 | 650 | party 1,4, banker 1,4 |

Chorweiler liegt nördlich des Kölner Straßennetzes (Ausschnitt bis 51,02 °N): Das Netz muss mit `build-roads.py --city
koeln` und größerem `box` neu gebaut werden (Norden bis etwa 51,04 °N). Rodenkirchen und Zollstock liegen schon drin.

## Goon Gang

Heimat `altstadt-sued` (Chlodwigplatz ist dort schon ein Spot). Der Startbesitz verteilt sich im Code automatisch nach
Nachbarschaft zur Heimat jeder Gang (`territory`), deshalb nach dem Einbau prüfen, dass die Goon Gang Altstadt-Süd und
Zollstock hält und der Marienburger Kreis Bayenthal und Rodenkirchen.

- **Name:** Goon Gang. **Boss:** Willi Kaltenborn, genannt „der Torwächter“ (Severinstorburg). **Emblem:** 🏰
- **Stärke:** die höchsten Werte in Köln bei `fighting`, `start.people` und `start.money`, dazu hohe `aggression`. Als
  Maßstab: Hafenkolonne hat heute `fighting` 62, `people` 16; die Goon Gang etwa `fighting` 75, `people` 22,
  `money` 50.000. Genaue Zahlen über `npm run balance` einstellen, damit Köln schaffbar bleibt.
- **Schwäche:** Karneval und Rosenmontagszug am Chlodwigplatz bringen viel Polizei ins Revier (Idee: Heat steigt dort
  in der Session schneller).
- Stimmen in `gangs/texts.ts`, Rivalität in `GANG_RIVALRY` (Hauptgegner: Marienburger Kreis nebenan).

## Arbeitsschritte

1. Straßennetz Köln nach Norden erweitern (`build-roads.py`), `check-roads` grün.
2. Grenzen für die vier Stadtteile (`fetch-divisions.py` über Overture, dann `build-boundaries.mjs`); die Nachbarschaft
   der Veedel ergibt sich daraus.
3. Veedel in `veedel/data.ts`, Spots in `spots/config.ts`, Goon Gang in `gangs/data.ts` und `gangs/texts.ts`.
4. Alte Spielstände: neue Veedel ohne Besitzer oder mit Startbesitz per Migration; neue Spots kommen gesperrt dazu.
5. Tests (`territory.test.ts` zählt 12), Test-Spielstände neu (`npm run saves:build`), `npm run balance`, Tutorial-Touren
   prüfen, die mit festen Veedeln arbeiten.
6. Performance: `PERF=1 npm run perf:sim` vorher und nachher (8 Spots und eine Gang mehr sollten kaum zählen).
