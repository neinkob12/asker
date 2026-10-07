# Auftrag 45: Feedback vom 07.10.2026 – Minispiele früher, Sammel- und Einzelbestellung, Handy Schritt für Schritt, Quests im Vordergrund

Grundlage ist das Feedback des Spielers vom 07.10.2026 (Sprachnachricht, sinngemäß):

> Die Ware, die man bei den Lieferanten bestellen kann, muss nach Kategorien geordnet sein. Man bestellt entweder als
> Sammelbestellung oder einzeln. Als Sammelbestellung ist die Chance höher, dass der Zoll den Wagen erwischt und die
> ganze Ware auf einmal weg ist, dafür ist der Preis besser, weil der Lieferant eine riesige Fuhre machen kann. Einzeln
> ist es unwahrscheinlicher, dass alles auf einmal gepackt wird, aber der Preis ist etwas teurer.
> Die Minispiele kommen auf dem iPad im Browser immer noch nicht. Ist alles gemergt und deployt?
> Am Anfang darf man noch nicht alle Funktionen im Handy haben, neue Spieler sind von der Menge überfordert; die
> Funktionen müssen nacheinander freigeschaltet werden. Und die Quests sind viel zu unauffällig, sie stehen am Anfang
> nicht im Vordergrund.

Die Arbeit lief in einer Session (Branch `claude/feedback-45-bestellung-handy-quests`), das Handy und die Quests
parallel in einer zweiten Arbeitskopie, danach zusammengeführt.

## Befund: GitHub, Deploy, Minispiele

