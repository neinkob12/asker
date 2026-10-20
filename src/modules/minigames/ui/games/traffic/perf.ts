// Messhilfe für scripts/perf-browser.mjs (Szenen kontrolle, papiere): Rechenzeit pro Bild in window.__mgPerf, nur im
// Dev-Server und nur, wenn das Skript den Zähler angelegt hat. Kostet sonst nichts.

interface MgPerf {
  frames: number;
  total: number;
  max: number;
}

/** Misst, wie lange fn braucht, und zählt es in window.__mgPerf (falls vorhanden). */
export function measureFrame(fn: () => void): void {
  const perf = import.meta.env.DEV ? (window as unknown as { __mgPerf?: MgPerf }).__mgPerf : undefined;
  if (!perf) {
    fn();
    return;
  }
  const start = performance.now();
  fn();
  const ms = performance.now() - start;
  perf.frames += 1;
  perf.total += ms;
  perf.max = Math.max(perf.max, ms);
}
