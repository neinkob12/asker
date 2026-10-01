// Kontrast der Farbtokens mit den echten Hex-Werten aus tokens.css, für Hell und Dunkel.
// Regeln (Apple HIG, Accessibility): Text bis 17 pt 4.5:1, Symbole und Bedienelemente 3:1.
// Apps-Kacheln: Symbol auf dem Verlauf mindestens 3.5:1. Die Tokens tragen die Werte als light-dark(hell, dunkel),
// dieser Test löst sie für beide Schemata auf und vermischt Transparenz mit der Fläche dahinter.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type Scheme = 'light' | 'dark';
interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
const tokens = new Map<string, string>();
for (const match of css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
  // Der erste Eintrag zählt (:root), spätere Überschreibungen in Media Queries betreffen nur Layout.
  if (!tokens.has(match[1])) tokens.set(match[1], match[2].trim().replace(/\s+/g, ' '));
}

/** Teilt "a, b" auf oberster Ebene (Kommas in Klammern zählen nicht). */
function splitTop(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

function parseColor(value: string, scheme: Scheme): Rgba {
  const v = value.trim();
  const variable = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  if (variable) return resolve(variable[1], scheme);
  const lightDark = /^light-dark\((.*)\)$/.exec(v);
  if (lightDark) {
    const [light, dark] = splitTop(lightDark[1]);
    return parseColor(scheme === 'light' ? light : dark, scheme);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgba = /^rgba?\(([^)]*)\)$/.exec(v);
  if (rgba) {
    const [r, g, b, a] = rgba[1].split(',').map((p) => Number.parseFloat(p));
    return { r, g, b, a: a ?? 1 };
  }
  throw new Error(`Farbe nicht lesbar: ${value}`);
}

function resolve(name: string, scheme: Scheme): Rgba {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`Token fehlt: ${name}`);
  return parseColor(value, scheme);
}

const over = (top: Rgba, bottom: Rgba): Rgba => ({
  r: top.r * top.a + bottom.r * (1 - top.a),
  g: top.g * top.a + bottom.g * (1 - top.a),
  b: top.b * top.a + bottom.b * (1 - top.a),
  a: 1,
});

