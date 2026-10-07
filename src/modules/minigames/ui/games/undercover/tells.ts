// Zivi oder Kunde (Auftrag 44, Teil 5): Merkmale als Daten. Zivis tragen mindestens zwei verdächtige Merkmale, echte
// Kunden höchstens eins (falsche Fährte). Dazu Harmloses, das nur so aussieht, und Zeichen, die für einen echten Kunden
// sprechen. Jedes Merkmal steht als Text auf der Karte; die mit `show` sieht man auch im Bild.

/** Wo man ein Merkmal im Bild sieht: Ohr und Kragen im Porträt, Gürtel und Schuhe am unteren Kartenrand, das Auto
 * gegenüber auf der Bühne, der Satz in der Sprechblase. */
export type TellShow = 'ear' | 'collar' | 'belt' | 'shoes' | 'car' | 'speech' | 'headphones' | 'none';

export interface TellDef {
  id: string;
  /** Was du siehst, kurz (als Chip). */
  text: string;
  show: TellShow;
}

/** Verdächtige Merkmale. hard: sieht man fast nur bei Zivis; soft: haben echte Kunden auch mal. */
export interface SuspiciousTell extends TellDef {
  strength: 'hard' | 'soft';
}

export const TELLS = [
  { id: 'earpiece', text: 'Knopf im Ohr', show: 'ear', strength: 'hard' },
  { id: 'wire', text: 'Kabel am Kragen', show: 'collar', strength: 'hard' },
  { id: 'bulge', text: 'Beule am Gürtel', show: 'belt', strength: 'hard' },
  { id: 'asksSupplier', text: 'Fragt nach deinem Lieferanten', show: 'speech', strength: 'hard' },
  { id: 'newShoes', text: 'Nagelneue Schuhe', show: 'shoes', strength: 'soft' },
  { id: 'bigOrder', text: 'Will gleich eine große Menge', show: 'speech', strength: 'soft' },
  { id: 'tooPolite', text: 'Auffallend höflich', show: 'speech', strength: 'soft' },
  { id: 'watchesCar', text: 'Schaut ständig zum Auto gegenüber', show: 'car', strength: 'soft' },
  { id: 'noSlang', text: 'Redet wie im Polizeibericht', show: 'speech', strength: 'soft' },
] as const satisfies readonly SuspiciousTell[];

export type TellId = (typeof TELLS)[number]['id'];

/** Harmloses, das nach etwas aussieht (Kopfhörer sind kein Knopf im Ohr). */
export const NOISE = [
  { id: 'headphones', text: 'Große Kopfhörer um den Hals', show: 'headphones' },
  { id: 'hood', text: 'Kapuze tief im Gesicht', show: 'none' },
  { id: 'beer', text: 'Bierdose in der Hand', show: 'none' },
  { id: 'dog', text: 'Hat einen Hund dabei', show: 'none' },
  { id: 'scooter', text: 'Kommt mit dem E-Roller', show: 'none' },
  { id: 'gymBag', text: 'Sporttasche über der Schulter', show: 'none' },
  { id: 'phone', text: 'Tippt dauernd aufs Handy', show: 'none' },
  { id: 'nervous', text: 'Tritt von einem Fuß auf den anderen', show: 'none' },
] as const satisfies readonly TellDef[];

export type NoiseId = (typeof NOISE)[number]['id'];

/** Zeichen für einen echten Kunden. Ab mittlerer Schwierigkeit hat auch mal ein Zivi seine Hausaufgaben gemacht. */
export const CUES = [
  { id: 'regular', text: 'War letzte Woche schon da', show: 'none' },
  { id: 'coins', text: 'Zählt Kleingeld ab', show: 'none' },
  { id: 'shaky', text: 'Zittrige Hände', show: 'none' },
  { id: 'local', text: 'Redet wie einer von hier', show: 'none' },
  { id: 'worn', text: 'Ausgelatschte Turnschuhe', show: 'shoes' },
] as const satisfies readonly TellDef[];

export type CueId = (typeof CUES)[number]['id'];

const BY_ID = new Map<string, TellDef>([...TELLS, ...NOISE, ...CUES].map((t) => [t.id, t]));

/** Ein Merkmal nach ID (für Anzeige und Tests). */
export function tellDef(id: string): TellDef | undefined {
  return BY_ID.get(id);
}

/** Ist das Merkmal verdächtig (zählt für die Faustregel „zwei sind ein Zivi“)? */
export function isSuspicious(id: string): boolean {
  return TELLS.some((t) => t.id === id);
}
