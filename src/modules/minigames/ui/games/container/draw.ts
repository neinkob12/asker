// Zeichnen für „Container packen“: Container von oben auf dem Kai (Wellblech-Wände, Holzboden, Türen rechts, oben die
// Seite zum Röntgen-Scanner), darin Ware (verschweißte Blöcke in der Farbe der Ware) und Deckladung (Bananenkisten,
// Fliesenpaletten, Kartons mit Altkleidern). Pro Bild: Teile, Auffälligkeiten, das Teil unter dem Cursor und am Ende
// der Scanner, der einmal über den Container fährt. Farben aus den Design-Tokens (mapToken über readPalette), keine
// freien Farben außer Schwarz/Weiß mit Deckkraft.

import { drawGoodsGlyph, packageLook } from '../../kit/goods';
import type { StashPalette } from '../stash/draw';
import {
  type CellExposure,
  type CoverKind,
  cellsAt,
  FLAG_AT,
  originFor,
  type PackAnalysis,
  type PackPiece,
  type PackSetup,
  type PackState,
  rotate,
} from './model';

export type PackPalette = StashPalette;

/**
 * Lage des Containers auf der Bühne und der Platz für die Leiste. Gezeichnet wird in „Modell-Pixeln“ (Raster links
 * oben bei ox, oy, Türen rechts, Röntgen oben); am Handy steht der Container hochkant (um 90° im Uhrzeigersinn
 * gedreht: Röntgen rechts, Türen unten), dann bildet view die Modell-Pixel auf die Bühne ab.
 */
export interface PackLayout {
  width: number;
  height: number;
  /** Kantenlänge einer Zelle. */
  cell: number;
  /** Linke obere Ecke des Rasters in Modell-Pixeln (innen, ohne Wand). */
  ox: number;
  oy: number;
  /** Wandstärke, Stärke der Türen. */
  wall: number;
  door: number;
  /** Hochkant (Handy). */
  rotated: boolean;
  /** Abbildung Modell → Bühne für ctx.transform(a, b, c, d, e, f). */
  view: readonly [number, number, number, number, number, number];
  /** Leiste mit Teilen und Knöpfen: rechts (Desktop) oder unten (Handy). */
  panel: { side: boolean; x: number; y: number; w: number; h: number };
}

/** Höhe der Leiste unten am Handy: Teile (76) und Knöpfe (56) mit Abständen. */
export const PANEL_HEIGHT_MOBILE = 12 + 76 + 10 + 56 + 12;

/** Platz um das Raster (in Zellen bzw. Wänden): oben Schiene und Warnstreifen, rechts die Türen. */
function margins(cell: number, wall: number, door: number) {
  return { top: wall + cell * 0.72, bottom: wall + cell * 0.38, left: wall + cell * 0.12, right: door + cell * 0.3 };
}

/** Oben Platz für das HUD; rechts (breit) bzw. unten (schmal) für die Leiste. */
export function packLayout(width: number, height: number, cols: number, rows: number): PackLayout {
  const side = width >= 760;
  const top = side ? 92 : 88;
  const sizes = (cell: number) => {
    const wall = Math.max(4, Math.round(cell * 0.26));
    const door = Math.round(wall * 1.6);
    const m = margins(cell, wall, door);
    return { wall, door, m, w: m.left + cols * cell + m.right, h: m.top + rows * cell + m.bottom };
  };
  if (side) {
    const panelW = 300;
    const gap = 28;
    const availW = width - panelW - gap - 48;
    const availH = height - top - 32;
    const cell = Math.floor(Math.max(18, Math.min(72, availW / (cols + 1.1), availH / (rows + 1.6))));
    const { wall, door, m, w, h } = sizes(cell);
    const left = Math.max(24, (width - (w + gap + panelW)) / 2);
    const blockTop = top + Math.max(0, (availH - h) / 2);
    return {
      width,
      height,
      cell,
      ox: left + m.left,
      oy: blockTop + m.top,
      wall,
      door,
      rotated: false,
      view: [1, 0, 0, 1, 0, 0],
      panel: { side, x: left + w + gap, y: blockTop, w: panelW, h: Math.max(200, height - blockTop - 24) },
    };
  }
  // Am Handy hochkant: Breite auf dem Schirm = Höhe im Modell und umgekehrt.
  const panelY = height - PANEL_HEIGHT_MOBILE - 8;
  const availW = width - 24;
  const availH = panelY - top - 12;
  const cell = Math.floor(Math.max(16, Math.min(64, availW / (rows + 1.6), availH / (cols + 1.1))));
  const { wall, door, m, w, h } = sizes(cell);
  const screenLeft = (width - h) / 2;
  const screenTop = top + Math.max(0, (availH - w) / 2);
  return {
    width,
    height,
    cell,
    ox: m.left,
    oy: m.top,
    wall,
    door,
    rotated: true,
    // x' = e − y, y' = f + x: oben im Modell (Röntgen) ist rechts, rechts (Türen) ist unten.
    view: [0, 1, -1, 0, screenLeft + h, screenTop],
    panel: { side, x: 8, y: panelY, w: width - 16, h: PANEL_HEIGHT_MOBILE },
  };
}

