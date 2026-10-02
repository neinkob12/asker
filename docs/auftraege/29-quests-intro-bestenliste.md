# Auftrag 29: Quests, Intro und Bestenliste

Damit Freunde das Spiel online spielen und sich vergleichen können.

## Umgesetzt

- **Quests von Peter** (Modul `quests`): 29 Quests in fünf Kapiteln (Ankommen, Dein Team, Wachsen, Die Straße,
  Boss von Köln), immer eine aktiv, Karte direkt unter Geld und Heat (HUD-Platz `'below'`), einklappbar, Tipp führt
  zur passenden Stelle, Übersicht als Handy-Seite. Belohnungen: Ware (auch Premium), Schwarzgeld, sauberes Geld, Ruf,
  weniger Heat, Erfahrung und Loyalität fürs Team, Einfluss, Titel "Boss von Köln". Überspringen geht ohne Belohnung.
- **Intro** beim allerersten Start (vier Seiten, überspringbar), danach der Name für die Bestenliste. Name und Intro
  lassen sich in den Einstellungen (Abschnitt "Spieler") ändern bzw. noch einmal ansehen.
- **Bestenliste** (Modul `leaderboard`, Server `api/leaderboard.ts`): Punkte = höchstes Vermögen im Durchgang, dazu
  Tage, Veedel, Ausgang, Modus, Titel. Jeder Durchgang steht einmal drin (nur Verbesserungen zählen). Das Spiel schickt
  bei Game Over, Sieg und zu jedem Spieltag. Anzeige im Game-Over- und Sieg-Bildschirm (Slot `core.ending`) und als
  Seite im Handy.
- **Abdunklung** (Vignette und Schleier der Karten-Dialoge) liegt über der ganzen Karte, auch hinter dem Handy.

## Einrichtung

Vercel-Projekt › Storage › Upstash Redis anlegen und verbinden, dann neu deployen.
