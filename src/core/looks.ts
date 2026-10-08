// Aussehen und Stimme von Figuren (Porträts im Handy, Stimme im Anruf). Reine Daten, kein DOM: Die Oberfläche zeichnet
// daraus ein Gesicht (src/ui/components/Face.tsx) und spricht mit der Stimme (src/audio/voice.ts).
//
// Benannte Figuren (Fiete, Peter, Lieferanten …) geben ihr Aussehen im Kontakt mit (`Contact.look`, auch nur teilweise).
// Alles, was fehlt, kommt aus einem Hash über die ID der Figur: Dieselbe Person sieht immer gleich aus, in jedem Chat,
// im Personal und im Anruf. Kein ctx.random(), damit Spielstände und Balancing unberührt bleiben.
//
// Das Spiel spielt auf der Straße: Dealer, Läufer, Leutnants, Hafenarbeiter, Geldwäscher. Die Verteilung der Merkmale
// folgt dem: Junge Leute tragen Fade, Cap nach hinten, Daunenjacke und Kette; Ältere eher Lederjacke, Anzug und Bart;
// Frauen genauso Straße (Creolen, Bandana, Puffer), nicht brav. Mehrere Extras pro Figur sind möglich, aber selten alle.

export type HairStyle =
  | 'buzz'
  | 'short'
  | 'side'
  | 'curly'
  | 'long'
  | 'bun'
  | 'ponytail'
  | 'bald'
  | 'slick'
  | 'afro'
  /** Oben kurz, Seiten rasiert. */
  | 'fade'
  /** Flechtreihen am Kopf. */
  | 'cornrows'
  /** Seiten rasiert, oben lang mit Strähne in der Stirn. */
  | 'undercut'
  | 'dreads'
  /** Vorne kurz, hinten lang. */
  | 'mullet'
  /** Straff nach hinten gekämmt, Knoten im Nacken. */
  | 'tight'
  /** Zwei lange Zöpfe. */
  | 'braids';
export type BeardStyle = 'none' | 'stubble' | 'moustache' | 'goatee' | 'full' | 'chinstrap';
export type GlassesStyle = 'none' | 'round' | 'square' | 'sun';
export type HatStyle =
  | 'none'
  | 'cap'
  /** Cap mit dem Schirm nach hinten. */
  | 'backcap'
  | 'beanie'
  /** Elbsegler (Hamburger Hafen). */
  | 'skipper'
  /** Kapuze auf, mit Kordeln. */
  | 'hood'
  | 'bucket'
  | 'durag'
  | 'bandana'
  /** Sturmhaube: nur bei Unbekannten aus dem Gangs-Umfeld (ID `gang:…`) oder ausdrücklich gesetzt. */
  | 'balaclava'
  /** Schirmmütze der Polizei (dunkelblau, Stern) und des Zolls (grün, Emblem): nie gewürfelt, nur ausdrücklich. */
  | 'police'
  | 'customs';
export type TopStyle =
  | 'tee'
  /** Muskelshirt. */
  | 'tank'
  | 'hoodie'
  | 'jacket'
  | 'leather'
  | 'bomber'
  /** Daunenjacke. */
  | 'puffer'
  | 'suit'
  /** Öljacke. */
  | 'raincoat'
  /** Trainingsjacke mit Streifen. */
  | 'tracksuit'
  /** Offenes Hemd, Kette auf der Brust. */
  | 'openshirt';