/** Modell-Pixel → Bühne. */
export function toScreen(l: PackLayout, mx: number, my: number): { x: number; y: number } {
  const [a, b, c, d, e, f] = l.view;
  return { x: a * mx + c * my + e, y: b * mx + d * my + f };
}

/** Bühne → Modell-Pixel. */
export function toModel(l: PackLayout, px: number, py: number): { x: number; y: number } {
  if (!l.rotated) return { x: px, y: py };
  const [, , , , e, f] = l.view;
  return { x: py - f, y: e - px };
}

/** Zelle unter einem Punkt auf der Bühne (CSS-Pixel), auch außerhalb des Rasters. */
export function cellAt(l: PackLayout, px: number, py: number): { x: number; y: number } {
  const m = toModel(l, px, py);
  return { x: Math.floor((m.x - l.ox) / l.cell), y: Math.floor((m.y - l.oy) / l.cell) };
}

/** Modell-Abbildung auf den Kontext legen (vorher save, danach restore). */
function applyView(ctx: CanvasRenderingContext2D, l: PackLayout): void {
  const [a, b, c, d, e, f] = l.view;
  ctx.transform(a, b, c, d, e, f);
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

/** Feste Struktur (Zähler statt Math.random: gleiches Bild bei jedem Neuaufbau). */
function grain(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha: number): void {
  let n = 11;
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  const count = Math.round((w * h) / 70);
  for (let i = 0; i < count; i++) {
    n = (n * 9301 + 49297) % 233280;
    const px = x + (n / 233280) * w;
    n = (n * 9301 + 49297) % 233280;
    const py = y + (n / 233280) * h;
    ctx.fillRect(px, py, 1, 1);
  }
}

/** Gelb-schwarze Warnstreifen in einem Rechteck. */
function hazard(ctx: CanvasRenderingContext2D, p: PackPalette, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = p.gold;
  ctx.globalAlpha = 0.75;
  const step = h * 1.6;
  for (let sx = x - h; sx < x + w + h; sx += step) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.lineTo(sx + h + step / 2, y);
    ctx.lineTo(sx + step / 2, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Hintergrund (nach jeder Größenänderung einmal): Kai mit Asphalt und Markierung, Scanner-Schiene oben, Container mit
 * Wellblech, Holzboden, Raster, Türen rechts, sanft markierte Zonen (Türspalte, Reihe an der Röntgen-Seite).
 */
export function renderBackground(l: PackLayout, p: PackPalette, setup: PackSetup, dpr: number): HTMLCanvasElement {
  const [canvas, ctx] = offscreen(l.width, l.height, dpr);
  const { cell, ox, oy, wall, door } = l;
  const gw = setup.cols * cell;
  const gh = setup.rows * cell;
  // Kai.
  ctx.fillStyle = p.base;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(0, 0, l.width, l.height);
  grain(ctx, 0, 0, l.width, l.height, 0.03);
  ctx.save();
  applyView(ctx, l);
  // Fahrspur des Scanners: zwei Schienen über und unter dem Container.
  const railTop = oy - wall - Math.round(cell * 0.66);
  const railBottom = oy + gh + wall + Math.round(cell * 0.18);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fillRect(ox - wall - cell * 0.3, railTop, gw + wall + door + cell * 0.6, Math.max(5, cell * 0.1));
  ctx.fillRect(ox - wall - cell * 0.3, railBottom, gw + wall + door + cell * 0.6, Math.max(5, cell * 0.1));
  // Seite zum Röntgen: Warnstreifen vor der Wand.
  hazard(ctx, p, ox - wall, railTop + Math.max(5, cell * 0.1) + 3, gw + wall + door, Math.max(6, cell * 0.15));
  // Schatten unter dem Container.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, ox - wall + 5, oy - wall + 7, gw + wall + door, gh + wall * 2, 6);
  ctx.fill();
  // Wände (Wellblech) in Container-Blau.
  ctx.fillStyle = p.place;
  ctx.globalAlpha = 0.42;
  roundRect(ctx, ox - wall, oy - wall, gw + wall + door, gh + wall * 2, 4);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRect(ctx, ox - wall, oy - wall, gw + wall + door, gh + wall * 2, 4);
  ctx.fill();
  ctx.strokeStyle = p.place;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1;
  const rib = Math.max(5, cell * 0.16);
  ctx.beginPath();
  for (let x = ox - wall + rib / 2; x < ox + gw; x += rib) {
    ctx.moveTo(x, oy - wall + 1);
    ctx.lineTo(x, oy - 1);
    ctx.moveTo(x, oy + gh + 1);
    ctx.lineTo(x, oy + gh + wall - 1);
  }
  for (let y = oy + rib / 2; y < oy + gh; y += rib) {
    ctx.moveTo(ox - wall + 1, y);
    ctx.lineTo(ox - 1, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Holzboden mit Dielen.
  ctx.fillStyle = p.goods;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(ox, oy, gw, gh);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fillRect(ox, oy, gw, gh);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const plank = cell / 3;
  for (let y = oy + plank; y < oy + gh; y += plank) {
    ctx.moveTo(ox, y);
    ctx.lineTo(ox + gw, y);
  }
  ctx.stroke();
  grain(ctx, ox, oy, gw, gh, 0.05);
  // Zonen: Türspalte und Reihe an der Röntgen-Seite (hier fällt Ware sofort auf).
  ctx.fillStyle = p.danger;
  ctx.globalAlpha = 0.09;
  ctx.fillRect(ox + gw - cell, oy, cell, gh);
  ctx.fillRect(ox, oy, gw - cell, cell);
  ctx.globalAlpha = 1;
  // Raster.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  for (let x = 1; x < setup.cols; x++) {
    ctx.moveTo(ox + x * cell + 0.5, oy);
    ctx.lineTo(ox + x * cell + 0.5, oy + gh);
  }
  for (let y = 1; y < setup.rows; y++) {
    ctx.moveTo(ox, oy + y * cell + 0.5);
    ctx.lineTo(ox + gw, oy + y * cell + 0.5);
  }
  ctx.stroke();
  // Türen rechts: die Stirnwand mit zwei Flügeln, Mittelspalt und Verschlussstangen.
  const dx = ox + gw;
  ctx.fillStyle = p.place;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(dx, oy - wall, door, gh + wall * 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(dx, oy - wall, door, gh + wall * 2);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, oy + gh / 2);
  ctx.lineTo(dx + door, oy + gh / 2);
  ctx.stroke();
  ctx.strokeStyle = p.gold;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = Math.max(2, cell * 0.06);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const f of [0.14, 0.36, 0.64, 0.86]) {
    ctx.moveTo(dx + door * 0.2, oy + gh * f);
    ctx.lineTo(dx + door + cell * 0.18, oy + gh * f);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
  ctx.restore();
  return canvas;
}

/** Farbe und Muster eines Teils. */
export function pieceColor(p: PackPalette, piece: Pick<PackPiece, 'kind' | 'productId'>, cover: CoverKind): string {
  if (piece.kind === 'goods') return packageLook(p, piece.productId).color;
  return cover === 'bananas' ? p.gold : cover === 'tiles' ? p.ink2 : p.goods;
}

/**
 * Ein Teil als zusammenhängender Block: Zellen gefüllt, Kanten nur außen, Muster je Art (Ware verschweißt mit
 * Klebeband und Symbol, Bananenkiste mit Grifflöchern, Fliesenpalette mit Fugen, Karton mit Klebestreifen).
 */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  p: PackPalette,
  l: PackLayout,
  piece: PackPiece,
  cells: readonly (readonly [number, number])[],
  cover: CoverKind,
  opts: { alpha?: number; outline?: string; lift?: number; dashed?: boolean } = {},
): void {
  const { cell, ox, oy } = l;
  const color = pieceColor(p, piece, cover);
  const inset = Math.max(1.5, cell * 0.05);
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  const lift = opts.lift ?? 0;
  // Schatten.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (const [x, y] of cells) {
    ctx.fillRect(
      ox + x * cell + inset + 2 + lift,
      oy + y * cell + inset + 3 + lift,
      cell - inset * 2,
      cell - inset * 2,
    );
  }
  // Fläche: jede Zelle bis an die Nachbarzellen desselben Teils.
  const rect = (x: number, y: number) => {
    const l0 = has(x - 1, y) ? 0 : inset;
    const r0 = has(x + 1, y) ? 0 : inset;
    const t0 = has(x, y - 1) ? 0 : inset;
    const b0 = has(x, y + 1) ? 0 : inset;
    return [ox + x * cell + l0, oy + y * cell + t0, cell - l0 - r0, cell - t0 - b0] as const;
  };
  ctx.fillStyle = color;
  for (const [x, y] of cells) {
    const [rx, ry, rw, rh] = rect(x, y);
    ctx.fillRect(rx, ry, rw, rh);
  }
  // Abdunkeln (Ware weniger, Deckladung mehr), damit die Farben nicht schreien.
  ctx.fillStyle =
    piece.kind === 'goods' ? 'rgba(0, 0, 0, 0.08)' : cover === 'none' ? 'rgba(0, 0, 0, 0.55)' : 'rgba(0, 0, 0, 0.42)';
  for (const [x, y] of cells) {
    const [rx, ry, rw, rh] = rect(x, y);
    ctx.fillRect(rx, ry, rw, rh);
  }
  // Muster.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.lineWidth = Math.max(1, cell * 0.035);
  for (const [x, y] of cells) {
    const cx = ox + (x + 0.5) * cell;
    const cy = oy + (y + 0.5) * cell;
    if (piece.kind === 'goods') {
      // In Folie verschweißt: Glanz, Klebeband diagonal, rundes Etikett mit dem Symbol der Ware.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.beginPath();
      ctx.moveTo(cx - cell * 0.42, cy - cell * 0.2);
      ctx.lineTo(cx - cell * 0.2, cy - cell * 0.42);
      ctx.lineTo(cx - cell * 0.08, cy - cell * 0.42);
      ctx.lineTo(cx - cell * 0.42, cy - cell * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(cx, cy);
      // Hochkant (Handy): Symbol trotzdem aufrecht.
      if (l.rotated) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.beginPath();
      ctx.arc(0, 0, cell * 0.24, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(1.2, cell * 0.04);
      ctx.lineJoin = 'round';
      drawGoodsGlyph(ctx, packageLook(p, piece.productId).glyph, cell * 0.15);
      ctx.restore();
    } else if (cover === 'bananas') {
      // Kiste mit Griffloch und Aufdruck.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      roundRect(ctx, cx - cell * 0.14, cy - cell * 0.3, cell * 0.28, cell * 0.08, cell * 0.04);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(cx, cy - cell * 0.02, cell * 0.2, 0.25 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else if (cover === 'tiles') {
      // Fliesen in Stapeln mit Fugen.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.beginPath();
      for (const f of [-0.17, 0.17]) {
        ctx.moveTo(cx + f * cell, oy + y * cell + inset);
        ctx.lineTo(cx + f * cell, oy + (y + 1) * cell - inset);
        ctx.moveTo(ox + x * cell + inset, cy + f * cell);
        ctx.lineTo(ox + (x + 1) * cell - inset, cy + f * cell);
      }
      ctx.stroke();
    } else {
      // Karton mit Klebestreifen längs.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(cx - cell * 0.07, oy + y * cell + inset, cell * 0.14, cell - inset * 2);
    }
  }
  // Außenkanten.
  ctx.strokeStyle = opts.outline ?? (piece.kind === 'goods' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.55)');
  ctx.lineWidth = opts.dashed ? 3 : opts.outline || piece.kind === 'goods' ? 2 : 1;
  if (opts.dashed) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([6, 4]);
  }
  ctx.beginPath();
  for (const [x, y] of cells) {
    const [rx, ry, rw, rh] = rect(x, y);
    if (!has(x, y - 1)) {
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + rw, ry);
    }
    if (!has(x, y + 1)) {
      ctx.moveTo(rx, ry + rh);
      ctx.lineTo(rx + rw, ry + rh);
    }
    if (!has(x - 1, y)) {
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx, ry + rh);
    }
    if (!has(x + 1, y)) {
      ctx.moveTo(rx + rw, ry);
      ctx.lineTo(rx + rw, ry + rh);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export interface PackFx {
  t: number;
  reduced: boolean;
  running: boolean;
  /** Teil unter dem Cursor zeigen (Maus über dem Raster, Ziehen, Tastatur). */
  ghost: boolean;
  /** Eben abgelegt (Aufblitzen), pieceId und Zeit. */
  dropped: { id: number; at: number } | null;
  /** Abgelehnt (rotes Aufblitzen am Cursor). */
  reject: number;
  /** Scanner: −1 = noch nicht, sonst 0 bis 1 über den Container. */
  scan: number;
}

/** Ein Rahmen um Zellen mit Lücke bzw. Wand, an der die Ware auffällt (live, sanft pulsierend). */
function drawExposure(
  ctx: CanvasRenderingContext2D,
  p: PackPalette,
  l: PackLayout,
  cells: readonly CellExposure[],
  pulse: number,
): void {
  const { cell, ox, oy } = l;
  ctx.save();
  ctx.strokeStyle = p.danger;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, cell * 0.07);
  for (const c of cells) {
    if (c.value < 0.25) continue;
    ctx.globalAlpha = (0.35 + 0.45 * c.value) * pulse;
    const x0 = ox + c.x * cell;
    const y0 = oy + c.y * cell;
    const m = cell * 0.14;
    ctx.beginPath();
    for (const g of c.gaps) {
      if (g === 'up') {
        ctx.moveTo(x0 + m, y0 + 2);
        ctx.lineTo(x0 + cell - m, y0 + 2);
      } else if (g === 'down') {
        ctx.moveTo(x0 + m, y0 + cell - 2);
        ctx.lineTo(x0 + cell - m, y0 + cell - 2);
      } else if (g === 'left') {
        ctx.moveTo(x0 + 2, y0 + m);
        ctx.lineTo(x0 + 2, y0 + cell - m);
      } else {
        ctx.moveTo(x0 + cell - 2, y0 + m);
        ctx.lineTo(x0 + cell - 2, y0 + cell - m);
      }
    }
    ctx.stroke();
    if (c.reasons.includes('door') || c.reasons.includes('xray') || c.reasons.includes('cluster')) {
      // Zelle schraffiert: hier sieht man die Ware sofort.
      ctx.globalAlpha = 0.28 * pulse;
      ctx.fillStyle = p.danger;
      ctx.fillRect(x0 + 2, y0 + 2, cell - 4, cell - 4);
    }
  }
  ctx.restore();
}

/** Röntgen: Bild hinter dem Balken (Ware hell, Deckladung dunkel, Auffälliges rot), der Balken selbst. */
function drawScan(
  ctx: CanvasRenderingContext2D,
  p: PackPalette,
  l: PackLayout,
  setup: PackSetup,
  state: PackState,
  analysis: PackAnalysis,
  scan: number,
  t: number,
): void {
  const { cell, ox, oy, wall } = l;
  const gw = setup.cols * cell;
  const gh = setup.rows * cell;
  const bx = ox - wall + (gw + wall + l.door) * Math.min(1, scan);
  ctx.save();
  // Bild des Scanners links vom Balken.
  ctx.beginPath();
  ctx.rect(ox - wall, oy - wall, bx - (ox - wall), gh + wall * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(4, 12, 24, 0.82)';
  ctx.fillRect(ox - wall, oy - wall, gw + wall + l.door, gh + wall * 2);
  const exposure = new Map(analysis.cells.map((c) => [`${c.x},${c.y}`, c.value]));
  for (let y = 0; y < setup.rows; y++) {
    for (let x = 0; x < setup.cols; x++) {
      const id = state.grid[y * setup.cols + x];
      if (id < 0) continue;
      const goods = setup.pieces[id].kind === 'goods';
      const v = exposure.get(`${x},${y}`) ?? 0;
      ctx.fillStyle = goods && v >= FLAG_AT ? p.danger : p.sky;
      ctx.globalAlpha = goods ? (v >= FLAG_AT ? 0.85 : 0.18 + 0.4 * v) : 0.1;
      ctx.fillRect(ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4);
    }
  }
  ctx.restore();
  // Der Balken: Portal mit Strahl.
  if (scan < 1) {
    ctx.save();
    const glow = ctx.createLinearGradient(bx - cell * 0.8, 0, bx + 4, 0);
    glow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    glow.addColorStop(1, p.sky);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = glow;
    ctx.fillRect(bx - cell * 0.8, oy - wall, cell * 0.8, gh + wall * 2);
    ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 40);
    ctx.fillStyle = p.sky;
    ctx.fillRect(bx - 1.5, oy - wall - cell * 0.5, 3, gh + wall * 2 + cell * 0.7);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.base;
    ctx.strokeStyle = p.sky;
    ctx.lineWidth = 2;
    roundRect(ctx, bx - cell * 0.35, oy - wall - cell * 0.75, cell * 0.7, cell * 0.36, 4);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, bx - cell * 0.35, oy + gh + wall + cell * 0.05, cell * 0.7, cell * 0.36, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/** Ein Bild: Hintergrund, Teile, Auffälligkeiten, Teil unter dem Cursor, Scanner. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  l: PackLayout,
  p: PackPalette,
  setup: PackSetup,
  state: PackState,
  analysis: PackAnalysis,
  bg: HTMLCanvasElement,
  fx: PackFx,
): void {
  ctx.clearRect(0, 0, l.width, l.height);
  ctx.drawImage(bg, 0, 0, l.width, l.height);
  ctx.save();
  applyView(ctx, l);
  for (const pl of state.placed) {
    const piece = setup.pieces[pl.pieceId];
    const cells = cellsAt(piece, pl.rot, pl.x, pl.y);
    const fresh = fx.dropped && fx.dropped.id === pl.pieceId ? Math.max(0, 1 - (fx.t - fx.dropped.at) / 0.35) : 0;
    drawPiece(ctx, p, l, piece, cells, setup.cover, {
      outline: fresh > 0 ? p.gold : undefined,
      lift: fresh * (fx.reduced ? 0 : 3),
    });
  }
  const pulse = fx.reduced ? 1 : 0.75 + 0.25 * Math.sin(fx.t * 5);
  if (fx.scan < 0) drawExposure(ctx, p, l, analysis.cells, pulse);
  // Teil unter dem Cursor.
  const sel = setup.pieces[state.selected];
  if (fx.running && fx.ghost && sel && !state.done && fx.scan < 0) {
    const { x, y } = ghostOrigin(sel, state);
    const cells = cellsAt(sel, state.rot, x, y);
    const ok = cells.every(
      ([cx, cy]) => cx >= 0 && cy >= 0 && cx < setup.cols && cy < setup.rows && state.grid[cy * setup.cols + cx] === -1,
    );
    const risky = sel.kind === 'goods' && cells.some(([cx, cy]) => cx === setup.cols - 1 || cy === 0);
    const shake = !fx.reduced && fx.t - fx.reject < 0.25 ? Math.sin((fx.t - fx.reject) * 80) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    drawPiece(ctx, p, l, sel, cells, setup.cover, {
      alpha: 0.55,
      outline: !ok ? p.danger : risky ? p.warn : p.money,
      lift: fx.reduced ? 0 : 4,
      dashed: true,
    });
    ctx.restore();
  }
  if (fx.scan >= 0) drawScan(ctx, p, l, setup, state, analysis, fx.scan, fx.t);
  ctx.restore();
}

/** Linke obere Ecke des ausgewählten Teils am Cursor (Mitte der Form auf der Cursor-Zelle). */
export function ghostOrigin(piece: PackPiece, state: PackState): { x: number; y: number } {
  return originFor(rotate(piece.shape, state.rot), state.cursor.x, state.cursor.y);
}
