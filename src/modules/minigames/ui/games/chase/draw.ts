// Was pro Bild in die Ebene kommt: alle Wagen als Kästen, Blaulicht mit Schein auf der Straße, Scheinwerfer bei Nacht,
// Rück- und Bremslichter, Reifenspuren, Rauch, Funken, Pakete aus dem Fenster, Straßensperren, Verstecke und der
// Hubschrauber mit Lichtkegel. Reine Optik: liest das Modell, ändert es nie; Zufall nur für Funken (Math.random).

import type { ChaseEvent, ChaseSetup, ChaseState, Mover } from './model';
import { HELI_RADIUS } from './model';
import { type ChaseScene, type Rgb, SHAPE } from './scene';

export interface Palette {
  player: Rgb;
  playerCabin: Rgb;
  police: Rgb;
  policeBand: Rgb;
  cabin: Rgb;
  red: Rgb;
  blue: Rgb;
  white: Rgb;
  head: Rgb;
  tail: Rgb;
  spark: Rgb;
  smoke: Rgb;
  shadow: Rgb;
  skid: Rgb;
  gold: Rgb;
  parcel: Rgb;
  civilians: Rgb[];
}

/** Wagen auf dem Bildschirm etwas größer als echt (spielzeughaft, wie die Flotte), mindestens so viele Pixel lang. */
export const MIN_CAR_PIXELS = 40;
const CAR_LENGTH = 4.6;

interface Skid {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  born: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  kind: 'spark' | 'smoke';
}

interface Parcel {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  spin: number;
}

interface Arrival {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  heading: number;
  born: number;
}

const SKID_MAX = 260;
const SKID_LIFE = 10;

/** Optik-Gedächtnis zwischen den Bildern (Spuren, Partikel, geglättete Kurse). */
export class ChaseFx {
  skids: Skid[] = [];
  particles: Particle[] = [];
  parcels: Parcel[] = [];
  arrivals: Arrival[] = [];
  /** Letzte Position der Hinterreifen (für Spuren). */
  private lastTires: [number, number, number, number] | null = null;
  /** Geglättete Kurse je Wagen (id → Grad). */
  private headings = new Map<number, number>();
  shake = 0;
  flash = 0;

  constructor(private readonly reduced: boolean) {}

  /** Kurs weich nachziehen (Ecken der Kanten springen sonst). */
  smooth(id: number, heading: number, dt: number, rate = 10): number {
    const prev = this.headings.get(id);
    if (prev === undefined || dt <= 0) {
      this.headings.set(id, heading);
      return heading;
    }
    const diff = ((heading - prev + 540) % 360) - 180;
    const next = (prev + diff * Math.min(1, dt * rate) + 360) % 360;
    this.headings.set(id, next);
    return next;
  }

  /** Ereignisse des Modells in Effekte übersetzen. */
  onEvents(events: readonly ChaseEvent[], state: ChaseState, t: number): void {
    for (const e of events) {
      if (e.kind === 'bump' || e.kind === 'crash') {
        this.burst(e.x, e.y, e.kind === 'crash' ? 26 : 12, e.power);
        this.shake = Math.max(this.shake, (e.kind === 'crash' ? 1 : 0.55) * (0.4 + e.power));
        this.flash = Math.max(this.flash, e.kind === 'crash' ? 0.8 : 0.3);
      } else if (e.kind === 'skid') {
        this.shake = Math.max(this.shake, 0.45 * e.power);
        this.puff(e.x, e.y, 6);
      } else if (e.kind === 'dump') {
        const p = state.player;
        const rad = (p.heading * Math.PI) / 180;
        for (let i = 0; i < 4; i++) {
          const side = i % 2 ? 1 : -1;
          const back = 4 + i * 3;
          this.parcels.push({
            x0: p.x,
            y0: p.y,
            x1: p.x - Math.sin(rad) * back + Math.cos(rad) * side * (4 + i),
            y1: p.y - Math.cos(rad) * back - Math.sin(rad) * side * (4 + i),
            born: t + i * 0.08,
            spin: Math.random() * 360,
          });
        }
      } else if (e.kind === 'caught') {
        // Blaulicht von allen Seiten: drei Wagen kommen dazu.
        for (let i = 0; i < 3; i++) {
          const a = ((state.player.heading + 60 + i * 120) * Math.PI) / 180;
          const x1 = e.x + Math.sin(a) * 11;
          const y1 = e.y + Math.cos(a) * 11;
          this.arrivals.push({
            x0: e.x + Math.sin(a) * 70,
            y0: e.y + Math.cos(a) * 70,
            x1,
            y1,
            heading: (((Math.atan2(e.x - x1, e.y - y1) * 180) / Math.PI + 360) % 360) + 70,
            born: t + i * 0.15,
          });
        }
      }
    }
  }

