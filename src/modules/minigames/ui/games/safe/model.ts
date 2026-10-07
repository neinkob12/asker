// Tresor knacken (Auftrag 44, Teil 0): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Ein altes Zahlenschloss mit 100 Strichen (0 bis 99). Drei Zahlen aus dem Seed, abwechselnd rechts und links
// gedreht wie bei einem echten Schloss: erst rechts auf die erste Zahl, dann links auf die zweite, dann rechts auf
// die dritte. Einrasten mit der Leertaste bzw. „Einrasten“: Sitzt die Zahl (Toleranz schmaler mit der Schwierigkeit)
// und kam man aus der richtigen Richtung, rastet sie ein. Sonst Fehlerton und Strafsekunden.
// Score: geknackt 0,6 + 0,4 · restliche Zeit; sonst 0,2 · geknackte Zahlen / 3.

import { createRng } from '../../../../../core';

/** Striche auf dem Rad. */
export const DIAL_SIZE = 100;

/** Drehrichtung: +1 rechts (im Uhrzeigersinn, Zahlen steigen), −1 links. */
export type TurnDir = 1 | -1;

export interface SafeSetup {
  /** Die drei Zahlen (0 bis 99). */
  combo: [number, number, number];
  /** So weit (in Strichen) darf man danebenliegen. */
  tolerance: number;
  /** Zeit in Sekunden. */
  duration: number;
  /** Strafsekunden pro Fehlversuch. */
  penalty: number;
  /** Startstellung des Rads. */
  start: number;
}

export interface SafeState {
  /** Stellung des Rads (0 bis < 100, mit Nachkommastellen). */
  pos: number;
  /** Welche Zahl gerade dran ist (0, 1, 2; 3 = offen). */
  step: number;
  /** Vergangene Zeit in Sekunden. */
  time: number;
  /** Strafsekunden bisher. */
  penalty: number;
  /** Richtung der letzten Drehung (0 = seit dem letzten Einrasten nicht gedreht). */
  lastDir: TurnDir | 0;
  /** Wie weit seit dem letzten Einrasten in lastDir gedreht wurde (Striche). */
  travel: number;
  mistakes: number;
  done: boolean;
  opened: boolean;
}

export type ConfirmResult = 'locked' | 'opened' | 'miss' | 'wrongWay' | 'done';

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Kurze Strecke zwischen zwei Stellungen auf dem Rad (0 bis 50). */
export function dialDistance(a: number, b: number): number {
  const d = Math.abs((((a - b) % DIAL_SIZE) + DIAL_SIZE) % DIAL_SIZE);
  return Math.min(d, DIAL_SIZE - d);
}

/** Stellung auf 0 bis < 100 bringen. */
export function wrap(pos: number): number {
  return ((pos % DIAL_SIZE) + DIAL_SIZE) % DIAL_SIZE;
}

/** Zahl, die gerade unter der Marke steht. */
export function dialNumber(pos: number): number {
  return Math.round(wrap(pos)) % DIAL_SIZE;
}

/** In welche Richtung die Zahl dieses Schritts gedreht wird: rechts, links, rechts. */
export function requiredDir(step: number): TurnDir {
  return step % 2 === 0 ? 1 : -1;
}

/**
 * Tresor aus Seed und Schwierigkeit. Die Zahlen liegen weit genug auseinander (mindestens 18 Striche), damit jede
 * Drehung ein Stück Weg ist; Zeit 50 s, schwer (ab etwa 0,8) 36 s; Toleranz 4 Striche (leicht) bis 2 (schwer),
 * Fehler kosten 2 bzw. 3 Sekunden (Auftrag 47: leichter, mehr Hinweise).
 */
export function createSafe(seed: number, difficulty: number): SafeSetup {
  const random = createRng(seed);
  const d = clamp01(difficulty);
  const start = Math.floor(random() * DIAL_SIZE);
  const combo: number[] = [];
  let last = start;
  while (combo.length < 3) {
    const n = Math.floor(random() * DIAL_SIZE);
    if (dialDistance(n, last) < 18 || combo.includes(n)) continue;
    combo.push(n);
    last = n;
  }
  const hard = clamp01((d - 0.4) / 0.4);
  return {
    combo: combo as [number, number, number],
    tolerance: Math.round((4 - 2 * d) * 10) / 10,
    duration: Math.round(50 - 14 * hard),
    penalty: d >= 0.6 ? 3 : 2,
    start,
  };
}

