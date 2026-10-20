// Texturen der Verfolgungsjagd (Auftrag 48), im Code auf Canvas gemalt, nichts wird geladen: Asphalt-Kachel mit
// Markierungen und Pfützen (Rauheit), Fassaden in vier Stilen (Altbau, Backstein, Nachkriegsputz, Bandfenster) mit
// Fensterrahmen, Simsen und Gardinen, Glasfassade für Türme, Ladenzeilen fürs Erdgeschoss (Büdchen, Döner, Späti …)
// mit Leuchtreklame, Dachpappe. Jede Fassade hat eine Leuchttextur für die Nacht (Fenster mal an, mal aus).
//
// Maßstab: ein Fensterfeld ist BAY Meter breit, ein Geschoss FLOOR Meter hoch; eine Fassadenkachel zeigt 4 × 4
// Felder, die Leuchttextur 8 × 4 (andere Wiederholung, sonst sähe man das Muster). Math.random nur für Optik.

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { PITCH, ROAD_W, SIDEWALK } from './model';

export const BAY = 3;
export const FLOOR = 3.3;
/** Höhe des Erdgeschosses (Läden). */
export const GROUND_FLOOR = 4.4;
/** Eine Ladenzeilen-Kachel: so viele Meter breit (8 Läden à 6 m). */
export const SHOP_SPAN = 48;

export type FacadeStyle = 'altbau' | 'brick' | 'plaster' | 'ribbon';
export const FACADE_STYLES: FacadeStyle[] = ['altbau', 'brick', 'plaster', 'ribbon'];

const rnd = Math.random;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c: HTMLCanvasElement, srgb = true, aniso = 8): CanvasTexture {
  const t = new CanvasTexture(c);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

/** Körnung: viele kleine helle und dunkle Punkte. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, n: number, light: number, dark: number) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${light})` : `rgba(0,0,0,${dark})`;
    const s = 1 + rnd() * 1.5;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

/** Weiche Flecken (Teerflicken, Wasserflecken). */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, size: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = size * (0.4 + rnd());
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
}

// ---------------------------------------------------------------------------------------------- Straße

/**
 * Eine Kachel PITCH × PITCH Meter: Kreuzung an den Ecken, Block in der Mitte. Farbe und Rauheit (Pfützen glatter,
 * Gehweg rauer); roughness als eigene Textur (grüner Kanal, wie three.js sie liest).
 */
