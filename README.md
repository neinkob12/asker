# Köln Tycoon

Browserspiel für uns: Auf der Satellitenkarte von Köln tauchen an festen Spots Kunden auf, die Weed wollen.
Du bestellst Ware am Hafen in Rotterdam, sie wird per Transporter nach Köln gebracht, und du belieferst die Kunden.
Mit genug Geld heuerst du Läufer an, die einen Spot automatisch bedienen.

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse im Browser öffnen (meist http://localhost:5173).
Mit `npm run dev` ist das Spiel auch für Freunde im selben WLAN erreichbar (die "Network"-Adresse aus der Konsole).

## So wird gespielt

- **Zeit:** 1 echte Sekunde sind 5 Spielminuten. Oben kannst du pausieren (auch mit der Leertaste) oder auf 2x und 4x stellen.
- **Hafen Rotterdam:** Paket kaufen (100 g, 500 g, 1 kg). Die Lieferung ist ca. 2,5 echte Minuten unterwegs, der Transporter fährt auf der Karte mit.
- **Spots:** Die Zahl im Kreis zeigt wartende Kunden. Gelb heißt jemand wartet, rot pulsierend heißt gleich ist er weg. Klick drauf zum Verkaufen.
- **Läufer:** Kosten einmalig 600 € und 80 € Lohn pro Spieltag (um Mitternacht). Sie bedienen ihren Spot automatisch, solange Ware im Lager ist. Ohne Geld für die Löhne kündigen sie.
- **Nachfrage:** Abends und nachts ist mehr los, vormittags wenig.
- Der Spielstand wird automatisch im Browser gespeichert.

## Anpassen

| Was | Wo |
| --- | --- |
| Spots (Name, Koordinaten, Andrang, Preisniveau) | `src/data/spots.ts` |
| Lager- und Hafenposition | `src/data/spots.ts` |
| Preise, Lieferzeit, Geduld der Kunden, Läuferkosten, Zeitraffer | `src/game/config.ts` |

Koordinaten findest du z.B. per Rechtsklick in Google Maps (erste Zahl ist `lat`, zweite `lng`).

## Technik

- [Vite](https://vite.dev) + TypeScript, kein Framework
- [MapLibre GL](https://maplibre.org) für die Karte
- Satellitenbild von Esri World Imagery, 3D-Gebäude von OpenFreeMap (beide ohne API-Key)
- Spiellogik in `src/game/engine.ts`, getestet mit `npm test`

## Befehle

```bash
npm run dev        # Entwicklungsserver
npm test           # Tests der Spiellogik
npm run build      # Typecheck + Build nach dist/
```
