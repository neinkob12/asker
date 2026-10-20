// Zeichnen für den Straßenkampf: Seitenansicht einer Kölner Straße bei Nacht (oder Tag), Parallaxe in drei Ebenen,
// Figuren als Gliederpuppen mit Umriss im Aussehen aus dem Look-System (Hautton, Frisur, Bart, Kopfbedeckung,
// Oberteil und Farbe). Statische Teile (Himmel, Häuser, Kulisse) liegen nach jeder Größenänderung fertig in eigenen
// Leinwänden; pro Bild werden sie nur verschoben zusammengesetzt, dazu die Figuren und die Effekte.
//
// Farben der Szene aus den Design-Tokens (mapToken). Haut-, Haar- und Kleidungsfarben kommen aus dem Look-System
// (LOOK_COLORS, dieselben Listen wie Face), keine Bedeutungsfarben.

import { createRng, type Look } from '../../../../../core';
import { mapToken } from '../../../../../map';
import { LOOK_COLORS } from '../../../../../ui';
import { ARENA_W, type AttackId, type Fighter, type FighterState } from './model';

// ---------------------------------------------------------------------------------------------
// Farben

const SKIN = LOOK_COLORS.skin;
const HAIR = LOOK_COLORS.hair;
const TOP = LOOK_COLORS.top;
/** Hosen: Jeans, Schwarz, Grau, Oliv (aus dem Seed). */
const PANTS = ['#2c3a55', '#18181c', '#3c3f45', '#3b4230', '#26324a'];
const INK = '#120d0c';
const METAL = '#c9ccd2';

export interface BrawlPalette {
  base: string;
  ink: string;
  ink2: string;
  gold: string;
  danger: string;
  money: string;
  warn: string;
  place: string;
  people: string;
  media: string;
  chat: string;
  law: string;
  dirty: string;
  goods: string;
}