export function roadTiles(night: boolean, size: number): { map: CanvasTexture; rough: CanvasTexture } {
  const S = size;
  const m = S / PITCH;
  const [c, g] = canvas(S, S);
  const [rc, r] = canvas(S, S);
  const road = (ROAD_W / 2) * m;
  const inset = (ROAD_W / 2 + SIDEWALK) * m;
  if (g && r) {
    g.fillStyle = night ? '#1c1e23' : '#34373d';
    g.fillRect(0, 0, S, S);
    blotches(g, S, S, 26, night ? 'rgba(0,0,0,0.35)' : 'rgba(10,10,12,0.32)', 40 * (S / 1024));
    blotches(g, S, S, 14, 'rgba(255,255,255,0.05)', 30 * (S / 1024));
    grain(g, S, S, S * 10, 0.05, 0.16);
    // Spurrillen: in Fahrspuren etwas dunkler (Abrieb).
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (const off of [-4.2, -1.8, 1.8, 4.2]) {
      const p = off * m;
      g.fillRect(inset, p - 0.4 * m, S - 2 * inset, 0.8 * m);
      g.fillRect(inset, S + p - 0.4 * m, S - 2 * inset, 0.8 * m);
      g.fillRect(p - 0.4 * m, inset, 0.8 * m, S - 2 * inset);
      g.fillRect(S + p - 0.4 * m, inset, 0.8 * m, S - 2 * inset);
    }
    // Gehweg (Platten) rund um den Block.
    g.fillStyle = night ? '#4b4c50' : '#9a9891';
    g.fillRect(road, road, S - 2 * road, S - 2 * road);
    grain(g, S, S, S * 2, 0.06, 0.08);
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    g.lineWidth = Math.max(1, m * 0.04);
    for (let x = road; x <= S - road; x += 1.5 * m) {
      g.beginPath();
      g.moveTo(x, road);
      g.lineTo(x, S - road);
      g.stroke();
    }
    for (let y = road; y <= S - road; y += 1.5 * m) {
      g.beginPath();
      g.moveTo(road, y);
      g.lineTo(S - road, y);
      g.stroke();
    }
    // Blockinneres (Hof unter den Häusern).
    g.fillStyle = night ? '#2a2b2f' : '#6d6c68';
    g.fillRect(inset, inset, S - 2 * inset, S - 2 * inset);
    // Gullys und Kanaldeckel.
    for (let k = 0; k < 6; k++) {
      const along = road + rnd() * (S - 2 * road);
      const side = rnd() < 0.5;
      const edge = road - 0.5 * m;
      g.fillStyle = 'rgba(20,20,22,0.9)';
      const x = side ? along : k % 2 ? edge : S - edge;
      const y = side ? (k % 2 ? edge : S - edge) : along;
      g.fillRect(x - 0.3 * m, y - 0.3 * m, 0.6 * m, 0.6 * m);
    }
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.arc(rnd() * S, (k % 2 ? 1.5 : -1.5) * m + (k === 2 ? S : 0), 0.35 * m, 0, Math.PI * 2);
      g.fillStyle = 'rgba(60,60,62,0.9)';
      g.fill();
    }
    // Fahrbahnrand (weiß) und Mittellinie (gestrichelt) für die vier Straßenhälften am Rand.
    g.strokeStyle = 'rgba(232,232,222,0.7)';
    g.lineWidth = 0.15 * m;
    const edge = road - 0.35 * m;
    g.beginPath();
    for (const at of [edge, S - edge]) {
      g.moveTo(at, road);
      g.lineTo(at, S - road);
      g.moveTo(road, at);
      g.lineTo(S - road, at);
    }
    g.stroke();
    g.setLineDash([3 * m, 3 * m]);
    g.lineWidth = 0.15 * m;
    g.strokeStyle = 'rgba(240,240,230,0.78)';
    g.beginPath();
    g.moveTo(0, road + 2 * m);
    g.lineTo(0, S - road - 2 * m);
    g.moveTo(S, road + 2 * m);
    g.lineTo(S, S - road - 2 * m);
    g.moveTo(road + 2 * m, 0);
    g.lineTo(S - road - 2 * m, 0);
    g.moveTo(road + 2 * m, S);
    g.lineTo(S - road - 2 * m, S);
    g.stroke();
    g.setLineDash([]);
    // Haltelinien und Zebrastreifen an den Einfahrten der Kreuzung (an den vier Ecken der Kachel).
    g.fillStyle = 'rgba(238,238,228,0.72)';
    const zebra = (x: number, y: number, horizontal: boolean) => {
      for (let k = 0; k < 7; k++) {
        if (horizontal) g.fillRect(x + k * 1.0 * m, y, 0.5 * m, 2 * road);
        else g.fillRect(x, y + k * 1.0 * m, 2 * road, 0.5 * m);
      }
    };
    zebra(road + 0.6 * m, -road, true);
    zebra(S - road - 7.6 * m, S - road, true);
    zebra(-road, S - road - 7.6 * m, false);
    zebra(S - road, road + 0.6 * m, false);
    // Rauheit: Asphalt mittel, Pfützen glatt, Gehweg rau.
    r.fillStyle = 'rgb(0,150,0)';
    r.fillRect(0, 0, S, S);
    r.fillStyle = 'rgb(0,215,0)';
    r.fillRect(road, road, S - 2 * road, S - 2 * road);
    for (let k = 0; k < 22; k++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const inBlock = x > road && x < S - road && y > road && y < S - road;
      if (inBlock) continue;
      const rr = (1 + rnd() * 2.5) * m;
      const grad = r.createRadialGradient(x, y, 0, x, y, rr);
      grad.addColorStop(0, 'rgba(0,20,0,1)');
      grad.addColorStop(0.7, 'rgba(0,40,0,0.8)');
      grad.addColorStop(1, 'rgba(0,150,0,0)');
      r.fillStyle = grad;
      r.save();
      r.translate(x, y);
      r.scale(1.8, 0.8);
      r.translate(-x, -y);
      r.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
      r.restore();
    }
  }
  return { map: texture(c), rough: texture(rc, false) };
}

// ---------------------------------------------------------------------------------------------- Fassaden

