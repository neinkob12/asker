# Köln Tycoon

Browserspiel für uns: Auf einer bunten 3D-Karte von Köln (im Look der Snapchat-Map) tauchen an festen Spots Kunden auf,
die Weed wollen. Du bestellst Ware am Hafen in Rotterdam, sie kommt per Schiff den Rhein hinauf und per Lkw ins Lager,
und du belieferst die Kunden.
Mit genug Geld heuerst du Läufer an, die einen Spot automatisch bedienen.

Wohin sich das Spiel entwickeln soll, steht in [`docs/konzept.md`](docs/konzept.md).
Wie der Code aufgebaut ist: [`docs/architektur.md`](docs/architektur.md), Kurzfassung in [`CLAUDE.md`](CLAUDE.md).
Wie wir parallel mit mehreren Claude-Sessions daran bauen: [`docs/auftraege/`](docs/auftraege/README.md).

## Starten

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse im Browser öffnen (meist http://localhost:5173).
Mit `npm run dev` ist das Spiel auch für Freunde im selben WLAN erreichbar (die "Network"-Adresse aus der Konsole).

## So wird gespielt

- **Neues Spiel:** Beim ersten Start wählst du den Modus. *Normal:* Nach einem Game Over darfst du einen älteren
  Spielstand laden. *Hardcore:* Bei Game Over wird der Spielstand gelöscht.
- **Zeit:** 1 echte Sekunde sind 5 Spielminuten. Oben kannst du pausieren (auch mit der Leertaste) oder auf 2x und 4x stellen.
  Die Zeit läuft nur, solange das Spiel offen ist.
- **Hafen Rotterdam** (Tab "Geschäft"): Paket kaufen (100 g, 500 g, 1 kg). Die Lieferung ist ca. 2,5 echte Minuten
  unterwegs, der Transporter fährt auf der Karte mit.
- **Spots:** Die Zahl im Kreis zeigt wartende Kunden. Gelb heißt jemand wartet, rot pulsierend heißt gleich ist er weg.
  Klick drauf zum Verkaufen.
- **Läufer:** Kosten einmalig 600 € und 80 € Lohn pro Spieltag (um Mitternacht). Sie bedienen ihren Spot automatisch,
  solange Ware im Lager ist. Ohne Geld für die Löhne kündigen sie.
- **Geld:** Verkäufe bringen Schwarzgeld. Sauberes Geld brauchst du später für Legales.
- **Handy:** Nachrichten von Figuren, teils mit Antwort-Knöpfen.
- **Game Over:** kein Geld, keine Ware und keine Lieferung unterwegs.
- **Spielstände** (Knopf "Menü"): Autosave, drei Speicherplätze, Export und Import als Datei.

## Anpassen

Einstellbare Werte liegen im jeweiligen Modul in `config.ts`:

| Was | Wo |
| --- | --- |
| Spots (Name, Koordinaten, Veedel, Andrang, Preisniveau) | `src/modules/spots/config.ts` |
| Geduld der Kunden, Andrang nach Uhrzeit | `src/modules/customers/config.ts` |
| Pakete, Preise, Lieferzeit, Hafen-Position | `src/modules/suppliers/config.ts` |
| Produkte, Grundpreis, Lager, Startbestand | `src/modules/goods/config.ts` |
| Läuferkosten, Lohn, Bedienzeit | `src/modules/staff/config.ts` |
| Startgeld, Startzeit, Zeitraffer, Autosave | `src/core/config.ts` |

Koordinaten findest du z.B. per Rechtsklick in Google Maps (erste Zahl ist `lat`, zweite `lng`).

## Technik

- [Vite](https://vite.dev) + TypeScript + [Preact](https://preactjs.com)
- [MapLibre GL](https://maplibre.org) für die Karte
- Vektorkacheln von OpenFreeMap (OpenMapTiles-Schema, ohne API-Key): Straßen, Wasser, Grün und 3D-Gebäude
- Spiellogik als deterministische Simulation in `src/core/` und `src/modules/`, getestet mit Vitest
- [Biome](https://biomejs.dev) für Lint und Formatierung

## Befehle

```bash
npm run dev          # Entwicklungsserver
npm run check        # Typecheck + Lint + Tests (vor jedem Push)
npm test             # nur Tests
npm run lint         # Biome + Ordnerregeln
npm run format       # Formatierung und Import-Reihenfolge reparieren
npm run build        # Typecheck + Build nach dist/
npm run screenshot   # Spiel im Headless-Browser öffnen, Screenshots nach screenshots/
```

Für `npm run screenshot` braucht es einen Chromium: `CHROMIUM_PATH` setzen oder `npx playwright install chromium`.
