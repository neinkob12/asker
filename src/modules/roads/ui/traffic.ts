// Verkehr als Kulisse (reine Optik, DOM-frei und testbar): Fahrzeuge erscheinen an zufälligen Stellen im Ausschnitt,
// fahren als Zufallsweg über die Kanten des Straßennetzes (geradeaus bevorzugt, Einbahnstraßen beachtet) und
// verschwinden nach MAX_TRAVEL Metern oder außerhalb des Ausschnitts. Tempo nach Straßenart (ROAD_SPEEDS × 0,8 bis 1,1).
// Zufall nur aus dem eigenen Generator (mulberry32), nie aus der Simulation: Der Spielstand bleibt unberührt.

import type { LngLat } from '../../../core';
import { ROAD_SPEEDS, type RoadClass, type RoadGraphView } from '../index';

export type TrafficKind = 'car' | 'van' | 'truck' | 'police';

/** Anteile der Arten (ohne Heat). Streifenwagen werden mit der Heat häufiger (policeShare). */
export const TRAFFIC_MIX: Record<Exclude<TrafficKind, 'police'>, number> = { car: 0.7, van: 0.15, truck: 0.1 };
/** Nach so vielen Metern verschwindet ein Fahrzeug. */
export const MAX_TRAVEL = 3000;
/**
 * Optisches Tempo: Mit echtem Tempo kröchen die Autos bei Zoom 15 mit 3 Pixeln pro Sekunde; so wirken sie lebendig,
 * bleiben aber ruhig.
 */
export const VISUAL_SPEED = 1.6;
/** Höchstens so viele neue Fahrzeuge pro Schritt (füllt den Ausschnitt in gut einer Sekunde). */
const SPAWN_PER_STEP = 3;
/** Fenster für die Fahrtrichtung (Meter davor und danach): weich durch Kurven. */
const HEADING_WINDOW = 5;

/** Wie gern auf einer Straßenart Verkehr erscheint bzw. abgebogen wird (große Straßen sind belebter). */
const SPAWN_WEIGHT: Record<RoadClass, number> = {
  motorway: 0.9,
  trunk: 0.9,
  primary: 1,
  secondary: 0.9,
  tertiary: 0.8,
  unclassified: 0.5,
  residential: 0.35,
  living_street: 0.1,
};
const TURN_WEIGHT: Record<RoadClass, number> = {
  motorway: 1.2,
  trunk: 1.2,
  primary: 1.1,
  secondary: 1,
  tertiary: 1,
  unclassified: 0.8,
  residential: 0.6,
  living_street: 0.3,
};

/** Kleiner, schneller Zufallsgenerator mit Startwert (gleicher Startwert = gleiche Folge). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ausschnitt in Metern der Projektion des Graphen. */
export interface TrafficArea {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Leg {
  edge: number;
  /** 1 = von edgeFrom nach edgeTo, 0 = rückwärts. */
  dir: number;
}

export interface TrafficCar {
  id: number;
  kind: TrafficKind;
  color: string;
  leg: Leg;
  prev: Leg | null;
  next: Leg | null;
  /** Meter auf der aktuellen Kante in Fahrtrichtung. */
  s: number;
  factor: number;
  traveled: number;
}

export interface TrafficPose {
  id: number;
  lng: number;
  lat: number;
  heading: number;
  kind: TrafficKind;
  color: string;
}

export interface TrafficStep {
  /** So viele Fahrzeuge sollen es gerade sein. */
  target: number;
  /** Hier erscheinen sie, außerhalb (mit Rand) verschwinden sie. */
  area: TrafficArea;
  /** Anteil der Streifenwagen (0,05 ohne Heat). */
  policeShare: number;
  random: () => number;
}

export class Traffic {
  readonly cars: TrafficCar[] = [];
  private nextId = 1;

  constructor(
    private readonly g: RoadGraphView,
    private readonly palette: Record<TrafficKind, readonly string[]>,
  ) {}

  clear(): void {
    this.cars.length = 0;
  }

  private length(leg: Leg): number {
    return this.g.edgeLength[leg.edge];
  }

