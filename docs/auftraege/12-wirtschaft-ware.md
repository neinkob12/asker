# Auftrag 12 – Wirtschaft und Ware

## Rahmen

- **Voraussetzung:** Auftrag 00 (Fundament) ist in `main` gemergt.
- **Parallel dazu laufen:** die Aufträge 10, 11, 13 und 14. Halte dich an die Regeln in `docs/auftraege/README.md`.
- **Deine Ordner:** `src/modules/goods/`, `src/modules/market/`, `src/modules/suppliers/`, `src/modules/customers/`, `src/modules/spots/`, `src/modules/reputation/`, `src/modules/laundering/`. Nur diese änderst du.
- **Vorher lesen:** `CLAUDE.md`, `docs/konzept.md`, `docs/architektur.md` (dort steht, was du vorfindest).
- **Achtung:** Die Läufer aus Auftrag 13 verkaufen über den Befehl `customers.serve` (mit `sellerId`). Payload und Verhalten nur erweitern. `staff` hängt von `customers` ab, trag in `customers` also nicht `dependsOn: ['staff']` ein.

## Ziel

Aus "ein Produkt, ein Preis" wird eine echte Schattenwirtschaft: mehrere Produkte mit Qualität, Lieferanten mit Beziehungen, ein Markt mit Richtpreisen, verschiedene Kunden und mehrere Vertriebswege.

Das ist ein erster spielbarer Prototyp, nicht die Endausbaustufe.

## Muss drin sein

### Ware (`goods`)

- **Produkte:** einige Weed-Sorten, Hasch, Edibles, Öl und Vapes, als Daten mit Basispreis, Einheit und Zielgruppen.
- **Qualitätsstufen** pro Warenposten.
- **Strecken:** Aktion im Lager, bei der die Menge steigt und die Qualität sinkt. Kunden merken das, und das kostet Ruf.
- **Bestand:** pro Lager. Vorerst gibt es ein Lager, die Datenstruktur muss aber mehrere erlauben.

### Lieferanten (`suppliers`)

- **Zwei Arten:**
  - Großstädte (z.B. Frankfurt, Berlin, Hamburg): kleine Mengen, schnell, teurer
  - Hafen Rotterdam: große Mengen, langsam, günstiger
- **Profil pro Lieferant:** Preis, Qualität, Zuverlässigkeit, Lieferzeit und Sortiment.
- **Beziehung und Vertrauen:**
  - Das Vertrauen steigt mit Käufen und pünktlicher Zahlung.
  - Es bringt Rabatt, Kredit (Ware jetzt, später zahlen) und bessere Ware.
- **Lieferprobleme als Zufallsereignis:** verspätet, schlechte Ware oder beschlagnahmt.
- **Transporter-Anzeige:** bleibt wie im Prototyp (Luftlinie). Echte Routen kommen später.

### Markt (`market`)

- **Richtpreis pro Produkt und Veedel:** abhängig von der Kaufkraft (über die `veedel`-API), von Angebot und Nachfrage und von einem Konkurrenzdruck-Faktor. Den Faktor setzen die Gangs aus Auftrag 11 über `setCompetitionFactor` (gibt es seit dem Fundament, nicht brechen).
- **Eigener Preis** pro Spot und Produkt, als Befehl. Zu teuer heißt weniger Kunden, zu billig bedeutet Verlust.

### Kunden und Spots (`customers`, `spots`)

- **Kundentypen** (z.B. Student, Banker, Tourist, Partygänger, Dauerkiffer) mit Vorlieben: Produkt, Qualität, Preisempfindlichkeit, Uhrzeiten und Wochentage.
- **Stammkunden** mit Namen, die wiederkommen und sich an Qualität und Preis erinnern.
- **Nachfrage:** Uhrzeit (wie bisher) und Wochentage. Die Wetter-API aus dem Fundament (`weather`) wird angebunden. Sie liefert erst später echtes Wetter.
- **Spots:**
  - vorgegebene Spots, die man freischaltet
  - eigene Spots per Klick auf die Karte gründen (mit Kosten, die Zuordnung zum Veedel über `veedelAt`)
- **Selbst verkaufen:** Der Spieler kann weiterhin selbst verkaufen ("erst selbst, dann managen").

### Vertrieb

- **Straßenverkauf:** wie bisher.
- **Lieferdienst:**
  - Bestellungen kommen als Nachricht ins Spiel-Handy, der Spieler nimmt an oder lehnt ab.
  - Ausgeliefert wird durch einen Kurier (freien Kurier über die `staff`-API finden) oder durch den Spieler selbst.
- **Großhandel:** gelegentliche Anfragen über große Mengen mit Rabatt.
- **Ereignis:** Jeder Verkauf löst `sale.completed` aus (Spot, Veedel, Produkt, Menge, Qualität, Erlös).

### Ruf und Geld (`reputation`, `laundering`)

- **Ruf (global):** steigt durch gute Qualität und Zuverlässigkeit und sinkt durch gestreckte Ware und abgewiesene Kunden. Er beeinflusst Nachfrage und Stammkunden.
- **Schwarzgeld:** Alle Verkäufe bringen Schwarzgeld.
- **Einfache Geldwäsche:** Ein Betrag wird über Zeit und gegen Gebühr zu sauberem Geld. Tarnfirmen kommen später.

### UI

- **Handy-Apps** über die Registry aus dem Fundament: Lieferanten (bestellen, Beziehung), Aufträge (Lieferdienst, Großhandel).
- **Panels:** Lager (Bestand, Qualität, strecken), Spot-Panel (Kunden, Preise), Markt-Übersicht.

## Nicht in diesem Auftrag

- Fahrzeugflotte, echte Routen, mehrere Lager-Standorte (später)
- Tarnfirmen (später)
- Veedel-Grenzen (Auftrag 10)
- Mitarbeiter-Details (Auftrag 13)
- endgültiger Look (Auftrag 14)

## Fertig, wenn

- man Produkte in verschiedenen Qualitäten bei verschiedenen Lieferanten kaufen, strecken und über alle drei Vertriebswege verkaufen kann
- Preise auf Markt und eigene Preise reagieren
- Tests für Preisbildung, Kundenentscheidung, Lieferanten-Vertrauen, Strecken und Geldwäsche vorhanden sind und `npm run check` grün ist
- die PR-Beschreibung die drei Abschnitte aus der README hat
