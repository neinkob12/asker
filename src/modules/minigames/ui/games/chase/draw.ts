// Zeichnen der Verfolgungsjagd: Pseudo-3D-Straße von hinten im Canvas (Straßenstücke von fern nach nah, Kurven als
// Versatz je Stück), Kulisse (Himmel, Skyline der Stadt, Häuserzeilen, Laternen, Bäume, Schilder, Brücken), Verkehr
// und Streifen als gezeichnete Wagen von hinten (Blaulicht mit Schein), deine Karre unten mit Neigung, Bremslicht und
// Turboflammen, dazu Rückspiegel, Funken, Rauch, Regen, Tempo-Linien, Blaulicht-Wash und das Ende (Tiefgarage bzw.
// Blaulicht von allen Seiten).
//
// Farben der Bedeutung kommen aus den Tokens (mapToken: Gold, Gefahr, Polizei-Blau). Himmel, Asphalt, Häuser und
// Lacke sind Inhalt wie die Hauttöne in Face.tsx: feste, gedeckte Werte hier. Keine Layout-Lesungen pro Bild.

import { mapToken } from '../../../../../map';
import {
  CAR_WIDTH,
  type ChaseSetup,
  type ChaseState,
  type Cop,
  LANE_WIDTH,
  LANES,
  ROAD_HALF,
  type Scenery,
  SEGMENT,
  SEGMENTS,
  TOP_SPEED,
  type Vehicle,
  vehicleSize,
} from './model';

export interface Palette {
  gold: string;
  danger: string;
  money: string;
  blue: string;
  ink: string;
}

export function readPalette(): Palette {
  return {
    gold: mapToken('--hud-gold', '#f2c766'),
    danger: mapToken('--cat-danger', '#ff5a5f'),
    money: mapToken('--cat-money', '#30d158'),
    blue: mapToken('--color-police-blue', '#2f7bff'),
    ink: mapToken('--hud-ink', '#ffffff'),
  };
}

export type Light = 'night' | 'dusk' | 'day';

export function lightOf(phase: unknown): Light {
  return phase === 'night' ? 'night' : phase === 'dusk' || phase === 'dawn' ? 'dusk' : 'day';
}

/** Blickwinkel: Tiefe der Kamera aus dem Öffnungswinkel, Höhe über der Straße (Meter; hochkant höher, damit die
 * Spuren ins schmale Bild passen). Die eigene Karre steht auf CAR_LINE der Bühnenhöhe; daraus folgt ihr Abstand. */
const FOV = 95;
const CAMERA_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const CAMERA_HEIGHT = { landscape: 3.4, portrait: 4.2 };
const CAR_LINE = 0.86;
/** So viele Stücke voraus werden gezeichnet. */
const DRAW_DISTANCE = 110;

/** Inhalt (keine Bedeutung): Lacke des Verkehrs, Häuser, Himmel. */
const PAINTS = ['#9ea4ad', '#2b2e36', '#7a2f2c', '#2d4d6e', '#c9c2b4'];
const HOUSE_WALLS = ['#4a4038', '#5a4f4a', '#3f4452', '#6b5a48', '#44504a', '#5c4a52'];
const HOUSE_WALLS_DAY = ['#b89e86', '#c9b7a8', '#9aa3b3', '#d1b28b', '#a7b6a6', '#c3a4b1'];
const WINDOW_LIT = '#ffd58a';
const WINDOW_DARK = '#1c1f29';
const ASPHALT = { night: '#2a2c33', dusk: '#34363d', day: '#55585f' };
const ASPHALT_ALT = { night: '#262830', dusk: '#303239', day: '#50535a' };
const SIDE = { night: '#1c1d23', dusk: '#2a2a2f', day: '#6b6a66' };
const SIDE_ALT = { night: '#191a20', dusk: '#26262b', day: '#66655f' };
const RUMBLE_A = { night: '#5a5d66', dusk: '#6a6b72', day: '#d9d9d9' };
const RUMBLE_B = { night: '#8a3a3a', dusk: '#9a4040', day: '#c84848' };
const LANE_LINE = { night: 'rgba(255,255,255,0.55)', dusk: 'rgba(255,255,255,0.6)', day: 'rgba(255,255,255,0.85)' };
const SKY: Record<Light, [string, string]> = {
  night: ['#070a16', '#1a2038'],
  dusk: ['#1a1830', '#c25a3c'],
  day: ['#4a86c7', '#b9d4ee'],
};
const SKYLINE: Record<Light, string> = { night: '#0d1020', dusk: '#1e1a2a', day: '#6f7f99' };
const SKYLINE_FAR: Record<Light, string> = { night: '#141829', dusk: '#2b2538', day: '#8a9ab3' };

export interface ChaseFx {
  t: number;
  /** Letzter Schritt in Sekunden (für Partikel). */
  dt: number;
  shake: number;
  sparks: { x: number; y: number; vx: number; vy: number; life: number; hot: boolean }[];
  smoke: { x: number; y: number; r: number; life: number }[];
  rain: { x: number; y: number; l: number }[];
  /** Weißer Blitz (Zusammenstoß), 0–1. */
  flash: number;
  /** Rot/Blau über dem Bild, 0–1. */
  wash: number;
  reduced: boolean;
  /** Vorsprung der Skyline (akkumulierte Krümmung) für die Parallaxe. */
  skyline: number;
  /** Zufall nur für Optik (Funken, Regen): kein Einfluss auf das Modell. */
  rnd: () => number;
}

export function createFx(reduced: boolean): ChaseFx {
  return {
    t: 0,
    dt: 0,
    shake: 0,
    sparks: [],
    smoke: [],
    rain: [],
    flash: 0,
    wash: 0,
    reduced,
    skyline: 0,
    rnd: Math.random,
  };
}

// ---------------------------------------------------------------------------------------------- Projektion

interface Projected {
  x: number;
  y: number;
  /** Pixel pro Meter an dieser Tiefe. */
  k: number;
}

interface Frame {
  w: number;
  h: number;
  portrait: boolean;
  /** Horizontlinie (Pixel von oben). */
  horizon: number;
  /** Pixel pro Meter bei Tiefe 1 (Maßstab der Szene). */
  unit: number;
  camH: number;
  camX: number;
  camZ: number;
  /** Abstand der eigenen Karre vor der Kamera (Meter) und ihre Standlinie (Pixel von oben). */
  playerZ: number;
  carY: number;
  /** Krümmungs-Versatz je Stück voraus (Pixel in Metern), vorberechnet. */
  curveX: Float32Array;
}

function project(f: Frame, worldX: number, worldZ: number, worldY = 0): Projected {
  const dz = Math.max(0.05, worldZ - f.camZ);
  const scale = CAMERA_DEPTH / dz;
  const k = scale * f.unit;
  return { x: f.w / 2 + (worldX - f.camX) * k, y: f.horizon - (worldY - f.camH) * k, k };
}

