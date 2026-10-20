// Zeichnen für „Container packen“ (Auftrag 44, Teil 7; Licht und Material: Auftrag 48): Container von oben auf dem
// Kai. Beton mit Fugen und Markierung, Schienen für den Röntgen-Scanner, Container aus Wellblech mit Eckbeschlägen,
// Holzboden aus Dielen, Schatten der Wände, Türen rechts mit Verschlussstangen, Licht einer Hafenlampe. Ware als
// verschweißte Blöcke (Folie mit Glanz, Klebeband, Etikett mit dem Symbol der Ware), Deckladung als Bananenkisten,
// Fliesen auf Paletten oder Kartons mit Altkleidern; jedes Teil mit Kante, Licht und weichem Schatten.
//
// Teure Dinge (Hintergrund mit Kranschatten und Vignette, jedes Teil als Bild) entstehen einmal je Größe in
// createPackArt; pro Bild werden nur Bilder kopiert, dazu Staub, Fallen, Siegel, Vorschau und der Scanner. Farben der Dinge (Stahl, Holz,
// Pappe, Beton) sind Inhalt wie Haut- und Papierfarben (PACK_MATERIALS); Bedeutungsfarben (Ware, Gefahr, gut) kommen
// aus den Design-Tokens (mapToken über readPalette).

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

/** Farben der Dinge (Inhalt, keine Bedeutung): Container-Stahl, Holzboden, Beton, Pappe, Paletten, Folie. */
export const PACK_MATERIALS = {
  steel: '#2c5a86',
  steelDark: '#152c45',
  steelLight: '#6c9ccb',
  floor: '#7b5535',
  floorDark: '#3e2816',
  floorLight: '#a5774c',
  quay: '#45474a',
  quayDark: '#28292b',
  paint: '#d9b13b',
  rail: '#8f959c',
  kraft: '#b88a55',
  kraftDark: '#7d5a33',
  bananaPrint: '#f0c93a',
  bananaInk: '#2a4f9a',
  pallet: '#a07a4c',
  tile: '#b8b1a6',
  tileDark: '#7d776e',
  carton: '#9a7448',
  tape: '#e6d6a8',
  marker: '#262626',
  lamp: '#ffc47a',
  foil: '#1b1d21',
  sticker: '#efe7d4',
  xray: '#06182c',
} as const;

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
  /** Licht im Modell (Einheitsvektor, woher es kommt): auf dem Schirm immer von links oben. */
  light: { x: number; y: number };
}

/** Höhe der Leiste unten am Handy: Teile (76) und Knöpfe (56) mit Abständen. */
export const PANEL_HEIGHT_MOBILE = 12 + 76 + 10 + 56 + 12;

/** Platz um das Raster: oben Schiene und Warnstreifen, links der geparkte Scanner, rechts die Türen. */
function margins(cell: number, wall: number, door: number) {
  return { top: wall + cell * 0.72, bottom: wall + cell * 0.38, left: wall + cell * 0.62, right: door + cell * 0.3 };
}

/** Breite der Ränder in Zellen (ungefähr, für die Wahl der Zellgröße). */
const EXTRA_W = 1.85;
const EXTRA_H = 1.6;

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
  const s2 = Math.SQRT1_2;
  if (side) {
    const panelW = 300;
    const gap = 28;
    const availW = width - panelW - gap - 48;
    const availH = height - top - 32;
    const cell = Math.floor(Math.max(18, Math.min(72, availW / (cols + EXTRA_W), availH / (rows + EXTRA_H))));
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
      light: { x: -s2, y: -s2 },
    };
  }
  // Am Handy hochkant: Breite auf dem Schirm = Höhe im Modell und umgekehrt.
  const panelY = height - PANEL_HEIGHT_MOBILE - 8;
  const availW = width - 24;
  const availH = panelY - top - 12;
  const cell = Math.floor(Math.max(16, Math.min(64, availW / (rows + EXTRA_H), availH / (cols + EXTRA_W))));
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
    // Licht von links oben auf dem Schirm ist im gedrehten Modell links unten.
    light: { x: -s2, y: s2 },
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

