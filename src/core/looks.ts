// Aussehen und Stimme von Figuren (Porträts im Handy, Stimme im Anruf). Reine Daten, kein DOM: Die Oberfläche zeichnet
// daraus ein Gesicht (src/ui/components/Face.tsx) und spricht mit der Stimme (src/audio/voice.ts).
//
// Benannte Figuren (Fiete, Peter, Lieferanten …) geben ihr Aussehen im Kontakt mit (`Contact.look`, auch nur teilweise).
// Alles, was fehlt, kommt aus einem Hash über die ID der Figur: Dieselbe Person sieht immer gleich aus, in jedem Chat,
// im Personal und im Anruf. Kein ctx.random(), damit Spielstände und Balancing unberührt bleiben.

export type HairStyle = 'buzz' | 'short' | 'side' | 'curly' | 'long' | 'bun' | 'ponytail' | 'bald' | 'slick' | 'afro';
export type BeardStyle = 'none' | 'stubble' | 'moustache' | 'goatee' | 'full';
export type GlassesStyle = 'none' | 'round' | 'square' | 'sun';
export type HatStyle = 'none' | 'cap' | 'beanie' | 'skipper' | 'hood';
export type TopStyle = 'tee' | 'hoodie' | 'jacket' | 'suit' | 'raincoat' | 'tracksuit';
export type LookExtra = 'none' | 'scar' | 'earring' | 'chain' | 'tattoo';

export interface Look {
  feminine: boolean;
  /** Alter in Jahren. */
  age: number;
  /** Hautton, Index in SKIN_TONES. */
  skin: number;
  hair: HairStyle;
  /** Haarfarbe, Index in HAIR_COLORS. */
  hairColor: number;
  beard: BeardStyle;
  glasses: GlassesStyle;
  hat: HatStyle;
  top: TopStyle;
  /** Farbe der Kleidung, Index in TOP_COLORS. */
  topColor: number;
  extra: LookExtra;
}

/** Stimme im Anruf: Tonhöhe und Tempo (1 = normal). */
export interface VoiceSpec {
  feminine: boolean;
  /** 0,5 (tief) bis 1,6 (hoch). */
  pitch: number;
  /** 0,7 (langsam) bis 1,3 (schnell). */
  rate: number;
}

/** Hauttöne von hell nach dunkel (Namen für die Beschreibung, Farben zeichnet die Oberfläche). */
export const SKIN_TONES = 6;
export const HAIR_COLOR_NAMES = ['schwarze', 'dunkelbraune', 'braune', 'blonde', 'rote', 'graue', 'weiße'] as const;
export const TOP_COLOR_NAMES = [
  'Dunkelblau',
  'Schwarz',
  'Grau',
  'Oliv',
  'Weinrot',
  'Senfgelb',
  'Weiß',
  'Petrol',
] as const;

/** Weibliche Vornamen aus den Namenslisten des Spiels (für Figuren ohne eigenes Aussehen). */
const FEMININE_FIRST_NAMES = new Set([
  'jana',
  'chantal',
  'ayse',
  'leonie',
  'jessica',
  'denise',
  'sandra',
  'olga',
  'vanessa',
  'nadine',
  'bianca',
  'lea',
  'mia',
  'sophie',
  'hannah',
  'selin',
  'laura',
  'julia',
  'anna',
  'marie',
  'elif',
  'sarah',
  'deniz',
  'svetlana',
  'nina',
  'tanja',
  'meike',
  'gabi',
  'helga',
  'ute',
  'birgit',
  'jule',
  'lina',
  'emma',
  'yasemin',
  'zeynep',
  'fatma',
  'merve',
  'katja',
  'petra',
]);