  private burst(x: number, y: number, n: number, power: number): void {
    const count = Math.round(n * (this.reduced ? 0.4 : 1) * (0.6 + power));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 5 + Math.random() * 12 * (0.5 + power);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.3 + Math.random() * 0.4,
        age: 0,
        size: 0.35 + Math.random() * 0.4,
        kind: 'spark',
      });
    }
    this.puff(x, y, 4);
  }

  private puff(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 3,
        y: y + (Math.random() - 0.5) * 3,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        life: 1.1 + Math.random() * 0.8,
        age: 0,
        size: 1.6 + Math.random() * 1.4,
        kind: 'smoke',
      });
    }
  }

  /** Optik weiterlaufen lassen (dt echte, ggf. verlangsamte Sekunden). */
  step(state: ChaseState, dt: number, t: number, braking: boolean, scale: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 3);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = p.kind === 'spark' ? 3 : 0.8;
      p.vx *= Math.max(0, 1 - drag * dt);
      p.vy *= Math.max(0, 1 - drag * dt);
    }
    // Reifenspuren beim Rutschen, harten Bremsen und schnellen Abbiegen.
    const pl = state.player;
    const marking = pl.skid > 0 || (braking && pl.v > 7) || (pl.turboOn && pl.v < 8);
    const rad = (pl.heading * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fy = Math.cos(rad);
    const back = CAR_LENGTH * scale * 0.32;
    const side = CAR_LENGTH * scale * 0.18;
    const tires: [number, number, number, number] = [
      pl.x - fx * back + fy * side,
      pl.y - fy * back - fx * side,
      pl.x - fx * back - fy * side,
      pl.y - fy * back + fx * side,
    ];
    if (marking && this.lastTires && Math.hypot(tires[0] - this.lastTires[0], tires[1] - this.lastTires[1]) < 12) {
      const l = this.lastTires;
      this.skids.push({ ax: l[0], ay: l[1], bx: tires[0], by: tires[1], born: t });
      this.skids.push({ ax: l[2], ay: l[3], bx: tires[2], by: tires[3], born: t });
      if (this.skids.length > SKID_MAX) this.skids.splice(0, this.skids.length - SKID_MAX);
      if (pl.skid > 0 && Math.random() < dt * 14) this.puff(pl.x - fx * back, pl.y - fy * back, 1);
    }
    this.lastTires = tires;
    while (this.skids.length > 0 && t - this.skids[0].born > SKID_LIFE) this.skids.shift();
  }
}

/** Blinkmuster des Blaulichts: Doppelblitz rot, dann blau (0–1 je Seite). */
export function strobe(t: number, offset: number): [number, number] {
  const p = (t * 1.9 + offset) % 1;
  const on = (a: number, b: number) => (p >= a && p < b ? 1 : 0);
  return [Math.max(on(0, 0.14), on(0.2, 0.34)), Math.max(on(0.5, 0.64), on(0.7, 0.84))];
}