/** Fester Zufall (Zähler statt Math.random: gleiches Bild bei jedem Neuaufbau). */
function lcg(seed: number): () => number {
  let n = Math.abs(Math.round(seed)) % 233280 || 11;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

/** Körnung: helle und dunkle Punkte (je Farbe ein Pfad, sonst kostet jeder Punkt einen Farbwechsel). */
function grain(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha: number,
  seed = 11,
  density = 70,
): void {
  const rnd = lcg(seed);
  const count = Math.round((w * h) / density);
  const light = new Path2D();
  const dark = new Path2D();
  for (let i = 0; i < count; i++) {
    const px = x + rnd() * w;
    const py = y + rnd() * h;
    (rnd() < 0.5 ? light : dark).rect(px, py, 1, 1);
  }
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill(light);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 1.4})`;
  ctx.fill(dark);
}

/** Farbe mit Deckkraft (#rrggbb oder rgb(…)). */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((v) => Number.parseFloat(v));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

/** Gelb-schwarze Warnstreifen in einem Rechteck. */
function hazard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PACK_MATERIALS.paint;
  ctx.globalAlpha = 0.8;
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
  // Abrieb.
  ctx.globalAlpha = 1;
  grain(ctx, x, y, w, h, 0.18, 5, 6);
  ctx.restore();
}

/** Wellblech als Muster: Rippen quer zur Richtung (horizontal: Rippen senkrecht). */
function corrugation(ctx: CanvasRenderingContext2D, rib: number, horizontal: boolean): CanvasPattern | null {
  const m = PACK_MATERIALS;
  const size = Math.max(4, Math.round(rib));
  const tile = document.createElement('canvas');
  tile.width = horizontal ? size : 1;
  tile.height = horizontal ? 1 : size;
  const t = tile.getContext('2d') as CanvasRenderingContext2D;
  const g = horizontal ? t.createLinearGradient(0, 0, size, 0) : t.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, m.steelDark);
  g.addColorStop(0.3, m.steel);
  g.addColorStop(0.5, m.steelLight);
  g.addColorStop(0.7, m.steel);
  g.addColorStop(1, m.steelDark);
  t.fillStyle = g;
  t.fillRect(0, 0, tile.width, tile.height);
  return ctx.createPattern(tile, 'repeat');
}

/** Eckbeschlag (Corner Casting) mit Langloch. */
function casting(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, '#5d6670');
  g.addColorStop(1, '#22272d');
  ctx.fillStyle = g;
  roundRect(ctx, x, y, s, s, s * 0.18);
  ctx.fill();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  roundRect(ctx, x + s * 0.28, y + s * 0.38, s * 0.44, s * 0.24, s * 0.12);
  ctx.fill();
}

/**
 * Hintergrund (nach jeder Größenänderung einmal): Kai aus Beton mit Fugen, Ölflecken und Markierung, Lichtkegel der
 * Hafenlampe, Schienen des Scanners mit Schwellen, Container mit Schlagschatten, Wellblech-Wänden, Eckbeschlägen,
 * Holzboden mit Dielen und Nägeln, Schatten der Wände auf dem Boden, rot getönte Zonen (Türspalte, Röntgen-Reihe),
 * Raster aus Kreide, Türen rechts mit Verschlussstangen.
 */
export function renderBackground(l: PackLayout, p: PackPalette, setup: PackSetup, dpr: number): HTMLCanvasElement {
  const m = PACK_MATERIALS;
  const [canvas, ctx] = offscreen(l.width, l.height, dpr);
  const { cell, ox, oy, wall, door } = l;
  const gw = setup.cols * cell;
  const gh = setup.rows * cell;
  const rnd = lcg(setup.cols * 131 + setup.rows * 17 + setup.pieces.length);
  // Kai: Beton, dunkel nach unten, Flecken.
  const quay = ctx.createLinearGradient(0, 0, 0, l.height);
  quay.addColorStop(0, m.quay);
  quay.addColorStop(1, m.quayDark);
  ctx.fillStyle = quay;
  ctx.fillRect(0, 0, l.width, l.height);
  for (let i = 0; i < 14; i++) {
    const x = rnd() * l.width;
    const y = rnd() * l.height;
    const r = 40 + rnd() * 160;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.6;
    spot.addColorStop(0, dark ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.05)');
    spot.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Ölflecken.
  for (let i = 0; i < 4; i++) {
    const x = rnd() * l.width;
    const y = rnd() * l.height;
    ctx.fillStyle = 'rgba(8, 6, 4, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x, y, 10 + rnd() * 26, 6 + rnd() * 14, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  grain(ctx, 0, 0, l.width, l.height, 0.05, 3, 26);
  // Fugen der Betonplatten.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.lineWidth = 1.5;
  const slab = Math.max(120, cell * 3.4);
  ctx.beginPath();
  for (let x = (l.width % slab) / 2; x < l.width; x += slab) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, l.height);
  }
  for (let y = (l.height % slab) / 2; y < l.height; y += slab) {
    ctx.moveTo(0, y);
    ctx.lineTo(l.width, y);
  }
  ctx.stroke();
  // Lichtkegel der Hafenlampe (oben links auf dem Schirm, warm).
  const lamp = ctx.createRadialGradient(
    l.width * 0.18,
    l.height * 0.08,
    10,
    l.width * 0.3,
    l.height * 0.3,
    Math.max(l.width, l.height) * 0.9,
  );
  lamp.addColorStop(0, withAlpha(m.lamp, 0.2));
  lamp.addColorStop(0.45, withAlpha(m.lamp, 0.06));
  lamp.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, l.width, l.height);

  ctx.save();
  applyView(ctx, l);
  // Gelbe Fahrspur-Markierung unter dem Container (verblasst).
  ctx.strokeStyle = withAlpha(m.paint, 0.35);
  ctx.lineWidth = Math.max(3, cell * 0.08);
  ctx.setLineDash([cell * 0.9, cell * 0.5]);
  ctx.beginPath();
  ctx.moveTo(ox - wall - cell * 2, oy + gh + wall + cell * 0.32);
  ctx.lineTo(ox + gw + door + cell * 3, oy + gh + wall + cell * 0.32);
  ctx.stroke();
  ctx.setLineDash([]);
  // Schienen des Scanners: Schwellen, dann Stahlschienen mit Glanz.
  const railLen = gw + wall + door + cell * 4;
  const railX = ox - wall - cell * 2;
  const railW = Math.max(4, cell * 0.09);
  const rails = [oy - wall - Math.round(cell * 0.66), oy + gh + wall + Math.round(cell * 0.12)];
  for (const ry of rails) {
    ctx.fillStyle = 'rgba(30, 22, 16, 0.75)';
    for (let x = railX; x < railX + railLen; x += cell * 0.42)
      ctx.fillRect(x, ry - railW * 0.9, cell * 0.16, railW * 2.8);
    const rg = ctx.createLinearGradient(0, ry, 0, ry + railW);
    rg.addColorStop(0, '#c9ced4');
    rg.addColorStop(0.5, m.rail);
    rg.addColorStop(1, '#3b3f44');
    ctx.fillStyle = rg;
    ctx.fillRect(railX, ry, railLen, railW);
  }
  // Seite zum Röntgen: Warnstreifen vor der Wand.
  hazard(ctx, ox - wall, rails[0] + railW + 3, gw + wall + door, Math.max(6, cell * 0.15));
  // Schlagschatten des Containers (weich, vom Licht weg).
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = cell * 0.5 * dpr;
  // Schatten-Versatz ist in Gerätepixeln und nicht gedreht: auf dem Schirm immer nach rechts unten.
  ctx.shadowOffsetX = cell * 0.16 * dpr;
  ctx.shadowOffsetY = cell * 0.22 * dpr;
  ctx.fillStyle = m.steelDark;
  roundRect(ctx, ox - wall, oy - wall, gw + wall + door, gh + wall * 2, 4);
  ctx.fill();
  ctx.restore();
  // Wände: Wellblech (lange Seiten mit senkrechten Rippen, Stirnseite links mit waagerechten).
  const rib = Math.max(5, cell * 0.17);
  const ribsX = corrugation(ctx, rib, true);
  const ribsY = corrugation(ctx, rib, false);
  if (ribsX) {
    ctx.fillStyle = ribsX;
    ctx.fillRect(ox - wall, oy - wall, gw + wall, wall);
    ctx.fillRect(ox - wall, oy + gh, gw + wall, wall);
  }
  if (ribsY) {
    ctx.fillStyle = ribsY;
    ctx.fillRect(ox - wall, oy, wall, gh);
  }
  // Licht auf den Wänden: die zum Licht hin heller, die abgewandten dunkler; Oberkante als Glanzlinie.
  const lit = (x: number, y: number, w: number, h: number, facing: number) => {
    ctx.fillStyle = facing > 0 ? `rgba(255, 255, 255, ${0.12 * facing})` : `rgba(0, 0, 0, ${-0.35 * facing})`;
    ctx.fillRect(x, y, w, h);
  };
  lit(ox - wall, oy - wall, gw + wall, wall, -l.light.y);
  lit(ox - wall, oy + gh, gw + wall, wall, l.light.y);
  lit(ox - wall, oy, wall, gh, -l.light.x);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(ox - wall + 0.5, oy - wall + 0.5, gw + wall + door - 1, gh + wall * 2 - 1);
  // Rost und Abrieb an den Wänden.
  grain(ctx, ox - wall, oy - wall, gw + wall, wall, 0.14, 7, 9);
  grain(ctx, ox - wall, oy + gh, gw + wall, wall, 0.14, 8, 9);
  for (let i = 0; i < 6; i++) {
    const rx = ox - wall + rnd() * (gw + wall);
    const ry = rnd() < 0.5 ? oy - wall : oy + gh;
    ctx.fillStyle = 'rgba(120, 60, 25, 0.35)';
    ctx.fillRect(rx, ry + wall * 0.15, 2 + rnd() * cell * 0.4, wall * 0.7);
  }
  // Holzboden: Dielen längs, jede mit eigenem Ton, Maserung, Stöße versetzt, Nagelreihen.
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, gw, gh);
  ctx.clip();
  ctx.fillStyle = m.floor;
  ctx.fillRect(ox, oy, gw, gh);
  const plank = cell / 3;
  for (let y = oy; y < oy + gh; y += plank) {
    // Stöße: jede Diele in zwei bis drei Stücken.
    let x = ox - rnd() * cell * 2;
    while (x < ox + gw) {
      const len = cell * (2.5 + rnd() * 3);
      const tone = rnd();
      ctx.fillStyle =
        tone < 0.33
          ? withAlpha(m.floorLight, 0.35)
          : tone < 0.66
            ? withAlpha(m.floorDark, 0.28)
            : 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(x, y, len, plank);
      // Maserung.
      ctx.strokeStyle = 'rgba(40, 22, 10, 0.22)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const gy = y + plank * (0.2 + rnd() * 0.6);
        const amp = 0.6 + rnd() * 1.2;
        const ph = rnd() * 6;
        ctx.moveTo(x, gy);
        for (let gx = x; gx <= x + len; gx += 8) ctx.lineTo(gx, gy + Math.sin(gx * 0.05 + ph) * amp);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x + len - 1, y, 1.2, plank);
      x += len;
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(ox, y, gw, 1);
    ctx.fillStyle = 'rgba(255, 220, 170, 0.06)';
    ctx.fillRect(ox, y + 1, gw, 1);
  }
  // Nagelreihen über den Querträgern.
  ctx.fillStyle = 'rgba(20, 14, 10, 0.55)';
  for (let x = ox + cell * 0.5; x < ox + gw; x += cell) {
    for (let y = oy + plank / 2; y < oy + gh; y += plank) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.8, cell * 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grain(ctx, ox, oy, gw, gh, 0.06, 13, 14);
  // Schatten der Wände auf dem Boden (vom Licht weg) und dunkle Ecken.
  const deep = cell * 0.55;
  const soft = cell * 0.25;
  // Oben (y = oy) und unten, links und rechts: der Wand zum Licht hin wirft den langen Schatten.
  const g1 = ctx.createLinearGradient(0, oy, 0, oy + (l.light.y < 0 ? deep : soft));
  g1.addColorStop(0, `rgba(0, 0, 0, ${l.light.y < 0 ? 0.55 : 0.3})`);
  g1.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g1;
  ctx.fillRect(ox, oy, gw, deep);
  const g2 = ctx.createLinearGradient(0, oy + gh, 0, oy + gh - (l.light.y > 0 ? deep : soft));
  g2.addColorStop(0, `rgba(0, 0, 0, ${l.light.y > 0 ? 0.55 : 0.3})`);
  g2.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g2;
  ctx.fillRect(ox, oy + gh - deep, gw, deep);
  const g3 = ctx.createLinearGradient(ox, 0, ox + deep, 0);
  g3.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  g3.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g3;
  ctx.fillRect(ox, oy, deep, gh);
  const g4 = ctx.createLinearGradient(ox + gw, 0, ox + gw - soft, 0);
  g4.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  g4.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g4;
  ctx.fillRect(ox + gw - soft, oy, soft, gh);
  // Zonen: Türspalte und Reihe an der Röntgen-Seite, rot von der Wand her (hier fällt Ware sofort auf).
  const zd = ctx.createLinearGradient(ox + gw, 0, ox + gw - cell, 0);
  zd.addColorStop(0, withAlpha(p.danger, 0.26));
  zd.addColorStop(1, withAlpha(p.danger, 0.07));
  ctx.fillStyle = zd;
  ctx.fillRect(ox + gw - cell, oy, cell, gh);
  const zx = ctx.createLinearGradient(0, oy, 0, oy + cell);
  zx.addColorStop(0, withAlpha(p.danger, 0.26));
  zx.addColorStop(1, withAlpha(p.danger, 0.07));
  ctx.fillStyle = zx;
  ctx.fillRect(ox, oy, gw - cell, cell);
  ctx.strokeStyle = withAlpha(p.danger, 0.45);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(ox, oy + cell);
  ctx.lineTo(ox + gw - cell, oy + cell);
  ctx.lineTo(ox + gw - cell, oy + gh);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  // Raster aus Kreide: feine Linien, kleine Kreuze an den Ecken.
  ctx.strokeStyle = 'rgba(255, 245, 225, 0.07)';
  ctx.lineWidth = 1;
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
  ctx.strokeStyle = 'rgba(255, 245, 225, 0.22)';
  ctx.beginPath();
  const tick = cell * 0.08;
  for (let x = 1; x < setup.cols; x++) {
    for (let y = 1; y < setup.rows; y++) {
      const cx = ox + x * cell + 0.5;
      const cy = oy + y * cell + 0.5;
      ctx.moveTo(cx - tick, cy);
      ctx.lineTo(cx + tick, cy);
      ctx.moveTo(cx, cy - tick);
      ctx.lineTo(cx, cy + tick);
    }
  }
  ctx.stroke();
  // Türen rechts: Stirnwand mit zwei Flügeln, Mittelspalt, Verschlussstangen mit Hebeln.
  const dx = ox + gw;
  const dg = ctx.createLinearGradient(dx, 0, dx + door, 0);
  dg.addColorStop(0, m.steelDark);
  dg.addColorStop(0.35, m.steel);
  dg.addColorStop(0.6, m.steelLight);
  dg.addColorStop(1, m.steelDark);
  ctx.fillStyle = dg;
  ctx.fillRect(dx, oy - wall, door, gh + wall * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(dx, oy - wall, door, gh + wall * 2);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, oy + gh / 2);
  ctx.lineTo(dx + door, oy + gh / 2);
  ctx.stroke();
  ctx.lineCap = 'round';
  for (const f of [0.14, 0.36, 0.64, 0.86]) {
    const ry = oy + gh * f;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = Math.max(3, cell * 0.09);
    ctx.beginPath();
    ctx.moveTo(dx + door * 0.2 + 1.5, ry + 1.5);
    ctx.lineTo(dx + door + cell * 0.18 + 1.5, ry + 1.5);
    ctx.stroke();
    const bar = ctx.createLinearGradient(0, ry - cell * 0.04, 0, ry + cell * 0.04);
    bar.addColorStop(0, '#e8ecef');
    bar.addColorStop(1, '#6d747b');
    ctx.strokeStyle = bar;
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.beginPath();
    ctx.moveTo(dx + door * 0.2, ry);
    ctx.lineTo(dx + door + cell * 0.18, ry);
    ctx.stroke();
    // Hebel mit Zollplombe.
    ctx.fillStyle = p.gold;
    ctx.beginPath();
    ctx.arc(dx + door + cell * 0.18, ry, Math.max(2, cell * 0.05), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
  // Eckbeschläge.
  const cs = Math.max(6, wall * 1.05);
  for (const [cx, cy] of [
    [ox - wall, oy - wall],
    [ox - wall, oy + gh + wall - cs],
    [dx + door - cs, oy - wall],
    [dx + door - cs, oy + gh + wall - cs],
  ]) {
    casting(ctx, cx, cy, cs);
  }
  ctx.restore();
  drawCraneAndVignette(ctx, l);
  return canvas;
}

/**
 * Kranschatten (Ausleger mit Seil) und dunkle Ränder, fest im Hintergrund: Bewegte Flächen über die ganze Bühne kosten
 * am Handy zu viel (gemessen mit gebremster CPU, Auftrag 48).
 */
function drawCraneAndVignette(ctx: CanvasRenderingContext2D, l: PackLayout): void {
  const x = l.width * 0.78;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x + 46, 0);
  ctx.lineTo(x - l.height * 0.35 + 46, l.height);
  ctx.lineTo(x - l.height * 0.35, l.height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + 60, 0);
  ctx.lineTo(x - l.height * 0.35 + 140, l.height);
  ctx.stroke();
  const c = toScreen(l, l.ox + l.cell * 3, l.oy + l.cell * 2);
  const v = ctx.createRadialGradient(
    c.x,
    c.y,
    Math.min(l.width, l.height) * 0.3,
    c.x,
    c.y,
    Math.max(l.width, l.height) * 0.8,
  );
  v.addColorStop(0, 'rgba(0, 0, 0, 0)');
  v.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, l.width, l.height);
  ctx.restore();
}

/** Farbe eines Teils (Leiste und Röntgen). */
export function pieceColor(p: PackPalette, piece: Pick<PackPiece, 'kind' | 'productId'>, cover: CoverKind): string {
  if (piece.kind === 'goods') return packageLook(p, piece.productId).color;
  return cover === 'bananas'
    ? PACK_MATERIALS.bananaPrint
    : cover === 'tiles'
      ? PACK_MATERIALS.tile
      : PACK_MATERIALS.carton;
}

/** Ein fertig gezeichnetes Teil: Bild und wo seine linke obere Zelle darin liegt (Modell-Pixel). */
export interface PieceSprite {
  canvas: HTMLCanvasElement;
  /** Rand um die Form (Platz für Schatten), Modell-Pixel. */
  pad: number;
  w: number;
  h: number;
  /** Mitte des Etiketts (Ware) relativ zur linken oberen Zelle. */
  label: { x: number; y: number };
}

/** Grundfarbe je Art (Ware: dunkle Folie, die Farbe der Ware kommt darüber). */
function baseOf(piece: PackPiece, cover: CoverKind): string {
  const m = PACK_MATERIALS;
  if (piece.kind === 'goods') return m.foil;
  return cover === 'bananas' ? m.kraft : cover === 'tiles' ? m.tile : m.carton;
}

/**
 * Ein Teil als Bild (einmal je Teil, Drehung und Zellgröße): weicher Schatten, Körper mit Verlauf zum Licht, Kanten
 * hell bzw. dunkel nach Lichtrichtung, Material (Folie, Pappe, Fliesen auf Palette, Karton) und Körnung.
 */
export function renderPiece(
  p: PackPalette,
  l: PackLayout,
  piece: PackPiece,
  rot: number,
  cover: CoverKind,
  dpr: number,
): PieceSprite {
  const m = PACK_MATERIALS;
  const { cell } = l;
  const shape = rotate(piece.shape, rot);
  const bw = (Math.max(...shape.map((c) => c[0])) + 1) * cell;
  const bh = (Math.max(...shape.map((c) => c[1])) + 1) * cell;
  const pad = Math.ceil(cell * 0.3);
  const [canvas, ctx] = offscreen(bw + pad * 2, bh + pad * 2, dpr);
  ctx.translate(pad, pad);
  const set = new Set(shape.map(([x, y]) => `${x},${y}`));
  const has = (x: number, y: number) => set.has(`${x},${y}`);
  const inset = Math.max(1.5, cell * 0.055);
  const rect = (x: number, y: number) => {
    const l0 = has(x - 1, y) ? 0 : inset;
    const r0 = has(x + 1, y) ? 0 : inset;
    const t0 = has(x, y - 1) ? 0 : inset;
    const b0 = has(x, y + 1) ? 0 : inset;
    return [x * cell + l0, y * cell + t0, cell - l0 - r0, cell - t0 - b0] as const;
  };
  const body = new Path2D();
  for (const [x, y] of shape) {
    const [rx, ry, rw, rh] = rect(x, y);
    body.rect(rx, ry, rw, rh);
  }
  const base = baseOf(piece, cover);
  const lx = l.light.x;
  const ly = l.light.y;
  // Weicher Schatten vom Licht weg: die Form mehrmals leicht versetzt und durchsichtig (shadowBlur kostet am Handy beim
  // ersten Zeichnen eines Teils zu viel).
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  for (const k of [0.04, 0.08, 0.12, 0.17]) {
    ctx.save();
    ctx.translate(-lx * cell * k, -ly * cell * k);
    ctx.fill(body);
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = base;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  // Ware: dunkle Folie, durch die die Farbe der Ware schimmert. Deckladung etwas abgedunkelt.
  const product = packageLook(p, piece.productId).color;
  ctx.fillStyle =
    piece.kind === 'goods'
      ? withAlpha(product, 0.34)
      : cover === 'tiles'
        ? 'rgba(0, 0, 0, 0.32)'
        : 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, 0, bw, bh);
  // Licht über die ganze Form: hell zum Licht, dunkel davon weg.
  const cx0 = bw / 2;
  const cy0 = bh / 2;
  const reach = Math.max(bw, bh) * 0.6;
  const shine = ctx.createLinearGradient(cx0 + lx * reach, cy0 + ly * reach, cx0 - lx * reach, cy0 - ly * reach);
  shine.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  shine.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  shine.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, bw, bh);
  const rnd = lcg(spriteSeed(piece) * 97 + rot * 13 + 5);
  // Material je Art.
  for (const [x, y] of shape) {
    const [rx, ry, rw, rh] = rect(x, y);
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.5) * cell;
    if (piece.kind === 'goods') {
      // Folie: Falten als feine helle Bögen.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = Math.max(0.8, cell * 0.018);
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const a = rnd() * Math.PI;
        const r = cell * (0.18 + rnd() * 0.22);
        ctx.arc(cx + (rnd() - 0.5) * cell * 0.4, cy + (rnd() - 0.5) * cell * 0.4, r, a, a + 0.9);
      }
      ctx.stroke();
    } else if (cover === 'bananas') {
      // Bananenkiste: Deckel mit Naht, gelber Aufdruck, Grifflöcher, blauer Kreis.
      ctx.fillStyle = withAlpha(m.bananaPrint, 0.85);
      ctx.fillRect(rx, cy - cell * 0.12, rw, cell * 0.24);
      ctx.fillStyle = withAlpha(m.bananaInk, 0.8);
      ctx.beginPath();
      ctx.ellipse(cx, cy, cell * 0.1, cell * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(30, 18, 8, 0.75)';
      roundRect(ctx, cx - cell * 0.13, ry + cell * 0.08, cell * 0.26, cell * 0.075, cell * 0.035);
      ctx.fill();
      roundRect(ctx, cx - cell * 0.13, ry + rh - cell * 0.155, cell * 0.26, cell * 0.075, cell * 0.035);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell + inset * 0.5, y * cell + inset * 0.5, cell - inset, cell - inset);
    } else if (cover === 'tiles') {
      // Fliesen in Kartons auf einer Holzpalette: Palettenrand außen, Kartons mit Fugen, Stretchfolie.
      ctx.fillStyle = withAlpha(m.pallet, 0.9);
      if (!has(x, y - 1)) ctx.fillRect(rx, ry, rw, cell * 0.09);
      if (!has(x, y + 1)) ctx.fillRect(rx, ry + rh - cell * 0.09, rw, cell * 0.09);
      if (!has(x - 1, y)) ctx.fillRect(rx, ry, cell * 0.09, rh);
      if (!has(x + 1, y)) ctx.fillRect(rx + rw - cell * 0.09, ry, cell * 0.09, rh);
      ctx.strokeStyle = withAlpha(m.tileDark, 0.9);
      ctx.lineWidth = Math.max(1, cell * 0.025);
      ctx.beginPath();
      ctx.moveTo(cx, y * cell + cell * 0.12);
      ctx.lineTo(cx, (y + 1) * cell - cell * 0.12);
      ctx.moveTo(x * cell + cell * 0.12, cy);
      ctx.lineTo((x + 1) * cell - cell * 0.12, cy);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(cx - cell * 0.3, cy - cell * 0.3, cell * 0.14, cell * 0.05);
    } else {
      // Karton Altkleider: Klebeband längs, Edding-Gekritzel.
      ctx.fillStyle = withAlpha(m.tape, 0.55);
      ctx.fillRect(cx - cell * 0.08, ry, cell * 0.16, rh);
      ctx.strokeStyle = withAlpha(m.marker, 0.7);
      ctx.lineWidth = Math.max(1, cell * 0.03);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const sx = cx + cell * 0.14;
      const sy = cy - cell * 0.18;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + cell * 0.1, sy + cell * 0.12);
      ctx.moveTo(sx + cell * 0.1, sy);
      ctx.lineTo(sx, sy + cell * 0.12);
      ctx.moveTo(sx + cell * 0.15, sy);
      ctx.lineTo(sx + cell * 0.15, sy + cell * 0.12);
      ctx.lineTo(sx + cell * 0.22, sy + cell * 0.12);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * cell + inset * 0.5, y * cell + inset * 0.5, cell - inset, cell - inset);
    }
  }
  if (piece.kind === 'goods') {
    // Klebeband in der Farbe der Ware quer über die längste Seite, Glanzstreifen der Folie diagonal.
    const long = bw >= bh;
    const band = cell * 0.2;
    ctx.fillStyle = withAlpha(product, 0.92);
    if (long) ctx.fillRect(0, bh / 2 - band / 2, bw, band);
    else ctx.fillRect(bw / 2 - band / 2, 0, band, bh);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    if (long) ctx.fillRect(0, bh / 2 - band / 2, bw, cell * 0.035);
    else ctx.fillRect(bw / 2 - band / 2, 0, cell * 0.035, bh);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    if (long) ctx.fillRect(0, bh / 2 + band / 2 - cell * 0.03, bw, cell * 0.03);
    else ctx.fillRect(bw / 2 + band / 2 - cell * 0.03, 0, cell * 0.03, bh);
    const gloss = ctx.createLinearGradient(0, 0, bw, bh);
    gloss.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.32, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.38, 'rgba(255, 255, 255, 0.24)');
    gloss.addColorStop(0.44, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.62, 'rgba(255, 255, 255, 0)');
    gloss.addColorStop(0.65, 'rgba(255, 255, 255, 0.16)');
    gloss.addColorStop(0.68, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, bw, bh);
  }
  grain(ctx, 0, 0, bw, bh, piece.kind === 'goods' ? 0.06 : 0.12, spriteSeed(piece) * 7 + 3, 10);
  ctx.restore();
  // Kanten: zum Licht hin hell, davon weg dunkel (Fase).
  const bevel = Math.max(1.2, cell * 0.045);
  for (const [x, y] of shape) {
    const [rx, ry, rw, rh] = rect(x, y);
    const edge = (ex: number, ey: number, ew: number, eh: number, nx: number, ny: number) => {
      const facing = -(nx * lx + ny * ly);
      ctx.fillStyle = facing > 0 ? `rgba(255, 255, 255, ${0.35 * facing})` : `rgba(0, 0, 0, ${-0.45 * facing})`;
      ctx.fillRect(ex, ey, ew, eh);
    };
    if (!has(x, y - 1)) edge(rx, ry, rw, bevel, 0, -1);
    if (!has(x, y + 1)) edge(rx, ry + rh - bevel, rw, bevel, 0, 1);
    if (!has(x - 1, y)) edge(rx, ry, bevel, rh, -1, 0);
    if (!has(x + 1, y)) edge(rx + rw - bevel, ry, bevel, rh, 1, 0);
  }
  // Außenlinie.
  ctx.strokeStyle = piece.kind === 'goods' ? withAlpha(product, 0.85) : 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = piece.kind === 'goods' ? 1.6 : 1;
  ctx.beginPath();
  for (const [x, y] of shape) {
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
  // Etikett der Ware auf der Zelle nächst der Mitte: Aufkleber aus Papier, Symbol in der Farbe der Ware, aufrecht
  // auch hochkant.
  const mx = shape.reduce((s, c) => s + c[0], 0) / shape.length;
  const my = shape.reduce((s, c) => s + c[1], 0) / shape.length;
  const [lcx, lcy] = shape.reduce((best, c) =>
    Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best,
  );
  const label = { x: (lcx + 0.5) * cell, y: (lcy + 0.5) * cell };
  if (piece.kind === 'goods') {
    ctx.save();
    ctx.translate(label.x, label.y);
    if (l.rotated) ctx.rotate(-Math.PI / 2);
    const r = cell * 0.25;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(cell * 0.02, cell * 0.03, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = m.sticker;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(25, 25, 25, 0.9)';
    ctx.lineWidth = Math.max(1.2, cell * 0.04);
    ctx.lineJoin = 'round';
    drawGoodsGlyph(ctx, packageLook(p, piece.productId).glyph, cell * 0.15);
    ctx.restore();
  }
  return { canvas, pad, w: bw + pad * 2, h: bh + pad * 2, label };
}

/** Fester Zufall für das Bild eines Teils: Ware je Teil, Deckladung je Form. */
function spriteSeed(piece: PackPiece): number {
  if (piece.kind === 'goods') return piece.id + 1;
  let h = 7;
  for (const ch of piece.shapeId) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

/** Bilder, die einmal je Größe entstehen: Hintergrund (mit Kranschatten und Vignette), Teile (nach Bedarf). */
export interface PackArt {
  bg: HTMLCanvasElement;
  dpr: number;
  sprites: Map<string, PieceSprite>;
}

export function createPackArt(l: PackLayout, p: PackPalette, setup: PackSetup, dpr: number): PackArt {
  return { bg: renderBackground(l, p, setup, dpr), dpr, sprites: new Map() };
}

function spriteFor(
  art: PackArt,
  p: PackPalette,
  l: PackLayout,
  setup: PackSetup,
  piece: PackPiece,
  rot: number,
): PieceSprite {
  // Deckladung derselben Form sieht gleich aus: ein Bild je Form und Drehung; Ware je Teil (Farbe der Ware).
  const turn = ((rot % 4) + 4) % 4;
  const key = piece.kind === 'goods' ? `g${piece.id}:${turn}` : `c${piece.shapeId}:${turn}`;
  let sprite = art.sprites.get(key);
  if (!sprite) {
    sprite = renderPiece(p, l, piece, rot, setup.cover, art.dpr);
    art.sprites.set(key, sprite);
  }
  return sprite;
}

/**
 * Bilder der Teile vorab zeichnen (je Aufruf höchstens `budget`), damit Ablegen und Drehen im Spiel nicht ruckeln:
 * jedes Ware-Teil und jede Form der Deckladung in allen vier Drehungen. true, solange noch welche fehlen.
 */
export function warmSprites(art: PackArt, p: PackPalette, l: PackLayout, setup: PackSetup, budget = 1): boolean {
  let made = 0;
  const seen = new Set<string>();
  for (const piece of setup.pieces) {
    const id = piece.kind === 'goods' ? `g${piece.id}` : `c${piece.shapeId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    for (let rot = 0; rot < 4; rot++) {
      if (art.sprites.has(`${id}:${rot}`)) continue;
      if (made >= budget) return true;
      spriteFor(art, p, l, setup, piece, rot);
      made += 1;
    }
  }
  return false;
}

