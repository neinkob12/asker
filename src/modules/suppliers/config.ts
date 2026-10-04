import type { Look } from '../../core';
import type { Supplier } from './index';

/**
 * Lieferzeit Rotterdam bis an den Kai im Niehler Hafen: 10 Spielstunden = 2 echte Minuten bei 1x. Abholen und ins
 * Lager bringen kommt dazu (logistics).
 */
export const ROTTERDAM_DELIVERY_TIME = 600;

// Paketpreise: Grundpreis des Produkts × Preisniveau des Lieferanten × Menge, mit Mengenrabatt
// (mittel 7 %, groß 14 %), auf 5 € gerundet. minTrust: erst ab diesem Vertrauen im Sortiment.
// unlock: Diese Lieferanten sind am Anfang nicht zu haben. Sie melden sich per Handy, sobald du die Bedingungen
// erfüllst (Umsatz, Veedel unter deiner Kontrolle, Liegeplatz im Hafen), und wollen eine Vermittlungsgebühr.

export const SUPPLIERS: readonly Supplier[] = [
  {
    id: 'rotterdam',
    name: 'Hafen Rotterdam',
    contactName: 'Jansen',
    kind: 'port',
    lng: 4.4,
    lat: 51.9,
    deliveryTime: ROTTERDAM_DELIVERY_TIME,
    priceLevel: 0.34,
    quality: 0.55,
    reliability: 0.72,
    description:
      'Container per Schiff bis in den Niehler Hafen. Große Mengen, billig, aber es dauert, und abholen musst du selbst.',
    // Rotterdam liefert nur nach Köln (über den Rhein), Hamburg hat Hein am Kai.
    cities: ['koeln'],
    unlock: {
      requires: { berth: true },
      fee: 0,
      pitch:
        'Du hast einen Liegeplatz im Niehler Hafen? Dann können wir reden. Große Mengen per Schiff, billiger als ' +
        'jeder andere. Abholen am Kai musst du selbst.',
    },
    packages: [
      { id: 'small', label: '200 g Gras', productId: 'weed', amount: 200, price: 680 },
      { id: 'medium', label: '500 g Gras', productId: 'weed', amount: 500, price: 1580 },
      { id: 'large', label: '1 kg Gras', productId: 'weed', amount: 1000, price: 2925 },
      { id: 'hash', label: '500 g Hasch', productId: 'hash', amount: 500, price: 1425 },
      { id: 'haze', label: '500 g Amnesia Haze', productId: 'haze', amount: 500, price: 2055, minTrust: 30 },
      { id: 'kush', label: '500 g OG Kush', productId: 'kush', amount: 500, price: 2530, minTrust: 55 },
    ],
  },
  {
    id: 'frankfurt',
    name: 'Frankfurt',
    contactName: 'Toni',
    kind: 'city',
    // Kommt über die A3 aus Süden in Köln an, in Hamburg über die A7 (nur Karte).
    via: { koeln: 'A3', hamburg: 'A7' },
    lng: 8.682,
    lat: 50.111,
    deliveryTime: 180,
    priceLevel: 0.55,
    quality: 0.62,
    reliability: 0.88,
    description: 'Kurierfahrer über die A3. Schnell und zuverlässig, dafür teuer.',
    // Toni ist in Hamburg dein Startlieferant per Kurier: länger unterwegs, zehn Prozent Aufschlag.
    cities: ['koeln', 'hamburg'],
    deliveryTimes: { hamburg: 330 },
    priceFactors: { hamburg: 1.1 },
    packages: [
      { id: 'weed25', label: '25 g Gras', productId: 'weed', amount: 25, price: 140 },
      { id: 'weed50', label: '50 g Gras', productId: 'weed', amount: 50, price: 255 },
      { id: 'weed100', label: '100 g Gras', productId: 'weed', amount: 100, price: 490, minTrust: 18 },
      { id: 'haze25', label: '25 g Amnesia Haze', productId: 'haze', amount: 25, price: 180 },
      { id: 'haze50', label: '50 g Amnesia Haze', productId: 'haze', amount: 50, price: 350, minTrust: 22 },
      { id: 'oil20', label: '20 ml Öl', productId: 'oil', amount: 20, price: 220 },
      { id: 'oil50', label: '50 ml Öl', productId: 'oil', amount: 50, price: 510, minTrust: 40 },
    ],
  },
  {
    id: 'berlin',
    name: 'Berlin',
    contactName: 'Mirko',
    kind: 'city',
    // Kommt über die A2 und die A1 aus Norden in Köln an, in Hamburg über die A24 (nur Karte).
    via: { koeln: 'A1', hamburg: 'A24' },
    lng: 13.405,
    lat: 52.52,
    deliveryTime: 300,
    priceLevel: 0.5,
    quality: 0.74,
    reliability: 0.7,
    description: 'Gute Ware aus der Hauptstadt, Edibles und Vapes. Nicht immer pünktlich.',
    cities: ['koeln', 'hamburg'],
    deliveryTimes: { hamburg: 180 },
    unlock: {
      requires: { veedel: 1 },
      fee: 600,
      pitch:
        'Man hört, dir gehört jetzt ein ganzes Veedel. Respekt. Mit so jemandem mach ich Geschäfte: Kush, Haze, ' +
        'Edibles, Vapes. Für den Einstieg will ich {fee}.',
    },
    packages: [
      { id: 'haze50', label: '50 g Amnesia Haze', productId: 'haze', amount: 50, price: 300 },
      { id: 'kush25', label: '25 g OG Kush', productId: 'kush', amount: 25, price: 200 },
      { id: 'edibles30', label: '30 Edibles', productId: 'edibles', amount: 30, price: 105 },
      { id: 'vape10', label: '10 Vape-Pens', productId: 'vape', amount: 10, price: 150 },
      { id: 'kush100', label: '100 g OG Kush', productId: 'kush', amount: 100, price: 690, minTrust: 45 },
    ],
  },
  {
    id: 'hamburg',
    name: 'Hamburg',
    contactName: 'Hein',
    kind: 'city',
    // Kommt über die A1 aus Norden in Köln an (nur Karte).
    via: { koeln: 'A1' },
    lng: 9.993,
    lat: 53.551,
    deliveryTime: 270,
    priceLevel: 0.52,
    quality: 0.6,
    reliability: 0.9,
    description: 'Hanseatisch korrekt. Solide Ware, fast nie Ärger.',
    // In Hamburg liefert Hein aus der Stadt selbst, mit denselben Mengen wie in Köln, direkt ins Lager (kein Hafen).
    // Die großen Mengen gibt es nur im Hafen (Amsterdam, Rotterdam).
    cities: ['koeln', 'hamburg'],
    deliveryTimes: { hamburg: 60 },
    unlock: {
      requires: { revenue: 1500 },
      fee: 250,
      pitch:
        'Moin. Hab gehört, bei dir in Köln läuft was. Ich liefer Gras, Hasch, Edibles und Vapes, fast nie Ärger. ' +
        '{fee} Vermittlung, dann bist du im Geschäft.',
    },
    packages: [
      { id: 'weed50', label: '50 g Gras', productId: 'weed', amount: 50, price: 240 },
      { id: 'weed100', label: '100 g Gras', productId: 'weed', amount: 100, price: 465, minTrust: 22 },
      { id: 'hash50', label: '50 g Hasch', productId: 'hash', amount: 50, price: 220 },
      { id: 'edibles30', label: '30 Edibles', productId: 'edibles', amount: 30, price: 110 },
      { id: 'vape10', label: '10 Vape-Pens', productId: 'vape', amount: 10, price: 155 },
      { id: 'vape30', label: '30 Vape-Pens', productId: 'vape', amount: 30, price: 435, minTrust: 40 },
    ],
  },
  {
    id: 'amsterdam',
    name: 'Amsterdam',
    contactName: 'Daan',
    kind: 'city',
    // Kommt über die A57 aus Nordwesten in Köln an, in Hamburg über die A1 aus Bremen (nur Karte).
    via: { koeln: 'A57', hamburg: 'A1' },
    lng: 4.904,
    lat: 52.368,
    deliveryTime: 240,
    priceLevel: 0.42,
    quality: 0.82,
    reliability: 0.85,
    description: 'Großhändler für Coffeeshops. Die beste Ware, kommt über die A57. Redet nur mit großen Leuten.',
    // In Hamburg kauft man bei Daan im Hafen: Container direkt am Kai, kiloweise, günstig, sechs Stunden, abholen
    // musst du selbst (braucht den Hamburger Liegeplatz).
    cities: ['koeln', 'hamburg'],
    deliveryTimes: { hamburg: 360 },
    inCity: {
      hamburg: {
        kind: 'port',
        priceLevel: 0.3,
        description:
          'Daan im Hafen: Container direkt im Hamburger Hafen. Riesige Mengen zum besten Preis, sechs Stunden, abholen musst du selbst.',
        packages: [
          { id: 'hh-haze1kg', label: '1 kg Amnesia Haze', productId: 'haze', amount: 1000, price: 4100 },
          { id: 'hh-haze2kg', label: '2 kg Amnesia Haze', productId: 'haze', amount: 2000, price: 8000, minTrust: 20 },
          { id: 'hh-kush1kg', label: '1 kg OG Kush', productId: 'kush', amount: 1000, price: 4950 },
          { id: 'hh-kush2kg', label: '2 kg OG Kush', productId: 'kush', amount: 2000, price: 9600, minTrust: 30 },
          { id: 'hh-edibles500', label: '500 Edibles', productId: 'edibles', amount: 500, price: 1100 },
          { id: 'hh-vape200', label: '200 Vape-Pens', productId: 'vape', amount: 200, price: 1850 },
        ],
      },
    },
    unlock: {
      requires: { veedel: 3, revenue: 15000 },
      fee: 1500,
      pitch:
        'Drie Veedel in Keulen, en veel omzet. Du bist jetzt wer. Ich hab die beste Ware aus Amsterdam, für die ' +
        'Vorstellung will ich {fee}.',
    },
    packages: [
      { id: 'haze100', label: '100 g Amnesia Haze', productId: 'haze', amount: 100, price: 585 },
      { id: 'kush100', label: '100 g OG Kush', productId: 'kush', amount: 100, price: 705 },
      { id: 'edibles60', label: '60 Edibles', productId: 'edibles', amount: 60, price: 185 },
      { id: 'vape20', label: '20 Vape-Pens', productId: 'vape', amount: 20, price: 265 },
      { id: 'kush150', label: '150 g OG Kush', productId: 'kush', amount: 150, price: 1055, minTrust: 30 },
    ],
  },
  {
    id: 'koeln',
    name: 'Köln',
    contactName: 'Kalle',
    kind: 'city',
    lng: 6.96,
    lat: 50.94,
    deliveryTime: 45,
    priceLevel: 0.62,
    quality: 0.5,
    reliability: 0.85,
    description:
      'Kalle aus Kalk, ein Kontakt aus der Nachbarschaft. Kleine Mengen, in unter einer Stunde da, dafür nicht billig.',
    cities: ['koeln'],
    packages: [
      { id: 'weed10', label: '10 g Gras', productId: 'weed', amount: 10, price: 60 },
      { id: 'weed25', label: '25 g Gras', productId: 'weed', amount: 25, price: 145 },
      { id: 'weed50', label: '50 g Gras', productId: 'weed', amount: 50, price: 280, minTrust: 20 },
    ],
  },
];