/** Ein Auto als Kästen: Karosserie, Kabine, Lichter. len = Länge in Metern. */
function car(
  scene: ChaseScene,
  x: number,
  y: number,
  heading: number,
  len: number,
  body: Rgb,
  cabin: Rgb,
  pal: Palette,
  lights: { brake?: number; head?: number },
  xray = false,
): void {
  const half = len * 0.23;
  const rad0 = (heading * Math.PI) / 180;
  // Räder: dunkle Klötze, die seitlich etwas herausstehen.
  for (const f of [0.3, -0.3]) {
    for (const s of [-1, 1]) {
      const wx = x + Math.sin(rad0) * f * len + Math.cos(rad0) * s * half * 0.93;
      const wy = y + Math.cos(rad0) * f * len - Math.sin(rad0) * s * half * 0.93;
      scene.box(wx, wy, heading, len * 0.09, -len * 0.09, len * 0.045, 0, len * 0.11, pal.shadow, 0, xray);
    }
  }
  scene.box(x, y, heading, len * 0.5, -len * 0.5, half, len * 0.05, len * 0.21, body, 0, xray);
  scene.box(x, y, heading, len * 0.18, -len * 0.3, half * 0.86, len * 0.21, len * 0.37, cabin, 0, xray);
  // Rücklichter (leuchten beim Bremsen heller) und Scheinwerfer als kleine Kästen am Rand.
  const tail = 0.35 + 0.65 * (lights.brake ?? 0);
  const tailColor: Rgb = [pal.tail[0] * tail, pal.tail[1] * tail, pal.tail[2] * tail];
  const rad = (heading * Math.PI) / 180;
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  for (const s of [-1, 1]) {
    const ox = rx * s * half * 0.72;
    const oy = ry * s * half * 0.72;
    scene.box(
      x + ox,
      y + oy,
      heading,
      -len * 0.47,
      -len * 0.515,
      half * 0.18,
      len * 0.11,
      len * 0.17,
      tailColor,
      1,
      xray,
    );
    scene.box(
      x + ox,
      y + oy,
      heading,
      len * 0.515,
      len * 0.47,
      half * 0.2,
      len * 0.1,
      len * 0.16,
      pal.head,
      0.6 + 0.4 * (lights.head ?? 0),
    );
  }
}

function policeCar(
  scene: ChaseScene,
  x: number,
  y: number,
  heading: number,
  len: number,
  pal: Palette,
  t: number,
  id: number,
  night: number,
  glowScale: number,
  xray = true,
): void {
  car(scene, x, y, heading, len, pal.police, pal.cabin, pal, { brake: 0, head: night }, xray);
  // Blaue Bauchbinde.
  scene.box(x, y, heading, len * 0.505, -len * 0.505, len * 0.236, len * 0.1, len * 0.15, pal.policeBand, 0, xray);
  const [red, blue] = strobe(t, id * 0.37);
  const rad = (heading * Math.PI) / 180;
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);
  const bar = len * 0.11;
  const dim = (c: Rgb, on: number): Rgb => [c[0] * (0.4 + 0.6 * on), c[1] * (0.4 + 0.6 * on), c[2] * (0.4 + 0.6 * on)];
  scene.box(
    x - rx * bar,
    y - ry * bar,
    heading,
    len * 0.04,
    -len * 0.12,
    bar * 0.95,
    len * 0.37,
    len * 0.43,
    dim(pal.red, red),
    1,
    xray,
  );
  scene.box(
    x + rx * bar,
    y + ry * bar,
    heading,
    len * 0.04,
    -len * 0.12,
    bar * 0.95,
    len * 0.37,
    len * 0.43,
    dim(pal.blue, blue),
    1,
    xray,
  );
  // Schein auf der Straße: kräftig nachts, am Tag ein Hauch.
  const k = (0.45 + 0.75 * night) * glowScale;
  // Ein Rest Schein bleibt auch zwischen den Blitzen (sonst verschwindet die Streife nachts im Dunkeln).
  scene.quad(true, x, y, heading, 16, 16, red > 0 ? pal.red : pal.blue, 0.12 * k, SHAPE.disc);
  if (red > 0) {
    scene.quad(true, x - rx * 3, y - ry * 3, heading, 13, 13, pal.red, 0.55 * k, SHAPE.disc);
    scene.quad(true, x, y, heading, 34, 34, pal.red, 0.12 * k, SHAPE.disc);
  }
  if (blue > 0) {
    scene.quad(true, x + rx * 3, y + ry * 3, heading, 13, 13, pal.blue, 0.6 * k, SHAPE.disc);
    scene.quad(true, x, y, heading, 34, 34, pal.blue, 0.14 * k, SHAPE.disc);
  }
}

