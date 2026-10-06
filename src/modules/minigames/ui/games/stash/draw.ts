// Zeichnen für den Razzia-Countdown: Draufsicht auf das Lager (Halle mit Regalen, Tor, Straße mit Lieferwagen und
// Gully) bzw. die Straße am Spot (Hauswand, Bank, Blumenkübel, Briefkasten, Mülltonne). Der Hintergrund liegt nach
// jeder Größenänderung fertig in einer eigenen Leinwand; pro Bild kommen Pakete, Rahmen, Blaulicht und Effekte dazu.
// Farben aus den Design-Tokens (mapToken), keine freien Farben außer Schwarz/Weiß mit Deckkraft.

import { mapToken } from '../../../../../map';
import {
  type HideId,
  PACKAGE_HALF,
  SCENE,
  type StashHide,
  type StashPackage,
  type StashSetup,
  type StashState,
  streetClosed,
  usedIn,
} from './model';

export interface StashPalette {
  base: string;
  ink: string;
  ink2: string;
  gold: string;
  money: string;
  dirty: string;
  danger: string;
  warn: string;
  goods: string;
  place: string;
  people: string;
  law: string;
  media: string;
  chat: string;
  sky: string;
}

export function readPalette(): StashPalette {
  return {
    base: mapToken('--hud-glass-solid', '#16181d'),
    ink: mapToken('--hud-ink', '#ffffff'),
    ink2: mapToken('--hud-ink-2', 'rgba(235, 235, 245, 0.72)'),
    gold: mapToken('--hud-gold', '#f2c766'),
    money: mapToken('--cat-money', '#30d158'),
    dirty: mapToken('--cat-dirty', '#d891ff'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    warn: mapToken('--cat-warn', '#ff9f0a'),
    goods: mapToken('--cat-goods', '#c8aa85'),
    place: mapToken('--cat-place', '#6ab2ff'),
    people: mapToken('--cat-people', '#40c8e0'),
    law: mapToken('--cat-law', '#a7a5ff'),
    media: mapToken('--cat-media', '#ff899f'),
    chat: mapToken('--cat-chat', '#63e6e2'),
    sky: mapToken('--cat-sky', '#64d2ff'),
  };
}

/** Farbton und Symbol je Ware (Geld: Schwarzgeld-Farbe und Schein). */
export type PackageGlyph = 'leaf' | 'brick' | 'gummy' | 'drop' | 'stick' | 'cash' | 'box';

export function packageLook(p: StashPalette, productId: string | null): { color: string; glyph: PackageGlyph } {
  switch (productId) {
    case null:
      return { color: p.dirty, glyph: 'cash' };
    case 'weed':
      return { color: p.money, glyph: 'leaf' };
    case 'haze':
      return { color: p.chat, glyph: 'leaf' };
    case 'kush':
      return { color: p.people, glyph: 'leaf' };
    case 'hash':
      return { color: p.goods, glyph: 'brick' };
    case 'edibles':
      return { color: p.media, glyph: 'gummy' };
    case 'oil':
      return { color: p.warn, glyph: 'drop' };
    case 'vape':
      return { color: p.sky, glyph: 'stick' };
    default:
      return { color: p.goods, glyph: 'box' };
  }
}

/** Lage der Szene auf der Bühne (CSS-Pixel) und der Platz für die Versteck-Leiste. */
export interface StashLayout {
  width: number;
  height: number;
  /** Pixel pro Szenen-Einheit. */
  scale: number;
  ox: number;
  oy: number;
  /** Leiste mit Paket und Verstecken: rechts (Desktop) oder unten (Handy). */
  panel: { side: boolean; x: number; y: number; w: number; h: number };
}

/** Oben bleibt Platz fürs HUD; rechts (breit) bzw. unten (schmal) für die Leiste. */
export function stashLayout(width: number, height: number, hideCount = 5): StashLayout {
  const top = width < 760 ? 72 : 80;
  const side = width >= 760;
  if (side) {
    const panelW = 300;
    const gap = 24;
    const size = Math.max(160, Math.min(width - panelW - gap - 48, height - top - 24));
    const total = size + gap + panelW;
    const ox = Math.max(16, (width - total) / 2);
    const oy = top + Math.max(0, (height - top - 24 - size) / 2);
    return {
      width,
      height,
      scale: size / SCENE,
      ox,
      oy,
      panel: { side, x: ox + size + gap, y: oy, w: panelW, h: size },
    };
  }
  // Am Handy: Leiste unten am Rand (Daumen), Szene mittig im Platz darüber.
  const panelH = panelHeight(hideCount);
  const py = height - panelH - 8;
  const avail = py - 8 - top;
  const size = Math.max(160, Math.min(width - 12, avail));
  const ox = (width - size) / 2;
  const oy = top + Math.max(0, (avail - size) / 2);
  return {
    width,
    height,
    scale: size / SCENE,
    ox,
    oy,
    panel: { side, x: 8, y: py, w: width - 16, h: panelH },
  };
}

/** Höhe der Leiste unten (Handy): Paket oben, Verstecke in zwei Spalten zu je 56 px plus Abstand. */
function panelHeight(hideCount: number): number {
  return 12 + 52 + 12 + Math.ceil(hideCount / 2) * 64 + 4;
}

function offscreen(width: number, height: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [canvas, ctx];
}

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

/** Szenen-Koordinaten setzen (1 Einheit = scale Pixel). */
function toScene(ctx: CanvasRenderingContext2D, l: StashLayout): void {
  ctx.translate(l.ox, l.oy);
  ctx.scale(l.scale, l.scale);
}

/** Feines Rauschen als Struktur (fest, aus einem einfachen Zähler statt Math.random: gleiches Bild bei jedem Neuaufbau). */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number): void {
  let n = 7;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  const count = Math.round((w * h) / 9);
  for (let i = 0; i < count; i++) {
    n = (n * 9301 + 49297) % 233280;
    const px = x + (n / 233280) * w;
    n = (n * 9301 + 49297) % 233280;
    const py = y + (n / 233280) * h;
    ctx.fillRect(px, py, 0.35, 0.35);
  }
}

