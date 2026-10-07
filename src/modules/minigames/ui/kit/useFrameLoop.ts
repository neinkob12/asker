// Eigene Bildschleife eines Minispiels. Solange ein Minispiel offen ist, steht die Spielzeit still (Dialog mit
// pausesGame): onMapFrame und update() der Karten-Ebenen laufen dann nicht. Jedes Spiel tickt deshalb hier.

import { useEffect, useRef } from 'preact/hooks';

/** Größter Schritt in Sekunden: Nach einem Ruckler oder einem Tab-Wechsel springt das Spiel nicht. */
export const MAX_DT = 0.05;

/**
 * Nur Entwicklung (Screenshots, Playwright, headless mit wenigen Bildern pro Sekunde): Spielzeit vorspulen bzw. in
 * Echtzeit laufen lassen. Normal deckelt MAX_DT jeden Schritt, bei 5 Bildern pro Sekunde liefe ein Spiel dann viermal
 * zu langsam. `realtime` holt die echte Zeit in Schritten von höchstens MAX_DT nach (höchstens 0,5 s pro Bild),
 * `advance(s)` spielt beim nächsten Bild s Sekunden in Schritten von MAX_DT ab. Gilt für alle laufenden Schleifen.
 */
export const devClock = { realtime: false, pending: 0, at: -1 };

/** Vorgespulte Zeit: alle Schleifen bekommen sie im selben Bild (gleicher Zeitstempel), danach ist sie verbraucht. */
function pendingAt(now: number): number {
  if (devClock.pending <= 0) return 0;
  if (devClock.at < 0) devClock.at = now;
  if (devClock.at === now) return devClock.pending;
  devClock.pending = 0;
  devClock.at = -1;
  return 0;
}

/** Schritte für ein Bild: normal einer (gedeckelt), mit devClock mehrere. */
function stepsFor(elapsed: number, now: number): number[] {
  if (!import.meta.env.DEV) return [Math.min(MAX_DT, elapsed)];
  let total = devClock.realtime ? Math.min(0.5, elapsed) : Math.min(MAX_DT, elapsed);
  total += pendingAt(now);
  if (total <= MAX_DT) return [total];
  const steps: number[] = [];
  for (let left = total; left > 1e-6; left -= MAX_DT) steps.push(Math.min(MAX_DT, left));
  return steps;
}

/**
 * requestAnimationFrame-Schleife, solange running true ist. cb bekommt dt (echte Sekunden seit dem letzten Bild,
 * höchstens MAX_DT; mit devClock auch mehrmals pro Bild) und t (Spielzeit dieser Schleife in Sekunden, ohne Pausen). Bei verstecktem Tab steht sie still,
 * beim Unmount wird aufgeräumt. cb darf sich bei jedem Rendern ändern (es gilt immer das neueste).
 *
 * Keine Layout-Lesungen (getBoundingClientRect, clientWidth …) in cb: Größen kommen aus useStageCanvas.
 */
export function useFrameLoop(cb: (dt: number, t: number) => void, running: boolean): void {
  const latest = useRef(cb);
  latest.current = cb;
  const time = useRef(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = -1;
        return;
      }
      const elapsed = last < 0 ? 0 : Math.max(0, (now - last) / 1000);
      last = now;
      for (const dt of stepsFor(elapsed, now)) {
        time.current += dt;
        latest.current(dt, time.current);
      }
    };
    const onVisibility = () => {
      last = -1;
    };
    raf = requestAnimationFrame(frame);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [running]);
}
