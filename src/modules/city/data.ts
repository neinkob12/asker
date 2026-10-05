// Die Städte im Spiel (Auftrag 30, 36 bis 39): Köln (Einstieg), Hamburg, Berlin, München und Frankfurt (optional, ruft
// nach den anderen an: offerRank). Eine Stadt mit template ist nur ein Daten-Skelett ohne Veedel, Spots und Gangs (im
// Spiel gesperrt, in der Deutschland-Ansicht „bald“). Nach Köln ist die Reihenfolge frei: Jede Stadt hat einen Kontakt mit Gesicht und Stimme, der
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
  /**
   * Rang beim Anruf nach "<Stadt> komplett" (Auftrag 39, Standard 0): Erst nach Rang, dann nach Entfernung. Frankfurt ist
   * optional (1) und ruft nicht vor Hamburg an, obwohl es näher an Köln liegt; per Chat und auf Wunsch geht es trotzdem.
   */
  offerRank?: number;
  /** Schablone: Daten da, Inhalt fehlt noch, im Spiel gesperrt. */
  template?: boolean;
  /**
   * Ort im Ausland (Auftrag 40): keine Veedel, keine Spots, keine Gangs, nicht spielbar wie eine Stadt. Nach dem Verkauf
   * des Geschäfts bist du hier (Rotterdam) und lieferst an alle.
   */
  abroad?: boolean;
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
    // München (Auftrag 38): teuer und streng. Die höchste Kaufkraft im Spiel, aber Lager, Spots und Löhne kosten am
    // meisten, die Polizei sieht dich von Anfang an als Händler (police: MIN_TIER_BY_CITY) und kontrolliert öfter.
    id: 'muenchen',
    name: 'München',
    center: { lng: 11.575, lat: 48.14 },
    // Blick nach Norden: Theresienwiese und Altstadt vorn, Schwabing und der Englische Garten dahinter.
    view: { center: { lng: 11.571, lat: 48.143 }, zoom: 12.6, mobileZoom: 11.5, pitch: 50, bearing: 0 },
    bounds: [11.48, 48.085, 11.7, 48.23],
    roadsNetworkId: 'muenchen',
    portId: null,
    wageFactor: 1.4,
    propertyFactor: 2,
    relationFactor: 0.9,
    bribeFactor: 1.5,
    raidWarningBonus: 0,
    description:
      'Die Isar, die Wiesn, das meiste Geld im Land. Die Kundschaft zahlt jeden Preis, aber alles kostet doppelt, und ' +
      'die Polizei schaut hier genauer hin als irgendwo sonst.',
    contact: MUENCHEN_CALLER,
    pitch: 'Teuer und streng: viel Kaufkraft, teure Lager und Löhne, die Polizei startet eine Stufe härter.',
  },
  {
    // Auftrag 39 (optional): Geld und Flughafen.
    id: 'frankfurt',
    name: 'Frankfurt',
    center: { lng: 8.682, lat: 50.11 },
    // Blick nach Norden über den Main: Museumsufer vorn, Bahnhofsviertel, Innenstadt und die Türme dahinter.
    view: { center: { lng: 8.674, lat: 50.112 }, zoom: 13.1, mobileZoom: 12.2, pitch: 50, bearing: -10 },
    bounds: [8.51, 50.015, 8.75, 50.145],
    roadsNetworkId: 'frankfurt',
    portId: null,
    wageFactor: 1.2,
    propertyFactor: 1.6,
    relationFactor: 0.9,
    bribeFactor: 1.3,
    raidWarningBonus: 0,
    description:
      'Banken, Messe, Flughafen. Die Kundschaft hat Geld, das Bahnhofsviertel die meiste Nachfrage und die meiste ' +
      'Polizei. Hier wird gerechnet: Gefallen kosten, Wäsche geht in größeren Summen.',
    contact: FRANKFURT_CALLER,
    pitch: 'Geld und Flughafen: Banker als Kunden, das Bahnhofsviertel als Brennpunkt, Fracht über den Flughafen.',
    offerRank: 1,
  },
];

/**
 * Jansen aus Rotterdam (Auftrag 40): der Lieferant, den du aus Köln kennst. Er hört auf und verkauft dir alles. Gleiche
 * Kontakt-ID wie im Lieferanten-Chat; Gesicht und Rolle setzt city zur Laufzeit aus suppliers (jansenContact).
 */
export const JANSEN_CONTACT: Contact = {
  id: 'supplier:rotterdam',
  name: 'Jansen (Hafen Rotterdam)',
  kind: 'supplier',
  role: 'Hafen Rotterdam',
  look: {},
  voice: { feminine: false, pitch: 0.75, rate: 0.9 },
};

/**
 * Orte im Ausland (Auftrag 40): Rotterdam als neues Zuhause nach dem Verkauf. Nicht in CITIES (dort stehen nur die
 * deutschen Städte mit Veedeln), aber über getCity erreichbar (Kamera, Mittelpunkt, Hafen).
 */
export const ABROAD_CITIES: readonly CityDef[] = [
  {
    id: 'rotterdam',
    name: 'Rotterdam',
    center: { lng: 4.3, lat: 51.92 },
    // Blick nach Westen über die Maasvlakte-Zufahrt: Waalhaven und Eemhaven vorn.
    view: { center: { lng: 4.33, lat: 51.895 }, zoom: 11.6, mobileZoom: 10.6, pitch: 45, bearing: -60 },
    bounds: [4.0, 51.85, 4.55, 51.99],
    roadsNetworkId: 'koeln',
    portId: 'rotterdam',
    wageFactor: 1.3,
    propertyFactor: 1.5,
    relationFactor: 1,
    bribeFactor: 1.4,
    raidWarningBonus: 0,
    description: 'Der größte Hafen Europas. Von hier aus lieferst du an alle: deine alten Leute, Gangs, fremde Städte.',
    contact: JANSEN_CONTACT,
    pitch: 'Lieferant für alle: Kunden, Container, Zoll und die alten Lieferanten als Konkurrenz.',
    abroad: true,
  },
];

/** Deutschland-Ansicht der Karte (alle Städte und das Autobahn-Netz dazwischen). */
export const DEUTSCHLAND_VIEW = { center: { lng: 10.2, lat: 51.2 }, zoom: 5.6 };
