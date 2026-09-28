// Nacht-Satellit: Aus Tageslicht, Dämmerung und Stimmung (z.B. Wetter) werden die Mal-Eigenschaften der
// Kartenebenen berechnet. Rein rechnerisch; GameMap setzt die Werte (nur wenn sie sich ändern).

/**
 * Stimmung, die ein Modul zur Karte beiträgt (z.B. das Wetter). Alle Werte 0–1, alle optional.
 * Mehrere Beiträge werden zusammengezählt. Setzen mit setMapMood(id, mood) aus src/map.
 */
export interface MapMood {
  /** Dunkler (Wolken, Gewitter). */
  darken?: number;
  /** Heller (Schnee reflektiert Licht). */
  brighten?: number;
  /** Weniger Farbe. */
  desaturate?: number;
  /** Farbstich über dem Luftbild als Hex-Farbe, z.B. '#1b3050'. */
  tint?: string;
  /** Stärke des Farbstichs. */
  tintStrength?: number;
  /** Dunst und Nebel am Horizont. */
  haze?: number;
  /** Nasse Straßen: Laternen spiegeln sich stärker. */
  wet?: number;
}

export interface MapLook {
  rasterBrightnessMax: number;
  rasterBrightnessMin: number;
  rasterSaturation: number;
  rasterContrast: number;
  tintColor: string;
  tintOpacity: number;
  waterColor: string;
  waterOpacity: number;
  roadColor: string;
  roadGlowOpacity: number;
  roadCoreOpacity: number;
  lampOpacity: number;
  /** Anteil beleuchteter Fenster (0–1). */
  windowsLit: number;
  wallColor: string;
  buildingOpacity: number;
  lightColor: string;
  lightIntensity: number;
  skyColor: string;
  horizonColor: string;
  fogColor: string;
  fogBlend: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (n: number) => Math.round(n * 1000) / 1000;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Zwei Hex-Farben mischen: t = 0 → a, t = 1 → b. */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const p = clamp01(t);
  return `#${ca
    .map((v, i) =>
      Math.round(lerp(v, cb[i], p))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
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

// Eckwerte für Nacht (0) und Tag (1).
const NIGHT = {
  brightnessMax: 0.3,
  saturation: -0.82,
  contrast: 0.22,
  tint: '#0a1f4d',
  tintOpacity: 0.42,
  water: '#01050b',
  waterOpacity: 0.72,
  road: '#ffb04d',
  glow: 0.32,
  core: 0.62,
  lamps: 0.95,
  wall: '#0a1019',
  light: '#e2e4f5',
  lightIntensity: 0.2,
  sky: '#02060d',
  horizon: '#0d1b31',
  fog: '#040912',
};
const DAY = {
  brightnessMax: 0.86,
  saturation: -0.38,
  contrast: 0.06,
  tint: '#1d2b3d',
  tintOpacity: 0.14,
  water: '#0b1c2b',
  waterOpacity: 0.35,
  road: '#cfd7e1',
  glow: 0.02,
  core: 0.16,
  lamps: 0,
  wall: '#3c4553',
  light: '#fff0da',
  lightIntensity: 0.42,
  sky: '#557090',
  horizon: '#9fb0c4',
  fog: '#7e8ea2',
};
const TWILIGHT_TINT = '#5b2f57';
const TWILIGHT_HORIZON = '#ff8a5c';

/**
 * Mal-Eigenschaften für Tageslicht d (0 Nacht … 1 Tag), Dämmerung tw (0–1) und eine (zusammengefasste) Stimmung.
 */
export function computeLook(d: number, tw: number, mood: MapMood = {}): MapLook {
  const day = clamp01(d);
  const twi = clamp01(tw);
  const darken = mood.darken ?? 0;
  const brighten = mood.brighten ?? 0;
  const wet = mood.wet ?? 0;
  const night = 1 - day;

  let tint = mixColor(NIGHT.tint, DAY.tint, day);
  tint = mixColor(tint, TWILIGHT_TINT, twi * 0.5);
  if (mood.tint) tint = mixColor(tint, mood.tint, clamp01((mood.tintStrength ?? 0) * 1.2));

  let horizon = mixColor(NIGHT.horizon, DAY.horizon, day);
  horizon = mixColor(horizon, TWILIGHT_HORIZON, twi * 0.55);

  return {
    rasterBrightnessMax: round(
      clamp01(lerp(NIGHT.brightnessMax, DAY.brightnessMax, day) * (1 - darken * 0.55) * (1 + brighten * 0.35)),
    ),
    rasterBrightnessMin: round(lerp(0, 0.03, day) + brighten * 0.06),
    rasterSaturation: round(
      Math.max(-1, lerp(NIGHT.saturation, DAY.saturation, day) - (mood.desaturate ?? 0) * 0.5 + twi * 0.12),
    ),
    rasterContrast: round(lerp(NIGHT.contrast, DAY.contrast, day)),
    tintColor: tint,
    tintOpacity: round(
      clamp01(lerp(NIGHT.tintOpacity, DAY.tintOpacity, day) + twi * 0.08 + (mood.tintStrength ?? 0) * 0.25),
    ),
    waterColor: mixColor(NIGHT.water, DAY.water, day),
    waterOpacity: round(lerp(NIGHT.waterOpacity, DAY.waterOpacity, day)),
    roadColor: mixColor(NIGHT.road, DAY.road, clamp01(day * 1.3)),
    roadGlowOpacity: round(clamp01(lerp(NIGHT.glow, DAY.glow, day) + wet * 0.14 * night + darken * 0.08 * day)),
    roadCoreOpacity: round(clamp01(lerp(NIGHT.core, DAY.core, day) + wet * 0.08)),
    lampOpacity: round(clamp01(lerp(NIGHT.lamps, DAY.lamps, clamp01(day * 1.6)) + darken * 0.3 * day)),
    windowsLit: round(clamp01(night * 0.9 + twi * 0.2 + darken * 0.25 + 0.06)),
    wallColor: mixColor(NIGHT.wall, DAY.wall, day * (1 - darken * 0.5)),
    buildingOpacity: round(lerp(0.94, 0.82, day)),
    lightColor: mixColor(NIGHT.light, DAY.light, day),
    lightIntensity: round(lerp(NIGHT.lightIntensity, DAY.lightIntensity, day) * (1 - darken * 0.4)),
    skyColor: mixColor(NIGHT.sky, DAY.sky, day * (1 - darken * 0.6)),
    horizonColor: horizon,
    fogColor: mixColor(NIGHT.fog, DAY.fog, day * (1 - darken * 0.5)),
    fogBlend: round(clamp01(0.35 + (mood.haze ?? 0) * 0.5)),
  };
}
