// Papiere fälschen: der Schreibtisch des Zolls als Canvas (einmal pro Größe gezeichnet, nicht pro Bild): Holzplatte mit
// Maserung aus dem Seed, Lichtkegel der Schreibtischlampe, Stempelkissen, Kuli, Kaffeefleck. Papier, Tinte und Holz
// sind Inhalt wie Haut- und Kleidungsfarben in Face.tsx (feste Werte); Bedeutungsfarben kommen im CSS aus den Tokens.

import { createRng } from '../../../../../core';

/** Farben der Dinge auf dem Tisch (Inhalt). Die Oberfläche setzt sie als CSS-Variablen (--pp-*). */
export const DESK_COLORS = {
  woodDark: '#2a1c12',
  wood: '#4a3121',
  woodLight: '#6b4930',
  paper: '#efe7d4',
  paperShade: '#e2d7bf',
  paperEdge: '#c9b996',
  ink: '#1f1c18',
  ink2: '#5a5045',
  pen: '#1c3d9a',
  ok: '#1d6b35',
  skin: '#d4a27a',
  skinShade: '#a8764f',
  eu: '#1d4fb8',
  stamp: '#b0261c',
  lcd: '#0f1a12',
  lcdInk: '#7dffa0',
} as const;

/** CSS-Variablen für die Papiere (Inhaltsfarben), als style am Spiel. */
export function deskVars(): Record<string, string> {
  return {
    '--pp-paper': DESK_COLORS.paper,
    '--pp-paper-shade': DESK_COLORS.paperShade,
    '--pp-paper-edge': DESK_COLORS.paperEdge,
    '--pp-ink': DESK_COLORS.ink,
    '--pp-ink-2': DESK_COLORS.ink2,
    '--pp-pen': DESK_COLORS.pen,
    '--pp-ok': DESK_COLORS.ok,
    '--pp-skin': DESK_COLORS.skin,
    '--pp-skin-shade': DESK_COLORS.skinShade,
    '--pp-eu': DESK_COLORS.eu,
    '--pp-stamp': DESK_COLORS.stamp,
    '--pp-lcd': DESK_COLORS.lcd,
    '--pp-lcd-ink': DESK_COLORS.lcdInk,
  };
}

/** Tisch zeichnen (CSS-Pixel). night: Lampe heller gegen dunkleren Raum. */
export function drawDesk(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: { seed: number; night: boolean; narrow: boolean },
): void {
  const c = DESK_COLORS;
  const rnd = createRng(options.seed * 31 + 7);
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  // Holz: Grundton, Dielen, Maserung.
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, c.wood);
  base.addColorStop(1, c.woodDark);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  const plank = options.narrow ? 74 : 110;
  for (let y = 0; y < height + plank; y += plank) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 + rnd() * 0.12})`;
    ctx.fillRect(0, y, width, 2);
    ctx.fillStyle = `rgba(255,220,180,${0.03 + rnd() * 0.04})`;
    ctx.fillRect(0, y + 2, width, plank - 2);
    // Maserung: lange, leicht gewellte Linien.
    const lines = 7 + Math.floor(rnd() * 5);
    for (let i = 0; i < lines; i++) {
      const ly = y + 6 + rnd() * (plank - 12);
      const amp = 1 + rnd() * 3;
      const freq = 0.004 + rnd() * 0.01;
      const phase = rnd() * 10;
      ctx.strokeStyle = rnd() < 0.5 ? `rgba(0,0,0,${0.08 + rnd() * 0.1})` : `${c.woodLight}33`;
      ctx.lineWidth = 0.6 + rnd() * 1.2;
      ctx.beginPath();
      for (let x = 0; x <= width; x += 12) {
        const yy = ly + Math.sin(x * freq + phase) * amp;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Astloch hier und da.
    if (rnd() < 0.45) {
      const kx = rnd() * width;
      const ky = y + plank * (0.3 + rnd() * 0.4);
      ctx.fillStyle = 'rgba(20,10,5,0.35)';
      ctx.beginPath();
      ctx.ellipse(kx, ky, 9 + rnd() * 8, 3 + rnd() * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Kaffeefleck (Ring).
  const cx = width * (options.narrow ? 0.82 : 0.12);
  const cy = height * (options.narrow ? 0.94 : 0.9);
  ctx.strokeStyle = 'rgba(40,20,8,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0.3, Math.PI * 1.85);
  ctx.stroke();
  // Lichtkegel der Lampe (oben rechts), dazu dunkle Ecken.
  const lx = width * 0.72;
  const ly = height * 0.18;
  const light = ctx.createRadialGradient(lx, ly, 10, lx, ly, Math.max(width, height) * 0.85);
  light.addColorStop(0, options.night ? 'rgba(255,214,150,0.30)' : 'rgba(255,230,190,0.18)');
  light.addColorStop(0.5, 'rgba(255,200,140,0.06)');
  light.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, options.night ? 'rgba(0,0,0,0.62)' : 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
