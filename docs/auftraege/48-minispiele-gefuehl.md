# Auftrag 48: Minispiele, die sich richtig gut anfühlen (20.10.2026)

Wunsch des Spielers (sinngemäß): „Schau dir das aktuelle Spiel an und fang an, die Minispiele noch besser zu gestalten,
sie sollen sich richtig gut anfühlen. Arbeite mit Kollegen zusammen und überlege jeweils, was noch besser werden kann
(Optik, Performance, Spaß, Schwierigkeit).“

Die Minispiele bleiben im Spiel aus (`MINIGAMES_ENABLED = false`, Feedback vom 12.10.2026), bis der Spieler sie wieder
einschaltet. Ausprobieren über die Vorschau `?minispiel=<art>`, `npm run screenshot:minigames` und die Test-Spielstände
`?spielstand=minispiel-<art>`.

## Aufteilung

Eine Lead-Session (Rahmen, Baukasten, Skripte, Doku) und fünf Kollegen-Sessions, jede mit eigenen Ordnern und eigenem
Draft-PR gegen `main`. So lassen sich die PRs in beliebiger Reihenfolge mergen; Berührungen gibt es nur in der Doku.

| Teil | Minispiele | Ordner | Branch | Notizen |
| --- | --- | --- | --- | --- |
| Lead | Rahmen für alle | `minigames/ui/Frame.tsx`, `registry.ts`, `flow.ts`, `minigames.css`, `kit/` (außer 3D), `scripts/`, Doku | `claude/minigames-verbesserung-u7gczr` | diese Datei |
| Jagd | Verfolgungsjagd | `games/chase/`, `kit/scene3d.ts`, `kit/stage3d.ts` | `claude/minispiele-48-jagd` | `48-minispiele-jagd.md` |
| Kampf | Straßenkampf, Zivi oder Kunde | `games/brawl/`, `games/undercover/` | `claude/minispiele-48-kampf` | `48-minispiele-kampf.md` |
| Einbruch | Razzia-Countdown, Bude, Tresor | `games/stash/`, `games/search/`, `games/safe/` | `claude/minispiele-48-einbruch` | `48-minispiele-einbruch.md` |
| Gespräche | Verkehrskontrolle, Bewerbungsgespräch | `games/traffic/`, `games/interview/` | `claude/minispiele-48-gespraeche` | `48-minispiele-gespraeche.md` |
| Schreibtisch | Container, Papiere | `games/container/`, `games/papers/` | `claude/minispiele-48-schreibtisch` | `48-minispiele-schreibtisch.md` |

Regeln für alle: `onFinish(score, picks)` und die Folgen in den startenden Modulen bleiben, Inhalte nur aus
`challenge.seed`, Modell-Tests wachsen mit, `MINIGAMES_ENABLED` bleibt aus. CLAUDE.md und `docs/architektur.md` fasst die
Lead-Session am Ende zusammen.

## Bestandsaufnahme (Screenshots vom 20.10.2026)

- **Handy-Bildschirm:** Seit „Karte zuerst“ Standard ist (PR #131), lagen Tab-Leiste (z-index 40) und der Hinweis
  „Nächster Schritt“ (35) über dem Minispiel (26): Bremse, Turbo, „Ausweichen“ & Co. waren verdeckt.
- **Verfolgungsjagd:** Kästen mit riesigen gelben Fenstern, Karre als schwarzer Kasten, wenig Tempo-Gefühl, Minikarte
  über der Funk-Zeile am Handy.
- **Verkehrskontrolle:** 3D-Innenraum zerfällt in blaue Kästen, Hinweis „Er klopft ans Fenster“ doppelt.
- **Straßenkampf:** ordentlicher Vektor-Look, Figuren steif, Treffer ohne Gewicht.
- **Zivi oder Kunde, Container, Papiere, Tresor, Razzia, Bude, Gespräch:** spielbar, flach, wenig Licht und Material.
- **Rahmen:** Ergebnis nur Stempel und ein Satz (wie knapp es war, sieht man nicht), keine Ahnung vorab, wie schwer es wird.
- **Screenshot-Skript:** wartete am Handy oft vergeblich auf die Einleitung (ein anderer Dialog verdrängte die Vorschau
  kurz nach dem Start).

## Lead: Rahmen und Baukasten

- [x] Handy-Bildschirm: `.is-mapfirst .mg-overlay` liegt über Tab-Leiste und Hinweis (z-index 41).
- [x] Einleitung zeigt die **Lage** aus `challenge.difficulty` (Ruhig, Angespannt, Brenzlig, Kritisch; vier Striche wie
  beim Empfang, Farbe nach Stufe; `SITUATION_LEVELS` in `Frame.tsx`).
- [x] Ergebnis mit **Wertung**: Balken 0–100 mit der Schwelle (`winAt`) als Marke, zählt beim Erscheinen hoch
  (`SCORE_COUNT_SECONDS`), „Knapp!“ bis `CLOSE_MARGIN` an der Schwelle. Dazu ein kurzer Schein vom Rand in Grün bzw. Rot
  (`.mg-flash`). Bei „Bewegung reduzieren“ steht alles sofort.
- [x] **Werte aus dem Spiel** im Ergebnis: `onFinish(score, picks, stats?)` mit `MinigameStat { label, value, icon?, tone? }`
  (höchstens vier, nur Anzeige, nichts geht in den Spielstand). Rein additiv: Spiele ohne stats sehen aus wie bisher.
  Dev-Haken `minigameWin(score?, stats?)` / `minigameLose(score?, stats?)` zum Ausprobieren.
- [x] **Pause:** Gehen Tab oder App in den Hintergrund, hält der Rahmen das Spiel an (`running` false, Karte „Kurz
  angehalten“), weiter mit „Weiter“ und 3-2-1. Vertrag in `registry.ts`: `running` kann mitten im Spiel false und wieder
  true werden, das Spiel macht dann genau dort weiter.
- [x] **Ton:** Solange der Rahmen offen ist, tritt die Musik zurück (`audio.setFocus`, `FOCUS_MUSIC` 25 %) und die
  Geräusche der Stadt schweigen; Effekte und Stimmen bleiben.
- [x] `npm run screenshot:minigames`: wartet auf das HUD und öffnet die Vorschau neu, bis die Einleitung steht.