interface Window {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fensterfeld zeichnen: Laibung (Schatten), Rahmen, Glas mit Himmelsspiegelung, manchmal Gardine oder Rollladen. */
function paintWindow(g: CanvasRenderingContext2D, win: Window, px: number, frame: string, cross: boolean) {
  const { x, y, w, h } = win;
  // Laibung: Schatten oben und links.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x - 0.05 * px, y - 0.05 * px, w + 0.1 * px, h + 0.1 * px);
  const glass = g.createLinearGradient(x, y, x + w * 0.6, y + h);
  glass.addColorStop(0, '#4a5868');
  glass.addColorStop(0.45, '#1c2430');
  glass.addColorStop(1, '#10151c');
  g.fillStyle = glass;
  g.fillRect(x, y, w, h);
  // Spiegelung: heller Schrägstreifen.
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = 'rgba(200,220,240,0.12)';
  g.beginPath();
  g.moveTo(x + w * 0.1, y + h);
  g.lineTo(x + w * 0.5, y + h);
  g.lineTo(x + w * 0.95, y);
  g.lineTo(x + w * 0.55, y);
  g.fill();
  const r = rnd();
  if (r < 0.3) {
    // Gardine: helle Bahn mit Falten.
    g.fillStyle = 'rgba(225,215,195,0.55)';
    g.fillRect(x, y, w * (0.25 + rnd() * 0.2), h);
    g.fillRect(x + w * (0.6 + rnd() * 0.15), y, w, h);
  } else if (r < 0.42) {
    // Rollladen halb unten.
    const down = h * (0.3 + rnd() * 0.6);
    g.fillStyle = '#a9a69e';
    g.fillRect(x, y, w, down);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let k = 0; k < down; k += 0.09 * px) g.fillRect(x, y + k, w, 0.02 * px);
  }
  g.restore();
  // Rahmen und Sprossen.
  g.strokeStyle = frame;
  g.lineWidth = 0.08 * px;
  g.strokeRect(x, y, w, h);
  if (cross) {
    g.lineWidth = 0.06 * px;
    g.beginPath();
    g.moveTo(x + w / 2, y);
    g.lineTo(x + w / 2, y + h);
    g.moveTo(x, y + h * 0.3);
    g.lineTo(x + w, y + h * 0.3);
    g.stroke();
  }
}

/** Leuchtende Fenster (Nachttextur): warm, kühl (Fernseher) oder aus; manchmal mit Gardine davor. */
function paintLit(g: CanvasRenderingContext2D, win: Window) {
  const r = rnd();
  if (r < 0.45) return;
  const warm = r < 0.85;
  const grad = g.createLinearGradient(win.x, win.y, win.x, win.y + win.h);
  grad.addColorStop(0, warm ? '#ffcf8a' : '#9fc4ff');
  grad.addColorStop(1, warm ? '#c47a32' : '#4a6ab8');
  g.fillStyle = grad;
  g.globalAlpha = 0.55 + rnd() * 0.45;
  g.fillRect(win.x, win.y, win.w, win.h);
  g.globalAlpha = 1;
  if (rnd() < 0.4) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(win.x + win.w * 0.47, win.y, win.w * 0.06, win.h);
    g.fillRect(win.x, win.y + win.h * 0.28, win.w, win.h * 0.04);
  }
}

/** Fensterlage eines Feldes je Stil (in Metern, links oben im Feld BAY × FLOOR). */
function windowIn(style: FacadeStyle): { x: number; y: number; w: number; h: number; cross: boolean } {
  switch (style) {
    case 'altbau':
      return { x: 0.85, y: 0.55, w: 1.3, h: 2.1, cross: true };
    case 'brick':
      return { x: 0.9, y: 0.8, w: 1.2, h: 1.6, cross: true };
    case 'plaster':
      return { x: 0.75, y: 0.85, w: 1.5, h: 1.4, cross: false };
    default:
      return { x: 0, y: 0.95, w: BAY, h: 1.55, cross: false };
  }
}

/**
 * Fassade eines Stils: Farbe (hell und neutral, die Hausfarbe kommt aus den Eckpunktfarben; Backstein bringt seine
 * Farbe mit) und Leuchttextur (8 × 4 Felder). px = Pixel pro Meter.
 */
