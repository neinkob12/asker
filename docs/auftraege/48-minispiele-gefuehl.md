# Auftrag 48: Minispiele, die sich richtig gut anfühlen

Grundlage ist der Wunsch des Spielers vom 20.10.2026 (sinngemäß):

> Schau dir das ganze Spiel an und gestalte die Minispiele noch besser, sie sollen sich richtig gut anfühlen. Arbeite
> mit Kollegen (anderen Sessions im selben Repo) zusammen und überlege jeweils, was noch besser werden kann: Optik,
> Performance, Spaß, Schwierigkeit.

Dazu gilt weiter, was der Spieler früher gesagt hat:

- 07.10.2026: Die Konzepte von Container packen (wie Tetris), Verfolgungsjagd, Straßenkampf und Zivi oder Kunde sind
  gut. Tresor knacken ist im Grund gut, aber zu schwer. Die Optik muss besser werden, die Qualität insgesamt richtig gut,
  besonders die Autoflucht. Keine Fragen mit Wahrscheinlichkeit (außer man gibt an die Rechte Hand ab).
- Fragerunde zu Auftrag 47: Design-Art „fotorealistisch gemalt“ (nicht flach, nicht Comic, nicht Pixel), echtes 3D mit
  three.js, Modelle im Code aus Grundformen (kein Bildmaterial im Repo), 30 fps am Handy reichen. Für danach geplant:
  Razzia als Lauf-Spiel im Lager (3D, seitlich), Bude als Ego-Blick mit Taschenlampe (3D), Bewerbungsgespräch „eigene
  Fragen, Druck steuern“, Licht und Material für die 2D-Spiele, Figuren mit mehr Leben im Straßenkampf und bei den Kunden.
- 12.10.2026: Alle Minispiele sind aus (`MINIGAMES_ENABLED` in `minigames/config.ts`). **Das bleibt so**, bis der
  Spieler sie wieder einschaltet. Gespielt und geprüft wird über die Vorschau (`?minispiel=<art>`), die Bilder
  (`npm run screenshot:minigames`) und die neue Spielhalle in den Einstellungen (Teil F).

## Wer macht was

Eine steuernde Session (Branch `claude/auftrag-48-minispiele`) hat die Teile gestartet, prüft die PRs und baut Rahmen
und Baukasten. Jeder Teil ist eine eigene Cloud-Session mit eigenem Branch und Draft-PR.

| Teil | Thema | Ordner, die nur diese Session ändert |
| --- | --- | --- |
| A | Verfolgungsjagd (`chase`) | `minigames/ui/games/chase/`, `minigames/kinds/chase.ts`, dazu `minigames/ui/kit/scene3d.ts` und `kit/stage3d.ts` |
| B | Verkehrskontrolle (`traffic`), Papiere (`papers`) | `minigames/ui/games/traffic/`, `games/papers/`, `kinds/traffic.ts`, `kinds/papers.ts` |
| C | Straßenkampf (`brawl`), Tresor (`safe`) | `minigames/ui/games/brawl/`, `games/safe/`, `kinds/brawl.ts`, `kinds/safe.ts` |
| D | Razzia (`stash`), Bude (`search`) | `minigames/ui/games/stash/`, `games/search/`, `kinds/stash.ts`, `kinds/search.ts` |
| E | Container (`container`), Zivi oder Kunde (`undercover`), Bewerbungsgespräch (`interview`) | `minigames/ui/games/container/`, `games/undercover/`, `games/interview/`, `kinds/container.ts`, `kinds/undercover.ts`, `kinds/interview.ts` |
| F | Rahmen, Baukasten, Spielhalle, Abschluss (steuernde Session) | `minigames/ui/Frame.tsx`, `ui/flow.ts`, `ui/registry.ts`, `ui/minigames.css`, `ui/index.tsx`, `ui/preview.ts`, `ui/kit/` (außer `scene3d.ts`, `stage3d.ts`), `minigames/*.ts` (Kern), `CLAUDE.md`, `docs/architektur.md` |

## Regeln für alle Teile

1. **Nur die eigenen Ordner ändern.** Brauchst du etwas Gemeinsames, lege eine **neue** Datei in deinem Spiel-Ordner an.
   Ein neuer Baustein für alle darf als neue Datei in `minigames/ui/kit/` mit eigenem Namen kommen (z.B.
   `kit/indoor3d.ts`); bestehende Kit-Dateien ändert nur ihr Besitzer (Tabelle). Wünsche an Rahmen oder Kit: kurze
   Nachricht an die steuernde Session.
2. **Schnittstellen bleiben:** Score 0 bis 1, `winAt` der Art, die picks, die andere Module lesen (`applyChase`,
   `applyBrawl`, `applyTraffic`, `applyPapers` in `encounters/minigames.ts`, `police/stash.ts`, `police/undercover.ts`,
   `gangs/safe.ts`, `gangs/search.ts`, `trade/packing.ts`, `recruiting`). Neue picks dürfen dazukommen, alte nicht weg.
   `params`, die der Kern mitgibt, lesen, nicht ändern.
