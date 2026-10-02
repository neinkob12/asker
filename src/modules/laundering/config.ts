// Einstellbare Werte der Geldwäsche (Auftrag 27: drei Wege, die man nach und nach freischaltet).

/** Die Gebühr sinkt durch Boni (Buchhalter) höchstens bis hierhin. */
export const MIN_LAUNDERING_FEE = 0.03;

/** Kleinster Betrag pro Wäsche (beim billigsten Weg). */
export const MIN_LAUNDERING_AMOUNT = 100;

export type LaunderingChannelId = 'kiosk' | 'laundromat' | 'construction';

export interface LaunderingChannel {
  id: LaunderingChannelId;
  /** Name des Wegs, z.B. "Kumpel mit Kiosk". */
  name: string;
  /** Wer dahintersteckt (Figur), ein Satz. */
  who: string;
  /** Wie der Weg funktioniert, ein Satz. */
  how: string;
  icon: string;
  /** Veedel, in dem das Geschäft steht (dort steigt der Heat). */
  veedelId: string;
  /** Gebühr als Anteil des Betrags (ohne Buchhalter). */
  fee: number;
  /** Kleinster Betrag pro Wäsche. */
  minAmount: number;
  /** So viel Schwarzgeld kann über diesen Weg gleichzeitig in der Wäsche sein (Obergrenze). */
  capacity: number;
  /** Dauer in Spielminuten: Grundzeit plus Zeit pro 100 €. */
  baseMinutes: number;
  minutesPer100: number;
  /** Heat im Veedel pro 1.000 € einer Wäsche, sobald mehr als heatAbove gleichzeitig läuft (0 = nie). */
  heatPer1000: number;
  heatAbove: number;
  /** Freischalten: Preis in sauberem oder in Schwarzgeld (eins von beiden), dazu Ruf oder Reviere. */
  unlock: null | { clean: number; dirty: number; reputation?: number; veedel?: number };
}

export const LAUNDERING_CHANNELS: readonly LaunderingChannel[] = [
  {
    id: 'kiosk',
    name: 'Kumpel mit Kiosk',
    who: 'Ercan hat einen Kiosk am Ebertplatz und fragt nicht viel.',
    how: 'Kleine Beträge laufen als Kiosk-Umsatz durch. Schnell, teuer, fast kein Risiko.',
    icon: 'store',
    veedelId: 'neustadt-nord',
    fee: 0.25,
    minAmount: 100,
    capacity: 3000,
    baseMinutes: 60,
    minutesPer100: 4,
    heatPer1000: 0,
    heatAbove: 0,
    unlock: null,
  },
  {
    id: 'laundromat',
    name: 'Waschsalon und Shisha-Bar',
    who: 'Gül betreibt einen Waschsalon in Ehrenfeld, ihr Bruder die Shisha-Bar nebenan.',
    how: 'Mittlere Beträge als Bar- und Salonumsatz. Mittlere Gebühr, bei zu viel auf einmal schaut das Amt hin.',
    icon: 'washing',
    veedelId: 'ehrenfeld',
    fee: 0.15,
    minAmount: 500,
    capacity: 12000,
    baseMinutes: 240,
    minutesPer100: 3,
    heatPer1000: 1,
    heatAbove: 6000,
    unlock: { clean: 3000, dirty: 5000 },
  },
  {
    id: 'construction',
    name: 'Bauunternehmer',
    who: 'Krings baut in Mülheim und braucht ständig Bargeld für Subunternehmer.',
    how: 'Große Beträge über Baustellen und Immobilien. Niedrige Gebühr, langsam, zu viel auf einmal bringt Heat.',
    icon: 'building',
    veedelId: 'muelheim',
    fee: 0.08,
    minAmount: 2000,
    capacity: 50000,
    baseMinutes: 720,
    minutesPer100: 2,
    heatPer1000: 2,
    heatAbove: 15000,
    unlock: { clean: 12000, dirty: 20000, reputation: 60, veedel: 2 },
  },
];
