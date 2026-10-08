// Einstellbare Werte der Bestenliste.

/**
 * Ware im Lager zählt zum Vermögen nur mit einem Abschlag auf den Straßenpreis (basePrice): Lieferanten verlangen
 * nur rund 30-62 % davon, und was im Lager liegt, ist noch nicht verkauft. Ware ohne bekannten Einkaufspreis
 * (Beute, Quest-Belohnung) zählt mit diesem Anteil am Straßenpreis.
 */
export const GOODS_FALLBACK_SHARE = 0.5;

/**
 * Ware im Hafen, am Kai und im Ausfuhrlager der Fincas (Hafen-Phase, Auftrag 40 bis 42) hat keinen Einkaufspreis je
 * Posten. Sie zählt mit diesem Anteil am Straßenpreis: Produzenten verlangen rund 16-40 % davon, die Kunden im
 * Großhandel zahlen etwa die Hälfte (trade, WHOLESALE_SHARE), davon wie oben der Abschlag.
 */
export const HARBOR_GOODS_SHARE = 0.25;
