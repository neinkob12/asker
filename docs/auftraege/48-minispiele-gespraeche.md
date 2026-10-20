# Auftrag 48, Teil Gespräche: Bewerbungsgespräch und Verkehrskontrolle

Branch `claude/minispiele-48-gespraeche`, eine Kollegen-Session der Lead-Session (Minispiele besser machen,
20.10.2026). Ordner: `src/modules/minigames/ui/games/interview/` und `games/traffic/`. Rahmen, Baukasten (`kit/`) und
die Folgen in `recruiting` und `encounters` sind unverändert; der Vertrag (`onFinish(score, picks)`, Bedeutung der
picks) bleibt.

Wunsch des Nutzers, der für beide gilt: keine Glücks-Fragen. Was richtig ist, muss sich aus dem ableiten lassen, was
man sieht.

## Bestandsaufnahme (vorher)

- **Bewerbungsgespräch:** reines Reaktionsspiel. Die Fragen kamen von selbst, der Spieler hörte nur zu und tippte bei
  Zeichen. Der Name des gerade gezeigten Zeichens oder der Geste stand als Text unten (verriet die Lösung zur Hälfte).
  Am Handy lag die Person klein oben, die Mitte war leer. Offen aus Auftrag 48: „eigene Fragen, Druck steuern“.
- **Verkehrskontrolle:** Der Körper des Beamten war ein Klotz, das Porträt saß zu klein darauf, der Bildausschnitt
  zeigte vor allem seine Brust. Nachfragen („Wo kommen Sie her?“ zum zweiten Mal) prüften das Gedächtnis, nicht die
  Logik, weil die eigenen Aussagen nirgends standen. Zeitdruck war unsichtbar (Misstrauen stieg leise). Bei einem
  Widerspruch kam nur ein Satz und ein roter Rand. Die Frage „Ist das Ihr Transporter?“ hatte in gut einem Viertel der
  Fälle keine falsche Antwort.

## Bewerbungsgespräch: eigene Fragen, Druck steuern

- **Eigene Fragen:** Jede Runde liegen drei Fragekarten auf dem Tisch (1 bis 3), jede nennt, was sie prüft (zwei bis
  drei Eigenschaften als Chips). Mindestens eine trifft etwas, das die Person hat und noch keiner weiß (`offerFor`).
  Antwortet die Person unauffällig, steht im Urteil „Nichts davon: …“ (`ruledOutBy`): Auch das ist Wissen. Nach
  `CHOOSE_TIME` (9 s) nimmt das Spiel die erste Karte. Antwort und Zeichen hängen an Seed und Frage, nicht an der
  Position auf dem Tisch (eigener Zufallsstrom je Runde und Frage).
- **Druck:** Blick halten (Knopf links, die Person gedrückt halten, F oder ↑) hebt den Druck, loslassen senkt ihn
  (`PRESSURE`). Jede Person hat eine Zone (`BAND`; Lage nach Eigenschaften `TRAIT_BAND`, Hitzköpfe und Feiglinge
  machen früher zu, Angeber halten mehr aus; Breite und Wandern nach Schwierigkeit). Darunter ist sie locker: Zeichen
  huschen nur kurz vorbei (`CALM_LEN` des Fensters) und sind blasser. In der Zone ist sie angespannt: Zeichen stehen
  das volle Fenster. Darüber macht sie zu; nach `CLOSE_AFTER` bricht sie die Antwort ab (Stuhl knarrt, ein Satz aus
  `CLOSED_LINES`), was nicht mehr kam, fehlt.
- **Sichtbar statt geraten:** Ring um das Porträt (Zone als helles Bogenstück, Knopf für den Druck), Wort darunter
  („Locker“, „Angespannt“, „Macht zu!“), Gesicht (müde, hart, rötlich), die Lampe brennt mit dem Druck heller auf das
  Gesicht und die Ränder werden dunkel (`--iv-p`). Herzschlag, solange sie angespannt ist, schneller mit mehr Druck.
- **Rückmeldung:** Nach jedem Tippen steht kurz, was es war („Schwitzen“ grün bzw. „Nicken: harmlos“ rot). Der Name
  des Zeichens steht nicht mehr vorher da. Punkte zeigen, wie viele Zeichen nötig sind (`HITS_NEEDED`, leicht die
  Hälfte, schwer drei Viertel).
- **Handy:** größeres Porträt, Karten untereinander, zwei Daumen: links „Blick halten“, rechts „Zeichen!“.

Messwerte (Test-Bot in `interview/model.test.ts`, 24 Gespräche je Wert, Druck mittig in der Zone, Blick auf den Ring
alle 0,25 s):

| Schwierigkeit | Reaktion 0,3 s | 0,55 s | 0,8 s | ohne Druck (0,4 s) | Dauerdruck |
| --- | --- | --- | --- | --- | --- |
| 0,2 | 100 % | 100 % | 100 % | 100 % | 42 % |
| 0,5 | 100 % | 100 % | 100 % | 42 % | 42 % |
| 0,9 | 100 % | 100 % | 42 % | 42 % | 42 % |

(42 % sind die Runden mit unauffälliger Antwort, die man ohne Fehlalarm immer richtig hat.) Dauer 32 bis 38 s ohne
Bedenkzeit, mit 3 s Bedenkzeit je Karte gut 40 s. Ein Mensch braucht für „Zeichen oder Geste?“ eher 0,5 bis 0,6 s: Auf
schwer ist das knapp machbar, auf leicht großzügig.

## Verkehrskontrolle: nachgeschärft

