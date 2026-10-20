// Tresor knacken (Auftrag 44, Teil 0): Spiellogik als reines Modell, ohne DOM (getestet in model.test.ts).
//
// Ein altes Zahlenschloss mit 100 Strichen (0 bis 99). Drei Zahlen aus dem Seed, abwechselnd rechts und links
// gedreht wie bei einem echten Schloss: erst rechts auf die erste Zahl, dann links auf die zweite, dann rechts auf
// die dritte. Einrasten mit der Leertaste bzw. „Einrasten“: Sitzt die Zahl (Toleranz schmaler mit der Schwierigkeit)
// und kam man aus der richtigen Richtung, rastet sie ein. Sonst Fehlerton und Strafsekunden. Seit Auftrag 48 darf man
// nach dem Überdrehen ein kleines Stück zurück (bis CORRECTION Striche), ohne dass es als falsche Richtung zählt.
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
  /** Störklicks je Zahl: Hier hakt das Rad auch, aber kürzer und dumpfer (Stethoskop schlägt nur halb aus). */
  decoys: number[][];
  /** So lange (Sekunden) hakt das Rad beim Ziehen oder Halten an der richtigen Zahl fest (Zeit zum Loslassen). */
  catchTime: number;
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
  /** Seit dem letzten Einrasten in die verlangte Richtung gedreht (Striche). */
  ahead: number;
  /** Seitdem wieder zurück gedreht (Striche, gegen die verlangte Richtung). */
  back: number;
  mistakes: number;
  done: boolean;
  opened: boolean;
  /** Das Rad hakt an der Zahl: so viele Sekunden noch (Ziehen und Halten drehen solange nicht weiter). */
  caught: number;
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
  // Störklicks: ab mittlerer Schwierigkeit hakt das Rad kurz vor der Zahl auch an einer falschen Stelle, dumpfer.
  const decoyCount = d < DECOY_FROM ? 0 : d < DECOY_TWO_FROM ? 1 : 2;
  const decoys = combo.map((n, i) => {
    const list: number[] = [];
    while (list.length < decoyCount) {
      const k = 7 + Math.floor(random() * 18);
      const at = wrap(n - requiredDir(i) * k);
      if (list.every((x) => dialDistance(x, at) >= 5)) list.push(at);
    }
    return list;
  });
  return {
    combo: combo as [number, number, number],
    decoys,
    tolerance: Math.round((4 - 2 * d) * 10) / 10,
    duration: Math.round(DURATION_EASY - (DURATION_EASY - DURATION_HARD) * clamp01((d - 0.2) / 0.7)),
    penalty: d >= 0.6 ? 3 : 2,
    start,
    catchTime: Math.round((CATCH_EASY - (CATCH_EASY - CATCH_HARD) * d) * 100) / 100,
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
    ahead: 0,
    back: 0,
    mistakes: 0,
    done: false,
    opened: false,
    caught: 0,
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
  if (state.step <= 2 && dir === requiredDir(state.step)) {
    state.ahead += Math.abs(delta);
    state.back = 0;
  } else state.back += Math.abs(delta);
  return crossed;
}

/** So weit (Striche) darf man nach dem Überdrehen zurück, ohne dass es als falsche Richtung zählt. */
export const CORRECTION = 6;

/** Kommt das Rad aus der richtigen Richtung (höchstens CORRECTION Striche zurück korrigiert)? */
export function comingRight(state: SafeState): boolean {
  return state.step <= 2 && state.ahead > 0 && state.back <= CORRECTION;
}

/** Striche pro Sekunde, wenn man eine Taste bzw. einen Knopf hält. */
export const HOLD_SPEED = 22;
/** So viel Tempo bleibt kurz vor der richtigen Zahl (Ziehen, Halten): das Rad hakt, man landet leichter drauf. */
export const STICKY = 0.45;

/** Faktor auf das Tempo beim Ziehen und Halten: kurz vor der Zahl dieses Schritts (in der richtigen Richtung) hakt es. */
export function stickyFactor(setup: SafeSetup, state: SafeState, dir: TurnDir): number {
  if (state.step > 2 || dir !== requiredDir(state.step)) return 1;
  return dialDistance(state.pos, setup.combo[state.step]) <= setup.tolerance + 1.5 ? STICKY : 1;
}