// Beziehung und Vertrauen (0–100)

export const START_TRUST = 10;
/** Vertrauen pro Bestellung plus pro 1000 € Bestellwert. */
export const TRUST_PER_ORDER = 2;
export const TRUST_PER_1000_EUR = 1.5;
/** Bar bezahlt = pünktlich bezahlt. */
export const TRUST_CASH_BONUS = 1;
/** Kredit vor Fälligkeit komplett zurückgezahlt. */
export const TRUST_ON_TIME_REPAYMENT = 4;
/** Kredit überfällig. */
export const TRUST_LATE_PENALTY = 12;

/** Rabatt bei Vertrauen 100, linear ab DISCOUNT_FROM_TRUST (darunter kein Rabatt). */
export const MAX_DISCOUNT = 0.15;
export const DISCOUNT_FROM_TRUST = 20;
/** Qualitätsbonus bei Vertrauen 100 (linear ab 0). */
export const MAX_QUALITY_BONUS = 0.12;
/** Kredit gibt es ab diesem Vertrauen, dann pro Punkt über CREDIT_TRUST_OFFSET so viele Euro. */
export const CREDIT_MIN_TRUST = 25;
export const CREDIT_TRUST_OFFSET = 20;
export const CREDIT_PER_TRUST = 60;
/** Zahlungsziel für Kredit in Spielminuten (2 Tage). */
export const CREDIT_TERM = 2 * 24 * 60;
/** Nach Überschreiten gibt es einen Tag Aufschub, jedes Mal mit Aufschlag auf die Schulden. */
export const OVERDUE_EXTENSION = 24 * 60;
export const LATE_INTEREST = 0.1;