/** Rahmen eines Bildes: Horizont, Maßstab, Kamera hinter der Karre, Kurvenversatz je Stück. */
function frameOf(setup: ChaseSetup, state: ChaseState, w: number, h: number, shakeX: number, shakeY: number): Frame {
  const p = state.player;
  const portrait = h > w;
  const horizon = Math.round(h * (portrait ? 0.42 : 0.4)) + shakeY;
  const unit = Math.max(w / 2, h * (portrait ? 0.52 : 0.62));
  const camH = portrait ? CAMERA_HEIGHT.portrait : CAMERA_HEIGHT.landscape;
  // Die Karre steht auf einer festen Linie; daraus ihr Abstand zur Kamera (und der Maßstab dort).
  const carY = Math.round(h * CAR_LINE);
  const kCar = (carY - horizon) / camH;
  const playerZ = (CAMERA_DEPTH * unit) / kCar;
  const camZ = p.z - playerZ;
  // Kamera folgt der Karre nur zum Teil seitlich: So fährt sie sichtbar über die Spuren (hochkant enger).
  const camX = p.x * (portrait ? 0.7 : 0.45) + shakeX;
  const curveX = new Float32Array(DRAW_DISTANCE + 2);
  const base = Math.floor(camZ / SEGMENT);
  const within = (camZ - base * SEGMENT) / SEGMENT;
  let x = 0;
  let dx = -(setup.road[((base % SEGMENTS) + SEGMENTS) % SEGMENTS].curve * within);
  for (let n = 0; n <= DRAW_DISTANCE + 1; n++) {
    curveX[n] = x;
    const seg = setup.road[(((base + n) % SEGMENTS) + SEGMENTS) % SEGMENTS];
    x += dx;
    dx += seg.curve;
  }
  return { w, h, portrait, horizon, unit, camH, camX, camZ, playerZ, carY, curveX };
}

/** Seitlicher Kurvenversatz an einer Lage voraus (Meter), zwischen zwei Stücken gemittelt. */
function curveAt(f: Frame, z: number): number {
  const n = (z - f.camZ) / SEGMENT - ((f.camZ / SEGMENT) % 1);
  const i = Math.max(0, Math.min(DRAW_DISTANCE, Math.floor(n)));
  const t = Math.max(0, Math.min(1, n - i));
  return f.curveX[i] + (f.curveX[i + 1] - f.curveX[i]) * t;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

function poly(ctx: CanvasRenderingContext2D, x1: number, y1: number, w1: number, x2: number, y2: number, w2: number) {
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1);
  ctx.lineTo(x2 - w2, y2);
  ctx.lineTo(x2 + w2, y2);
  ctx.lineTo(x1 + w1, y1);
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------- Himmel und Skyline

/** Wahrzeichen je Stadt als Silhouette (Breite 1000, Höhe 0 = Horizont, nach oben positiv in Einheiten). */
type Shape = number[][];
const SKYLINES: Record<string, Shape[]> = {
  koeln: [
    // Dom: zwei Türme mit Spitzen, Langhaus dazwischen.
    [
      [420, 0],
      [420, 70],
      [432, 70],
      [440, 150],
      [448, 70],
      [460, 70],
      [460, 40],
      [540, 40],
      [540, 70],
      [552, 70],
      [560, 150],
      [568, 70],
      [580, 70],
      [580, 0],
    ],
    // Colonius.
    [
      [120, 0],
      [126, 90],
      [116, 92],
      [116, 100],
      [136, 100],
      [136, 92],
      [126, 90],
      [132, 0],
    ],
    // Kranhäuser (drei L-Formen).
    [
      [760, 0],
      [760, 48],
      [800, 48],
      [800, 20],
      [772, 20],
      [772, 0],
    ],
    [
      [820, 0],
      [820, 52],
      [862, 52],
      [862, 22],
      [832, 22],
      [832, 0],
    ],
    // Hohenzollernbrücke: drei Bögen.
    [
      [600, 0],
      [600, 10],
      [640, 30],
      [680, 10],
      [720, 30],
      [740, 18],
      [740, 0],
    ],
  ],
  hamburg: [
    // Elbphilharmonie: Wellenkrone.
    [
      [380, 0],
      [380, 40],
      [400, 62],
      [420, 44],
      [440, 66],
      [460, 46],
      [480, 70],
      [500, 48],
      [520, 60],
      [520, 0],
    ],
    // Michel.
    [
      [700, 0],
      [700, 60],
      [712, 60],
      [716, 100],
      [722, 112],
      [728, 100],
      [732, 60],
      [744, 60],
      [744, 0],
    ],
    // Köhlbrandbrücke-Pylon und Kräne.
    [
      [150, 0],
      [150, 50],
      [160, 80],
      [170, 50],
      [170, 0],
    ],
    [
      [230, 0],
      [230, 70],
      [300, 78],
      [300, 72],
      [240, 66],
      [240, 0],
    ],
  ],
  berlin: [
    // Fernsehturm.
    [
      [500, 0],
      [506, 90],
      [496, 96],
      [490, 110],
      [500, 124],
      [510, 110],
      [504, 96],
      [494, 90],
      [498, 130],
      [502, 130],
      [508, 90],
      [512, 0],
    ],
    // Rotes Rathaus / Dom.
    [
      [330, 0],
      [330, 40],
      [350, 40],
      [350, 60],
      [360, 70],
      [370, 60],
      [370, 40],
      [390, 40],
      [390, 0],
    ],
    [
      [640, 0],
      [640, 46],
      [700, 46],
      [700, 0],
    ],
  ],
  muenchen: [
    // Frauenkirche: zwei Türme mit Hauben.
    [
      [440, 0],
      [440, 70],
      [448, 84],
      [456, 70],
      [456, 40],
      [540, 40],
      [540, 70],
      [548, 84],
      [556, 70],
      [556, 0],
    ],
    // Olympiaturm.
    [
      [150, 0],
      [154, 80],
      [146, 86],
      [146, 96],
      [164, 96],
      [164, 86],
      [156, 80],
      [160, 0],
    ],
    // Alpen weit hinten.
    [
      [600, 0],
      [660, 24],
      [720, 10],
      [800, 34],
      [880, 12],
      [960, 26],
      [1000, 0],
    ],
  ],
  frankfurt: [
    // Bankentürme.
    [
      [380, 0],
      [380, 120],
      [410, 120],
      [410, 0],
    ],
    [
      [430, 0],
      [430, 150],
      [440, 164],
      [450, 150],
      [470, 150],
      [470, 0],
    ],
    [
      [500, 0],
      [500, 100],
      [530, 110],
      [560, 100],
      [560, 0],
    ],
    [
      [600, 0],
      [600, 130],
      [620, 140],
      [640, 130],
      [640, 0],
    ],
    // Europaturm.
    [
      [200, 0],
      [204, 90],
      [196, 96],
      [196, 104],
      [212, 104],
      [212, 96],
      [204, 90],
      [208, 0],
    ],
  ],
};

function skylineOf(cityId: string): Shape[] {
  return SKYLINES[cityId] ?? SKYLINES.koeln;
}

function drawSky(ctx: CanvasRenderingContext2D, f: Frame, light: Light, fx: ChaseFx, cityId: string): void {
  const [top, bottom] = SKY[light];
  const g = ctx.createLinearGradient(0, 0, 0, f.horizon);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.w, f.horizon + 2);
  if (light === 'night') {
    // Sterne (fest aus einem Zähler, keine Zufallszahlen pro Bild).
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 97 + 13) % 1000) / 1000;
      const sy = ((i * 61 + 7) % 1000) / 1000;
      ctx.globalAlpha = 0.3 + 0.5 * (((i * 31) % 10) / 10);
      ctx.fillRect(sx * f.w, sy * f.horizon * 0.7, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    // Mond.
    ctx.fillStyle = 'rgba(255,246,220,0.9)';
    ctx.beginPath();
    ctx.arc(f.w * 0.78, f.horizon * 0.3, Math.max(10, f.w * 0.018), 0, Math.PI * 2);
    ctx.fill();
  } else if (light === 'dusk') {
    const sun = ctx.createRadialGradient(f.w * 0.3, f.horizon, 0, f.w * 0.3, f.horizon, f.w * 0.35);
    sun.addColorStop(0, 'rgba(255,170,90,0.55)');
    sun.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, f.w, f.horizon + 2);
  }
  // Skyline der Stadt: zwei Ebenen Parallaxe (hinten gedämpft).
  const scale = f.w / 1000;
  const shift = -fx.skyline * 0.35;
  const height = Math.min(f.horizon * 0.6, f.w * 0.2);
  const draw = (shapes: Shape[], color: string, dx: number, hk: number, lit: boolean) => {
    ctx.fillStyle = color;
    for (const shape of shapes) {
      ctx.beginPath();
      for (const [i, [x, y]] of shape.entries()) {
        const px = mod(x * scale + dx, f.w + 400) - 200;
        const py = f.horizon - (y / 150) * height * hk;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      if (lit && light !== 'day') {
        // Ein paar Lichter in den Gebäuden.
        ctx.fillStyle = 'rgba(255, 213, 138, 0.55)';
        const [x0, y0] = shape[1] ?? shape[0];
        for (let i = 0; i < 4; i++) {
          const px = mod(x0 * scale + dx + 6 + i * 7, f.w + 400) - 200;
          const py = f.horizon - (y0 / 150) * height * hk * (0.3 + 0.15 * i);
          ctx.fillRect(px, py, 2, 2);
        }
        ctx.fillStyle = color;
      }
    }
  };
  // Hinten: eine Häuserkette als Silhouette.
  ctx.fillStyle = SKYLINE_FAR[light];
  for (let i = 0; i < 26; i++) {
    const bw = 30 + ((i * 37) % 40);
    const bh = (0.25 + ((i * 53) % 100) / 180) * height;
    const bx = mod(i * 55 * scale + shift * 0.6, f.w + 200) - 100;
    ctx.fillRect(bx, f.horizon - bh, bw * scale, bh + 2);
  }
  draw(skylineOf(cityId), SKYLINE[light], shift, 1, true);
}

