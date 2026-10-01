// Gedämpfter Look ("Nachtschicht"): vier Tageszeit-Paletten in Grau- und Schiefertönen (Morgen, Tag, Abend, Nacht) nach der Spieluhr, weich ineinander
// übergeblendet, dazu die Stimmung der Module (z.B. Wetter). Rein rechnerisch; GameMap setzt die Werte
// (nur wenn sie sich ändern).

import { DAWN, type DayPhase, DUSK } from '../core';

/**
 * Stimmung, die ein Modul zur Karte beiträgt (z.B. das Wetter). Alle Werte 0–1, alle optional.
 * Mehrere Beiträge werden zusammengezählt. Setzen mit setMapMood(id, mood) aus src/map.
 */
export interface MapMood {
  /** Dunkler und trüber (Wolken, Gewitter). */
  darken?: number;
  /** Heller (Schnee reflektiert Licht). */
  brighten?: number;
  /** Weniger Farbe. */
  desaturate?: number;
  /** Farbstich als Hex-Farbe, z.B. '#1b3050'. */
  tint?: string;
  /** Stärke des Farbstichs. */
  tintStrength?: number;
  /** Dunst und Nebel am Horizont. */
  haze?: number;
  /** Nasse Straßen: dunkler, nachts leuchten die Hauptstraßen stärker. */
  wet?: number;
}

/** Farben einer Tageszeit. Alle Farben als #rrggbb. */
export interface Palette {
  sky: string;
  horizon: string;
  land: string;
  park: string;
  wood: string;
  water: string;
  /** Uferlinie, etwas kräftiger als das Wasser. */
  waterLine: string;
  rail: string;
  minor: string;
  minorCasing: string;
  major: string;
  majorCasing: string;
  /** Autobahnen und Brücken. */
  highway: string;
  highwayCasing: string;
  /** Gebäude nach Höhe, niedrig → hoch. */
  buildings: readonly [string, string, string, string];
  shadow: string;
  shadowOpacity: number;
  /** Leuchten der Hauptstraßen (0–1), nachts hoch. */
  glow: number;
  light: string;
  lightIntensity: number;
}

export interface MapLook extends Palette {
  fog: string;
  fogBlend: number;
  /** 0 = heller Tag, 1 = tiefe Nacht (für Effekte: Hotspots leuchten, Scheinwerfer). */
  night: number;
  /** Überwiegende Tageszeit. */
  phase: DayPhase;
}

export const PALETTES: Record<DayPhase, Palette> = {
  day: {
    sky: '#4a5360',
    horizon: '#58606b',
    land: '#363b42',
    park: '#35443b',
    wood: '#314037',
    water: '#26394b',
    waterLine: '#35526d',
    rail: '#40464f',
    minor: '#4a5059',
    minorCasing: '#2c3137',
    major: '#61676f',
    majorCasing: '#3b4047',
    highway: '#7a7362',
    highwayCasing: '#4a463d',
    buildings: ['#424850', '#4b525b', '#565d67', '#626a75'],
    shadow: '#000000',
    shadowOpacity: 0.3,
    glow: 0,
    light: '#ffffff',
    lightIntensity: 0.34,
  },
  dawn: {
    sky: '#5a4e5a',
    horizon: '#6e5a5c',
    land: '#34363d',
    park: '#343f3a',
    wood: '#303b36',
    water: '#28374a',
    waterLine: '#3a4f6a',
    rail: '#40424b',
    minor: '#484b54',
    minorCasing: '#2c2e35',
    major: '#6a6461',
    majorCasing: '#3f3c3d',
    highway: '#86705b',
    highwayCasing: '#4d4239',
    buildings: ['#40434c', '#494c56', '#545762', '#606370'],
    shadow: '#000000',
    shadowOpacity: 0.3,
    glow: 0.15,
    light: '#ffe6ea',
    lightIntensity: 0.3,
  },
  dusk: {
    sky: '#5e4a3e',
    horizon: '#7a5a44',
    land: '#2f3136',
    park: '#2f3b33',
    wood: '#2b362f',
    water: '#233246',
    waterLine: '#344a64',
    rail: '#3b3c42',
    minor: '#43454b',
    minorCasing: '#27292e',
    major: '#8a7254',
    majorCasing: '#4a3f33',
    highway: '#a8804c',
    highwayCasing: '#5a4630',
    buildings: ['#3a3c43', '#42454d', '#4c4f58', '#575a64'],
    shadow: '#000000',
    shadowOpacity: 0.32,
    glow: 0.35,
    light: '#ffd1a6',
    lightIntensity: 0.3,
  },
  night: {
    sky: '#0f1216',
    horizon: '#1b2027',
    land: '#121519',
    park: '#18211c',
    wood: '#161e1a',
    water: '#1c3a57',
    waterLine: '#2a5070',
    rail: '#23272e',
    minor: '#272c33',
    minorCasing: '#15181c',
    major: '#b98f4c',
    majorCasing: '#6a522e',
    highway: '#d6a758',
    highwayCasing: '#7a5a2c',
    // Look "Glas" (Auftrag 24): Land und Häuser dunkler, das Leuchten der Hauptstraßen etwas zurückgenommen, damit
    // Spot-Schilder und Lichtkegel vorne stehen.
    buildings: ['#1b1f25', '#21262d', '#282d35', '#30363f'],
    shadow: '#000000',
    shadowOpacity: 0.4,
    glow: 0.6,
    light: '#9fb2d0',
    lightIntensity: 0.26,
  },
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (n: number) => Math.round(n * 1000) / 1000;
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Zwei Hex-Farben mischen: t = 0 → a, t = 1 → b. */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const p = clamp01(t);
  return toHex(ca.map((v, i) => lerp(v, cb[i], p)));
}