export function readPalette(): BrawlPalette {
  return {
    base: mapToken('--hud-glass-solid', '#16181d'),
    ink: mapToken('--hud-ink', '#ffffff'),
    ink2: mapToken('--hud-ink-2', 'rgba(235, 235, 245, 0.72)'),
    gold: mapToken('--hud-gold', '#f2c766'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    money: mapToken('--cat-money', '#30d158'),
    warn: mapToken('--cat-warn', '#ff9f0a'),
    place: mapToken('--cat-place', '#6ab2ff'),
    people: mapToken('--cat-people', '#40c8e0'),
    media: mapToken('--cat-media', '#ff899f'),
    chat: mapToken('--cat-chat', '#63e6e2'),
    law: mapToken('--cat-law', '#a7a5ff'),
    dirty: mapToken('--cat-dirty', '#d891ff'),
    goods: mapToken('--cat-goods', '#c8aa85'),
  };
}

/** Farbe als rgba mit Deckkraft (aus #rrggbb oder rgb[a](…)). */
export function alpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const hex = color.length === 4 ? color.replace(/#(.)(.)(.)/, '#$1$1$2$2$3$3') : color;
    const n = Number.parseInt(hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m) return color;
  const [r, g, b] = m[1].split(',').map((v) => v.trim());
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function tint(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

/** Zwei Farben (#rrggbb) mischen: k = 0 a, 1 b. */
function mix(a: string, b: string, k: number): string {
  const na = Number.parseInt(a.slice(1, 7), 16);
  const nb = Number.parseInt(b.slice(1, 7), 16);
  const c = (shift: number) => Math.round(((na >> shift) & 255) * (1 - k) + ((nb >> shift) & 255) * k);
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------------------------
// Lage

export interface BrawlLayout {
  width: number;
  height: number;
  /** Pixel pro Meter. */
  ppm: number;
  /** Boden der vorderen Ebene (Füße), der hinteren liegt laneGap darüber. */
  groundY: number;
  laneGap: number;
  /** Sichtbare Breite in Metern. */
  view: number;
  /** Horizont (Fuß der Häuser). */
  horizon: number;
}

/** Platz oben (HUD) und unten (Knöpfe) bleibt frei; am Handy ist die Bühne enger, die Figuren etwas größer. */
export function brawlLayout(width: number, height: number, mobile: boolean): BrawlLayout {
  const bottom = mobile ? 236 : 70;
  const groundY = Math.max(height * 0.5, height - bottom);
  const ppm = Math.max(36, Math.min(height * (mobile ? 0.15 : 0.2), width / (mobile ? 4.5 : 8)));
  // Seit Auftrag 49 deutlich mehr Tiefe zwischen den Ebenen (vorher 0,42 m: alle standen wie in einer Reihe).
  const laneGap = Math.max(24, ppm * LANE_DEPTH);
  return { width, height, ppm, groundY, laneGap, view: width / ppm, horizon: groundY - laneGap - ppm * 0.55 };
}

/** Abstand der hinteren Ebene im Bild (Meter nach oben) und wie viel kleiner sie ist. */
export const LANE_DEPTH = 0.72;
export const LANE_SCALE = 0.17;

/** Kamera (Mitte in Metern) innerhalb der Bühne halten. */
export function clampCamera(layout: BrawlLayout, x: number): number {
  const half = layout.view / 2;
  if (layout.view >= ARENA_W) return ARENA_W / 2;
  return Math.min(ARENA_W - half, Math.max(half, x));
}

export function toScreen(layout: BrawlLayout, cam: number, x: number, depth: number) {
  const scale = 1 - depth * LANE_SCALE;
  return {
    x: (x - cam) * layout.ppm + layout.width / 2,
    y: layout.groundY - depth * layout.laneGap,
    scale,
  };
}

function offscreen(width: number, height: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [canvas, ctx];
}

// ---------------------------------------------------------------------------------------------
// Kulisse

export interface Scene {
  setting: string;
  phase: string;
  weather: string;
  seed: number;
}

export interface Backdrop {
  /** Himmel (fest). */
  sky: HTMLCanvasElement;
  /** Ferne Häuser, Parallaxe FAR. */
  far: HTMLCanvasElement;
  /** Häuserfront bzw. Halle nach Ort, Parallaxe MID. */
  mid: HTMLCanvasElement;
  /** Straße mit Laternen (Gehweg, Bordstein, Fahrbahn), bewegt sich mit der Welt; beginnt bei streetTop. */
  street: HTMLCanvasElement;
  streetTop: number;
  /** Nasse Spiegelungen der Leuchtschilder (Ebene wie die Front), sonst null. */
  glare: HTMLCanvasElement | null;
  /** Wie breit die Ebenen sind (CSS-Pixel). */
  farW: number;
  midW: number;
  streetW: number;
  /** Leuchtschilder (x in Metern der Front, y in Pixeln der Front). */
  lights: { x: number; y: number; color: string; r: number }[];
}

export const FAR = 0.25;
export const MID = 0.6;

const isNight = (phase: string) => phase === 'night';
const isDim = (phase: string) => phase !== 'day';
export const isWet = (weather: string) => weather === 'rain' || weather === 'storm';

function skyColors(phase: string, p: BrawlPalette): [string, string, string] {
  switch (phase) {
    case 'day':
      return [alpha(p.place, 0.32), alpha(p.ink, 0.1), alpha(p.ink, 0.04)];
    case 'dawn':
      return [alpha(p.law, 0.25), alpha(p.media, 0.22), alpha(p.warn, 0.2)];
    case 'dusk':
      return [alpha(p.law, 0.28), alpha(p.dirty, 0.2), alpha(p.warn, 0.3)];
    default:
      return [alpha(p.law, 0.16), alpha(p.place, 0.06), alpha(p.warn, 0.08)];
  }
}

/** Himmel als Verlauf über dem dunklen Grund (bei Nacht fast schwarz, Stadtglühen am Horizont). */
function renderSky(layout: BrawlLayout, scene: Scene, p: BrawlPalette, dpr: number): HTMLCanvasElement {
  const { width, height } = layout;
  const [canvas, ctx] = offscreen(width, height, dpr);
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, width, height);
  const [top, mid, low] = skyColors(scene.phase, p);
  const g = ctx.createLinearGradient(0, 0, 0, layout.horizon);
  g.addColorStop(0, top);
  g.addColorStop(0.6, mid);
  g.addColorStop(1, low);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, layout.horizon + 2);
  if (isNight(scene.phase) && scene.weather === 'clear') {
    const rng = createRng(scene.seed + 3);
    ctx.fillStyle = alpha(p.ink, 0.5);
    for (let i = 0; i < 40; i++) ctx.fillRect(rng() * width, rng() * layout.horizon * 0.5, 1.2, 1.2);
  }
  if (scene.weather === 'cloudy' || isWet(scene.weather) || scene.weather === 'snow') {
    ctx.fillStyle = alpha(p.base, 0.35);
    ctx.fillRect(0, 0, width, layout.horizon);
  }
  return canvas;
}

/** Ferne Häuser: Silhouetten mit Fenstern, Kirchturm und Kran als Kölner Note. */
function renderFar(layout: BrawlLayout, scene: Scene, p: BrawlPalette, dpr: number): [HTMLCanvasElement, number] {
  const w = Math.ceil(layout.width + ARENA_W * layout.ppm * FAR + 40);
  const h = layout.horizon + 4;
  const [canvas, ctx] = offscreen(w, h, dpr);
  const rng = createRng(scene.seed + 11);
  const unit = layout.ppm * 0.55;
  const silhouette = alpha(p.ink, isDim(scene.phase) ? 0.04 : 0.08);
  let x = -10;
  while (x < w) {
    const bw = unit * (1.2 + rng() * 2.4);
    const bh = unit * (1.6 + rng() * 3.4);
    ctx.fillStyle = silhouette;
    ctx.fillRect(x, h - bh, bw - 3, bh);
    // Fenster (bei Nacht warm erleuchtet).
    const lit = isDim(scene.phase) ? 0.3 : 0.06;
    for (let wy = h - bh + unit * 0.3; wy < h - unit * 0.3; wy += unit * 0.45) {
      for (let wx = x + unit * 0.2; wx < x + bw - unit * 0.3; wx += unit * 0.38) {
        if (rng() > lit) continue;
        ctx.fillStyle = alpha(p.gold, 0.08 + rng() * 0.12);
        ctx.fillRect(wx, wy, unit * 0.12, unit * 0.16);
      }
    }
    x += bw;
  }
  // Doppelturm in der Ferne (nur als Silhouette).
  const dx = w * (0.35 + rng() * 0.3);
  ctx.fillStyle = alpha(p.ink, isDim(scene.phase) ? 0.07 : 0.11);
  for (const off of [0, unit * 0.9]) {
    ctx.beginPath();
    ctx.moveTo(dx + off, h);
    ctx.lineTo(dx + off, h - unit * 5.4);
    ctx.lineTo(dx + off + unit * 0.3, h - unit * 6.6);
    ctx.lineTo(dx + off + unit * 0.6, h - unit * 5.4);
    ctx.lineTo(dx + off + unit * 0.6, h);
    ctx.fill();
  }
  // Flugwarnlichter.
  ctx.fillStyle = alpha(p.danger, 0.7);
  for (let i = 0; i < 3; i++) ctx.fillRect(rng() * w, h - unit * (4 + rng() * 2), 2, 2);
  return [canvas, w];
}

/** Leuchtschild mit Schrift (Neon bei Nacht: Schein als zweiter, blasser Rahmen; shadowBlur ist zu teuer). */
function neonSign(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  lit: boolean,
): void {
  ctx.font = `700 ${Math.round(size)}px "Barlow Condensed", "Barlow", sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(text).width;
  const pad = size * 0.35;
  ctx.fillStyle = alpha(INK, 0.6);
  roundRect(ctx, x - tw / 2 - pad, y - size * 0.7, tw + pad * 2, size * 1.4, size * 0.25);
  ctx.fill();
  if (lit) {
    ctx.fillStyle = alpha(color, 0.18);
    roundRect(ctx, x - tw / 2 - pad * 2, y - size * 1.05, tw + pad * 4, size * 2.1, size * 0.5);
    ctx.fill();
  }
  ctx.strokeStyle = alpha(color, lit ? 0.9 : 0.35);
  ctx.lineWidth = Math.max(1.5, size * 0.08);
  roundRect(ctx, x - tw / 2 - pad, y - size * 0.7, tw + pad * 2, size * 1.4, size * 0.25);
  ctx.stroke();
  ctx.fillStyle = lit ? color : alpha(color, 0.45);
  ctx.fillText(text, x, y + size * 0.04);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Graffiti: ein paar kurze Tags (Zickzack und Bögen) in Bedeutungsfarben, blass (Kulisse). */
function graffiti(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  x: number,
  y: number,
  size: number,
  colors: string[],
) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const h = size * 0.18;
  let cx = x;
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = alpha(colors[Math.floor(rng() * colors.length)], 0.22);
    ctx.lineWidth = Math.max(1.5, size * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx, y);
    const letters = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < letters; k++) {
      const w = h * (0.35 + rng() * 0.3);
      if (rng() < 0.5) ctx.lineTo(cx + w * 0.5, y - h);
      else ctx.quadraticCurveTo(cx + w * 0.2, y - h * 1.4, cx + w * 0.5, y - h * 0.4);
      ctx.lineTo(cx + w, y);
      cx += w;
    }
    ctx.stroke();
    cx += h * 0.4;
    y += h * 0.2;
  }
}

/** Häuserfront bzw. Halle nach Ort (spot, warehouse, street, meeting; port und autobahn wie warehouse/street). */
function renderMid(layout: BrawlLayout, scene: Scene, p: BrawlPalette, dpr: number) {
  const w = Math.ceil(layout.width + ARENA_W * layout.ppm * MID + 40);
  const top = Math.max(0, layout.horizon - layout.ppm * 4.2);
  const h = layout.horizon + 2;
  const [canvas, ctx] = offscreen(w, h, dpr);
  const rng = createRng(scene.seed + 23);
  const u = layout.ppm;
  const lit = isDim(scene.phase);
  const lights: Backdrop['lights'] = [];
  const setting = scene.setting === 'port' ? 'warehouse' : scene.setting === 'autobahn' ? 'street' : scene.setting;
  ctx.lineCap = 'round';

  if (setting === 'warehouse') {
    // Hallen aus Wellblech mit Rolltoren, Paletten und Fässern.
    let x = -u;
    while (x < w) {
      const bw = u * (4.5 + rng() * 2);
      const roof = h - u * (3.4 + rng() * 0.6);
      ctx.fillStyle = alpha(p.ink, lit ? 0.09 : 0.14);
      ctx.fillRect(x, roof, bw - u * 0.15, h - roof);
      ctx.fillStyle = alpha(p.ink, 0.12);
      ctx.fillRect(x - u * 0.05, roof - u * 0.12, bw - u * 0.05, u * 0.12);
      ctx.strokeStyle = alpha(p.ink, 0.05);
      ctx.lineWidth = 1;
      for (let lx = x; lx < x + bw - u * 0.15; lx += u * 0.18) {
        ctx.beginPath();
        ctx.moveTo(lx, roof);
        ctx.lineTo(lx, h);
        ctx.stroke();
      }
      // Rolltor.
      const dw = u * 2;
      const dx = x + (bw - dw) / 2;
      ctx.fillStyle = alpha(INK, 0.45);
      ctx.fillRect(dx, h - u * 2.4, dw, u * 2.4);
      ctx.strokeStyle = alpha(p.ink, 0.08);
      for (let ly = h - u * 2.4; ly < h; ly += u * 0.16) {
        ctx.beginPath();
        ctx.moveTo(dx, ly);
        ctx.lineTo(dx + dw, ly);
        ctx.stroke();
      }
      ctx.fillStyle = alpha(p.warn, 0.5);
      ctx.font = `700 ${Math.round(u * 0.26)}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(rng() < 0.5 ? `HALLE ${1 + Math.floor(rng() * 9)}` : 'LAGER', dx + dw / 2, h - u * 2.55);
      // Lampe über dem Tor.
      lights.push({ x: (dx + dw / 2) / u, y: h - u * 3.1, color: p.gold, r: u * 1.6 });
      ctx.fillStyle = alpha(p.gold, lit ? 0.9 : 0.4);
      ctx.fillRect(dx + dw / 2 - u * 0.2, h - u * 3.15, u * 0.4, u * 0.08);
      graffiti(ctx, rng, x + u * 0.3, h - u * 0.9, u * 0.9, [p.dirty, p.chat, p.media]);
      x += bw;
    }
    // Paletten und Fässer davor.
    for (let i = 0; i < w / (u * 3); i++) {
      const px = rng() * w;
      ctx.fillStyle = alpha(p.ink, 0.1);
      ctx.fillRect(px, h - u * 0.5, u * 1.1, u * 0.5);
      ctx.fillStyle = alpha(p.warn, 0.18);
      ctx.fillRect(px + u * 1.3, h - u * 0.8, u * 0.5, u * 0.8);
    }
  } else if (setting === 'meeting') {
    // Unterführung: Betonpfeiler, Neonröhre, Graffiti.
    ctx.fillStyle = alpha(p.ink, 0.06);
    ctx.fillRect(0, top, w, u * 0.9);
    let x = 0;
    while (x < w) {
      ctx.fillStyle = alpha(p.ink, lit ? 0.09 : 0.14);
      ctx.fillRect(x, top + u * 0.9, u * 0.9, h - top);
      graffiti(ctx, rng, x + u * 1.4, h - u * 1.4, u * 1.4, [p.dirty, p.chat, p.media, p.place]);
      // Röhre unter der Decke.
      const lx = x + u * 2.6;
      ctx.fillStyle = alpha(p.chat, lit ? 0.85 : 0.35);
      ctx.fillRect(lx, top + u * 1.05, u * 1.2, u * 0.07);
      lights.push({ x: (lx + u * 0.6) / u, y: top + u * 1.1, color: p.chat, r: u * 1.8 });
      x += u * (4.6 + rng() * 1.5);
    }
  } else {
    // Straße bzw. Spot: Häuserfronten mit Läden, Büdchen, Kneipe, Rollläden, Graffiti.
    let x = -u;
    let shop = 0;
    const signs: [string, string][] =
      setting === 'spot'
        ? [
            ['KIOSK', p.place],
            ['BÜDCHEN', p.gold],
            ['BAR', p.media],
            ['SPÄTI', p.chat],
            ['IMBISS', p.warn],
          ]
        : [
            ['SHISHA', p.dirty],
            ['WETTBÜRO', p.money],
            ['KIOSK', p.place],
            ['FRISÖR', p.chat],
            ['IMBISS', p.warn],
          ];
    while (x < w) {
      const bw = u * (3.2 + rng() * 1.8);
      const storeys = 3 + Math.floor(rng() * 2);
      const bh = u * (1.2 * storeys + 0.8);
      ctx.fillStyle = alpha(p.ink, (lit ? 0.05 : 0.09) + rng() * 0.04);
      ctx.fillRect(x, h - bh, bw - u * 0.08, bh);
      // Fenster oben.
      for (let s = 1; s < storeys; s++) {
        for (let k = 0; k < 3; k++) {
          const wx = x + u * 0.35 + k * ((bw - u * 0.7) / 3);
          const wy = h - u * 2.4 - s * u * 1.15;
          if (wy < top) continue;
          const on = lit && rng() < 0.35;
          ctx.fillStyle = on ? alpha(p.gold, 0.22 + rng() * 0.15) : alpha(INK, 0.35);
          ctx.fillRect(wx, wy, u * 0.55, u * 0.75);
        }
      }
      // Laden unten: Schaufenster oder Rollladen.
      const sx = x + u * 0.3;
      const sw = bw - u * 0.75;
      const open = rng() < 0.55;
      ctx.fillStyle = open ? alpha(p.gold, lit ? 0.12 : 0.06) : alpha(INK, 0.4);
      ctx.fillRect(sx, h - u * 1.85, sw, u * 1.85);
      if (!open) {
        ctx.strokeStyle = alpha(p.ink, 0.07);
        ctx.lineWidth = 1;
        for (let ly = h - u * 1.85; ly < h; ly += u * 0.12) {
          ctx.beginPath();
          ctx.moveTo(sx, ly);
          ctx.lineTo(sx + sw, ly);
          ctx.stroke();
        }
        graffiti(ctx, rng, sx + u * 0.2, h - u * 0.9, Math.min(sw, u * 1.6), [p.dirty, p.chat, p.media, p.place]);
      } else {
        lights.push({ x: (sx + sw / 2) / u, y: h - u * 1, color: p.gold, r: u * 1.3 });
      }
      const [text, color] = signs[shop % signs.length];
      shop += 1;
      neonSign(ctx, text, sx + sw / 2, h - u * 2.15, u * 0.34, color, lit);
      if (lit) lights.push({ x: (sx + sw / 2) / u, y: h - u * 2.15, color, r: u * 1.2 });
      x += bw;
    }
  }
  if (lit) bakeGlow(ctx, lights, u);
  return { canvas, w, lights };
}