export function initSafe(setup: SafeSetup): SafeState {
  return {
    pos: setup.start,
    step: 0,
    time: 0,
    penalty: 0,
    lastDir: 0,
    travel: 0,
    mistakes: 0,
    done: false,
    opened: false,
  };
}

/** Restliche Zeit in Sekunden (mit Strafsekunden), nie unter 0. */
export function timeLeft(setup: SafeSetup, state: SafeState): number {
  return Math.max(0, setup.duration - state.time - state.penalty);
}

/**
 * Rad drehen (delta in Strichen, + = rechts). Gibt die überschrittenen ganzen Zahlen zurück (für das Klicken im Ton),
 * höchstens 50 pro Aufruf. Nach dem Ende passiert nichts.
 */
export function turn(state: SafeState, delta: number): number[] {
  if (state.done || !Number.isFinite(delta) || delta === 0) return [];
  const dir: TurnDir = delta > 0 ? 1 : -1;
  const from = state.pos;
  const to = from + delta;
  const crossed: number[] = [];
  if (dir > 0) {
    for (let n = Math.floor(from) + 1; n <= Math.floor(to) && crossed.length < 50; n++) crossed.push(wrap(n));
  } else {
    for (let n = Math.ceil(from) - 1; n >= Math.ceil(to) && crossed.length < 50; n--) crossed.push(wrap(n));
  }
  state.pos = wrap(to);
  state.travel = state.lastDir === dir ? state.travel + Math.abs(delta) : Math.abs(delta);
  state.lastDir = dir;
  return crossed;
}

/** Über so viele Striche steigt die Nähe an (Stethoskop, Klicken, Zittern). */
export const PROXIMITY_RANGE = 16;

/**
 * Wie nah das Rad an der Zahl dieses Schritts ist (0 = weit weg, 1 = genau drauf), über PROXIMITY_RANGE Striche
 * ansteigend. Für Ton, Zittern und den Ausschlag am Stethoskop. Aus der falschen Richtung nur halb so deutlich.
 */
export function proximity(setup: SafeSetup, state: SafeState): number {
  if (state.step > 2) return 0;
  const target = setup.combo[state.step];
  const d = dialDistance(state.pos, target);
  const near = clamp01(1 - d / PROXIMITY_RANGE) ** 1.6;
  return state.lastDir === requiredDir(state.step) || state.lastDir === 0 ? near : near * 0.5;
}

/** Hat die Drehung (crossed aus turn) die Zahl dieses Schritts in der richtigen Richtung überfahren? Dann klickt es. */
export function crossedTarget(setup: SafeSetup, state: SafeState, crossed: readonly number[]): boolean {
  if (state.step > 2 || state.lastDir !== requiredDir(state.step)) return false;
  return crossed.includes(setup.combo[state.step]);
}

/** Liegt das Rad gerade innerhalb der Toleranz? */
export function onTarget(setup: SafeSetup, state: SafeState): boolean {
  return state.step <= 2 && dialDistance(state.pos, setup.combo[state.step]) <= setup.tolerance;
}

/** Einrasten versuchen. */
export function confirm(setup: SafeSetup, state: SafeState): ConfirmResult {
  if (state.done) return 'done';
  const wrongWay = state.lastDir !== requiredDir(state.step);
  if (wrongWay || !onTarget(setup, state)) {
    state.mistakes += 1;
    state.penalty += setup.penalty;
    if (timeLeft(setup, state) <= 0) state.done = true;
    return wrongWay && onTarget(setup, state) ? 'wrongWay' : 'miss';
  }
  state.step += 1;
  state.lastDir = 0;
  state.travel = 0;
  if (state.step > 2) {
    state.done = true;
    state.opened = true;
    return 'opened';
  }
  return 'locked';
}

/** Zeit laufen lassen. true, wenn die Zeit gerade abgelaufen ist. */
export function advance(setup: SafeSetup, state: SafeState, dt: number): boolean {
  if (state.done || !(dt > 0)) return false;
  state.time += dt;
  if (timeLeft(setup, state) <= 0) {
    state.done = true;
    return true;
  }
  return false;
}

/** Geknackte Zahlen (0 bis 3). */
export function cracked(state: SafeState): number {
  return Math.min(3, state.step);
}

/** Score: geknackt 0,6 + 0,4 · Anteil der restlichen Zeit; sonst 0,2 · geknackte Zahlen / 3. */
export function safeScore(setup: SafeSetup, state: SafeState): number {
  if (state.opened) return Math.round((0.6 + 0.4 * (timeLeft(setup, state) / setup.duration)) * 1000) / 1000;
  return Math.round(((0.2 * cracked(state)) / 3) * 1000) / 1000;
}
