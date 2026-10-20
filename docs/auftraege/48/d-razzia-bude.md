# Auftrag 48, Teil D: Razzia (`stash`) und Bude (`search`)

Branch `claude/auftrag-48-razzia-bude`. Ausgangslage: Beide Spiele sind seit der Runde „Einbruch“
(`docs/auftraege/48-minispiele-einbruch.md`) schon 3D (Razzia seitlich, Bude im Ego-Blick). Diese Runde arbeitet die
Prüfliste „fühlt sich gut an“ aus `48-minispiele-gefuehl.md` ab.

## Bestandsaufnahme (selbst gespielt, Playwright mit echten Eingaben, Desktop und Handy)

Vorschau startet sauber (`?minispiel=stash`, `npm run screenshot:minigames -- --kind=stash,search` ohne Hänger).

**Bude**
- **Fehler:** Ein Mausklick sucht oft nichts. Die Kamera dreht mit dem Zeiger mit, das Ding wandert unter dem
  Mauszeiger weg; der Name bleibt aber stehen (Hover wird nur bei Mausbewegung neu bestimmt). Klick ins Leere, keine
  Rückmeldung.
- Außerhalb des Lichtkegels ist alles schwarz, der Kegel hat einen harten Rand: Man sieht nicht, wo Möbel stehen,
  sucht blind. Wohnzimmer und Küche sind auch im Licht dunkel und schwer zu lesen.
- Kein Hinweis, was durchsuchbar ist, bis man genau draufzeigt.
- Druck: Schritte im Treppenhaus einmal, danach Ruhe; Lärm sieht man nur im Balken.
- Fund ohne Gewicht (kein Hit-Stop), leer ohne Ton-Unterschied außer dem Klang.

**Razzia**
- Meldungen bleiben stehen, bis die nächste kommt („Hier liegt nichts …“ stand 20 s da).
- Nachts ist die Straße fast schwarz: Kofferraum und Wagen kaum zu sehen.
- Handy hochkant: oberes Drittel nur Dach und Himmel, die Figur ist klein.
- Verstauen, Tor runter und Reinstürmen ohne Hit-Stop; die Haptik ist da.
- Schwierigkeit gemessen nur als mittlerer Score eines perfekten Bots, nicht als Gewinnrate (Score ≥ 0,5) für guten,
  schwachen und keinen Spieler.

## Plan

1. `kit/indoor3d.ts`: gemeinsame Bausteine für Innenräume (Partikel, Staub, Taschenlampe mit Kegel, Licht durch
   Ritzen, Blaulicht-Takt), beide Szenen nutzen sie.
2. Bude: Klick trifft, was im Licht ist (Hover jedes Bild neu, Totzone in der Mitte, Ersatz: Ding im Kegel), weicher
   Kegel und Restlicht, Glanz an durchsuchbaren Dingen, Hit-Stop beim Fund, Schritte werden lauter.
3. Razzia: Meldungen verschwinden von selbst, Nacht lesbar (Straßenlaterne, Licht am Wagen), Handy-Kamera näher,
   Hit-Stop beim Verstauen und am Tor.
4. Schwierigkeit als Simulation (guter, schwacher, kein Spieler bei 0,2/0,5/0,9) im Test, Zahlen hier und im PR.
5. Leistung: Szenen `razzia` und `bude` in `scripts/perf-browser.mjs`.
