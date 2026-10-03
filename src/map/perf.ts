// Messhilfe für die Karte, nur im Dev-Build und nur mit ?perf=1 in der Adresse: Zeit pro Layer-update, Arbeit pro
// Bild in den Animationen (Fahrzeuge, Verkehr, Figuren, Hotspots), setData-Aufrufe pro Quelle und Bilder pro Sekunde.
// Ein kleines Overlay oben links zeigt die Werte der letzten Sekunde neben den Budgets aus Auftrag 31; Skripte lesen
// dieselben Zahlen über window.__ktMapPerf (scripts/perf-browser.mjs). Im Build fällt alles weg (import.meta.env.DEV).
//
//   const t0 = mapPerf.begin();  …  mapPerf.end('frame', 'traffic', t0);   // Arbeit in einem Bild
//   mapPerf.end('layer', 'spots.markers', t0);                               // ein Layer-update

import type { Map as MapLibreMap } from 'maplibre-gl';

type Group = 'layer' | 'frame';

interface Entry {
  calls: number;
  ms: number;
  max: number;
}

interface Window1s {
  start: number;
  frames: number;
  maxInterval: number;
  frameMs: number;
  maxFrameMs: number;
  work: Record<string, number>;
  layers: Record<string, number>;
  setData: Record<string, number>;
}

export interface MapPerfStats {
  /** Sekunden seit reset(). */
  seconds: number;
  frames: number;
  fps: number;
  /** Längster Abstand zwischen zwei Bildern (ms). */
  maxInterval: number;
  /** Bilder, die länger als 50 ms auseinander lagen. */
  slowFrames: number;
  /** Summe der Bild-Arbeit (group 'frame') pro Bild im Mittel und im schlimmsten Bild (ms). */
  frameMs: number;
  maxFrameMs: number;
  work: Record<string, Entry>;
  layers: Record<string, Entry>;
  setData: Record<string, number>;
  /** Höchste Zahl an setData-Aufrufen einer Quelle in einer Sekunde. */
  setDataPeakPerSecond: Record<string, number>;
  longTasks: number;
  longTaskMax: number;
}

const enabled =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('perf');

const freshWindow = (now: number): Window1s => ({
  start: now,
  frames: 0,
  maxInterval: 0,
  frameMs: 0,
  maxFrameMs: 0,
  work: {},
  layers: {},
  setData: {},
});

let since = 0;
let frames = 0;
let maxInterval = 0;
let slowFrames = 0;
let frameMsSum = 0;
let maxFrameMs = 0;
let thisFrame = 0;
let lastFrame = 0;
let longTasks = 0;
let longTaskMax = 0;
let work: Record<string, Entry> = {};
let layers: Record<string, Entry> = {};
let setData: Record<string, number> = {};
let peak: Record<string, number> = {};
let current = freshWindow(0);
let shown = freshWindow(0);
let overlay: HTMLElement | null = null;

function add(table: Record<string, Entry>, name: string, ms: number): void {
  const entry = table[name] ?? { calls: 0, ms: 0, max: 0 };
  entry.calls++;
  entry.ms += ms;
  if (ms > entry.max) entry.max = ms;
  table[name] = entry;
}

function reset(): void {
  since = performance.now();
  frames = 0;
  maxInterval = 0;
  slowFrames = 0;
  frameMsSum = 0;
  maxFrameMs = 0;
  longTasks = 0;
  longTaskMax = 0;
  work = {};
  layers = {};
  setData = {};
  peak = {};
  current = freshWindow(since);
}

function stats(): MapPerfStats {
  const seconds = (performance.now() - since) / 1000;
  return {
    seconds,
    frames,
    fps: frames / Math.max(0.001, seconds),
    maxInterval,
    slowFrames,
    frameMs: frameMsSum / Math.max(1, frames),
    maxFrameMs,
    work,
    layers,
    setData,
    setDataPeakPerSecond: peak,
    longTasks,
    longTaskMax,
  };
}

/** Ein Bild ist vorbei: Arbeit dieses Bilds verbuchen, jede Sekunde ein neues Fenster fürs Overlay. */
function onFrame(now: number): void {
  if (lastFrame) {
    const interval = now - lastFrame;
    frames++;
    current.frames++;
    if (interval > maxInterval) maxInterval = interval;
    if (interval > current.maxInterval) current.maxInterval = interval;
    if (interval > 50) slowFrames++;
  }
  lastFrame = document.hidden ? 0 : now;
  frameMsSum += thisFrame;
  current.frameMs += thisFrame;
  if (thisFrame > maxFrameMs) maxFrameMs = thisFrame;
  if (thisFrame > current.maxFrameMs) current.maxFrameMs = thisFrame;
  thisFrame = 0;
  if (now - current.start >= 1000) {
    for (const [source, count] of Object.entries(current.setData)) {
      if (count > (peak[source] ?? 0)) peak[source] = count;
    }
    shown = current;
    current = freshWindow(now);
    renderOverlay();
  }
  requestAnimationFrame(onFrame);
}