3. **Inhalte aus `challenge.seed` mit `createRng`**, nie `ctx.random()`; `Math.random()` nur für Optik. Spiellogik als
   reines Modell (`model.ts`) mit Tests, Zeichnen und Komponente getrennt.
4. **Keine neuen npm-Pakete.** three.js ist da (nur in `ui/`). Kein Bildmaterial im Repo, alles im Code (Formen,
   Verläufe, CanvasTexture, Shader).
5. **Optik-Regeln der Minispiele:** Look Glas für das HUD (`kit/hud.tsx`), Farben im Canvas über `mapToken`/Tokens, keine
   Emojis, `prefers-reduced-motion` schwächt Wackeln, Blitze und Zeitlupe ab, Zieltreffer am Handy mindestens 44 px.
6. **Vor jedem Push:** `npm run check` und `npm run build` grün, `npm run format`. Bilder mit
   `npm run screenshot:minigames -- --kind=<art> --sizes=desktop,mobile` ansehen (auch `--uhr=23`, `--schwer=0.9`,
   `--ergebnis=verloren`).
7. **Doku:** nicht in `CLAUDE.md` oder `docs/architektur.md` schreiben (das macht Teil F am Ende, sonst gibt es
   Konflikte), sondern in `docs/auftraege/48/<teil>.md` (was neu ist, Stellschrauben, Messwerte). Kurz.
8. **`main` bewegt sich:** `main` in den eigenen Branch mergen, nicht rebasen. Konflikte in `package-lock.json` nie von
   Hand lösen.
9. **PR:** Draft, Deutsch, Abschnitte „Was ist neu“, „Wie testen“, „Messwerte“ (Schwierigkeit und Leistung vorher und
   nachher), „Für die Integration“. Ist der PR fertig und die CI grün: Nachricht an die steuernde Session.

## Was „fühlt sich gut an“ heißt (Prüfliste für jedes Spiel)

Jede Session spielt ihr Spiel erst selbst (Vorschau, Bilder, Dev-Haken), schreibt die Schwächen auf und arbeitet sie
dann ab. Diese Liste ist der Maßstab:

**Spaß und Gefühl („Juice“)**
- Jede Eingabe hat sofort eine Antwort: Klang, Bewegung, bei Treffern `haptic()` aus `src/ui`.
- Treffer und wichtige Momente haben Gewicht: kurzer Stillstand (Hit-Stop, 40 bis 90 ms), Wackeln mit Abklingen,
  Aufblitzen, Partikel, Zahlen, die aufploppen.
- Vorfreude und Spannung: Ankündigung vor Gefahr (Blinken, Ton, Schatten), steigendes Tempo zum Ende, knappe Rettungen.
- Ein klarer Schlussmoment: Zeitlupe, letzter Schlag, Tür fällt zu; erst dann das Ergebnis.
- Fehler fühlen sich fair an: Man sieht, was passiert ist und warum.

**Lesbarkeit**
- Ziel, Gefahr und eigener Zustand sind auf einen Blick klar (Farbe, Größe, Kontrast, nicht nur Text).
- Die ersten 5 bis 10 Sekunden bringen das Spiel bei (leichter Anfang, ein Hinweis direkt am Ort statt Text vorher).
- Hochkant am Handy genauso gut spielbar wie am Desktop (Daumen-Zonen, nichts unter den Fingern Verdecktes).

**Optik („fotorealistisch gemalt“)**
- Licht und Material: weiche Schatten, Verläufe, Glanzlichter, Ambient Occlusion, Körnung, Tiefe (Nebel, Unschärfe).
- Figuren mit Leben: Atmen, Gewicht verlagern, Blinzeln, Reaktionen auf Treffer und Worte.
- Tageszeit, Wetter und Stadt aus der Lage (`params`) sichtbar.

**Schwierigkeit**
- Eine Simulation im Test (`model.balance.test.ts` oder in `model.test.ts`): ein „guter Spieler“ (einfache Regel, die
  das Richtige tut, mit kleiner Reaktionszeit), ein „schwacher Spieler“ (langsam, Fehler) und „keine Eingabe“, je bei
  Schwierigkeit 0,2, 0,5 und 0,9, mehrere Seeds. Richtwerte: guter Spieler gewinnt bei 0,5 in 85 bis 95 %, bei 0,9 in
  60 bis 80 %; schwacher Spieler bei 0,5 in 30 bis 60 %; keine Eingabe gewinnt nie. Dauer 30 bis 90 Sekunden.
- Die Zahlen gehören in den PR (vorher und nachher).

**Leistung**
- 3D-Spiele: 30 fps am Handy (`npm run perf:browser -- --scenes=jagd --mobile --throttle=4` misst die Jagd; für andere
  Spiele eine eigene Szene in `scripts/perf-browser.mjs` nur hinzufügen, nichts Bestehendes ändern). Geometrie
  zusammenführen, Materialien teilen, Schatten nur wo nötig, Pixelverhältnis begrenzen, alles beim Schließen freigeben.
