// Gemeinsamer Takt für die Animationen der Karte (Verkehr, Figuren, Hotspot-Puls): eine requestAnimationFrame-
// Schleife für alle, die nur läuft, solange jemand zuhört, das Spiel nicht pausiert ist und der Tab sichtbar ist.
// Dazu der Bewegungs-Zustand, den GameMap setzt: Spieltempo (0 = Pause, dann steht alles) und "Bewegung reduzieren".
// Reine Optik: Nichts hier liest oder ändert den Spielzustand.
//
//   const stop = onMapFrame((now, dt) => { … });   // dt in echten Sekunden seit dem letzten Bild (höchstens 0,1)
//   motion.speed, motion.reduced, motion.running

import { mapPerf } from './perf';

type FrameListener = (now: number, dt: number) => void;

const listeners = new Map<FrameListener, string>();
let frame = 0;
let last = 0;
let speed = 1;
const changeListeners = new Set<() => void>();

const reducedQuery =
  typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : ({ matches: false } as const);

export const motion = {
  /** Spieltempo (0 = Pause). Setzt GameMap. */
  get speed(): number {
    return speed;
  },
  /** "Bewegung reduzieren" im Betriebssystem: keine Kulisse, kein Pendeln, kein Puls. */
  get reduced(): boolean {
    return reducedQuery.matches;
  },
  /** Läuft gerade etwas (Spiel nicht pausiert, Tab sichtbar)? */
  get running(): boolean {
    return speed > 0 && !(typeof document !== 'undefined' && document.hidden);
  },
};

/** Spieltempo setzen (GameMap). Bei Pause hält die Schleife an, danach läuft sie weiter. */
export function setMotionSpeed(value: number): void {
  if (value === speed) return;
  speed = value;
  for (const fn of changeListeners) fn();
  schedule();
}

/** Bescheid bei Änderungen von Tempo, Sichtbarkeit oder "Bewegung reduzieren". */
export function onMotionChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

/** Im gemeinsamen Takt aufgerufen werden; name erscheint in der Messhilfe (?perf=1). */
export function onMapFrame(fn: FrameListener, name = 'animation'): () => void {
  listeners.set(fn, name);
  schedule();
  return () => {
    listeners.delete(fn);
  };
}

function schedule(): void {
  if (frame || listeners.size === 0 || !motion.running) return;
  frame = requestAnimationFrame(tick);
}

function tick(now: number): void {
  frame = 0;
  if (!motion.running) {
    last = 0;
    return;
  }
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
  last = now;
  for (const [fn, name] of listeners) {
    const t0 = mapPerf.begin();
    try {
      fn(now, dt);
    } catch (error) {
      console.error(`Karten-Animation ${name}`, error);
      listeners.delete(fn);
    }
    mapPerf.end('frame', name, t0);
  }
  schedule();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    last = 0;
    for (const fn of changeListeners) fn();
    schedule();
  });
}
if ('addEventListener' in reducedQuery) {
  reducedQuery.addEventListener('change', () => {
    for (const fn of changeListeners) fn();
  });
}
