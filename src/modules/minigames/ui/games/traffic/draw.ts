// Verkehrskontrolle (Feedback vom 07.10.2026): Zeichnen der Szene von oben. Das Auto aufgeschnitten (Dach weg): Sitze,
// Armaturen mit Lenkrad, Handschuhfach, Konsole, Türfächer, Rückbank, Kofferraum mit Reserveradmulde. Draußen Asphalt
// mit Bordstein, der Streifenwagen mit Blaulicht schräg dahinter, der Beamte als Figur von oben mit Taschenlampe, deren
// Kegel die Stelle trifft, in die er gerade leuchtet. Nachts ist alles dunkel bis auf Laternenlicht, Innenlicht und
// Kegel; am Tag ist der Kegel ein heller Fleck. Regen als Tropfenringe auf dem Asphalt.
//
// Farben der Bedeutung aus den Tokens (mapToken); Lack, Asphalt und Polster sind Inhalt wie in Face.tsx: feste,
// gedeckte Werte. Der Hintergrund (Asphalt, Auto) liegt nach jeder Größenänderung fertig in einer eigenen Leinwand.

import { mapToken } from '../../../../../map';
import { drawGoodsGlyph } from '../../kit/goods';
import {
  currentStop,
  litZone,
  type PacketSize,
  pendingZones,
  SCENE_H,
  SCENE_W,
  type Stop,
  type TrafficSetup,
  type TrafficState,
  type Zone,
  type ZoneId,
  zoneById,
} from './model';

export interface TrafficPalette {
  gold: string;
  danger: string;
  money: string;
  warn: string;
  blue: string;
  ink: string;
  goods: string;
}