/** Klingt der Vorname weiblich? Nur ein Hinweis für Figuren ohne eigenes Aussehen (erstes Wort des Namens). */
export function feminineName(name: string): boolean {
  const first =
    name
      .trim()
      .split(/[\s(„"]/)[0]
      ?.toLowerCase() ?? '';
  return FEMININE_FIRST_NAMES.has(first);
}

/** FNV-1a über einen Text: feste Zahl pro Figur. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Kleiner fester Zufall aus dem Hash (mulberry32), nur für das Aussehen. */
function stream(seed: string): () => number {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends string>(next: () => number, entries: readonly [T, number][]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = next() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * Aussehen einer Figur: eigene Angaben (partial) haben Vorrang, der Rest kommt fest aus seed (z.B. der Kontakt-ID).
 * name hilft beim Geschlecht, wenn partial es nicht sagt.
 */
export function lookFor(seed: string, name = '', partial: Partial<Look> = {}): Look {
  const next = stream(`look:${seed}`);
  const feminine = partial.feminine ?? (feminineName(name) || (name === '' && next() < 0.3));
  const age = partial.age ?? Math.round(19 + next() ** 1.6 * 42);
  const old = age >= 55;
  const hair =
    partial.hair ??
    (feminine
      ? weighted<HairStyle>(next, [
          ['long', 4],
          ['ponytail', 3],
          ['bun', 2],
          ['curly', 2],
          ['short', 1],
          ['afro', 1],
        ])
      : weighted<HairStyle>(next, [
          ['short', 4],
          ['buzz', 3],
          ['side', 2],
          ['curly', 1],
          ['slick', 1],
          ['bald', old ? 3 : 1],
          ['afro', 1],
        ]));
  const skin = partial.skin ?? Math.min(SKIN_TONES - 1, Math.floor(next() * SKIN_TONES));
  // Dunklere Haut: eher dunkles Haar. Alte Leute: grau oder weiß.
  const hairColor =
    partial.hairColor ??
    (old
      ? next() < 0.7
        ? 5
        : 6
      : skin >= 3
        ? Math.floor(next() * 2)
        : Number(
            weighted(next, [
              ['0', 3],
              ['1', 3],
              ['2', 3],
              ['3', 2],
              ['4', 1],
            ]),
          ));
  const beard =
    partial.beard ??
    (feminine
      ? 'none'
      : weighted<BeardStyle>(next, [
          ['none', 4],
          ['stubble', 4],
          ['moustache', 1],
          ['goatee', 1],
          ['full', age > 30 ? 2 : 1],
        ]));
  const glasses =
    partial.glasses ??
    weighted<GlassesStyle>(next, [
      ['none', 8],
      ['round', 1],
      ['square', old ? 3 : 1],
      ['sun', 1],
    ]);
  const hat =
    partial.hat ??
    weighted<HatStyle>(next, [
      ['none', 7],
      ['cap', feminine ? 1 : 2],
      ['beanie', 2],
      ['hood', 1],
    ]);
  const top =
    partial.top ??
    weighted<TopStyle>(next, [
      ['tee', 3],
      ['hoodie', 3],
      ['jacket', 3],
      ['tracksuit', age < 35 ? 2 : 0.5],
      ['suit', age > 30 ? 1 : 0.3],
    ]);
  const topColor = partial.topColor ?? Math.floor(next() * TOP_COLOR_NAMES.length);
  const extra =
    partial.extra ??
    weighted<LookExtra>(next, [
      ['none', 9],
      ['scar', feminine ? 0.3 : 1],
      ['earring', 1.5],
      ['chain', feminine ? 0.5 : 1.2],
      ['tattoo', 1],
    ]);
  return { feminine, age, skin, hair, hairColor, beard, glasses, hat, top, topColor, extra };
}

/**
 * Aussehen eines Menschen nur aus Name und Alter (Personal, Bewerber, Kunden): Der Name ist der Schlüssel, damit ein
 * Bewerber nach dem Anheuern (neue ID) gleich aussieht wie vorher und im Chat wie im Personal.
 */
export function personLook(name: string, age?: number): Look {
  return lookFor(`person:${name}`, name, age === undefined ? {} : { age });
}

/** Stimme passend zum Aussehen, eigene Angaben (partial) haben Vorrang. */
export function voiceFor(seed: string, look: Look, partial: Partial<VoiceSpec> = {}): VoiceSpec {
  const next = stream(`voice:${seed}`);
  const base = look.feminine ? 1.15 : 0.85;
  const ageShift = look.age > 50 ? -0.08 : look.age < 25 ? 0.06 : 0;
  const pitch = partial.pitch ?? Math.round((base + ageShift + (next() - 0.5) * 0.2) * 100) / 100;
  const rate =
    partial.rate ??
    Math.round((1 + (look.age < 30 ? 0.06 : look.age > 50 ? -0.07 : 0) + (next() - 0.5) * 0.12) * 100) / 100;
  return { feminine: partial.feminine ?? look.feminine, pitch, rate };
}

function ageText(age: number): string {
  if (age < 20) return 'Keine zwanzig';
  const decade = Math.floor(age / 10) * 10;
  const names: Record<number, string> = {
    20: 'zwanzig',
    30: 'dreißig',
    40: 'vierzig',
    50: 'fünfzig',
    60: 'sechzig',
    70: 'siebzig',
  };
  const word = names[decade] ?? `${decade}`;
  const part = age % 10;
  return `${part <= 3 ? 'Anfang' : part <= 6 ? 'Mitte' : 'Ende'} ${word}`;
}

const HAIR_TEXT: Record<HairStyle, (color: string) => string> = {
  buzz: (c) => `kurz geschorene ${c} Haare`,
  short: (c) => `kurze ${c} Haare`,
  side: (c) => `${c} Haare mit Seitenscheitel`,
  curly: (c) => `lockige ${c} Haare`,
  long: (c) => `lange ${c} Haare`,
  bun: (c) => `${c} Haare zum Dutt gebunden`,
  ponytail: (c) => `${c} Haare zum Zopf gebunden`,
  bald: () => 'Glatze',
  slick: (c) => `zurückgegelte ${c} Haare`,
  afro: (c) => `${c} Afro`,
};

const BEARD_TEXT: Record<BeardStyle, string> = {
  none: '',
  stubble: 'Dreitagebart',
  moustache: 'Schnauzer',
  goatee: 'Kinnbart',
  full: 'Vollbart',
};

const GLASSES_TEXT: Record<GlassesStyle, string> = {
  none: '',
  round: 'runde Brille',
  square: 'eckige Brille',
  sun: 'Sonnenbrille',
};

const HAT_TEXT: Record<HatStyle, string> = {
  none: '',
  cap: 'Basecap',
  beanie: 'Mütze',
  skipper: 'Elbsegler-Mütze',
  hood: 'Kapuze auf',
};

const TOP_TEXT: Record<TopStyle, string> = {
  tee: 'T-Shirt',
  hoodie: 'Kapuzenpulli',
  jacket: 'Jacke',
  suit: 'Anzug',
  raincoat: 'Öljacke',
  tracksuit: 'Trainingsjacke',
};

const EXTRA_TEXT: Record<LookExtra, string> = {
  none: '',
  scar: 'Narbe auf der Wange',
  earring: 'Ohrring',
  chain: 'Goldkette',
  tattoo: 'Tattoo am Hals',
};

/** Aussehen als einzelne Merkmale, z.B. ["Ende fünfzig", "grauer Vollbart", "Elbsegler-Mütze", "Öljacke in Dunkelblau"]. */
export function lookTraits(look: Look): string[] {
  const parts: string[] = [ageText(look.age)];
  // Mit Mütze sieht man von den Haaren wenig; mit Glatze keine Farbe.
  const color = HAIR_COLOR_NAMES[look.hairColor] ?? HAIR_COLOR_NAMES[0];
  if (look.hat === 'none' || look.hair === 'long' || look.hair === 'ponytail') parts.push(HAIR_TEXT[look.hair](color));
  if (BEARD_TEXT[look.beard]) {
    const beardColor = look.hairColor === 5 ? 'grauer ' : look.hairColor === 6 ? 'weißer ' : '';
    parts.push(look.beard === 'full' ? `${beardColor}Vollbart` : BEARD_TEXT[look.beard]);
  }
  if (GLASSES_TEXT[look.glasses]) parts.push(GLASSES_TEXT[look.glasses]);
  if (HAT_TEXT[look.hat]) parts.push(HAT_TEXT[look.hat]);
  parts.push(`${TOP_TEXT[look.top]} in ${TOP_COLOR_NAMES[look.topColor] ?? TOP_COLOR_NAMES[0]}`);
  if (EXTRA_TEXT[look.extra]) parts.push(EXTRA_TEXT[look.extra]);
  return parts;
}

/** Aussehen in einem Satz, z.B. "Ende fünfzig, kurze graue Haare, grauer Vollbart, Elbsegler-Mütze, Öljacke in Dunkelblau." */
export function describeLook(look: Look): string {
  return `${lookTraits(look).join(', ')}.`;
}
