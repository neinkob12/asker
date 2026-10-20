// Fahr-Bot der Verfolgungsjagd (Auftrag 48): fährt wie ein ordentlicher Spieler über das Raster. Gebraucht für die
// Messung der Schwierigkeit (model.test.ts, viele Seeds je Stufe) und im Dev-Build als Autopilot für Bilder
// (window.chase.autopilot). Reines Modell: kein DOM, kein Zufall (entscheidet nur aus dem Zustand).
//
// So fährt er: auf der Straße, auf der er gerade ist, zur nächsten Kreuzung; dort schon vorher entschieden, wohin es
// danach geht (ohne Tiefgarage weg von den Streifen und geradeaus lieber als abbiegen, mit Tiefgarage auf dem
// kürzesten Weg hin), Sperren meidet er. Vor dem Abbiegen bremst er, im Verkehr wechselt er die Spur, auf langen
// Geraden zündet er den Turbo, und setzt eine Streife zum Rammen an, gibt er Turbo.

import {
  type ChaseInput,
  type ChaseSetup,
  type ChaseState,
  forward,
  GRID,
  headingTo,
  LANE_OFF,
  lineAt,
  PITCH,
  wrapAngle,
} from './model';

type Axis = 'x' | 'z';

export interface Pilot {
  /** Straße, auf der er fährt: Achse, Richtung, Linie (die andere Koordinate = line · PITCH). */
  axis: Axis;
  dir: 1 | -1;
  line: number;
  /** Nächste Kreuzung (Index entlang der Achse) und was danach kommt. */
  node: number;
  after: { axis: Axis; dir: 1 | -1 };
  /** Seitlicher Versatz zur Straßenmitte (rechts positiv in Fahrtrichtung). */
  lateral: number;
  ready: boolean;
}

/** Tempo, mit dem er abbiegt (m/s), und Abstand zur Tiefgarage, ab dem er direkt hinfährt (Meter). */
const TURN_SPEED = 15;
const FINAL_APPROACH = 46;
const BRAKE_DECEL = 22;

export function createPilot(): Pilot {
  return { axis: 'z', dir: -1, line: 0, node: 0, after: { axis: 'z', dir: -1 }, lateral: LANE_OFF, ready: false };
}

const along = (axis: Axis, x: number, z: number) => (axis === 'x' ? x : z);
const across = (axis: Axis, x: number, z: number) => (axis === 'x' ? z : x);

/** Rechts in Fahrtrichtung als Vorzeichen der Querkoordinate. */
function rightSign(axis: Axis, dir: 1 | -1): number {
  return axis === 'x' ? dir : -dir;
}

function nodeXZ(axis: Axis, line: number, node: number): { x: number; z: number } {
  return axis === 'x' ? { x: node * PITCH, z: line * PITCH } : { x: line * PITCH, z: node * PITCH };
}

function blockedRoad(setup: ChaseSetup, axis: Axis, line: number): boolean {
  return axis === 'z' && (line === setup.city.riverCol || line === setup.city.riverCol + 1);
}

/** Ziel der Tiefgarage auf der Straße davor: Mitte des Straßenstücks. */
function hideoutRoad(state: ChaseState): { x: number; z: number; axis: Axis; line: number } | null {
  const h = state.hideout;
  if (!h) return null;
  // Einfahrt nach Norden oder Süden: Straße läuft in x; sonst in z.
  const axis: Axis = Math.abs(Math.cos(h.heading)) > 0.5 ? 'x' : 'z';
  const line = axis === 'x' ? lineAt(h.z) : lineAt(h.x);
  return axis === 'x' ? { x: h.x, z: line * PITCH, axis, line } : { x: line * PITCH, z: h.z, axis, line };
}