/** Farbe entsättigen: amount 0 = unverändert, 1 = grau (gleiche Helligkeit). */
export function desaturateColor(color: string, amount: number): string {
  const [r, g, b] = parseHex(color);
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  const p = clamp01(amount);
  return toHex([lerp(r, grey, p), lerp(g, grey, p), lerp(b, grey, p)]);
}

/** Helle Fassung einer Farbe. amount = Anteil Weiß. */
export function pastel(color: string, amount = 0.45): string {
  return mixColor(color, '#ffffff', amount);
}

/** Mehrere Stimmungen zu einer zusammenfassen. Der Farbstich wird nach Stärke gemittelt. */
export function combineMoods(moods: readonly MapMood[]): MapMood {
  const sum = (key: 'darken' | 'brighten' | 'desaturate' | 'haze' | 'wet') =>
    clamp01(moods.reduce((s, m) => s + (m[key] ?? 0), 0));
  const tinted = moods.filter((m) => m.tint && (m.tintStrength ?? 0) > 0);
  const strength = tinted.reduce((s, m) => s + (m.tintStrength ?? 0), 0);
  let tint: string | undefined;
  if (tinted.length > 0) {
    let acc = tinted[0].tint as string;
    let weight = tinted[0].tintStrength ?? 0;
    for (const m of tinted.slice(1)) {
      const w = m.tintStrength ?? 0;
      acc = mixColor(acc, m.tint as string, w / (weight + w));
      weight += w;
    }
    tint = acc;
  }
  return {
    darken: sum('darken'),
    brighten: sum('brighten'),
    desaturate: sum('desaturate'),
    haze: sum('haze'),
    wet: sum('wet'),
    tint,
    tintStrength: clamp01(strength),
  };
}

/** Zwei Paletten mischen (t = 0 → a, t = 1 → b). */
export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const c = (key: keyof Palette) => mixColor(a[key] as string, b[key] as string, t);
  const n = (key: keyof Palette) => lerp(a[key] as number, b[key] as number, clamp01(t));
  return {
    sky: c('sky'),
    horizon: c('horizon'),
    land: c('land'),
    park: c('park'),
    wood: c('wood'),
    water: c('water'),
    waterLine: c('waterLine'),
    rail: c('rail'),
    minor: c('minor'),
    minorCasing: c('minorCasing'),
    major: c('major'),
    majorCasing: c('majorCasing'),
    highway: c('highway'),
    highwayCasing: c('highwayCasing'),
    buildings: [0, 1, 2, 3].map((i) => mixColor(a.buildings[i], b.buildings[i], t)) as unknown as Palette['buildings'],
    shadow: c('shadow'),
    shadowOpacity: n('shadowOpacity'),
    glow: n('glow'),
    light: c('light'),
    lightIntensity: n('lightIntensity'),
  };
}

/**
 * Anteil der Dämmerung, in dem nur übergeblendet wird. Die Mitte (1 - 2 × BLEND) zeigt die Morgen- bzw.
 * Abendpalette unverändert, damit man sie auch bei schnellem Tempo sieht.
 */
const BLEND = 0.36;