// Lieferprobleme. Wahrscheinlichkeit = (1 - Zuverlässigkeit) × Faktor × (1 - Vertrauen / 200).

export const DELAY_FACTOR = 0.6;
export const BAD_QUALITY_FACTOR = 0.4;
export const SEIZE_FACTOR = 0.15;
/** Zusätzliches Beschlagnahme-Risiko am Hafen (Zoll). */
export const PORT_SEIZE_EXTRA = 0.02;
/** Verspätung als Anteil der Lieferzeit [von, bis]. */
export const DELAY_RANGE: readonly [number, number] = [0.4, 1];
/** Qualitätsverlust bei schlechter Ware [von, bis]. */
export const BAD_QUALITY_LOSS: readonly [number, number] = [0.15, 0.3];
/** An dieser Stelle der Fahrt (Anteil) passiert das Problem. */
export const PROBLEM_AT = 0.45;
/** Qualität schwankt pro Lieferung um ± so viel. */
export const QUALITY_SPREAD = 0.05;

// Hafenlieferungen auf der Karte: Das Schiff kommt aus Rotterdam den echten Rhein hinauf (roads: shipRoute, aus
// Overture-Daten) in den Niehler Hafen und legt an deinem Liegeplatz an (die ganze Lieferzeit auf dem Schiff). Nur alte Lieferungen aus Spielständen von vor dem
// Liegeplatz werden noch umgeladen und per Lkw ins Lager gefahren (SHIP_SHARE, UNLOADING_SHARE).
/** Großstadt-Lieferungen: Anteil der Lieferzeit, in dem der Transporter durch Köln fährt (damit man ihn sieht). */
export const CITY_APPROACH_SHARE = 0.3;

