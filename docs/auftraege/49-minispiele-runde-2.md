# Auftrag 49: Minispiele, zweite Runde (20.10.2026)

Wunsch des Spielers (sinngemäß, nach Auftrag 48): „Schau dir das aktuelle komplette Spiel an und gestalte die
Minispiele noch besser, sie sollen sich richtig gut anfühlen. Arbeite mit Kollegen zusammen, starte die Sessions selbst
und überlege jeweils, was noch besser werden kann (Optik, Performance, Spaß, Schwierigkeit).“

**Grundlage ist `main` mit Auftrag 48** (PRs #136 bis #141): Plan und Prüfliste in
[`48-minispiele-gefuehl.md`](48-minispiele-gefuehl.md), Notizen je Teil in `48-minispiele-<teil>.md` (jagd, kampf,
einbruch, gespraeche, schreibtisch). Diese Runde baut darauf auf: erst den heutigen Stand mit frischen Augen ansehen,
dann das Wichtigste besser machen. Nichts doppelt bauen, nichts aus Auftrag 48 zurückdrehen, ohne es zu begründen.

Die Minispiele bleiben im Spiel aus (`MINIGAMES_ENABLED = false`), bis der Spieler sie wieder einschaltet. Ausprobieren
über die Vorschau `?minispiel=<art>`, `npm run screenshot:minigames`, die Test-Spielstände `?spielstand=minispiel-<art>`
und (neu in Teil F) die Spielhalle in den Einstellungen.

## Aufteilung

Eine steuernde Session (Teil F, Branch `claude/auftrag-49-minispiele`) hat die Teile gestartet, prüft die PRs und baut
Rahmen und Baukasten. Jeder Teil ist eine eigene Cloud-Session mit eigenem Branch und Draft-PR gegen `main`.

| Teil | Minispiele | Ordner, die nur diese Session ändert | Branch | Notizen |
| --- | --- | --- | --- | --- |
| A | Verfolgungsjagd | `games/chase/`, `kinds/chase.ts`, `kit/scene3d.ts`, `kit/stage3d.ts` | `claude/auftrag-48-jagd` | `49/a-jagd.md` |
| B | Verkehrskontrolle, Papiere | `games/traffic/`, `games/papers/`, `kinds/traffic.ts`, `kinds/papers.ts` | `claude/auftrag-48-kontrolle` | `49/b-kontrolle.md` |
| C | Straßenkampf, Tresor | `games/brawl/`, `games/safe/`, `kinds/brawl.ts`, `kinds/safe.ts` | `claude/auftrag-48-kampf` | `49/c-kampf.md` |
| D | Razzia, Bude | `games/stash/`, `games/search/`, `kinds/stash.ts`, `kinds/search.ts` | `claude/auftrag-48-razzia-bude` | `49/d-razzia-bude.md` |
| E | Container, Zivi oder Kunde, Bewerbungsgespräch | `games/container/`, `games/undercover/`, `games/interview/`, die drei `kinds/` | `claude/auftrag-48-ware-leute` | `49/e-ware-leute.md` |
| F | Rahmen, Baukasten, Spielhalle, Doku | `ui/Frame.tsx`, `flow.ts`, `registry.ts`, `minigames.css`, `ui/index.tsx`, `preview.ts`, `kit/` (außer `scene3d.ts`, `stage3d.ts`), Kern `minigames/*.ts`, `CLAUDE.md`, `docs/architektur.md` | `claude/auftrag-49-minispiele` | diese Datei |

(Die Branches A bis E heißen aus dem Start heraus `auftrag-48-…`; gemeint ist diese Runde.)

## Regeln für alle Teile

1. **Nur die eigenen Ordner ändern.** Brauchst du etwas Gemeinsames, lege eine **neue** Datei an (im eigenen Ordner
   oder als neue Datei in `kit/` mit eigenem Namen). Bestehende Kit-Dateien ändert nur ihr Besitzer. Wünsche an Rahmen,
   Kit, `Face` oder andere Module: kurze Nachricht an die steuernde Session.
2. **Schnittstellen bleiben:** Score 0 bis 1, `winAt`, die picks, die andere Module lesen, `onFinish(score, picks,
   stats?)` mit `<art>Stats`. Neue picks dürfen dazukommen, alte nicht weg. `params` lesen, nicht ändern.
3. **Inhalte aus `challenge.seed` mit `createRng`**, nie `ctx.random()`; `Math.random()` nur für Optik. Spiellogik im
   Modell mit Tests, die Bots (`bot.ts`) wachsen mit.
4. **Keine neuen npm-Pakete, kein Bildmaterial** (alles im Code).
5. **Pause mitten im Spiel** (`running` wird false und wieder true) muss weiter gehen, `prefers-reduced-motion` schwächt
   Wackeln, Blitze und Zeitlupe ab, Zieltreffer am Handy mindestens 44 px, Handy hochkant gleich gut wie Desktop.
6. **Vor jedem Push:** `npm run check` und `npm run build` grün, `npm run format`; Bilder mit
   `npm run screenshot:minigames -- --kind=<art> --sizes=desktop,mobile` ansehen.
7. **Doku nur in `docs/auftraege/49/<teil>.md`** (was neu ist, Stellschrauben, Messwerte vorher und nachher). `CLAUDE.md`
   und `docs/architektur.md` fasst Teil F am Ende zusammen.
8. **`main` bewegt sich:** `main` in den eigenen Branch mergen, nicht rebasen. Nicht selbst nach `main` mergen.
9. **PR:** Draft, Deutsch, Abschnitte „Was ist neu“, „Wie testen“, „Messwerte“, „Für die Integration“. Ist er fertig
   und die CI grün: Nachricht an die steuernde Session.

## Vorgehen je Teil

1. **Frische Augen:** Den heutigen Stand spielen und ansehen (Desktop und Handy, Tag und Nacht, leicht und schwer,
   gewonnen und verloren, Bildfolgen um die wichtigsten Momente). Die Notizen aus Auftrag 48 lesen, vor allem „Offen“.
2. **Liste der fünf größten Schwächen** gegen die Prüfliste aus `48-minispiele-gefuehl.md` (Spaß und Gefühl,
   Lesbarkeit, Optik „fotorealistisch gemalt“, Schwierigkeit, Leistung), mit Bild oder Messwert als Beleg, in die
   eigene Notiz. Davon die mit der größten Wirkung zuerst.
3. **Umsetzen in Etappen**, jede für sich grün und gepusht.
4. **Belegen:** Bilder vorher und nachher, Bot-Zahlen (gut, schwach, keine Eingabe bei 0,2, 0,5 und 0,9), Bildrate.

## Startpunkte je Teil (aus „Offen“ in Auftrag 48 und der Durchsicht)

- **A Jagd:** Seitenansicht der Karre bei Drehern, Bewegungsunschärfe am Handy, der Screenshot am Handy lief headless
  in einen Timeout (Szene am Handy zu schwer?), Bedrohung durch Streifen in den ersten Sekunden.
- **B Kontrolle, Papiere:** Hinweise im Bild selbst entdecken (Kennzeichen im Außenspiegel, Ladung durch die
  Heckscheibe), Beamter und Innenraum mit mehr Form, Licht und Leben; Zöllner mit mehr Leben (braucht er etwas in
  `Face`, Nachricht an F); Schwierigkeit der Papiere mit einem Bot, der wie ein Mensch prüft.
- **C Kampf, Tresor:** Zuschauer am Rand, die bei harten Treffern reagieren; Tresor mit frischen Augen auf „schaffbar,
  aber knapp“ prüfen.
- **D Razzia, Bude:** Bude als Gang durch die Wohnung (Türen statt Leiste), Razzia mit mehr Spannung zum Schluss.
- **E Container, Zivi, Bewerbung:** Zivi oder Kunde mit ganzer Figur statt Porträt plus Unterkörper, Bewerbungsgespräch
  mit „Schweigen aushalten“ als zweiter Stufe des Drucks, Container mit frischen Augen.
- **F Rahmen:** Spielhalle in den Einstellungen (jedes Minispiel als Vorschau, mit Schwierigkeit, nichts zählt, mit
  Bestwert pro Gerät), gemeinsamer Baukasten für Wackeln, Hit-Stop, Zeitlupe und aufploppende Zahlen (`kit/juice.ts`),
  Übergänge mit Gefühl, Doku am Ende.

## Befunde der steuernden Session (main vom 20.10.2026, Handy 390 × 844)

Der Spieler spielt vom iPhone aus: hochkant am Handy zählt am meisten. Hinweise, keine Pflicht; die eigene Liste
entscheidet.

- **A Jagd:** Die Bilder am Handy laufen headless in eine Zeitüberschreitung bzw. „Protocol error (DOM.describeNode)“
  (Seite stürzt ab oder hängt). Prüfen, ob die Szene am Handy zu schwer ist (Speicher, Schatten, Pixelverhältnis).
- **B Kontrolle:** Der Beamte ist noch ein flaches Comic-Gesicht auf einem Körper aus Röhren (Arme wie dicke blaue
  Schläuche), Regen sind blaue Punkte statt Schlieren auf der Scheibe; in der Vorschau steht „1 Uhr“, die Spieluhr zeigt
  18:00. Papiere sind am Handy gut lesbar.
- **C Tresor:** Hinter der Einleitung ist die Bühne am Handy schwarz (das Rad erscheint erst, wenn das Spiel läuft); am
  Desktop sieht man den Tresor schon. Das erste Bild auch ohne laufende Schleife zeichnen.
- **D Razzia:** Hochkant ist die Kamera zu weit weg: die Figur ist winzig und strichdünn, oben ein Drittel nur Dach,
  unten ein Drittel nur Kanal, die Etiketten der Verstecke liegen über dem Regal. Am Handy näher ran (Kamera folgt der
  Figur). **Bude:** stimmungsvoll, aber fast alles schwarz; Lichtkegel am Handy größer.
- **E Zivi:** Porträt in der Karte und Beine darunter wirken getrennt (bekannt: ganze Figur); der Hinweis „Zu lange
  gezögert“ kommt schon nach wenigen Sekunden. Container und Bewerbung am Handy gut lesbar.
- **Alle:** Esc hält jetzt jedes Minispiel an (Rahmen, PR #142). Wer Esc selbst braucht, fängt die Taste mit
  `useGameKeys` ab (wie die Papiere). In der Spielhalle (Einstellungen › Minispiele) lässt sich jedes Spiel mit neuer
  Lage und Bestwert spielen.

## Stand

Gestartet am 20.10.2026. Die PRs der Teile stehen hier, sobald es sie gibt.
