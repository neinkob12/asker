// Zeichnen für den Razzia-Countdown: Draufsicht auf das Lager (Halle mit Regalen, Tor, Straße mit Lieferwagen und
// Gully) bzw. die Straße am Spot (Hauswand, Bank, Blumenkübel, Briefkasten, Mülltonne). Der Hintergrund liegt nach
// jeder Größenänderung fertig in einer eigenen Leinwand; pro Bild kommen Pakete, Rahmen, Blaulicht und Effekte dazu.
// Farben aus den Design-Tokens (mapToken), keine freien Farben außer Schwarz/Weiß mit Deckkraft.

import { mapToken } from '../../../../../map';
import { drawGoodsGlyph, packageLook } from '../../kit/goods';
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

/** Farben der Kulisse (Inhalt wie Haut- und Haarfarben in Face.tsx): Beton, Holz, Stahl, Lack. */
const CONCRETE = '#3a3d44';
const CONCRETE_LIGHT = '#464a52';
const WOOD = '#8a6a44';
const WOOD_DARK = '#5e4528';
const STEEL = '#5f6672';
const STEEL_LIGHT = '#8a929e';
const PAVING = '#4b4d53';
const PAVING_LINE = 'rgba(255,255,255,0.07)';
const ASPHALT = '#2b2d33';
const CRATE_COLORS = ['#8c6d4a', '#6b7c8f', '#7a5d7e', '#6f7a55', '#9a7a4a'];

/** Kiste von oben: Holz mit Deckelbrettern und Beschlag. */
function crate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + 0.4, y + 0.6, w, h, 0.5);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 0.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.25;
  ctx.stroke();
  // Bretter.
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  for (let i = 1; i < 3; i++) {
    const yy = y + (i * h) / 3;
    ctx.beginPath();
    ctx.moveTo(x + 0.3, yy);
    ctx.lineTo(x + w - 0.3, yy);
    ctx.stroke();
  }
  // Lichtkante.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(x + 0.4, y + 0.35);
  ctx.lineTo(x + w - 0.4, y + 0.35);
  ctx.stroke();
}

/** Palette (Holz) unter einem Paket. */
function pallet(ctx: CanvasRenderingContext2D, x: number, y: number, half: number): void {
  const w = half * 2 + 2.4;
  const x0 = x - w / 2;
  const y0 = y - w / 2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x0 + 0.5, y0 + 0.7, w, w);
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(x0, y0, w, w);
  ctx.fillStyle = WOOD;
  const boards = 5;
  for (let i = 0; i < boards; i++) {
    const bw = w / boards;
    ctx.fillRect(x0 + i * bw + 0.25, y0, bw - 0.5, w);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x0, y0 + w * 0.3, w, 0.6);
  ctx.fillRect(x0, y0 + w * 0.7, w, 0.6);
}

/** Regal von oben: Stahlrahmen mit Kisten, Säcken und Lücken. */
function shelf(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  roundRect(ctx, x + 0.7, y + 1, w, h, 0.8);
  ctx.fill();
  ctx.fillStyle = STEEL;
  roundRect(ctx, x, y, w, h, 0.8);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x + 0.9, y + 0.9, w - 1.8, h - 1.8, 0.5);
  ctx.fill();
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = 0.35;
  roundRect(ctx, x, y, w, h, 0.8);
  ctx.stroke();
  const horizontal = w > h;
  const n = Math.max(1, Math.floor((horizontal ? w : h) / 6));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cs = Math.min(horizontal ? h : w, 5.4) - 1.8;
    const cx = horizontal ? x + t * w - cs / 2 : x + (w - cs) / 2;
    const cy = horizontal ? y + (h - cs) / 2 : y + t * h - cs / 2;
    const kind = (i * 7 + 3) % 6;
    if (kind === 0) continue;
    if (kind === 4) {
      // Sack.
      ctx.fillStyle = p.goods;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(cx + cs / 2, cy + cs / 2, cs * 0.55, cs * 0.42, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }
    crate(ctx, cx, cy, cs, cs, CRATE_COLORS[(i + Math.round(x)) % CRATE_COLORS.length]);
  }
  // Querstreben.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.3;
  const steps = Math.max(1, Math.floor((horizontal ? w : h) / 6));
  for (let i = 1; i < steps; i++) {
    ctx.beginPath();
    if (horizontal) {
      const sx = x + (i * w) / steps;
      ctx.moveTo(sx, y);
      ctx.lineTo(sx, y + h);
    } else {
      const sy = y + (i * h) / steps;
      ctx.moveTo(x, sy);
      ctx.lineTo(x + w, sy);
    }
    ctx.stroke();
  }
}