- **Logik statt Gedächtnis:** Links steht unter „Er sieht“ jetzt auch „Du sagtest“ (Woher, Wohin, Wagen, Hinten,
  Vorhaben; `STORY_LABELS`, `storyText`). Fliegt etwas auf, leuchtet rot auf und wackelt, woran es hing
  (`contradictionTopics`: jede sichtbare Tatsache wird probeweise geändert, die frühere Aussage probeweise vergessen;
  passt die Antwort dann, hing es daran; Antworten brauchen dafür keine eigene Angabe).
- **Zeitdruck:** Unter der Frage läuft seine Geduld ab (`patience`). Nach `SLOW_AFTER` (16 s leicht bis 10 s schwer)
  wird er ungeduldig wie bisher, nach `SILENT`-mal so lange zählt Schweigen als Widerspruch („Keine Antwort ist auch
  eine Antwort.“).
- **Er reagiert sichtbar:** Bei einem Widerspruch erst ein Moment Stille („…“, roter Rand), er beugt sich näher heran,
  hebt die Taschenlampe und leuchtet dir ins Gesicht (Blendung über dem Bild), die Kamera ruckt; dann sein Satz.
- **Beamter und Bild:** Figur aus weichen Grundformen (Kapseln: Jacke mit Reflexstreifen, Gürtel, Schultern, Mütze mit
  Schirm, Hand am Gürtel, Lampe), Oberkörper beugt sich an der Hüfte vor (beim niedrigen Wagen tiefer). Das Porträt hat
  die Größe des Kopfes in der Szene und blendet unten weich in den Körper über. Kamera auf Kopf und Brust, schmaleres
  Sichtfeld (60°, hochkant 82°). Dachhimmel hell, tagsüber etwas Licht im Innenraum (vorher war oben alles schwarz).
- **Atmosphäre:** Blaulicht wandert durch den Innenraum (Punktlicht im Takt des Streifenwagens) und als Schein über das
  Bild und das Gesicht (`--traffic-blue`, `--traffic-red`). Regen als gemalte Tropfen und Rinnsale auf der Scheibe
  (Textur fest aus dem Seed, Rinnsale laufen langsam); auch die Regenstriche draußen kommen jetzt aus dem Seed statt
  aus `Math.random`. Nacht weniger ausgebrannt (Fenster, Laterne und Glühen gedämpft).
- **Mehr zu entscheiden:** neue Antwort „Von einem Kumpel aus Hamburg.“ auf „Ist das Ihr …?“; jetzt hat fast jede
  Frage eine Antwort, die auffliegt (Test: unter 3 %, vorher 26 % bei dieser Frage).

Test-Bot (`traffic/model.test.ts`): Wer logisch antwortet (6 s je Frage, Schwierigkeit 0,9), kommt in 30 von 30 Fällen
ohne Widerspruch durch; wer rät, in weniger als 10. Dauer im Mittel 30 bis 90 s.

## Leistung

Headless (SwiftShader) sind beide 3D-Fassungen gleich langsam (alt 0,2, neu 0,3 Bilder pro Sekunde bei 1440 × 900),
die Messung taugt nur zum Vergleich. Die Kontrolle hat nachts gleich viele Lichter wie vorher (das Innenlicht gibt es
nur tagsüber), die Tropfen sind eine Textur statt 90 Kugeln. Das Gespräch ist reines DOM; Ring und Druck gehen pro Bild
direkt ins DOM (`setAttribute`, CSS-Variable), gerendert wird höchstens alle 0,25 s.

## Für die Integration

- `minigame-ui.regression.test.ts` (liegt in `games/`): `initInterview(setup)` braucht jetzt den Aufbau (eine Zeile).
- `scripts/e2e.mjs`: Der Schritt „Bewerbungsgespräch“ läuft weiter (tippt „Zeichen!“, bis das Ergebnis steht), weil
  die erste Karte nach 9 s von selbst genommen wird; schneller wird er, wenn er vorher `.iv-card` antippt, sobald eine
  da ist (`page.locator('.iv-card:enabled').first()`).
- CLAUDE.md / Architektur: Bewerbungsgespräch „eigene Fragen, Druck steuern“ ist erledigt (Stellschrauben oben),
  Verkehrskontrolle mit Geduld, „Du sagtest“ und `contradictionTopics`.

- Pause (Rahmen-PR #136): Beim Anhalten verstummt die Stimme und „Blick halten“ lässt los. Im Gespräch spricht die
  Person beim Weitermachen den Rest der Antwort ab dem Wort, bei dem der Text steht. In der Kontrolle wiederholt der
  Beamte seine Frage, wenn er auf eine Antwort wartet. Zeit, Geduld und Druck stehen in der Pause still (die
  Bildschleife steht). Getestet nur im Code, nicht mit dem Pause-Haken aus #136.
- Ergebnis-Werte: `interviewStats(state)` (Richtig gelesen, Zeichen erkannt, Fehlalarme, Zugemacht) und
  `trafficStats(state)` (Widersprüche, Misstrauen, Antworten, Dauer) liefern je vier Werte in der Form von
  `MinigameStat`. Sie hängen noch nicht an `onFinish`, weil das dritte Argument erst mit #136 in main kommt.

## Offen

- Bewerbungsgespräch: „Schweigen aushalten“ (am Ende einer Antwort weiter den Blick halten, dann rutscht ein Nachsatz
  mit einem Zeichen heraus) wäre eine schöne zweite Stufe des Drucks.
- Verkehrskontrolle: Hinweise im Bild selbst entdecken (Kennzeichen im Außenspiegel, Ladung durch die Heckscheibe), die
  Liste links bleibt dann für das Handy.
