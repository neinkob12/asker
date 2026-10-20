# Auftrag 49, Teil C: Straßenkampf und Tresor

Zweite Runde nach Auftrag 48 (`48-minispiele-kampf.md`, Tresor in `48-minispiele-einbruch.md`). Ordner:
`minigames/ui/games/brawl/`, `games/safe/`. Vertrag unverändert: Score, `winAt`, picks (`down:<n>`, `fled:<n>`,
`hurt:<staffId>`, `playerHurt`, `ko`, `grabbed`, `sirens`, `cracked:<n>`), `applyBrawl`, `gangs/safe.ts`.

## Frische Augen: die fünf größten Schwächen (vorher)

Bilder: `npm run screenshot:minigames -- --kind=brawl,safe --uhr=23` (Desktop und Handy, Nacht, Regen).

1. **Kampf, Figuren flach:** Glieder sind gleich dicke Striche mit dickem Umriss (Strichmännchen mit Gelenken), der
   Rumpf ein breiter Strich. Kein Volumen, keine Muskeln, Licht nur als blasser Strich daneben.
2. **Kampf, alles in einer Reihe:** Die zwei Ebenen liegen nur 0,42 m (Bild) auseinander und sind nur 12 % kleiner;
   hinten und vorn sieht man kaum, Figuren verdecken sich, wirkt wie eine Reihe.
3. **Kampf, Boden ohne Halt:** Schatten unter den Füßen ist eine harte, dunkle Ellipse; kein Licht der Laterne auf
   den Figuren am Boden, keine Zuschauer, die auf harte Treffer reagieren (Offen aus Auftrag 48).
4. **Tresor, schwer zu lesen:** Der satte Klick an der Zahl kommt beim Drehen mitten in vielen Klicks; man hört ihn,
   dreht aber weiter (Reaktionszeit 0,3 bis 0,5 s bei 22 Strichen/s = 7 bis 11 Striche). Ab 6 Strichen zurück gilt es
   als falsche Richtung, also einmal ganz herum. Man sieht nicht, wo es geklickt hat.
5. **Schwierigkeit:** Kampf ohne Eingabe gewinnt auf 0,2 manchmal (die Crew macht es allein), auf 0,9 gewinnt der
   geübte Bot 83 % (Richtwert 60 bis 80), Kämpfe dauern 22 bis 28 s (Richtwert 30 bis 90). Tresor: kein Bot, keine
   Zahl.

### Messwerte vorher

Straßenkampf (Bot aus `bot.ts`, 40 Seeds, drei Gegner, eine Crew, Absicht „Ware“): Gewinnquote, Dauer.

| Schwierigkeit | geübt | locker | wild | keine Eingabe |
| --- | --- | --- | --- | --- |
| 0,2 | 100 % · 22 s | 100 % · 22 s | 78 % · 23 s | 5 % · 31 s |
| 0,5 | 95 % · 24 s | 100 % · 25 s | 50 % · 22 s | 0 % · 20 s |
| 0,9 | 83 % · 25 s | 90 % · 28 s | 30 % · 23 s | 0 % · 11 s |

Tresor (neuer Bot `safe/bot.ts` auf dem alten Modell, 60 Seeds; geübt: Reaktion 0,25 s, liest die Zahl genau;
schwach: 0,5 s, liegt 2 Striche daneben): geübt 100 % in 10 s, schwach 100 % (0,2 und 0,5) bzw. 45 % (0,9), keine
Eingabe 0 %. Mechanisch also nicht schwer, wenn man die Regel kennt: Das Schwere war das Lesen (Klick finden, Zahl
merken, nicht überdrehen), und das kann ein Bot nicht messen.

## Was neu ist

### Tresor

- **Rad hakt an der Zahl:** Beim Ziehen, Halten und im Schwung bleibt das Rad an der richtigen Zahl `catchTime`
  Sekunden hängen (0,42 s leicht bis 0,2 s schwer, `CATCH_EASY`/`CATCH_HARD`), mit hellem, doppeltem Metallklick
  (`SAFE_SOUNDS.tumbler`), Haptik und Kreidestrich am Rad an der Stelle. Wer in der Zeit loslässt, steht richtig.
  Einzelne Tipps (Pfeil, ←/→) hakeln nie, damit Feinarbeit genau bleibt. Modell: `turnHeld`, `SafeState.caught`.
- **Störklicks** ab 0,4 (einer je Zahl, ab 0,8 zwei; `DECOY_FROM`, `DECOY_TWO_FROM`): Kurz vor der Zahl hakt es auch an
  falschen Stellen, kürzer (`DECOY_CATCH`) und dumpf (`SAFE_SOUNDS.thud`), das Stethoskop zuckt nur halb, die Membran
  leuchtet matt. Daraus kommt jetzt die Spannung („war es das?“) statt aus dem Überdrehen.
- **Schwung:** Losgelassen im Ziehen läuft das Rad nach (`SPIN_FRICTION`) und hakt dabei ebenso.
- **Zeit** 48 s bis 0,2, 34 s ab 0,9, gleitend (`DURATION_EASY`, `DURATION_HARD`).
- **Beibringen am Ort:** Beim ersten Haken sagt die Zeile „Es hakt. Loslassen und einrasten.“ bzw. „Hell und satt =
  die Zahl, dumpf = Störklick.“
- **Material und Licht:** Messingring mit Abrieb, Kratzer im Stahl (fest aus einem Startwert), Lackglanz auf dem
  Zifferblatt, Stethoskop als Bruststück mit Schlauch an der Tür (zuckt beim Klick), warmer Kern der Taschenlampe.
- **Bot** `safe/bot.ts` mit Test in `model.test.ts`.
