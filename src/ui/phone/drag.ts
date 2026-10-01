// Ziehen mit Pointer Events (Maus, Trackpad und Touch gleich): Eine Geste beginnt erst, wenn sich der Zeiger über
// die Schwelle in ihre Richtung bewegt; bis dahin bleibt alles ein normales Tippen oder Scrollen. Dann fängt das
// Element den Zeiger (Pointer-Capture, die Karte darunter zieht nicht mit), Text wird nicht markiert, und der Klick
// nach dem Loslassen wird verschluckt. Die Regeln (Schwelle, Geschwindigkeit) stehen in gestureModel.ts.

import { dragAxis, SLOP, VelocityTracker } from './gestureModel';

export interface DragUpdate {
  dx: number;
  dy: number;
  /** Geschwindigkeit in px/ms. */
  vx: number;
  vy: number;
}

export interface DragOptions {
  /** Achse der Geste: Bewegung in die andere Richtung bleibt Scrollen. 'any' nimmt jede Richtung. */
  axis: 'x' | 'y' | 'any';
  /** Zusatzbedingung, wenn die Geste übernehmen will (z.B. nur nach rechts). */
  accept?: (dx: number, dy: number) => boolean;
  /** Die Geste beginnt (Schwelle überschritten). false bricht ab. */
  onStart?: (update: DragUpdate) => boolean | undefined;
  onMove: (update: DragUpdate) => void;
  /** Loslassen (cancelled: der Browser oder das System hat abgebrochen). */
  onEnd: (update: DragUpdate, cancelled: boolean) => void;
  /** Schwelle in px (Standard SLOP). */
  slop?: number;
}

/** Läuft gerade eine Geste? (Dann reagiert z.B. die Rückmeldung beim Drücken nicht.) */
let dragging = 0;
export function isDragging(): boolean {
  return dragging > 0;
}

/** Verschluckt den nächsten Klick (nach einer Geste soll nichts ausgelöst werden). */
function swallowNextClick(): void {
  const stop = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', stop, { capture: true, once: true });
  // Kommt kein Klick (z.B. Zeiger außerhalb losgelassen), den Wächter wieder entfernen.
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0);
}

/** Beginnt das Beobachten eines Zeigers ab pointerdown auf `element`. */
export function startDrag(down: PointerEvent, element: HTMLElement, options: DragOptions): void {
  const id = down.pointerId;
  const x0 = down.clientX;
  const y0 = down.clientY;
  const tracker = new VelocityTracker();
  tracker.add(x0, y0, down.timeStamp);
  let active = false;

  const update = (e: PointerEvent): DragUpdate => {
    const { vx, vy } = tracker.velocity();
    return { dx: e.clientX - x0, dy: e.clientY - y0, vx, vy };
  };
  const cleanup = () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    if (active) {
      dragging = Math.max(0, dragging - 1);
      document.documentElement.classList.remove('is-dragging');
      try {
        element.releasePointerCapture(id);
      } catch {
        // schon freigegeben
      }
    }
  };
  const move = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    tracker.add(e.clientX, e.clientY, e.timeStamp);
    const dx = e.clientX - x0;
    const dy = e.clientY - y0;
    if (!active) {
      const axis = dragAxis(dx, dy, options.slop ?? SLOP);
      if (!axis) return;
      const fits = options.axis === 'any' || axis === options.axis;
      if (!fits || (options.accept && !options.accept(dx, dy))) {
        cleanup();
        return;
      }
      if (options.onStart?.(update(e)) === false) {
        cleanup();
        return;
      }
      active = true;
      dragging++;
      document.documentElement.classList.add('is-dragging');
      try {
        element.setPointerCapture(id);
      } catch {
        // Zeiger schon weg
      }
    }
    e.preventDefault();
    options.onMove(update(e));
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    tracker.add(e.clientX, e.clientY, e.timeStamp);
    const wasActive = active;
    const result = update(e);
    cleanup();
    if (wasActive) {
      swallowNextClick();
      options.onEnd(result, false);
    }
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    const wasActive = active;
    const result = update(e);
    cleanup();
    if (wasActive) options.onEnd(result, true);
  };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}