/** Boden: Gehweg mit Platten (zwei Ebenen), Bordstein, Straße mit Markierung; Laternen kommen pro Bild dazu. */
function renderGround(layout: BrawlLayout, scene: Scene, p: BrawlPalette, dpr: number) {
  const u = layout.ppm;
  const w = Math.ceil(ARENA_W * u + layout.width + 40);
  const h = layout.height - layout.horizon;
  const [canvas, ctx] = offscreen(w, h, dpr);
  const y0 = 0;
  const curb = layout.groundY - layout.horizon + u * 0.28;
  const wet = isWet(scene.weather);
  // Gehweg.
  const walk = ctx.createLinearGradient(0, y0, 0, curb);
  walk.addColorStop(0, alpha(p.ink, 0.08));
  walk.addColorStop(1, alpha(p.ink, 0.13));
  ctx.fillStyle = walk;
  ctx.fillRect(0, y0, w, curb);
  ctx.strokeStyle = alpha(INK, 0.35);
  ctx.lineWidth = 1;
  // Platten (perspektivisch: Fugen schräg).
  for (let x = 0; x < w; x += u * 0.9) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x - u * 0.25, curb);
    ctx.stroke();
  }
  for (const fy of [curb * 0.45]) {
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(w, fy);
    ctx.stroke();
  }
  // Bordstein.
  ctx.fillStyle = alpha(p.ink, 0.2);
  ctx.fillRect(0, curb, w, Math.max(3, u * 0.08));
  // Straße.
  const road = ctx.createLinearGradient(0, curb, 0, h);
  road.addColorStop(0, alpha(INK, 0.55));
  road.addColorStop(1, alpha(INK, 0.8));
  ctx.fillStyle = road;
  ctx.fillRect(0, curb + Math.max(3, u * 0.08), w, h);
  ctx.fillStyle = alpha(p.ink, 0.22);
  for (let x = 0; x < w; x += u * 2.2) ctx.fillRect(x, curb + u * 0.55, u * 1.1, Math.max(2, u * 0.05));
  // Pfützen (nass: glänzen, Spiegelungen kommen pro Bild dazu).
  if (wet) {
    const rng = createRng(scene.seed + 31);
    for (let i = 0; i < w / (u * 2.5); i++) {
      ctx.fillStyle = alpha(p.ink, 0.06);
      ctx.beginPath();
      ctx.ellipse(rng() * w, curb * (0.2 + rng() * 0.7), u * (0.4 + rng() * 0.6), u * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (scene.weather === 'snow') {
    ctx.fillStyle = alpha(p.ink, 0.12);
    ctx.fillRect(0, y0, w, curb * 0.2);
    ctx.fillRect(0, curb - 2, w, 4);
  }
  return { canvas, w };
}

/** Laternen in Weltkoordinaten (Meter): alle sechs Meter eine. */
export const LAMPS = [2.5, 8.5, 14.5];

/** Schein der Leuchtschilder und Fenster, fest in die Häuserfront gebacken (pro Bild keine Verläufe). */
function bakeGlow(ctx: CanvasRenderingContext2D, lights: Backdrop['lights'], ppm: number): void {
  for (const l of lights) {
    const x = l.x * ppm;
    const g = ctx.createRadialGradient(x, l.y, 0, x, l.y, l.r);
    g.addColorStop(0, alpha(l.color, 0.16));
    g.addColorStop(1, alpha(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
}

/** Nasse Straße: Spiegelungen der Leuchtschilder als senkrechte, blasse Streifen (Ebene wie die Häuserfront). */
function renderGlare(layout: BrawlLayout, lights: Backdrop['lights'], midW: number, dpr: number) {
  const { ppm } = layout;
  const h = layout.height - layout.horizon;
  const [canvas, ctx] = offscreen(midW, h, dpr);
  const ry = layout.groundY - layout.laneGap * 0.5 - layout.horizon;
  for (const l of lights) {
    const x = l.x * ppm;
    const g = ctx.createLinearGradient(0, ry - ppm * 0.5, 0, ry + ppm * 1.1);
    g.addColorStop(0, alpha(l.color, 0));
    g.addColorStop(0.4, alpha(l.color, 0.13));
    g.addColorStop(1, alpha(l.color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - ppm * 0.16, ry - ppm * 0.5, ppm * 0.32, ppm * 1.6);
  }
  return canvas;
}

/** Laternen mit Lichtkegel und Lichtfleck, in der Welt (wie der Boden), über den Boden gebacken. */
function bakeLamps(
  ctx: CanvasRenderingContext2D,
  layout: BrawlLayout,
  scene: Scene,
  p: BrawlPalette,
  top: number,
): void {
  const { ppm } = layout;
  const dim = isDim(scene.phase);
  const wet = isWet(scene.weather);
  // y in dieser Leinwand: Bildschirm-y minus top.
  const groundY = layout.groundY - top;
  const foot = groundY - layout.laneGap * 1.3;
  const head = foot - ppm * 3.4;
  for (const lx of LAMPS) {
    const x = lx * ppm;
    const cx = x + ppm * 0.46;
    if (dim) {
      const g = ctx.createLinearGradient(0, head, 0, groundY + ppm * 0.2);
      g.addColorStop(0, alpha(p.gold, 0.2));
      g.addColorStop(1, alpha(p.gold, 0.02));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - ppm * 0.14, head - ppm * 0.14);
      ctx.lineTo(cx + ppm * 0.14, head - ppm * 0.14);
      ctx.lineTo(cx + ppm * 1.5, groundY + ppm * 0.2);
      ctx.lineTo(cx - ppm * 1.5, groundY + ppm * 0.2);
      ctx.closePath();
      ctx.fill();
      const py = groundY - layout.laneGap * 0.5;
      const pool = ctx.createRadialGradient(cx, py, 0, cx, py, ppm * 1.8);
      pool.addColorStop(0, alpha(p.gold, wet ? 0.2 : 0.12));
      pool.addColorStop(1, alpha(p.gold, 0));
      ctx.fillStyle = pool;
      ctx.fillRect(cx - ppm * 1.8, py - ppm * 1.8, ppm * 3.6, ppm * 3.6);
      if (wet) {
        const sg = ctx.createLinearGradient(0, py - ppm * 0.2, 0, py + ppm * 1.2);
        sg.addColorStop(0, alpha(p.gold, 0.22));
        sg.addColorStop(1, alpha(p.gold, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(cx - ppm * 0.12, py - ppm * 0.2, ppm * 0.24, ppm * 1.4);
      }
    }
    ctx.strokeStyle = alpha(p.ink, 0.22);
    ctx.lineWidth = Math.max(2, ppm * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, foot);
    ctx.lineTo(x, head);
    ctx.quadraticCurveTo(x, head - ppm * 0.25, x + ppm * 0.45, head - ppm * 0.2);
    ctx.stroke();
    ctx.fillStyle = dim ? p.gold : alpha(p.ink, 0.3);
    ctx.fillRect(x + ppm * 0.3, head - ppm * 0.2, ppm * 0.32, ppm * 0.07);
  }
}

export function renderBackdrop(layout: BrawlLayout, scene: Scene, p: BrawlPalette, dpr: number): Backdrop {
  const [far, farW] = renderFar(layout, scene, p, dpr);
  const mid = renderMid(layout, scene, p, dpr);
  const ground = renderGround(layout, scene, p, dpr);
  // Boden und Laternen in einer Leinwand (beide bewegen sich mit der Welt).
  const top = Math.max(0, layout.groundY - layout.laneGap * 1.3 - layout.ppm * 3.8);
  const [street, sctx] = offscreen(ground.w, layout.height - top, dpr);
  sctx.drawImage(ground.canvas, 0, layout.horizon - top, ground.w, layout.height - layout.horizon);
  bakeLamps(sctx, layout, scene, p, top);
  return {
    sky: renderSky(layout, scene, p, dpr),
    far,
    farW,
    mid: mid.canvas,
    midW: mid.w,
    street,
    streetW: ground.w,
    streetTop: top,
    glare: isWet(scene.weather) && isDim(scene.phase) ? renderGlare(layout, mid.lights, mid.w, dpr) : null,
    lights: mid.lights,
  };
}

/** Kulisse für die Kamera cam zusammensetzen: Himmel, ferne Häuser, Front, Straße mit Laternen, Spiegelungen. */
export function drawBackdrop(ctx: CanvasRenderingContext2D, layout: BrawlLayout, bd: Backdrop, cam: number): void {
  const { width, height, ppm } = layout;
  ctx.drawImage(bd.sky, 0, 0, width, height);
  const left = cam - layout.view / 2;
  const farH = bd.far.height / (bd.far.width / bd.farW);
  ctx.drawImage(bd.far, -left * ppm * FAR - 20, layout.horizon + 4 - farH, bd.farW, farH);
  const midH = bd.mid.height / (bd.mid.width / bd.midW);
  const midX = -left * ppm * MID - 20;
  ctx.drawImage(bd.mid, midX, layout.horizon + 2 - midH, bd.midW, midH);
  ctx.drawImage(bd.street, -left * ppm, bd.streetTop, bd.streetW, height - bd.streetTop);
  if (bd.glare) ctx.drawImage(bd.glare, midX, layout.horizon, bd.midW, height - layout.horizon);
}

// ---------------------------------------------------------------------------------------------
// Figuren

/** Haltung: Winkel in Bogenmaß, 0 = gerade nach unten, positiv = nach vorn (Blickrichtung). */
export interface Pose {
  /** Neigung des Oberkörpers (positiv = nach vorn). */
  lean: number;
  /** Knie gebeugt: so viel tiefer steht die Hüfte (Meter). */
  crouch: number;
  /** Vorderer und hinterer Arm: [Schulter, Ellbogen]; vorderes und hinteres Bein: [Hüfte, Knie]. */
  fa: [number, number];
  ba: [number, number];
  fl: [number, number];
  bl: [number, number];
  /** Drehung der ganzen Figur um die Füße (am Boden: liegt). */
  rot: number;
  /** Der ganze Körper so weit nach vorn (Meter): Ausfallschritt beim Schlag, zurück beim Ausholen und Getroffenwerden. */
  shift: number;
  /** Kopf zusätzlich geneigt (positiv = nach vorn, Kinn runter; negativ = Kopf fliegt nach hinten). */
  head: number;
}

const GUARD: Pose = {
  lean: 0.06,
  crouch: 0.07,
  fa: [0.75, 2.05],
  ba: [0.45, 2.3],
  fl: [0.3, -0.32],
  bl: [-0.26, -0.06],
  rot: 0,
  shift: 0,
  head: 0.08,
};

const POSES: Partial<Record<FighterState, Pose>> = {
  idle: GUARD,
  block: {
    lean: 0.04,
    crouch: 0.12,
    fa: [1.35, 1.55],
    ba: [1.15, 1.75],
    fl: [0.32, -0.36],
    bl: [-0.3, -0.08],
    rot: 0,
    shift: -0.04,
    head: 0.3,
  },
  dodge: {
    lean: -0.5,
    crouch: 0.2,
    fa: [0.6, 2.2],
    ba: [0.3, 2.4],
    fl: [0.55, -0.9],
    bl: [-0.45, -0.2],
    rot: 0,
    shift: -0.1,
    head: 0.2,
  },
  hit: {
    lean: -0.42,
    crouch: 0.05,
    fa: [0.4, 0.7],
    ba: [-0.4, 0.6],
    fl: [0.35, -0.2],
    bl: [-0.15, -0.1],
    rot: 0,
    shift: -0.2,
    head: -0.55,
  },
  down: {
    lean: -0.05,
    crouch: 0,
    fa: [2.9, 0.2],
    ba: [2.2, 0.5],
    fl: [0.12, -0.25],
    bl: [-0.02, 0],
    rot: -1.52,
    shift: 0,
    head: -0.3,
  },
};

/**
 * Ausholen: deutlich zurück (Gewicht nach hinten, Arm bzw. Bein weit weg), damit man die Ansage auch ohne Zeichen
 * liest. k (0–1) = wie weit das Ausholen ist; gegen Ende zieht es noch etwas weiter zurück (Spannung).
 */
function windupPose(attack: AttackId | null, heavyKick: boolean, k: number): Pose {
  const pull = 0.6 + 0.4 * k;
  if (attack === 'heavy' && heavyKick)
    return { ...GUARD, lean: -0.2 * pull, crouch: 0.05, fl: [0.95 * pull, -1.7], bl: [-0.1, 0], shift: -0.1 * pull };
  if (attack === 'heavy')
    return {
      ...GUARD,
      lean: -0.24 * pull,
      crouch: 0.15,
      ba: [-0.95 * pull, 1.95],
      fa: [0.9, 1.8],
      shift: -0.16 * pull,
      head: 0.25,
    };
  if (attack === 'knife') return { ...GUARD, lean: -0.16 * pull, fa: [2.6, 0.5], shift: -0.12 * pull, head: 0.2 };
  return { ...GUARD, lean: -0.04, fa: [0.25, 2.5], shift: -0.05, head: 0.15 };
}

/** Schlag: Ausfallschritt nach vorn, Arm gestreckt, Kopf hinterher. */
function strikePose(attack: AttackId | null, heavyKick: boolean): Pose {
  if (attack === 'heavy' && heavyKick)
    return { ...GUARD, lean: -0.3, crouch: 0, fl: [1.6, -0.05], bl: [-0.12, 0], shift: 0.12, head: 0.2 };
  if (attack === 'heavy')
    return {
      ...GUARD,
      lean: 0.42,
      crouch: 0.12,
      ba: [1.62, 0.04],
      fa: [0.5, 2.2],
      fl: [0.6, -0.5],
      bl: [-0.55, 0],
      shift: 0.34,
      head: 0.15,
    };
  if (attack === 'knife') return { ...GUARD, lean: 0.34, fa: [1.38, 0.12], fl: [0.5, -0.4], shift: 0.3, head: 0.1 };
  return { ...GUARD, lean: 0.2, fa: [1.6, 0.03], shift: 0.16, head: 0.12 };
}

/** Wie jemand im Stand federt: Tempo, Federn, Pendeln, Hände tief (Anführer lässig), Blick zur Seite (Nervöser). */
const STANCE: Record<Fighter['kind'], { freq: number; bounce: number; sway: number; hands: number; glance: number }> = {
  player: { freq: 4.2, bounce: 0.03, sway: 0.04, hands: 0, glance: 0 },
  crew: { freq: 3.6, bounce: 0.025, sway: 0.035, hands: 0, glance: 0 },
  leader: { freq: 2.4, bounce: 0.012, sway: 0.05, hands: 0.35, glance: 0 },
  nervous: { freq: 7.2, bounce: 0.03, sway: 0.03, hands: -0.1, glance: 0.35 },
  bruiser: { freq: 1.9, bounce: 0.02, sway: 0.08, hands: 0.1, glance: 0 },
};

function phaseOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 997;
  return h * 0.37;
}

/** Zielhaltung für einen Kämpfer (die Oberfläche blendet weich dorthin). walk = Schrittphase. */
export function targetPose(f: Fighter, walk: number, t: number): Pose {
  const kick = f.kind === 'leader';
  switch (f.state) {
    case 'windup':
      return windupPose(f.attack, kick, f.dur > 0 ? Math.min(1, f.t / f.dur) : 1);
    case 'strike':
      return strikePose(f.attack, kick);
    case 'recover':
      return f.t < f.dur * 0.35 ? strikePose(f.attack, kick) : { ...GUARD, shift: 0.04, head: 0.12 };
    case 'walk':
    case 'run': {
      const s = Math.sin(walk);
      const run = f.state === 'run';
      const swing = run ? 0.75 : 0.45;
      return {
        ...GUARD,
        lean: run ? 0.32 : 0.08,
        crouch: 0.05 + Math.abs(Math.cos(walk)) * 0.03,
        fl: [0.05 + swing * s, -0.25 - 0.5 * Math.max(0, -s)],
        bl: [0.05 - swing * s, -0.25 - 0.5 * Math.max(0, s)],
        fa: run ? [0.3 - 0.7 * s, 1.6] : GUARD.fa,
        ba: run ? [0.3 + 0.7 * s, 1.6] : GUARD.ba,
      };
    }
    case 'idle': {
      const st = STANCE[f.kind];
      const ph = t * st.freq + phaseOf(f.id);
      if (f.hesitate > 0)
        return {
          ...GUARD,
          lean: -0.08,
          crouch: 0.02 + Math.sin(t * 2) * 0.01,
          fa: [0.4 + Math.sin(t * 3) * 0.15, 0.6],
          ba: [0.2, 0.6],
          head: -0.1 + Math.sin(t * 1.3) * 0.1,
        };
      if (f.grab > 0)
        return {
          ...GUARD,
          lean: 0.6,
          crouch: 0.25,
          fa: [0.9 + Math.sin(t * 9) * 0.2, 0.2],
          ba: [0.7 + Math.cos(t * 9) * 0.2, 0.3],
          head: 0.3,
        };
      // Angeschlagen (unter 60 % Leben): krumm, Deckung sinkt, schwankt mehr.
      const hurt = Math.max(0, Math.min(1, (0.6 - f.hp / f.maxHp) / 0.6));
      if (hurt > 0) {
        const wob = Math.sin(t * 1.7 + phaseOf(f.id)) * hurt;
        return {
          ...GUARD,
          lean: GUARD.lean + 0.16 * hurt + wob * 0.06,
          crouch: GUARD.crouch + 0.06 * hurt,
          fa: [GUARD.fa[0] - 0.3 * hurt, GUARD.fa[1] - 0.2 * hurt],
          ba: [GUARD.ba[0] - 0.25 * hurt, GUARD.ba[1] - 0.3 * hurt],
          fl: [GUARD.fl[0] + wob * 0.05, GUARD.fl[1]],
          bl: [GUARD.bl[0] - wob * 0.05, GUARD.bl[1]],
          shift: wob * 0.08,
          head: GUARD.head + 0.18 * hurt + wob * 0.08,
        };
      }
      // Federn auf den Fußballen (zweimal pro Pendel), Hände pumpen leicht, Oberkörper pendelt.
      const bob = 0.5 + 0.5 * Math.sin(ph * 2);
      const pump = Math.sin(ph + 1.2);
      const glance = st.glance > 0 && Math.sin(t * 0.9 + phaseOf(f.id)) > 0.75 ? -st.glance : 0;
      return {
        ...GUARD,
        lean: GUARD.lean + Math.sin(ph) * st.sway * 0.8,
        crouch: GUARD.crouch + bob * st.bounce,
        fa: [GUARD.fa[0] - st.hands + pump * 0.09, GUARD.fa[1] + st.hands * 0.5 - pump * 0.08],
        ba: [GUARD.ba[0] - st.hands + Math.sin(ph + 2.4) * 0.07, GUARD.ba[1] + st.hands * 0.4],
        fl: [GUARD.fl[0] + Math.sin(ph) * 0.03, GUARD.fl[1] - bob * 0.06],
        bl: [GUARD.bl[0] - Math.sin(ph) * 0.03, GUARD.bl[1] - bob * 0.05],
        shift: Math.sin(ph) * st.sway,
        head: GUARD.head + Math.sin(ph * 0.5) * 0.04 + glance,
      };
    }
    default:
      return POSES[f.state] ?? GUARD;
  }
}

function lerpPair(a: [number, number], b: [number, number], k: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

/** Weich von einer Haltung zur nächsten (k = Anteil pro Bild). */
export function blendPose(from: Pose, to: Pose, k: number): Pose {
  return {
    lean: from.lean + (to.lean - from.lean) * k,
    crouch: from.crouch + (to.crouch - from.crouch) * k,
    fa: lerpPair(from.fa, to.fa, k),
    ba: lerpPair(from.ba, to.ba, k),
    fl: lerpPair(from.fl, to.fl, k),
    bl: lerpPair(from.bl, to.bl, k),
    rot: from.rot + (to.rot - from.rot) * k,
    shift: from.shift + (to.shift - from.shift) * k,
    head: from.head + (to.head - from.head) * k,
  };
}

export function idlePose(): Pose {
  return { ...GUARD, fa: [...GUARD.fa], ba: [...GUARD.ba], fl: [...GUARD.fl], bl: [...GUARD.bl] };
}

/** Haltung mit Schwung: Feder pro Gelenk (Geschwindigkeit in vel, gleiche Reihenfolge wie poseValues). */
export interface PoseSpring {
  pose: Pose;
  vel: number[];
}

const POSE_KEYS = 13;

function poseValues(p: Pose): number[] {
  return [p.lean, p.crouch, ...p.fa, ...p.ba, ...p.fl, ...p.bl, p.rot, p.shift, p.head];
}

function setPose(p: Pose, v: readonly number[]): void {
  p.lean = v[0];
  p.crouch = v[1];
  p.fa = [v[2], v[3]];
  p.ba = [v[4], v[5]];
  p.fl = [v[6], v[7]];
  p.bl = [v[8], v[9]];
  p.rot = v[10];
  p.shift = v[11];
  p.head = v[12];
}

export function poseSpring(): PoseSpring {
  return { pose: idlePose(), vel: new Array(POSE_KEYS).fill(0) };
}

/**
 * Feder zur Zielhaltung: freq in rad/s (wie schnell), damping < 1 schwingt über (Nachschwingen beim Schlag, Wackeln
 * beim Treffer), 1 kommt ohne Überschwingen an. In kleinen Schritten gerechnet, damit es bei 30 fps stabil bleibt.
 */
export function springPose(s: PoseSpring, target: Pose, dt: number, freq: number, damping: number): void {
  const x = poseValues(s.pose);
  const goal = poseValues(target);
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let n = 0; n < steps; n++) {
    for (let i = 0; i < POSE_KEYS; i++) {
      const a = freq * freq * (goal[i] - x[i]) - 2 * damping * freq * s.vel[i];
      s.vel[i] += a * h;
      x[i] += s.vel[i] * h;
    }
  }
  setPose(s.pose, x);
}

/** Wie federnd ein Zustand ist: [freq, damping]. Schlag und Treffer schwingen nach, Ausholen kommt weich. */
export function springFor(state: Fighter['state']): [number, number] {
  switch (state) {
    case 'strike':
      return [48, 0.42];
    case 'hit':
      return [44, 0.32];
    case 'windup':
      return [20, 0.75];
    case 'down':
      return [13, 0.6];
    case 'dodge':
      return [32, 0.6];
    case 'run':
    case 'walk':
      return [26, 0.8];
    default:
      return [18, 0.62];
  }
}

/** Maße einer Figur in Metern (1,80 m groß, die Schläger breiter). */
const BODY = { thigh: 0.46, shin: 0.45, torso: 0.56, upper: 0.3, fore: 0.29, head: 0.125 };

function pt(x: number, y: number, angle: number, len: number): [number, number] {
  return [x + Math.sin(angle) * len, y + Math.cos(angle) * len];
}

/** Farben einer Figur aus ihrem Look (fertig für das Zeichnen). */
export interface Colors {
  skin: string;
  skinDark: string;
  hair: string;
  top: string;
  topDark: string;
  topLight: string;
  pants: string;
  pantsDark: string;
  shoes: string;
  sleeves: 'long' | 'short' | 'none';
}

export function colorsFor(look: Look, seed: number): Colors {
  const top = TOP[look.topColor] ?? TOP[0];
  const skin = SKIN[look.skin] ?? SKIN[1];
  const pants = PANTS[Math.abs(seed) % PANTS.length];
  return {
    skin,
    skinDark: mix(skin, '#2a1410', 0.38),
    hair: HAIR[look.hairColor] ?? HAIR[0],
    top,
    topDark: tint(top, 0.72),
    topLight: mix(top, '#fff6e6', 0.22),
    pants,
    pantsDark: mix(pants, '#050508', 0.5),
    shoes: seed % 3 === 0 ? '#e4e0d8' : '#141416',
    sleeves: look.top === 'tank' ? 'none' : look.top === 'tee' || look.top === 'openshirt' ? 'short' : 'long',
  };
}

export interface FigureOptions {
  /** Fußpunkt auf dem Bildschirm und Maßstab (Pixel pro Meter, mit Tiefe). */
  x: number;
  y: number;
  ppm: number;
  facing: 1 | -1;
  /** Getroffen: kurz weiß aufblitzen (0–1). */
  flash: number;
  /** Deckkraft (Ausweichen: halb durchsichtig). */
  opacity: number;
  knife: boolean;
  /** Breiter gebaut (Schläger). */
  bulk: number;
  /** Ring unter den Füßen (Seite). */
  ring: string | null;
  /** Licht auf der Figur (Laterne, Leuchtschild), null = flach. */
  light?: FigureLight | null;
  /** Atmen (−1 bis 1): Brust und Schultern heben sich. */
  breath?: number;
  /** Nur Umriss und Grundfarben (Spiegelung, Nachbild): spart die Licht-Schichten. */
  simple?: boolean;
}

/**
 * Licht auf einer Figur: Hauptlicht von oben (Laterne bzw. Himmel), leicht seitlich (keyX −1 links bis 1 rechts auf
 * dem Bildschirm), und ein farbiges Randlicht von der Seite (Leuchtschild), rimSide −1 links, 1 rechts.
 */
export interface FigureLight {
  keyX: number;
  keyColor: string;
  keyAmt: number;
  rimSide: -1 | 1;
  rimColor: string;
  rimAmt: number;
}

/** Licht in den Koordinaten der Figur (x gespiegelt, wenn sie nach links schaut). */
interface Shade {
  lx: number;
  ly: number;
  key: string;
  shadow: string;
  rimX: number;
  rim: string | null;
}

function shadeFor(light: FigureLight, facing: 1 | -1): Shade {
  const lx = light.keyX * facing * 0.6;
  const ly = -1;
  const n = Math.hypot(lx, ly);
  return {
    lx: lx / n,
    ly: ly / n,
    key: alpha(light.keyColor, 0.1 + 0.2 * light.keyAmt),
    shadow: 'rgba(6, 4, 10, 0.24)',
    rimX: light.rimSide * facing,
    rim: light.rimAmt > 0.04 ? alpha(light.rimColor, Math.min(0.85, light.rimAmt)) : null,
  };
}

/** Licht ohne Laterne (Tag, Spiegelung): von schräg oben vorn, Glanz und Schatten blass. */
const FLAT_SHADE: Shade = {
  lx: 0.32,
  ly: -0.95,
  key: 'rgba(255, 255, 255, 0.12)',
  shadow: 'rgba(6, 4, 10, 0.24)',
  rimX: 1,
  rim: null,
};

let shadowSprite: HTMLCanvasElement | null = null;

/** Weicher Kontaktschatten (radialer Verlauf, einmal gebacken, gestaucht gezeichnet). */
function contactShadow(): HTMLCanvasElement {
  if (shadowSprite) return shadowSprite;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
  g.addColorStop(0.45, 'rgba(0, 0, 0, 0.36)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  shadowSprite = canvas;
  return canvas;
}

/** Kapsel von a nach b mit Radius ra bzw. rb (Glied mit Verjüngung), als Pfad. */
function capsule(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number], ra: number, rb: number) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  ctx.beginPath();
  ctx.arc(a[0], a[1], ra, ang + Math.PI / 2, ang + (Math.PI * 3) / 2);
  ctx.arc(b[0], b[1], rb, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.closePath();
}

/** Dunkle Lasur über eine Form (hinterer Arm bzw. hinteres Bein im Schatten des Körpers). */
function dimOver(ctx: CanvasRenderingContext2D, path: () => void, dim: number): void {
  ctx.fillStyle = `rgba(4, 3, 8, ${1 - dim})`;
  ctx.beginPath();
  path();
  ctx.fill();
}

/**
 * Glied mit Volumen: Umriss, dann je Abschnitt Schattenfarbe, darüber die Grundfarbe etwas kleiner und zum Licht
 * versetzt (bleibt als Schattenkante auf der Gegenseite), Glanz zum Licht hin und Randlicht vom Leuchtschild. Alles
 * liegt innerhalb der Kapsel, ohne Clip. radii hat einen Wert je Punkt, colors [Grund, Schatten] je Abschnitt.
 */
function volumeLimb(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  radii: number[],
  colors: [string, string][],
  ol: number,
  sh: Shade | null,
  dim = 1,
): void {
  ctx.fillStyle = INK;
  for (let i = 1; i < pts.length; i++) {
    capsule(ctx, pts[i - 1], pts[i], radii[i - 1] + ol, radii[i] + ol);
    ctx.fill();
  }
  if (!sh) {
    // Einfach: nur die Grundfarbe.
    for (let i = 1; i < pts.length; i++) {
      ctx.fillStyle = (colors[i - 1] ?? colors[0])[0];
      capsule(ctx, pts[i - 1], pts[i], radii[i - 1], radii[i]);
      ctx.fill();
    }
    return;
  }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const ra = radii[i - 1];
    const rb = radii[i];
    const [base, dark] = colors[i - 1] ?? colors[0];
    ctx.fillStyle = dark;
    capsule(ctx, a, b, ra, rb);
    ctx.fill();
    const k = 0.24;
    ctx.fillStyle = base;
    capsule(
      ctx,
      [a[0] + sh.lx * ra * k, a[1] + sh.ly * ra * k],
      [b[0] + sh.lx * rb * k, b[1] + sh.ly * rb * k],
      ra * (1 - k),
      rb * (1 - k),
    );
    ctx.fill();
    // Glanz: breit und halb durchsichtig, damit er weich wirkt (kein Streifen wie an der Trainingshose).
    ctx.fillStyle = sh.key;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * 0.55;
    capsule(
      ctx,
      [a[0] + sh.lx * ra * 0.4, a[1] + sh.ly * ra * 0.4],
      [b[0] + sh.lx * rb * 0.4, b[1] + sh.ly * rb * 0.4],
      ra * 0.52,
      rb * 0.52,
    );
    ctx.fill();
    ctx.globalAlpha = ga;
    if (sh.rim) {
      ctx.fillStyle = sh.rim;
      capsule(ctx, [a[0] + sh.rimX * ra * 0.72, a[1]], [b[0] + sh.rimX * rb * 0.72, b[1]], ra * 0.24, rb * 0.24);
      ctx.fill();
    }
    if (dim < 1) dimOver(ctx, () => capsule(ctx, a, b, ra, rb), dim);
  }
}

/**
 * Rumpf mit Form: Hüfte, Taille, Brust, Schultern (vorn etwas mehr Brust), weich verbunden; Verlauf quer zum Körper
 * vom Licht (hell) zur Schattenseite (dunkel), dazu Randlicht. breath (−1 bis 1) hebt Brust und Schultern.
 */
function drawTorso(
  ctx: CanvasRenderingContext2D,
  hip: [number, number],
  neck: [number, number],
  width: number,
  breath: number,
  c: Colors,
  ol: number,
  sh: Shade,
  simple = false,
): void {
  const top: [number, number] = [neck[0], neck[1] + 0.03 - breath * 0.008];
  const dx = top[0] - hip[0];
  const dy = top[1] - hip[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Normale nach vorn (Blickrichtung +x).
  let nx = -uy;
  let ny = ux;
  if (nx < 0) {
    nx = -nx;
    ny = -ny;
  }
  const at = (k: number, side: number, half: number): [number, number] => [
    hip[0] + dx * k + nx * side * half,
    hip[1] + dy * k + ny * side * half,
  ];
  const chest = width * (0.56 + breath * 0.02);
  const pts = {
    hipB: at(0, -1, width * 0.44),
    hipF: at(0, 1, width * 0.44),
    waistB: at(0.38, -1, width * 0.4),
    waistF: at(0.38, 1, width * 0.42),
    chestB: at(0.72, -1, chest * 0.95),
    chestF: at(0.72, 1, chest),
    shB: at(1, -1, width * 0.5),
    shF: at(1, 1, width * 0.44),
  };
  const path = (grow: number) => {
    const g = (p: [number, number], side: number): [number, number] => [
      p[0] + nx * side * grow,
      p[1] + ny * side * grow,
    ];
    const hB = g(pts.hipB, -1);
    const hF = g(pts.hipF, 1);
    const wB = g(pts.waistB, -1);
    const wF = g(pts.waistF, 1);
    const cB = g(pts.chestB, -1);
    const cF = g(pts.chestF, 1);
    const sB = g(pts.shB, -1);
    const sF = g(pts.shF, 1);
    ctx.beginPath();
    ctx.moveTo(hB[0], hB[1] + grow);
    ctx.quadraticCurveTo(wB[0], wB[1], cB[0], cB[1]);
    ctx.quadraticCurveTo(
      sB[0] - ux * grow,
      sB[1] - uy * grow,
      (sB[0] + sF[0]) / 2 - ux * grow,
      (sB[1] + sF[1]) / 2 - uy * grow,
    );
    ctx.quadraticCurveTo(sF[0] - ux * grow, sF[1] - uy * grow, cF[0], cF[1]);
    ctx.quadraticCurveTo(wF[0], wF[1], hF[0], hF[1] + grow);
    ctx.quadraticCurveTo((hF[0] + hB[0]) / 2, (hF[1] + hB[1]) / 2 + width * 0.12 + grow, hB[0], hB[1] + grow);
    ctx.closePath();
  };
  ctx.fillStyle = INK;
  path(ol);
  ctx.fill();
  if (simple) {
    ctx.fillStyle = c.top;
    path(0);
    ctx.fill();
    return;
  }
  // Licht quer zum Körper: Seite zum Licht hell, Gegenseite dunkel.
  const side = nx * sh.lx + ny * sh.ly >= 0 ? 1 : -1;
  const mx = hip[0] + dx * 0.55;
  const my = hip[1] + dy * 0.55;
  const g = ctx.createLinearGradient(
    mx + nx * side * width * 0.6,
    my + ny * side * width * 0.6,
    mx - nx * side * width * 0.6,
    my - ny * side * width * 0.6,
  );
  g.addColorStop(0, c.topLight);
  g.addColorStop(0.35, c.top);
  g.addColorStop(0.8, c.topDark);
  g.addColorStop(1, mix(c.topDark, '#000000', 0.35));
  ctx.fillStyle = g;
  path(0);
  ctx.fill();
  // Glanz oben auf der Schulter zum Licht hin, Falte an der Taille.
  ctx.fillStyle = sh.key;
  ctx.beginPath();
  ctx.ellipse(
    top[0] + nx * side * width * 0.15 - ux * 0.02,
    top[1] + ny * side * width * 0.15 - uy * 0.02,
    width * 0.3,
    width * 0.12,
    Math.atan2(ny, nx),
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = ol;
  ctx.beginPath();
  const wf = at(0.38, side, width * 0.1);
  ctx.moveTo(wf[0], wf[1]);
  ctx.lineTo(wf[0] - nx * side * width * 0.3, wf[1] - ny * side * width * 0.3 + 0.01);
  ctx.stroke();
  if (sh.rim) {
    const r = sh.rimX > 0 ? 1 : -1;
    const a1 = at(0.15, r, width * 0.38);
    const a2 = at(0.72, r, chest * 0.9);
    const a3 = at(0.98, r, width * 0.42);
    ctx.strokeStyle = sh.rim;
    ctx.lineWidth = width * 0.09;
    ctx.beginPath();
    ctx.moveTo(a1[0], a1[1]);
    ctx.quadraticCurveTo(a2[0], a2[1], a3[0], a3[1]);
    ctx.stroke();
  }
}

/**
 * Figur zeichnen: Gliederpuppe mit Umriss. Reihenfolge hinterer Arm, hinteres Bein, Rumpf, vorderes Bein, Kopf,
 * vorderer Arm (der Schlagarm liegt vorn). Koordinaten in Metern, Blick nach rechts (gespiegelt bei facing −1).
 */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  look: Look,
  colors: Colors,
  o: FigureOptions,
): void {
  const s = o.ppm;
  const white = o.flash > 0;
  const c = white
    ? {
        ...colors,
        skin: '#ffffff',
        skinDark: '#e9e9e9',
        hair: '#ffffff',
        top: '#ffffff',
        topDark: '#f1f1f1',
        topLight: '#ffffff',
        pants: '#ffffff',
        pantsDark: '#e9e9e9',
        shoes: '#fff',
      }
    : colors;
  const outline = Math.max(1.2, s * 0.018);
  const shade = o.light && !white ? shadeFor(o.light, o.facing) : null;
  ctx.save();
  ctx.globalAlpha = o.opacity;
  // Weicher Schatten unter den Füßen (Verlauf, fertig gebacken), liegend breiter; Ring der Seite.
  const lying = Math.abs(Math.sin(pose.rot));
  const sw = s * (0.55 + lying * 0.7);
  ctx.drawImage(contactShadow(), o.x - sw + pose.shift * o.facing * s, o.y - s * 0.11, sw * 2, s * 0.22);
  if (o.ring) {
    ctx.strokeStyle = o.ring;
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, s * 0.36, s * 0.065, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Liegt er, dann auf dem Boden (nicht halb darin): um die halbe Körperdicke anheben.
  ctx.translate(o.x + pose.shift * o.facing * s, o.y - Math.abs(Math.sin(pose.rot)) * s * 0.13);
  ctx.rotate(pose.rot * o.facing);
  ctx.scale(o.facing * s, s);
  const w = 1 / s;
  const bulk = o.bulk;
  // Hüfte und Hals.
  const legLen = BODY.thigh + BODY.shin;
  const hip: [number, number] = [0, -legLen + pose.crouch];
  const neck: [number, number] = [hip[0] + Math.sin(pose.lean) * BODY.torso, hip[1] - Math.cos(pose.lean) * BODY.torso];
  const shoulder = (back: boolean): [number, number] => [
    neck[0] - Math.cos(pose.lean) * (back ? 0.05 : -0.03),
    neck[1] + 0.06,
  ];
  const arm = (a: [number, number], back: boolean) => {
    const sh = shoulder(back);
    const el = pt(sh[0], sh[1], a[0], BODY.upper);
    const hand = pt(el[0], el[1], a[0] + a[1], BODY.fore);
    return [sh, el, hand] as [number, number][];
  };
  const leg = (a: [number, number]) => {
    const knee = pt(hip[0], hip[1], a[0], BODY.thigh);
    const foot = pt(knee[0], knee[1], a[0] + a[1], BODY.shin);
    return [hip, knee, foot] as [number, number][];
  };
  const ol = outline * w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Licht in Figurkoordinaten: ohne Laterne von schräg oben vorn (flach, aber mit Rundung).
  const vol: Shade = shade ?? FLAT_SHADE;
  const lit: Shade | null = o.simple ? null : vol;
  const puffy = look.top === 'puffer' ? 1.18 : 1;
  const drawArm = (pts: [number, number][], back: boolean) => {
    const sleeve = c.sleeves === 'long';
    const upper = c.sleeves === 'none' ? [c.skin, c.skinDark] : [c.top, c.topDark];
    const fore = sleeve ? [c.top, c.topDark] : [c.skin, c.skinDark];
    // Hinterer Arm etwas dunkler (liegt im Schatten des Körpers).
    const dim = back ? 0.82 : 1;
    volumeLimb(
      ctx,
      pts,
      [0.066 * bulk * (sleeve ? puffy : 1), 0.05 * bulk, 0.042 * bulk],
      [upper as [string, string], fore as [string, string]],
      ol,
      lit,
      dim,
    );
    // Faust: Kugel mit Glanz, Knöchel zur Schlagrichtung.
    const [hx, hy] = pts[2];
    const fr = 0.058 * bulk;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(hx, hy, fr + ol, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.skinDark;
    ctx.beginPath();
    ctx.arc(hx, hy, fr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.arc(hx + vol.lx * fr * 0.22, hy + vol.ly * fr * 0.22, fr * 0.76, 0, Math.PI * 2);
    ctx.fill();
    if (dim < 1) dimOver(ctx, () => ctx.arc(hx, hy, fr, 0, Math.PI * 2), dim);
  };
  const drawLeg = (pts: [number, number][], back: boolean) => {
    volumeLimb(
      ctx,
      pts,
      [0.09 * bulk, 0.062 * bulk, 0.045 * bulk],
      [
        [c.pants, c.pantsDark],
        [c.pants, c.pantsDark],
      ],
      ol,
      lit,
      back ? 0.82 : 1,
    );
    // Schuh nach vorn: Sohle hell, Kappe rund.
    const [fx, fy] = pts[2];
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(fx + 0.06, fy - 0.005, 0.12 + ol, 0.05 + ol, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.shoes;
    ctx.beginPath();
    ctx.ellipse(fx + 0.06, fy - 0.005, 0.12, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.beginPath();
    ctx.ellipse(fx + 0.09, fy - 0.025, 0.06, 0.015, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const backArm = arm(pose.ba, true);
  const frontArm = arm(pose.fa, false);
  drawArm(backArm, true);
  drawLeg(leg(pose.bl), true);
  // Rumpf: Körper mit Schultern, Brust und Taille (Daunenjacke dicker), Verlauf vom Licht zur Schattenseite; atmet.
  const torsoW = (look.top === 'puffer' ? 0.33 : 0.27) * bulk;
  drawTorso(ctx, hip, neck, torsoW, o.breath ?? 0, c, ol, vol, o.simple === true);
  if (!white) torsoDetail(ctx, look, c, hip, neck, torsoW);
  drawLeg(leg(pose.fl), false);
  drawHead(ctx, look, c, neck, pose.lean, pose.head, ol, white, shade);
  drawArm(frontArm, false);
  if (o.knife) {
    const [hx, hy] = frontArm[2];
    const ang = pose.fa[0] + pose.fa[1];
    const [tx, ty] = pt(hx, hy, ang - 0.5, 0.26);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.strokeStyle = white ? '#ffffff' : METAL;
    ctx.lineWidth = 0.028;
    ctx.stroke();
  }
  ctx.restore();
}

/** Details am Oberteil: Streifen der Trainingsjacke, Kette, Kragen des Anzugs, Kapuze. */
function torsoDetail(
  ctx: CanvasRenderingContext2D,
  look: Look,
  c: Colors,
  hip: [number, number],
  neck: [number, number],
  width: number,
): void {
  if (look.top === 'tracksuit') {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(hip[0] + width * 0.2, hip[1]);
    ctx.lineTo(neck[0] + width * 0.2, neck[1] + 0.06);
    ctx.stroke();
  }
  if (look.top === 'suit' || look.top === 'openshirt') {
    ctx.fillStyle = look.top === 'suit' ? '#e4e0d8' : c.skin;
    ctx.beginPath();
    ctx.moveTo(neck[0] + 0.02, neck[1] + 0.04);
    ctx.lineTo(neck[0] + width * 0.45, neck[1] + 0.06);
    ctx.lineTo(neck[0] + 0.05, neck[1] + 0.22);
    ctx.closePath();
    ctx.fill();
  }
  if (look.chain !== 'none') {
    ctx.strokeStyle = '#e0b24a';
    ctx.lineWidth = look.chain === 'thick' ? 0.03 : 0.016;
    ctx.beginPath();
    ctx.arc(neck[0] + 0.04, neck[1] + 0.06, 0.09, 0.2, Math.PI * 0.75);
    ctx.stroke();
  }
  if (look.top === 'hoodie' && look.hat !== 'hood') {
    ctx.fillStyle = c.topDark;
    ctx.beginPath();
    ctx.ellipse(neck[0] - 0.09, neck[1] + 0.02, 0.08, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Kopf im Profil: Haut, Haare nach Frisur, Kopfbedeckung, Bart, Auge, Brille, Ohrring, Maske. */
function drawHead(
  ctx: CanvasRenderingContext2D,
  look: Look,
  c: Colors,
  neck: [number, number],
  lean: number,
  tilt: number,
  ol: number,
  white: boolean,
  shade: Shade | null,
): void {
  const r = BODY.head;
  const hx = neck[0] + 0.02 + Math.sin(lean) * 0.05;
  const hy = neck[1] - r * 0.95;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(lean * 0.4 + tilt * 0.6);
  // Hals.
  ctx.fillStyle = c.skin;
  ctx.fillRect(-0.04, r * 0.5, 0.08, r * 0.7);
  // Haare hinten (lang, Zopf, Dutt, Dreads, Afro) unter dem Kopf.
  ctx.fillStyle = c.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ol;
  const hair = look.hat === 'balaclava' || look.hat === 'hood' ? 'none' : look.hair;
  if (hair === 'afro' || hair === 'curly') {
    ctx.beginPath();
    ctx.arc(-0.02, -0.03, r * (hair === 'afro' ? 1.38 : 1.18), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'long' || hair === 'braids' || hair === 'mullet') {
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.05, -r * 0.6, r * 0.95, r * (hair === 'mullet' ? 1.7 : 2.3), r * 0.4);
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'dreads') {
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = c.hair;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.5 - i * 0.02, -r * 0.4);
      ctx.lineTo(-r * 0.9 - i * 0.03, r * (1.3 + i * 0.15));
      ctx.stroke();
    }
  } else if (hair === 'ponytail' || hair === 'tight') {
    ctx.beginPath();
    ctx.ellipse(-r * 1.15, -r * 0.1, r * 0.35, r * 0.22, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (hair === 'bun') {
    ctx.beginPath();
    ctx.arc(-r * 0.75, -r * 0.85, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Kopf.
  ctx.fillStyle = c.skin;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Nase und Kinn nach vorn.
  ctx.beginPath();
  ctx.moveTo(r * 0.92, -r * 0.15);
  ctx.lineTo(r * 1.18, r * 0.12);
  ctx.lineTo(r * 0.9, r * 0.22);
  ctx.closePath();
  ctx.fill();
  if (!white) {
    // Bart.
    if (look.beard !== 'none') {
      ctx.fillStyle = look.beard === 'stubble' ? 'rgba(20, 14, 12, 0.35)' : c.hair;
      ctx.beginPath();
      if (look.beard === 'moustache') ctx.ellipse(r * 0.85, r * 0.3, r * 0.22, r * 0.07, 0.2, 0, Math.PI * 2);
      else ctx.arc(r * 0.2, r * 0.15, r * 0.88, -0.1, Math.PI * 0.75);
      ctx.fill();
    }
    // Auge und Braue.
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(r * 0.58, -r * 0.12, r * (look.eyes === 'narrow' ? 0.07 : 0.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = look.brows === 'heavy' ? 0.03 : 0.018;
    ctx.beginPath();
    ctx.moveTo(r * 0.35, look.brows === 'hard' ? -r * 0.42 : -r * 0.38);
    ctx.lineTo(r * 0.85, look.brows === 'hard' ? -r * 0.3 : -r * 0.38);
    ctx.stroke();
    if (look.glasses !== 'none') {
      ctx.fillStyle = look.glasses === 'sun' ? INK : 'rgba(255, 255, 255, 0.15)';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.015;
      ctx.beginPath();
      roundRectPath(ctx, r * 0.4, -r * 0.3, r * 0.5, r * 0.3, r * 0.08);
      ctx.fill();
      ctx.stroke();
    }
    if (look.earring !== 'none') {
      ctx.fillStyle = '#e0b24a';
      ctx.beginPath();
      ctx.arc(-r * 0.05, r * 0.35, look.earring === 'stud' ? 0.015 : 0.025, 0, Math.PI * 2);
      ctx.fill();
    }
    if (look.mask !== 'none') {
      ctx.fillStyle = look.mask === 'ffp' ? '#e4e0d8' : c.topDark;
      ctx.beginPath();
      ctx.moveTo(r * 1.15, r * 0.05);
      ctx.lineTo(r * 0.95, r * 0.75);
      ctx.lineTo(-r * 0.2, r * 0.7);
      ctx.lineTo(-r * 0.1, r * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    if (look.mouthItem === 'cigarette' || look.mouthItem === 'joint') {
      ctx.strokeStyle = '#ece6dc';
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      ctx.moveTo(r * 0.95, r * 0.4);
      ctx.lineTo(r * 1.35, r * 0.48);
      ctx.stroke();
      ctx.fillStyle = '#ff7b45';
      ctx.fillRect(r * 1.33, r * 0.44, 0.02, 0.02);
    }
  }
  // Haare oben bzw. Kopfbedeckung.
  ctx.fillStyle = c.hair;
  ctx.strokeStyle = INK;
  ctx.lineWidth = ol;
  if (look.hat === 'balaclava') {
    ctx.fillStyle = white ? '#fff' : '#17171b';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.skin;
    ctx.fillRect(r * 0.3, -r * 0.3, r * 0.75, r * 0.3);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(r * 0.6, -r * 0.15, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  } else if (look.hat === 'hood') {
    ctx.fillStyle = c.top;
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.05, r * 1.2, Math.PI * 0.35, Math.PI * 2.05);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (look.hat !== 'none') {
    drawHat(ctx, look, c, r, white);
  } else if (hair !== 'bald' && hair !== 'none') {
    // Haarkappe: kurz, Fade, Seitenscheitel, Cornrows …
    const thick = hair === 'buzz' || hair === 'fade' || hair === 'cornrows' ? 0.2 : 0.38;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.02, Math.PI * 0.95, Math.PI * 1.95);
    ctx.lineTo(r * 0.8, -r * (0.6 - thick));
    ctx.quadraticCurveTo(0, -r * (0.75 - thick), -r * 0.95, r * (hair === 'fade' ? -0.05 : 0.25));
    ctx.closePath();
    ctx.fill();
    if (hair === 'undercut' || hair === 'slick' || hair === 'side') {
      ctx.beginPath();
      ctx.ellipse(r * 0.45, -r * 0.85, r * 0.55, r * 0.25, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hair === 'cornrows' && !white) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 0.01;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * (0.75 + i * 0.1), Math.PI * 1.1, Math.PI * 1.8);
        ctx.stroke();
      }
    }
  }
  if (shade) shadeHead(ctx, r, shade);
  ctx.restore();
}

/** Licht auf dem Kopf: Verlauf vom Licht weg (Schatten), Glanz oben, Randlicht als Sichel von der Seite. */
function shadeHead(ctx: CanvasRenderingContext2D, r: number, sh: Shade): void {
  const g = ctx.createLinearGradient(sh.lx * r, sh.ly * r, -sh.lx * r, -sh.ly * r);
  g.addColorStop(0, sh.key);
  g.addColorStop(0.45, 'rgba(0, 0, 0, 0)');
  g.addColorStop(1, sh.shadow);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  if (sh.rim) {
    const mid = sh.rimX > 0 ? 0 : Math.PI;
    ctx.strokeStyle = sh.rim;
    ctx.lineWidth = r * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.94, mid - 0.9, mid + 0.9);
    ctx.stroke();
  }
}

function drawHat(ctx: CanvasRenderingContext2D, look: Look, c: Colors, r: number, white: boolean): void {
  const hatColor = white ? '#ffffff' : look.hat === 'bandana' || look.hat === 'durag' ? c.topDark : c.top;
  ctx.fillStyle = hatColor;
  ctx.strokeStyle = INK;
  // Kuppel.
  ctx.beginPath();
  ctx.arc(0, -r * 0.05, r * 1.05, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  switch (look.hat) {
    case 'cap':
    case 'skipper':
      ctx.beginPath();
      ctx.ellipse(r * 1.1, -r * 0.1, r * 0.55, r * 0.1, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'backcap':
      ctx.beginPath();
      ctx.ellipse(-r * 1.1, -r * 0.1, r * 0.5, r * 0.1, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'beanie':
      ctx.fillStyle = white ? '#fff' : c.topDark;
      ctx.fillRect(-r * 1.05, -r * 0.3, r * 2.1, r * 0.25);
      break;
    case 'bucket':
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.05, r * 1.5, r * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case 'durag':
    case 'bandana':
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.2);
      ctx.lineTo(-r * 1.5, r * 0.35);
      ctx.lineTo(-r * 1.2, r * 0.45);
      ctx.closePath();
      ctx.fill();
      break;
    default:
      break;
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------
// Zeichen über den Köpfen und Effekte

/** Ansage über dem Kopf: ! (leicht), !! (schwer), Messer (rot blinkend), ? (zögert), Beute mit Fortschritt. */
export function drawBadge(
  ctx: CanvasRenderingContext2D,
  kind: 'light' | 'heavy' | 'knife' | 'hesitate' | 'grab' | 'counter',
  x: number,
  y: number,
  size: number,
  p: BrawlPalette,
  t: number,
  progress = 0,
): void {
  const blink = kind === 'knife' ? 0.55 + 0.45 * Math.abs(Math.sin(t * 14)) : 1;
  const color =
    kind === 'knife'
      ? p.danger
      : kind === 'hesitate'
        ? p.people
        : kind === 'grab'
          ? p.goods
          : kind === 'counter'
            ? p.gold
            : p.warn;
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.fillStyle = alpha(INK, 0.75);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  ctx.beginPath();
  ctx.arc(x, y, size * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (kind === 'grab' && progress > 0) {
    ctx.lineWidth = Math.max(3, size * 0.14);
    ctx.beginPath();
    ctx.arc(x, y, size * 0.72, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(size * 0.72)}px "Barlow Condensed", "Barlow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kind === 'knife') {
    // Klinge.
    ctx.beginPath();
    ctx.moveTo(x - size * 0.28, y + size * 0.22);
    ctx.lineTo(x + size * 0.26, y - size * 0.3);
    ctx.lineTo(x + size * 0.1, y + size * 0.02);
    ctx.closePath();
    ctx.fill();
  } else {
    const text =
      kind === 'heavy' ? '!!' : kind === 'hesitate' ? '?' : kind === 'grab' ? '€' : kind === 'counter' ? '×2' : '!';
    ctx.fillText(text, x, y + size * 0.04);
  }
  ctx.restore();
}

/** Funken beim Treffer (Optik, aus Math.random in der Oberfläche). */
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}

/** Druckwelle eines Treffers: Ring, der sich flach am Ort des Treffers ausbreitet. */
export interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
}

export function drawRings(ctx: CanvasRenderingContext2D, rings: readonly Ring[]): void {
  for (const ring of rings) {
    const a = Math.max(0, ring.life / ring.max);
    ctx.strokeStyle = alpha(ring.color, a * 0.85);
    ctx.lineWidth = 1 + 5 * a;
    ctx.beginPath();
    ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Schwebende Zahl bzw. Wort (Schaden, „Konter“, „Block“). */
export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  size: number;
}

export function drawSparks(ctx: CanvasRenderingContext2D, sparks: readonly Spark[]): void {
  ctx.lineCap = 'round';
  for (const s of sparks) {
    const a = Math.max(0, s.life / s.max);
    ctx.strokeStyle = alpha(s.color, a);
    ctx.lineWidth = 2.5 * a + 0.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
    ctx.stroke();
  }
}

export function drawFloaters(ctx: CanvasRenderingContext2D, floaters: readonly Floater[]): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floaters) {
    const a = Math.min(1, f.life / 0.35);
    const pop = 1 + Math.max(0, f.life - 0.75) * 1.4;
    ctx.font = `800 ${Math.round(f.size * pop)}px "Barlow Condensed", "Barlow", sans-serif`;
    ctx.lineWidth = Math.max(3, f.size * 0.16);
    ctx.strokeStyle = alpha(INK, 0.85 * a);
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = alpha(f.color, a);
    ctx.fillText(f.text, f.x, f.y);
  }
}

/** Regen und Schnee: Teilchen in Bildschirmkoordinaten (Optik). */
export interface Drop {
  x: number;
  y: number;
  v: number;
  len: number;
}

export function drawWeather(
  ctx: CanvasRenderingContext2D,
  weather: string,
  drops: readonly Drop[],
  p: BrawlPalette,
  wind: number,
): void {
  if (drops.length === 0) return;
  if (weather === 'snow') {
    ctx.fillStyle = alpha(p.ink, 0.7);
    for (const d of drops) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.len, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  ctx.strokeStyle = alpha(p.ink, 0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of drops) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - wind * d.len, d.y - d.len);
  }
  ctx.stroke();
}

/** Beute am rechten Rand: Sporttasche (Ware) bzw. Geldkassette (Kasse). */
export function drawLoot(
  ctx: CanvasRenderingContext2D,
  stake: string,
  x: number,
  y: number,
  ppm: number,
  p: BrawlPalette,
  gone: boolean,
): void {
  if (gone) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, 0, ppm * 0.42, ppm * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1.5, ppm * 0.03);
  if (stake === 'cash') {
    ctx.fillStyle = '#3c3f45';
    roundRect(ctx, -ppm * 0.3, -ppm * 0.32, ppm * 0.6, ppm * 0.32, ppm * 0.04);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.money;
    ctx.fillRect(-ppm * 0.18, -ppm * 0.4, ppm * 0.36, ppm * 0.08);
  } else {
    ctx.fillStyle = '#1b1b20';
    roundRect(ctx, -ppm * 0.38, -ppm * 0.36, ppm * 0.76, ppm * 0.36, ppm * 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = p.goods;
    ctx.beginPath();
    ctx.arc(0, -ppm * 0.36, ppm * 0.16, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = alpha(p.ink, 0.6);
    ctx.fillRect(-ppm * 0.28, -ppm * 0.2, ppm * 0.56, ppm * 0.03);
  }
  ctx.restore();
}

export const BADGE_FOR: Partial<Record<AttackId, 'light' | 'heavy' | 'knife'>> = {
  light: 'light',
  heavy: 'heavy',
  knife: 'knife',
};
