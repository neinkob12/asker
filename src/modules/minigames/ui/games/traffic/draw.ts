// Verkehrskontrolle (Auftrag 44, Teil 4): Zeichnen der Szene vom Fahrersitz. Hinten (back): Straße durch Seitenfenster
// und Frontscheibe, Innenraum, Armaturen, Lenkrad, Rückspiegel mit Laderaum und Blaulicht. Vorne (front): Regen auf
// den Scheiben, Taschenlampe, Blendung, Blaulicht im Innenraum, Rot am Ende. Der Beamte selbst ist DOM (Face) zwischen
// beiden Ebenen, auf das Seitenfenster zugeschnitten.
//
// Farben der Bedeutung kommen aus den Tokens (mapToken). Himmel, Häuser und Innenraum sind Inhalt wie Haut- und
// Haarfarben in Face.tsx: feste, gedeckte Werte hier. Statische Teile werden einmal pro Größe vorgerendert.

import { createRng } from '../../../../../core';
import { mapToken } from '../../../../../map';

export interface TrafficPalette {
  gold: string;
  danger: string;
  money: string;
  blue: string;
  ink: string;
}

export function readPalette(): TrafficPalette {
  return {
    gold: mapToken('--hud-gold', '#f2c766'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    money: mapToken('--cat-money', '#30d158'),
    blue: mapToken('--color-police-blue', '#2f7bff'),
    ink: mapToken('--hud-ink', '#ffffff'),
  };
}

export type Point = [number, number];

export interface TrafficLayout {
  width: number;
  height: number;
  narrow: boolean;
  /** Seitenfenster (links, dort steht der Beamte), Frontscheibe, A-Säule dazwischen. */
  side: Point[];
  wind: Point[];
  pillar: Point[];
  /** Unterkante der Fenster (Brüstung) und Beginn des Armaturenbretts. */
  belt: number;
  dashTop: number;
  horizon: number;
  mirror: { x: number; y: number; w: number; h: number };
  wheel: { x: number; y: number; r: number };
  /** Kasten für das Porträt des Beamten (CSS-Pixel). */
  officer: { x: number; y: number; size: number };
  /** Kopf der Taschenlampe (in der Hand des Beamten). */
  lamp: Point;
}

/** Oben bleibt Platz für das HUD; am Handy (schmal) steht die Szene oben, das Gespräch darunter. */
export function trafficLayout(width: number, height: number): TrafficLayout {
  const narrow = width < 640;
  const top = narrow ? 58 : 64;
  if (narrow) {
    const belt = top + Math.min(height * 0.36, width * 0.8);
    const sideR = width * 0.66;
    const side: Point[] = [
      [0, top + 6],
      [sideR - 18, top + 6],
      [sideR, belt],
      [0, belt],
    ];
    const wind: Point[] = [
      [sideR + 22, top + 4],
      [width, top + 2],
      [width, belt - 6],
      [sideR + 40, belt - 6],
    ];
    const pillar: Point[] = [
      [sideR - 18, top + 6],
      [sideR + 22, top + 4],
      [sideR + 40, belt - 6],
      [sideR, belt],
    ];
    const size = Math.min(sideR * 0.86, belt - top - 6);
    return {
      width,
      height,
      narrow,
      side,
      wind,
      pillar,
      belt,
      dashTop: belt + 4,
      horizon: top + (belt - top) * 0.62,
      mirror: { x: sideR + 30, y: top + 10, w: width - sideR - 38, h: 34 },
      wheel: { x: width * 0.3, y: height + width * 0.15, r: width * 0.62 },
      officer: { x: sideR * 0.5 - size * 0.5 + 6, y: belt - size + size * 0.04, size },
      lamp: [sideR * 0.86, belt - 6],
    };
  }
  const belt = top + (height - top) * 0.6;
  const sideR = width * 0.38;
  const side: Point[] = [
    [0, top + 10],
    [sideR - 36, top + 10],
    [sideR, belt],
    [0, belt],
  ];
  const wind: Point[] = [
    [sideR + 10, top + 4],
    [width, top],
    [width, belt - 8],
    [sideR + 62, belt - 8],
  ];
  const pillar: Point[] = [
    [sideR - 36, top + 10],
    [sideR + 10, top + 4],
    [sideR + 62, belt - 8],
    [sideR, belt],
  ];
  const size = Math.min(sideR * 0.9, (belt - top) * 0.98);
  const mirrorW = Math.min(300, width * 0.24);
  return {
    width,
    height,
    narrow,
    side,
    wind,
    pillar,
    belt,
    dashTop: belt + 6,
    horizon: top + (belt - top) * 0.6,
    mirror: { x: sideR + (width - sideR) * 0.5 - mirrorW / 2, y: top + 14, w: mirrorW, h: 58 },
    wheel: { x: width * 0.6, y: height + height * 0.12, r: height * 0.5 },
    officer: { x: sideR * 0.5 - size * 0.5, y: belt - size + size * 0.02, size },
    lamp: [sideR * 0.84, belt - 8],
  };
}

/** Szene außen nach Tageszeit (Nacht, Dämmerung, Tag). */
export type Light = 'night' | 'dusk' | 'day';

export function lightOf(phase: unknown): Light {
  return phase === 'night' ? 'night' : phase === 'dawn' || phase === 'dusk' ? 'dusk' : 'day';
}

const SKY: Record<Light, [string, string]> = {
  night: ['#05070d', '#1a1d2a'],
  dusk: ['#1d2238', '#7a5a58'],
  day: ['#8ea4b8', '#c9d1d6'],
};
const FACADE: Record<Light, string[]> = {
  night: ['#0d0f15', '#11141b', '#0b0c11'],
  dusk: ['#2b2a33', '#33313a', '#26252d'],
  day: ['#9b9389', '#a8a198', '#8c857d', '#b3aa9c'],
};
const ROAD: Record<Light, string> = { night: '#0c0d11', dusk: '#2c2b30', day: '#5d5f62' };
const WINDOW_LIT = '#e8b85c';
const LAMP_GLOW = 'rgba(255, 196, 110, ';
const INTERIOR = '#0b0c0f';
const INTERIOR_2 = '#16181d';
const DASH = '#111216';
const DASH_EDGE = '#24262d';
const BOX = '#6b5238';
const BOX_DARK = '#3d2e20';

/** Vieleck als Pfad; begin = false hängt es an den offenen Pfad an (für Zuschnitte aus mehreren Flächen). */
function poly(ctx: CanvasRenderingContext2D, points: Point[], begin = true): void {
  if (begin) ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function bounds(points: Point[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function makeCanvas(width: number, height: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(width * dpr));
  c.height = Math.max(1, Math.round(height * dpr));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Kein 2D-Kontext');
  ctx.scale(dpr, dpr);
  return [c, ctx];
}

/** Straße draußen: Himmel, Häuserzeile mit Fenstern, Laternen, Fahrbahn (nass bei Regen). */
function drawOutside(
  ctx: CanvasRenderingContext2D,
  area: Point[],
  horizon: number,
  light: Light,
  wet: boolean,
  rnd: () => number,
  street: boolean,
): void {
  const b = bounds(area);
  ctx.save();
  poly(ctx, area);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, b.y0, 0, horizon);
  sky.addColorStop(0, SKY[light][0]);
  sky.addColorStop(1, SKY[light][1]);
  ctx.fillStyle = sky;
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, horizon - b.y0 + 1);
  // Häuser: Fassaden unterschiedlicher Höhe, Fenster (nachts teils erleuchtet).
  let x = b.x0 - rnd() * 40;
  while (x < b.x1) {
    const w = 60 + rnd() * 90;
    const h = (horizon - b.y0) * (0.55 + rnd() * 0.5);
    const facade = FACADE[light][Math.floor(rnd() * FACADE[light].length)];
    ctx.fillStyle = facade;
    ctx.fillRect(x, horizon - h, w, h + 2);
    const cols = Math.max(2, Math.floor(w / 22));
    const rows = Math.max(2, Math.floor(h / 26));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + 8 + (c * (w - 16)) / cols;
        const wy = horizon - h + 10 + r * 26;
        if (wy > horizon - 14) continue;
        const lit = light !== 'day' && rnd() < (light === 'night' ? 0.32 : 0.2);
        ctx.fillStyle = lit ? WINDOW_LIT : light === 'day' ? 'rgba(40, 48, 60, 0.55)' : 'rgba(0, 0, 0, 0.35)';
        ctx.globalAlpha = lit ? 0.55 + rnd() * 0.4 : 1;
        ctx.fillRect(wx, wy, Math.max(6, (w - 16) / cols - 7), 14);
        ctx.globalAlpha = 1;
      }
    }
    x += w + 2 + rnd() * 6;
  }
  // Gehweg und Fahrbahn.
  const road = ctx.createLinearGradient(0, horizon, 0, b.y1);
  road.addColorStop(0, ROAD[light]);
  road.addColorStop(1, light === 'day' ? '#3f4144' : '#050506');
  ctx.fillStyle = road;
  ctx.fillRect(b.x0, horizon, b.x1 - b.x0, b.y1 - horizon);
  if (street) {
    // Mittellinie zur Ferne hin (Frontscheibe).
    const cx = (b.x0 + b.x1) / 2 + (b.x1 - b.x0) * 0.08;
    ctx.fillStyle = light === 'day' ? 'rgba(235, 235, 225, 0.7)' : 'rgba(235, 220, 180, 0.35)';
    for (let i = 0; i < 6; i++) {
      const t0 = i / 6;
      const t1 = t0 + 0.07;
      const y0 = horizon + (b.y1 - horizon) * t0 ** 1.6;
      const y1 = horizon + (b.y1 - horizon) * t1 ** 1.6;
      const w0 = 1 + 7 * t0;
      const w1 = 1 + 7 * t1;
      ctx.beginPath();
      ctx.moveTo(cx - w0 / 2, y0);
      ctx.lineTo(cx + w0 / 2, y0);
      ctx.lineTo(cx + w1 / 2 + (t1 - t0) * 6, y1);
      ctx.lineTo(cx - w1 / 2 + (t1 - t0) * 6, y1);
      ctx.fill();
    }
    // Geparkte Autos am Rand (Silhouetten).
    ctx.fillStyle = light === 'day' ? '#3b3e44' : '#06070a';
    for (let i = 0; i < 3; i++) {
      const px = b.x0 + 20 + i * 70 + rnd() * 20;
      const pw = 46 - i * 6;
      const py = horizon + 4 + i * 6;
      ctx.beginPath();
      ctx.roundRect(px, py - 10 + i * 2, pw, 12 - i, 3);
      ctx.fill();
    }
  } else {
    // Bordstein am Seitenfenster.
    ctx.fillStyle = light === 'day' ? 'rgba(200, 200, 195, 0.35)' : 'rgba(120, 120, 130, 0.18)';
    ctx.fillRect(b.x0, horizon + (b.y1 - horizon) * 0.35, b.x1 - b.x0, 3);
  }
  // Laternen: Pfahl und warmer Lichtschein (nicht bei Tag).
  if (light !== 'day') {
    for (let i = 0; i < 2; i++) {
      const lx = b.x0 + (b.x1 - b.x0) * (0.2 + 0.55 * i + rnd() * 0.1);
      const ly = b.y0 + (horizon - b.y0) * (0.25 + rnd() * 0.15);
      ctx.fillStyle = '#050608';
      ctx.fillRect(lx - 1.5, ly, 3, horizon - ly + 10);
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 120);
      glow.addColorStop(0, `${LAMP_GLOW}0.55)`);
      glow.addColorStop(0.15, `${LAMP_GLOW}0.18)`);
      glow.addColorStop(1, `${LAMP_GLOW}0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(lx - 120, ly - 120, 240, 240);
      ctx.fillStyle = '#ffe2a8';
      ctx.beginPath();
      ctx.ellipse(lx, ly, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      // Nasse Straße: Spiegelung des Lichts.
      if (wet) {
        const ry = horizon + (b.y1 - horizon) * 0.5;
        const refl = ctx.createLinearGradient(0, horizon, 0, b.y1);
        refl.addColorStop(0, `${LAMP_GLOW}0.3)`);
        refl.addColorStop(1, `${LAMP_GLOW}0)`);
        ctx.fillStyle = refl;
        ctx.fillRect(lx - 6, horizon, 12, (ry - horizon) * 2);
      }
    }
  }
  // Leichter Dunst über allem (Glas).
  ctx.fillStyle = light === 'day' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(30, 40, 60, 0.12)';
  ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  ctx.restore();
}

/** Innenraum: Himmel, Türverkleidung, A-Säule, Armaturenbrett mit Tacho, Lenkrad. */
function drawInterior(ctx: CanvasRenderingContext2D, l: TrafficLayout, p: TrafficPalette, light: Light): void {
  const { width, height } = l;
  // Alles außer den Fenstern: Innenraum.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  poly(ctx, l.side, false);
  poly(ctx, l.wind, false);
  ctx.clip('evenodd');
  const inside = ctx.createLinearGradient(0, 0, 0, height);
  inside.addColorStop(0, INTERIOR_2);
  inside.addColorStop(0.5, INTERIOR);
  inside.addColorStop(1, '#060608');
  ctx.fillStyle = inside;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  // A-Säule mit Kante.
  poly(ctx, l.pillar);
  ctx.fillStyle = '#08090b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Dichtungen um die Fenster.
  for (const area of [l.side, l.wind]) {
    poly(ctx, area);
    ctx.strokeStyle = '#020203';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Türverkleidung unter dem Seitenfenster mit Griff.
  const sideB = bounds(l.side);
  ctx.fillStyle = '#0e0f13';
  ctx.fillRect(0, l.belt + 2, sideB.x1 - 10, height - l.belt);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(0, l.belt + 2, sideB.x1 - 10, 3);
  ctx.fillStyle = '#1b1c22';
  ctx.beginPath();
  ctx.roundRect(sideB.x1 * 0.18, l.belt + (l.narrow ? 22 : 40), sideB.x1 * 0.32, 10, 5);
  ctx.fill();
  // Armaturenbrett: geschwungene Kante, Lüftung, Kombiinstrument.
  const dashY = l.dashTop;
  const dash = ctx.createLinearGradient(0, dashY, 0, height);
  dash.addColorStop(0, DASH_EDGE);
  dash.addColorStop(0.08, DASH);
  dash.addColorStop(1, '#050506');
  ctx.fillStyle = dash;
  ctx.beginPath();
  ctx.moveTo(sideB.x1 - 30, height);
  ctx.lineTo(sideB.x1 - 30, dashY + 14);
  ctx.quadraticCurveTo(sideB.x1, dashY - 6, sideB.x1 + 60, dashY - 4);
  ctx.lineTo(width, dashY - 10);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sideB.x1 - 30, dashY + 14);
  ctx.quadraticCurveTo(sideB.x1, dashY - 6, sideB.x1 + 60, dashY - 4);
  ctx.lineTo(width, dashY - 10);
  ctx.stroke();
  // Kombiinstrument hinter dem Lenkrad: zwei Rundinstrumente mit warmem Licht.
  const w = l.wheel;
  const gaugeY = Math.min(height - 30, dashY + (l.narrow ? 48 : 70));
  for (const dx of [-0.32, 0.32]) {
    const gx = w.x + w.r * dx;
    const gr = l.narrow ? 22 : 34;
    const g = ctx.createRadialGradient(gx, gaugeY, 0, gx, gaugeY, gr);
    g.addColorStop(0, 'rgba(242, 199, 102, 0.22)');
    g.addColorStop(1, 'rgba(242, 199, 102, 0.03)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gaugeY, gr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.gold;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(gx, gaugeY, gr - 3, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();
    // Nadel (Motor läuft im Leerlauf).
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = p.danger;
    ctx.beginPath();
    ctx.moveTo(gx, gaugeY);
    const a = dx < 0 ? Math.PI * 0.95 : Math.PI * 1.15;
    ctx.lineTo(gx + Math.cos(a) * (gr - 7), gaugeY + Math.sin(a) * (gr - 7));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Lenkrad: dicker Kranz (nur oben sichtbar) mit Speichen.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#030304';
  ctx.lineWidth = l.narrow ? 26 : 34;
  ctx.beginPath();
  ctx.arc(w.x, w.y, w.r, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w.x, w.y, w.r + (l.narrow ? 11 : 15), Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
  ctx.restore();
  // Bei Tag etwas heller (Licht fällt rein).
  if (light === 'day') {
    ctx.fillStyle = 'rgba(160, 170, 185, 0.05)';
    ctx.fillRect(0, l.belt, width, height - l.belt);
  }
}

export interface TrafficLayers {
  layout: TrafficLayout;
  back: HTMLCanvasElement;
  /** Laderaum im Rückspiegel (ohne Licht). */
  rear: HTMLCanvasElement;
}

/** Statische Teile einmal pro Größe. */
export function renderTraffic(
  layout: TrafficLayout,
  palette: TrafficPalette,
  dpr: number,
  env: { light: Light; wet: boolean; seed: number },
): TrafficLayers {
  const [back, ctx] = makeCanvas(layout.width, layout.height, dpr);
  const rnd = createRng(env.seed);
  drawOutside(ctx, layout.side, layout.horizon, env.light, env.wet, rnd, false);
  drawOutside(ctx, layout.wind, layout.horizon, env.light, env.wet, rnd, true);
  drawInterior(ctx, layout, palette, env.light);
  const m = layout.mirror;
  const [rear, rc] = makeCanvas(m.w, m.h, dpr);
  // Rückspiegel: Laderaum mit Kisten, hinten die Hecktüren mit zwei Scheiben.
  rc.fillStyle = '#07080b';
  rc.fillRect(0, 0, m.w, m.h);
  rc.fillStyle = env.light === 'day' ? '#4a5160' : '#141823';
  rc.fillRect(m.w * 0.3, m.h * 0.12, m.w * 0.18, m.h * 0.42);
  rc.fillRect(m.w * 0.52, m.h * 0.12, m.w * 0.18, m.h * 0.42);
  for (let i = 0; i < 7; i++) {
    const bw = m.w * (0.12 + rnd() * 0.08);
    const bh = m.h * (0.25 + rnd() * 0.2);
    const bx = m.w * 0.04 + i * m.w * 0.13 + rnd() * 4;
    const by = m.h - bh - (i % 2) * 3;
    rc.fillStyle = i % 3 === 0 ? BOX_DARK : BOX;
    rc.fillRect(bx, by, bw, bh);
    rc.fillStyle = 'rgba(0, 0, 0, 0.35)';
    rc.fillRect(bx + bw * 0.45, by, 2, bh);
  }
  return { layout, back, rear };
}

/** Blaulicht: Doppelblitz, links und rechts versetzt. 0 bis 1. */
export function blueFlash(t: number, side: 0 | 1, slow: boolean): number {
  const period = slow ? 1.5 : 0.8;
  const x = (t / period + side * 0.5) % 1;
  if (x < 0.07) return 1 - x / 0.07;
  if (x > 0.14 && x < 0.21) return 1 - (x - 0.14) / 0.07;
  return 0;
}

export interface BackFrame {
  t: number;
  /** Taschenlampe im Laderaum (0 bis 1 Fortschritt des Schwenks, -1 = aus). */
  sweep: number;
  slow: boolean;
  /** Bei der Flucht ruckt das Bild nach vorne (0 bis 1). */
  surge: number;
}

/** Hintere Ebene jedes Bild: Standbild, Rückspiegel mit Blaulicht, Blau im Innenraum. */
export function drawBack(
  ctx: CanvasRenderingContext2D,
  layers: TrafficLayers,
  palette: TrafficPalette,
  frame: BackFrame,
): void {
  const { layout: l } = layers;
  ctx.clearRect(0, 0, l.width, l.height);
  ctx.save();
  if (frame.surge > 0) {
    // Beschleunigen: Bild drückt nach hinten und zittert.
    const k = frame.surge;
    ctx.translate((Math.random() - 0.5) * 6 * k, 8 * k + (Math.random() - 0.5) * 4 * k);
  }
  ctx.drawImage(layers.back, 0, 0, l.width, l.height);
  // Rückspiegel: Rahmen, Laderaum, Blaulicht durch die Hecktüren, bei der Kontrolle der Lichtkegel.
  const m = l.mirror;
  ctx.save();
  ctx.fillStyle = '#050506';
  ctx.beginPath();
  ctx.roundRect(m.x - 4, m.y - 4, m.w + 8, m.h + 8, 10);
  ctx.fill();
  ctx.fillRect(m.x + m.w / 2 - 3, m.y - 18, 6, 16);
  ctx.beginPath();
  ctx.roundRect(m.x, m.y, m.w, m.h, 7);
  ctx.clip();
  ctx.drawImage(layers.rear, m.x, m.y, m.w, m.h);
  const left = blueFlash(frame.t, 0, frame.slow);
  const right = blueFlash(frame.t, 1, frame.slow);
  ctx.globalCompositeOperation = 'lighter';
  for (const [k, cx] of [
    [left, m.x + m.w * 0.36],
    [right, m.x + m.w * 0.64],
  ] as const) {
    if (k <= 0) continue;
    const g = ctx.createRadialGradient(cx, m.y + m.h * 0.3, 0, cx, m.y + m.h * 0.3, m.w * 0.5);
    g.addColorStop(0, palette.blue);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalAlpha = 0.9 * k;
    ctx.fillStyle = g;
    ctx.fillRect(m.x, m.y, m.w, m.h);
  }
  ctx.globalAlpha = 1;
  if (frame.sweep >= 0) {
    // Taschenlampe wandert über die Kisten (von rechts nach links und zurück).
    const s = frame.sweep;
    const bx = m.x + m.w * (0.85 - 0.7 * Math.sin(Math.min(1, s) * Math.PI));
    const g = ctx.createRadialGradient(bx, m.y + m.h * 0.7, 0, bx, m.y + m.h * 0.7, m.w * 0.22);
    g.addColorStop(0, 'rgba(255, 245, 215, 0.95)');
    g.addColorStop(1, 'rgba(255, 245, 215, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(m.x, m.y, m.w, m.h);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Glas des Spiegels.
  const glass = ctx.createLinearGradient(m.x, m.y, m.x + m.w, m.y + m.h);
  glass.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  glass.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glass;
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.restore();
  // Blau im Innenraum (Dach, Säule, Armaturen): schwacher Schein von hinten.
  const flash = Math.max(left, right);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (frame.slow ? 0.08 : 0.14) * flash;
    const g = ctx.createRadialGradient(m.x + m.w / 2, 0, 0, m.x + m.w / 2, 0, l.width * 0.7);
    g.addColorStop(0, palette.blue);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/** Ein Tropfen auf der Scheibe (Optik, Math.random erlaubt). */
export interface Drop {
  x: number;
  y: number;
  r: number;
  /** Rinnt gerade (px/s), 0 = haftet. */
  v: number;
}

export function makeDrops(layout: TrafficLayout, count: number): Drop[] {
  const drops: Drop[] = [];
  for (let i = 0; i < count; i++) drops.push(newDrop(layout, true));
  return drops;
}

function newDrop(l: TrafficLayout, anywhere: boolean): Drop {
  const onSide = Math.random() < 0.55;
  const b = bounds(onSide ? l.side : l.wind);
  return {
    x: b.x0 + Math.random() * (b.x1 - b.x0),
    y: anywhere ? b.y0 + Math.random() * (b.y1 - b.y0) : b.y0 + Math.random() * 30,
    r: 1.2 + Math.random() * 2.8,
    v: Math.random() < 0.15 ? 20 + Math.random() * 60 : 0,
  };
}

export function stepDrops(drops: Drop[], layout: TrafficLayout, dt: number, rate: number): void {
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    if (d.v > 0) d.y += d.v * dt;
    else if (Math.random() < 0.05 * dt) d.v = 25 + Math.random() * 50;
    if (d.y > layout.belt || Math.random() < rate * dt * 0.02) drops[i] = newDrop(layout, false);
  }
}

export interface FrontFrame {
  t: number;
  /** Lampe auf dich gerichtet (0 bis 1), nach unten auf die Papiere (0 bis 1). */
  glare: number;
  down: number;
  /** Ende: rot (Aussteigen) bzw. Erleichterung (grün), 0 bis 1. */
  red: number;
  relief: number;
  drops: Drop[] | null;
  /** Schnee draußen (Optik). */
  snow: boolean;
}

/** Vordere Ebene jedes Bild: Taschenlampe, Tropfen, Ende. */
export function drawFront(
  ctx: CanvasRenderingContext2D,
  l: TrafficLayout,
  palette: TrafficPalette,
  frame: FrontFrame,
): void {
  ctx.clearRect(0, 0, l.width, l.height);
  // Taschenlampe: Kegel vom Fenster in den Wagen (auf dich) bzw. nach unten (Papiere).
  const k = Math.max(frame.glare, frame.down);
  if (k > 0.01) {
    const [lx, ly] = l.lamp;
    const wob = Math.sin(frame.t * 1.7) * 8 + Math.sin(frame.t * 3.1) * 3;
    const tx = frame.down > frame.glare ? lx + l.width * 0.12 : l.width * (l.narrow ? 0.7 : 0.5) + wob;
    const ty = frame.down > frame.glare ? l.height * 0.95 : l.height * (l.narrow ? 0.45 : 0.55) + wob * 0.5;
    const ang = Math.atan2(ty - ly, tx - lx);
    const len = Math.hypot(tx - lx, ty - ly) * 1.4;
    const spread = 0.28;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, len);
    g.addColorStop(0, `rgba(255, 246, 220, ${0.32 * k})`);
    g.addColorStop(0.6, `rgba(255, 246, 220, ${0.08 * k})`);
    g.addColorStop(1, 'rgba(255, 246, 220, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, len, ang - spread, ang + spread);
    ctx.closePath();
    ctx.fill();
    // Kopf der Lampe: heller Punkt mit Blendung.
    const head = ctx.createRadialGradient(lx, ly, 0, lx, ly, 46);
    head.addColorStop(0, `rgba(255, 255, 255, ${0.95 * k})`);
    head.addColorStop(0.2, `rgba(255, 248, 225, ${0.4 * k})`);
    head.addColorStop(1, 'rgba(255, 248, 225, 0)');
    ctx.fillStyle = head;
    ctx.fillRect(lx - 46, ly - 46, 92, 92);
    ctx.restore();
    // Lampe selbst (dunkler Zylinder in der Hand).
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(ang + Math.PI);
    ctx.fillStyle = '#121317';
    ctx.beginPath();
    ctx.roundRect(4, -6, 38, 12, 4);
    ctx.fill();
    ctx.fillStyle = '#2a2c33';
    ctx.fillRect(4, -7, 8, 14);
    ctx.restore();
  }
  // Regentropfen auf den Scheiben (mit kleinem Glanzpunkt).
  if (frame.drops) {
    ctx.save();
    ctx.beginPath();
    poly(ctx, l.side, false);
    poly(ctx, l.wind, false);
    ctx.clip();
    for (const d of frame.drops) {
      ctx.fillStyle = 'rgba(190, 205, 225, 0.22)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * (d.v > 0 ? 1.5 : 1.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(d.x - d.r * 0.35, d.y - d.r * 0.45, 1, 1);
      if (d.v > 0) {
        ctx.fillStyle = 'rgba(190, 205, 225, 0.1)';
        ctx.fillRect(d.x - 0.6, d.y - 26, 1.2, 24);
      }
    }
    ctx.restore();
  }
  if (frame.snow) {
    ctx.save();
    ctx.beginPath();
    poly(ctx, l.side, false);
    poly(ctx, l.wind, false);
    ctx.clip();
    ctx.fillStyle = 'rgba(240, 244, 250, 0.7)';
    for (let i = 0; i < 70; i++) {
      const x = ((i * 97.3 + frame.t * (14 + (i % 5) * 4)) % l.width) + Math.sin(frame.t + i) * 6;
      const y = (i * 53.1 + frame.t * (30 + (i % 7) * 6)) % l.belt;
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
  }
  if (frame.red > 0) {
    ctx.fillStyle = palette.danger;
    ctx.globalAlpha = 0.22 * frame.red;
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.globalAlpha = 1;
  }
  if (frame.relief > 0) {
    const g = ctx.createRadialGradient(l.width / 2, l.height / 2, 0, l.width / 2, l.height / 2, l.width * 0.7);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, palette.money);
    ctx.globalAlpha = 0.12 * frame.relief;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.globalAlpha = 1;
  }
}

/** CSS-Polygon für das Seitenfenster (Zuschnitt des Beamten), relativ zur Bühne. */
export function clipPath(points: Point[]): string {
  return `polygon(${points.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(', ')})`;
}

/** Puls-Kurve (EKG) im kleinen Canvas: läuft von rechts nach links, Ausschlag je Herzschlag. */
export function drawEcg(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  history: Float32Array,
  head: number,
  color: string,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const n = history.length;
  for (let i = 0; i < n; i++) {
    const v = history[(head + i) % n];
    const x = (i / (n - 1)) * width;
    const y = height * 0.62 - v * height * 0.5;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}