export function facadeTexture(style: FacadeStyle, px: number): { map: CanvasTexture; emissive: CanvasTexture } {
  const W = Math.round(4 * BAY * px);
  const H = Math.round(4 * FLOOR * px);
  const [c, g] = canvas(W, H);
  const ePx = px / 2;
  const [ec, e] = canvas(Math.round(8 * BAY * ePx), Math.round(4 * FLOOR * ePx));
  const win = windowIn(style);
  if (g) {
    if (style === 'brick') {
      g.fillStyle = '#8e4a36';
      g.fillRect(0, 0, W, H);
      const bh = 0.075 * px;
      const bw = 0.24 * px;
      for (let y = 0, row = 0; y < H; y += bh, row++) {
        for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
          const l = 0.82 + rnd() * 0.3;
          g.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(76 * l)},${Math.round(56 * l)})`;
          g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        }
      }
    } else {
      g.fillStyle = style === 'ribbon' ? '#c9c9c4' : '#e6e1d6';
      g.fillRect(0, 0, W, H);
      blotches(g, W, H, 30, 'rgba(0,0,0,0.05)', 1.2 * px);
      grain(g, W, H, W * H * 0.01, 0.07, 0.07);
    }
    for (let fy = 0; fy < 4; fy++) {
      const y0 = fy * FLOOR * px;
      // Gesims zwischen den Geschossen (Altbau) bzw. Brüstungsband (Bandfenster).
      if (style === 'altbau') {
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(0, y0 + FLOOR * px - 0.22 * px, W, 0.14 * px);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(0, y0 + FLOOR * px - 0.08 * px, W, 0.06 * px);
      }
      if (style === 'ribbon') {
        g.fillStyle = '#8d8f92';
        g.fillRect(0, y0 + 2.6 * px, W, 0.7 * px);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, y0 + 2.6 * px, W, 0.05 * px);
      }
      for (let fx = 0; fx < 4; fx++) {
        const x0 = fx * BAY * px;
        const w: Window = { x: x0 + win.x * px, y: y0 + win.y * px, w: win.w * px, h: win.h * px };
        if (style === 'ribbon') {
          paintWindow(g, w, px, '#3b3e43', false);
          g.fillStyle = '#3b3e43';
          g.fillRect(x0 + 1.5 * px - 0.03 * px, w.y, 0.06 * px, w.h);
          continue;
        }
        // Sturz und Sims.
        g.fillStyle = style === 'brick' ? '#d8d2c4' : 'rgba(255,255,255,0.4)';
        g.fillRect(
          w.x - 0.12 * px,
          w.y - (style === 'altbau' ? 0.32 : 0.12) * px,
          w.w + 0.24 * px,
          (style === 'altbau' ? 0.24 : 0.1) * px,
        );
        g.fillStyle = style === 'brick' ? '#cfc9bb' : 'rgba(255,255,255,0.5)';
        g.fillRect(w.x - 0.1 * px, w.y + w.h, w.w + 0.2 * px, 0.09 * px);
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(w.x - 0.1 * px, w.y + w.h + 0.09 * px, w.w + 0.2 * px, 0.06 * px);
        paintWindow(g, w, px, style === 'brick' ? '#f0eee8' : '#f4f2ec', win.cross);
      }
    }
  }
  if (e) {
    e.fillStyle = '#000';
    e.fillRect(0, 0, ec.width, ec.height);
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const x0 = fx * BAY * ePx;
        const y0 = fy * FLOOR * ePx;
        paintLit(e, { x: x0 + win.x * ePx, y: y0 + win.y * ePx, w: win.w * ePx, h: win.h * ePx });
      }
    }
  }
  const map = texture(c);
  const emissive = texture(ec);
  emissive.repeat.set(0.5, 1);
  return { map, emissive };
}

/** Glasfassade (Türme): Paneele mit Pfosten; nachts Bürolicht in Reihen. Kachel 4 × 4 Felder wie oben. */
export function glassTexture(px: number): { map: CanvasTexture; emissive: CanvasTexture } {
  const W = Math.round(4 * BAY * px);
  const H = Math.round(4 * FLOOR * px);
  const [c, g] = canvas(W, H);
  const [ec, e] = canvas(Math.round(W / 2), Math.round(H / 2));
  if (g) {
    for (let fy = 0; fy < 4; fy++) {
      for (let fx = 0; fx < 8; fx++) {
        const l = 0.85 + rnd() * 0.3;
        g.fillStyle = `rgb(${Math.round(70 * l)},${Math.round(92 * l)},${Math.round(112 * l)})`;
        g.fillRect((fx * BAY * px) / 2, fy * FLOOR * px, (BAY * px) / 2, FLOOR * px);
      }
    }
    g.fillStyle = '#2a2f36';
    for (let fy = 0; fy <= 4; fy++) g.fillRect(0, fy * FLOOR * px - 0.15 * px, W, 0.3 * px);
    for (let fx = 0; fx <= 8; fx++) g.fillRect((fx * BAY * px) / 2 - 0.04 * px, 0, 0.08 * px, H);
  }
  if (e) {
    e.fillStyle = '#000';
    e.fillRect(0, 0, ec.width, ec.height);
    const fx = ec.width / 8;
    const fy = ec.height / 4;
    for (let y = 0; y < 4; y++) {
      const rowOn = rnd() < 0.6;
      for (let x = 0; x < 8; x++) {
        if (!rowOn && rnd() < 0.8) continue;
        if (rnd() < 0.25) continue;
        e.fillStyle = rnd() < 0.8 ? '#dfe8ff' : '#ffe2b0';
        e.globalAlpha = 0.5 + rnd() * 0.5;
        e.fillRect(x * fx + 1, y * fy + fy * 0.1, fx - 2, fy * 0.75);
      }
    }
    e.globalAlpha = 1;
  }
  return { map: texture(c), emissive: texture(ec) };
}

// ---------------------------------------------------------------------------------------------- Läden

const SHOPS: { name: string; sign: string; ink: string; glow: string }[] = [
  { name: 'BÜDCHEN', sign: '#1f3a5a', ink: '#ffe7a8', glow: '#ffd27a' },
  { name: 'DÖNER', sign: '#7a1b14', ink: '#fff3d6', glow: '#ff6a3a' },
  { name: 'SPÄTI', sign: '#1a1a1e', ink: '#7af0ff', glow: '#44e0ff' },
  { name: 'PIZZA', sign: '#2d5a2a', ink: '#fff', glow: '#ff4a4a' },
  { name: 'FRISEUR', sign: '#e8e4dc', ink: '#2a2a2e', glow: '#ff7ad8' },
  { name: 'APOTHEKE', sign: '#f4f4f0', ink: '#c41a1a', glow: '#3aff7a' },
  { name: 'WETTBÜRO', sign: '#14141a', ink: '#ffd21a', glow: '#ffd21a' },
  { name: 'SHISHA', sign: '#2a1438', ink: '#e7b6ff', glow: '#c46aff' },
  { name: 'BÄCKER', sign: '#c9a46a', ink: '#3a2414', glow: '#ffcc80' },
  { name: 'HANDY', sign: '#0d3d7a', ink: '#fff', glow: '#4aa0ff' },
  { name: 'BAR', sign: '#101014', ink: '#ff4a9a', glow: '#ff3a8a' },
  { name: 'IMBISS', sign: '#a85a14', ink: '#fff', glow: '#ffaa3a' },
];

/**
 * Ladenzeile: acht Läden à 6 m (Schaufenster mit Auslage, Tür, Schild, manchmal Markise oder Rollgitter mit Tag),
 * dazu die Leuchttextur (Innenlicht, Leuchtschrift). px = Pixel pro Meter.
 */
export function shopTexture(px: number): { map: CanvasTexture; emissive: CanvasTexture } {
  const W = Math.round(SHOP_SPAN * px);
  const H = Math.round(GROUND_FLOOR * px);
  const [c, g] = canvas(W, H);
  const [ec, e] = canvas(W, H);
  if (g && e) {
    e.fillStyle = '#000';
    e.fillRect(0, 0, W, H);
    g.fillStyle = '#d8d3c8';
    g.fillRect(0, 0, W, H);
    grain(g, W, H, W * H * 0.01, 0.06, 0.08);
    const order = [...SHOPS].sort(() => rnd() - 0.5);
    for (let k = 0; k < 8; k++) {
      const shop = order[k];
      const x0 = k * 6 * px;
      // Kanvas oben = oben an der Wand (flipY): Schild oben, Schaufenster darunter, Sockel unten.
      const signY = 0.35 * px;
      const signH = 0.75 * px;
      const shutter = rnd() < 0.18;
      // Schild.
      g.fillStyle = shop.sign;
      g.fillRect(x0 + 0.3 * px, signY, 5.4 * px, signH);
      g.font = `800 ${Math.round(signH * 0.62)}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = shop.ink;
      g.fillText(shop.name, x0 + 3 * px, signY + signH / 2, 5 * px);
      if (!shutter) {
        e.font = g.font;
        e.textAlign = 'center';
        e.textBaseline = 'middle';
        e.fillStyle = shop.glow;
        e.shadowColor = shop.glow;
        e.shadowBlur = 0.2 * px;
        e.fillText(shop.name, x0 + 3 * px, signY + signH / 2, 5 * px);
        e.shadowBlur = 0;
      }
      // Schaufenster und Tür.
      const winX = x0 + 0.4 * px;
      const winY = 1.4 * px;
      const winW = 3.9 * px;
      const winH = 2.45 * px;
      const doorX = x0 + 4.5 * px;
      if (shutter) {
        g.fillStyle = '#8c8e91';
        g.fillRect(winX, winY - 0.3 * px, 5.3 * px, winH + 0.3 * px);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        for (let y = winY - 0.3 * px; y < winY + winH; y += 0.08 * px) g.fillRect(winX, y, 5.3 * px, 0.02 * px);
        // Tag.
        g.strokeStyle = ['#e8463a', '#4ad0ff', '#f0e04a', '#ffffff'][k % 4];
        g.lineWidth = 0.08 * px;
        g.beginPath();
        let tx = winX + 0.6 * px;
        g.moveTo(tx, winY + 1.6 * px);
        for (let s = 0; s < 9; s++) {
          tx += 0.4 * px;
          g.lineTo(tx, winY + (0.9 + rnd() * 1.1) * px);
        }
        g.stroke();
      } else {
        const inside = g.createLinearGradient(0, winY, 0, winY + winH);
        inside.addColorStop(0, '#3a3a36');
        inside.addColorStop(1, '#1a1a18');
        g.fillStyle = inside;
        g.fillRect(winX, winY, winW, winH);
        g.fillRect(doorX, winY - 0.25 * px, 1.1 * px, winH + 0.25 * px);
        // Auslage: Regale und Waren als Farbflecken.
        for (let s = 0; s < 3; s++) {
          const sy = winY + (0.5 + s * 0.65) * px;
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fillRect(winX, sy, winW, 0.05 * px);
          for (let q = 0; q < 10; q++) {
            g.fillStyle = `hsl(${Math.floor(rnd() * 360)},45%,${30 + rnd() * 30}%)`;
            g.fillRect(winX + (0.1 + q * 0.38) * px, sy - 0.32 * px, 0.25 * px, 0.3 * px);
          }
        }
        // Rahmen.
        g.strokeStyle = '#2a2c30';
        g.lineWidth = 0.1 * px;
        g.strokeRect(winX, winY, winW, winH);
        g.strokeRect(doorX, winY - 0.25 * px, 1.1 * px, winH + 0.25 * px);
        // Innenlicht nachts.
        const glow = e.createLinearGradient(0, winY, 0, winY + winH);
        glow.addColorStop(0, rnd() < 0.7 ? '#ffe4b8' : '#e8f2ff');
        glow.addColorStop(1, '#7a5a30');
        e.fillStyle = glow;
        e.globalAlpha = 0.5 + rnd() * 0.35;
        e.fillRect(winX, winY, winW, winH);
        e.fillRect(doorX, winY - 0.25 * px, 1.1 * px, winH + 0.25 * px);
        e.globalAlpha = 1;
        e.fillStyle = 'rgba(0,0,0,0.6)';
        for (let s = 0; s < 3; s++) e.fillRect(winX, winY + (0.5 + s * 0.65) * px, winW, 0.05 * px);
      }
      // Sockel und Trennpfeiler.
      g.fillStyle = '#5a5650';
      g.fillRect(x0, 0, 0.3 * px, H);
      g.fillRect(x0, H - 0.45 * px, 6 * px, 0.45 * px);
    }
    // Gesims über dem Erdgeschoss (oben).
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(0, 0, W, 0.18 * px);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(0, 0.18 * px, W, 0.06 * px);
  }
  return { map: texture(c), emissive: texture(ec) };
}

/** Dachpappe mit Kies (hell, Hausfarbe darüber). */
export function roofTexture(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  if (g) {
    g.fillStyle = '#5a5b5e';
    g.fillRect(0, 0, 256, 256);
    blotches(g, 256, 256, 20, 'rgba(0,0,0,0.25)', 30);
    grain(g, 256, 256, 9000, 0.08, 0.15);
  }
  return texture(c, true, 4);
}