function crate(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = p.goods;
  ctx.globalAlpha = 0.32;
  roundRect(ctx, x, y, w, h, 0.6);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = p.goods;
  ctx.lineWidth = 0.3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.globalAlpha = 0.22;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Regal von oben: Rahmen mit Kisten. */
function shelf(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, x + 0.6, y + 0.8, w, h, 0.8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  roundRect(ctx, x, y, w, h, 0.8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 0.35;
  ctx.stroke();
  const horizontal = w > h;
  const n = Math.max(1, Math.floor((horizontal ? w : h) / 6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cs = Math.min(horizontal ? h : w, 5) - 1.6;
    const cx = horizontal ? x + t * w - cs / 2 : x + (w - cs) / 2;
    const cy = horizontal ? y + (h - cs) / 2 : y + t * h - cs / 2;
    if ((i * 7 + 3) % 5 !== 0) crate(ctx, p, cx, cy, cs, cs);
  }
}

/** Gully: Rost mit Stäben. */
function drainGrate(ctx: CanvasRenderingContext2D, h: StashHide): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, h.x, h.y, h.w, h.h, 1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  for (let i = 1; i < 6; i++) {
    const x = h.x + (i * h.w) / 6;
    ctx.beginPath();
    ctx.moveTo(x, h.y + 1.2);
    ctx.lineTo(x, h.y + h.h - 1.2);
    ctx.stroke();
  }
}

/** Tresor von oben: Stahlkasten mit Rad. */
function vaultBox(ctx: CanvasRenderingContext2D, p: StashPalette, h: StashHide): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, h.x + 0.8, h.y + 1, h.w, h.h, 1.2);
  ctx.fill();
  const g = ctx.createLinearGradient(h.x, h.y, h.x + h.w, h.y + h.h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.fillStyle = p.base;
  roundRect(ctx, h.x, h.y, h.w, h.h, 1.2);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  const cx = h.x + h.w * 0.62;
  const cy = h.y + h.h / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(h.w, h.h) * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillRect(h.x + h.w * 0.18, cy - 0.5, h.w * 0.16, 1);
}

/** Doppelter Boden: Dielen mit Fugen und Zugring. */
function floorHatch(ctx: CanvasRenderingContext2D, p: StashPalette, h: StashHide): void {
  ctx.fillStyle = p.goods;
  ctx.globalAlpha = 0.18;
  roundRect(ctx, h.x, h.y, h.w, h.h, 0.6);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = p.goods;
  ctx.lineWidth = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  for (let i = 1; i < 4; i++) {
    const y = h.y + (i * h.h) / 4;
    ctx.beginPath();
    ctx.moveTo(h.x, y);
    ctx.lineTo(h.x + h.w, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(h.x + h.w - 2.4, h.y + h.h / 2, 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** Lüftungsschacht: Gitter mit Lamellen in der Wand. */
function ventGrille(ctx: CanvasRenderingContext2D, h: StashHide): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, h.x, h.y, h.w, h.h, 0.6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 0.4;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 0.6;
  for (let i = 1; i < 8; i++) {
    const x = h.x + (i * h.w) / 8;
    ctx.beginPath();
    ctx.moveTo(x - 0.8, h.y + 1.2);
    ctx.lineTo(x + 0.8, h.y + h.h - 1.2);
    ctx.stroke();
  }
}

/** Lieferwagen von oben, Heck links (dort der Kofferraum). */
function van(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, x + 1, y + 1.4, w, h, 2.4);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
  g.addColorStop(1, 'rgba(255, 255, 255, 0.14)');
  ctx.fillStyle = p.base;
  roundRect(ctx, x, y, w, h, 2.4);
  ctx.fill();
  ctx.fillStyle = g;
  ctx.fill();
  // Windschutzscheibe vorn (rechts), Dach mit Rippen.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, x + w - 7.5, y + 1.6, 4.5, h - 3.2, 1.2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 4; i++) {
    const rx = x + 16 + i * 3.4;
    ctx.beginPath();
    ctx.moveTo(rx, y + 2);
    ctx.lineTo(rx, y + h - 2);
    ctx.stroke();
  }
  // Spiegel.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.fillRect(x + w - 8, y - 1, 1.6, 1.2);
  ctx.fillRect(x + w - 8, y + h - 0.2, 1.6, 1.2);
  // Offene Hecktüren.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  roundRect(ctx, x + 0.8, y + 1.6, 12, h - 3.2, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.fillRect(x - 3.4, y + 0.2, 3.6, 1.1);
  ctx.fillRect(x - 3.4, y + h - 1.3, 3.6, 1.1);
  ctx.fillStyle = p.gold;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x + w - 1.4, y + 2, 1, 2.2);
  ctx.fillRect(x + w - 1.4, y + h - 4.2, 1, 2.2);
  ctx.globalAlpha = 1;
}

/** Hintergrund des Lagers (Szene plus Umgebung bis zum Rand der Bühne). */
function renderWarehouse(ctx: CanvasRenderingContext2D, l: StashLayout, p: StashPalette, setup: StashSetup): void {
  // Draußen: Asphalt über die ganze Bühne.
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.save();
  toScene(ctx, l);
  const left = -l.ox / l.scale;
  const right = (l.width - l.ox) / l.scale;
  const top = -l.oy / l.scale;
  const bottom = (l.height - l.oy) / l.scale;
  // Dächer der Nachbarhäuser links und rechts der Halle, oben drüber.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(left, top, right - left, 68 - top);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 0.3;
  for (let x = Math.floor(left / 6) * 6; x < right; x += 6) {
    if (x > 0 && x < SCENE) continue;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, 68);
    ctx.stroke();
  }
  // Gehweg und Bordstein.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillRect(left, 68, right - left, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(left, 73.6, right - left, 0.5);
  // Fahrbahn mit Mittellinie.
  grain(ctx, left, 74, right - left, Math.min(40, bottom - 74), 0.035);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, 97);
  ctx.lineTo(right, 97);
  ctx.stroke();
  ctx.setLineDash([]);
  // Halle: Boden aus Beton mit Fugen.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)';
  ctx.fillRect(3, 3, 94, 64);
  const light = ctx.createRadialGradient(48, 36, 4, 48, 36, 60);
  light.addColorStop(0, 'rgba(255, 236, 200, 0.07)');
  light.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = light;
  ctx.fillRect(3, 3, 94, 64);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 0.25;
  for (let x = 13; x < 97; x += 10) {
    ctx.beginPath();
    ctx.moveTo(x, 3);
    ctx.lineTo(x, 67);
    ctx.stroke();
  }
  for (let y = 13; y < 67; y += 10) {
    ctx.beginPath();
    ctx.moveTo(3, y);
    ctx.lineTo(97, y);
    ctx.stroke();
  }
  grain(ctx, 3, 3, 94, 64, 0.03);
  // Bereich, in dem die Ware liegt (Paletten).
  ctx.strokeStyle = p.gold;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 0.4;
  ctx.setLineDash([1.6, 1.4]);
  roundRect(ctx, 24.5, 15.5, 47, 47, 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Regale an den Wänden.
  shelf(ctx, p, 5, 26, 8, 36);
  shelf(ctx, p, 27, 5, 40, 7);
  shelf(ctx, p, 87, 53, 8, 12);
  // Wände mit Tor unten.
  const gate = { x0: 32, x1: 52 };
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(gate.x0, 67);
  ctx.lineTo(3, 67);
  ctx.lineTo(3, 3);
  ctx.lineTo(97, 3);
  ctx.lineTo(97, 67);
  ctx.lineTo(gate.x1, 67);
  ctx.stroke();
  // Rolltor (halb offen, gestreift).
  ctx.fillStyle = p.warn;
  ctx.globalAlpha = 0.5;
  for (let x = gate.x0; x < gate.x1; x += 2.4) ctx.fillRect(x, 66.2, 1.2, 1.6);
  ctx.globalAlpha = 1;
  // Fenster (für das Blaulicht): oben und links.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  for (const [x, y, w, h] of WINDOWS) ctx.fillRect(x, y, w, h);
  // Verstecke.
  for (const h of setup.hides) {
    if (h.id === 'vault') vaultBox(ctx, p, h);
    else if (h.id === 'floor') floorHatch(ctx, p, h);
    else if (h.id === 'vent') ventGrille(ctx, h);
    else if (h.id === 'drain') drainGrate(ctx, h);
  }
  if (!setup.hides.some((h) => h.id === 'vault')) {
    // Ohne Tresor-Ausbau steht dort nur ein Regal.
    shelf(ctx, p, 6, 7, 16, 14);
  }
  van(ctx, p, 57, 78, 37, 15);
  ctx.restore();
}