export type FaceShape = 'oval' | 'square' | 'narrow' | 'round';
/** Augenbrauen: weich, schräg nach innen (hart) oder dick. */
export type BrowStyle = 'soft' | 'hard' | 'heavy';
/** Augen: offen, schwere Lider, Augenringe, zusammengekniffen. */
export type EyeStyle = 'open' | 'heavy' | 'rings' | 'narrow';
/** Ausdruck über den Mund. */
export type MouthStyle = 'neutral' | 'hard' | 'grin' | 'smirk' | 'tired';
export type ScarStyle = 'none' | 'cheek' | 'brow' | 'lip';
/** Tattoo am Hals, Träne unterm Auge oder drei Punkte an der Schläfe. */
export type TattooStyle = 'none' | 'neck' | 'tear' | 'face';
export type TeethStyle = 'none' | 'gold' | 'grill';
export type MouthItem = 'none' | 'cigarette' | 'joint' | 'toothpick';
/** Ohrschmuck: Stecker, ein Ring, Creolen an beiden Ohren. */
export type EarringStyle = 'none' | 'stud' | 'hoop' | 'hoops';
export type ChainStyle = 'none' | 'thin' | 'thick' | 'pendant';
/** FFP-Maske oder Schlauchschal, halb hochgezogen. */
export type MaskStyle = 'none' | 'ffp' | 'tube';
/** Alt: ein einzelnes Extra. lookFor übersetzt es in scar, earring, chain und tattoo (und 'none' schaltet die vier aus). */
export type LookExtra = 'none' | 'scar' | 'earring' | 'chain' | 'tattoo';

