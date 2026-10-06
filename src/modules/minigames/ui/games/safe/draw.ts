// Zeichnen für Tresor knacken: Hinterzimmer, Stahltresor mit Zahlenschloss, Taschenlampe. Statische Teile (Raum, Tür,
// Zifferblatt) liegen nach jeder Größenänderung fertig in eigenen Leinwänden; pro Bild wird nur zusammengesetzt.
// Farben aus den Design-Tokens (mapToken); Stahl entsteht aus dem dunklen Glas-Ton und weißem Licht darüber.

import { mapToken } from '../../../../../map';
import { DIAL_SIZE } from './model';

export interface SafePalette {
  base: string;
  ink: string;
  ink2: string;
  gold: string;
  money: string;
  danger: string;
  goods: string;
}

export function readPalette(): SafePalette {
  return {
    base: mapToken('--hud-glass-solid', '#16181d'),
    ink: mapToken('--hud-ink', '#ffffff'),
    ink2: mapToken('--hud-ink-2', 'rgba(235, 235, 245, 0.72)'),
    gold: mapToken('--hud-gold', '#f2c766'),
    money: mapToken('--cat-money', '#30d158'),
    danger: mapToken('--cat-danger', '#ff7b73'),
    goods: mapToken('--cat-goods', '#c9a27a'),
  };
}

/** Lage der Teile in CSS-Pixeln (aus der Bühnengröße). */
export interface SafeLayout {
  width: number;
  height: number;
  /** Tür: links oben, Breite, Höhe. */
  door: { x: number; y: number; w: number; h: number };
  /** Zahlenschloss: Mitte und Radius. */
  dial: { x: number; y: number; r: number };
  /** Griff (Speichenrad) unter dem Schloss. */
  handle: { x: number; y: number; r: number };
  /** Drei Lämpchen über dem Schloss. */
  lamps: { x: number; y: number; gap: number; r: number };
}

