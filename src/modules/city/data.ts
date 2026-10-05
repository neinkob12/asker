// Die Städte im Spiel (Auftrag 30, 36 und 37): Köln (Einstieg), Hamburg, Berlin und Schablonen für München und Frankfurt
// (nur Daten-Skelett ohne Veedel, Spots und Gangs; im Spiel gesperrt und in der Deutschland-Ansicht „bald“, die Aufträge
// 38 und 39 füllen sie). Nach Köln ist die Reihenfolge frei: Jede Stadt hat einen Kontakt mit Gesicht und Stimme, der
// nach „<Stadt> komplett“ anruft, und einen Satz Dreh (Glas-Karte der Deutschland-Ansicht). Faktoren: 1 = Köln.

import type { Contact, LngLat } from '../../core';
import { HARBOR_CALLER } from './config';

export interface CityDef {
  id: string;
  name: string;
  /** Mittelpunkt (Stadt-Chip, Deutschland-Ansicht). */
  center: LngLat;
  /**
   * Kamera der Stadtansicht: Blickpunkt und Zoom am Desktop bzw. am Handy-Bildschirm, Neigung und Drehung der
   * schrägen Kamera in Grad (Auftrag 31; Drehung 0 = Blick nach Norden).
   */
  view: { center: LngLat; zoom: number; mobileZoom: number; pitch: number; bearing: number };
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
  /** Zusatz auf die Chance, dass dein Polizei-Kontakt vor einer Razzia warnt. */
  raidWarningBonus: number;
  description: string;
  /**
   * Wer aus dieser Stadt anruft, wenn eine andere komplett ist (Auftrag 36), mit Gesicht und Stimme. Köln ist der
   * Einstieg und ruft nie an.
   */
  contact: Contact;
  /** Der Dreh der Stadt in einem Satz (Glas-Karte der Deutschland-Ansicht, Anruf). */
  pitch: string;
  /** Schablone: Daten da, Inhalt fehlt noch, im Spiel gesperrt. */
  template?: boolean;
}

/** Kontakte der Städte nach Köln (Namen frei erfunden). Hamburg: Fiete aus dem Hafen (config.ts). */
const BERLIN_CALLER: Contact = {
  id: 'other:berlin-club',
  name: 'Dilara Aksoy',
  kind: 'other',
  role: 'Clubs in Friedrichshain',
  about:
    'Macht seit fünfzehn Jahren Türen in Friedrichshain und Kreuzberg. Weiß, wer nachts was braucht, und wer es liefert.',
  look: {
    feminine: true,
    age: 36,
    skin: 2,
    face: 'narrow',
    hair: 'undercut',
    hairColor: 0,
    beard: 'none',
    brows: 'hard',
    eyes: 'rings',
    mouth: 'smirk',
    glasses: 'none',
    hat: 'none',
    top: 'leather',
    topColor: 1,
    earring: 'hoops',
    tattoo: 'neck',
  },
  voice: { feminine: true, pitch: 0.95, rate: 1.08 },
};

const MUENCHEN_CALLER: Contact = {
  id: 'other:muenchen-schwabing',
  name: 'Korbinian Leitner',
  kind: 'other',
  role: 'Makler in Schwabing',
  about:
    'Vermittelt Wohnungen an Leute, die nicht nach dem Preis fragen. Und manchmal auch, was diese Leute am Wochenende brauchen.',
  look: {
    feminine: false,
    age: 52,
    skin: 0,
    face: 'round',
    hair: 'slick',
    hairColor: 5,
    beard: 'none',
    brows: 'soft',
    eyes: 'heavy',
    mouth: 'neutral',
    glasses: 'square',
    hat: 'none',
    top: 'suit',
    topColor: 0,
  },
  voice: { feminine: false, pitch: 0.85, rate: 0.92 },
};

const FRANKFURT_CALLER: Contact = {
  id: 'other:frankfurt-cargo',
  name: 'Nadia Okafor',
  kind: 'other',
  role: 'Frachtagentin am Flughafen',
  about:
    'Fertigt am Frankfurter Flughafen Fracht ab. Kennt die Lücken zwischen zwei Schichten beim Zoll auf die Minute.',
  look: {
    feminine: true,
    age: 41,
    skin: 5,
    face: 'oval',
    hair: 'tight',
    hairColor: 0,
    beard: 'none',
    brows: 'soft',
    eyes: 'open',
    mouth: 'hard',
    glasses: 'none',
    hat: 'none',
    top: 'jacket',
    topColor: 7,
    earring: 'stud',
  },
  voice: { feminine: true, pitch: 1.05, rate: 1 },
};

/** Köln ruft nie an (Einstieg); der Eintrag hält nur den Typ vollständig. */
const KOELN_CONTACT: Contact = { id: 'other:koeln', name: 'Köln', kind: 'other', look: {} };

