export interface Spot {
  id: string;
  name: string;
  lng: number;
  lat: number;
  /** Wie oft hier Kunden auftauchen (1 = normal). */
  demand: number;
  /** Aufschlag auf den Straßenpreis (1 = normal). */
  priceMultiplier: number;
}

// Platzhalter-Spots. Einfach Namen/Koordinaten austauschen oder neue Einträge ergänzen.
export const KOELN_SPOTS: Spot[] = [
  { id: 'ebertplatz', name: 'Ebertplatz', lng: 6.9575, lat: 50.9497, demand: 1.4, priceMultiplier: 0.9 },
  { id: 'neumarkt', name: 'Neumarkt', lng: 6.9476, lat: 50.9362, demand: 1.3, priceMultiplier: 1.0 },
  { id: 'aachener-weiher', name: 'Aachener Weiher', lng: 6.9282, lat: 50.9356, demand: 1.1, priceMultiplier: 1.1 },
  { id: 'zuelpicher', name: 'Zülpicher Platz', lng: 6.9398, lat: 50.9317, demand: 1.5, priceMultiplier: 1.05 },
  { id: 'rudolfplatz', name: 'Rudolfplatz', lng: 6.9392, lat: 50.9366, demand: 1.0, priceMultiplier: 1.15 },
  { id: 'friesenplatz', name: 'Friesenplatz', lng: 6.9395, lat: 50.9407, demand: 0.9, priceMultiplier: 1.2 },
  { id: 'breslauer', name: 'Breslauer Platz', lng: 6.9612, lat: 50.9442, demand: 1.0, priceMultiplier: 0.85 },
  { id: 'rheinpark', name: 'Rheinpark', lng: 6.9790, lat: 50.9468, demand: 0.7, priceMultiplier: 1.1 },
  { id: 'stadtgarten', name: 'Stadtgarten', lng: 6.9330, lat: 50.9422, demand: 0.8, priceMultiplier: 1.1 },
  { id: 'uni', name: 'Uni-Wiese', lng: 6.9290, lat: 50.9282, demand: 1.0, priceMultiplier: 1.0 },
];

export const KOELN_CENTER = { lng: 6.9490, lat: 50.9390 };

export const LAGER_KOELN = { name: 'Lager Ehrenfeld', lng: 6.9180, lat: 50.9480 };

export const HAFEN_ROTTERDAM = { name: 'Hafen Rotterdam', lng: 4.4000, lat: 51.9000 };
