// Papiere fälschen: der Schreibtisch des Zolls als Canvas (einmal pro Größe gezeichnet, nicht pro Bild): Holzplatte mit
// Maserung aus dem Seed, Schreibtischlampe mit Lichtkegel, Stempelkissen mit Stempel, Kuli, Kaffeefleck. Dazu
// (Auftrag 48) Texturen als Bild-Adressen für das CSS: Papierfaser und abgenutzte Stempelfarbe, einmal erzeugt.
// Papier, Tinte und Holz sind Inhalt wie Haut- und Kleidungsfarben in Face.tsx (feste Werte); Bedeutungsfarben kommen
// im CSS aus den Tokens.

import { createRng } from '../../../../../core';

/** Farben der Dinge auf dem Tisch (Inhalt). Die Oberfläche setzt sie als CSS-Variablen (--pp-*). */
export const DESK_COLORS = {
  woodDark: '#2a1c12',
  wood: '#4a3121',
  woodLight: '#6b4930',
  paper: '#efe7d4',
  paperShade: '#e2d7bf',
  paperEdge: '#c9b996',
  /** Lieferschein als Durchschlag (rosa), Zollanmeldung als Amtsformular (blassgrün); Druckfarbe der Formulare. */
  paperPink: '#f2e2dc',
  paperPinkShade: '#e5cfc6',
  paperGreen: '#e3ecd9',
  paperGreenShade: '#d2dec5',
  print: '#8b2f3a',
  printGreen: '#3f6b4a',
  brass: '#b88a3e',
  /** Textmarker der Lupe. */
  marker: '#ffe066',
  lampShade: '#2f4a3a',
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
    '--pp-paper-pink': DESK_COLORS.paperPink,
    '--pp-paper-pink-shade': DESK_COLORS.paperPinkShade,
    '--pp-paper-green': DESK_COLORS.paperGreen,
    '--pp-paper-green-shade': DESK_COLORS.paperGreenShade,
    '--pp-print': DESK_COLORS.print,
    '--pp-print-green': DESK_COLORS.printGreen,
    '--pp-marker': DESK_COLORS.marker,
    '--pp-wood': DESK_COLORS.wood,
    '--pp-wood-dark': DESK_COLORS.woodDark,
    '--pp-wood-light': DESK_COLORS.woodLight,
    ...textureVars(),
  };
}

let textures: Record<string, string> | null = null;

/**
 * Papierfaser (Körnung, Fasern, wolkige Dichte) und abgenutzte Stempelfarbe (Maske mit Löchern) als PNG-Adressen,
 * einmal erzeugt. Fester Zufall: gleiches Bild bei jedem Aufbau. Ohne Canvas (Tests) leer.
 */