- 2D-Spiele: kein Neuzeichnen von Statischem in jedem Bild (Hintergrund in eigenem Canvas oder `OffscreenCanvas`), keine
  Objekte pro Bild anlegen.
- Kein Absturz, keine Fehler in der Konsole, Speicher nach dem Schließen frei (`minigame3d.regression.test.ts`).

## Teile im Einzelnen

### A. Verfolgungsjagd

Die Autoflucht ist dem Spieler am wichtigsten. Stand: 3D mit freiem Lenken (Auftrag 47), Autos sehen aus wie Kisten,
Häuser wie Klötze mit großen Fensterkacheln, Kreuzungen voller Zebrastreifen, kaum Streifen im Bild.

- Optik: Autos mit Form (abgerundete Karosserie, Scheiben mit Spiegelung, Felgen, Licht), Fassaden mit Gliederung
  (Sockel, Gesims, Fensterrahmen, Balkone, Leuchtreklame, Kölner Altbau, Hamburger Backstein …), Straßen mit Bordstein,
  Markierung, nassen Spiegelungen, parkenden Autos, Laternen; Wahrzeichen erkennbar.
- Gefühl: Tempo spürbar (Kamera, FOV, Bewegungsunschärfe, Funken, Reifenspuren), Drift macht Spaß, Rammen hat Wucht,
  Streifen sind sichtbar und bedrohlich (Rückspiegel, Pfeile am Rand), Beinahe-Treffer belohnen (Turbo).
- Schwierigkeit und Leistung wie oben, Handy 30 fps.

### B. Verkehrskontrolle und Papiere

Stand Kontrolle: Ego-Blick aus dem Auto, aber der Beamte ist ein flacher Kopf auf einem Klotz, Innenraum aus Kisten.
Stand Papiere: 2D.

- Kontrolle: Innenraum und Beamter in 3D mit Form und Licht (Taschenlampe blendet, Blaulicht spiegelt sich im Regen auf
  der Scheibe), Gesicht reagiert (Misstrauen sichtbar), Spannung über Ton und Puls; Gespräch bleibt (Widersprüche),
  Antworten mit Zeitdruck, Lügen fühlen sich riskant an.
- Papiere: Licht und Material (Papier, Stempel, Tinte, Lampe), Druck durch den Beamten, Fehler sichtbar.

### C. Straßenkampf und Tresor

- Kampf: Figuren mit mehr Leben (Gewicht, Ausholen, Treffer-Reaktion, Taumeln, zu Boden gehen), Hit-Stop, Wackeln,
  Kombos, Ausweichen mit Zeitlupe, Crew-Züge mit Wucht; Licht und Material der Straße.
- Tresor: leichter zu lesen (Stethoskop, Klick, Zittern der Hand), haptisch (Rad mit Trägheit), Material (Stahl,
  Messing, Licht der Taschenlampe); Ziel „schaffbar, aber knapp“.

### D. Razzia und Bude (beide 3D, wie in der Fragerunde zu Auftrag 47 entschieden)

- Razzia: Lauf-Spiel im Lager, seitlich in 3D: Ware schnappen und verstecken bzw. raustragen, bevor die Polizei die Tür
  aufbricht (Countdown, Sirenen näher, Licht durch die Ritzen).
- Bude: Ego-Blick mit Taschenlampe, Verstecke absuchen, Lärm vermeiden.
- Ergebnis und picks wie bisher. Gemeinsame Bausteine für Innenräume als neue Datei `kit/indoor3d.ts`.

### E. Container, Zivi oder Kunde, Bewerbungsgespräch

- Container: Konzept bleibt (Tetris), Gefühl: Einrasten, Vorschau, Ablegen mit Gewicht, Kombos, Licht und Material.
- Zivi oder Kunde: Figuren mit mehr Leben, Zeichen fair lesbar, Tempo.
- Bewerbungsgespräch: „eigene Fragen, Druck steuern“: Du wählst, was du fragst, und wie hart (Druck), das Gegenüber
  reagiert sichtbar; kein Multiple Choice mit Würfel.

### F. Rahmen, Baukasten, Spielhalle (steuernde Session)

- Rahmen: Übergänge mit Gefühl (Einleitung, 3-2-1, Ergebnis mit Wertung und Bestwert), Klang und Haptik.
- Baukasten: Helfer für Wackeln, Hit-Stop, Zeitlupe, aufploppende Zahlen (`kit/juice.ts`), die alle nutzen können.
  Bis der in `main` ist, baut jedes Spiel seine kleinen Helfer im eigenen Ordner; umstellen kann man danach.
- Spielhalle: Einstellungen › Minispiele: jedes Minispiel als Vorschau starten (nichts zählt), mit Schwierigkeit.
- Am Ende: Doku in `CLAUDE.md` und `docs/architektur.md` aus `docs/auftraege/48/`.

## Stand

Gestartet am 20.10.2026. Die PRs der Teile stehen hier, sobald es sie gibt.