function luminance(c: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

/** Kontrastverhältnis (WCAG). Halbtransparente Vordergründe werden mit dem Hintergrund vermischt. */
function ratio(fg: Rgba, bg: Rgba): number {
  const f = fg.a < 1 ? over(fg, bg) : fg;
  const [hi, lo] = [luminance(f), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const SCHEMES: Scheme[] = ['light', 'dark'];
const CATEGORIES = [
  'money',
  'dirty',
  'danger',
  'warn',
  'brand',
  'place',
  'goods',
  'people',
  'chat',
  'sky',
  'law',
  'media',
  'system',
  'log',
] as const;

const surfaces = ['--phone-bg', '--phone-group', '--phone-group-2'] as const;

describe.each(SCHEMES)('Kontrast (%s)', (scheme) => {
  const get = (name: string) => resolve(name, scheme);

  it('Beschriftungen (primär, sekundär) auf allen Flächen: mindestens 4.5:1', () => {
    for (const surface of [...surfaces, '--color-surface', '--color-panel-solid', '--phone-bubble']) {
      for (const label of ['--color-text', '--color-muted']) {
        expect(ratio(get(label), get(surface)), `${label} auf ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(CATEGORIES)('Bedeutungsfarbe %s als Text auf Flächen und getöntem Grund: mindestens 4.5:1', (category) => {
    const text = get(`--cat-${category}`);
    for (const surface of surfaces) {
      const base = get(surface);
      expect(ratio(text, base), `${category} auf ${surface}`).toBeGreaterThanOrEqual(4.5);
      const tinted = over(get(`--cat-${category}-soft`), base);
      expect(ratio(text, tinted), `${category} auf getöntem Grund über ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(CATEGORIES)('App-Kachel %s: Symbol auf beiden Verlaufsenden mindestens 3.5:1', (category) => {
    const on = get(`--cat-${category}-on`);
    for (const end of ['a', 'b']) {
      expect(ratio(on, get(`--cat-${category}-${end}`)), `${category} Verlauf ${end}`).toBeGreaterThanOrEqual(3.5);
    }
  });

  it('Chat: weiße Schrift auf der eigenen (mint) Blase mindestens 4.5:1', () => {
    expect(ratio(get('--cat-chat-on'), get('--cat-chat-b'))).toBeGreaterThanOrEqual(4.5);
  });

  it('Knöpfe: Schrift auf Gold (primär), Grün (Erfolg) und Rot (Zähler) mindestens 4.5:1', () => {
    expect(ratio(get('--color-on-primary'), get('--color-primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get('--color-on-accent'), get('--money'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get('--color-on-badge'), get('--color-badge'))).toBeGreaterThanOrEqual(4.5);
  });

  it('Schalter, Fokus-Ring und Trenner sind als Bedienelemente erkennbar: mindestens 3:1', () => {
    expect(
      ratio({ r: 255, g: 255, b: 255, a: 1 }, get('--color-switch-on')),
      'weißer Schieber auf grüner Spur',
    ).toBeGreaterThanOrEqual(3);
    for (const surface of surfaces) {
      expect(ratio(get('--color-focus'), get(surface)), `Fokus auf ${surface}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Startbildschirm (Hintergrund immer dunkel, Schrift immer hell)', () => {
  const stops = ['--wall-night-top', '--wall-night-bottom', '--wall-day-top', '--wall-day-bottom'];
  const twilight = over({ ...resolve('--wall-twilight', 'dark'), a: 0.6 }, resolve('--wall-day-bottom', 'dark'));
  const twilightNight = over({ ...resolve('--wall-twilight', 'dark'), a: 0.6 }, resolve('--wall-night-bottom', 'dark'));
  it('Schrift auf allen Himmelsfarben: mindestens 4.5:1', () => {
    for (const label of ['--home-label', '--home-label-2']) {
      for (const stop of stops) {
        expect(ratio(resolve(label, 'dark'), resolve(stop, 'dark')), `${label} auf ${stop}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
      expect(ratio(resolve(label, 'dark'), twilight), `${label} auf Abendrot über Tag`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(resolve(label, 'dark'), twilightNight), `${label} auf Abendrot über Nacht`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});

describe('Dynamic Island (immer dunkel)', () => {
  it.each(CATEGORIES)('Bedeutungsfarbe %s (dunkel) auf Schwarz: mindestens 4.5:1', (category) => {
    const black: Rgba = { r: 0, g: 0, b: 0, a: 1 };
    expect(ratio(resolve(`--cat-${category}`, 'dark'), black)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('Über der Karte: Look Glas (immer dunkel)', () => {
  const get = (name: string) => resolve(name, 'dark');
  // Hellste Flächen der Karte (src/map/look.ts): Autobahn und hohe Häuser am Tag, Land in der Nacht.
  const MAP_SURFACES: Rgba[] = ['#7a7362', '#626a75', '#363b42', '#121519'].map((hex) => parseColor(hex, 'dark'));
  const glasses = ['--hud-glass', '--hud-glass-strong', '--spot-plate'];

  it('Text auf Glas über jeder Kartenfarbe: mindestens 4.5:1', () => {
    for (const glass of glasses) {
      for (const map of MAP_SURFACES) {
        const surface = over(get(glass), map);
        for (const text of ['--hud-ink', '--hud-ink-2', '--hud-gold']) {
          expect(ratio(get(text), surface), `${text} auf ${glass}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it.each(['dirty', 'money', 'goods', 'brand', 'place', 'danger', 'warn', 'sky', 'people'])(
    'Beschriftung %s auf Glas: mindestens 4.5:1',
    (category) => {
      for (const map of MAP_SURFACES) {
        const surface = over(get('--hud-glass'), map);
        expect(ratio(get(`--cat-${category}`), surface)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('deckendes Glas (weniger Transparenz): Text mindestens 4.5:1', () => {
    for (const text of ['--hud-ink', '--hud-ink-2']) {
      expect(ratio(get(text), get('--hud-glass-solid'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['idle', 'waiting', 'urgent', 'raid'])('Zahl auf dem Spot-Schild (%s): mindestens 4.5:1', (state) => {
    for (const map of MAP_SURFACES) {
      const fill = over(get(`--spot-${state}`), map);
      expect(ratio(get(`--spot-${state}-on`), fill), `${state} über Karte`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('Gold-Knopf und Geld-Popup: Schrift mindestens 4.5:1', () => {
    expect(ratio(get('--hud-gold-on'), get('--hud-gold'))).toBeGreaterThanOrEqual(4.5);
    for (const map of MAP_SURFACES) {
      expect(ratio(get('--map-money-on'), over(get('--map-money'), map))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(get('--map-money-loss-on'), over(get('--map-money-loss'), map))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('Akte: Schrift auf der Innenfläche und dem Reiter mindestens 4.5:1', () => {
    const inner = over(get('--file-inner'), parseColor('#7a7362', 'dark'));
    for (const text of ['--file-ink', '--file-ink-2', '--file-red', '--file-violet', '--hud-gold']) {
      expect(ratio(get(text), inner), text).toBeGreaterThanOrEqual(4.5);
    }
    for (const category of ['money', 'warn', 'danger', 'place']) {
      expect(ratio(get(`--cat-${category}`), inner), category).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(get('--file-tab-on'), get('--file-tab'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get('--file-polaroid-ink'), get('--file-polaroid'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get('--file-red'), get('--file-photo-foe-b'))).toBeGreaterThanOrEqual(3);
  });

  it('Razzia-Banner: Schrift auf dunkelrotem Glas mindestens 4.5:1', () => {
    for (const map of MAP_SURFACES) {
      const surface = over(get('--raid-glass'), map);
      for (const text of ['--hud-ink', '--hud-ink-2']) {
        expect(ratio(get(text), surface), text).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
