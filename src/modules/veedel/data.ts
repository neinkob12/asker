// Die Kölner Veedel (Stadtteile), um die gespielt wird.
// Stand Fundament: nur Mittelpunkte und neutrale Eigenschaften. Echte Grenzen, Eigenschaften und
// Beschreibungen folgen in Auftrag 10.

export interface Veedel {
  id: string;
  name: string;
  /** Stadtbezirk, zu dem das Veedel gehört. */
  district: string;
  /** Ungefährer Mittelpunkt. */
  center: { lng: number; lat: number };
  /** Kaufkraft, 1 = Kölner Durchschnitt. Wirkt auf den Richtpreis (market). */
  purchasingPower: number;
  /** Polizeipräsenz, 1 = Durchschnitt. */
  policePresence: number;
  /** Nachfrage bzw. Dichte, 1 = Durchschnitt. */
  density: number;
  /** Kurzer Text im düsteren Ton (folgt in Auftrag 10). */
  description: string;
}

type VeedelSeed = Pick<Veedel, 'id' | 'name' | 'district' | 'center'>;

const SEEDS: VeedelSeed[] = [
  { id: 'altstadt-nord', name: 'Altstadt-Nord', district: 'Innenstadt', center: { lng: 6.9555, lat: 50.9395 } },
  { id: 'altstadt-sued', name: 'Altstadt-Süd', district: 'Innenstadt', center: { lng: 6.952, lat: 50.9325 } },
  { id: 'neustadt-nord', name: 'Neustadt-Nord', district: 'Innenstadt', center: { lng: 6.944, lat: 50.9475 } },
  { id: 'neustadt-sued', name: 'Neustadt-Süd', district: 'Innenstadt', center: { lng: 6.94, lat: 50.931 } },
  { id: 'deutz', name: 'Deutz', district: 'Innenstadt', center: { lng: 6.9765, lat: 50.9385 } },
  { id: 'ehrenfeld', name: 'Ehrenfeld', district: 'Ehrenfeld', center: { lng: 6.9165, lat: 50.9485 } },
  { id: 'lindenthal', name: 'Lindenthal', district: 'Lindenthal', center: { lng: 6.92, lat: 50.926 } },
  { id: 'suelz', name: 'Sülz', district: 'Lindenthal', center: { lng: 6.918, lat: 50.9175 } },
  { id: 'nippes', name: 'Nippes', district: 'Nippes', center: { lng: 6.9535, lat: 50.9655 } },
  { id: 'kalk', name: 'Kalk', district: 'Kalk', center: { lng: 7.0035, lat: 50.9385 } },
  { id: 'muelheim', name: 'Mülheim', district: 'Mülheim', center: { lng: 7.0085, lat: 50.9635 } },
  { id: 'bayenthal', name: 'Bayenthal', district: 'Rodenkirchen', center: { lng: 6.9655, lat: 50.9115 } },
];

export const VEEDEL: readonly Veedel[] = SEEDS.map((seed) => ({
  ...seed,
  purchasingPower: 1,
  policePresence: 1,
  density: 1,
  description: '',
}));

/**
 * Nachbarschaft: Veedel, die aneinandergrenzen (bzw. über eine Brücke verbunden sind).
 * Vereinfacht auf die Veedel im Spiel. Wird in Auftrag 10 aus den echten Grenzen abgeleitet.
 */
export const NEIGHBORS: Record<string, readonly string[]> = {
  'altstadt-nord': ['altstadt-sued', 'neustadt-nord', 'neustadt-sued', 'deutz'],
  'altstadt-sued': ['altstadt-nord', 'neustadt-sued', 'deutz', 'bayenthal'],
  'neustadt-nord': ['altstadt-nord', 'neustadt-sued', 'ehrenfeld', 'nippes'],
  'neustadt-sued': ['altstadt-nord', 'altstadt-sued', 'neustadt-nord', 'lindenthal', 'suelz', 'bayenthal'],
  deutz: ['altstadt-nord', 'altstadt-sued', 'kalk', 'muelheim'],
  ehrenfeld: ['neustadt-nord', 'lindenthal', 'nippes'],
  lindenthal: ['ehrenfeld', 'neustadt-sued', 'suelz'],
  suelz: ['lindenthal', 'neustadt-sued', 'bayenthal'],
  nippes: ['neustadt-nord', 'ehrenfeld', 'muelheim'],
  kalk: ['deutz', 'muelheim'],
  muelheim: ['deutz', 'kalk', 'nippes'],
  bayenthal: ['altstadt-sued', 'neustadt-sued', 'suelz'],
};