function shadow(scene: ChaseScene, m: { x: number; y: number }, heading: number, len: number, pal: Palette): void {
  scene.quad(false, m.x + 0.6, m.y - 0.6, heading, len * 0.6, len * 0.3, pal.shadow, 0.35, SHAPE.rect, 0.02);
}

function headlights(
  scene: ChaseScene,
  m: Mover,
  heading: number,
  len: number,
  pal: Palette,
  night: number,
  reach: number,
) {
  if (night < 0.05) return;
  const rad = (heading * Math.PI) / 180;
  const cx = m.x + Math.sin(rad) * (len * 0.5 + reach);
  const cy = m.y + Math.cos(rad) * (len * 0.5 + reach);
  scene.quad(true, cx, cy, heading, reach, reach * 0.42, pal.head, 0.42 * night, SHAPE.beam);
}

export interface DrawInput {
  scene: ChaseScene;
  state: ChaseState;
  setup: ChaseSetup;
  fx: ChaseFx;
  pal: Palette;
  /** Optik-Zeit (Sekunden, läuft auch in der Einleitung für das Blaulicht). */
  t: number;
  dt: number;
  night: number;
  /** Meter pro Pixel (Kamera): Wagen sind mindestens MIN_CAR_PIXELS lang. */
  mpp: number;
  braking: boolean;
  /** Mittelpunkt der Ebene (meist der eigene Wagen). */
  origin: [number, number];
  /** Puls des Verstecks (0–1). */
  pulse: number;
  /** Weg bis zur nächsten Kreuzung und in den gewählten Abzweig ([x, y, …], routeAhead), leer = keiner. */
  route: readonly number[];
  /** Zu schnell für die gewählte Abbiegung (Linie wird rot). */
  tooFast: boolean;
}