  /** Punkt auf einer Kante, d Meter in Fahrtrichtung ab ihrem Anfang. */
  private pointOn(leg: Leg, d: number): [number, number] {
    const g = this.g;
    const e = leg.edge;
    const len = g.edgeLength[e];
    const along = Math.min(len, Math.max(0, leg.dir ? d : len - d));
    let lo = g.shapeStart[e];
    let hi = g.shapeStart[e + 1] - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (g.shapeDist[mid] <= along) lo = mid;
      else hi = mid;
    }
    const span = g.shapeDist[hi] - g.shapeDist[lo];
    const f = span > 0 ? (along - g.shapeDist[lo]) / span : 0;
    return [g.shapeX[lo] + (g.shapeX[hi] - g.shapeX[lo]) * f, g.shapeY[lo] + (g.shapeY[hi] - g.shapeY[lo]) * f];
  }

  /** Punkt offset Meter ab dem Anfang der aktuellen Kante, auch auf der vorigen oder nächsten. */
  private pointAt(car: TrafficCar, offset: number): [number, number] {
    const len = this.length(car.leg);
    if (offset > len && car.next) return this.pointOn(car.next, offset - len);
    if (offset < 0 && car.prev) return this.pointOn(car.prev, this.length(car.prev) + offset);
    return this.pointOn(car.leg, offset);
  }

  private endNode(leg: Leg): number {
    return leg.dir ? this.g.edgeTo[leg.edge] : this.g.edgeFrom[leg.edge];
  }

  /** Richtung am Ende (fromEnd) bzw. am Anfang einer Kante in Fahrtrichtung, als Einheitsvektor. */
  private direction(leg: Leg, fromEnd: boolean): [number, number] {
    const len = this.length(leg);
    const step = Math.min(8, len / 2);
    const [ax, ay] = this.pointOn(leg, fromEnd ? len - step : 0);
    const [bx, by] = this.pointOn(leg, fromEnd ? len : step);
    const d = Math.hypot(bx - ax, by - ay) || 1;
    return [(bx - ax) / d, (by - ay) / d];
  }

  /** Nächste Kante am Ende von leg: geradeaus bevorzugt, große Straßen etwas lieber, wenden nur in der Sackgasse. */
  private chooseNext(leg: Leg, random: () => number): Leg | null {
    const g = this.g;
    const node = this.endNode(leg);
    const [ix, iy] = this.direction(leg, true);
    const options: { leg: Leg; weight: number }[] = [];
    let back: Leg | null = null;
    for (let k = g.adjStart[node]; k < g.adjStart[node + 1]; k++) {
      const candidate = { edge: g.adjEdge[k], dir: g.adjDir[k] };
      if (candidate.edge === leg.edge) {
        back = candidate;
        continue;
      }
      const [ox, oy] = this.direction(candidate, false);
      const angle = Math.acos(Math.max(-1, Math.min(1, ix * ox + iy * oy)));
      const cls = g.classes[g.edgeClass[candidate.edge]] ?? 'residential';
      options.push({ leg: candidate, weight: Math.exp(-((angle / 0.7) ** 2)) * TURN_WEIGHT[cls] + 0.02 });
    }
    if (options.length === 0) return back;
    let r = random() * options.reduce((sum, o) => sum + o.weight, 0);
    for (const o of options) {
      r -= o.weight;
      if (r <= 0) return o.leg;
    }
    return options[options.length - 1].leg;
  }

  private speed(car: TrafficCar): number {
    const cls = this.g.classes[this.g.edgeClass[car.leg.edge]] ?? 'residential';
    return (ROAD_SPEEDS[cls] / 3.6) * car.factor * VISUAL_SPEED;
  }

  private inside(x: number, y: number, a: TrafficArea, margin: number): boolean {
    const mx = (a.maxX - a.minX) * margin;
    const my = (a.maxY - a.minY) * margin;
    return x >= a.minX - mx && x <= a.maxX + mx && y >= a.minY - my && y <= a.maxY + my;
  }

  private pickKind(random: () => number, policeShare: number): TrafficKind {
    const r = random();
    if (r < policeShare) return 'police';
    const rest = (r - policeShare) / Math.max(1e-6, 1 - policeShare);
    if (rest < TRAFFIC_MIX.car) return 'car';
    if (rest < TRAFFIC_MIX.car + TRAFFIC_MIX.van) return 'van';
    return 'truck';
  }

