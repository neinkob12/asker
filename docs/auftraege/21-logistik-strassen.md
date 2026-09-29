# Auftrag 21: Logistik mit echten Straßen

Wunsch aus dem Probespielen (Spieler, 29.09.2026):

> Die Autos sollen über Straßen fahren, nicht Luftlinie. Das Schiff soll über den Fluss in einen Hafen kommen, wo es
> dann noch von einem Fahrer abgeholt werden muss. Man muss mehr Logistik selber kontrollieren können, und es muss
> einfacher werden, an Spots Kunden zu bedienen, wenn kein Läufer angestellt ist. Lieferanten müssen freigeschaltet
> werden und nicht direkt alle verfügbar sein, sondern an Einfluss usw. gekoppelt. Einen Hafenplatz muss man sich
> zum Beispiel erst kaufen.

## Umsetzung

| Wunsch | Umsetzung |
| --- | --- |
| Autos über Straßen | Neues Modul `roads`: Kölner Straßennetz aus Overture Maps (OpenStreetMap, ODbL) als Daten im Repo, A*-Routen nach Fahrzeit, Einbahnstraßen. Alle Fahrzeuge (Lieferdienst, Transporter der Lieferanten, Abholungen, Umlagern) fahren darauf, die Fahrzeiten in der Simulation kommen aus der Routenlänge. |
| Schiff in den Hafen, Abholung durch einen Fahrer | Rotterdam liefert per Schiff an den eigenen Liegeplatz im Niehler Hafen. Die Ware wartet am Kai (`logistics.cargo`), bis ein Fahrer oder du selbst sie abholst (`logistics.pickup`). Nach 16 Stunden wird der Zoll neugierig. Neue Rolle Fahrer (`staff.hireDriver`). |
| Mehr Logistik selbst kontrollieren | Mehrere Lager (mit sauberem Geld kaufen), Ziel-Lager bei Bestellungen wählen, Umlagern (`logistics.transfer`), Wahl des Fahrers und des Ziels beim Abholen, Verkehrskontrollen unterwegs (Konfrontation `vehicleCheck`), Razzien durchsuchen Lager im Veedel. Alles in der neuen Handy-App „Logistik“. |
| Einfacher verkaufen ohne Läufer | „Hier hinstellen“ im Spot: Du bedienst dort automatisch (`customers.standAt`), bis du weggehst oder ausfährst. „Nächster Schritt“ stellt dich mit einem Tipp an den Spot mit den meisten Wartenden bzw. bedient alle dort. |
| Lieferanten freischalten | Am Anfang nur Frankfurt. Hamburg ab 1.500 € Umsatz, Berlin mit einem Veedel (Einfluss), Amsterdam (neu) mit drei Veedeln und 15.000 € Umsatz, Rotterdam mit Liegeplatz. Sie melden sich per Handy und wollen eine Vermittlungsgebühr (`suppliers.unlock`). |
| Hafenplatz kaufen | Liegeplatz im Niehler Hafen (`logistics.buyBerth`, 2.000 € sauberes Geld). |

Alte Spielstände laden weiter: Migrationen für `goods` (3), `suppliers` (3) und `customers` (3); wer schon in
Rotterdam bestellt hatte, bekommt den Liegeplatz geschenkt.

Details: [`docs/architektur.md`](../architektur.md) (Module `roads` und `logistics`, Abschnitt „Zusammenspiel der
Systeme“).