/** Platz oben (HUD) und unten (Knöpfe) bleibt frei. */
export function safeLayout(width: number, height: number): SafeLayout {
  const top = 78;
  const bottom = width < 560 ? 112 : 96;
  const availH = Math.max(160, height - top - bottom);
  // Der Korpus ist rund 1,25-mal so breit wie die Tür (Rand und Tiefe nach rechts).
  const availW = (width * 0.94) / 1.25;
  const h = Math.min(availH, availW / 0.9);
  const w = h * 0.9;
  // Etwas nach links, damit Tür und Tiefe zusammen mittig stehen.
  const cx = width / 2 - w * 0.05;
  const cy = top + availH / 2;
  const door = { x: cx - w / 2, y: cy - h / 2, w, h };
  const r = w * 0.26;
  const dial = { x: cx, y: cy - h * 0.1, r };
  return {
    width,
    height,
    door,
    dial,
    handle: { x: cx, y: dial.y + r * 1.55, r: r * 0.3 },
    lamps: { x: cx, y: dial.y - r * 1.36, gap: r * 0.32, r: Math.max(4, r * 0.075) },
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function rivet(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 255, 255, 0.16)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Gebürsteter Stahl: dunkler Grund, Licht von links oben, feine Längsstriche. */
function steel(ctx: CanvasRenderingContext2D, p: SafePalette, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = p.base;
  ctx.fillRect(x, y, w, h);
  const light = ctx.createLinearGradient(x, y, x + w, y + h);
  light.addColorStop(0, 'rgba(255, 255, 255, 0.24)');
  light.addColorStop(0.45, 'rgba(255, 255, 255, 0.13)');
  light.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.lineWidth = 1;
  for (let i = 0; i < h; i += 3) {
    ctx.beginPath();
    ctx.moveTo(x, y + i + 0.5);
    ctx.lineTo(x + w, y + i + 0.5);
    ctx.stroke();
  }
}

/** Hinterzimmer: Wand mit Ziegeln, Boden, der Korpus des Tresors (ohne Tür). */
export function renderRoom(layout: SafeLayout, p: SafePalette, dpr: number): HTMLCanvasElement {
  const { width, height, door } = layout;
  const [canvas, ctx] = offscreen(width, height, dpr);
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, width, height);
  // Warmer Ton in der Wand (Ziegel), nach unten dunkler.
  const wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, 'rgba(255, 210, 160, 0.07)');
  wall.addColorStop(0.75, 'rgba(255, 210, 160, 0.04)');
  wall.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 2;
  const brickH = 22;
  const floorY = door.y + door.h + door.h * 0.04;
  for (let y = 0, row = 0; y < floorY; y += brickH, row++) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    for (let x = row % 2 ? 24 : 0; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + brickH);
      ctx.stroke();
    }
  }
  // Boden
  const floor = ctx.createLinearGradient(0, floorY, 0, height);
  floor.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  floor.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, floorY, width, height - floorY);

  // Korpus: etwas größer als die Tür, mit Tiefe nach rechts.
  const pad = door.w * 0.06;
  const depth = door.w * 0.1;
  const body = { x: door.x - pad, y: door.y - pad, w: door.w + 2 * pad, h: door.h + 2 * pad };
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.beginPath();
  ctx.ellipse(body.x + body.w / 2 + depth / 2, body.y + body.h + 6, body.w * 0.62, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(body.x + body.w, body.y);
  ctx.lineTo(body.x + body.w + depth, body.y + depth * 0.6);
  ctx.lineTo(body.x + body.w + depth, body.y + body.h - depth * 0.2);
  ctx.lineTo(body.x + body.w, body.y + body.h);
  ctx.closePath();
  ctx.clip();
  steel(ctx, p, body.x + body.w, body.y, depth, body.h);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(body.x + body.w, body.y, depth, body.h);
  ctx.restore();
  ctx.save();
  roundRect(ctx, body.x, body.y, body.w, body.h, 10);
  ctx.clip();
  steel(ctx, p, body.x, body.y, body.w, body.h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 2;
  roundRect(ctx, body.x, body.y, body.w, body.h, 10);
  ctx.stroke();
  // Öffnung (dunkel, unter der Tür; sichtbar, wenn sie aufgeht) mit Geld drin.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(door.x, door.y, door.w, door.h);
  return canvas;
}

/** Geldbündel im offenen Tresor. */
export function drawLoot(ctx: CanvasRenderingContext2D, layout: SafeLayout, p: SafePalette, glow: number): void {
  const { door } = layout;
  const shelfY = door.y + door.h * 0.55;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(door.x + door.w * 0.06, shelfY, door.w * 0.88, 4);
  const bw = door.w * 0.2;
  const bh = door.h * 0.07;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const x = door.x + door.w * 0.1 + col * bw * 1.05;
      const y = shelfY - (row + 1) * bh * 1.02;
      ctx.fillStyle = p.money;
      ctx.globalAlpha = 0.55 + 0.1 * ((row + col) % 2);
      ctx.fillRect(x, y, bw, bh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.gold;
      ctx.fillRect(x + bw * 0.42, y, bw * 0.16, bh);
    }
  }
  if (glow > 0) {
    const g = ctx.createRadialGradient(
      door.x + door.w / 2,
      shelfY - bh * 2,
      0,
      door.x + door.w / 2,
      shelfY - bh * 2,
      door.w,
    );
    g.addColorStop(0, `rgba(242, 199, 102, ${0.35 * glow})`);
    g.addColorStop(1, 'rgba(242, 199, 102, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(door.x, door.y, door.w, door.h);
  }
}

/** Tür ohne Zahlenschloss: Stahl, Nieten, Messingschild, Lämpchen-Fassungen, Griff. */
export function renderDoor(layout: SafeLayout, p: SafePalette, dpr: number): HTMLCanvasElement {
  const { door, dial, handle, lamps } = layout;
  const [canvas, ctx] = offscreen(layout.width, layout.height, dpr);
  ctx.save();
  roundRect(ctx, door.x, door.y, door.w, door.h, 8);
  ctx.clip();
  steel(ctx, p, door.x, door.y, door.w, door.h);
  // Kassette: innere Fläche, leicht vertieft.
  const inset = door.w * 0.07;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 3;
  roundRect(ctx, door.x + inset, door.y + inset, door.w - 2 * inset, door.h - 2 * inset, 6);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, door.x + inset + 2, door.y + inset + 2, door.w - 2 * inset - 4, door.h - 2 * inset - 4, 5);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  roundRect(ctx, door.x, door.y, door.w, door.h, 8);
  ctx.stroke();
  // Nieten am Rand
  const rr = Math.max(2.5, door.w * 0.012);
  const step = door.w * 0.1;
  for (let x = door.x + inset / 2; x <= door.x + door.w; x += step) {
    rivet(ctx, x, door.y + inset / 2, rr);
    rivet(ctx, x, door.y + door.h - inset / 2, rr);
  }
  for (let y = door.y + inset / 2 + step; y < door.y + door.h - step / 2; y += step) {
    rivet(ctx, door.x + inset / 2, y, rr);
    rivet(ctx, door.x + door.w - inset / 2, y, rr);
  }
  // Scharniere links
  for (const f of [0.18, 0.82]) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    roundRect(ctx, door.x - door.w * 0.035, door.y + door.h * f - door.h * 0.06, door.w * 0.05, door.h * 0.12, 3);
    ctx.fill();
  }
  // Ring ums Schloss
  const ring = ctx.createRadialGradient(dial.x, dial.y, dial.r * 0.9, dial.x, dial.y, dial.r * 1.22);
  ring.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
  ring.addColorStop(0.5, 'rgba(255, 255, 255, 0.18)');
  ring.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(dial.x, dial.y, dial.r * 1.2, 0, Math.PI * 2);
  ctx.fill();
  // Lämpchen-Fassungen
  for (let i = -1; i <= 1; i++) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.arc(lamps.x + i * lamps.gap, lamps.y, lamps.r * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Griff: Nabe und drei Speichen
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = handle.r * 0.34;
    ctx.beginPath();
    ctx.moveTo(handle.x + 2, handle.y + 3);
    ctx.lineTo(handle.x + Math.cos(a) * handle.r + 2, handle.y + Math.sin(a) * handle.r + 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = handle.r * 0.26;
    ctx.beginPath();
    ctx.moveTo(handle.x, handle.y);
    ctx.lineTo(handle.x + Math.cos(a) * handle.r, handle.y + Math.sin(a) * handle.r);
    ctx.stroke();
    rivet(ctx, handle.x + Math.cos(a) * handle.r, handle.y + Math.sin(a) * handle.r, handle.r * 0.2);
  }
  rivet(ctx, handle.x, handle.y, handle.r * 0.34);
  // Messingschild
  const plateW = door.w * 0.42;
  const plateH = Math.max(16, door.h * 0.04);
  const plateY = door.y + door.h - inset - plateH - door.h * 0.03;
  ctx.fillStyle = p.gold;
  ctx.globalAlpha = 0.82;
  roundRect(ctx, door.x + (door.w - plateW) / 2, plateY, plateW, plateH, 3);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.font = `700 ${Math.round(plateH * 0.5)}px Barlow Condensed, Barlow, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GEBR. STAHL · KÖLN 1962', door.x + door.w / 2, plateY + plateH / 2 + 1);
  return canvas;
}

/** Zifferblatt mit 100 Strichen, Zahlen alle 10 (gedreht wird beim Zusammensetzen). */
export function renderDialFace(r: number, p: SafePalette, dpr: number): HTMLCanvasElement {
  const size = r * 2 + 4;
  const [canvas, ctx] = offscreen(size, size, dpr);
  const c = size / 2;
  const face = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
  face.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  face.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.fillStyle = p.base;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = face;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = p.ink;
  ctx.fillStyle = p.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(r * 0.15)}px Barlow Condensed, Barlow, sans-serif`;
  for (let i = 0; i < DIAL_SIZE; i++) {
    const a = (i / DIAL_SIZE) * Math.PI * 2 - Math.PI / 2;
    const long = i % 10 === 0;
    const mid = i % 5 === 0;
    const inner = r * (long ? 0.8 : mid ? 0.85 : 0.89);
    ctx.globalAlpha = long ? 1 : mid ? 0.85 : 0.55;
    ctx.lineWidth = long ? 2.4 : mid ? 1.8 : 1;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.lineTo(c + Math.cos(a) * r * 0.96, c + Math.sin(a) * r * 0.96);
    ctx.stroke();
    if (long) {
      ctx.globalAlpha = 1;
      ctx.fillText(String(i), c + Math.cos(a) * r * 0.66, c + Math.sin(a) * r * 0.66);
    }
  }
  ctx.globalAlpha = 1;
  // Knauf mit Griffmulden
  const knob = ctx.createRadialGradient(c - r * 0.1, c - r * 0.12, r * 0.05, c, c, r * 0.42);
  knob.addColorStop(0, 'rgba(255, 255, 255, 0.38)');
  knob.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = p.base;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = knob;
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * r * 0.4, c + Math.sin(a) * r * 0.4, r * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

/** Ausschlag am Stethoskop: Wellenlinie, je näher desto höher, Spitzen beim Klicken. */
export function drawWave(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
  amplitude: number,
  spike: number,
  p: SafePalette,
): void {
  ctx.clearRect(0, 0, width, height);
  const mid = height / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(width, mid);
  ctx.stroke();
  const amp = (height / 2 - 3) * Math.min(1, 0.06 + amplitude * 0.9);
  const line = () => {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const k = x / width;
      // Herzschlag-artige Form: Grundschwingung plus eine Spitze, die durchs Bild wandert.
      const beat = Math.exp(-((((k * 4 + phase * 0.6) % 1) - 0.5) ** 2) * 60);
      const y = Math.sin(k * 18 + phase * 6) * 0.35 + beat * 0.9 + Math.sin(k * 47 + phase * 11) * 0.12 * spike;
      if (x === 0) ctx.moveTo(x, mid - y * amp);
      else ctx.lineTo(x, mid - y * amp);
    }
    ctx.stroke();
  };
  // Schein als breite, blasse Linie darunter (shadowBlur wäre zu teuer).
  ctx.strokeStyle = p.gold;
  ctx.globalAlpha = 0.18 + 0.3 * amplitude;
  ctx.lineWidth = 6;
  line();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  line();
}
