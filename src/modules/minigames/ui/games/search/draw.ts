// Zeichnen für Bude durchsuchen: Draufsicht auf die Wohnung des Schuldners (2,5D: Möbel mit sichtbarer Vorderkante und
// weichem Schatten, Wände mit Licht von oben). Hintergrund (Böden, Wände, Möbel) und jedes Ding liegen nach einer
// Größenänderung fertig in eigenen Leinwänden; pro Bild wird nur zusammengesetzt, dazu Licht, Fortschritt und Effekte.
// Farben aus den Design-Tokens (mapToken), sonst nur Schwarz und Weiß mit Deckkraft.

import { mapToken } from '../../../../../map';
import { type ApartmentLayout, FURNITURE, type FurnitureId, labelSpot, placeRect, type Rect } from './layout';
import { type ItemId, ROOM_NAMES, ROOMS, type RoomId } from './model';

export interface SearchPalette {
  base: string;
  ink: string;
  ink2: string;
  gold: string;
  money: string;
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

export function readPalette(): SearchPalette {
  return {
    base: mapToken('--hud-glass-solid', '#16181d'),
    ink: mapToken('--hud-ink', '#ffffff'),
    ink2: mapToken('--hud-ink-2', 'rgba(235, 235, 245, 0.72)'),
    gold: mapToken('--hud-gold', '#f2c766'),
    money: mapToken('--cat-money', '#30d158'),
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

export type Light = 'day' | 'dim' | 'night';

/** Tageszeit aus params.phase: Tag hell (Jalousien), Dämmerung trüb, Nacht nur die Taschenlampe. */
export function lightOf(phase: unknown): Light {
  if (phase === 'day') return 'day';
  if (phase === 'dawn' || phase === 'dusk') return 'dim';
  return 'night';
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
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Aktuellen Pfad in einer Bedeutungsfarbe füllen, gedämpft: dunkler Grund, Farbe mit Deckkraft a darüber. */
function tone(ctx: CanvasRenderingContext2D, p: SearchPalette, color: string, a: number): void {
  ctx.fillStyle = p.base;
  ctx.fill();
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Weiß bzw. Schwarz mit Deckkraft (Licht und Schatten). */
const white = (a: number) => `rgba(255, 255, 255, ${a})`;
const black = (a: number) => `rgba(0, 0, 0, ${a})`;

/** Weicher Schatten unter einem Möbel (nach rechts unten versetzt, Licht von links oben). */
function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, d: number) {
  ctx.fillStyle = black(0.22);
  roundRect(ctx, x + d * 0.6, y + d, w, h, r);
  ctx.fill();
  ctx.fillStyle = black(0.14);
  roundRect(ctx, x + d * 1.1, y + d * 1.6, w, h, r + d);
  ctx.fill();
}

/**
 * Kasten in 2,5D: Vorderkante (Höhe depth, dunkler) unter der Oberseite, Schatten, Glanzkante oben links.
 * Oberseite in color mit Deckkraft a.
 */
function box(
  ctx: CanvasRenderingContext2D,
  p: SearchPalette,
  r: Rect,
  color: string,
  a: number,
  depth: number,
  radius = 3,
): Rect {
  const top = { x: r.x, y: r.y, w: r.w, h: Math.max(4, r.h - depth) };
  shadow(ctx, r.x, r.y, r.w, r.h, radius, Math.max(2, depth * 0.7));
  // Vorderkante
  roundRect(ctx, r.x, r.y + depth, r.w, top.h, radius);
  tone(ctx, p, color, a * 0.55);
  ctx.fillStyle = black(0.35);
  ctx.fill();
  // Oberseite
  roundRect(ctx, top.x, top.y, top.w, top.h, radius);
  tone(ctx, p, color, a);
  const g = ctx.createLinearGradient(top.x, top.y, top.x + top.w, top.y + top.h);
  g.addColorStop(0, white(0.16));
  g.addColorStop(1, white(0));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = white(0.14);
  ctx.lineWidth = 1;
  ctx.stroke();
  return top;
}

// ---------------------------------------------------------------------------------------------
// Böden

function planks(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect, a: number, size: number, vertical = false) {
  ctx.fillStyle = p.base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = a;
  ctx.fillStyle = p.goods;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  // Dielen mit leicht wechselnder Helligkeit und versetzten Stößen (fest, kein Zufall: aus der Lage).
  const len = vertical ? r.h : r.w;
  const across = vertical ? r.w : r.h;
  for (let i = 0, k = 0; i < across; i += size, k++) {
    const shade = ((k * 37) % 7) / 7;
    ctx.fillStyle = shade > 0.5 ? white(0.03 * shade) : black(0.06 * (1 - shade));
    if (vertical) ctx.fillRect(r.x + i, r.y, size, len);
    else ctx.fillRect(r.x, r.y + i, len, size);
    ctx.fillStyle = black(0.28);
    if (vertical) ctx.fillRect(r.x + i, r.y, 1, len);
    else ctx.fillRect(r.x, r.y + i, len, 1);
    const off = ((k * 53) % 11) / 11;
    for (let j = off * size * 5; j < len; j += size * 5.5) {
      if (vertical) ctx.fillRect(r.x + i, r.y + j, size, 1);
      else ctx.fillRect(r.x + j, r.y + i, 1, size);
    }
  }
}

function tiles(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect, size: number, color: string, a: number) {
  ctx.fillStyle = p.base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  for (let y = 0, row = 0; y < r.h; y += size, row++) {
    for (let x = 0, col = 0; x < r.w; x += size, col++) {
      if ((row + col) % 2 === 0) {
        ctx.fillStyle = white(0.05);
        ctx.fillRect(r.x + x, r.y + y, Math.min(size, r.w - x), Math.min(size, r.h - y));
      }
    }
  }
  ctx.strokeStyle = black(0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = size; x < r.w; x += size) {
    ctx.moveTo(r.x + x + 0.5, r.y);
    ctx.lineTo(r.x + x + 0.5, r.y + r.h);
  }
  for (let y = size; y < r.h; y += size) {
    ctx.moveTo(r.x, r.y + y + 0.5);
    ctx.lineTo(r.x + r.w, r.y + y + 0.5);
  }
  ctx.stroke();
}

function carpet(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect) {
  ctx.fillStyle = p.base;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = p.law;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.globalAlpha = 1;
  // Flor: feste, unregelmäßige Punkte aus der Lage.
  ctx.fillStyle = white(0.035);
  for (let i = 0; i < (r.w * r.h) / 40; i++) {
    const x = (i * 97.13) % r.w;
    const y = (i * 61.7 + ((i * 13) % 7)) % r.h;
    ctx.fillRect(r.x + x, r.y + y, 1.5, 1.5);
  }
}

function floor(ctx: CanvasRenderingContext2D, p: SearchPalette, room: RoomId, r: Rect, unit: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  switch (room) {
    case 'living':
      planks(ctx, p, r, 0.3, Math.max(9, unit * 0.06));
      break;
    case 'hall':
      planks(ctx, p, r, 0.22, Math.max(8, unit * 0.06), true);
      break;
    case 'kitchen':
      tiles(ctx, p, r, Math.max(14, unit * 0.1), p.ink, 0.1);
      break;
    case 'bath':
      tiles(ctx, p, r, Math.max(9, unit * 0.06), p.chat, 0.14);
      break;
    case 'bedroom':
      carpet(ctx, p, r);
      break;
  }
  // Umgebungsschatten an den Wänden.
  const edge = Math.max(10, unit * 0.08);
  const sides: [number, number, number, number, number, number, number, number][] = [
    [r.x, r.y, r.x, r.y + edge, r.x, r.y, r.w, edge],
    [r.x, r.y, r.x + edge, r.y, r.x, r.y, edge, r.h],
    [r.x + r.w, r.y, r.x + r.w - edge, r.y, r.x + r.w - edge, r.y, edge, r.h],
    [r.x, r.y + r.h, r.x, r.y + r.h - edge, r.x, r.y + r.h - edge, r.w, edge],
  ];
  for (const [x0, y0, x1, y1, fx, fy, fw, fh] of sides) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, black(0.35));
    g.addColorStop(1, black(0));
    ctx.fillStyle = g;
    ctx.fillRect(fx, fy, fw, fh);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Möbel (Kulisse)

function drawFurniture(ctx: CanvasRenderingContext2D, p: SearchPalette, id: FurnitureId, r: Rect, unit: number) {
  const d = Math.max(3, unit * 0.025);
  switch (id) {
    case 'rug': {
      roundRect(ctx, r.x, r.y, r.w, r.h, 2);
      tone(ctx, p, p.media, 0.28);
      ctx.strokeStyle = white(0.12);
      ctx.lineWidth = Math.max(2, unit * 0.012);
      roundRect(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 2);
      ctx.stroke();
      ctx.strokeStyle = black(0.25);
      roundRect(ctx, r.x + 12, r.y + 12, r.w - 24, r.h - 24, 2);
      ctx.stroke();
      // Fransen links und rechts.
      ctx.strokeStyle = white(0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = r.y + 3; y < r.y + r.h - 2; y += 4) {
        ctx.moveTo(r.x, y);
        ctx.lineTo(r.x - 4, y);
        ctx.moveTo(r.x + r.w, y);
        ctx.lineTo(r.x + r.w + 4, y);
      }
      ctx.stroke();
      break;
    }
    case 'table': {
      const top = box(ctx, p, r, p.goods, 0.55, d);
      ctx.fillStyle = white(0.08);
      ctx.beginPath();
      ctx.ellipse(top.x + top.w * 0.3, top.y + top.h * 0.5, top.h * 0.22, top.h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = white(0.25);
      ctx.stroke();
      break;
    }
    case 'sofaBase': {
      const top = box(ctx, p, r, p.law, 0.42, d * 1.4, 8);
      // Lehne hinten (unten an der Wand) und Armlehnen.
      ctx.fillStyle = black(0.22);
      roundRect(ctx, top.x + 3, top.y + top.h * 0.62, top.w - 6, top.h * 0.34, 6);
      ctx.fill();
      ctx.fillStyle = white(0.06);
      roundRect(ctx, top.x + 2, top.y + 2, top.w * 0.09, top.h - 4, 6);
      ctx.fill();
      roundRect(ctx, top.x + top.w * 0.91 - 2, top.y + 2, top.w * 0.09, top.h - 4, 6);
      ctx.fill();
      break;
    }
    case 'shelf': {
      const top = box(ctx, p, r, p.goods, 0.5, d);
      // Buchrücken in Reihen.
      const colors = [p.danger, p.place, p.warn, p.money, p.law, p.ink2];
      const rowH = Math.max(6, top.h / 6);
      for (let y = top.y + 3, k = 0; y < top.y + top.h - rowH * 0.6; y += rowH, k++) {
        for (let x = top.x + 3, j = 0; x < top.x + top.w - 4; x += 4, j++) {
          ctx.globalAlpha = 0.35 + (((k + j) * 7) % 5) * 0.06;
          ctx.fillStyle = colors[(k * 3 + j) % colors.length];
          ctx.fillRect(x, y, 3, rowH - 3);
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'counter': {
      const top = box(ctx, p, r, p.ink, 0.18, d);
      // Spüle
      const sw = Math.min(top.w * 0.2, 54);
      const sx = top.x + top.w * 0.72 - sw / 2;
      if (sx > top.x + 6) {
        roundRect(ctx, sx, top.y + top.h * 0.2, sw, top.h * 0.6, 4);
        ctx.fillStyle = black(0.35);
        ctx.fill();
        ctx.strokeStyle = white(0.25);
        ctx.stroke();
      }
      break;
    }
    case 'kitchenTable': {
      box(ctx, p, r, p.goods, 0.5, d, 6);
      // Stühle
      ctx.fillStyle = black(0.25);
      const cw = Math.min(r.w * 0.22, 26);
      roundRect(ctx, r.x + r.w * 0.3 - cw / 2, r.y + r.h + 2, cw, cw * 0.55, 3);
      ctx.fill();
      roundRect(ctx, r.x + r.w * 0.7 - cw / 2, r.y + r.h + 2, cw, cw * 0.55, 3);
      ctx.fill();
      break;
    }
    case 'toilet': {
      ctx.fillStyle = black(0.25);
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2 + 3, r.y + r.h / 2 + 4, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      tone(ctx, p, p.ink, 0.62);
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h * 0.55, r.w * 0.3, r.h * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = black(0.3);
      ctx.fill();
      break;
    }
    case 'sink': {
      const top = box(ctx, p, r, p.ink, 0.55, d * 0.6, 6);
      ctx.beginPath();
      ctx.ellipse(top.x + top.w / 2, top.y + top.h * 0.55, top.w * 0.32, top.h * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = black(0.28);
      ctx.fill();
      break;
    }
    case 'tub': {
      const top = box(ctx, p, r, p.ink, 0.55, d * 0.6, 10);
      roundRect(ctx, top.x + 5, top.y + 5, top.w - 10, top.h - 10, 9);
      ctx.fillStyle = black(0.12);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = p.sky;
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'bed': {
      const top = box(ctx, p, r, p.goods, 0.45, d, 4);
      // Kissen oben, Decke unten (umgeschlagen).
      const pw = top.w * 0.38;
      ctx.fillStyle = white(0.62);
      roundRect(ctx, top.x + top.w * 0.08, top.y + 5, pw, top.h * 0.13, 5);
      ctx.fill();
      roundRect(ctx, top.x + top.w * 0.54, top.y + 5, pw, top.h * 0.13, 5);
      ctx.fill();
      break;
    }
    case 'hooks': {
      ctx.fillStyle = p.goods;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(r.x, r.y, r.w * 0.5, r.h);
      ctx.globalAlpha = 1;
      break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Dinge (je eine kleine Leinwand)

/** Rand um ein Ding (für Drehung, Schein, Schatten). */
export const SPRITE_PAD = 10;

function drawItemShape(ctx: CanvasRenderingContext2D, p: SearchPalette, id: ItemId, w: number, h: number) {
  const r: Rect = { x: 0, y: 0, w, h };
  const d = Math.max(2, Math.min(w, h) * 0.12);
  switch (id) {
    case 'sofa': {
      // Drei Sitzkissen.
      const gap = 3;
      const cw = (w - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        const top = box(ctx, p, { x: i * (cw + gap), y: 0, w: cw, h }, p.law, 0.62, Math.max(2, h * 0.16), 6);
        ctx.strokeStyle = black(0.2);
        ctx.beginPath();
        ctx.moveTo(top.x + top.w / 2, top.y + 4);
        ctx.lineTo(top.x + top.w / 2, top.y + top.h - 4);
        ctx.stroke();
      }
      break;
    }
    case 'rug': {
      // Umgeschlagene Teppichecke.
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      tone(ctx, p, p.media, 0.3);
      ctx.beginPath();
      ctx.moveTo(w, h * 0.35);
      ctx.lineTo(w, h);
      ctx.lineTo(w * 0.35, h);
      ctx.closePath();
      tone(ctx, p, p.media, 0.5);
      ctx.fillStyle = white(0.12);
      ctx.fill();
      ctx.strokeStyle = black(0.3);
      ctx.stroke();
      break;
    }
    case 'frame': {
      shadow(ctx, 0, 0, w, h, 1, 3);
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      const inset = Math.max(3, h * 0.18);
      ctx.fillStyle = p.base;
      ctx.fillRect(inset, inset, w - 2 * inset, h - 2 * inset);
      // Bild: Himmel und ein Hügel (Rheinufer).
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = p.sky;
      ctx.fillRect(inset, inset, w - 2 * inset, (h - 2 * inset) * 0.6);
      ctx.fillStyle = p.money;
      ctx.beginPath();
      ctx.moveTo(inset, h - inset);
      ctx.quadraticCurveTo(w * 0.4, h * 0.3, w - inset, h - inset);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case 'plant': {
      ctx.fillStyle = black(0.3);
      ctx.beginPath();
      ctx.ellipse(w / 2 + 3, h / 2 + 4, w * 0.42, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
      tone(ctx, p, p.goods, 0.7);
      ctx.fillStyle = black(0.45);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.28, 0, Math.PI * 2);
      ctx.fill();
      // Blätter sternförmig.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.3;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(w * 0.22, 0, w * 0.26, w * 0.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = p.money;
        ctx.globalAlpha = 0.55 + (i % 3) * 0.12;
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'book': {
      const top = box(ctx, p, r, p.danger, 0.55, d);
      ctx.fillStyle = white(0.7);
      ctx.fillRect(top.x + top.w * 0.82, top.y + 2, top.w * 0.14, top.h - 4);
      ctx.fillStyle = p.gold;
      ctx.fillRect(top.x + top.w * 0.15, top.y + top.h * 0.4, top.w * 0.55, Math.max(1.5, top.h * 0.07));
      break;
    }
    case 'tv': {
      const top = box(ctx, p, r, p.goods, 0.45, d);
      ctx.fillStyle = black(0.85);
      roundRect(ctx, top.x + top.w * 0.2, top.y + top.h * 0.12, top.w * 0.4, top.h * 0.76, 2);
      ctx.fill();
      ctx.strokeStyle = white(0.3);
      ctx.stroke();
      break;
    }
    case 'freezer': {
      const top = box(ctx, p, r, p.ink, 0.7, Math.max(4, h * 0.2), 4);
      ctx.strokeStyle = black(0.3);
      ctx.beginPath();
      ctx.moveTo(top.x + 3, top.y + top.h * 0.42);
      ctx.lineTo(top.x + top.w - 3, top.y + top.h * 0.42);
      ctx.stroke();
      ctx.fillStyle = black(0.45);
      roundRect(ctx, top.x + top.w * 0.12, top.y + top.h * 0.14, top.w * 0.4, 3, 1.5);
      ctx.fill();
      // Schneeflocke (Gefrierfach).
      ctx.strokeStyle = p.sky;
      ctx.lineWidth = 1.5;
      const cx = top.x + top.w * 0.72;
      const cy = top.y + top.h * 0.22;
      const s = Math.min(top.w, top.h) * 0.1;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(cx - Math.cos(a) * s, cy - Math.sin(a) * s);
        ctx.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'dishes': {
      const top = box(ctx, p, r, p.goods, 0.55, d);
      // Glastüren mit Tellern dahinter.
      const pane = (top.w - 9) / 2;
      for (let i = 0; i < 2; i++) {
        const x = top.x + 3 + i * (pane + 3);
        ctx.fillStyle = black(0.35);
        ctx.fillRect(x, top.y + 3, pane, top.h - 6);
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(x + pane * (0.2 + k * 0.3), top.y + top.h / 2, Math.min(pane * 0.13, top.h * 0.32), 0, Math.PI * 2);
          ctx.fillStyle = white(0.55);
          ctx.fill();
        }
        ctx.fillStyle = white(0.1);
        ctx.fillRect(x, top.y + 3, pane * 0.3, top.h - 6);
      }
      break;
    }
    case 'microwave': {
      const top = box(ctx, p, r, p.ink, 0.25, d);
      ctx.fillStyle = black(0.6);
      roundRect(ctx, top.x + 3, top.y + 3, top.w * 0.62, top.h - 6, 2);
      ctx.fill();
      ctx.fillStyle = p.warn;
      ctx.fillRect(top.x + top.w * 0.76, top.y + top.h * 0.25, top.w * 0.14, 2);
      ctx.fillStyle = white(0.4);
      for (let i = 0; i < 3; i++)
        ctx.fillRect(top.x + top.w * 0.76, top.y + top.h * (0.45 + i * 0.14), top.w * 0.14, 1.5);
      break;
    }
    case 'oven': {
      const top = box(ctx, p, r, p.ink, 0.2, d);
      const rr = Math.min(top.w, top.h) * 0.17;
      for (let i = 0; i < 4; i++) {
        const cx = top.x + top.w * (i % 2 ? 0.7 : 0.3);
        const cy = top.y + top.h * (i < 2 ? 0.3 : 0.7);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.fillStyle = black(0.65);
        ctx.fill();
        ctx.strokeStyle = white(0.18);
        ctx.stroke();
      }
      break;
    }
    case 'cereal': {
      const top = box(ctx, p, r, p.warn, 0.75, d);
      ctx.fillStyle = white(0.75);
      ctx.beginPath();
      ctx.arc(top.x + top.w / 2, top.y + top.h * 0.55, Math.min(top.w, top.h) * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.danger;
      ctx.fillRect(top.x, top.y + top.h * 0.12, top.w, Math.max(2, top.h * 0.12));
      break;
    }
    case 'cookies': {
      ctx.fillStyle = black(0.3);
      ctx.beginPath();
      ctx.arc(w / 2 + 2, h / 2 + 3, w * 0.46, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
      tone(ctx, p, p.place, 0.6);
      ctx.strokeStyle = p.gold;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      break;
    }
    case 'cistern': {
      const top = box(ctx, p, r, p.ink, 0.65, d, 4);
      ctx.beginPath();
      ctx.arc(top.x + top.w / 2, top.y + top.h / 2, Math.min(top.w, top.h) * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = black(0.2);
      ctx.fill();
      ctx.strokeStyle = white(0.5);
      ctx.stroke();
      break;
    }
    case 'cabinet': {
      const top = box(ctx, p, r, p.ink, 0.35, d);
      const g = ctx.createLinearGradient(top.x, top.y, top.x + top.w, top.y + top.h);
      g.addColorStop(0, white(0.5));
      g.addColorStop(0.5, white(0.15));
      g.addColorStop(1, white(0.35));
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = p.sky;
      ctx.fillRect(top.x + 3, top.y + 2, top.w - 6, top.h - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(top.x + 3, top.y + 2, top.w - 6, top.h - 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = black(0.4);
      ctx.fillRect(top.x + top.w / 2 - 0.5, top.y + 2, 1, top.h - 4);
      break;
    }
    case 'vent': {
      ctx.fillStyle = black(0.4);
      ctx.fillRect(0, 0, w, h);
      roundRect(ctx, 1, 1, w - 2, h - 2, 2);
      tone(ctx, p, p.ink, 0.35);
      ctx.fillStyle = black(0.6);
      const n = Math.max(3, Math.floor(h / 5));
      for (let i = 0; i < n; i++) ctx.fillRect(3, 3 + (i * (h - 6)) / n, w - 6, Math.max(1.5, (h - 6) / n - 2));
      ctx.fillStyle = white(0.6);
      for (const [x, y] of [
        [3, 3],
        [w - 4, 3],
        [3, h - 4],
        [w - 4, h - 4],
      ])
        ctx.fillRect(x, y, 1.5, 1.5);
      break;
    }
    case 'laundry': {
      ctx.fillStyle = black(0.3);
      ctx.beginPath();
      ctx.ellipse(w / 2 + 3, h / 2 + 4, w * 0.46, h * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2);
      tone(ctx, p, p.goods, 0.75);
      // Geflecht
      ctx.strokeStyle = black(0.25);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.moveTo(w / 2 + Math.cos(a) * w * 0.32, h / 2 + Math.sin(a) * h * 0.32);
        ctx.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.46);
      }
      ctx.stroke();
      // Wäsche
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.32, 0, Math.PI * 2);
      tone(ctx, p, p.people, 0.45);
      ctx.fillStyle = white(0.4);
      ctx.beginPath();
      ctx.ellipse(w * 0.42, h * 0.45, w * 0.14, h * 0.08, 0.6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'mattress': {
      roundRect(ctx, 0, 0, w, h, 5);
      ctx.fillStyle = white(0.5);
      ctx.fill();
      // Decke
      roundRect(ctx, 0, h * 0.18, w, h * 0.82, 5);
      tone(ctx, p, p.people, 0.45);
      ctx.fillStyle = white(0.12);
      roundRect(ctx, 0, h * 0.18, w, h * 0.12, 4);
      ctx.fill();
      ctx.strokeStyle = black(0.18);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(w * 0.1, h * (0.3 + i * 0.16));
        ctx.quadraticCurveTo(w * 0.5, h * (0.34 + i * 0.16), w * 0.9, h * (0.3 + i * 0.16));
      }
      ctx.stroke();
      break;
    }
    case 'nightstand': {
      const top = box(ctx, p, r, p.goods, 0.6, d);
      ctx.beginPath();
      ctx.arc(top.x + top.w * 0.5, top.y + top.h * 0.48, Math.min(top.w, top.h) * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = p.gold;
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = white(0.5);
      ctx.stroke();
      break;
    }
    case 'wardrobe': {
      const top = box(ctx, p, r, p.goods, 0.55, d);
      ctx.strokeStyle = black(0.35);
      ctx.beginPath();
      ctx.moveTo(top.x + 2, top.y + top.h / 2);
      ctx.lineTo(top.x + top.w - 2, top.y + top.h / 2);
      ctx.stroke();
      ctx.fillStyle = p.gold;
      ctx.fillRect(top.x + 3, top.y + top.h / 2 - 7, 2, 5);
      ctx.fillRect(top.x + 3, top.y + top.h / 2 + 2, 2, 5);
      break;
    }
    case 'shoebox': {
      const top = box(ctx, p, r, p.danger, 0.45, d);
      ctx.strokeStyle = white(0.3);
      ctx.strokeRect(top.x + 2.5, top.y + 2.5, top.w - 5, top.h - 5);
      ctx.fillStyle = white(0.6);
      ctx.fillRect(top.x + top.w * 0.3, top.y + top.h * 0.42, top.w * 0.4, 2);
      break;
    }
    case 'teddy': {
      const cx = w / 2;
      const cy = h / 2;
      const s = Math.min(w, h);
      ctx.fillStyle = black(0.3);
      ctx.beginPath();
      ctx.arc(cx + 2, cy + 3, s * 0.42, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy, rr] of [
        [-0.3, -0.3, 0.16],
        [0.3, -0.3, 0.16],
        [0, 0.05, 0.4],
      ]) {
        ctx.beginPath();
        ctx.arc(cx + dx * s, cy + dy * s, rr * s, 0, Math.PI * 2);
        tone(ctx, p, p.goods, 0.85);
      }
      ctx.fillStyle = black(0.7);
      ctx.beginPath();
      ctx.arc(cx - s * 0.12, cy - s * 0.02, s * 0.045, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.12, cy - s * 0.02, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy + s * 0.14, s * 0.1, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = white(0.35);
      ctx.fill();
      break;
    }
    case 'floorboard': {
      ctx.fillRect(0, 0, 0, 0);
      roundRect(ctx, 0, 0, w, h, 1);
      tone(ctx, p, p.goods, 0.55);
      ctx.strokeStyle = black(0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = white(0.55);
      for (const x of [4, w - 6]) {
        ctx.fillRect(x, h * 0.3, 2, 2);
        ctx.fillRect(x, h * 0.62, 2, 2);
      }
      break;
    }
    case 'mat': {
      roundRect(ctx, 0, 0, w, h, 3);
      tone(ctx, p, p.goods, 0.45);
      ctx.strokeStyle = black(0.3);
      ctx.beginPath();
      for (let x = 4; x < w - 2; x += 3) {
        ctx.moveTo(x, 3);
        ctx.lineTo(x, h - 3);
      }
      ctx.stroke();
      ctx.fillStyle = black(0.45);
      ctx.font = `700 ${Math.max(8, Math.round(h * 0.42))}px "Barlow Condensed", "Barlow", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('WELCOME', w / 2, h / 2 + 1);
      break;
    }
    case 'jacket': {
      ctx.fillStyle = black(0.3);
      roundRect(ctx, 3, 4, w - 2, h - 2, 6);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0);
      ctx.lineTo(w * 0.85, 0);
      ctx.lineTo(w, h * 0.3);
      ctx.lineTo(w * 0.9, h);
      ctx.lineTo(w * 0.1, h);
      ctx.lineTo(0, h * 0.3);
      ctx.closePath();
      tone(ctx, p, p.place, 0.5);
      ctx.strokeStyle = black(0.35);
      ctx.beginPath();
      ctx.moveTo(w / 2, h * 0.08);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
      ctx.fillStyle = white(0.2);
      ctx.fillRect(w * 0.18, h * 0.5, w * 0.22, h * 0.1);
      ctx.fillRect(w * 0.6, h * 0.5, w * 0.22, h * 0.1);
      break;
    }
    case 'shoes': {
      const top = box(ctx, p, r, p.goods, 0.45, d);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const y = top.y + 3 + (i * (top.h - 6)) / n;
        const sh = (top.h - 6) / n - 2;
        for (const dx of [0.28, 0.66]) {
          ctx.beginPath();
          ctx.ellipse(top.x + top.w * dx, y + sh / 2, top.w * 0.16, sh * 0.42, 0, 0, Math.PI * 2);
          ctx.fillStyle = i === 1 ? white(0.7) : black(0.75);
          ctx.fill();
        }
      }
      break;
    }
    case 'fuse': {
      const top = box(ctx, p, r, p.ink, 0.3, d * 0.6, 2);
      ctx.fillStyle = black(0.5);
      for (let i = 0; i < 3; i++) ctx.fillRect(top.x + 3, top.y + 3 + i * ((top.h - 6) / 3), top.w - 6, 2);
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(top.x + top.w * 0.5, top.y + top.h * 0.25);
      ctx.lineTo(top.x + top.w * 0.35, top.y + top.h * 0.6);
      ctx.lineTo(top.x + top.w * 0.55, top.y + top.h * 0.55);
      ctx.lineTo(top.x + top.w * 0.45, top.y + top.h * 0.85);
      ctx.lineTo(top.x + top.w * 0.68, top.y + top.h * 0.45);
      ctx.lineTo(top.x + top.w * 0.5, top.y + top.h * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'umbrella': {
      ctx.fillStyle = black(0.3);
      ctx.beginPath();
      ctx.arc(w / 2 + 2, h / 2 + 3, w * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.44, 0, Math.PI * 2);
      tone(ctx, p, p.ink, 0.3);
      ctx.fillStyle = black(0.6);
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, w * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, w * 0.08);
      ctx.lineCap = 'round';
      for (const [color, a] of [
        [p.danger, -0.6],
        [p.place, 1.4],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(a) * w * 0.14, h / 2 + Math.sin(a) * h * 0.14, w * 0.1, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      break;
    }
  }
}

/** Ein Ding als Leinwand (Größe + SPRITE_PAD rundum). */
export function renderItem(p: SearchPalette, id: ItemId, w: number, h: number, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = offscreen(w + SPRITE_PAD * 2, h + SPRITE_PAD * 2, dpr);
  ctx.translate(SPRITE_PAD, SPRITE_PAD);
  drawItemShape(ctx, p, id, w, h);
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Wohnung (Hintergrund)

/** Durchgänge zwischen Räumen: Raumpaar, Lage auf der gemeinsamen Wand (0 bis 1). */
const DOORWAYS: [RoomId, RoomId, number][] = [
  ['living', 'hall', 0.5],
  ['living', 'kitchen', 0.7],
  ['living', 'bedroom', 0.75],
  ['hall', 'bath', 0.4],
  ['hall', 'bedroom', 0.4],
  ['kitchen', 'bath', 0.5],
];

/** Durchgang zwischen zwei Räumen, wenn sie eine Wand teilen (Rechteck über die Wand). */
function doorway(a: Rect, b: Rect, at: number, size: number): Rect | null {
  const gapX = b.x - (a.x + a.w);
  const gapX2 = a.x - (b.x + b.w);
  const gapY = b.y - (a.y + a.h);
  const gapY2 = a.y - (b.y + b.h);
  const overlapX = [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
  const overlapY = [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)];
  const near = (g: number) => g >= -1 && g < 30;
  if ((near(gapX) || near(gapX2)) && overlapY[1] - overlapY[0] > size) {
    const left = near(gapX) ? a.x + a.w : b.x + b.w;
    const right = near(gapX) ? b.x : a.x;
    const y = overlapY[0] + (overlapY[1] - overlapY[0] - size) * at;
    return { x: left - 1, y, w: right - left + 2, h: size };
  }
  if ((near(gapY) || near(gapY2)) && overlapX[1] - overlapX[0] > size) {
    const top = near(gapY) ? a.y + a.h : b.y + b.h;
    const bottom = near(gapY) ? b.y : a.y;
    const x = overlapX[0] + (overlapX[1] - overlapX[0] - size) * at;
    return { x, y: top - 1, w: size, h: bottom - top + 2 };
  }
  return null;
}

export function renderApartment(
  layout: ApartmentLayout,
  p: SearchPalette,
  light: Light,
  items: readonly { id: ItemId; room: RoomId; rect: Rect }[],
  dpr: number,
): HTMLCanvasElement {
  const present = new Set(items.map((i) => i.id));
  const { width, height, outer, rooms, wall } = layout;
  const [canvas, ctx] = offscreen(width, height, dpr);
  // Treppenhaus drumherum: dunkel mit leichtem Schein unten (Tür).
  ctx.fillStyle = black(0.35);
  ctx.fillRect(0, 0, width, height);
  // Schlagschatten der Wohnung.
  ctx.fillStyle = black(0.45);
  roundRect(ctx, outer.x + 6, outer.y + 10, outer.w, outer.h, 6);
  ctx.fill();
  // Wände: erst alles in Wandfarbe, dann die Böden darüber.
  roundRect(ctx, outer.x, outer.y, outer.w, outer.h, 4);
  tone(ctx, p, p.ink, 0.62);
  const unit = Math.min(outer.w, outer.h);
  for (const room of ROOMS) floor(ctx, p, room, rooms[room], unit);
  // Durchgänge: Boden des ersten Raums über die Wand, mit Schwelle.
  const doorSize = Math.max(26, unit * 0.11);
  for (const [a, b, at] of DOORWAYS) {
    const gap = doorway(rooms[a], rooms[b], at, doorSize);
    if (!gap) continue;
    ctx.fillStyle = p.base;
    ctx.fillRect(gap.x, gap.y, gap.w, gap.h);
    ctx.fillStyle = black(0.25);
    ctx.fillRect(gap.x, gap.y, gap.w, gap.h);
    ctx.fillStyle = white(0.08);
    if (gap.w < gap.h) ctx.fillRect(gap.x + gap.w / 2 - 0.5, gap.y, 1, gap.h);
    else ctx.fillRect(gap.x, gap.y + gap.h / 2 - 0.5, gap.w, 1);
  }
  // Glanz auf den Wandkronen (Licht von oben links).
  ctx.strokeStyle = white(0.3);
  ctx.lineWidth = 1;
  roundRect(ctx, outer.x + 0.5, outer.y + 0.5, outer.w - 1, outer.h - 1, 4);
  ctx.stroke();
  // Fenster in der Außenwand oben.
  for (const win of layout.windows) {
    ctx.fillStyle = p.base;
    ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.globalAlpha = light === 'day' ? 0.75 : light === 'dim' ? 0.45 : 0.25;
    ctx.fillStyle = p.sky;
    ctx.fillRect(win.x, win.y + 1, win.w, win.h - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = black(0.35);
    for (let x = win.x + 4; x < win.x + win.w; x += 6) ctx.fillRect(x, win.y, 1, win.h);
  }
  // Wohnungstür unten im Flur: Spalt in der Außenwand, Türblatt zu.
  const door = layout.door;
  ctx.fillStyle = p.base;
  ctx.fillRect(door.x - door.w / 2, door.y - wall / 2 - 1, door.w, wall + 2);
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = p.goods;
  ctx.fillRect(door.x - door.w / 2, door.y - wall * 0.3, door.w, wall * 0.6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = black(0.3);
  ctx.fillRect(door.x - door.w / 2, door.y - wall * 0.3, 2, wall * 0.6);
  // Möbel
  for (const f of FURNITURE) drawFurniture(ctx, p, f.id, placeRect(rooms[f.room], f.place), unit);
  // Sofa ohne Kissen sähe leer aus: Kissen sind ein Ding; ohne das Ding bleiben einfache Polster.
  if (!present.has('sofa')) {
    const rect = placeRect(rooms.living, { rx: 0.44, ry: 1, oy: -0.13, w: 0.74, h: 0.16 });
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    tone(ctx, p, p.law, 0.5);
  }
  if (!present.has('mattress')) {
    const rect = placeRect(rooms.bedroom, { rx: 0.42, ry: 0.45, oy: 0.09, w: 0.48, h: 0.48 });
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 5);
    tone(ctx, p, p.people, 0.4);
  }
  // Licht durch die Jalousien (bei Tag kräftig, in der Dämmerung schwach).
  if (light !== 'night') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const win of layout.windows) {
      const room = win.x > rooms.kitchen.x - 1 && !layout.portrait ? rooms.kitchen : rooms.living;
      ctx.save();
      ctx.beginPath();
      ctx.rect(room.x, room.y, room.w, room.h);
      ctx.clip();
      const reach = room.h * 0.9;
      for (let i = 0; i < 6; i++) {
        const y0 = room.y + 4 + i * (reach / 6);
        const slat = (reach / 6) * 0.55;
        ctx.globalAlpha = (light === 'day' ? 0.075 : 0.035) * (1 - i / 7);
        ctx.fillStyle = light === 'day' ? p.ink : p.warn;
        ctx.beginPath();
        ctx.moveTo(win.x + i * reach * 0.12, y0);
        ctx.lineTo(win.x + win.w + i * reach * 0.12, y0);
        ctx.lineTo(win.x + win.w + (i + 0.6) * reach * 0.12, y0 + slat);
        ctx.lineTo(win.x + (i + 0.6) * reach * 0.12, y0 + slat);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  // Raumnamen klein in einer freien Ecke.
  const size = Math.max(11, Math.round(unit * 0.026));
  ctx.font = `700 ${size}px "Barlow Condensed", "Barlow", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = white(light === 'night' ? 0.32 : 0.45);
  for (const room of ROOMS) {
    const name = ROOM_NAMES[room].toUpperCase();
    const blockers = [
      ...items.filter((i) => i.room === room).map((i) => i.rect),
      ...FURNITURE.filter((f) => f.room === room && f.id !== 'rug').map((f) => placeRect(rooms[room], f.place)),
    ];
    const at = labelSpot(rooms[room], ctx.measureText(name).width, size, blockers);
    ctx.fillText(name, at.x, at.y);
  }
  return canvas;
}

// ---------------------------------------------------------------------------------------------
// Pro Bild

/** Schein, der aus einem Versteck lugt. */
export function drawPeek(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect): void {
  ctx.save();
  ctx.translate(r.x + r.w * 0.85, r.y + r.h * 0.85);
  ctx.rotate(-0.5);
  ctx.fillStyle = p.money;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(-7, -4, 14, 8);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = black(0.4);
  ctx.strokeRect(-7, -4, 14, 8);
  ctx.restore();
}

/** Kratzspuren und Staub neben einem verrutschten Ding (Spur). */
export function drawScuff(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.strokeStyle = white(0.28);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const x = r.x + r.w + 2;
  const y = r.y + r.h * 0.3;
  for (let i = 0; i < 3; i++) {
    ctx.moveTo(x + i * 3, y + i * 4);
    ctx.lineTo(x + i * 3 + 5, y + i * 4 - 3);
  }
  ctx.stroke();
}

/** Abzeichen auf einem durchsuchten Ding: Haken mit Geld (grün) oder leer (grau, Kreuz). */
export function drawBadge(ctx: CanvasRenderingContext2D, p: SearchPalette, x: number, y: number, money: boolean) {
  const r = 9;
  ctx.beginPath();
  ctx.arc(x, y, r + 2, 0, Math.PI * 2);
  ctx.fillStyle = black(0.55);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = money ? p.money : 'rgba(120, 120, 128, 0.95)';
  ctx.fill();
  ctx.strokeStyle = money ? black(0.85) : white(0.9);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (money) {
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 1, y + 3.5);
    ctx.lineTo(x + 4.5, y - 3.5);
  } else {
    ctx.moveTo(x - 3.5, y - 3.5);
    ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5);
    ctx.lineTo(x - 3.5, y + 3.5);
  }
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.lineCap = 'butt';
}

/** Fortschritt der Suche: kompakter Ring mit Lupe über der Mitte des Dings (gleich groß für alle Dinge). */
export function drawProgress(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect, share: number, t: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = 17;
  ctx.beginPath();
  ctx.arc(cx, cy, rad + 4, 0, Math.PI * 2);
  ctx.fillStyle = black(0.62);
  ctx.fill();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = white(0.16);
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = p.gold;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, share));
  ctx.stroke();
  ctx.lineCap = 'butt';
  // Lupe, die kreisend sucht.
  const a = t * 6;
  const lx = cx + Math.cos(a) * 3 - 2;
  const ly = cy + Math.sin(a) * 3 - 2;
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = white(0.95);
  ctx.beginPath();
  ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
  ctx.moveTo(lx + 4, ly + 4);
  ctx.lineTo(lx + 8.5, ly + 8.5);
  ctx.stroke();
  ctx.lineWidth = 1;
}

/** Rahmen um das gewählte Ding (Tastatur oder Maus darüber). */
export function drawFocus(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect, pulse: number) {
  const pad = 5 + pulse * 2;
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.65 + 0.35 * pulse;
  roundRect(ctx, r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, 8);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

/**
 * Licht: bei Nacht nur der Kegel der Taschenlampe (drumherum fast schwarz), in der Dämmerung trüb mit größerem Kegel.
 * Bei Tag nichts (das Licht der Jalousien liegt im Hintergrund).
 */
export function drawDarkness(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  light: Light,
  x: number,
  y: number,
  radius: number,
) {
  if (light === 'day') return;
  const night = light === 'night';
  const outerR = Math.max(width, height);
  const g = ctx.createRadialGradient(x, y, 0, x, y, outerR);
  const inner = Math.min(0.9, radius / outerR);
  g.addColorStop(0, 'rgba(255, 236, 200, 0.07)');
  g.addColorStop(inner * 0.55, 'rgba(255, 236, 200, 0.03)');
  g.addColorStop(inner, black(night ? 0.25 : 0.12));
  g.addColorStop(Math.min(0.97, inner * 1.6), black(night ? 0.86 : 0.48));
  g.addColorStop(1, black(night ? 0.93 : 0.55));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
}

/**
 * Ende: Der Schlüssel dreht sich im Schloss der Wohnungstür (turn 0 bis 1), dann schwingt die Tür in den Flur auf
 * (open 0 bis 1): Licht aus dem Treppenhaus fällt herein, und der Schatten des Schuldners steht im Spalt.
 */
export function drawDoorEnd(
  ctx: CanvasRenderingContext2D,
  p: SearchPalette,
  layout: ApartmentLayout,
  turn: number,
  open: number,
) {
  const { door, wall } = layout;
  const hall = layout.rooms.hall;
  const hinge = { x: door.x - door.w / 2, y: door.y - wall / 2 };
  const reach = Math.min(hall.h * 0.75, door.w * 3.2);
  if (open > 0) {
    // Die Öffnung: Treppenhauslicht statt Türblatt.
    ctx.fillStyle = p.base;
    ctx.fillRect(hinge.x, hinge.y, door.w, wall);
    ctx.fillStyle = `rgba(255, 222, 170, ${0.7 * open})`;
    ctx.fillRect(hinge.x, hinge.y, door.w, wall);
    // Lichtkeil aus dem Treppenhaus.
    ctx.save();
    ctx.beginPath();
    ctx.rect(hall.x, hall.y, hall.w, hall.h + wall);
    ctx.clip();
    const g = ctx.createLinearGradient(door.x, door.y, door.x, door.y - reach);
    g.addColorStop(0, `rgba(255, 222, 170, ${0.5 * open})`);
    g.addColorStop(1, 'rgba(255, 222, 170, 0)');
    ctx.fillStyle = g;
    const spread = door.w * (0.4 + 0.9 * open);
    ctx.beginPath();
    ctx.moveTo(hinge.x + 2, door.y);
    ctx.lineTo(hinge.x + door.w * open, door.y);
    ctx.lineTo(door.x + spread, door.y - reach);
    ctx.lineTo(door.x - spread * 0.7, door.y - reach);
    ctx.closePath();
    ctx.fill();
    // Schatten des Schuldners im Lichtkeil (Kopf und Schultern, lang gezogen).
    if (open > 0.4) {
      const k = Math.min(1, (open - 0.4) / 0.6);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.55 * k})`;
      const sx = door.x + door.w * 0.1;
      ctx.beginPath();
      ctx.ellipse(sx, door.y - reach * 0.32, door.w * 0.32, reach * 0.3, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(sx + 3, door.y - reach * 0.68, door.w * 0.16, door.w * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  // Türblatt schwingt um das Scharnier links in den Flur.
  ctx.save();
  ctx.translate(hinge.x, hinge.y);
  ctx.rotate(-open * 1.25);
  ctx.fillStyle = black(0.4);
  ctx.fillRect(2, 2, door.w, wall * 0.7);
  ctx.fillStyle = p.base;
  ctx.fillRect(0, -wall * 0.35, door.w, wall * 0.7);
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = p.goods;
  ctx.fillRect(0, -wall * 0.35, door.w, wall * 0.7);
  ctx.globalAlpha = 1;
  // Schlüssel im Schloss (innen am Türblatt), dreht sich.
  const kx = door.w * 0.82;
  const ky = -wall * 0.35 - 10;
  ctx.translate(kx, ky);
  ctx.rotate(turn * Math.PI);
  const s = Math.max(1, Math.min(1.6, door.w / 50));
  ctx.scale(s, s);
  ctx.fillStyle = black(0.5);
  ctx.beginPath();
  ctx.arc(1.5, 1.5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fillStyle = p.base;
  ctx.fill();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Schlüssel: Bart nach oben, Reide unten.
  ctx.fillStyle = p.gold;
  ctx.fillRect(-1.5, -7, 3, 9);
  ctx.fillRect(1.5, -7, 3, 2);
  ctx.fillRect(1.5, -3.5, 2.5, 2);
  ctx.beginPath();
  ctx.arc(0, 5, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
}

/** Kurzer Text, der aufsteigt und verblasst (+420 €, Klirr!). */
export function drawFloatText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  alpha: number,
  size: number,
) {
  ctx.font = `800 ${Math.round(size)}px "Barlow Condensed", "Barlow", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 4;
  ctx.strokeStyle = black(0.75);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}

/** Ein Geldschein im Flug. */
export function drawBill(ctx: CanvasRenderingContext2D, p: SearchPalette, x: number, y: number, rot: number, a = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = a;
  ctx.fillStyle = p.money;
  ctx.fillRect(-9, -5, 18, 10);
  ctx.strokeStyle = black(0.45);
  ctx.strokeRect(-9, -5, 18, 10);
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Lärm: Schallbögen um ein Ding. */
export function drawNoiseRings(ctx: CanvasRenderingContext2D, p: SearchPalette, r: Rect, age: number) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  ctx.strokeStyle = p.warn;
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const k = age * 1.6 - i * 0.18;
    if (k <= 0 || k >= 1) continue;
    ctx.globalAlpha = 1 - k;
    const rad = Math.max(r.w, r.h) / 2 + 6 + k * 46;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, -0.6, 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, rad, Math.PI - 0.6, Math.PI + 0.6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
}