// ---------------------------------------------------------------------------------------------- Straße

/** Ein Straßenstück von p1 (nah) bis p2 (fern): Seiten, Randstreifen, Asphalt, Spurlinien. */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  light: Light,
  index: number,
  x1: number,
  y1: number,
  k1: number,
  x2: number,
  y2: number,
  k2: number,
  lit: boolean,
): void {
  const alt = index % 2 === 0;
  const w1 = ROAD_HALF * k1;
  const w2 = ROAD_HALF * k2;
  // Seiten bis zum Rand.
  ctx.fillStyle = alt ? SIDE[light] : SIDE_ALT[light];
  ctx.fillRect(0, y2, f.w, y1 - y2 + 1);
  // Gehweg (hell) neben dem Randstreifen.
  ctx.fillStyle = light === 'day' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)';
  poly(ctx, x1, y1, w1 * 1.3, x2, y2, w2 * 1.3);
  // Randstreifen rot-weiß.
  ctx.fillStyle = alt ? RUMBLE_A[light] : RUMBLE_B[light];
  poly(ctx, x1, y1, w1 * 1.06, x2, y2, w2 * 1.06);
  // Asphalt.
  ctx.fillStyle = alt ? ASPHALT[light] : ASPHALT_ALT[light];
  poly(ctx, x1, y1, w1, x2, y2, w2);
  // Laternenlicht auf dem Asphalt (nachts).
  if (lit && light !== 'day') {
    ctx.fillStyle = 'rgba(255, 214, 150, 0.08)';
    poly(ctx, x1, y1, w1, x2, y2, w2);
  }
  // Spurlinien: gestrichelt (jedes zweite Stück).
  if (alt) {
    ctx.fillStyle = LANE_LINE[light];
    for (let lane = 1; lane < LANES; lane++) {
      const lx = (lane - LANES / 2) * LANE_WIDTH;
      const lw1 = Math.max(0.6, 0.08 * k1);
      const lw2 = Math.max(0.4, 0.08 * k2);
      poly(ctx, x1 + lx * k1, y1, lw1, x2 + lx * k2, y2, lw2);
    }
  }
}

// ---------------------------------------------------------------------------------------------- Kulisse