/** Zeit in Sekunden bis Schwierigkeit 0,2 bzw. ab 0,9 (dazwischen gleitend). */
export const DURATION_EASY = 48;
export const DURATION_HARD = 34;

/** So lange hakt das Rad an der Zahl (Sekunden), leicht bzw. schwer: etwa eine Reaktionszeit, schwer etwas weniger. */
export const CATCH_EASY = 0.42;
export const CATCH_HARD = 0.2;
/** Ab dieser Schwierigkeit ein Störklick je Zahl, ab der zweiten zwei. */
export const DECOY_FROM = 0.4;
export const DECOY_TWO_FROM = 0.8;
/** Ein Störklick hakt so viel kürzer als die echte Zahl. */
export const DECOY_CATCH = 0.6;

/** Woran das Rad gerade eingehakt hat: die echte Zahl, ein Störklick oder nichts. */
export type Catch = 'target' | 'decoy' | null;

/**
 * Drehen beim Ziehen oder Halten (nicht beim einzelnen Tipp): kurz vor der Zahl hakt es (STICKY), und wer die Zahl in
 * der richtigen Richtung überfährt, bleibt für catchTime Sekunden genau auf ihr hängen. Wer in der Zeit loslässt, steht
 * richtig; wer weiterdreht, dreht danach weiter. Gibt die überschrittenen Zahlen zurück (wie turn) und ob es eingehakt
 * hat.
 */
export function turnHeld(setup: SafeSetup, state: SafeState, delta: number): { crossed: number[]; caught: Catch } {
  if (state.done || state.caught > 0 || !Number.isFinite(delta) || delta === 0) return { crossed: [], caught: null };
  const dir: TurnDir = delta > 0 ? 1 : -1;
  const crossed = turn(state, delta * stickyFactor(setup, state, dir));
  let at: number | null = null;
  let caught: Catch = null;
  if (crossedTarget(setup, state, crossed)) {
    at = setup.combo[state.step];
    caught = 'target';
  } else if (state.step <= 2 && dir === requiredDir(state.step)) {
    const decoy = (setup.decoys[state.step] ?? []).find((n) => crossed.includes(n));
    if (decoy !== undefined) {
      at = decoy;
      caught = 'decoy';
    }
  }
  if (at === null) return { crossed, caught: null };
  state.ahead = Math.max(0, state.ahead - dialDistance(state.pos, at));
  state.pos = at;
  state.caught = setup.catchTime * (caught === 'decoy' ? DECOY_CATCH : 1);
  return { crossed, caught };
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
  const untouched = state.ahead === 0 && state.back === 0;
  return untouched || comingRight(state) ? near : near * 0.5;
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
  const wrongWay = !comingRight(state);
  if (wrongWay || !onTarget(setup, state)) {
    state.mistakes += 1;
    state.penalty += setup.penalty;
    if (timeLeft(setup, state) <= 0) state.done = true;
    return wrongWay && onTarget(setup, state) ? 'wrongWay' : 'miss';
  }
  state.step += 1;
  state.caught = 0;
  state.lastDir = 0;
  state.travel = 0;
  state.ahead = 0;
  state.back = 0;
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
  state.caught = Math.max(0, state.caught - dt);
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

/** Ein Wert unter der Wertung (Form wie MinigameStat im Rahmen, Lead-PR #136). */
export interface SafeStat {
  label: string;
  value: string;
  icon?: string;
  tone?: 'good' | 'bad';
}

/** Ergebnis-Werte: Zahlen, Fehlversuche, Zeit übrig. */
export function safeStats(setup: SafeSetup, state: SafeState): SafeStat[] {
  const stats: SafeStat[] = [{ label: 'Zahlen', value: `${cracked(state)}/3`, icon: 'lock', tone: 'good' }];
  stats.push({
    label: 'Fehlversuche',
    value: String(state.mistakes),
    ...(state.mistakes > 0 ? { tone: 'bad' as const } : {}),
  });
  if (state.opened) stats.push({ label: 'Zeit übrig', value: `${Math.ceil(timeLeft(setup, state))} s`, icon: 'clock' });
  return stats;
}
