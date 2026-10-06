// Eigene Bildschleife eines Minispiels. Solange ein Minispiel offen ist, steht die Spielzeit still (Dialog mit
// pausesGame): onMapFrame und update() der Karten-Ebenen laufen dann nicht. Jedes Spiel tickt deshalb hier.

import { useEffect, useRef } from 'preact/hooks';

/** Größter Schritt in Sekunden: Nach einem Ruckler oder einem Tab-Wechsel springt das Spiel nicht. */
export const MAX_DT = 0.05;

/**
 * requestAnimationFrame-Schleife, solange running true ist. cb bekommt dt (echte Sekunden seit dem letzten Bild,
 * höchstens MAX_DT) und t (Spielzeit dieser Schleife in Sekunden, ohne Pausen). Bei verstecktem Tab steht sie still,
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
      const dt = last < 0 ? 0 : Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
      last = now;
      time.current += dt;
      latest.current(dt, time.current);
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