/** Gully: Gusseisen-Rost mit Stäben und Rahmen, nass glänzend. */
function drainGrate(ctx: CanvasRenderingContext2D, h: StashHide): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, h.x - 0.6, h.y - 0.6, h.w + 1.2, h.h + 1.2, 1.2);
  ctx.fill();
  ctx.fillStyle = '#1b1c20';
  roundRect(ctx, h.x, h.y, h.w, h.h, 1);
  ctx.fill();
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = STEEL;
  for (let i = 1; i < 6; i++) {
    const x = h.x + (i * h.w) / 6;
    ctx.beginPath();
    ctx.moveTo(x, h.y + 1.2);
    ctx.lineTo(x, h.y + h.h - 1.2);
    ctx.stroke();
  }
  // Nasser Glanz.
  ctx.fillStyle = 'rgba(160,190,230,0.12)';
  ctx.beginPath();
  ctx.ellipse(h.x + h.w * 0.35, h.y + h.h * 0.3, h.w * 0.25, h.h * 0.15, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

/** Tresor von oben: Stahlkasten mit Zahlenrad, Griff und Scharnieren. */
function vaultBox(ctx: CanvasRenderingContext2D, p: StashPalette, h: StashHide): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, h.x + 1, h.y + 1.3, h.w, h.h, 1.4);
  ctx.fill();
  const g = ctx.createLinearGradient(h.x, h.y, h.x + h.w, h.y + h.h);
  g.addColorStop(0, '#7b838f');
  g.addColorStop(0.5, '#4e5560');
  g.addColorStop(1, '#353a43');
  ctx.fillStyle = g;
  roundRect(ctx, h.x, h.y, h.w, h.h, 1.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  // Tür mit Fuge.
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.4;
  roundRect(ctx, h.x + 1.6, h.y + 1.6, h.w - 3.2, h.h - 3.2, 0.8);
  ctx.stroke();
  // Scharniere links.
  ctx.fillStyle = STEEL_LIGHT;
  ctx.fillRect(h.x + 0.6, h.y + 2.5, 1.2, 2.6);
  ctx.fillRect(h.x + 0.6, h.y + h.h - 5.1, 1.2, 2.6);
  // Zahlenrad.
  const cx = h.x + h.w * 0.6;
  const cy = h.y + h.h / 2;
  const r = Math.min(h.w, h.h) * 0.22;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1f2228';
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 0.3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
    ctx.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
    ctx.stroke();
  }
  // Griff.
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(h.x + h.w * 0.2, cy - 2.2);
  ctx.lineTo(h.x + h.w * 0.2, cy + 2.2);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/** Doppelter Boden: Dielen mit Fugen, Zugring und einer leicht offenen Ecke. */
