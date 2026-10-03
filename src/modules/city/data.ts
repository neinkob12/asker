// Die Städte im Spiel (Auftrag 30): Köln (Einstieg), Hamburg (nach "Köln komplett") und eine Schablone für die dritte
// Stadt (Berlin, nur Daten-Skelett ohne Veedel, Spots und Gangs; im Spiel gesperrt, damit Stadt drei nur noch Inhalt
// braucht). Faktoren: 1 = Köln.

import type { LngLat } from '../../core';

export interface CityDef {
  id: string;
  name: string;
  /** Mittelpunkt (Stadt-Chip, Deutschland-Ansicht). */
  center: LngLat;
  /** Kamera der Stadtansicht: Blickpunkt und Zoom am Desktop bzw. am Handy-Bildschirm. */
  view: { center: LngLat; zoom: number; mobileZoom: number };
  /** Rahmen um alle Veedel [West, Süd, Ost, Nord]. */
  bounds: readonly [number, number, number, number];
  /** Straßennetz in roads (Auftrag 30, Etappe 6). */
  roadsNetworkId: string;
  /** Hafen der Stadt (logistics), null ohne. */
  portId: string | null;
  /** Löhne (staff, nach der Stadt, in der die Person ist). */
  wageFactor: number;
  /** Lager und Spots kosten so viel mehr. */
  propertyFactor: number;
  /**
   * Charakter (Etappe 7): Wie schnell Beziehungen wachsen (Lieferanten, Gangs), und wie teuer Freikaufen und Kaution
   * sind. Köln: Klüngel, Hamburg: kühl und korrekt.
   */
  relationFactor: number;
  bribeFactor: number;
  description: string;
  /** Schablone: Daten da, Inhalt fehlt noch, im Spiel gesperrt. */
  template?: boolean;
}

export const CITIES: readonly CityDef[] = [
  {
    id: 'koeln',
    name: 'Köln',
    center: { lng: 6.958, lat: 50.938 },
    view: { center: { lng: 6.9445, lat: 50.9395 }, zoom: 13.6, mobileZoom: 12.4 },
    bounds: [6.83, 50.87, 7.07, 51.02],
    roadsNetworkId: 'koeln',
    portId: 'niehl',
    wageFactor: 1,
    propertyFactor: 1,
    relationFactor: 1.5,
    bribeFactor: 0.75,
    description: 'Der Rhein, zwölf Veedel, Kölscher Klüngel: Hier kennt jeder jeden, und das hilft.',
  },
  {
    id: 'hamburg',
    name: 'Hamburg',
    center: { lng: 9.98, lat: 53.555 },
    view: { center: { lng: 9.975, lat: 53.553 }, zoom: 12.6, mobileZoom: 11.6 },
    bounds: [9.75, 53.44, 10.08, 53.61],
    roadsNetworkId: 'hamburg',
    portId: 'hamburg-hafen',
    wageFactor: 1.25,
    propertyFactor: 1.5,
    relationFactor: 0.8,
    bribeFactor: 1.2,
    description:
      'Der Hafen, die Elbe, die Reeperbahn. Mehr Geld auf der Straße, mehr Augen am Kai. Kühl und korrekt: Gefallen ' +
      'gibt es hier nur gegen Bezahlung.',
  },
  {
    // Schablone für Stadt drei (Auftrag 30): Daten-Skelett, noch ohne Veedel, Spots, Gangs und Straßennetz.
    id: 'berlin',
    name: 'Berlin',
    center: { lng: 13.405, lat: 52.52 },
    view: { center: { lng: 13.405, lat: 52.52 }, zoom: 12.2, mobileZoom: 11.2 },
    bounds: [13.2, 52.42, 13.6, 52.62],
    roadsNetworkId: 'berlin',
    portId: null,
    wageFactor: 1.1,
    propertyFactor: 1.3,
    relationFactor: 1,
    bribeFactor: 1,
    description: 'Noch nicht im Spiel.',
    template: true,
  },
];

/** Deutschland-Ansicht der Karte (beide Städte und die A1 dazwischen). */
export const DEUTSCHLAND_VIEW = { center: { lng: 8.6, lat: 52.3 }, zoom: 6.4 };
