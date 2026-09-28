import type { Product, Warehouse } from './index';

/** Produkte. Stand Fundament: nur ein Produkt wie im Prototyp. Auftrag 12 ergänzt Sorten, Hasch, Edibles … */
export const PRODUCTS: readonly Product[] = [{ id: 'weed', name: 'Gras', unit: 'g', basePrice: 10 }];

export const DEFAULT_PRODUCT = 'weed';

/** Lager. Die Datenstruktur erlaubt mehrere, vorerst gibt es eins. */
export const WAREHOUSES: readonly Warehouse[] = [{ id: 'ehrenfeld', name: 'Lager Ehrenfeld', lng: 6.918, lat: 50.948 }];

export const DEFAULT_WAREHOUSE = 'ehrenfeld';

/** Bestand zu Spielbeginn (im Standardlager, Standardprodukt). */
export const START_STOCK = 40;

/** Qualität von 0 (Dreck) bis 1 (beste Ware). Stand Fundament hat alle Ware diese Qualität. */
export const STANDARD_QUALITY = 0.6;