const BUDGET = { frameDesktop: 2, frameMobile: 4, setData: 20 };

function renderOverlay(): void {
  if (!overlay) return;
  const secs = Math.max(0.001, (current.start - shown.start) / 1000);
  const fps = shown.frames / secs;
  const perFrame = shown.frameMs / Math.max(1, shown.frames);
  const mobile = window.innerWidth <= 760;
  const budget = mobile ? BUDGET.frameMobile : BUDGET.frameDesktop;
  const top = (table: Record<string, number>, n: number, unit: (v: number) => string) =>
    Object.entries(table)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([k, v]) => `  ${k.padEnd(22).slice(0, 22)} ${unit(v)}`);
  const lines = [
    `Karte  ${fps.toFixed(0)} fps (Ziel ${mobile ? 30 : 60})  längstes Bild ${shown.maxInterval.toFixed(0)} ms`,
    `Bild-Arbeit ${perFrame.toFixed(2)} ms/Bild, max ${shown.maxFrameMs.toFixed(1)} (Budget ${budget})`,
    ...top(shown.work, 4, (v) => `${(v / Math.max(1, shown.frames)).toFixed(2)} ms/Bild`),
    'Layer-update (ms/s)',
    ...top(shown.layers, 4, (v) => `${(v / secs).toFixed(1)}`),
    `setData pro s (Budget ${BUDGET.setData})`,
    ...top(shown.setData, 4, (v) => `${(v / secs).toFixed(0)}`),
    `Long Tasks ${longTasks}, max ${longTaskMax.toFixed(0)} ms`,
  ];
  overlay.textContent = lines.join('\n');
  overlay.classList.toggle(
    'is-over',
    perFrame > budget || Object.values(shown.setData).some((v) => v / secs > BUDGET.setData),
  );
}

/** setData und updateData aller GeoJSON-Quellen zählen (eine Quelle reicht, sie teilen sich den Prototyp). */
function countSources(map: MapLibreMap): boolean {
  let sample: unknown;
  try {
    sample = Object.keys(map.getStyle().sources)
      .map((id) => map.getSource(id))
      .find((s) => s?.type === 'geojson');
  } catch {
    return false;
  }
  if (!sample) return false;
  const proto = Object.getPrototypeOf(sample) as Record<string, unknown> & { __ktCounted?: boolean };
  if (proto.__ktCounted) return true;
  proto.__ktCounted = true;
  for (const method of ['setData', 'updateData']) {
    const original = proto[method] as ((...args: unknown[]) => unknown) | undefined;
    if (typeof original !== 'function') continue;
    proto[method] = function (this: { id: string }, ...args: unknown[]) {
      setData[this.id] = (setData[this.id] ?? 0) + 1;
      current.setData[this.id] = (current.setData[this.id] ?? 0) + 1;
      return original.apply(this, args);
    };
  }
  return true;
}

export const mapPerf = {
  enabled,
  /** Startzeit einer Messung (0, wenn die Messhilfe aus ist). */
  begin(): number {
    return enabled ? performance.now() : 0;
  },
  /** Messung beenden: 'layer' = ein Layer-update, 'frame' = Arbeit in einem Bild (Animationen). */
  end(group: Group, name: string, t0: number): void {
    if (!enabled) return;
    const ms = performance.now() - t0;
    if (group === 'layer') {
      add(layers, name, ms);
      current.layers[name] = (current.layers[name] ?? 0) + ms;
      return;
    }
    add(work, name, ms);
    current.work[name] = (current.work[name] ?? 0) + ms;
    thisFrame += ms;
  },
  /** Für GameMap: Overlay anlegen und setData zählen, sobald der Stil geladen ist. */
  attach(map: MapLibreMap): void {
    if (!enabled) return;
    const start = () => {
      if (countSources(map)) map.off('styledata', start);
    };
    map.on('styledata', start);
    if (overlay) return;
    overlay = document.createElement('pre');
    overlay.className = 'map-perf';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
    reset();
    if (typeof PerformanceObserver === 'function') {
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks++;
            if (entry.duration > longTaskMax) longTaskMax = entry.duration;
          }
        }).observe({ type: 'longtask' });
      } catch {
        // Long Tasks kennt nicht jeder Browser.
      }
    }
    requestAnimationFrame(onFrame);
    (window as unknown as { __ktMapPerf: unknown }).__ktMapPerf = { stats, reset };
  },
};