export const CITIES: readonly CityDef[] = [
  {
    id: 'koeln',
    name: 'Köln',
    center: { lng: 6.958, lat: 50.938 },
    view: { center: { lng: 6.9445, lat: 50.9395 }, zoom: 13.6, mobileZoom: 12.4, pitch: 50, bearing: -20 },
    bounds: [6.83, 50.87, 7.07, 51.02],
    roadsNetworkId: 'koeln',
    portId: 'niehl',
    wageFactor: 1,
    propertyFactor: 1,
    relationFactor: 1.5,
    bribeFactor: 0.75,
    raidWarningBonus: 0.1,
    description: 'Der Rhein, zwölf Veedel, Kölscher Klüngel: Hier kennt jeder jeden, und das hilft.',
    contact: KOELN_CONTACT,
    pitch: 'Klüngel, Karneval und Kneipen: Hier kennt jeder jeden, und das hilft.',
  },
  {
    id: 'hamburg',
    name: 'Hamburg',
    center: { lng: 9.98, lat: 53.555 },
    // Blick nach Norden über die Elbe: Hafen und Landungsbrücken vorn, Kiez und Alster dahinter.
    view: { center: { lng: 9.975, lat: 53.553 }, zoom: 12.6, mobileZoom: 11.6, pitch: 50, bearing: 0 },
    bounds: [9.75, 53.44, 10.08, 53.61],
    roadsNetworkId: 'hamburg',
    portId: 'hamburg-hafen',
    wageFactor: 1.25,
    propertyFactor: 1.5,
    relationFactor: 0.8,
    bribeFactor: 1.2,
    raidWarningBonus: 0,
    description:
      'Der Hafen, die Elbe, die Reeperbahn. Mehr Geld auf der Straße, mehr Augen am Kai. Kühl und korrekt: Gefallen ' +
      'gibt es hier nur gegen Bezahlung.',
    contact: HARBOR_CALLER,
    pitch: 'Der Hafen: Container kiloweise, aber Zoll und Polizei sind eine Stufe härter.',
  },
  {
    // Auftrag 37: Die Nacht. Clubs von Freitagabend bis Montagfrüh, viel Nachtleben, viele Spots, starke Gangs, die
    // Polizei eher locker, Mieten mittel. Alles als Daten: Veedel (nightlife, policePresence), Spots (Clubs mit
    // weekHours), Gangs, Polizei (CHECK_FACTOR_BY_CITY) und Events.
    id: 'berlin',
    name: 'Berlin',
    center: { lng: 13.405, lat: 52.505 },
    // Blick nach Nordosten über Kreuzberg: Spree und Friedrichshain vorn rechts, Mitte und der Fernsehturm dahinter.
    view: { center: { lng: 13.405, lat: 52.508 }, zoom: 12.4, mobileZoom: 11.3, pitch: 50, bearing: 20 },
    bounds: [13.27, 52.44, 13.53, 52.57],
    roadsNetworkId: 'berlin',
    portId: null,
    wageFactor: 1.1,
    propertyFactor: 1.2,
    relationFactor: 1,
    bribeFactor: 0.9,
    raidWarningBonus: 0.05,
    description:
      'Die Spree, zwölf Kieze, Clubs von Freitag bis Montag. Mehr Ecken, als du Leute hast, und Gangs, die nicht ' +
      'teilen wollen. Die Polizei hat genug anderes zu tun.',
    contact: BERLIN_CALLER,
    pitch: 'Die Nacht: Clubs rund um die Uhr, viele Spots, starke Gangs, Polizei locker.',
  },
  {
    // Schablone (Inhalt mit Auftrag 38).
    id: 'muenchen',
    name: 'München',
    center: { lng: 11.575, lat: 48.137 },
    view: { center: { lng: 11.575, lat: 48.137 }, zoom: 12.4, mobileZoom: 11.4, pitch: 50, bearing: 0 },
    bounds: [11.4, 48.06, 11.72, 48.22],
    roadsNetworkId: 'muenchen',
    portId: null,
    wageFactor: 1.3,
    propertyFactor: 1.8,
    relationFactor: 1,
    bribeFactor: 1.3,
    raidWarningBonus: 0,
    description: 'Noch nicht im Spiel.',
    contact: MUENCHEN_CALLER,
    pitch: 'Teuer und streng: viel Kaufkraft, teure Lager und Löhne, die Polizei startet eine Stufe härter.',
    template: true,
  },
  {
    // Schablone (Inhalt mit Auftrag 39, optional).
    id: 'frankfurt',
    name: 'Frankfurt',
    center: { lng: 8.682, lat: 50.11 },
    view: { center: { lng: 8.682, lat: 50.11 }, zoom: 12.8, mobileZoom: 11.8, pitch: 50, bearing: 0 },
    bounds: [8.55, 50.02, 8.8, 50.19],
    roadsNetworkId: 'frankfurt',
    portId: null,
    wageFactor: 1.2,
    propertyFactor: 1.6,
    relationFactor: 1,
    bribeFactor: 1.1,
    raidWarningBonus: 0,
    description: 'Noch nicht im Spiel.',
    contact: FRANKFURT_CALLER,
    pitch: 'Geld und Flughafen: Banker als Kunden, das Bahnhofsviertel als Brennpunkt, Fracht über den Flughafen.',
    template: true,
  },
];

/** Deutschland-Ansicht der Karte (alle Städte und das Autobahn-Netz dazwischen). */
export const DEUTSCHLAND_VIEW = { center: { lng: 10.2, lat: 51.2 }, zoom: 5.6 };