function floorHatch(ctx: CanvasRenderingContext2D, p: StashPalette, h: StashHide): void {
  ctx.fillStyle = WOOD_DARK;
  roundRect(ctx, h.x, h.y, h.w, h.h, 0.6);
  ctx.fill();
  const boards = 4;
  for (let i = 0; i < boards; i++) {
    ctx.fillStyle = i % 2 === 0 ? WOOD : '#7d5f3c';
    ctx.fillRect(h.x + 0.3, h.y + (i * h.h) / boards + 0.3, h.w - 0.6, h.h / boards - 0.6);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.35;
  roundRect(ctx, h.x, h.y, h.w, h.h, 0.6);
  ctx.stroke();
  // Offene Ecke: dunkler Spalt.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(h.x + h.w - 3.6, h.y + 0.3, 0.7, h.h - 0.6);
  // Zugring.
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(h.x + h.w - 2.2, h.y + h.h / 2, 1, 0, Math.PI * 2);
  ctx.stroke();
}

/** Lüftungsschacht: Gitter mit Lamellen in der Wand, Schrauben in den Ecken. */
function ventGrille(ctx: CanvasRenderingContext2D, h: StashHide): void {
  ctx.fillStyle = '#15171c';
  roundRect(ctx, h.x, h.y, h.w, h.h, 0.6);
  ctx.fill();
  ctx.strokeStyle = STEEL_LIGHT;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.strokeStyle = STEEL;
  ctx.lineWidth = 0.7;
  for (let i = 1; i < 8; i++) {
    const x = h.x + (i * h.w) / 8;
    ctx.beginPath();
    ctx.moveTo(x - 0.8, h.y + 1.2);
    ctx.lineTo(x + 0.8, h.y + h.h - 1.2);
    ctx.stroke();
  }
  ctx.fillStyle = STEEL_LIGHT;
  for (const [sx, sy] of [
    [h.x + 0.8, h.y + 0.8],
    [h.x + h.w - 0.8, h.y + 0.8],
    [h.x + 0.8, h.y + h.h - 0.8],
    [h.x + h.w - 0.8, h.y + h.h - 0.8],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Lieferwagen von oben, Heck links (dort der Kofferraum, Türen offen). */
function van(ctx: CanvasRenderingContext2D, p: StashPalette, x: number, y: number, w: number, h: number): void {
  // Räder.
  ctx.fillStyle = '#121317';
  for (const wx of [x + 6, x + w - 9]) {
    roundRect(ctx, wx, y - 0.9, 4.2, 1.6, 0.5);
    ctx.fill();
    roundRect(ctx, wx, y + h - 0.7, 4.2, 1.6, 0.5);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, x + 1, y + 1.4, w, h, 2.4);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#e8e9ea');
  g.addColorStop(0.5, '#d4d6d9');
  g.addColorStop(1, '#b9bcc1');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, 2.4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.3;
  ctx.stroke();
  // Windschutzscheibe vorn (rechts), Motorhaube, Dach mit Rippen.
  ctx.fillStyle = '#20303f';
  roundRect(ctx, x + w - 8, y + 1.6, 4.2, h - 3.2, 1.2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  roundRect(ctx, x + w - 7.4, y + 2.2, 1.2, h - 4.4, 0.5);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.fillRect(x + w - 3.4, y + 1, 2.6, h - 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 5; i++) {
    const rx = x + 14 + i * 3.4;
    ctx.beginPath();
    ctx.moveTo(rx, y + 2);
    ctx.lineTo(rx, y + h - 2);
    ctx.stroke();
  }
  // Zierstreifen.
  ctx.fillStyle = p.gold;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x + 13, y + 0.7, w - 22, 0.6);
  ctx.fillRect(x + 13, y + h - 1.3, w - 22, 0.6);
  ctx.globalAlpha = 1;
  // Spiegel.
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(x + w - 8.6, y - 1.1, 1.8, 1.3);
  ctx.fillRect(x + w - 8.6, y + h - 0.2, 1.8, 1.3);
  // Laderaum mit offenen Hecktüren (Innenraum dunkel, Matte).
  ctx.fillStyle = '#1b1d22';
  roundRect(ctx, x + 0.8, y + 1.6, 12.4, h - 3.2, 1);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 2, y + 2.6, 10, h - 5.2);
  ctx.fillStyle = '#c9ccd1';
  ctx.fillRect(x - 3.6, y + 0.2, 3.8, 1.2);
  ctx.fillRect(x - 3.6, y + h - 1.4, 3.8, 1.2);
  // Warnblinker.
  ctx.fillStyle = p.warn;
  ctx.fillRect(x + w - 1.4, y + 1.6, 1, 2.4);
  ctx.fillRect(x + w - 1.4, y + h - 4, 1, 2.4);
  ctx.fillStyle = p.danger;
  ctx.fillRect(x + 0.2, y + 1.2, 0.9, 2.2);
  ctx.fillRect(x + 0.2, y + h - 3.4, 0.9, 2.2);
}

/** Hintergrund des Lagers (Szene plus Umgebung bis zum Rand der Bühne). */
function renderWarehouse(ctx: CanvasRenderingContext2D, l: StashLayout, p: StashPalette, setup: StashSetup): void {
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.save();
  toScene(ctx, l);
  const left = -l.ox / l.scale;
  const right = (l.width - l.ox) / l.scale;
  const top = -l.oy / l.scale;
  const bottom = (l.height - l.oy) / l.scale;
  // Dächer der Nachbarhäuser links, rechts und oben: Ziegelbahnen, Dachrinne zur Straße.
  ctx.fillStyle = '#2f2a2a';
  ctx.fillRect(left, top, right - left, 68 - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.3;
  for (let yy = Math.floor(top / 2.6) * 2.6; yy < 68; yy += 2.6) {
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let xx = Math.floor(left / 9) * 9; xx < right; xx += 9) ctx.fillRect(xx, top, 4.5, 68 - top);
  ctx.fillStyle = STEEL;
  ctx.fillRect(left, 66.6, right - left, 1.4);
  // Gehweg mit Platten und Bordstein.
  ctx.fillStyle = PAVING;
  ctx.fillRect(left, 68, right - left, 6);
  ctx.strokeStyle = PAVING_LINE;
  ctx.lineWidth = 0.3;
  for (let xx = Math.floor(left / 4) * 4; xx < right; xx += 4) {
    ctx.beginPath();
    ctx.moveTo(xx, 68);
    ctx.lineTo(xx, 74);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(left, 71);
  ctx.lineTo(right, 71);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(left, 73.6, right - left, 0.6);
  // Fahrbahn mit Körnung, Mittellinie, Laternenlicht.
  grain(ctx, left, 74, right - left, Math.max(0, bottom - 74), 0.04);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, 97);
  ctx.lineTo(right, 97);
  ctx.stroke();
  ctx.setLineDash([]);
  const lamp = ctx.createRadialGradient(100, 76, 1, 100, 76, 36);
  lamp.addColorStop(0, 'rgba(255, 214, 150, 0.22)');
  lamp.addColorStop(1, 'rgba(255, 214, 150, 0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(60, 60, 80, 50);
  // Halle: Betonboden mit Dehnungsfugen, Ölflecken, Deckenlampen als Lichtpfützen.
  ctx.fillStyle = CONCRETE;
  ctx.fillRect(3, 3, 94, 64);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.lineWidth = 0.35;
  for (let xx = 13; xx < 97; xx += 10) {
    ctx.beginPath();
    ctx.moveTo(xx, 3);
    ctx.lineTo(xx, 67);
    ctx.stroke();
  }
  for (let yy = 13; yy < 67; yy += 10) {
    ctx.beginPath();
    ctx.moveTo(3, yy);
    ctx.lineTo(97, yy);
    ctx.stroke();
  }
  grain(ctx, 3, 3, 94, 64, 0.035);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (const [ox, oy, rx, ry] of [
    [40, 60, 6, 2.6],
    [78, 24, 4, 2],
    [20, 50, 3, 1.6],
  ]) {
    ctx.beginPath();
    ctx.ellipse(ox, oy, rx, ry, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [lx, ly] of [
    [30, 22],
    [66, 22],
    [48, 50],
  ]) {
    const light = ctx.createRadialGradient(lx, ly, 2, lx, ly, 30);
    light.addColorStop(0, 'rgba(255, 236, 200, 0.14)');
    light.addColorStop(1, 'rgba(255, 236, 200, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(3, 3, 94, 64);
  }
  // Gelbe Bodenmarkierung um den Warenbereich, Warnstreifen vor dem Tor.
  ctx.strokeStyle = p.warn;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2.2, 1.4]);
  roundRect(ctx, 24.5, 15.5, 47, 47, 1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (let xx = 32; xx < 52; xx += 2.4) {
    ctx.fillStyle = (xx / 2.4) % 2 < 1 ? p.warn : '#1a1b1f';
    ctx.globalAlpha = 0.45;
    ctx.fillRect(xx, 62.6, 2.4, 1.2);
  }
  ctx.globalAlpha = 1;
  // Paletten unter den Startplätzen der Pakete.
  for (const pkg of setup.packages) pallet(ctx, pkg.x, pkg.y, PACKAGE_HALF[pkg.size]);
  // Regale an den Wänden, Werkbank mit Werkzeug.
  shelf(ctx, p, 5, 26, 8, 36);
  shelf(ctx, p, 27, 5, 40, 7);
  shelf(ctx, p, 87, 53, 8, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, 88.6, 20.8, 7, 14, 0.6);
  ctx.fill();
  ctx.fillStyle = WOOD;
  roundRect(ctx, 88, 20, 7, 14, 0.6);
  ctx.fill();
  ctx.fillStyle = STEEL_LIGHT;
  ctx.fillRect(89, 22, 2.2, 0.6);
  ctx.fillRect(89, 24, 3.4, 0.6);
  ctx.fillRect(91.6, 27, 1.4, 4);
  // Wände mit Tor unten.
  const gate = { x0: 32, x1: 52 };
  ctx.strokeStyle = '#8c929c';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(gate.x0, 67);
  ctx.lineTo(3, 67);
  ctx.lineTo(3, 3);
  ctx.lineTo(97, 3);
  ctx.lineTo(97, 67);
  ctx.lineTo(gate.x1, 67);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(gate.x0, 66.2);
  ctx.lineTo(3.8, 66.2);
  ctx.lineTo(3.8, 3.8);
  ctx.lineTo(96.2, 3.8);
  ctx.lineTo(96.2, 66.2);
  ctx.lineTo(gate.x1, 66.2);
  ctx.stroke();
  // Rolltor (halb offen, Lamellen).
  ctx.fillStyle = STEEL;
  ctx.fillRect(gate.x0, 65.4, gate.x1 - gate.x0, 2.4);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.25;
  for (let yy = 65.8; yy < 67.8; yy += 0.6) {
    ctx.beginPath();
    ctx.moveTo(gate.x0, yy);
    ctx.lineTo(gate.x1, yy);
    ctx.stroke();
  }
  // Fenster (für das Blaulicht): oben und links.
  ctx.fillStyle = '#0d1420';
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

/** Hintergrund am Spot: Hausfassade oben mit Läden, Gehweg mit Bank und Laterne, Fahrbahn unten. */
function renderStreet(ctx: CanvasRenderingContext2D, l: StashLayout, p: StashPalette, setup: StashSetup): void {
  ctx.fillStyle = ASPHALT;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.save();
  toScene(ctx, l);
  const left = -l.ox / l.scale;
  const right = (l.width - l.ox) / l.scale;
  const top = -l.oy / l.scale;
  const bottom = (l.height - l.oy) / l.scale;
  // Häuser oben: Dach, Fassadenkante mit Schaufenstern und Markisen.
  ctx.fillStyle = '#2f2a2a';
  ctx.fillRect(left, top, right - left, 8 - top);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.3;
  for (let yy = Math.floor(top / 2.4) * 2.4; yy < 6; yy += 2.4) {
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
  }
  ctx.fillStyle = '#4d4038';
  ctx.fillRect(left, 5.4, right - left, 3.6);
  // Schaufenster warm erleuchtet, Markisen gestreift, Hauseingänge dunkel.
  for (const sx of [8, 40, 74]) {
    ctx.fillStyle = 'rgba(255, 214, 150, 0.55)';
    ctx.fillRect(sx, 5.8, 12, 3);
    ctx.fillStyle = (sx / 8) % 2 < 1 ? p.danger : p.place;
    ctx.globalAlpha = 0.55;
    for (let k = 0; k < 6; k++) ctx.fillRect(sx - 1 + k * 2.4, 8.6, 1.2, 1.6);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#15161a';
  ctx.fillRect(24, 5.6, 8, 3.4);
  ctx.fillRect(58, 5.6, 8, 3.4);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(left, 9, right - left, 0.6);
  // Gehweg mit Platten (versetzt) und Bordstein.
  ctx.fillStyle = PAVING;
  ctx.fillRect(left, 9.6, right - left, 69.4);
  ctx.strokeStyle = PAVING_LINE;
  ctx.lineWidth = 0.3;
  for (let yy = 17; yy < 79; yy += 8) {
    ctx.beginPath();
    ctx.moveTo(left, yy);
    ctx.lineTo(right, yy);
    ctx.stroke();
    const shift = ((yy - 17) / 8) % 2 === 0 ? 0 : 4;
    for (let xx = Math.floor(left / 8) * 8 + shift; xx < right; xx += 8) {
      ctx.beginPath();
      ctx.moveTo(xx, yy - 8);
      ctx.lineTo(xx, yy);
      ctx.stroke();
    }
  }
  grain(ctx, left, 9.6, right - left, 69.4, 0.025);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fillRect(left, 79, right - left, 0.8);
  // Fahrbahn mit Körnung, Mittellinie, parkendes Auto rechts.
  grain(ctx, left, 80, right - left, Math.max(0, bottom - 80), 0.04);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 0.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(left, 99);
  ctx.lineTo(right, 99);
  ctx.stroke();
  ctx.setLineDash([]);
  parkedCar(ctx, 104, 82, 22, 10);
  // Laterne mit Lichtpfütze, Bank mit Latten, Fahrrad am Laternenmast.
  const lamp = ctx.createRadialGradient(70, 26, 1, 70, 26, 26);
  lamp.addColorStop(0, 'rgba(255, 236, 200, 0.22)');
  lamp.addColorStop(1, 'rgba(255, 236, 200, 0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(40, 0, 60, 56);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  roundRect(ctx, 37.8, 23, 26, 5, 1);
  ctx.fill();
  ctx.fillStyle = WOOD;
  roundRect(ctx, 37, 22, 26, 5, 1);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.3;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(37.4, 22 + (k * 5) / 4);
    ctx.lineTo(62.6, 22 + (k * 5) / 4);
    ctx.stroke();
  }
  ctx.fillStyle = STEEL;
  ctx.fillRect(38, 21.2, 1.2, 6.6);
  ctx.fillRect(60.8, 21.2, 1.2, 6.6);
  ctx.fillStyle = '#23252a';
  ctx.beginPath();
  ctx.arc(70, 26, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 236, 200, 0.9)';
  ctx.beginPath();
  ctx.arc(70, 26, 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#23252a';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(74.5, 29, 2, 0, Math.PI * 2);
  ctx.arc(78.5, 29, 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(74.5, 29);
  ctx.lineTo(78.5, 29);
  ctx.stroke();
  // Bereich, in dem die Pakete liegen (dezent).
  ctx.strokeStyle = p.gold;
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 0.4;
  ctx.setLineDash([1.6, 1.4]);
  roundRect(ctx, 25.5, 30.5, 50, 33, 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  for (const h of setup.hides) {
    if (h.id === 'planter') {
      // Blumenkübel aus Beton mit Erde und Blüten.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      ctx.arc(h.x + h.w / 2 + 0.6, h.y + h.h / 2 + 0.8, h.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CONCRETE_LIGHT;
      ctx.beginPath();
      ctx.arc(h.x + h.w / 2, h.y + h.h / 2, h.w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3a2d22';
      ctx.beginPath();
      ctx.arc(h.x + h.w / 2, h.y + h.h / 2, h.w / 2 - 1.6, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const rr = i % 3 === 0 ? 1.6 : 3.6;
        ctx.fillStyle = '#4d7a3a';
        ctx.beginPath();
        ctx.arc(h.x + h.w / 2 + Math.cos(a) * rr, h.y + h.h / 2 + Math.sin(a) * rr, 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = i % 2 === 0 ? p.danger : p.warn;
        ctx.beginPath();
        ctx.arc(h.x + h.w / 2 + Math.cos(a) * rr, h.y + h.h / 2 + Math.sin(a) * rr, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (h.id === 'mailbox') {
      // Gelber Briefkasten mit Schlitz und Posthorn-Plakette.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      roundRect(ctx, h.x + 0.6, h.y + 0.8, h.w, h.h, 1.2);
      ctx.fill();
      ctx.fillStyle = '#e3b618';
      roundRect(ctx, h.x, h.y, h.w, h.h, 1.2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(ctx, h.x + 0.6, h.y + 0.6, h.w - 1.2, h.h * 0.35, 0.8);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(h.x + 2, h.y + h.h / 2 - 0.6, h.w - 4, 1.2);
      ctx.fillStyle = '#1c1c20';
      ctx.beginPath();
      ctx.arc(h.x + h.w - 2.4, h.y + h.h - 2.2, 0.9, 0, Math.PI * 2);
      ctx.fill();
    } else if (h.id === 'bin') {
      // Mülltonne mit Deckel, Griff und Rädern.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      roundRect(ctx, h.x + 0.6, h.y + 0.8, h.w, h.h, 1.6);
      ctx.fill();
      ctx.fillStyle = '#2f5f4a';
      roundRect(ctx, h.x, h.y, h.w, h.h, 1.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      roundRect(ctx, h.x + 0.8, h.y + 0.8, h.w - 1.6, h.h - 1.6, 1.2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(h.x + 1.2, h.y + 3.2);
      ctx.lineTo(h.x + h.w - 1.2, h.y + 3.2);
      ctx.stroke();
      ctx.fillStyle = '#15161a';
      ctx.fillRect(h.x + 1.6, h.y - 1, 2.4, 1.4);
      ctx.fillRect(h.x + h.w - 4, h.y - 1, 2.4, 1.4);
      ctx.fillStyle = STEEL_LIGHT;
      ctx.fillRect(h.x + h.w / 2 - 2.5, h.y + 1.2, 5, 0.7);
    } else if (h.id === 'drain') drainGrate(ctx, h);
  }
  ctx.restore();
}

/** Parkendes Auto von oben (dunkler Lack). */
function parkedCar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x + 0.8, y + 1, w, h, 2.6);
  ctx.fill();
  ctx.fillStyle = '#3c3f4a';
  roundRect(ctx, x, y, w, h, 2.6);
  ctx.fill();
  ctx.fillStyle = '#1d2a3a';
  roundRect(ctx, x + 5, y + 1.3, 4, h - 2.6, 1);
  ctx.fill();
  roundRect(ctx, x + w - 8, y + 1.3, 3.2, h - 2.6, 1);
  ctx.fill();
  ctx.fillStyle = '#4a4e5a';
  roundRect(ctx, x + 9.6, y + 1, w - 18, h - 2, 1.4);
  ctx.fill();
}

/** Fertiger Hintergrund in einer eigenen Leinwand (nach jeder Größenänderung neu). */
export function renderBackground(l: StashLayout, p: StashPalette, setup: StashSetup, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = offscreen(l.width, l.height, dpr);
  if (setup.setting === 'warehouse') renderWarehouse(ctx, l, p, setup);
  else renderStreet(ctx, l, p, setup);
  return canvas;
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

/** Ein Paket an seiner Stelle (Mitte x, y in der Szene): Karton in Warenfarbe, Klebeband, Etikett, Symbol. */
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
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, x - half + 0.6 + opts.lifted * 1.6, y - half + 1 + opts.lifted * 2.2, half * 2, half * 2, 1.2);
  ctx.fill();
  // Karton: Grundfarbe aus der Ware, abgedunkelt, mit Lichtkante oben links.
  ctx.fillStyle = '#1a1b20';
  roundRect(ctx, x - half, y - half, half * 2, half * 2, 1.2);
  ctx.fill();
  ctx.fillStyle = look.color;
  ctx.globalAlpha = opts.alpha * 0.42;
  ctx.fill();
  ctx.globalAlpha = opts.alpha;
  const sheen = ctx.createLinearGradient(x - half, y - half, x + half, y + half);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sheen;
  ctx.fill();
  ctx.strokeStyle = look.color;
  ctx.lineWidth = 0.55;
  ctx.stroke();
  // Klebeband über Kreuz (groß) bzw. einmal quer (mittel).
  ctx.fillStyle = 'rgba(255, 245, 220, 0.22)';
  ctx.fillRect(x - half, y - 0.9, half * 2, 1.8);
  if (pkg.size >= 3) ctx.fillRect(x - 0.9, y - half, 1.8, half * 2);
  // Etikett unten rechts.
  ctx.fillStyle = 'rgba(245, 242, 232, 0.85)';
  ctx.fillRect(x + half * 0.2, y + half * 0.42, half * 0.65, half * 0.36);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x + half * 0.28, y + half * 0.52, half * 0.45, 0.25);
  ctx.fillRect(x + half * 0.28, y + half * 0.64, half * 0.3, 0.25);
  // Symbol der Ware.
  ctx.strokeStyle = look.color;
  ctx.lineWidth = 0.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.translate(x - half * 0.1, y - half * 0.12);
  drawGoodsGlyph(ctx, look.glyph, half * 0.58);
  ctx.translate(-(x - half * 0.1), -(y - half * 0.12));
  if (opts.selected) {
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 0.8;
    roundRect(ctx, x - half - 1.4, y - half - 1.4, half * 2 + 2.8, half * 2 + 2.8, 2.2);
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
  ctx.fillStyle = '#2458c9';
  ctx.fillRect(x, y + 4.2, 22, 1.6);
  ctx.fillStyle = on ? p.place : p.danger;
  ctx.fillRect(x + 10, y + 1.5, 2.8, 3.2);
  ctx.fillStyle = on ? p.danger : p.place;
  ctx.fillRect(x + 10, y + 5.3, 2.8, 3.2);
  const glow = ctx.createRadialGradient(x + 11.4, y + 5, 1, x + 11.4, y + 5, 14);
  glow.addColorStop(0, on ? 'rgba(70,140,255,0.45)' : 'rgba(255,70,70,0.4)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 4, y - 10, 30, 30);
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