/** Welche zwei Paletten zu einer Minute gemischt werden und wie stark. */
export function paletteBlend(minuteOfDay: number): { from: DayPhase; to: DayPhase; t: number } {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const window = (start: number, end: number, before: DayPhase, middle: DayPhase, after: DayPhase) => {
    const u = (m - start) / (end - start);
    if (u < BLEND) return { from: before, to: middle, t: smoothstep(u / BLEND) };
    if (u <= 1 - BLEND) return { from: middle, to: middle, t: 0 };
    return { from: middle, to: after, t: smoothstep((u - (1 - BLEND)) / BLEND) };
  };
  if (m >= DAWN.start && m < DAWN.end) return window(DAWN.start, DAWN.end, 'night', 'dawn', 'day');
  if (m >= DUSK.start && m < DUSK.end) return window(DUSK.start, DUSK.end, 'day', 'dusk', 'night');
  const phase: DayPhase = m >= DAWN.end && m < DUSK.start ? 'day' : 'night';
  return { from: phase, to: phase, t: 0 };
}

/** Palette zu einer (auch gebrochenen) Minute seit Mitternacht, ohne Stimmung. */
export function paletteAt(minuteOfDay: number): Palette {
  const { from, to, t } = paletteBlend(minuteOfDay);
  return mixPalette(PALETTES[from], PALETTES[to], t);
}

/** Dunkelheit für Effekte: Nacht 1, Abend 0,5, Morgen 0,35, Tag 0. */
const NIGHTNESS: Record<DayPhase, number> = { night: 1, dusk: 0.5, dawn: 0.35, day: 0 };

/**
 * Mal-Eigenschaften zu einer Minute seit Mitternacht (auch gebrochen) und einer (zusammengefassten) Stimmung.
 * Die Stimmung legt sich über die Palette: abdunkeln, aufhellen, entsättigen, einfärben.
 */
export function computeLook(minuteOfDay: number, mood: MapMood = {}): MapLook {
  const blend = paletteBlend(minuteOfDay);
  const base = mixPalette(PALETTES[blend.from], PALETTES[blend.to], blend.t);
  const night = lerp(NIGHTNESS[blend.from], NIGHTNESS[blend.to], blend.t);
  const darken = clamp01(mood.darken ?? 0);
  const brighten = clamp01(mood.brighten ?? 0);
  const desaturate = clamp01(mood.desaturate ?? 0);
  const tintStrength = mood.tint ? clamp01(mood.tintStrength ?? 0) : 0;
  const wet = clamp01(mood.wet ?? 0);
  // Tagsüber trübt das Wetter stärker als nachts (da ist ohnehin alles dunkel).
  const dull = darken * lerp(0.3, 0.12, night);
  const adjust = (color: string) => {
    let c = desaturateColor(color, desaturate * 0.55);
    if (tintStrength > 0 && mood.tint) c = mixColor(c, mood.tint, tintStrength * 0.45);
    if (dull > 0) c = mixColor(c, '#262a31', dull);
    if (brighten > 0) c = mixColor(c, '#ffffff', brighten * 0.4);
    return c;
  };
  const p = base;
  const minor = adjust(p.minor);
  const minorCasing = adjust(p.minorCasing);
  const sky = adjust(p.sky);
  const horizon = adjust(p.horizon);
  const land = adjust(p.land);
  return {
    sky,
    horizon,
    land,
    park: adjust(p.park),
    wood: adjust(p.wood),
    water: adjust(p.water),
    waterLine: adjust(p.waterLine),
    rail: adjust(p.rail),
    // Nasse Straßen werden etwas dunkler.
    minor: mixColor(minor, minorCasing, wet * 0.25),
    minorCasing,
    major: adjust(p.major),
    majorCasing: adjust(p.majorCasing),
    highway: adjust(p.highway),
    highwayCasing: adjust(p.highwayCasing),
    buildings: p.buildings.map(adjust) as unknown as Palette['buildings'],
    shadow: p.shadow,
    shadowOpacity: round(p.shadowOpacity * (1 - darken * 0.5)),
    glow: round(clamp01(p.glow + wet * 0.2 * night + darken * 0.15 * (1 - night))),
    light: adjust(p.light),
    lightIntensity: round(p.lightIntensity * (1 - darken * 0.3) * (1 + brighten * 0.2)),
    fog: mixColor(horizon, land, 0.35),
    // Nebel nur zum Horizont hin (0 = Kartenmitte, 1 = Horizont), Dunst holt ihn näher.
    fogBlend: round(clamp01(0.8 - (mood.haze ?? 0) * 0.4)),
    night: round(night),
    phase: blend.t < 0.5 ? blend.from : blend.to,
  };
}
