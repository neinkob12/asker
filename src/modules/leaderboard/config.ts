// Einstellbare Werte der Bestenliste.

/**
 * Ware im Lager zählt zum Vermögen nur mit einem Abschlag auf den Straßenpreis (basePrice): Lieferanten verlangen
 * nur rund 30-62 % davon, und was im Lager liegt, ist noch nicht verkauft. Ware ohne bekannten Einkaufspreis
 * (Beute, Quest-Belohnung) zählt mit diesem Anteil am Straßenpreis.
 */
export const GOODS_FALLBACK_SHARE = 0.5;
