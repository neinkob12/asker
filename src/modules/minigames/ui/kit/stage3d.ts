// 3D-Bühne eines Minispiels (Auftrag 47): ein WebGLRenderer von three.js auf einem <canvas>, Größe über einen
// ResizeObserver (nicht pro Bild gemessen), Pixelverhältnis bis MAX_DPR, Aufräumen beim Unmount. Die Bildschleife
// liest nur stage.current und zeichnet mit renderer.render(scene, camera). Wie useStageCanvas, nur für 3D.

import type { RefObject } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { ACESFilmicToneMapping, PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer } from 'three';
import { MAX_DPR } from './useStageCanvas';

export interface Stage3d {
  renderer: WebGLRenderer;
  /** Größe in CSS-Pixeln. */
  width: number;
  height: number;
  dpr: number;
}

/**
 * Hängt einen Renderer an ein <canvas>. stage.current ist null, bis die erste Größe bekannt ist; onResize kommt nach
 * jeder Größenänderung (Kamera-Seitenverhältnis setzen). Ohne WebGL (sehr alte Geräte, Tests) bleibt stage null.
 */
export function useStage3d(ref: RefObject<HTMLCanvasElement>, onResize?: (stage: Stage3d) => void) {
  const stage = useRef<Stage3d | null>(null);
  const latest = useRef(onResize);
  latest.current = onResize;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const apply = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      stage.current = { renderer, width, height, dpr };
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
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [ref]);
  return stage;
}