function textureVars(): Record<string, string> {
  if (textures) return textures;
  if (typeof document === 'undefined') return {};
  const make = (size: number, paint: (ctx: CanvasRenderingContext2D, rnd: () => number) => void) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'none';
    paint(ctx, createRng(4711));
    return `url(${canvas.toDataURL('image/png')})`;
  };
  const fiber = make(256, (ctx, rnd) => {
    // Wolkige Dichte.
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const r = 20 + rnd() * 60;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(90,70,40,${0.03 + rnd() * 0.04})`);
      g.addColorStop(1, 'rgba(90,70,40,0)');
      ctx.fillStyle = g;
      // Kachelbar: an den Rändern doppelt.
      for (const dx of [-256, 0, 256])
        for (const dy of [-256, 0, 256]) ctx.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
    }
    // Fasern: kurze, leicht gebogene Striche, hell und dunkel.
    for (let i = 0; i < 420; i++) {
      const x = rnd() * 256;
      const y = rnd() * 256;
      const a = rnd() * Math.PI * 2;
      const len = 3 + rnd() * 9;
      ctx.strokeStyle =
        rnd() < 0.6 ? `rgba(80,60,30,${0.06 + rnd() * 0.08})` : `rgba(255,255,255,${0.2 + rnd() * 0.2})`;
      ctx.lineWidth = 0.5 + rnd() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.6) * len * 0.5,
        y + Math.sin(a + 0.6) * len * 0.5,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len,
      );
      ctx.stroke();
    }
    // Körnung.
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rnd() < 0.7 ? `rgba(60,45,25,${0.05 + rnd() * 0.08})` : 'rgba(255,255,255,0.35)';
      ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1);
    }
  });
  const ink = make(128, (ctx, rnd) => {
    // Deckend mit Löchern und dünnen Stellen: so druckt ein Gummistempel.
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 128, 128);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`;
      const r = 0.4 + rnd() * 1.3;
      ctx.beginPath();
      ctx.arc(rnd() * 128, rnd() * 128, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const x = rnd() * 128;
      const y = rnd() * 128;
      const r = 8 + rnd() * 18;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,0.45)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  textures = { '--pp-fiber': fiber, '--pp-ink-wear': ink };
  return textures;
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
  if (!options.narrow) {
    // Unter den Papieren: Stempelkissen mit Stempel und der Kuli.
    // Etwas größer als früher: Sie liegen am Rand des Lichts und sollen als Dinge auf dem Tisch lesbar sein.
    ctx.save();
    ctx.translate(width * 0.34, height * 0.82);
    ctx.scale(1.35, 1.35);
    drawInkPad(ctx, 0, 0, rnd);
    ctx.restore();
    ctx.save();
    ctx.translate(width * 0.72, height * 0.9);
    ctx.scale(1.3, 1.3);
    drawPen(ctx, 0, 0, -0.22);
    ctx.restore();
  } else {
    drawPen(ctx, width * 0.12, height * 0.985, 0.08);
  }
  // Lichtkegel der Lampe (oben rechts), dazu dunkle Ecken.
  const lx = options.narrow ? width * 0.72 : width - 110;
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
  if (!options.narrow) drawLamp(ctx, width - 110, options.night);
  ctx.restore();
}

/** Stempelkissen (Blechdose mit rotem Filz) und ein Holzstempel daneben, von oben mit Schatten. */
function drawInkPad(ctx: CanvasRenderingContext2D, x: number, y: number, rnd: () => number): void {
  const c = DESK_COLORS;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  const w = 74;
  const h = 46;
  const tin = ctx.createLinearGradient(x, y, x + w, y + h);
  tin.addColorStop(0, '#8d949b');
  tin.addColorStop(0.5, '#4d5359');
  tin.addColorStop(1, '#2c3035');
  ctx.fillStyle = tin;
  roundRect(ctx, x, y, w, h, 6);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = c.stamp;
  roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 60; i++) ctx.fillRect(x + 6 + rnd() * (w - 12), y + 6 + rnd() * (h - 12), 1.5, 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 6, y + 6, w - 12, 3);
  // Holzstempel: Griff von oben (Kugel) auf einem Block.
  const sx = x + w + 30;
  const sy = y + h / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 9;
  ctx.fillStyle = c.woodLight;
  roundRect(ctx, sx - 22, sy - 16, 44, 32, 4);
  ctx.fill();
  ctx.restore();
  const knob = ctx.createRadialGradient(sx - 5, sy - 6, 2, sx, sy, 16);
  knob.addColorStop(0, '#d9a066');
  knob.addColorStop(1, '#5a3418');
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(sx, sy, 14, 0, Math.PI * 2);
  ctx.fill();
}

/** Kuli (blau) schräg auf dem Tisch. */
function drawPen(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number): void {
  const c = DESK_COLORS;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 4;
  const body = ctx.createLinearGradient(0, -5, 0, 5);
  body.addColorStop(0, '#5d7fe0');
  body.addColorStop(0.45, c.pen);
  body.addColorStop(1, '#0e1f52');
  ctx.fillStyle = body;
  roundRect(ctx, -70, -5, 120, 10, 5);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = '#c9ced4';
  ctx.beginPath();
  ctx.moveTo(50, -4);
  ctx.lineTo(64, 0);
  ctx.lineTo(50, 4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillRect(-64, -3, 108, 1.5);
  ctx.restore();
}

/** Schreibtischlampe oben am Rand: Schirm von oben mit Glühen, Messinggelenk. */
function drawLamp(ctx: CanvasRenderingContext2D, x: number, night: boolean): void {
  const c = DESK_COLORS;
  ctx.save();
  // Ganz im Bild: Schirm etwas tiefer als der Rand.
  ctx.translate(0, 28);
  // Arm aus dem Rand.
  ctx.strokeStyle = c.brass;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 120, -10);
  ctx.lineTo(x + 50, 14);
  ctx.stroke();
  // Glühen unter dem Schirm.
  const glow = ctx.createRadialGradient(x, 26, 4, x, 26, 120);
  glow.addColorStop(0, night ? 'rgba(255,220,160,0.55)' : 'rgba(255,225,170,0.35)');
  glow.addColorStop(1, 'rgba(255,200,140,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 120, -94, 240, 240);
  // Schirm (grün, Banker-Lampe), von oben.
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 8;
  const shade = ctx.createLinearGradient(x - 50, 0, x + 50, 0);
  shade.addColorStop(0, '#1b2a21');
  shade.addColorStop(0.45, c.lampShade);
  shade.addColorStop(0.6, '#5f8a6f');
  shade.addColorStop(1, '#1b2a21');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.ellipse(x, 10, 52, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'rgba(0,0,0,0)';
  ctx.fillStyle = c.brass;
  ctx.beginPath();
  ctx.arc(x + 50, 14, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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