/**
 * Hafen, in dem vom Schiff auf den Lkw umgeladen wird: dein Liegeplatz am Westkai der Hafeneinfahrt, zwischen
 * Straße (Westkai) und Wasser (Overture-Daten, siehe roads/tools/build-water.py).
 */
export const UNLOADING_PORT = { name: 'Niehler Hafen', lng: 6.9679, lat: 50.98527 } as const;

/** Anteil der Lieferzeit auf dem Schiff, danach fürs Umladen im Hafen; den Rest fährt der Lkw. */
export const SHIP_SHARE = 0.78;
export const UNLOADING_SHARE = 0.05;

/** Wie die Ansprechpartner aussehen (Porträt im Handy) und klingen (Anruf). Fehlendes kommt fest aus dem Namen. */
export const SUPPLIER_LOOKS: Readonly<Record<string, Partial<Look>>> = {
  // Jansen, Rotterdam: Spediteur, korrekt, kühl.
  rotterdam: {
    feminine: false,
    age: 49,
    skin: 0,
    hair: 'side',
    hairColor: 3,
    beard: 'none',
    glasses: 'square',
    hat: 'none',
    top: 'suit',
    topColor: 2,
    extra: 'none',
  },
  // Toni, Frankfurt: Kurierfahrer, immer unterwegs.
  frankfurt: {
    feminine: false,
    age: 31,
    skin: 2,
    hair: 'slick',
    hairColor: 0,
    beard: 'stubble',
    glasses: 'sun',
    hat: 'none',
    top: 'jacket',
    topColor: 1,
    extra: 'chain',
  },
  // Mirko, Berlin: Kreuzberg, Vapes und Edibles.
  berlin: {
    feminine: false,
    age: 27,
    skin: 1,
    hair: 'curly',
    hairColor: 4,
    beard: 'goatee',
    glasses: 'round',
    hat: 'beanie',
    top: 'hoodie',
    topColor: 3,
    extra: 'earring',
  },
  // Hein, Hamburg: hanseatisch korrekt.
  hamburg: {
    feminine: false,
    age: 61,
    skin: 0,
    hair: 'short',
    hairColor: 6,
    beard: 'full',
    glasses: 'none',
    hat: 'none',
    top: 'raincoat',
    topColor: 7,
    extra: 'none',
  },
  // Daan, Amsterdam: Großhändler, redet nur mit großen Leuten.
  amsterdam: {
    feminine: false,
    age: 44,
    skin: 3,
    hair: 'buzz',
    hairColor: 0,
    beard: 'full',
    glasses: 'none',
    hat: 'none',
    top: 'suit',
    topColor: 1,
    extra: 'none',
  },
  // Kalle aus Kalk: Nachbarschaft.
  koeln: {
    feminine: false,
    age: 36,
    skin: 1,
    hair: 'short',
    hairColor: 2,
    beard: 'stubble',
    glasses: 'none',
    hat: 'cap',
    top: 'tracksuit',
    topColor: 4,
    extra: 'tattoo',
  },
};