  /** Neues Fahrzeug an einer zufälligen Stelle im Ausschnitt (oder null, wenn dort keine Straße ist). */
  private spawn(step: TrafficStep): TrafficCar | null {
    const g = this.g;
    const { area, random } = step;
    const nodes = g.nodeX.length;
    for (let tries = 0; tries < 80; tries++) {
      const node = Math.floor(random() * nodes);
      if (!this.inside(g.nodeX[node], g.nodeY[node], area, 0)) continue;
      const count = g.adjStart[node + 1] - g.adjStart[node];
      if (count === 0) continue;
      const k = g.adjStart[node] + Math.floor(random() * count);
      const leg = { edge: g.adjEdge[k], dir: g.adjDir[k] };
      const cls = g.classes[g.edgeClass[leg.edge]] ?? 'residential';
      if (random() > SPAWN_WEIGHT[cls]) continue;
      const kind = this.pickKind(random, step.policeShare);
      const colors = this.palette[kind];
      const car: TrafficCar = {
        id: this.nextId++,
        kind,
        color: colors[Math.floor(random() * colors.length)] ?? '#8d939c',
        leg,
        prev: null,
        next: null,
        s: random() * this.length(leg),
        factor: 0.8 + random() * 0.3,
        traveled: 0,
      };
      car.next = this.chooseNext(leg, random);
      return car;
    }
    return null;
  }

  /** dt Sekunden (optische Zeit, schon mit dem Spieltempo verrechnet) weiterfahren, auffüllen, aussortieren. */
  step(dt: number, step: TrafficStep): void {
    const cars = this.cars;
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      let move = this.speed(car) * dt;
      car.traveled += move;
      while (move > 0) {
        const rest = this.length(car.leg) - car.s;
        if (move < rest) {
          car.s += move;
          break;
        }
        move -= rest;
        if (!car.next) {
          car.s = this.length(car.leg);
          car.traveled = MAX_TRAVEL;
          break;
        }
        car.prev = car.leg;
        car.leg = car.next;
        car.s = 0;
        car.next = this.chooseNext(car.leg, step.random);
      }
      const [x, y] = this.pointAt(car, car.s);
      if (car.traveled >= MAX_TRAVEL || !this.inside(x, y, step.area, 0.3)) cars.splice(i, 1);
    }
    // Zu viele (z.B. Uhrzeit, Einstellung): die ältesten zuerst weg.
    while (cars.length > step.target) cars.shift();
    for (let n = 0; n < SPAWN_PER_STEP && cars.length < step.target; n++) {
      const car = this.spawn(step);
      if (!car) break;
      cars.push(car);
    }
  }

  /** Stellungen für die Flotte (Grad, Fahrtrichtung über HEADING_WINDOW gemittelt). */
  poses(): TrafficPose[] {
    return this.cars.map((car) => {
      const [x, y] = this.pointAt(car, car.s);
      const [ax, ay] = this.pointAt(car, car.s - HEADING_WINDOW);
      const [bx, by] = this.pointAt(car, car.s + HEADING_WINDOW);
      const heading = ((Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 360) % 360;
      const p: LngLat = this.g.toLngLat(x, y);
      return { id: car.id, lng: p.lng, lat: p.lat, heading, kind: car.kind, color: car.color };
    });
  }
}

/** Dichte nach Uhrzeit: Berufsverkehr 7 bis 9 und 16 bis 19 Uhr × 1,5, nachts 23 bis 5 Uhr × 0,3. */
export function hourDensity(hour: number): number {
  if ((hour >= 7 && hour < 9) || (hour >= 16 && hour < 19)) return 1.5;
  if (hour >= 23 || hour < 5) return 0.3;
  return 1;
}

/** Optischer Zeitfaktor nach Spieltempo: 0 bei Pause, schneller bei hohem Tempo, aber nicht linear. */
export function tempoFactor(speed: number): number {
  return speed <= 0 ? 0 : Math.sqrt(speed);
}

/** Höchstzahl der Fahrzeuge nach Gerät (Budget aus Auftrag 31); "wenig" ist die Hälfte. */
export const TRAFFIC_MAX = { desktop: 40, mobile: 14 } as const;

/** Zielzahl: Höchstzahl × Dichte der Stunde; der Berufsverkehr (× 1,5) schöpft das Budget aus. */
export function trafficTarget(level: 'off' | 'low' | 'normal', mobile: boolean, hour: number): number {
  if (level === 'off') return 0;
  const max = mobile ? TRAFFIC_MAX.mobile : TRAFFIC_MAX.desktop;
  const base = level === 'low' ? max / 2 : max;
  return Math.round((base * hourDensity(hour)) / 1.5);
}

/** Anteil der Streifenwagen: 5 %, mit der Heat der sichtbaren Veedel mehr (bis 25 %). */
export function policeShare(averageHeat: number): number {
  return Math.min(0.25, 0.05 * (1 + Math.max(0, averageHeat) / 40));
}