/** Wohin nach der Kreuzung: Optionen bewerten (kleiner ist besser). */
function decide(setup: ChaseSetup, state: ChaseState, pilot: Pilot): void {
  const n = nodeXZ(pilot.axis, pilot.line, pilot.node);
  const i = Math.round(n.x / PITCH);
  const j = Math.round(n.z / PITCH);
  const goal = hideoutRoad(state);
  const options: { axis: Axis; dir: 1 | -1 }[] = [
    { axis: 'x', dir: 1 },
    { axis: 'x', dir: -1 },
    { axis: 'z', dir: 1 },
    { axis: 'z', dir: -1 },
  ];
  let best = { axis: pilot.axis, dir: (pilot.dir > 0 ? -1 : 1) as 1 | -1 };
  let bestScore = Infinity;
  for (const o of options) {
    if (o.axis === pilot.axis && o.dir !== pilot.dir) continue; // nicht wenden
    const ni = i + (o.axis === 'x' ? o.dir : 0);
    const nj = j + (o.axis === 'z' ? o.dir : 0);
    if (ni < 0 || nj < 0 || ni > GRID || nj > GRID) continue;
    if (blockedRoad(setup, o.axis, o.axis === 'x' ? j : i)) continue;
    const straight = o.axis === pilot.axis;
    const nx = ni * PITCH;
    const nz = nj * PITCH;
    let score: number;
    if (goal) {
      score = Math.abs(nx - goal.x) + Math.abs(nz - goal.z) + (straight ? 0 : 12);
    } else {
      let near = 400;
      for (const c of state.cops) {
        if (!c.active || c.state === 'wrecked') continue;
        near = Math.min(near, Math.hypot(c.x - nx, c.z - nz));
      }
      const edge = Math.min(ni, nj, GRID - ni, GRID - nj) <= 0 ? 60 : 0;
      score = -near - (straight ? 45 : 0) + edge;
    }
    // Sperren an der nächsten Kreuzung meiden.
    if (state.blocks.some((b) => b.i === ni && b.j === nj && !b.passed)) score += 500;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  pilot.after = best;
}

function startLeg(setup: ChaseSetup, state: ChaseState, pilot: Pilot, axis: Axis, dir: 1 | -1, line: number) {
  const p = state.player;
  pilot.axis = axis;
  pilot.dir = dir;
  pilot.line = line;
  const a = along(axis, p.x, p.z);
  pilot.node = Math.floor(a / PITCH) + (dir > 0 ? 1 : 0);
  if ((pilot.node * PITCH - a) * dir < 4) pilot.node += dir;
  pilot.node = Math.max(0, Math.min(GRID, pilot.node));
  decide(setup, state, pilot);
}

/** Eingabe für diesen Schritt. */
export function pilotInput(setup: ChaseSetup, state: ChaseState, pilot: Pilot): ChaseInput {
  const p = state.player;
  if (!pilot.ready) {
    const f = forward(p.heading);
    const axis: Axis = Math.abs(f.x) > Math.abs(f.z) ? 'x' : 'z';
    const dir: 1 | -1 = (axis === 'x' ? f.x : f.z) > 0 ? 1 : -1;
    startLeg(setup, state, pilot, axis, dir, lineAt(across(axis, p.x, p.z)));
    pilot.ready = true;
  }
  const speed = Math.abs(p.v);
  const a = along(pilot.axis, p.x, p.z);
  const toNode = (pilot.node * PITCH - a) * pilot.dir;
  // Weit vor der Kreuzung neu entscheiden (die Streifen bewegen sich), danach steht es fest.
  if (toNode > 34 + speed * 0.8) decide(setup, state, pilot);
  const turning = pilot.after.axis !== pilot.axis;
  // Kreuzung erreicht: auf die neue Straße wechseln (beim Abbiegen etwas vorher, die Kurve beginnt vor der Mitte).
  if (toNode < (turning ? 2 : -1)) {
    const n = nodeXZ(pilot.axis, pilot.line, pilot.node);
    const line = pilot.after.axis === 'x' ? Math.round(n.z / PITCH) : Math.round(n.x / PITCH);
    startLeg(setup, state, pilot, pilot.after.axis, pilot.after.dir, line);
    return pilotInput(setup, state, pilot);
  }
  // Spur: rechts, außer es steht Verkehr vor ihm; dann die freiere.
  const f = forward(p.course);
  const blockedAt = (lat: number) => {
    let worst = 0;
    for (const v of state.traffic) {
      const dx = v.x - p.x;
      const dz = v.z - p.z;
      const ahead = dx * f.x + dz * f.z;
      if (ahead < -2 || ahead > 26 + speed * 0.9) continue;
      const vLat = (across(pilot.axis, v.x, v.z) - pilot.line * PITCH) * rightSign(pilot.axis, pilot.dir);
      if (Math.abs(vLat - lat) < 2.9) worst = Math.max(worst, 1 - ahead / 120);
    }
    return worst;
  };
  // Setzt eine Streife zum Rammen an: Spur wechseln (wie ein Spieler auf die Warnung hin).
  const charger = state.cops.find((c) => c.charging);
  const dodge = charger ? (pilot.lateral > 0 ? -LANE_OFF : LANE_OFF) : null;
  const lanes = dodge !== null ? [dodge] : [LANE_OFF, -LANE_OFF, 0];
  let lane = lanes[0];
  let laneCost = Infinity;
  for (const l of lanes) {
    const cost = blockedAt(l) * 10 + Math.abs(l - pilot.lateral) * 0.05 + (l === LANE_OFF ? 0 : 0.2);
    if (cost < laneCost) {
      laneCost = cost;
      lane = l;
    }
  }
  pilot.lateral += (lane - pilot.lateral) * (dodge !== null ? 0.3 : 0.15);
  // Zielpunkt voraus auf der Spur; in der Kurve schon auf der neuen Straße.
  const look = 9 + speed * 0.35;
  let tx: number;
  let tz: number;
  const goal = hideoutRoad(state);
  const h = state.hideout;
  let final = false;
  if (h && goal && Math.hypot(h.x - p.x, h.z - p.z) < FINAL_APPROACH) {
    // Tiefgarage: auf der Spur ranfahren, die letzten Meter rein.
    final = true;
    const alongH = along(goal.axis, h.x, h.z);
    const myAlong = along(goal.axis, p.x, p.z);
    const lat = across(goal.axis, h.x, h.z) - goal.line * PITCH;
    const onRoad = Math.abs(across(goal.axis, p.x, p.z) - goal.line * PITCH) < 9;
    if (onRoad && Math.abs(alongH - myAlong) < 11) {
      tx = h.x;
      tz = h.z;
    } else if (onRoad) {
      const side = Math.sign(lat) * LANE_OFF;
      tx = goal.axis === 'x' ? alongH : goal.line * PITCH + side;
      tz = goal.axis === 'x' ? goal.line * PITCH + side : alongH;
    } else {
      tx = goal.x;
      tz = goal.z;
      final = false;
    }
  } else if (turning && toNode < look) {
    const n = nodeXZ(pilot.axis, pilot.line, pilot.node);
    const rest = look - Math.max(0, toNode);
    const side = rightSign(pilot.after.axis, pilot.after.dir) * LANE_OFF;
    tx = n.x + (pilot.after.axis === 'x' ? pilot.after.dir * rest : side);
    tz = n.z + (pilot.after.axis === 'z' ? pilot.after.dir * rest : side);
  } else {
    const lat = pilot.line * PITCH + rightSign(pilot.axis, pilot.dir) * pilot.lateral;
    tx = pilot.axis === 'x' ? a + pilot.dir * look : lat;
    tz = pilot.axis === 'x' ? lat : a + pilot.dir * look;
  }
  const want = headingTo(tx - p.x, tz - p.z);
  const diff = wrapAngle(want - p.heading);
  const steer = Math.max(-1, Math.min(1, diff * 2.6));
  // Tempo: vor dem Abbiegen und an der Tiefgarage bremsen.
  let limit = Infinity;
  if (turning) {
    const dist = Math.max(0, toNode - 4);
    limit = Math.sqrt(TURN_SPEED * TURN_SPEED + 2 * BRAKE_DECEL * dist * 0.75);
  }
  if (final) limit = Math.min(limit, 14);
  if (Math.abs(diff) > 0.9) limit = Math.min(limit, 12);
  const brake = speed > limit + 1.5;
  const charging = !!charger;
  const longStraight = !turning && toNode > 90 && Math.abs(diff) < 0.12 && laneCost < 1;
  const turbo = !brake && !final && p.turbo >= 0.999 && (charging || longStraight);
  return { steer, gas: !brake && speed < limit, brake, turbo };
}