- Alle Minispiel-PRs (#77 bis #88) sind gemergt, CI auf `main` ist grün, Vercel hat deployt. Offen sind nur die alten
  Entwürfe #18 (Auftrag 25) und #28 (Quests leichter), beide längst überholt.
- Die Minispiele laufen auch im Produktions-Build mit iPad-Größe und Touch (Querformat 1180 × 820, Hochformat 820 ×
  1180, iPad mini 744 × 1133, auch mit offenem Handy). Safari selbst ließ sich hier nicht testen, nur Chromium.
- Der eigentliche Grund: Sie kamen im normalen Spiel kaum. Gemessen mit dem Bot über 14 Tage und drei Seeds gab es
  kein einziges Minispiel; stand der Spieler selbst am Spot, kam das erste frühestens an Tag 8. Zivis kamen erst ab
  Heat 20, Kontrollen trafen immer die eigenen Leute, Razzien erst ab Heat 60.

## A. Minispiele kommen früher

- [x] A1 Zivi oder Kunde mit Grundrauschen: Wer selbst am Spot steht, bekommt auch ohne Heat ab und zu Zivis
  (`UNDERCOVER_BASE_CHANCE_PER_HOUR` 3 % pro Stunde, ab Heat 20 wie bisher steigend). Danach: erstes Minispiel an Tag 1
  bis 3, eins bis zwei pro Spieltag am Spot.
- [x] A2 Eine Kontrolle im Veedel, in dem du selbst stehst, trifft dich und nicht deine Leute (`playerStandingIn`), mit
  30 % Verfolgungsjagd.
- [x] A3 Drohende Beschlagnahme einer Lieferung: neue Wahl „Papiere fälschen“ (Minispiel Papiere), siehe B3.
- [x] A4 Peters Quest „Leute finden“ führt zum Bewerbungsgespräch (Minispiel), siehe D.
- Der Bot steht nie selbst am Spot und bestellt einzeln: Würfelfolgen, Szenario-Tests und `npm run balance` bleiben.

## B. Lieferanten: Kategorien, Sammel- und Einzelbestellung

- [x] B1 Das Angebot steht nach Warenart: Blüten, Hasch, Edibles, Öl, Vapes (`PRODUCT_CATEGORIES` in `goods`).
- [x] B2 Umschalter „Einzeln | Sammelbestellung“: Einzeln kauft jedes Paket sofort als eigene Lieferung zum normalen
  Preis. Gesammelt wählt man mit + die Pakete (höchstens acht, keine Container) und bestellt über die Fußzeile:
  5 % Rabatt pro Paket ab dem zweiten (höchstens 15 %), aber die große Fuhre fällt auf (Beschlagnahme mal 1,5 pro
  weiterem Paket, höchstens mal 3), und fliegt sie auf, ist alles auf einmal weg. Die Karte der Sammelbestellung zeigt
  Rabatt, Risiko für alles und daneben, was es einzeln kosten würde. Befehl `suppliers.orderBatch`, Werte in
  `GROUP_ORDER`.
- [x] B3 Droht einer Lieferung die Beschlagnahme, gibt es neben „Schmieren“ und „Aufgeben“ jetzt „Papiere fälschen“
  (Minispiel). Eine Sammellieferung fragt dann immer nach. Neue Sätze `papersSaved`/`papersFailed` in der Stimme jedes
  Lieferanten.
- [x] B4 Unterwegs, in der Dynamic Island, im Warenfluss und in den Bestellregeln zählt eine Sammellieferung alle
  Pakete.

## C. Handy Schritt für Schritt

- [x] C1 Ein neues Spiel zeigt im Handy erst nur Nachrichten und Einstellungen. Jede weitere App kommt mit der Quest,
  die sie braucht (`PHONE_APP_STEPS` in `quests/config.ts`): Lieferanten mit „Bestell Ware“, Kasse mit „1.000 €
  Umsatz“, Personal mit „Läufer“, Reviere mit „Neuer Spot“, Geldwäsche, Lager, Gangs mit „Konfrontation“. Die Apps
  lesen `phoneAppLocked(state, appId)` in `hiddenWhen`; gesperrt ist nur der Startbildschirm (mit Suche und
  Tastenkürzeln), Verweise aus Quests, HUD und Chats öffnen die App trotzdem.
- [x] C2 Peter sagt in seiner Nachricht, welche App neu ist; ein Banner „Neu im Handy: …“ öffnet sie. Solange Apps
  fehlen, steht auf dem Startbildschirm „Peters Quest“ mit „Noch n Apps kommen mit den nächsten Quests dazu“.
- [x] C3 Nur in neuen Spielen und nur in Köln (`PHONE_STEPS_CITIES`), vor dem Verkauf. Alte Spielstände behalten alle
  Apps (Migration `quests` 9). Abschaltbar in Einstellungen › Einstieg („Handy Schritt für Schritt“, Befehl
  `quests.setPhoneSteps`). Das Intro sagt, dass die Apps nach und nach kommen.

## D. Quests im Vordergrund

- [x] D1 Jede neue Quest kommt als goldenes Banner „Neue Quest: …“ von Peter mit Ton; ein Tipp öffnet seinen Chat
  (`ui.toast` kann dafür `title`, `color`, `appId`/`params` und `duration`).
- [x] D2 Die Quest-Karte im HUD klappt für jede neue Quest wieder auf und leuchtet kurz. In den ersten zwei Kapiteln ist
  sie golden umrandet und hat den Knopf „Zeig mir wie“, am Handy-Bildschirm bleibt dann auch der Hinweis sichtbar.
- [x] D3 Die Quest „Stell jemanden ein“ führt jetzt über das Bewerbungsgespräch (Minispiel): „Personal-App › Bewerber
  antippen › Gespräch führen, dann einstellen.“ ID, Zähler und Platz in der Liste bleiben (der Index steht im
  Spielstand).
- Nicht gebaut: Peters erste Begrüßung als Anruf (der Anruf übernähme direkt nach dem Start-Dialog das Handy und lüde
  gleich das Sprachmodell), ein „Neu“-Punkt an den Kacheln (passt nicht zum Zähler am Symbol).

## Offen

- Safari auf dem iPad selbst ließ sich hier nicht testen. Kommen dort weiterhin keine Minispiele, obwohl man am Spot
  steht, braucht es einen Blick in die Browser-Konsole des iPad.
- `npm run saves:build` legt die Test-Spielstände neu an; dann haben auch sie „Handy Schritt für Schritt“ an (bis
  dahin aus, weil sie vor Version 9 entstanden sind).