/** Ein Staubkorn (Modell-Pixel). */
export interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  age: number;
}

export interface PackFx {
  t: number;
  reduced: boolean;
  running: boolean;
  /** Teil unter dem Cursor zeigen (Maus über dem Raster, Ziehen, Tastatur). */
  ghost: boolean;
  /** Eben abgelegt (Fallen, Aufsetzen), pieceId und Zeit. */
  dropped: { id: number; at: number } | null;
  /** Abgelehnt (rotes Wackeln am Cursor). */
  reject: number;
  /** Scanner: −1 = noch nicht, sonst 0 bis 1 über den Container. */
  scan: number;
  /** Scanner rollt heran (0 bis 1, aus scannerNear). */
  near: number;
  /** Ruck beim Aufsetzen: Zeit und Stärke (Pixel). */
  kick: { at: number; power: number };
  /** Staub beim Aufsetzen. */
  dust: Dust[];
  /** Ware ganz versteckt: Zeit, zu der das Siegel kam (je pieceId). */
  sealed: Map<number, number>;
}

/** Wie lange ein Teil fällt und nachfedert (Sekunden). */
export const FALL_TIME = 0.13;
const SETTLE_TIME = 0.16;

/** Höhe eines frisch abgelegten Teils über dem Boden (1 = Ghost-Höhe, 0 = liegt), mit kleinem Nachfedern. */
function dropHeight(fx: PackFx, pieceId: number): number {
  if (!fx.dropped || fx.dropped.id !== pieceId || fx.reduced) return 0;
  const u = fx.t - fx.dropped.at;
  if (u < 0) return 1;
  if (u < FALL_TIME) {
    const k = u / FALL_TIME;
    return 1 - k * k;
  }
  const s = (u - FALL_TIME) / SETTLE_TIME;
  return s < 1 ? 0.08 * Math.sin(Math.PI * s) * (1 - s) : 0;
}