export function readPalette(): TrafficPalette {
  return {
    gold: mapToken('--hud-gold', '#f2c766'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    money: mapToken('--cat-money', '#30d158'),
    warn: mapToken('--cat-warn', '#ff9f0a'),
    blue: mapToken('--color-police-blue', '#2f7bff'),
    ink: mapToken('--hud-ink', '#ffffff'),
    goods: mapToken('--cat-goods', '#c8aa85'),
  };
}

/**
 * Lage der Szene auf der Bühne (CSS-Pixel). Am Handy (schmal) steht das Auto hochkant (Szene 100 × 150), am Desktop
 * liegt es quer (um 90° gedreht, Front nach rechts): So nutzt es die Breite.
 */
export interface TrafficLayout {
  width: number;
  height: number;
  /** Pixel pro Szenen-Einheit. */
  scale: number;
  ox: number;
  oy: number;
  narrow: boolean;
  rotated: boolean;
}

/** Oben Platz fürs HUD, unten für Puls und Knöpfe, rechts (breit) für die Leiste. */
export function trafficLayout(width: number, height: number): TrafficLayout {
  const narrow = width < 700;
  const top = narrow ? 118 : 86;
  const bottom = narrow ? 150 : 110;
  const avail = Math.max(120, height - top - bottom);
  if (narrow) {
    const scale = Math.min(avail / SCENE_H, (width - 16) / SCENE_W);
    const ox = (width - SCENE_W * scale) / 2;
    const oy = top + (avail - SCENE_H * scale) / 2;
    return { width, height, scale, ox, oy, narrow, rotated: false };
  }
  const room = width - 300;
  const scale = Math.min(avail / SCENE_W, (room - 32) / SCENE_H);
  const ox = 16 + (room - 32 - SCENE_H * scale) / 2;
  const oy = top + (avail - SCENE_W * scale) / 2;
  return { width, height, scale, ox, oy, narrow, rotated: true };
}

/** Bildschirm-Punkt in Szenen-Einheiten (gedreht: Front rechts). */
export function toScene(l: TrafficLayout, px: number, py: number): { x: number; y: number } {
  if (l.rotated) return { x: (py - l.oy) / l.scale, y: (l.ox + SCENE_H * l.scale - px) / l.scale };
  return { x: (px - l.ox) / l.scale, y: (py - l.oy) / l.scale };
}

export function zoneScreen(l: TrafficLayout, z: Zone): { x: number; y: number; w: number; h: number } {
  if (l.rotated) {
    return {
      x: l.ox + (SCENE_H - (z.y + z.h)) * l.scale,
      y: l.oy + z.x * l.scale,
      w: z.h * l.scale,
      h: z.w * l.scale,
    };
  }
  return { x: l.ox + z.x * l.scale, y: l.oy + z.y * l.scale, w: z.w * l.scale, h: z.h * l.scale };
}

const PAINT = '#1e2a3a';
const PAINT_EDGE = '#0e141c';
const SEAT = '#2b2b31';
const SEAT_EDGE = '#1a1a1f';
const DASH = '#15161b';
const CARPET = '#23252b';
const ASPHALT = '#2d2f36';
const ASPHALT_DAY = '#5a5d64';
const CURB = '#8d8f95';
const LAMP = 'rgba(255, 214, 150, 0.16)';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function offscreen(width: number, height: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [canvas, ctx];
}

function sceneTransform(ctx: CanvasRenderingContext2D, l: TrafficLayout): void {
  if (l.rotated) {
    ctx.translate(l.ox + SCENE_H * l.scale, l.oy);
    ctx.rotate(Math.PI / 2);
  } else ctx.translate(l.ox, l.oy);
  ctx.scale(l.scale, l.scale);
}

/** Sitz von oben: Polster mit Kopfstütze und Naht. */
function seat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, front: boolean): void {
  ctx.fillStyle = SEAT_EDGE;
  roundRect(ctx, x - 0.6, y - 0.6, w + 1.2, h + 1.2, 2.4);
  ctx.fill();
  ctx.fillStyle = SEAT;
  roundRect(ctx, x, y, w, h, 2);
  ctx.fill();
  // Kopfstütze (vorne oben).
  if (front) {
    ctx.fillStyle = SEAT_EDGE;
    roundRect(ctx, x + w * 0.25, y - 2.6, w * 0.5, 3.2, 1.2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(x + 1.5, y + h * 0.35);
  ctx.lineTo(x + w - 1.5, y + h * 0.35);
  ctx.moveTo(x + 1.5, y + h * 0.65);
  ctx.lineTo(x + w - 1.5, y + h * 0.65);
  ctx.stroke();
}

/** Das Auto von oben, aufgeschnitten. */
function drawCar(ctx: CanvasRenderingContext2D, setup: TrafficSetup, night: boolean): void {
  // Karosserie: Umriss mit Motorhaube oben und Heck unten.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, 24.5, 15.5, 52, 122, 7);
  ctx.fill();
  ctx.fillStyle = PAINT_EDGE;
  roundRect(ctx, 23, 13, 54, 124, 7);
  ctx.fill();
  ctx.fillStyle = PAINT;
  roundRect(ctx, 24, 14, 52, 122, 6.4);
  ctx.fill();
  // Motorhaube mit Sicke, Frontscheibe als Band.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(28, 16, 44, 18);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(50, 17);
  ctx.lineTo(50, 33);
  ctx.stroke();
  ctx.fillStyle = night ? '#1b2a3f' : '#6f93b8';
  roundRect(ctx, 27, 34, 46, 3.4, 1);
  ctx.fill();
  // Innenraum: Teppich.
  ctx.fillStyle = CARPET;
  roundRect(ctx, 26.5, 38, 47, 76, 1.5);
  ctx.fill();
  // Armaturenbrett mit Lenkrad links, Handschuhfach rechts.
  ctx.fillStyle = DASH;
  roundRect(ctx, 27, 38, 46, 11, 1.5);
  ctx.fill();
  ctx.strokeStyle = '#3b3d45';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(37.5, 48.5, 6.2, 3.1, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(31.3, 48.5);
  ctx.lineTo(43.7, 48.5);
  ctx.moveTo(37.5, 48.5);
  ctx.lineTo(37.5, 51.4);
  ctx.stroke();
  // Türen (Innenverkleidung) mit Türfächern.
  ctx.fillStyle = '#20222a';
  ctx.fillRect(24, 44, 3.2, 70);
  ctx.fillRect(72.8, 44, 3.2, 70);
  // Sitze vorne, Konsole, Rückbank.
  seat(ctx, 30, 56, 16, 22, true);
  seat(ctx, 54, 56, 16, 22, true);
  ctx.fillStyle = DASH;
  roundRect(ctx, 44, 52, 12, 20, 1.5);
  ctx.fill();
  ctx.fillStyle = '#3a3d45';
  roundRect(ctx, 47.5, 54, 5, 3, 0.8);
  ctx.fill();
  ctx.fillStyle = SEAT_EDGE;
  roundRect(ctx, 26.5, 92, 47, 21, 2);
  ctx.fill();
  ctx.fillStyle = SEAT;
  roundRect(ctx, 27.5, 93, 45, 19, 1.8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.35;
  ctx.beginPath();
  ctx.moveTo(50, 94);
  ctx.lineTo(50, 111);
  ctx.moveTo(29, 100);
  ctx.lineTo(71, 100);
  ctx.stroke();
  // Hutablage, Heckscheibe, Kofferraum mit Mulde.
  ctx.fillStyle = DASH;
  ctx.fillRect(26.5, 112.2, 47, 1.6);
  ctx.fillStyle = CARPET;
  roundRect(ctx, 26.5, 114, 47, 21, 1.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.4;
  roundRect(ctx, 38, 127, 24, 7.5, 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(50, 130.7, 3, 0, Math.PI * 2);
  ctx.stroke();
  // Rücklichter.
  ctx.fillStyle = 'rgba(255,60,50,0.85)';
  roundRect(ctx, 26, 134.5, 10, 1.4, 0.6);
  ctx.fill();
  roundRect(ctx, 64, 134.5, 10, 1.4, 0.6);
  ctx.fill();
  // Scheinwerfer.
  ctx.fillStyle = 'rgba(255,245,210,0.9)';
  roundRect(ctx, 26, 14.3, 9, 1.3, 0.5);
  ctx.fill();
  roundRect(ctx, 65, 14.3, 9, 1.3, 0.5);
  ctx.fill();
  // Umrisse der versteckten Stellen (dezent), damit man weiß, wo etwas hin kann.
  for (const z of setup.zones) {
    if (z.open) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.setLineDash([1.2, 1]);
    ctx.lineWidth = 0.35;
    roundRect(ctx, z.x, z.y, z.w, z.h, 1);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Streifenwagen von oben, schräg hinter dir am Straßenrand. */
function patrolCar(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  roundRect(ctx, -11, -22, 22, 46, 4);
  ctx.fill();
  ctx.fillStyle = '#e8ebef';
  roundRect(ctx, -10.5, -23, 21, 46, 4);
  ctx.fill();
  ctx.fillStyle = '#2458c9';
  ctx.fillRect(-10.5, -4, 21, 5);
  ctx.fillStyle = '#1b2638';
  roundRect(ctx, -8.5, -8, 17, 7, 1.5);
  ctx.fill();
  roundRect(ctx, -8.5, 9, 17, 6, 1.5);
  ctx.fill();
  ctx.fillStyle = '#20232b';
  roundRect(ctx, -3.5, -1.2, 7, 2.4, 0.8);
  ctx.fill();
  ctx.restore();
}

/** Figur von oben: Mütze mit Schirm, Schultern, Taschenlampe in der Hand Richtung Auto. */
function officer(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  const sway = Math.sin(t * 2.2) * 0.4;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0.6, 0.8, 6.2, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Schultern (Uniformjacke).
  ctx.fillStyle = '#1d2b4a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Arm mit Lampe nach vorne.
  ctx.strokeStyle = '#1d2b4a';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3.6, -0.6);
  ctx.lineTo(6.4, -4.2 + sway);
  ctx.stroke();
  ctx.fillStyle = '#d8d4cc';
  ctx.beginPath();
  ctx.arc(6.6, -4.6 + sway, 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2d35';
  roundRect(ctx, 6, -7.6 + sway, 1.6, 3, 0.5);
  ctx.fill();
  // Kopf mit Mütze (dunkelblau, Schirm nach vorne, Kokarde).
  ctx.fillStyle = '#17213a';
  ctx.beginPath();
  ctx.arc(0, -0.4, 2.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0e1424';
  ctx.beginPath();
  ctx.ellipse(0, -2.9, 2.4, 0.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d9b74a';
  ctx.beginPath();
  ctx.arc(0, -1.5, 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hintergrund (Asphalt, Bordstein, Streifenwagen, Auto) fertig gezeichnet. */
export function renderBackground(l: TrafficLayout, setup: TrafficSetup, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = offscreen(l.width, l.height, dpr);
  const night = setup.night;
  ctx.fillStyle = night ? ASPHALT : ASPHALT_DAY;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.save();
  sceneTransform(ctx, l);
  // Sichtbarer Ausschnitt in Szenen-Einheiten (gedreht: Ecken der Bühne zurückrechnen).
  const corners = [toScene(l, 0, 0), toScene(l, l.width, 0), toScene(l, 0, l.height), toScene(l, l.width, l.height)];
  const left = Math.min(...corners.map((c) => c.x));
  const right = Math.max(...corners.map((c) => c.x));
  const top = Math.min(...corners.map((c) => c.y));
  const bottom = Math.max(...corners.map((c) => c.y));
  // Körnung.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let i = 0; i < 260; i++) {
    const gx = left + (((i * 73) % 1000) / 1000) * (right - left);
    const gy = top + (((i * 131) % 1000) / 1000) * (bottom - top);
    ctx.fillRect(gx, gy, 0.8, 0.8);
  }
  // Bordstein und Gehweg rechts, Fahrbahnmarkierung links.
  ctx.fillStyle = night ? '#3a3c43' : '#7a7c82';
  ctx.fillRect(96, top, right - 96, bottom - top);
  ctx.fillStyle = CURB;
  ctx.fillRect(95, top, 1.4, bottom - top);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.moveTo(2, top);
  ctx.lineTo(2, bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  // Gully und Laterne (Lichtfleck).
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 88, 20, 6, 4, 0.6);
  ctx.fill();
  if (night) {
    const lamp = ctx.createRadialGradient(100, 70, 2, 100, 70, 70);
    lamp.addColorStop(0, LAMP);
    lamp.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = lamp;
    ctx.fillRect(left, top, right - left, bottom - top);
  }
  // Streifenwagen: hochkant neben dir am Rand, quer (Desktop) hinter dir auf der Fahrbahn.
  if (l.rotated) patrolCar(ctx, 60, 172, -0.14);
  else patrolCar(ctx, 112, 158, -0.22);
  drawCar(ctx, setup, night);
  ctx.restore();
  return canvas;
}

export interface Fx {
  t: number;
  reduced: boolean;
  running: boolean;
  /** Markierte Stelle beim Ziehen (passt oder nicht). */
  hover: { id: ZoneId; ok: boolean } | null;
  reject: { id: ZoneId; at: number } | null;
  stowed: { id: ZoneId; at: number } | null;
  /** Fund: Stelle rot aufblitzen lassen. */
  found: { id: ZoneId; at: number } | null;
  /** Wo der Beamte gerade steht (geglättet) und wohin er schaut. */
  officer: { x: number; y: number };
  rain: boolean;
}

/** Lage des Beamten: an der Station, beim Gehen unterwegs (geglättet in der Oberfläche). */
export function officerTarget(state: TrafficState): { x: number; y: number } {
  const stop = currentStop(state);
  if (!stop) return { x: 14, y: 64 };
  return { x: stop.x, y: stop.y };
}

/** Mitte einer Stelle. */
function center(z: Zone): { x: number; y: number } {
  return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
}

/** Punkt am Wegesrand zwischen zwei Stationen (um das Auto herum, nicht hindurch). */
export function walkPoint(from: Stop, to: Stop, k: number): { x: number; y: number } {
  // Über die Ecke gehen: erst zur Höhe der Zielstation, dann quer (am Heck vorbei).
  const viaY = Math.max(from.y, to.y, 146);
  const legs = [
    { x: from.x, y: from.y },
    { x: from.x, y: viaY },
    { x: to.x, y: viaY },
    { x: to.x, y: to.y },
  ];
  const lengths = legs.slice(1).map((p, i) => Math.hypot(p.x - legs[i].x, p.y - legs[i].y));
  const total = lengths.reduce((s, v) => s + v, 0) || 1;
  let d = k * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) {
      const a = legs[i];
      const b = legs[i + 1];
      const t = lengths[i] > 0 ? Math.min(1, d / lengths[i]) : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= lengths[i];
  }
  return { x: to.x, y: to.y };
}

function drawPacket(
  ctx: CanvasRenderingContext2D,
  p: TrafficPalette,
  x: number,
  y: number,
  size: PacketSize,
  opts: { selected: boolean; alpha: number; lifted: number },
): void {
  const half = (size === 2 ? 4.4 : 3.4) * (1 + 0.1 * opts.lifted);
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, x - half + 0.5 + opts.lifted, y - half + 0.8 + opts.lifted * 1.5, half * 2, half * 2, 1.2);
  ctx.fill();
  ctx.fillStyle = '#1a1b20';
  roundRect(ctx, x - half, y - half, half * 2, half * 2, 1.2);
  ctx.fill();
  ctx.fillStyle = p.goods;
  ctx.globalAlpha = opts.alpha * 0.35;
  ctx.fill();
  ctx.globalAlpha = opts.alpha;
  ctx.strokeStyle = p.goods;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  if (size === 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
  }
  ctx.strokeStyle = p.goods;
  ctx.lineWidth = 0.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.translate(x, y);
  drawGoodsGlyph(ctx, 'box', half * 0.5);
  ctx.translate(-x, -y);
  if (opts.selected) {
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 0.7;
    roundRect(ctx, x - half - 1.2, y - half - 1.2, half * 2 + 2.4, half * 2 + 2.4, 1.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ein Bild: Hintergrund, Lichtkegel, Stellen, Pakete, Beamter, Regen, Blaulicht. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  l: TrafficLayout,
  p: TrafficPalette,
  setup: TrafficSetup,
  state: TrafficState,
  bg: HTMLCanvasElement,
  fx: Fx,
): void {
  ctx.save();
  ctx.clearRect(0, 0, l.width, l.height);
  ctx.drawImage(bg, 0, 0, l.width, l.height);
  ctx.save();
  sceneTransform(ctx, l);
  const night = setup.night;
  const lit = litZone(state);
  const pending = pendingZones(state);
  const flick = fx.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(fx.t * 9);
  // Blaulicht des Streifenwagens auf Asphalt und Heck.
  const blue = flick > 0.5;
  const gx = l.rotated ? 60 : 112;
  const gy = l.rotated ? 168 : 150;
  const glow = ctx.createRadialGradient(gx, gy, 4, gx, gy, 75);
  glow.addColorStop(0, blue ? 'rgba(70,140,255,0.32)' : 'rgba(255,70,70,0.26)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(gx - 80, gy - 80, 160, 160);
  // Stellen: die, in die er gleich leuchtet (dezenter Rahmen), die aktuelle (Kegel), Zurückweisung, Verstauen, Fund.
  for (const id of pending) {
    const z = zoneById(id);
    ctx.strokeStyle = p.warn;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([1.6, 1.2]);
    ctx.lineWidth = 0.5;
    roundRect(ctx, z.x - 0.8, z.y - 0.8, z.w + 1.6, z.h + 1.6, 1.4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  const o = fx.officer;
  if (lit) {
    const z = zoneById(lit);
    const c = center(z);
    // Kegel von der Lampe zur Stelle.
    const ang = Math.atan2(c.y - o.y, c.x - o.x);
    const len = Math.hypot(c.x - o.x, c.y - o.y) + Math.max(z.w, z.h) * 0.6;
    const spread = 0.42;
    const cone = ctx.createLinearGradient(o.x, o.y, c.x, c.y);
    cone.addColorStop(0, night ? 'rgba(255,240,200,0.55)' : 'rgba(255,240,200,0.3)');
    cone.addColorStop(1, night ? 'rgba(255,240,200,0.12)' : 'rgba(255,240,200,0.08)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + Math.cos(ang - spread) * len, o.y + Math.sin(ang - spread) * len);
    ctx.lineTo(o.x + Math.cos(ang + spread) * len, o.y + Math.sin(ang + spread) * len);
    ctx.closePath();
    ctx.fill();
    // Die Stelle selbst hell.
    ctx.fillStyle = `rgba(255,240,200,${night ? 0.3 : 0.22})`;
    roundRect(ctx, z.x, z.y, z.w, z.h, 1.2);
    ctx.fill();
    ctx.strokeStyle = p.danger;
    ctx.lineWidth = 0.7;
    roundRect(ctx, z.x - 0.8, z.y - 0.8, z.w + 1.6, z.h + 1.6, 1.6);
    ctx.stroke();
  }
  if (fx.running && fx.hover) {
    const z = zoneById(fx.hover.id);
    ctx.strokeStyle = fx.hover.ok ? p.gold : p.danger;
    ctx.lineWidth = 0.8;
    ctx.setLineDash(fx.hover.ok ? [] : [1.4, 1.2]);
    roundRect(ctx, z.x - 1.4, z.y - 1.4, z.w + 2.8, z.h + 2.8, 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (fx.reject && fx.t - fx.reject.at < 0.5) {
    const z = zoneById(fx.reject.id);
    ctx.fillStyle = p.danger;
    ctx.globalAlpha = 0.35 * (1 - (fx.t - fx.reject.at) / 0.5);
    roundRect(ctx, z.x - 1, z.y - 1, z.w + 2, z.h + 2, 1.6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (fx.stowed && fx.t - fx.stowed.at < 0.6) {
    const z = zoneById(fx.stowed.id);
    const k = (fx.t - fx.stowed.at) / 0.6;
    ctx.strokeStyle = p.money;
    ctx.globalAlpha = 1 - k;
    ctx.lineWidth = 0.8;
    roundRect(ctx, z.x - 1 - k * 3, z.y - 1 - k * 3, z.w + 2 + k * 6, z.h + 2 + k * 6, 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (fx.found && fx.t - fx.found.at < 0.9) {
    const z = zoneById(fx.found.id);
    const k = (fx.t - fx.found.at) / 0.9;
    ctx.fillStyle = p.danger;
    ctx.globalAlpha = 0.5 * (1 - k);
    roundRect(ctx, z.x - 1, z.y - 1, z.w + 2, z.h + 2, 1.6);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Belegung versteckter Stellen als Punkte.
  for (const z of setup.zones) {
    if (z.open || z.capacity >= 99) continue;
    const used = state.items.filter((it) => !it.found && (it.zone === z.id || it.moving?.zone === z.id)).length;
    const gap = 1.7;
    const x0 = z.x + z.w / 2 - ((z.capacity - 1) * gap) / 2;
    for (let i = 0; i < z.capacity; i++) {
      ctx.beginPath();
      ctx.arc(x0 + i * gap, z.y + z.h + 1.3, 0.55, 0, Math.PI * 2);
      ctx.fillStyle = i < used ? p.money : 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
  }
  // Pakete: offen liegende voll, versteckte halb durchsichtig (Röntgenblick), unterwegs gehoben.
  state.items.forEach((it, i) => {
    if (it.found) return;
    const size = setup.packets[i].size;
    const hidden = it.zone !== null && !zoneById(it.zone).open;
    const moving = !!it.moving;
    const k = it.moving ? 1 - Math.max(0, it.moving.left) / it.moving.total : 0;
    drawPacket(ctx, p, it.x, it.y, size, {
      selected: fx.running && state.selected === i && !moving,
      alpha: hidden ? 0.45 : moving ? 0.9 : 1,
      lifted: moving ? Math.sin(k * Math.PI) : 0,
    });
  });
  // Der Beamte, zur Stelle gedreht.
  const face = lit ? center(zoneById(lit)) : { x: 50, y: o.y };
  officer(ctx, o.x, o.y, Math.atan2(face.y - o.y, face.x - o.x), fx.t);
  // Regen: Ringe auf dem Asphalt.
  if (fx.rain && !fx.reduced) {
    ctx.strokeStyle = 'rgba(200,220,255,0.25)';
    ctx.lineWidth = 0.3;
    for (let i = 0; i < 14; i++) {
      const life = (fx.t * 0.9 + i * 0.37) % 1;
      const rx = ((i * 211) % 160) - 20;
      const ry = ((i * 97 + Math.floor(fx.t * 0.9 + i * 0.37) * 53) % 190) - 20;
      ctx.beginPath();
      ctx.ellipse(rx, ry, life * 3, life * 1.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  // Nachts: alles außerhalb des Kegels und der Lampen dunkler; Blaulicht am Bildrand.
  if (night) {
    ctx.fillStyle = 'rgba(5,8,20,0.22)';
    ctx.fillRect(0, 0, l.width, l.height);
  }
  const edge = ctx.createRadialGradient(
    l.width / 2,
    l.height / 2,
    Math.min(l.width, l.height) * 0.4,
    l.width / 2,
    l.height / 2,
    Math.max(l.width, l.height) * 0.72,
  );
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(1, blue ? 'rgba(70,140,255,0.28)' : 'rgba(255,60,60,0.22)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.restore();
}
