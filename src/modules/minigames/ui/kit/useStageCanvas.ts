// Canvas eines Minispiels mit dem Pixelverhältnis des Geräts. Die Größe kommt über einen ResizeObserver (nicht pro
// Bild gemessen), die Bildschleife liest nur stage.current.

import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface Stage {
  ctx: CanvasRenderingContext2D;
  /** Größe in CSS-Pixeln (gezeichnet wird in diesen Einheiten, das Pixelverhältnis ist schon gesetzt). */
  width: number;
  height: number;
  dpr: number;
}

/** Höchstens so viel Pixelverhältnis (Handys mit 3× zeichnen sonst neunmal so viele Pixel). */
export const MAX_DPR = 2;

/**
 * Hängt sich an ein <canvas> (mit `touch-action: none` im CSS). stage.current ist null, bis die erste Größe bekannt
 * ist; danach nach jeder Größenänderung neu (Kontext mit setTransform auf das Pixelverhältnis).
 */
export function useStageCanvas(ref: RefObject<HTMLCanvasElement>, onResize?: (stage: Stage) => void) {
  const stage = useRef<Stage | null>(null);
  const latest = useRef(onResize);
  latest.current = onResize;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stage.current = { ctx, width, height, dpr };
      latest.current?.(stage.current);
    };
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) apply(box.width, box.height);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      stage.current = null;
    };
  }, [ref]);
  return stage;
}