/** Staub am Rand eines Teils aufwirbeln (Modell-Pixel; Optik, Math.random erlaubt). */
export function spawnDust(fx: PackFx, l: PackLayout, cells: readonly (readonly [number, number])[], power: number) {
  if (fx.reduced) return;
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const out: [number, number, number, number][] = [];
  for (const [x, y] of cells) {
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      if (set.has(`${x + dx},${y + dy}`)) continue;
      out.push([x, y, dx, dy]);
    }
  }
  const { cell, ox, oy } = l;
  const per = Math.max(1, Math.round(2 + power));
  for (const [x, y, dx, dy] of out) {
    for (let i = 0; i < per; i++) {
      const along = Math.random() - 0.5;
      const px = ox + (x + 0.5 + dx * 0.5 + (dy !== 0 ? along : 0)) * cell;
      const py = oy + (y + 0.5 + dy * 0.5 + (dx !== 0 ? along : 0)) * cell;
      const speed = cell * (0.6 + Math.random() * 1.4);
      fx.dust.push({
        x: px,
        y: py,
        vx: dx * speed + (Math.random() - 0.5) * cell * 0.5,
        vy: dy * speed + (Math.random() - 0.5) * cell * 0.5,
        r: cell * (0.05 + Math.random() * 0.08),
        life: 0.35 + Math.random() * 0.35,
        age: 0,
      });
    }
  }
  if (fx.dust.length > 120) fx.dust.splice(0, fx.dust.length - 120);
}