/** Ein Stück Kulisse an der Straße: Haus, Turm, Laterne, Baum, Schild, Büdchen, Brückenbogen. */
function drawScenery(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  light: Light,
  s: Scenery,
  roadX: number,
  roadY: number,
  k: number,
  t: number,
): void {
  const edge = roadX + s.side * (ROAD_HALF * 1.3 + s.offset) * k;
  const dir = s.side;
  // Weit außerhalb des Bildes oder schon fast neben der Kamera: nichts zeichnen.
  if ((dir > 0 && edge > f.w + 40) || (dir < 0 && edge < -40) || k > f.unit * 0.22) return;
  if (s.kind === 'house' || s.kind === 'tower') {
    const wm = (s.kind === 'tower' ? 14 : 12) * s.size;
    const hm = (s.kind === 'tower' ? 32 : 13) * s.size;
    const wpx = wm * k;
    const hpx = hm * k;
    const x0 = dir > 0 ? edge : edge - wpx;
    const walls = light === 'day' ? HOUSE_WALLS_DAY : HOUSE_WALLS;
    const wall = walls[s.variant % walls.length];
    // Seitenwand zur Straße hin (läuft auf die Mitte zu): Tiefe für die Häuserzeile.
    const depth = Math.min(wpx * 0.45, 3.5 * k);
    const towardCenter = (f.w / 2 - edge) * 0.08;
    ctx.fillStyle = light === 'day' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.moveTo(edge, roadY - hpx);
    ctx.lineTo(edge + Math.sign(towardCenter) * depth, roadY - hpx + hpx * 0.06);
    ctx.lineTo(edge + Math.sign(towardCenter) * depth, roadY);
    ctx.lineTo(edge, roadY);
    ctx.closePath();
    ctx.fillStyle = wall;
    ctx.fill();
    ctx.fillStyle = light === 'day' ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.fillStyle = wall;
    ctx.fillRect(x0, roadY - hpx, wpx, hpx);
    // Dach bzw. Attika.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x0, roadY - hpx, wpx, Math.max(1, 0.5 * k));
    // Fenster in Reihen; nachts teils erleuchtet (fest aus Variante und Reihe).
    const cols = Math.max(2, Math.round(wm / 3.2));
    const rows = Math.max(2, Math.round(hm / 3.4));
    const cw = wpx / cols;
    const rh = hpx / rows;
    if (cw > 2.2) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seed = (s.variant * 7 + r * 13 + c * 5) % 11;
          const litWin = light !== 'day' && seed < 5;
          ctx.fillStyle = litWin ? WINDOW_LIT : light === 'day' ? 'rgba(40,50,70,0.55)' : WINDOW_DARK;
          ctx.fillRect(x0 + c * cw + cw * 0.28, roadY - hpx + r * rh + rh * 0.25, cw * 0.44, rh * 0.5);
        }
      }
    }
    // Erdgeschoss: Laden mit Leuchtreklame (Variante).
    if (s.kind === 'house' && hpx > 24) {
      ctx.fillStyle = light === 'day' ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(x0, roadY - rh * 1.1, wpx, rh * 1.1);
      if (light !== 'day') {
        const neon = ['#ff6aa2', '#5ee0ff', '#ffd166'][s.variant % 3];
        ctx.fillStyle = neon;
        ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6 + s.variant);
        ctx.fillRect(x0 + wpx * 0.2, roadY - rh * 1.05, wpx * 0.6, Math.max(1, rh * 0.18));
        ctx.globalAlpha = 1;
      }
    }
  } else if (s.kind === 'lamp') {
    const hpx = 9 * k;
    const x = edge;
    ctx.strokeStyle = light === 'day' ? '#5d6066' : '#3c3f47';
    ctx.lineWidth = Math.max(1, 0.25 * k);
    ctx.beginPath();
    ctx.moveTo(x, roadY);
    ctx.lineTo(x, roadY - hpx);
    ctx.lineTo(x - dir * 1.6 * k, roadY - hpx - 0.3 * k);
    ctx.stroke();
    if (light !== 'day') {
      ctx.fillStyle = WINDOW_LIT;
      ctx.beginPath();
      ctx.arc(x - dir * 1.6 * k, roadY - hpx - 0.3 * k, Math.min(14, Math.max(1.2, 0.35 * k)), 0, Math.PI * 2);
      ctx.fill();
      const glow = ctx.createRadialGradient(
        x - dir * 1.6 * k,
        roadY - hpx,
        0,
        x - dir * 1.6 * k,
        roadY - hpx,
        Math.max(6, 3 * k),
      );
      glow.addColorStop(0, 'rgba(255,214,150,0.35)');
      glow.addColorStop(1, 'rgba(255,214,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - dir * 1.6 * k - 3 * k, roadY - hpx - 3 * k, 6 * k, 6 * k);
    }
  } else if (s.kind === 'tree') {
    const hpx = 7 * s.size * k;
    const x = edge;
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(x - 0.2 * k, roadY - hpx * 0.45, 0.4 * k, hpx * 0.45);
    const crown = ['#2f5d3a', '#3d6b32', '#4d6a2b'][s.variant % 3];
    ctx.fillStyle = light === 'night' ? '#1e2c22' : crown;
    ctx.beginPath();
    ctx.ellipse(x, roadY - hpx * 0.68, 2.6 * s.size * k, hpx * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.kind === 'sign') {
    const hpx = 5 * k;
    const x = edge;
    ctx.fillStyle = '#8a8d93';
    ctx.fillRect(x - 0.12 * k, roadY - hpx, 0.24 * k, hpx);
    const colors = ['#2d6fd6', '#2d6fd6', '#c9a227', '#2e8b57'];
    ctx.fillStyle = colors[s.variant % colors.length];
    const sw = 3.6 * k;
    roundRect(ctx, x - (dir > 0 ? 0 : sw), roadY - hpx - 1.6 * k, sw, 1.6 * k, 0.2 * k);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - (dir > 0 ? 0 : sw) + sw * 0.15, roadY - hpx - 1.1 * k, sw * 0.7, Math.max(1, 0.25 * k));
    ctx.fillRect(x - (dir > 0 ? 0 : sw) + sw * 0.15, roadY - hpx - 0.6 * k, sw * 0.45, Math.max(1, 0.25 * k));
  } else if (s.kind === 'kiosk') {
    const wpx = 5 * k;
    const hpx = 3.2 * k;
    const x0 = dir > 0 ? edge : edge - wpx;
    ctx.fillStyle = light === 'day' ? '#a9826a' : '#4f3b31';
    ctx.fillRect(x0, roadY - hpx, wpx, hpx);
    ctx.fillStyle = light === 'day' ? '#c9a227' : WINDOW_LIT;
    ctx.fillRect(x0 + wpx * 0.1, roadY - hpx * 0.85, wpx * 0.8, hpx * 0.45);
    ctx.fillStyle = '#b23a3a';
    ctx.fillRect(x0 - 0.2 * k, roadY - hpx - 0.5 * k, wpx + 0.4 * k, 0.5 * k);
  } else if (s.kind === 'bridge') {
    // Bogen über der Straßenseite (Hohenzollern-Stil): Gitter aus Linien.
    const hpx = 10 * k;
    const x = roadX + dir * ROAD_HALF * 1.1 * k;
    ctx.strokeStyle = light === 'day' ? '#6c7a86' : '#3a4350';
    ctx.lineWidth = Math.max(1, 0.35 * k);
    ctx.beginPath();
    ctx.moveTo(x, roadY);
    ctx.quadraticCurveTo(x + dir * 2 * k, roadY - hpx * 1.2, x + dir * 10 * k, roadY - hpx * 0.1);
    ctx.stroke();
    ctx.lineWidth = Math.max(0.6, 0.15 * k);
    for (let i = 1; i < 5; i++) {
      const bx = x + dir * i * 2 * k;
      ctx.beginPath();
      ctx.moveTo(bx, roadY);
      ctx.lineTo(bx, roadY - hpx * (1 - (i / 5) ** 2) * 0.9);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------------------------- Wagen

export interface CarLook {
  body: string;
  roof: string;
  kind: 'car' | 'van' | 'truck' | 'police' | 'player';
  /** Blaulicht-Phase 0–1 (nur Polizei). */
  flash: number;
  braking: boolean;
  /** Rücklichter an (nachts immer). */
  lights: boolean;
  /** Neigung (Spurwechsel) in Radiant, nur die eigene Karre. */
  tilt: number;
  turbo: boolean;
  damage: number;
}

/** Ein Wagen von hinten: x Mitte, y Standlinie (Räder), Breite in Pixeln. */
export function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, look: CarLook): void {
  const kind = look.kind;
  const w = width;
  const h = kind === 'truck' ? w * 1.15 : kind === 'van' ? w * 0.86 : w * 0.56;
  const r = Math.max(1, w * 0.07);
  ctx.save();
  ctx.translate(x, y);
  if (look.tilt) ctx.rotate(look.tilt);
  // Schatten.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.56, Math.max(1.5, w * 0.08), 0, 0, Math.PI * 2);
  ctx.fill();
  // Räder.
  ctx.fillStyle = '#121317';
  const tw = w * 0.14;
  const th = Math.max(2, w * 0.1);
  ctx.fillRect(-w / 2 - tw * 0.1, -th, tw, th);
  ctx.fillRect(w / 2 - tw * 0.9, -th, tw, th);
  // Karosserie.
  const bodyTop = -h;
  ctx.fillStyle = look.body;
  roundRect(ctx, -w / 2, bodyTop + h * 0.3, w, h * 0.7, r);
  ctx.fill();
  // Dach und Heckscheibe (bei Lkw: Kasten).
  if (kind === 'truck') {
    ctx.fillStyle = look.roof;
    roundRect(ctx, -w / 2 + w * 0.02, bodyTop, w * 0.96, h * 0.72, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(0.5, w * 0.01);
    ctx.beginPath();
    ctx.moveTo(0, bodyTop + h * 0.05);
    ctx.lineTo(0, bodyTop + h * 0.68);
    ctx.stroke();
  } else {
    const rw = kind === 'van' ? w * 0.86 : w * 0.7;
    const rh = kind === 'van' ? h * 0.55 : h * 0.42;
    ctx.fillStyle = look.roof;
    roundRect(ctx, -rw / 2, bodyTop, rw, rh + r, r * 1.4);
    ctx.fill();
    // Heckscheibe.
    ctx.fillStyle = kind === 'player' ? 'rgba(90,120,150,0.55)' : 'rgba(120,150,180,0.6)';
    roundRect(ctx, -rw / 2 + rw * 0.08, bodyTop + rh * 0.12, rw * 0.84, rh * 0.62, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, -rw / 2 + rw * 0.12, bodyTop + rh * 0.16, rw * 0.3, rh * 0.25, r * 0.6);
    ctx.fill();
  }
  // Stoßstange.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-w / 2, -h * 0.14, w, h * 0.1);
  // Kennzeichen.
  ctx.fillStyle = '#e9e9e0';
  ctx.fillRect(-w * 0.1, -h * 0.26, w * 0.2, Math.max(1, h * 0.08));
  // Rücklichter (rot, beim Bremsen heller und mit Schein).
  const tl = look.braking ? 1 : look.lights ? 0.7 : 0.35;
  ctx.fillStyle = `rgba(255, 60, 50, ${tl})`;
  const lw = w * 0.17;
  const lh = Math.max(1.5, h * 0.09);
  roundRect(ctx, -w / 2 + w * 0.05, -h * 0.36, lw, lh, lh / 2);
  ctx.fill();
  roundRect(ctx, w / 2 - w * 0.05 - lw, -h * 0.36, lw, lh, lh / 2);
  ctx.fill();
  if (look.braking || look.lights) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -h * 0.3, 0, 0, -h * 0.3, w * 0.8);
    g.addColorStop(0, `rgba(255,70,50,${look.braking ? 0.35 : 0.14})`);
    g.addColorStop(1, 'rgba(255,70,50,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h * 1.2, w * 2, h * 1.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Polizei: weiße Karosserie mit blauem Band, Lichtbalken rot/blau mit Schein.
  if (kind === 'police') {
    ctx.fillStyle = '#2458c9';
    ctx.fillRect(-w / 2, bodyTop + h * 0.5, w, h * 0.14);
    const on = look.flash;
    const bar = w * 0.6;
    const by = bodyTop - Math.max(2, h * 0.1);
    ctx.fillStyle = '#1d2230';
    roundRect(ctx, -bar / 2, by, bar, Math.max(2, h * 0.11), r * 0.6);
    ctx.fill();
    const red = on < 0.5 ? 1 : 0.25;
    const blue = on >= 0.5 ? 1 : 0.25;
    ctx.fillStyle = `rgba(255,60,60,${red})`;
    roundRect(ctx, -bar / 2 + bar * 0.05, by + 1, bar * 0.4, Math.max(1.5, h * 0.08), r * 0.5);
    ctx.fill();
    ctx.fillStyle = `rgba(70,140,255,${blue})`;
    roundRect(ctx, bar * 0.05, by + 1, bar * 0.4, Math.max(1.5, h * 0.08), r * 0.5);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, by, 0, 0, by, w * 1.4);
    const c = on >= 0.5 ? '80,150,255' : '255,70,70';
    g.addColorStop(0, `rgba(${c},0.5)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(-w * 1.5, by - w, w * 3, w * 2.2);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Deine Karre: Gold-Streifen, Doppel-Auspuff, Turboflammen, Rauch bei Schaden (in drawPlayer).
  if (kind === 'player') {
    ctx.fillStyle = 'rgba(242,199,102,0.85)';
    ctx.fillRect(-w * 0.04, bodyTop + h * 0.02, w * 0.08, h * 0.62);
    ctx.fillStyle = '#2a2b31';
    ctx.beginPath();
    ctx.ellipse(-w * 0.28, -h * 0.1, w * 0.06, Math.max(1.5, h * 0.05), 0, 0, Math.PI * 2);
    ctx.ellipse(w * 0.28, -h * 0.1, w * 0.06, Math.max(1.5, h * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    if (look.turbo) {
      ctx.globalCompositeOperation = 'lighter';
      for (const sx of [-w * 0.28, w * 0.28]) {
        const g = ctx.createRadialGradient(sx, -h * 0.05, 0, sx, -h * 0.05, w * 0.2);
        g.addColorStop(0, 'rgba(150,200,255,0.9)');
        g.addColorStop(0.5, 'rgba(255,160,60,0.5)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - w * 0.2, -h * 0.25, w * 0.4, h * 0.5);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Beulen und Kratzer nach Schaden.
    if (look.damage > 0.25) {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, -h * 0.5);
      ctx.lineTo(-w * 0.3, -h * 0.36);
      ctx.lineTo(-w * 0.36, -h * 0.26);
      if (look.damage > 0.6) {
        ctx.moveTo(w * 0.2, -h * 0.55);
        ctx.lineTo(w * 0.3, -h * 0.4);
        ctx.lineTo(w * 0.24, -h * 0.3);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Deine Karre von hinten: breites Coupé, Graphit mit Goldstreifen, Spoiler, Leuchtband, Doppelauspuff. */
export function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  o: { braking: boolean; lights: boolean; tilt: number; turbo: boolean; damage: number; t: number },
): void {
  const h = w * 0.52;
  const r = w * 0.06;
  ctx.save();
  ctx.translate(x, y);
  if (o.tilt) ctx.rotate(o.tilt);
  // Schatten.
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.58, w * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Breite Reifen mit Felge.
  const tw = w * 0.17;
  const th = w * 0.16;
  for (const sx of [-w / 2 - tw * 0.05, w / 2 - tw * 0.95]) {
    ctx.fillStyle = '#0e0f12';
    roundRect(ctx, sx, -th, tw, th, tw * 0.25);
    ctx.fill();
    ctx.fillStyle = '#3a3d45';
    roundRect(ctx, sx + tw * 0.22, -th * 0.8, tw * 0.56, th * 0.55, tw * 0.1);
    ctx.fill();
  }
  // Karosserie unten (Heck): Graphit mit Licht von oben.
  const body = ctx.createLinearGradient(0, -h * 0.66, 0, 0);
  body.addColorStop(0, '#2c2f37');
  body.addColorStop(0.5, '#17181d');
  body.addColorStop(1, '#0f1013');
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h * 0.66, w, h * 0.66, r);
  ctx.fill();
  // Kabine: Dach schmaler als der Rumpf, Heckscheibe mit Spiegelung.
  const cabB = w * 0.8;
  const cabT = w * 0.58;
  ctx.fillStyle = '#1e2027';
  ctx.beginPath();
  ctx.moveTo(-cabB / 2, -h * 0.64);
  ctx.lineTo(-cabT / 2, -h);
  ctx.lineTo(cabT / 2, -h);
  ctx.lineTo(cabB / 2, -h * 0.64);
  ctx.closePath();
  ctx.fill();
  const glass = ctx.createLinearGradient(0, -h, 0, -h * 0.66);
  glass.addColorStop(0, '#5b7aa0');
  glass.addColorStop(1, '#273a52');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(-cabB / 2 + w * 0.04, -h * 0.68);
  ctx.lineTo(-cabT / 2 + w * 0.03, -h * 0.96);
  ctx.lineTo(cabT / 2 - w * 0.03, -h * 0.96);
  ctx.lineTo(cabB / 2 - w * 0.04, -h * 0.68);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(-cabT / 2 + w * 0.05, -h * 0.94);
  ctx.lineTo(cabT / 2 - w * 0.12, -h * 0.94);
  ctx.lineTo(cabT / 2 - w * 0.16, -h * 0.86);
  ctx.lineTo(-cabT / 2 + w * 0.08, -h * 0.86);
  ctx.closePath();
  ctx.fill();
  // Goldstreifen über Dach und Heck.
  ctx.fillStyle = 'rgba(242,199,102,0.9)';
  ctx.fillRect(-w * 0.035, -h, w * 0.07, h * 0.34);
  ctx.fillRect(-w * 0.035, -h * 0.64, w * 0.07, h * 0.1);
  // Spoiler.
  ctx.fillStyle = '#0d0e11';
  roundRect(ctx, -w * 0.46, -h * 0.74, w * 0.92, h * 0.07, r * 0.5);
  ctx.fill();
  ctx.fillRect(-w * 0.34, -h * 0.68, w * 0.05, h * 0.06);
  ctx.fillRect(w * 0.29, -h * 0.68, w * 0.05, h * 0.06);
  // Außenspiegel.
  ctx.fillStyle = '#1e2027';
  roundRect(ctx, -cabB / 2 - w * 0.08, -h * 0.78, w * 0.08, h * 0.07, r * 0.4);
  ctx.fill();
  roundRect(ctx, cabB / 2, -h * 0.78, w * 0.08, h * 0.07, r * 0.4);
  ctx.fill();
  // Leuchtband quer (rot), beim Bremsen hell mit Schein.
  const bright = o.braking ? 1 : o.lights ? 0.75 : 0.4;
  ctx.fillStyle = `rgba(255,55,45,${bright})`;
  roundRect(ctx, -w * 0.44, -h * 0.5, w * 0.88, h * 0.07, h * 0.035);
  ctx.fill();
  ctx.fillStyle = `rgba(255,120,100,${bright})`;
  roundRect(ctx, -w * 0.44, -h * 0.5, w * 0.16, h * 0.07, h * 0.035);
  ctx.fill();
  roundRect(ctx, w * 0.28, -h * 0.5, w * 0.16, h * 0.07, h * 0.035);
  ctx.fill();
  if (o.braking || o.lights) {
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, -h * 0.45, w * 0.1, 0, -h * 0.45, w * 0.9);
    g.addColorStop(0, `rgba(255,60,40,${o.braking ? 0.42 : 0.16})`);
    g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-w, -h * 1.3, w * 2, h * 1.6);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Kennzeichen und Diffusor mit Doppelauspuff.
  ctx.fillStyle = '#ecebe3';
  roundRect(ctx, -w * 0.11, -h * 0.4, w * 0.22, h * 0.09, r * 0.3);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(-w * 0.42, -h * 0.18, w * 0.84, h * 0.12);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = -3; i <= 3; i++) ctx.fillRect(i * w * 0.08 - 1, -h * 0.17, 2, h * 0.1);
  ctx.fillStyle = '#b8bcc4';
  for (const sx of [-w * 0.3, w * 0.3]) {
    ctx.beginPath();
    ctx.ellipse(sx, -h * 0.12, w * 0.05, h * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2c31';
    ctx.beginPath();
    ctx.ellipse(sx, -h * 0.12, w * 0.032, h * 0.032, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b8bcc4';
  }
  if (o.turbo) {
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.8 + 0.2 * Math.sin(o.t * 50);
    for (const sx of [-w * 0.3, w * 0.3]) {
      const g = ctx.createRadialGradient(sx, -h * 0.08, 0, sx, -h * 0.08, w * 0.22 * flick);
      g.addColorStop(0, 'rgba(170,210,255,0.95)');
      g.addColorStop(0.45, 'rgba(255,170,70,0.6)');
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - w * 0.25, -h * 0.35, w * 0.5, h * 0.6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Beulen und Kratzer nach Schaden.
  if (o.damage > 0.25) {
    ctx.strokeStyle = 'rgba(200,200,210,0.35)';
    ctx.lineWidth = Math.max(1, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(-w * 0.4, -h * 0.62);
    ctx.lineTo(-w * 0.31, -h * 0.4);
    ctx.lineTo(-w * 0.37, -h * 0.28);
    if (o.damage > 0.55) {
      ctx.moveTo(w * 0.2, -h * 0.64);
      ctx.lineTo(w * 0.3, -h * 0.44);
      ctx.lineTo(w * 0.24, -h * 0.3);
    }
    ctx.stroke();
    if (o.damage > 0.8) {
      // Heckscheibe gesprungen.
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.05, -h * 0.95);
      ctx.lineTo(-w * 0.08, -h * 0.8);
      ctx.lineTo(w * 0.1, -h * 0.7);
      ctx.moveTo(-w * 0.08, -h * 0.8);
      ctx.lineTo(-w * 0.22, -h * 0.72);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function trafficLook(v: Vehicle, light: Light): CarLook {
  const body = PAINTS[v.color % PAINTS.length];
  return {
    body,
    roof: v.kind === 'truck' ? '#b9b4a8' : body,
    kind: v.kind,
    flash: 0,
    braking: v.braking,
    lights: light !== 'day',
    tilt: 0,
    turbo: false,
    damage: 0,
  };
}

function copLook(cop: Cop, t: number, light: Light): CarLook {
  return {
    body: cop.state === 'wrecked' ? '#8a8d93' : '#eef0f3',
    roof: cop.state === 'wrecked' ? '#6a6d73' : '#dfe3e8',
    kind: 'police',
    flash: cop.state === 'wrecked' ? 0.25 : (t * 5 + cop.id * 0.37) % 1,
    braking: false,
    lights: light !== 'day',
    tilt: 0,
    turbo: false,
    damage: 0,
  };
}

// ---------------------------------------------------------------------------------------------- Rückspiegel

function drawMirror(ctx: CanvasRenderingContext2D, f: Frame, state: ChaseState, light: Light, t: number): void {
  const mw = Math.min(f.w * 0.3, 240);
  const mh = Math.max(44, mw * 0.26);
  const mx = f.w / 2 - mw / 2;
  const my = 118;
  ctx.save();
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.clip();
  // Straße hinter dir.
  const g = ctx.createLinearGradient(0, my, 0, my + mh);
  g.addColorStop(0, SKY[light][1]);
  g.addColorStop(0.4, ASPHALT[light]);
  g.addColorStop(1, ASPHALT_ALT[light]);
  ctx.fillStyle = g;
  ctx.fillRect(mx, my, mw, mh);
  const hz = my + mh * 0.4;
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 6; i++) {
    const yy = hz + ((i + ((t * 2) % 1)) / 6) * mh * 0.6;
    const kk = (yy - hz) / (mh * 0.6);
    ctx.fillRect(mx + mw / 2 - 1 - kk, yy, 2 + kk * 2, 3 + kk * 4);
  }
  // Streifen hinter dir, von vorne gesehen (Scheinwerfer und Lichtbalken), nach Abstand sortiert (weit zuerst).
  const cops = state.cops.filter((c) => c.active && c.z < state.player.z - 2).sort((a, b) => a.z - b.z);
  for (const cop of cops) {
    const d = state.player.z - cop.z;
    const scale = Math.min(1, 10 / (d + 6));
    const cw = mw * 0.5 * scale;
    const ch = cw * 0.55;
    const cx = mx + mw / 2 - (cop.x - state.player.x) * mw * 0.045 * (0.3 + scale);
    const cy = hz + mh * 0.6 * scale;
    ctx.fillStyle = cop.state === 'wrecked' ? '#777' : '#e9ecf0';
    roundRect(ctx, cx - cw / 2, cy - ch, cw, ch, 3);
    ctx.fill();
    ctx.fillStyle = '#2458c9';
    ctx.fillRect(cx - cw / 2, cy - ch * 0.45, cw, ch * 0.16);
    // Scheinwerfer.
    ctx.fillStyle = 'rgba(255,245,200,0.95)';
    ctx.fillRect(cx - cw * 0.42, cy - ch * 0.3, cw * 0.18, ch * 0.14);
    ctx.fillRect(cx + cw * 0.24, cy - ch * 0.3, cw * 0.18, ch * 0.14);
    // Lichtbalken.
    const on = (t * 5 + cop.id * 0.37) % 1;
    ctx.fillStyle = on < 0.5 ? 'rgba(255,70,70,0.95)' : 'rgba(255,70,70,0.3)';
    ctx.fillRect(cx - cw * 0.3, cy - ch - 2, cw * 0.28, 3);
    ctx.fillStyle = on >= 0.5 ? 'rgba(80,150,255,0.95)' : 'rgba(80,150,255,0.3)';
    ctx.fillRect(cx + cw * 0.02, cy - ch - 2, cw * 0.28, 3);
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(cx, cy - ch, 0, cx, cy - ch, cw * 1.2);
    const c = on >= 0.5 ? '80,150,255' : '255,70,70';
    glow.addColorStop(0, `rgba(${c},0.5)`);
    glow.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(mx, my, mw, mh);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  // Rahmen.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, mx, my, mw, mh, 8);
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------- Effekte

export function onEvents(fx: ChaseFx, state: ChaseState, f: { w: number; h: number }): void {
  for (const e of state.events) {
    switch (e.kind) {
      case 'crash':
      case 'blockHit':
        fx.shake = Math.max(fx.shake, 0.6 + 0.4 * e.power);
        fx.flash = Math.max(fx.flash, 0.5 * e.power);
        spawnSparks(fx, f, e.x - state.player.x, 18, true);
        break;
      case 'ram':
        fx.shake = Math.max(fx.shake, 0.5);
        fx.wash = 1;
        spawnSparks(fx, f, e.x - state.player.x, 10, true);
        break;
      case 'bump':
      case 'sideswipe':
        fx.shake = Math.max(fx.shake, 0.25);
        spawnSparks(fx, f, e.x - state.player.x, 6, false);
        break;
      case 'near':
        fx.wash = Math.max(fx.wash, 0.6);
        break;
      default:
        break;
    }
  }
}

function spawnSparks(fx: ChaseFx, f: { w: number; h: number }, dx: number, n: number, hot: boolean): void {
  if (fx.reduced) n = Math.round(n / 3);
  const px = f.w / 2 + dx * f.w * 0.05;
  const py = f.h * 0.86;
  for (let i = 0; i < n; i++) {
    fx.sparks.push({
      x: px,
      y: py,
      vx: (fx.rnd() - 0.5) * 420,
      vy: -fx.rnd() * 380 - 60,
      life: 0.35 + fx.rnd() * 0.4,
      hot,
    });
  }
}

export function stepFx(
  fx: ChaseFx,
  state: ChaseState,
  dt: number,
  f: { w: number; h: number },
  rain: boolean,
  curve: number,
): void {
  fx.t += dt;
  fx.dt = dt;
  fx.shake = Math.max(0, fx.shake - dt * 2.2);
  fx.flash = Math.max(0, fx.flash - dt * 3);
  fx.wash = state.near ? Math.max(fx.wash, 0.3) : Math.max(0, fx.wash - dt * 1.2);
  const p = state.player;
  // Skyline wandert mit der Kurve (Parallaxe): in Linkskurven nach rechts.
  fx.skyline += curve * p.v * dt * 40;
  for (const s of fx.sparks) {
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 900 * dt;
  }
  fx.sparks = fx.sparks.filter((s) => s.life > 0);
  // Rauch bei Schaden (aus dem Heck), bei Turbo keiner.
  if (p.damage > 0.4 && !fx.reduced && fx.rnd() < p.damage * 0.5) {
    fx.smoke.push({ x: f.w / 2 + (fx.rnd() - 0.5) * f.w * 0.06, y: f.h * 0.84, r: 6, life: 0.9 });
  }
  for (const s of fx.smoke) {
    s.life -= dt;
    s.y -= 60 * dt;
    s.r += 40 * dt;
  }
  fx.smoke = fx.smoke.filter((s) => s.life > 0);
  if (rain && !fx.reduced) {
    while (fx.rain.length < 70) fx.rain.push({ x: fx.rnd() * f.w, y: fx.rnd() * f.h, l: 10 + fx.rnd() * 14 });
    for (const d of fx.rain) {
      d.y += (600 + p.v * 6) * dt;
      d.x -= 80 * dt;
      if (d.y > f.h) {
        d.y = -20;
        d.x = fx.rnd() * (f.w + 60);
      }
    }
  } else fx.rain.length = 0;
}

// ---------------------------------------------------------------------------------------------- Ein Bild

export interface RenderOptions {
  light: Light;
  rain: boolean;
  cityId: string;
  palette: Palette;
}

/** Zeichnet die ganze Szene (CSS-Pixel, Pixelverhältnis ist im Kontext gesetzt). */
export function renderChase(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  setup: ChaseSetup,
  state: ChaseState,
  fx: ChaseFx,
  o: RenderOptions,
): void {
  const p = state.player;
  const shakeAmp = fx.reduced ? 0 : fx.shake * 9;
  const shakeX = shakeAmp * Math.sin(fx.t * 61);
  const shakeY = shakeAmp * Math.cos(fx.t * 47);
  const f = frameOf(setup, state, w, h, shakeX, shakeY);
  ctx.clearRect(0, 0, w, h);
  drawSky(ctx, f, o.light, fx, o.cityId);

  // Straße von fern nach nah: erst alle Stücke, Clip-Linie merken.
  const base = Math.floor(f.camZ / SEGMENT);
  const segY: number[] = new Array(DRAW_DISTANCE + 1).fill(f.h);
  const segX: number[] = new Array(DRAW_DISTANCE + 1).fill(f.w / 2);
  const segK: number[] = new Array(DRAW_DISTANCE + 1).fill(0);
  for (let n = 0; n <= DRAW_DISTANCE; n++) {
    const z = (base + n) * SEGMENT;
    const pr = project(f, f.curveX[n], z);
    segY[n] = pr.y;
    segX[n] = pr.x;
    segK[n] = pr.k;
  }
  // Keine Hügel: Von fern nach nah gemalt verdeckt das Nähere das Fernere von selbst.
  for (let n = DRAW_DISTANCE; n >= 1; n--) {
    const near = n - 1;
    if (segY[near] <= segY[n]) continue;
    const index = (((base + near) % SEGMENTS) + SEGMENTS) % SEGMENTS;
    drawSegment(
      ctx,
      f,
      o.light,
      index,
      segX[near],
      segY[near],
      segK[near],
      segX[n],
      segY[n],
      segK[n],
      setup.road[index].lit,
    );
  }
  // Scheinwerferkegel nachts.
  if (o.light !== 'day') {
    ctx.globalCompositeOperation = 'lighter';
    const hx = f.w / 2 + (p.x - f.camX) * (CAMERA_DEPTH / f.playerZ) * f.unit * 0.4;
    const g = ctx.createRadialGradient(hx, f.h * 0.78, 0, hx, f.h * 0.6, f.h * 0.5);
    g.addColorStop(0, 'rgba(255,240,200,0.18)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, f.horizon, f.w, f.h - f.horizon);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Kulisse und Wagen gemischt nach Tiefe, von fern nach nah.
  const vehicles: { z: number; draw: () => void }[] = [];
  for (const v of state.traffic) {
    const dz = v.z - f.camZ;
    if (dz < 1 || dz > DRAW_DISTANCE * SEGMENT) continue;
    const pr = project(f, v.x + curveAt(f, v.z), v.z);
    const size = vehicleSize(v.kind);
    vehicles.push({ z: v.z, draw: () => drawCar(ctx, pr.x, pr.y, size.width * pr.k, trafficLook(v, o.light)) });
  }
  for (const cop of state.cops) {
    if (!cop.active) continue;
    const dz = cop.z - f.camZ;
    if (dz < 1.2 || dz > DRAW_DISTANCE * SEGMENT) continue;
    const pr = project(f, cop.x + curveAt(f, cop.z), cop.z);
    vehicles.push({ z: cop.z, draw: () => drawCar(ctx, pr.x, pr.y, CAR_WIDTH * pr.k, copLook(cop, fx.t, o.light)) });
  }
  for (const b of state.blocks) {
    const dz = b.z - f.camZ;
    if (dz < 1 || dz > DRAW_DISTANCE * SEGMENT) continue;
    for (let lane = 0; lane < LANES; lane++) {
      if (lane === b.gap) continue;
      const lx = (lane - (LANES - 1) / 2) * LANE_WIDTH;
      const pr = project(f, lx + curveAt(f, b.z), b.z);
      vehicles.push({
        z: b.z - 0.01,
        draw: () => {
          // Quer stehender Streifenwagen: breiter als hoch, mit Blaulicht.
          drawCar(ctx, pr.x, pr.y, LANE_WIDTH * 0.98 * pr.k, {
            body: '#eef0f3',
            roof: '#dfe3e8',
            kind: 'police',
            flash: (fx.t * 6 + lane) % 1,
            braking: false,
            lights: true,
            tilt: 0,
            turbo: false,
            damage: 0,
          });
          // Absperrbaken davor.
          ctx.fillStyle = (lane + Math.floor(fx.t * 4)) % 2 === 0 ? '#ff7a2f' : '#ffd166';
          const bw = Math.max(1.5, 0.35 * pr.k);
          ctx.fillRect(pr.x - LANE_WIDTH * 0.4 * pr.k, pr.y - bw * 2, bw, bw * 2.4);
          ctx.fillRect(pr.x + LANE_WIDTH * 0.4 * pr.k - bw, pr.y - bw * 2, bw, bw * 2.4);
        },
      });
    }
  }
  // Sortiert nach Tiefe (fern zuerst), Clip aus dem Stück, in dem der Wagen steht.
  vehicles.sort((a, b) => b.z - a.z);
  const sceneryItems: { z: number; draw: () => void }[] = [];
  for (let n = DRAW_DISTANCE; n >= 0; n--) {
    const index = (((base + n) % SEGMENTS) + SEGMENTS) % SEGMENTS;
    const seg = setup.road[index];
    if (seg.scenery.length === 0) continue;
    const z = (base + n) * SEGMENT;
    if (z - f.camZ < 1) continue;
    for (const s of seg.scenery) {
      sceneryItems.push({ z, draw: () => drawScenery(ctx, f, o.light, s, segX[n], segY[n], segK[n], fx.t) });
    }
  }
  // Kulisse und Wagen gemischt nach Tiefe.
  let vi = 0;
  for (const item of sceneryItems) {
    while (vi < vehicles.length && vehicles[vi].z > item.z) vehicles[vi++].draw();
    item.draw();
  }
  while (vi < vehicles.length) vehicles[vi++].draw();

  // Deine Karre: auf ihrer Standlinie, seitlich nach Lage, geneigt beim Spurwechsel, leicht hüpfend bei Tempo.
  const pk = (CAMERA_DEPTH / f.playerZ) * f.unit;
  const bounce = fx.reduced ? 0 : Math.sin(fx.t * 23) * Math.min(2, p.v / 40);
  const px = f.w / 2 + (p.x - f.camX) * pk + shakeX * 0.5;
  const py = f.carY + bounce + shakeY * 0.4;
  const pw = Math.min(CAR_WIDTH * pk * (f.portrait ? 1.1 : 1.3), f.w * 0.48);
  const laneCenter = (p.lane - (LANES - 1) / 2) * LANE_WIDTH;
  const lean = Math.max(-0.09, Math.min(0.09, (state.end ? 0 : (laneCenter - p.x) * 0.03) + p.vx * 0.012));
  drawPlayerCar(ctx, px, py, pw, {
    braking: p.braking,
    lights: o.light !== 'day' || state.near,
    tilt: lean,
    turbo: p.turboOn,
    damage: p.damage,
    t: fx.t,
  });
  // Rauch und Funken.
  for (const s of fx.smoke) {
    ctx.fillStyle = `rgba(90,90,95,${0.35 * Math.max(0, s.life)})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const s of fx.sparks) {
    ctx.fillStyle = s.hot
      ? `rgba(255,${160 + Math.round(90 * s.life)},80,${Math.min(1, s.life * 2)})`
      : `rgba(255,255,255,${Math.min(1, s.life * 2)})`;
    ctx.fillRect(s.x, s.y, 2.5, 2.5);
  }
  ctx.globalCompositeOperation = 'source-over';
  // Regen.
  if (fx.rain.length > 0) {
    ctx.strokeStyle = 'rgba(200,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of fx.rain) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2, d.y + d.l);
    }
    ctx.stroke();
  }
  // Tempo-Linien ab hohem Tempo bzw. Turbo.
  const speed = p.v / TOP_SPEED;
  if (!fx.reduced && (speed > 0.85 || p.turboOn)) {
    const a = Math.min(0.5, (speed - 0.8) * 1.2 + (p.turboOn ? 0.3 : 0));
    ctx.strokeStyle = `rgba(255,255,255,${a})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + fx.t * 0.7;
      const r0 = Math.min(f.w, f.h) * 0.42;
      const r1 = r0 + 40 + 40 * ((i * 7 + Math.floor(fx.t * 20)) % 5);
      const cx = f.w / 2;
      const cy = f.horizon + (f.h - f.horizon) * 0.15;
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 0.7);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 0.7);
    }
    ctx.stroke();
  }
  drawMirror(ctx, f, state, o.light, fx.t);
  // Blaulicht-Wash am Rand, wenn eine Streife dicht dran ist (rot/blau im Wechsel).
  if (fx.wash > 0.02) {
    const blue = Math.sin(fx.t * 9) > 0;
    const g = ctx.createRadialGradient(
      f.w / 2,
      f.h / 2,
      Math.min(f.w, f.h) * 0.3,
      f.w / 2,
      f.h / 2,
      Math.max(f.w, f.h) * 0.72,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, blue ? `rgba(70,140,255,${0.55 * fx.wash})` : `rgba(255,60,60,${0.4 * fx.wash})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, f.w, f.h);
  }
  if (fx.flash > 0.01) {
    ctx.fillStyle = `rgba(255,255,255,${0.6 * fx.flash})`;
    ctx.fillRect(0, 0, f.w, f.h);
  }
  // Ende: Tiefgarage (dunkler Schlund von rechts, goldener Schein) bzw. Blaulicht von allen Seiten.
  if (state.end) {
    const k = Math.min(1, (state.t - state.endAt) / 2);
    if (state.end === 'escaped') {
      ctx.fillStyle = `rgba(0,0,0,${0.75 * k})`;
      ctx.fillRect(0, 0, f.w, f.h);
      ctx.fillStyle = o.palette.gold;
      ctx.globalAlpha = 0.18 * k;
      ctx.fillRect(0, 0, f.w, f.h);
      ctx.globalAlpha = 1;
    } else {
      const blue = Math.sin(fx.t * 12) > 0;
      ctx.fillStyle = blue ? `rgba(70,140,255,${0.35 * k})` : `rgba(255,60,60,${0.3 * k})`;
      ctx.fillRect(0, 0, f.w, f.h);
    }
  }
}

/** Für die Einleitung (Standbild vor dem Start) und Tests: die Zahl der Stücke voraus. */
export const CHASE_DRAW_DISTANCE = DRAW_DISTANCE;