// Lieferprobleme mit Entscheidungen (Auftrag 23, troubles.ts). Die Wahrscheinlichkeiten der Probleme bleiben, ein Teil
// kommt als Nachricht mit Optionen und Frist; ohne Antwort gilt "abwarten" wie vorher.

/** Anteil der Verspätungen bzw. drohenden Beschlagnahmen mit Rückfrage. */
export const DECISION_SHARE_DELAY = 0.5;
export const DECISION_SHARE_SEIZE = 0.5;
/** Antwortfrist in Spielminuten (höchstens bis kurz vor der Ankunft). */
export const DECISION_TIME = 90;
/** Umweg: Aufpreis als Anteil am Paketpreis (mindestens DETOUR_MIN_COST), danach bleibt so viel der Verspätung. */
export const DETOUR_COST_SHARE = 0.12;
export const DETOUR_MIN_COST = 40;
export const DETOUR_REMAINING = 0.3;
/** Teillieferung: dieser Anteil kommt pünktlich, der Rest mit der Verspätung. */
export const PARTIAL_SHARE = 0.5;
/** Umleiten in ein anderes eigenes Lager der Stadt: so viel der Verspätung bleibt. */
export const REDIRECT_REMAINING = 0.5;
/** Schmieren bei drohender Beschlagnahme: Anteil am Paketpreis (mindestens BRIBE_MIN), Erfolgschance, Wartezeit. */
export const BRIBE_SHARE = 0.3;
export const BRIBE_MIN = 60;
export const BRIBE_SUCCESS = 0.6;
export const BRIBE_DELAY = 30;
/**
 * Chancen (Ton „gemischt“): bei Lieferungen ohne Problem mit dieser Wahrscheinlichkeit früher da, Ware obendrauf oder
 * bessere Qualität (je ein Drittel).
 */
export const LUCK_CHANCE = 0.08;
/** Früher da um diesen Anteil der Lieferzeit. */
export const LUCK_EARLY = 0.25;
/** Ware obendrauf (Anteil der Menge, [von, bis]). */
export const LUCK_BONUS: readonly [number, number] = [0.1, 0.2];
/** Bessere Qualität (+ [von, bis]). */
export const LUCK_QUALITY: readonly [number, number] = [0.05, 0.1];
// ---------------------------------------------------------------------------------------------
// Rabatt-Aktionen (Auftrag 32): Ein Lieferant gibt ein Paket für ein paar Tage billiger her und sagt es per Handy
// (still, ohne Banner). Um Mitternacht pro freier Stadt ausgewürfelt, solange dort keine Aktion läuft.

/** Chance pro Stadt und Tag, solange dort keine Aktion läuft (mit der Dauer etwa einmal pro Woche). */
export const DEAL_CHANCE_PER_DAY = 0.2;
/** Rabatt [von, bis] als Anteil. */
export const DEAL_DISCOUNT: readonly [number, number] = [0.1, 0.25];
/** Dauer in Tagen [von, bis]. */
export const DEAL_DAYS: readonly [number, number] = [3, 5];
/** Was der Lieferant schreibt: {package}, {discount} und {until} werden ersetzt. */
export const DEAL_PITCHES: readonly string[] = [
  'Hab zu viel da: {package} gibt es bis {until} {discount} billiger. Wer zuerst kommt.',
  'Kleine Aktion unter Freunden: {package} bis {until} {discount} günstiger.',
  'Muss Platz schaffen. {package}, {discount} runter, gilt bis {until}.',
];