/** Staub weiterbewegen (gebremst) und Altes entfernen. */
export function stepDust(fx: PackFx, dt: number): void {
  if (fx.dust.length === 0) return;
  const drag = Math.exp(-dt * 6);
  for (const d of fx.dust) {
    d.age += dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= drag;
    d.vy *= drag;
  }
  fx.dust = fx.dust.filter((d) => d.age < d.life);
}

/** Rahmen um Zellen mit Lücke bzw. Wand, an der die Ware auffällt (live, sanft pulsierend, mit Glühen). */
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
  ctx.lineWidth = Math.max(2, cell * 0.075);
  for (const c of cells) {
    if (c.value < 0.25) continue;
    const x0 = ox + c.x * cell;
    const y0 = oy + c.y * cell;
    if (c.reasons.includes('door') || c.reasons.includes('xray') || c.reasons.includes('cluster')) {
      // Rotes Glühen von innen: hier sieht man die Ware sofort.
      const g = ctx.createRadialGradient(
        x0 + cell / 2,
        y0 + cell / 2,
        cell * 0.1,
        x0 + cell / 2,
        y0 + cell / 2,
        cell * 0.7,
      );
      g.addColorStop(0, withAlpha(p.danger, 0.05));
      g.addColorStop(1, withAlpha(p.danger, 0.55 * pulse));
      ctx.fillStyle = g;
      ctx.fillRect(x0 + 1, y0 + 1, cell - 2, cell - 2);
    }
    ctx.globalAlpha = (0.4 + 0.5 * c.value) * pulse;
    const mrg = cell * 0.14;
    ctx.beginPath();
    for (const gap of c.gaps) {
      if (gap === 'up') {
        ctx.moveTo(x0 + mrg, y0 + 2);
        ctx.lineTo(x0 + cell - mrg, y0 + 2);
      } else if (gap === 'down') {
        ctx.moveTo(x0 + mrg, y0 + cell - 2);
        ctx.lineTo(x0 + cell - mrg, y0 + cell - 2);
      } else if (gap === 'left') {
        ctx.moveTo(x0 + 2, y0 + mrg);
        ctx.lineTo(x0 + 2, y0 + cell - mrg);
      } else {
        ctx.moveTo(x0 + cell - 2, y0 + mrg);
        ctx.lineTo(x0 + cell - 2, y0 + cell - mrg);
      }
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Siegel auf versteckter Ware: Haken in Grün, ploppt beim Einrasten auf und bleibt klein stehen. */
function drawSeal(ctx: CanvasRenderingContext2D, p: PackPalette, l: PackLayout, x: number, y: number, age: number) {
  const { cell } = l;
  const pop = age < 0.5 ? 1 + 0.6 * Math.sin(Math.min(1, age / 0.5) * Math.PI) * (1 - age / 0.5) : 1;
  const r = cell * 0.13 * pop;
  const sx = x + cell * 0.2;
  const sy = y - cell * 0.2;
  ctx.save();
  if (age < 0.6) {
    // Lichtring beim Einrasten.
    ctx.strokeStyle = p.money;
    ctx.globalAlpha = 1 - age / 0.6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(sx, sy, r + cell * 0.5 * (age / 0.6), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = p.money;
  ctx.beginPath();
  ctx.arc(sx, sy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.lineWidth = Math.max(1.4, cell * 0.035);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.45, sy);
  ctx.lineTo(sx - r * 0.1, sy + r * 0.38);
  ctx.lineTo(sx + r * 0.5, sy - r * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** Der Scanner als Portal über beide Schienen: Beine, Querträger mit Warnstreifen, Rundumleuchte, Strahl. */
function drawGantry(
  ctx: CanvasRenderingContext2D,
  p: PackPalette,
  l: PackLayout,
  setup: PackSetup,
  bx: number,
  t: number,
  active: boolean,
  near: number,
): void {
  const { cell, oy, wall } = l;
  const gh = setup.rows * cell;
  const top = oy - wall - cell * 0.82;
  const bottom = oy + gh + wall + cell * 0.32;
  const beam = Math.max(12, cell * 0.6);
  ctx.save();
  // Schatten auf dem Container.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(bx - beam / 2 + cell * 0.1, top + cell * 0.12, beam, bottom - top);
  // Querträger.
  const g = ctx.createLinearGradient(bx - beam / 2, 0, bx + beam / 2, 0);
  g.addColorStop(0, '#2a2e33');
  g.addColorStop(0.5, '#5a6067');
  g.addColorStop(1, '#1d2024');
  ctx.fillStyle = g;
  roundRect(ctx, bx - beam / 2, top, beam, bottom - top, 3);
  ctx.fill();
  // Querträger mit Nieten und einer Kante zum Licht.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(bx - beam / 2, top, 2, bottom - top);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  for (let y = top + cell * 0.4; y < bottom - cell * 0.3; y += cell * 0.45) {
    ctx.beginPath();
    ctx.arc(bx - beam * 0.28, y, 1.4, 0, Math.PI * 2);
    ctx.arc(bx + beam * 0.28, y, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  hazard(ctx, bx - beam / 2, top, beam, cell * 0.22);
  hazard(ctx, bx - beam / 2, bottom - cell * 0.22, beam, cell * 0.22);
  // Beine auf den Schienen.
  ctx.fillStyle = '#16181b';
  for (const y of [top - cell * 0.05, bottom - cell * 0.12]) {
    roundRect(ctx, bx - beam * 0.8, y, beam * 1.6, cell * 0.2, 3);
    ctx.fill();
  }
  // Rundumleuchte: blinkt schneller, je näher.
  const rate = active ? 9 : 2 + near * 7;
  const on = Math.sin(t * rate) > 0;
  ctx.fillStyle = on ? p.warn : withAlpha(p.warn, 0.3);
  ctx.beginPath();
  ctx.arc(bx, top + cell * 0.36, Math.max(3, cell * 0.08), 0, Math.PI * 2);
  ctx.fill();
  if (on) {
    const glow = ctx.createRadialGradient(bx, top + cell * 0.36, 0, bx, top + cell * 0.36, cell * 0.8);
    glow.addColorStop(0, withAlpha(p.warn, 0.45));
    glow.addColorStop(1, withAlpha(p.warn, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(bx - cell * 0.8, top - cell * 0.44, cell * 1.6, cell * 1.6);
  }
  // Strahl beim Scannen.
  if (active) {
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 40);
    ctx.fillStyle = p.sky;
    ctx.fillRect(bx - 1.5, oy - wall, 3, gh + wall * 2);
    const glow = ctx.createLinearGradient(bx - cell, 0, bx + cell * 0.2, 0);
    glow.addColorStop(0, withAlpha(p.sky, 0));
    glow.addColorStop(0.85, withAlpha(p.sky, 0.3));
    glow.addColorStop(1, withAlpha(p.sky, 0));
    ctx.globalAlpha = 1;
    ctx.fillStyle = glow;
    ctx.fillRect(bx - cell, oy - wall, cell * 1.2, gh + wall * 2);
  }
  ctx.restore();
}

/** Röntgenbild hinter dem Balken: dunkles Blau mit Zeilen, Deckladung schwach, Ware hell, Auffälliges rot glühend. */
function drawXray(
  ctx: CanvasRenderingContext2D,
  p: PackPalette,
  l: PackLayout,
  setup: PackSetup,
  state: PackState,
  analysis: PackAnalysis,
  bx: number,
  t: number,
): void {
  const { cell, ox, oy, wall } = l;
  const gw = setup.cols * cell;
  const gh = setup.rows * cell;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox - wall, oy - wall, Math.max(0, bx - (ox - wall)), gh + wall * 2);
  ctx.clip();
  ctx.fillStyle = withAlpha(PACK_MATERIALS.xray, 0.92);
  ctx.fillRect(ox - wall, oy - wall, gw + wall + l.door, gh + wall * 2);
  ctx.fillStyle = withAlpha(p.sky, 0.05);
  for (let y = oy - wall; y < oy + gh + wall; y += 3) ctx.fillRect(ox - wall, y, gw + wall + l.door, 1);
  const exposure = new Map(analysis.cells.map((c) => [`${c.x},${c.y}`, c.value]));
  for (let y = 0; y < setup.rows; y++) {
    for (let x = 0; x < setup.cols; x++) {
      const id = state.grid[y * setup.cols + x];
      if (id < 0) continue;
      const goods = setup.pieces[id].kind === 'goods';
      const v = exposure.get(`${x},${y}`) ?? 0;
      const flagged = goods && v >= FLAG_AT;
      if (flagged) {
        // Glühen um die Zelle (Verlauf statt shadowBlur).
        const cx = ox + (x + 0.5) * cell;
        const cy = oy + (y + 0.5) * cell;
        const glow = ctx.createRadialGradient(cx, cy, cell * 0.3, cx, cy, cell);
        glow.addColorStop(0, withAlpha(p.danger, 0.5));
        glow.addColorStop(1, withAlpha(p.danger, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.fillRect(cx - cell, cy - cell, cell * 2, cell * 2);
        ctx.fillStyle = p.danger;
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 14);
      } else {
        ctx.fillStyle = p.sky;
        ctx.globalAlpha = goods ? 0.34 + 0.4 * v : 0.1;
      }
      ctx.fillRect(ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4);
      if (!goods) {
        // Deckladung als Umriss (Kisten sind im Röntgen fast leer).
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = p.sky;
        ctx.lineWidth = 1;
        ctx.strokeRect(ox + x * cell + 3.5, oy + y * cell + 3.5, cell - 7, cell - 7);
      }
    }
  }
  ctx.restore();
}

/** Ein Bild: Hintergrund, Teile mit Fallen und Staub, Siegel, Auffälligkeiten, Vorschau am Cursor, Scanner. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  l: PackLayout,
  p: PackPalette,
  setup: PackSetup,
  state: PackState,
  analysis: PackAnalysis,
  art: PackArt,
  fx: PackFx,
): void {
  const { cell, ox, oy, wall } = l;
  ctx.clearRect(0, 0, l.width, l.height);
  ctx.drawImage(art.bg, 0, 0, l.width, l.height);
  ctx.save();
  applyView(ctx, l);
  // Ruck beim Aufsetzen: der Container zuckt kurz vom Licht weg.
  const ku = fx.t - fx.kick.at;
  if (!fx.reduced && ku >= 0 && ku < 0.22) {
    const k = fx.kick.power * Math.sin(ku * 70) * (1 - ku / 0.22);
    ctx.translate(-l.light.x * k, -l.light.y * k);
  }
  for (const pl of state.placed) {
    const piece = setup.pieces[pl.pieceId];
    const sprite = spriteFor(art, p, l, setup, piece, pl.rot);
    const h = dropHeight(fx, pl.pieceId);
    const x = ox + pl.x * cell - sprite.pad;
    const y = oy + pl.y * cell - sprite.pad;
    if (h > 0.001) {
      // Im Fallen: Schatten am Boden, Teil größer und zum Licht versetzt.
      const cells = cellsAt(piece, pl.rot, pl.x, pl.y);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.25 * (1 - h * 0.5)})`;
      for (const [cx, cy] of cells) ctx.fillRect(ox + cx * cell + 2, oy + cy * cell + 2, cell - 4, cell - 4);
      const s = 1 + 0.12 * h;
      const lift = cell * 0.22 * h;
      const cxm = x + sprite.w / 2;
      const cym = y + sprite.h / 2;
      ctx.drawImage(
        sprite.canvas,
        cxm - (sprite.w * s) / 2 + l.light.x * lift,
        cym - (sprite.h * s) / 2 + l.light.y * lift,
        sprite.w * s,
        sprite.h * s,
      );
    } else {
      ctx.drawImage(sprite.canvas, x, y, sprite.w, sprite.h);
    }
  }
  // Staub.
  if (fx.dust.length > 0) {
    ctx.save();
    for (const d of fx.dust) {
      const a = 1 - d.age / d.life;
      ctx.fillStyle = `rgba(210, 190, 160, ${0.32 * a})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * (1 + d.age * 2.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const pulse = fx.reduced ? 1 : 0.75 + 0.25 * Math.sin(fx.t * 5);
  if (fx.scan < 0) {
    drawExposure(ctx, p, l, analysis.cells, pulse);
    for (const [id, at] of fx.sealed) {
      const pl = state.placed.find((x) => x.pieceId === id);
      if (!pl) continue;
      const sprite = spriteFor(art, p, l, setup, setup.pieces[id], pl.rot);
      drawSeal(ctx, p, l, ox + pl.x * cell + sprite.label.x, oy + pl.y * cell + sprite.label.y, fx.t - at);
    }
  }
  // Vorschau: Fußabdruck am Boden (wohin das Teil fällt) und das Teil schwebend darüber.
  const sel = setup.pieces[state.selected];
  if (fx.running && fx.ghost && sel && !state.done && fx.scan < 0) {
    const { x, y } = ghostOrigin(sel, state);
    const cells = cellsAt(sel, state.rot, x, y);
    const ok = cells.every(
      ([cx, cy]) => cx >= 0 && cy >= 0 && cx < setup.cols && cy < setup.rows && state.grid[cy * setup.cols + cx] === -1,
    );
    const risky = sel.kind === 'goods' && cells.some(([cx, cy]) => cx === setup.cols - 1 || cy === 0);
    const tone = !ok ? p.danger : risky ? p.warn : p.money;
    const shake = !fx.reduced && fx.t - fx.reject < 0.25 ? Math.sin((fx.t - fx.reject) * 80) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = withAlpha(tone, 0.22);
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    for (const [cx, cy] of cells) {
      ctx.fillRect(ox + cx * cell + 2, oy + cy * cell + 2, cell - 4, cell - 4);
    }
    ctx.beginPath();
    const set = new Set(cells.map(([cx, cy]) => `${cx},${cy}`));
    for (const [cx, cy] of cells) {
      const x0 = ox + cx * cell + 2;
      const y0 = oy + cy * cell + 2;
      const x1 = ox + (cx + 1) * cell - 2;
      const y1 = oy + (cy + 1) * cell - 2;
      if (!set.has(`${cx},${cy - 1}`)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
      }
      if (!set.has(`${cx},${cy + 1}`)) {
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
      }
      if (!set.has(`${cx - 1},${cy}`)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
      }
      if (!set.has(`${cx + 1},${cy}`)) {
        ctx.moveTo(x1, y0);
        ctx.lineTo(x1, y1);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const sprite = spriteFor(art, p, l, setup, sel, state.rot);
    const bob = fx.reduced ? 0 : Math.sin(fx.t * 4) * 0.08;
    const s = 1.1 + bob * 0.2;
    const lift = cell * (0.2 + bob * 0.1);
    const cxm = ox + x * cell - sprite.pad + sprite.w / 2;
    const cym = oy + y * cell - sprite.pad + sprite.h / 2;
    ctx.globalAlpha = 0.82;
    ctx.drawImage(
      sprite.canvas,
      cxm - (sprite.w * s) / 2 + l.light.x * lift,
      cym - (sprite.h * s) / 2 + l.light.y * lift,
      sprite.w * s,
      sprite.h * s,
    );
    ctx.restore();
  }
  // Scanner: rollt am Ende heran, fährt dann über den Container.
  const gw = setup.cols * cell;
  const parked = ox - wall - cell * 1.5;
  const waiting = ox - wall - cell * 0.32;
  if (fx.scan >= 0) {
    const bx = ox - wall + (gw + wall + l.door) * Math.min(1, fx.scan);
    drawXray(ctx, p, l, setup, state, analysis, bx, fx.t);
    if (fx.scan < 1) drawGantry(ctx, p, l, setup, bx, fx.t, true, 1);
  } else {
    const ease = fx.near * fx.near * (3 - 2 * fx.near);
    drawGantry(ctx, p, l, setup, parked + (waiting - parked) * ease, fx.t, false, fx.near);
  }
  ctx.restore();
}

/** Linke obere Ecke des ausgewählten Teils am Cursor (Mitte der Form auf der Cursor-Zelle). */
export function ghostOrigin(piece: PackPiece, state: PackState): { x: number; y: number } {
  return originFor(rotate(piece.shape, state.rot), state.cursor.x, state.cursor.y);
}
