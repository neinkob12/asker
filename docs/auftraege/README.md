# Bauplan: Aufträge für parallele Claude-Sessions

Hier liegen die Aufträge, mit denen der Prototyp zu einem richtigen Spiel ausgebaut wird.
Jeder Auftrag ist ein Prompt für eine eigene Claude-Session.
Der Plan ist so geschnitten, dass mehrere Sessions gleichzeitig arbeiten können, ohne sich in die Quere zu kommen.

## Ablauf

```
Phase 0  Fundament          1 Session, allein          00-fundament.md
            │  PR mergen
            ▼
Phase 1  Systeme            5 Sessions gleichzeitig    10 bis 14
            │  PRs nacheinander mergen
            ▼
Phase 2  Integration        1 Session, allein          20-integration.md
```

1. **Phase 0 (Fundament):** Eine Session baut den Prototyp in die neue Architektur um. Danach hat jedes Spielsystem einen eigenen Ordner mit fester Schnittstelle. Solange Phase 0 läuft, arbeitet niemand sonst am Code.
2. **Phase 1 (Systeme):** Wenn der PR aus Phase 0 in `main` ist, starten fünf Sessions gleichzeitig. Jede arbeitet nur in ihren eigenen Ordnern (Tabelle unten).
3. **Phase 2 (Integration):** Wenn alle fünf PRs gemergt sind, verbindet eine Session die Systeme miteinander, balanciert und testet das Ganze.

## Wie eine Session gestartet wird

Neue Claude-Code-Session auf diesem Repo starten und diesen Prompt einfügen (Dateinamen anpassen):

```
Setze den Auftrag in docs/auftraege/00-fundament.md vollständig um.
Lies vorher CLAUDE.md (falls vorhanden), docs/konzept.md und docs/auftraege/README.md.
```

## Wer arbeitet wo (Phase 1)

| Auftrag | Thema | Ordner, die nur diese Session ändert |
| --- | --- | --- |
| [10](10-veedel-reviere-polizei.md) | Veedel, Reviere und Polizei | `src/modules/veedel/`, `src/modules/territory/`, `src/modules/police/` |
| [11](11-gangs-konfrontationen.md) | Gangs und Konfrontationen | `src/modules/gangs/`, `src/modules/encounters/` |
| [12](12-wirtschaft-ware.md) | Wirtschaft und Ware | `src/modules/goods/`, `src/modules/market/`, `src/modules/suppliers/`, `src/modules/customers/`, `src/modules/spots/`, `src/modules/reputation/`, `src/modules/laundering/` |
| [13](13-personal-hierarchie.md) | Personal und Hierarchie | `src/modules/staff/`, `src/modules/hierarchy/`, `src/modules/recruiting/` |
| [14](14-look-handy.md) | Look, Spiel-Handy und Sound | `src/ui/`, `src/map/`, `src/audio/`, `src/modules/weather/`, `public/` |

`src/core/`, `src/main.tsx`, `index.html`, `scripts/`, `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md`, `package.json`, `package-lock.json`, die Konfigurationsdateien im Repo-Root (`tsconfig.json`, `vite.config.ts`, `biome.json`) und `.github/` gehören in Phase 1 niemandem. Die ändert erst wieder die Integration.

Was jede Session nach dem Fundament vorfindet und welche Schnittstellen sie nutzen kann, steht in [`docs/architektur.md`](../architektur.md) im Abschnitt "Was die parallelen Sessions vorfinden".

## Regeln für alle Sessions in Phase 1

1. **Nur die eigenen Ordner ändern.** Alles außerhalb der Tabellenzeile ist tabu.
2. **Fehlt etwas bei einem anderen Modul, nicht dort einbauen.** Stattdessen im eigenen Modul mit einer Übergangslösung arbeiten und den Wunsch im PR unter "Für die Integration" aufschreiben.
3. **Öffentliche Schnittstellen nur erweitern, nie brechen.** Andere Sessions benutzen sie gleichzeitig. Muss etwas wegfallen, kommt das unter "Für die Integration".
4. **Andere Module nur über ihre öffentliche Schnittstelle nutzen:** die Exporte aus `index.ts`, ihre Befehle und ihre Ereignisse.
5. **Keine neuen npm-Pakete, außer es geht wirklich nicht ohne.** Dann im PR begründen.
6. **Ändert sich die Form des eigenen Spielzustands:** Version hochzählen und eine Migration schreiben, damit alte Spielstände weiter laden.
7. **Vor jedem Push `npm run check` ausführen.** Es muss grün sein, und das eigene Modul braucht Tests. `npm run check` prüft auch die Ordnerregeln aus `CLAUDE.md`.
8. **Selbst ausprobieren:** das Spiel im Browser starten (z.B. `npm run screenshot`, siehe `scripts/screenshot.mjs`) und prüfen, dass das Neue funktioniert.
9. **Wurde `main` zwischendurch geändert, weil andere PRs gemergt wurden:** `main` in den eigenen Branch mergen, nicht rebasen.
10. **PR-Beschreibung mit drei Abschnitten:** "Was ist neu", "Wie testen", "Für die Integration".

## Stand

Phase 0, Phase 1 und Phase 2 (Integration, Branch `claude/integration-20`) sind erledigt. Neue Arbeit kommt als
eigene Aufträge (unten), jede Session darf dann wieder den ganzen Code ändern, sofern der Auftrag nichts anderes
sagt. Vor jedem Push: `npm run check`, `npm run build`, `npm run e2e`.

## Mergen

- Ein PR wird gemergt, sobald er fertig und die CI grün ist. Die Reihenfolge in Phase 1 ist egal.
- Meldet GitHub nach einem Merge einen Konflikt in einem anderen PR, schreibst du dessen Session: "Merge main in deinen Branch und löse die Konflikte."
- Konflikte in `package-lock.json` nie von Hand lösen, sondern mit `npm install` neu erzeugen.

## Danach (spätere Aufträge)

Diese Themen aus dem Konzept kommen nach der Integration, jeweils wieder als eigene Aufträge:

- Logistik: Fahrzeugflotte, echte Straßenrouten, mehrere Lager, Kontrollen unterwegs
- Tarnfirmen mit eigenem Gameplay und ausgebaute Geldwäsche
- Kampagne: Aufträge von Figuren, Charakter-Erstellung, Siegbedingung "Köln übernehmen" mit Abspann
- Fortschritt: Upgrade-Baum, Rang-Stufen, Immobilien
- Stadt-Events und Sonderaufträge
- Inhalte: KI-Porträts und -Illustrationen, Musik und Sounds
- Hosting: online mit Passwortschutz für den Freundeskreis
- Eigener Anbau
- Multiplayer