/** Fenster der Halle (Szene), an denen das Blaulicht flackert. */
const WINDOWS: readonly (readonly [number, number, number, number])[] = [
  [30, 2.2, 8, 1.6],
  [44, 2.2, 8, 1.6],
  [58, 2.2, 8, 1.6],
  [2.2, 22, 1.6, 8],
  [96.2, 20, 1.6, 8],
  [96.2, 38, 1.6, 8],
];

/** Hintergrund am Spot: Hauswand oben, Gehweg mit Bank, Fahrbahn unten. */
function renderStreet(ctx: CanvasRenderingContext2D, l: StashLayout, p: StashPalette, setup: StashSetup): void {
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.save();
  toScene(ctx, l);
  const left = -l.ox / l.scale;
  const right = (l.width - l.ox) / l.scale;
  const top = -l.oy / l.scale;
  const bottom = (l.height - l.oy) / l.scale;
  // Häuser oben (Dach), Fassade mit Eingängen.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(left, top, right - left, 8 - top);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.fillRect(left, 8, right - left, 1);
  // Gehweg mit Platten.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(left, 9, right - left, 70);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 0.25;
  for (let x = Math.floor(left / 8) * 8; x < right; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x, 9);
    ctx.lineTo(x, 79);
    ctx.stroke();
  }
  for (let y = 17; y < 79; y += 8) {
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  // Hauseingänge.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(24, 5.6, 10, 3.4);
  ctx.fillRect(58, 5.6, 10, 3.4);
  // Bordstein und Fahrbahn.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(left, 79, right - left, 0.7);
  grain(ctx, left, 80, right - left, Math.min(40, bottom - 80), 0.035);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, 99);
  ctx.lineTo(right, 99);
  ctx.stroke();
  ctx.setLineDash([]);
  // Bank und Laterne in der Mitte (dort steht ihr sonst).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  roundRect(ctx, 37.6, 22.8, 26, 5, 1);
  ctx.fill();
  ctx.fillStyle = p.goods;
  ctx.globalAlpha = 0.4;
  roundRect(ctx, 37, 22, 26, 5, 1);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255, 236, 200, 0.08)';
  ctx.beginPath();
  ctx.arc(70, 26, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(70, 26, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 0.4;
  ctx.setLineDash([1.6, 1.4]);
  roundRect(ctx, 25.5, 30.5, 50, 33, 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const h of setup.hides) {
    if (h.id === 'planter') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(h.x + h.w / 2 + 0.6, h.y + h.h / 2 + 0.8, h.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.arc(h.x + h.w / 2, h.y + h.h / 2, h.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.money;
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(h.x + h.w / 2 + Math.cos(a) * 3, h.y + h.h / 2 + Math.sin(a) * 3, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (h.id === 'mailbox') {
      ctx.fillStyle = p.warn;
      ctx.globalAlpha = 0.55;
      roundRect(ctx, h.x, h.y, h.w, h.h, 1);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(h.x + 2, h.y + h.h / 2 - 0.6, h.w - 4, 1.2);
    } else if (h.id === 'bin') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      roundRect(ctx, h.x + 0.6, h.y + 0.8, h.w, h.h, 1.4);
      ctx.fill();
      ctx.fillStyle = p.people;
      ctx.globalAlpha = 0.3;
      roundRect(ctx, h.x, h.y, h.w, h.h, 1.4);
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = p.people;
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(h.x + 1.5, h.y + 3);
      ctx.lineTo(h.x + h.w - 1.5, h.y + 3);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (h.id === 'drain') drainGrate(ctx, h);
  }
  ctx.restore();
}

/** Fertiger Hintergrund in einer eigenen Leinwand (nach jeder Größenänderung neu). */
export function renderBackground(l: StashLayout, p: StashPalette, setup: StashSetup, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = offscreen(l.width, l.height, dpr);
  if (setup.setting === 'warehouse') renderWarehouse(ctx, l, p, setup);
  else renderStreet(ctx, l, p, setup);
  return canvas;
}

/** Symbol eines Pakets, Mitte (0, 0), Größe s. */
function glyph(ctx: CanvasRenderingContext2D, kind: PackageGlyph, s: number): void {
  ctx.beginPath();
  switch (kind) {
    case 'leaf': {
      // Blatt mit fünf Fingern.
      for (const a of [-1.15, -0.55, 0, 0.55, 1.15]) {
        const len = s * (a === 0 ? 1 : Math.abs(a) > 1 ? 0.6 : 0.85);
        const ang = -Math.PI / 2 + a;
        ctx.moveTo(0, s * 0.25);
        ctx.quadraticCurveTo(
          Math.cos(ang - 0.25) * len * 0.6,
          s * 0.25 + Math.sin(ang - 0.25) * len * 0.6,
          Math.cos(ang) * len,
          s * 0.25 + Math.sin(ang) * len,
        );
        ctx.quadraticCurveTo(
          Math.cos(ang + 0.25) * len * 0.6,
          s * 0.25 + Math.sin(ang + 0.25) * len * 0.6,
          0,
          s * 0.25,
        );
      }
      ctx.moveTo(0, s * 0.25);
      ctx.lineTo(0, s * 0.7);
      break;
    }
    case 'brick':
      roundRect(ctx, -s * 0.7, -s * 0.4, s * 1.4, s * 0.8, s * 0.12);
      ctx.moveTo(-s * 0.7, 0);
      ctx.lineTo(s * 0.7, 0);
      break;
    case 'gummy':
      ctx.arc(-s * 0.3, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.moveTo(s * 0.62, -s * 0.15);
      ctx.arc(s * 0.3, -s * 0.15, s * 0.32, 0, Math.PI * 2);
      ctx.moveTo(s * 0.32, s * 0.45);
      ctx.arc(0, s * 0.45, s * 0.32, 0, Math.PI * 2);
      break;
    case 'drop':
      ctx.moveTo(0, -s * 0.75);
      ctx.bezierCurveTo(s * 0.6, -s * 0.1, s * 0.6, s * 0.7, 0, s * 0.7);
      ctx.bezierCurveTo(-s * 0.6, s * 0.7, -s * 0.6, -s * 0.1, 0, -s * 0.75);
      break;
    case 'stick':
      roundRect(ctx, -s * 0.18, -s * 0.75, s * 0.36, s * 1.5, s * 0.14);
      ctx.moveTo(-s * 0.18, -s * 0.35);
      ctx.lineTo(s * 0.18, -s * 0.35);
      break;
    case 'cash':
      roundRect(ctx, -s * 0.8, -s * 0.45, s * 1.6, s * 0.9, s * 0.1);
      ctx.moveTo(s * 0.22, 0);
      ctx.arc(0, 0, s * 0.22, 0, Math.PI * 2);
      break;
    default:
      roundRect(ctx, -s * 0.6, -s * 0.6, s * 1.2, s * 1.2, s * 0.1);
  }
  ctx.stroke();
}

export interface DrawFx {
  t: number;
  /** 0 bis 1: wie nah die Bullen sind (Blaulicht, Sirene). */
  alarm: number;
  /** Stürmen nach Ablauf (Sekunden seit Beginn, −1 = noch nicht). */
  breachT: number;
  /** Alles versteckt (Sekunden seit dem letzten Paket, −1 = noch nicht). */
  clearT: number;
  /** Rahmen um ein Versteck (beim Ziehen bzw. Antippen), passt oder passt nicht. */
  hover: { id: HideId; ok: boolean } | null;
  /** Versteck, das gerade abgelehnt hat (rotes Aufblitzen). */
  reject: { id: HideId; at: number } | null;
  /** Eben verstaut (Aufblitzen im Versteck). */
  stowed: { id: HideId; at: number; wet: boolean } | null;
  reduced: boolean;
  /** Läuft das Spiel (sonst ohne Auswahl-Rahmen). */
  running: boolean;
}

/** Ein Paket an seiner Stelle (Mitte x, y in der Szene). */
function drawPackage(
  ctx: CanvasRenderingContext2D,
  p: StashPalette,
  pkg: StashPackage,
  x: number,
  y: number,
  opts: { lifted: number; selected: boolean; lost: number; scale: number; alpha: number },
): void {
  const look = packageLook(p, pkg.productId);
  const half = PACKAGE_HALF[pkg.size] * opts.scale * (1 + 0.08 * opts.lifted);
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  // Schatten (gehoben weiter weg).
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, x - half + 0.6 + opts.lifted * 1.4, y - half + 0.9 + opts.lifted * 2, half * 2, half * 2, 1.4);
  ctx.fill();
  // Paket: dunkler Grund, darüber die Farbe der Ware, oben ein Lichtrand.
  ctx.fillStyle = p.base;
  roundRect(ctx, x - half, y - half, half * 2, half * 2, 1.4);
  ctx.fill();
  ctx.fillStyle = look.color;
  ctx.globalAlpha = opts.alpha * 0.32;
  ctx.fill();
  ctx.globalAlpha = opts.alpha;
  ctx.strokeStyle = look.color;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  // Klebeband über Kreuz bei großen Paketen.
  if (pkg.size >= 2) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - half, y);
    ctx.lineTo(x + half, y);
    ctx.stroke();
  }
  ctx.strokeStyle = look.color;
  ctx.lineWidth = 0.55;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.translate(x, y);
  glyph(ctx, look.glyph, half * 0.55);
  ctx.translate(-x, -y);
  if (opts.selected) {
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 0.7;
    roundRect(ctx, x - half - 1.3, y - half - 1.3, half * 2 + 2.6, half * 2 + 2.6, 2.2);
    ctx.stroke();
  }
  if (opts.lost > 0) {
    // Gefunden: rot, durchgestrichen.
    ctx.globalAlpha = opts.alpha * Math.min(1, opts.lost);
    ctx.strokeStyle = p.danger;
    ctx.lineWidth = 0.9;
    roundRect(ctx, x - half - 0.6, y - half - 0.6, half * 2 + 1.2, half * 2 + 1.2, 1.8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - half * 0.7, y - half * 0.7);
    ctx.lineTo(x + half * 0.7, y + half * 0.7);
    ctx.moveTo(x + half * 0.7, y - half * 0.7);
    ctx.lineTo(x - half * 0.7, y + half * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** Belegung eines Verstecks als Punkte unter dem Rahmen. */
function drawPips(ctx: CanvasRenderingContext2D, p: StashPalette, hide: StashHide, used: number): void {
  if (hide.capacity >= 99) return;
  const n = hide.capacity;
  const gap = 1.9;
  const x0 = hide.x + hide.w / 2 - ((n - 1) * gap) / 2;
  const y = hide.y + hide.h + 1.8;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y, 0.62, 0, Math.PI * 2);
    ctx.fillStyle = i < used ? p.money : 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
  }
}

/** Streifenwagen von oben mit Lichtbalken (steht draußen, sobald die Straße zu ist). */
function patrolCar(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, t: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, x + 0.8, y + 1.2, 22, 10, 2.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  roundRect(ctx, x, y, 22, 10, 2.4);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, x + 5, y + 1.2, 4, 7.6, 1);
  ctx.fill();
  roundRect(ctx, x + 14, y + 1.2, 3.4, 7.6, 1);
  ctx.fill();
  const on = Math.sin(t * 12) > 0;
  ctx.fillStyle = on ? p.place : p.danger;
  ctx.fillRect(x + 10, y + 1.5, 2.8, 3.2);
  ctx.fillStyle = on ? p.danger : p.place;
  ctx.fillRect(x + 10, y + 5.3, 2.8, 3.2);
}

/** Ein Bild: Hintergrund, Verstecke mit Belegung, Pakete, Blaulicht, Stürmen. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  l: StashLayout,
  p: StashPalette,
  setup: StashSetup,
  state: StashState,
  bg: HTMLCanvasElement,
  fx: DrawFx,
): void {
  ctx.save();
  ctx.clearRect(0, 0, l.width, l.height);
  ctx.drawImage(bg, 0, 0, l.width, l.height);
  ctx.save();
  toScene(ctx, l);
  const closed = streetClosed(setup, state);
  const flick = fx.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(fx.t * 9);
  // Blaulicht an den Fenstern, je näher die Bullen, desto stärker.
  if (setup.setting === 'warehouse' && fx.alarm > 0.05) {
    for (const [i, [x, y, w, h]] of WINDOWS.entries()) {
      const blue = (i % 2 === 0) === flick > 0.5;
      ctx.fillStyle = blue ? p.place : p.danger;
      ctx.globalAlpha = Math.min(0.9, fx.alarm * (0.4 + 0.6 * (blue ? flick : 1 - flick)));
      ctx.fillRect(x - 0.6, y - 0.6, w + 1.2, h + 1.2);
    }
    ctx.globalAlpha = 1;
  }
  // Verstecke: Belegung, Rahmen beim Ziehen, Aufblitzen.
  for (const h of setup.hides) {
    const used = usedIn(state, h.id);
    drawPips(ctx, p, h, used);
    const blocked = h.outside && closed;
    if (blocked) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      roundRect(ctx, h.x - 1, h.y - 1, h.w + 2, h.h + 2, 1.4);
      ctx.fill();
      ctx.strokeStyle = p.danger;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(h.x + 2, h.y + 2);
      ctx.lineTo(h.x + h.w - 2, h.y + h.h - 2);
      ctx.moveTo(h.x + h.w - 2, h.y + 2);
      ctx.lineTo(h.x + 2, h.y + h.h - 2);
      ctx.stroke();
    }
    if (fx.running && fx.hover?.id === h.id) {
      ctx.strokeStyle = fx.hover.ok ? p.gold : p.danger;
      ctx.lineWidth = 0.8;
      ctx.setLineDash(fx.hover.ok ? [] : [1.4, 1.2]);
      roundRect(ctx, h.x - 1.6, h.y - 1.6, h.w + 3.2, h.h + 3.2, 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (fx.reject?.id === h.id && fx.t - fx.reject.at < 0.5) {
      ctx.fillStyle = p.danger;
      ctx.globalAlpha = 0.35 * (1 - (fx.t - fx.reject.at) / 0.5);
      roundRect(ctx, h.x - 1, h.y - 1, h.w + 2, h.h + 2, 1.6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (fx.stowed?.id === h.id && fx.t - fx.stowed.at < 0.6) {
      const k = (fx.t - fx.stowed.at) / 0.6;
      ctx.strokeStyle = fx.stowed.wet ? p.sky : p.money;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 0.8;
      roundRect(ctx, h.x - 1 - k * 3, h.y - 1 - k * 3, h.w + 2 + k * 6, h.h + 2 + k * 6, 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // Pakete: liegen gebliebene, dann das getragene obenauf.
  const c = state.carry;
  for (const pkg of setup.packages) {
    const item = state.items[pkg.id];
    if (item.hide !== null || c?.id === pkg.id) continue;
    const lost = fx.breachT >= 0 ? Math.max(0, (fx.breachT - 0.35) * 3) : 0;
    drawPackage(ctx, p, pkg, item.x, item.y, {
      lifted: 0,
      selected: fx.running && !state.done && state.selected === pkg.id && !c,
      lost,
      scale: 1,
      alpha: 1,
    });
  }
  if (c) {
    const pkg = setup.packages[c.id];
    const item = state.items[c.id];
    const hide = c.target ? setup.hides.find((h) => h.id === c.target) : undefined;
    const stowK = c.stowing >= 0 && hide ? 1 - Math.max(0, c.stowing) / hide.stow : 0;
    drawPackage(ctx, p, pkg, item.x, item.y, {
      lifted: c.stowing >= 0 ? 1 - stowK : 1,
      selected: false,
      lost: 0,
      scale: 1 - 0.55 * stowK,
      alpha: 1 - 0.7 * stowK,
    });
    if (c.stowing >= 0 && hide) {
      // Fortschritt beim Verstauen als Ring.
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(item.x, item.y, PACKAGE_HALF[pkg.size] + 2, -Math.PI / 2, -Math.PI / 2 + stowK * Math.PI * 2);
      ctx.stroke();
    }
  }
  // Streife draußen: im Lager steht sie vor dem Tor, sobald die Straße zu ist; am Spot rollt sie in den letzten
  // Sekunden von rechts heran.
  if (setup.setting === 'warehouse' && (closed || fx.breachT >= 0)) {
    const slide = fx.reduced ? 1 : Math.min(1, (state.time - (setup.closeAt ?? 0)) / 0.8);
    patrolCar(ctx, p, 20 + 10 * (1 - Math.max(0, slide)), 85, fx.t);
  } else if (setup.setting === 'street') {
    const arrive = setup.duration - state.time;
    if (arrive < 5 || fx.breachT >= 0) {
      const slide = fx.reduced || fx.breachT >= 0 ? 1 : Math.min(1, (5 - arrive) / 1.2);
      patrolCar(ctx, p, 108 - 34 * slide, 84, fx.t);
    }
  }
  // Stürmen: Taschenlampen aus dem Eingang, die über den Boden fahren.
  if (fx.breachT >= 0) {
    const k = Math.min(1, fx.breachT / 0.4);
    for (let i = 0; i < 3; i++) {
      const sweep = Math.sin(fx.t * (fx.reduced ? 0.6 : 1.6) + i * 2.1) * 0.6;
      const ang = -Math.PI / 2 + (i - 1) * 0.55 + sweep;
      const len = 70 * k;
      const ex = setup.entry.x + Math.cos(ang) * len;
      const ey = setup.entry.y + Math.sin(ang) * len;
      const cone = ctx.createLinearGradient(setup.entry.x, setup.entry.y, ex, ey);
      cone.addColorStop(0, 'rgba(255, 250, 230, 0.35)');
      cone.addColorStop(1, 'rgba(255, 250, 230, 0)');
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(setup.entry.x, setup.entry.y);
      ctx.lineTo(ex + Math.cos(ang + Math.PI / 2) * 12, ey + Math.sin(ang + Math.PI / 2) * 12);
      ctx.lineTo(ex - Math.cos(ang + Math.PI / 2) * 12, ey - Math.sin(ang + Math.PI / 2) * 12);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  // Rand der Bühne pulsiert blau/rot, je näher die Bullen.
  if (fx.alarm > 0.05 || fx.breachT >= 0) {
    const a = fx.breachT >= 0 ? 0.5 : fx.alarm * 0.42;
    const edge = ctx.createRadialGradient(
      l.width / 2,
      l.height / 2,
      Math.min(l.width, l.height) * 0.35,
      l.width / 2,
      l.height / 2,
      Math.max(l.width, l.height) * 0.75,
    );
    edge.addColorStop(0, 'rgba(0, 0, 0, 0)');
    edge.addColorStop(1, flick > 0.5 ? p.place : p.danger);
    ctx.globalAlpha = a * (fx.reduced ? 0.6 : 0.5 + 0.5 * Math.abs(Math.sin(fx.t * 4.5)));
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.globalAlpha = 1;
  }
  // Weißer Blitz beim Reinstürmen, grüner Schein, wenn alles weg ist.
  if (fx.breachT >= 0 && fx.breachT < 0.35) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - fx.breachT / 0.35)})`;
    ctx.fillRect(0, 0, l.width, l.height);
  }
  if (fx.clearT >= 0 && fx.clearT < 0.8) {
    ctx.fillStyle = p.money;
    ctx.globalAlpha = 0.22 * (1 - fx.clearT / 0.8);
    ctx.fillRect(0, 0, l.width, l.height);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Bildschirm-Punkt (CSS-Pixel relativ zur Bühne) in Szenen-Einheiten. */
export function toScenePoint(l: StashLayout, x: number, y: number): { x: number; y: number } {
  return { x: (x - l.ox) / l.scale, y: (y - l.oy) / l.scale };
}

/** Mitte eines Verstecks in CSS-Pixeln (für Beschriftungen über der Leinwand). */
export function hideScreen(l: StashLayout, h: StashHide): { x: number; y: number; w: number; h: number } {
  return { x: l.ox + h.x * l.scale, y: l.oy + h.y * l.scale, w: h.w * l.scale, h: h.h * l.scale };
}