/** Ein Bild zusammensetzen. */
export function drawChase(input: DrawInput): number {
  const { scene, state, setup, fx, pal, t, dt, night } = input;
  const scale = Math.max(2, (MIN_CAR_PIXELS * input.mpp) / CAR_LENGTH);
  const len = CAR_LENGTH * scale;
  scene.begin(input.origin[0], input.origin[1], night);
  const p = state.player;

  // Der gewählte Weg: leuchtende Linie bis zur Kreuzung, am Ende ein Pfeil in den Abzweig.
  const r = input.route;
  if (r.length >= 4) {
    const color = input.tooFast ? pal.red : pal.gold;
    const n = r.length / 2;
    for (let i = 1; i < n; i++) {
      const ax = r[2 * i - 2];
      const ay = r[2 * i - 1];
      const bx = r[2 * i];
      const by = r[2 * i + 1];
      const h = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
      const l = Math.hypot(bx - ax, by - ay) / 2;
      // Am Wagen fängt sie schwach an, zur Kreuzung hin wird sie kräftiger.
      const a = Math.min(1, i / 6) * (0.18 + 0.2 * night);
      scene.quad(true, (ax + bx) / 2, (ay + by) / 2, h, l, 0.5 * scale, color, a, SHAPE.line, 0.06);
    }
    const ex = r[r.length - 2];
    const ey = r[r.length - 1];
    const px = r[r.length - 4];
    const py = r[r.length - 3];
    const eh = ((Math.atan2(ex - px, ey - py) * 180) / Math.PI + 360) % 360;
    scene.quad(true, ex, ey, eh, 2.4 * scale, 2.2 * scale, color, 0.7 + 0.3 * night, SHAPE.arrow, 0.07);
  }

  // Verstecke: goldener Ring, pulsierend.
  for (const h of setup.hideouts) {
    const inside = state.inHideout >= 0 && setup.hideouts[state.inHideout] === h;
    const r = 18 + input.pulse * 4;
    scene.quad(false, h.x, h.y, 0, r, r, pal.gold, inside ? 0.8 : 0.55, SHAPE.ring, 0.04);
    scene.quad(
      true,
      h.x,
      h.y,
      0,
      r * 1.3,
      r * 1.3,
      pal.gold,
      (0.12 + 0.2 * night) * (0.6 + 0.4 * input.pulse),
      SHAPE.disc,
    );
  }

  // Reifenspuren.
  for (const s of fx.skids) {
    const age = t - s.born;
    const a = 0.5 * (1 - age / SKID_LIFE);
    const mx = (s.ax + s.bx) / 2;
    const my = (s.ay + s.by) / 2;
    const l = Math.hypot(s.bx - s.ax, s.by - s.ay) / 2 + 0.15;
    const h = ((Math.atan2(s.bx - s.ax, s.by - s.ay) * 180) / Math.PI + 360) % 360;
    scene.quad(false, mx, my, h, l, 0.32 * scale * 0.6, pal.skid, a, SHAPE.line, 0.03);
  }

  // Pakete aus dem Fenster: fliegen in einem Bogen und bleiben liegen.
  for (const q of fx.parcels) {
    const k = Math.min(1, Math.max(0, (t - q.born) / 0.6));
    if (t < q.born) continue;
    const x = q.x0 + (q.x1 - q.x0) * k;
    const y = q.y0 + (q.y1 - q.y0) * k;
    const lift = Math.sin(k * Math.PI) * 3;
    const s = 0.6 * scale;
    scene.box(x, y, q.spin + k * 400, s, -s, s, lift, lift + s * 1.4, pal.parcel);
  }

  // Zivilverkehr.
  for (const c of state.civilians) {
    if (Math.hypot(c.x - p.x, c.y - p.y) > 480) continue;
    const h = fx.smooth(c.id, c.heading, dt);
    shadow(scene, c, h, len * 0.96, pal);
    car(scene, c.x, c.y, h, len * 0.96, pal.civilians[c.color % pal.civilians.length], pal.cabin, pal, {
      brake: c.stopped > 0 ? 1 : 0,
      head: night,
    });
    if (Math.hypot(c.x - p.x, c.y - p.y) < 200) headlights(scene, c, h, len, pal, night * 0.7, 9);
  }

  // Straßensperren: zwei Streifen quer, dazwischen rot-weiße Baken.
  for (const b of state.roadblocks) {
    const across = b.heading + 90;
    const rad = (b.heading * Math.PI) / 180;
    const ax = Math.cos(rad);
    const ay = -Math.sin(rad);
    for (const s of [-1, 1]) {
      const x = b.x + ax * s * len * 0.6;
      const y = b.y + ay * s * len * 0.6;
      shadow(scene, { x, y }, across + (s > 0 ? 180 : 0), len, pal);
      policeCar(scene, x, y, across + (s > 0 ? 180 : 0) + 8 * s, len, pal, t, b.id + s, night, 0.8, false);
    }
    const fx0 = b.x - Math.sin(rad) * len * 0.7;
    const fy0 = b.y - Math.cos(rad) * len * 0.7;
    for (let i = -2; i <= 2; i++) {
      const x = fx0 + ax * i * len * 0.22;
      const y = fy0 + ay * i * len * 0.22;
      scene.box(
        x,
        y,
        across,
        len * 0.1,
        -len * 0.1,
        len * 0.04,
        0,
        len * 0.16,
        i % 2 === 0 ? pal.red : pal.white,
        0.25,
      );
    }
  }

  // Streifen.
  for (const cop of state.cops) {
    if (!cop.active) continue;
    const h = fx.smooth(cop.id + 1000, cop.heading, dt, 12);
    shadow(scene, cop, h, len, pal);
    policeCar(scene, cop.x, cop.y, h, len * 1.04, pal, t, cop.id, night, 1);
    headlights(scene, cop, h, len, pal, night, 14);
  }
  // Beim Fassen kommen Wagen von allen Seiten.
  for (const a of fx.arrivals) {
    if (t < a.born) continue;
    const k = Math.min(1, (t - a.born) / 1.1);
    const e = 1 - (1 - k) ** 3;
    const x = a.x0 + (a.x1 - a.x0) * e;
    const y = a.y0 + (a.y1 - a.y0) * e;
    shadow(scene, { x, y }, a.heading, len, pal);
    policeCar(scene, x, y, a.heading, len * 1.04, pal, t, a.born * 10, night, 1);
  }

  // Der eigene Wagen.
  const ph = fx.smooth(0, p.heading, dt, p.uturn > 0 ? 3 : 11);
  shadow(scene, p, ph, len, pal);
  // Goldener Schein unter dem eigenen Wagen: Man findet ihn sofort, auch zwischen Streifen.
  scene.quad(true, p.x, p.y, ph, len * 0.85, len * 0.55, pal.gold, 0.16 + 0.22 * night, SHAPE.disc);
  headlights(scene, p, ph, len, pal, Math.max(night, 0.25 * (p.turboOn ? 1 : 0)), 22);
  car(scene, p.x, p.y, ph, len, pal.player, pal.playerCabin, pal, { brake: input.braking ? 1 : 0, head: night }, true);
  const rad = (ph * Math.PI) / 180;
  const bx = p.x - Math.sin(rad) * len * 0.55;
  const by = p.y - Math.cos(rad) * len * 0.55;
  scene.quad(true, bx, by, ph, 3.2, 3.2, pal.tail, (input.braking ? 0.55 : 0.18) * (0.4 + night), SHAPE.disc);
  if (p.turboOn) {
    // Flammen aus dem Auspuff.
    const flicker = 0.7 + Math.random() * 0.3;
    scene.quad(
      true,
      bx - Math.sin(rad) * 2.2,
      by - Math.cos(rad) * 2.2,
      ph + 180,
      3.2 * flicker,
      1.3,
      pal.spark,
      0.9,
      SHAPE.beam,
    );
  }

  // Partikel.
  for (const q of fx.particles) {
    const k = q.age / q.life;
    if (q.kind === 'spark') {
      scene.quad(true, q.x, q.y, 0, q.size * scale, q.size * scale, pal.spark, (1 - k) * 1.2, SHAPE.disc, 0.4);
    } else {
      const r = q.size * scale * (1 + k * 1.8);
      scene.quad(false, q.x, q.y, 0, r, r, pal.smoke, 0.35 * (1 - k), SHAPE.disc, 0.3);
    }
  }

  // Hubschrauber: Lichtkegel auf dem Boden, Schatten, Rumpf und Rotor in der Höhe.
  const heli = state.heli;
  if (heli.active) {
    const light = 0.35 + 0.55 * night;
    scene.quad(true, heli.x, heli.y, 0, HELI_RADIUS, HELI_RADIUS, pal.white, light, SHAPE.disc);
    scene.quad(true, heli.x, heli.y, 0, HELI_RADIUS * 0.55, HELI_RADIUS * 0.55, pal.white, light * 0.6, SHAPE.disc);
    const alt = 46;
    const hh = (t * 40) % 360;
    const hx = heli.x - 6;
    const hy = heli.y + 8;
    scene.quad(false, heli.x + 14, heli.y - 12, hh, 6, 3, pal.shadow, 0.3, SHAPE.rect, 0.02);
    scene.box(hx, hy, 45, 3.5, -3, 1.6, alt, alt + 2.6, pal.cabin);
    scene.box(hx, hy, 45, -3, -9, 0.35, alt + 1.2, alt + 1.9, pal.cabin);
    const rotor = (t * 1400) % 360;
    scene.box(hx, hy, rotor, 6.5, -6.5, 0.22, alt + 2.9, alt + 3.05, pal.shadow);
    scene.box(hx, hy, rotor + 90, 6.5, -6.5, 0.22, alt + 2.9, alt + 3.05, pal.shadow);
    // Scheinwerfer am Rumpf.
    scene.box(hx, hy, 45, 3.6, 3.2, 0.5, alt - 0.3, alt + 0.3, pal.white, 1);
  }
  scene.commit();
  return scale;
}