export interface Look {
  feminine: boolean;
  /** Alter in Jahren. */
  age: number;
  /** Hautton, Index in SKIN_TONES. */
  skin: number;
  face: FaceShape;
  hair: HairStyle;
  /** Haarfarbe, Index in HAIR_COLORS. */
  hairColor: number;
  beard: BeardStyle;
  brows: BrowStyle;
  eyes: EyeStyle;
  mouth: MouthStyle;
  glasses: GlassesStyle;
  hat: HatStyle;
  top: TopStyle;
  /** Farbe der Kleidung, Index in TOP_COLORS. */
  topColor: number;
  scar: ScarStyle;
  /** Veilchen am linken Auge. */
  bruise: boolean;
  tattoo: TattooStyle;
  teeth: TeethStyle;
  mouthItem: MouthItem;
  earring: EarringStyle;
  chain: ChainStyle;
  mask: MaskStyle;
  /** Alt, nur als Eingabe (Kontakte von früher): wird in lookFor übersetzt und im Ergebnis nicht gesetzt. */
  extra?: LookExtra;
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

/** Unbekannte aus dem Gangs-Umfeld: Nur sie bekommen (selten) eine Sturmhaube, Personal, das man kennt, nie. */
const STRANGER_SEED = /^(gang|stranger):/;

/** FNV-1a über einen Text: feste Zahl pro Figur. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Fester Wert in [0, 1) für ein Merkmal einer Figur: Hash über Seed und Merkmal, einmal durchgemischt (ein Schritt
 * mulberry32). Jedes Merkmal hat so seinen eigenen Wurf: Eine Vorgabe oder ein neues Merkmal ändert den Rest des
 * Gesichts nicht, und ein Ausreißer an einer Stelle zieht keinen zweiten nach sich.
 */
function roll(seed: string, field: string): number {
  let t = (hash(`${seed}:${field}`) + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Kleiner fester Zufall aus dem Hash (mulberry32), für die Stimme. */
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
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  let roll = next() * total;
  for (const [value, w] of entries) {
    roll -= Math.max(0, w);
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/**
 * Aussehen einer Figur: eigene Angaben (partial) haben Vorrang, der Rest kommt fest aus seed (z.B. der Kontakt-ID).
 * name hilft beim Geschlecht, wenn partial es nicht sagt. Jedes Merkmal hat seinen eigenen festen Wurf (roll), eine
 * Vorgabe ändert also nicht den Rest des Gesichts.
 */
export function lookFor(seed: string, name = '', partial: Partial<Look> = {}): Look {
  const r = (field: string) => roll(`look:${seed}`, field);
  const pick = <T extends string>(field: string, given: T | undefined, entries: readonly [T, number][]): T => {
    const rolled = weighted(() => r(field), entries);
    return given ?? rolled;
  };
  const stranger = STRANGER_SEED.test(seed);
  // Alt: ein einzelnes Extra. 'none' heißt: keine der vier Verzierungen, ein Wert: genau diese.
  const legacy = partial.extra;
  const fromLegacy = <T extends string>(key: LookExtra, value: T): T | undefined =>
    legacy === undefined ? undefined : legacy === key ? value : ('none' as T);

  const genderRoll = r('gender');
  const feminine = partial.feminine ?? (feminineName(name) || (name === '' && genderRoll < 0.3));
  const ageRoll = r('age');
  const age = partial.age ?? Math.round(19 + ageRoll ** 1.6 * 42);
  const young = age < 30;
  const old = age >= 55;
  const mid = !young && !old;
  const skinRoll = r('skin');
  const skin = partial.skin ?? Math.min(SKIN_TONES - 1, Math.floor(skinRoll * SKIN_TONES));
  const darkSkin = skin >= 3;

  const face = pick<FaceShape>(
    'face',
    partial.face,
    feminine
      ? [
          ['oval', 4],
          ['narrow', 3],
          ['round', 2],
          ['square', 1],
        ]
      : [
          ['square', 3],
          ['oval', 3],
          ['narrow', 2],
          ['round', old ? 3 : 1.5],
        ],
  );

  const hair = pick<HairStyle>(
    'hair',
    partial.hair,
    feminine
      ? [
          ['tight', young ? 3 : 2],
          ['braids', young ? 2 : 0.5],
          ['long', young ? 3 : 2],
          ['ponytail', 3],
          ['bun', young ? 1.5 : 3],
          ['undercut', young ? 1 : 0.2],
          ['cornrows', darkSkin ? 1.5 : 0.4],
          ['curly', 1.5],
          ['short', old ? 3 : 1],
          ['afro', darkSkin ? 1.5 : 0.4],
          ['dreads', darkSkin ? 0.8 : 0.2],
        ]
      : [
          ['fade', young ? 4 : mid ? 2 : 0.3],
          ['buzz', 3],
          ['short', young ? 2 : 3],
          ['undercut', young ? 2 : mid ? 0.7 : 0],
          ['cornrows', darkSkin ? (young ? 2.5 : 1) : 0.4],
          ['dreads', darkSkin ? (young ? 1.5 : 0.6) : 0.3],
          ['curly', 1],
          ['slick', young ? 0.5 : 1.5],
          ['mullet', young ? 0.6 : 0.3],
          ['afro', darkSkin ? 1.2 : 0.3],
          ['bald', old ? 4 : mid ? 2 : 0.5],
          ['side', old ? 2 : mid ? 1 : 0.3],
        ],
  );

  // Dunklere Haut: eher dunkles Haar. Alte Leute: grau oder weiß.
  const colorRoll = r('hairColor');
  const hairColor =
    partial.hairColor ??
    (old
      ? colorRoll < 0.7
        ? 5
        : 6
      : darkSkin
        ? Math.floor(colorRoll * 2)
        : Number(
            weighted(
              () => colorRoll,
              [
                ['0', 3],
                ['1', 3],
                ['2', 3],
                ['3', 2],
                ['4', 1],
                ['5', age >= 45 ? 2 : 0],
              ],
            ),
          ));

  const beard = pick<BeardStyle>(
    'beard',
    partial.beard,
    feminine
      ? [['none', 1]]
      : [
          ['none', young ? 3 : 2],
          ['stubble', 4],
          ['goatee', young ? 1.5 : 1],
          ['chinstrap', young ? 1.2 : 0.4],
          ['full', young ? 1 : 3],
          ['moustache', old ? 2 : 0.4],
        ],
  );

  const brows = pick<BrowStyle>(
    'brows',
    partial.brows,
    feminine
      ? [
          ['soft', 4],
          ['hard', 3],
          ['heavy', 0.8],
        ]
      : [
          ['hard', 4],
          ['heavy', old ? 4 : 2.5],
          ['soft', 3],
        ],
  );
  const eyes = pick<EyeStyle>('eyes', partial.eyes, [
    ['open', 4],
    ['heavy', 3],
    ['rings', young ? 1.5 : 2.5],
    ['narrow', 2],
  ]);
  const mouthRolled = pick<MouthStyle>('mouth', partial.mouth, [
    ['neutral', 3],
    ['hard', 4],
    ['grin', 0.9],
    ['smirk', 1.8],
    ['tired', old ? 2.5 : 1.2],
  ]);

  const glasses = pick<GlassesStyle>('glasses', partial.glasses, [
    ['none', 8],
    ['round', 1],
    ['square', old ? 3 : 1],
    ['sun', young ? 2 : 1],
  ]);

  const hatRolled = pick<HatStyle>(
    'hat',
    partial.hat,
    feminine
      ? [
          ['none', old ? 8 : 5],
          ['backcap', young ? 1.8 : old ? 0.1 : 0.5],
          ['cap', 1],
          ['bandana', young ? 1.5 : 0.5],
          ['beanie', 1],
          ['hood', young ? 1 : 0.3],
          ['bucket', young ? 0.7 : 0.1],
          ['durag', darkSkin && young ? 0.5 : 0],
          ['balaclava', stranger ? 2 : 0],
        ]
      : [
          ['none', old ? 8 : mid ? 6 : 4],
          ['cap', 2],
          ['backcap', young ? 2 : 0.5],
          ['beanie', 1.5],
          ['hood', young ? 1.5 : 0.8],
          ['durag', darkSkin ? (young ? 1.5 : 0.6) : young ? 0.3 : 0],
          ['bandana', young ? 0.7 : 0.3],
          ['bucket', young ? 1 : 0.5],
          ['balaclava', stranger ? 3 : 0],
        ],
  );

  const topRolled = pick<TopStyle>(
    'top',
    partial.top,
    feminine
      ? [
          ['puffer', old ? 1.5 : 3],
          ['hoodie', young ? 3 : 1.5],
          ['tracksuit', young ? 2 : 1],
          ['tee', young ? 2 : 1.5],
          ['bomber', young ? 1.5 : 0.5],
          ['leather', young ? 1.5 : 2.5],
          ['tank', young ? 1 : 0.2],
          ['jacket', young ? 1 : 2.5],
          ['openshirt', 0.4],
          ['suit', young ? 0.2 : 1.5],
        ]
      : [
          ['hoodie', young ? 3 : mid ? 2 : 0.3],
          ['puffer', young ? 3 : mid ? 2 : 1],
          ['tracksuit', young ? 2.5 : mid ? 1.5 : 0.4],
          ['tee', young ? 2 : 1.5],
          ['bomber', young ? 1.5 : 1],
          ['tank', young ? 1 : 0.5],
          ['leather', young ? 0.7 : 2.5],
          ['openshirt', young ? 0.7 : 1.5],
          ['jacket', young ? 1 : 2.5],
          ['suit', young ? 0.2 : mid ? 1.5 : 3],
        ],
  );
  // Kapuze nur mit etwas, das eine hat (Kapuzenpulli, Trainingsjacke, Jacke drüber), nicht zu T-Shirt oder Hemd.
  const hoodless = new Set<TopStyle>(['tee', 'tank', 'suit', 'openshirt']);
  const top = hatRolled === 'hood' && partial.hat && hoodless.has(topRolled) && !partial.top ? 'hoodie' : topRolled;
  const hat = hatRolled === 'hood' && hoodless.has(top) ? (partial.hat ? 'hood' : 'none') : hatRolled;
  const topColorRoll = r('topColor');
  const topColor = partial.topColor ?? Math.floor(topColorRoll * TOP_COLOR_NAMES.length);

  // Wie viel Straße: Junge mehr, Anzug und Öljacke weniger (Spediteur und Hafen bleiben, was sie sind).
  const street = (young ? 1 : mid ? 0.7 : 0.4) * (top === 'suit' ? 0.3 : top === 'raincoat' ? 0.4 : 1);

  const scar = pick<ScarStyle>('scar', partial.scar ?? fromLegacy('scar', 'cheek'), [
    ['none', 7],
    ['cheek', feminine ? 0.4 : 1.2],
    ['brow', feminine ? 0.6 : 1.2],
    ['lip', feminine ? 0.2 : 0.6],
  ]);
  const bruiseRoll = r('bruise');
  // Veilchen nur bei Leuten von der Straße (nicht im Anzug, nicht bei Älteren).
  const bruise = partial.bruise ?? (street >= 0.5 && bruiseRoll < (feminine ? 0.03 : 0.06) * (street + 0.2));
  const tattoo = pick<TattooStyle>('tattoo', partial.tattoo ?? fromLegacy('tattoo', 'neck'), [
    ['none', 5],
    ['neck', (feminine ? 1.5 : 2.5) * street],
    ['tear', (feminine ? 0.2 : 0.8) * street],
    ['face', (feminine ? 0.5 : 0.7) * street],
  ]);
  const maskRolled = pick<MaskStyle>('mask', partial.mask, [
    ['none', 9],
    ['tube', 0.8 * street],
    ['ffp', 0.3 * street],
  ]);
  // Unter der Sturmhaube keine Maske.
  const mask = hat === 'balaclava' ? 'none' : maskRolled;
  const teethRolled = pick<TeethStyle>('teeth', partial.teeth, [
    ['none', 8],
    ['gold', 0.9 * street],
    ['grill', (feminine ? 0.3 : 0.5) * street],
  ]);
  const mouthItemRolled = pick<MouthItem>('mouthItem', partial.mouthItem, [
    ['none', 6],
    ['cigarette', feminine ? 1 : 1.2],
    ['joint', (feminine ? 0.4 : 0.8) * street],
    ['toothpick', (feminine ? 0.2 : 0.7) * (top === 'suit' ? 0.5 : 1)],
  ]);
  // Unter der Maske sieht man weder Zähne noch Zigarette.
  const teeth = mask === 'none' ? teethRolled : 'none';
  const mouthItem = mask === 'none' ? mouthItemRolled : 'none';
  // Goldzahn und Grill sieht man nur bei offenem Mund.
  const mouth =
    teeth !== 'none' && mouthRolled !== 'grin' && mouthRolled !== 'smirk' && !partial.mouth
      ? mouthRolled === 'hard'
        ? 'smirk'
        : 'grin'
      : mouthRolled;

  const earring = pick<EarringStyle>('earring', partial.earring ?? fromLegacy('earring', 'hoop'), [
    ['none', feminine ? 3 : 6.5],
    ['stud', 2],
    ['hoop', feminine ? 1 : 1.2],
    ['hoops', feminine ? 4 : 0.3],
  ]);
  const chain = pick<ChainStyle>('chain', partial.chain ?? fromLegacy('chain', 'thin'), [
    ['none', young ? 5.5 : mid ? 7 : 8],
    ['thin', 2],
    ['thick', (young ? 2 : 1.5) * (0.5 + street)],
    ['pendant', (young ? 1.5 : 1) * (0.5 + street)],
  ]);

  return {
    feminine,
    age,
    skin,
    face,
    hair,
    hairColor,
    beard,
    brows,
    eyes,
    mouth,
    glasses,
    hat,
    top,
    topColor,
    scar,
    bruise,
    tattoo,
    teeth,
    mouthItem,
    earring,
    chain,
    mask,
  };
}

/**
 * Aussehen eines Menschen nur aus Name und Alter (Personal, Bewerber, Kunden): Der Name ist der Schlüssel, damit ein
 * Bewerber nach dem Anheuern (neue ID) gleich aussieht wie vorher und im Chat wie im Personal.
 */
export function personLook(name: string, age?: number): Look {
  const key = `${name}|${age ?? ''}`;
  const known = PERSON_LOOKS.get(key);
  if (known) return known;
  const look = Object.freeze(lookFor(`person:${name}`, name, age === undefined ? {} : { age }));
  // Begrenzt: Bewerber kommen und gehen. Beim Überlauf fliegt der älteste Eintrag raus (Map merkt die Einfügereihenfolge).
  if (PERSON_LOOKS.size >= PERSON_LOOK_LIMIT) PERSON_LOOKS.delete(PERSON_LOOKS.keys().next().value as string);
  PERSON_LOOKS.set(key, look);
  return look;
}

/**
 * Gemerkte Porträts pro Name und Alter: Das Aussehen ist fest, aber ca. 30 Würfe teuer, und mit demselben Objekt
 * überspringt memo() bei Avatar und Face das Neuzeichnen. Die Objekte sind eingefroren, weil sie geteilt werden.
 */
const PERSON_LOOKS = new Map<string, Look>();
const PERSON_LOOK_LIMIT = 500;

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

/** Haare mit Farbe (c ist die Mehrzahl-Form, z.B. "schwarze"; Dativ: "schwarzen", weiblich: "schwarzer"). */
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
  // Der Afro ist männlich: "schwarzer Afro".
  afro: (c) => `${c}r Afro`,
  fade: (c) => `Fade-Cut mit ${c}n Haaren`,
  cornrows: (c) => `${c} Cornrows`,
  undercut: (c) => `Undercut mit ${c}r Strähne`,
  dreads: (c) => `${c} Dreads`,
  mullet: (c) => `${c} Haare als Vokuhila`,
  tight: (c) => `${c} Haare straff zurück`,
  braids: (c) => `${c} Braids`,
};

const FACE_TEXT: Record<FaceShape, string> = {
  oval: '',
  square: 'kantiges Gesicht',
  narrow: 'schmales Gesicht',
  round: 'rundes Gesicht',
};

const BEARD_TEXT: Record<BeardStyle, string> = {
  none: '',
  stubble: 'Dreitagebart',
  moustache: 'Schnauzer',
  goatee: 'Kinnbart',
  full: 'Vollbart',
  chinstrap: 'Kinnrandbart',
};

const BROW_TEXT: Record<BrowStyle, string> = { soft: '', hard: 'harte Brauen', heavy: 'buschige Brauen' };
const EYE_TEXT: Record<EyeStyle, string> = {
  open: '',
  heavy: 'schwere Lider',
  rings: 'Augenringe',
  narrow: 'zusammengekniffene Augen',
};
const MOUTH_TEXT: Record<MouthStyle, string> = {
  neutral: '',
  hard: 'harter Zug um den Mund',
  grin: 'breites Grinsen',
  smirk: 'schiefes Grinsen',
  tired: 'müder Blick',
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
  backcap: 'Cap nach hinten',
  beanie: 'Mütze',
  skipper: 'Elbsegler-Mütze',
  hood: 'Kapuze auf',
  bucket: 'Bucket Hat',
  durag: 'Durag',
  bandana: 'Bandana',
  balaclava: 'Sturmhaube',
  police: 'Polizeimütze',
  customs: 'Dienstmütze vom Zoll',
};

const TOP_TEXT: Record<TopStyle, string> = {
  tee: 'T-Shirt',
  tank: 'Muskelshirt',
  hoodie: 'Kapuzenpulli',
  jacket: 'Jacke',
  leather: 'Lederjacke',
  bomber: 'Bomberjacke',
  puffer: 'Daunenjacke',
  suit: 'Anzug',
  raincoat: 'Öljacke',
  tracksuit: 'Trainingsjacke',
  openshirt: 'offenes Hemd',
};

const SCAR_TEXT: Record<ScarStyle, string> = {
  none: '',
  cheek: 'Narbe auf der Wange',
  brow: 'Narbe durch die Braue',
  lip: 'Narbe an der Lippe',
};
const TATTOO_TEXT: Record<TattooStyle, string> = {
  none: '',
  neck: 'Tattoo am Hals',
  tear: 'Tränen-Tattoo',
  face: 'drei Punkte an der Schläfe',
};
const TEETH_TEXT: Record<TeethStyle, string> = { none: '', gold: 'Goldzahn', grill: 'Goldgrill' };
const MOUTH_ITEM_TEXT: Record<MouthItem, string> = {
  none: '',
  cigarette: 'Zigarette im Mundwinkel',
  joint: 'Joint im Mundwinkel',
  toothpick: 'Zahnstocher im Mund',
};
const EARRING_TEXT: Record<EarringStyle, string> = { none: '', stud: 'Ohrstecker', hoop: 'Ohrring', hoops: 'Creolen' };
const CHAIN_TEXT: Record<ChainStyle, string> = {
  none: '',
  thin: 'Goldkette',
  thick: 'dicke Goldkette',
  pendant: 'Goldkette mit Anhänger',
};
const MASK_TEXT: Record<MaskStyle, string> = { none: '', ffp: 'FFP-Maske halb hoch', tube: 'Schlauchschal halb hoch' };

/** Aussehen als einzelne Merkmale, z.B. ["Ende fünfzig", "grauer Vollbart", "Elbsegler-Mütze", "Öljacke in Dunkelblau"]. */
export function lookTraits(look: Look): string[] {
  const parts: string[] = [ageText(look.age)];
  const push = (text: string) => {
    if (text) parts.push(text);
  };
  const masked = look.hat === 'balaclava';
  push(FACE_TEXT[look.face]);
  // Mit Mütze sieht man von den Haaren wenig, mit Glatze keine Farbe, unter der Sturmhaube nichts.
  const color = HAIR_COLOR_NAMES[look.hairColor] ?? HAIR_COLOR_NAMES[0];
  const hairShows = look.hat === 'none' || look.hat === 'bandana' || look.hair === 'long' || look.hair === 'ponytail';
  const hairHangs = look.hair === 'braids' || look.hair === 'dreads' || look.hair === 'mullet';
  if (!masked && (hairShows || hairHangs)) push(HAIR_TEXT[look.hair](color));
  if (!masked && BEARD_TEXT[look.beard]) {
    const beardColor = look.hairColor === 5 ? 'grauer ' : look.hairColor === 6 ? 'weißer ' : '';
    push(look.beard === 'full' ? `${beardColor}Vollbart` : BEARD_TEXT[look.beard]);
  }
  push(BROW_TEXT[look.brows]);
  push(EYE_TEXT[look.eyes]);
  if (!masked && look.mask === 'none') push(MOUTH_TEXT[look.mouth]);
  push(GLASSES_TEXT[look.glasses]);
  push(HAT_TEXT[look.hat]);
  parts.push(`${TOP_TEXT[look.top]} in ${TOP_COLOR_NAMES[look.topColor] ?? TOP_COLOR_NAMES[0]}`);
  if (!masked) {
    push(SCAR_TEXT[look.scar]);
    if (look.bruise) push('Veilchen');
    push(TATTOO_TEXT[look.tattoo]);
    if (look.mask === 'none') {
      push(TEETH_TEXT[look.teeth]);
      push(MOUTH_ITEM_TEXT[look.mouthItem]);
    }
    push(MASK_TEXT[look.mask]);
    if (look.hat !== 'hood') push(EARRING_TEXT[look.earring]);
  }
  push(CHAIN_TEXT[look.chain]);
  return parts;
}

/** Aussehen in einem Satz, z.B. "Ende fünfzig, kurze graue Haare, grauer Vollbart, Elbsegler-Mütze, Öljacke in Dunkelblau." */
export function describeLook(look: Look): string {
  return `${lookTraits(look).join(', ')}.`;
}
