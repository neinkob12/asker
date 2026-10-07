import { describe, expect, it } from 'vitest';
import { inflate, placeBox, sameRect } from './placement';

const viewport = { width: 1440, height: 900 };
const box = { width: 360, height: 160 };

describe('placeBox', () => {
  it('ohne Anker steht die Box mittig', () => {
    const pos = placeBox(null, viewport, box);
    expect(pos.side).toBe('center');
    expect(pos.arrow).toBeNull();
    expect(pos.left).toBe((1440 - 360) / 2);
    expect(pos.top).toBe((900 - 160) / 2);
  });

  it('automatisch zuerst unter den Anker, der Keil zeigt auf seine Mitte', () => {
    const anchor = { left: 20, top: 20, width: 200, height: 60 };
    const pos = placeBox(anchor, viewport, box, 'auto', { gap: 14, margin: 12 });
    expect(pos.side).toBe('bottom');
    expect(pos.top).toBe(20 + 60 + 14);
    // Mitte des Ankers bei x = 120, die Box darf nicht aus dem Fenster: linker Rand 12.
    expect(pos.left).toBe(12);
    expect(pos.arrow).toEqual({ x: 120 - 12, y: 0 });
  });

  it('unten kein Platz: über den Anker', () => {
    const anchor = { left: 600, top: 800, width: 200, height: 60 };
    const pos = placeBox(anchor, viewport, box);
    expect(pos.side).toBe('top');
    expect(pos.top).toBe(800 - 14 - 160);
    expect(pos.arrow?.y).toBe(box.height);
  });

  it('weder oben noch unten Platz: daneben, erst rechts, dann links', () => {
    const tall = { width: 400, height: 500 };
    const left = placeBox({ left: 100, top: 200, width: 200, height: 500 }, viewport, tall);
    expect(left.side).toBe('right');
    expect(left.left).toBe(100 + 200 + 14);
    expect(left.arrow?.x).toBe(0);
    const right = placeBox({ left: 1200, top: 200, width: 200, height: 500 }, viewport, tall);
    expect(right.side).toBe('left');
    expect(right.left).toBe(1200 - 14 - 400);
    expect(right.arrow?.x).toBe(400);
  });

  it('gewünschte Seite ohne Platz: die mit dem meisten Platz, sonst mittig', () => {
    const anchor = { left: 20, top: 20, width: 200, height: 60 };
    const pos = placeBox(anchor, viewport, box, 'top');
    expect(pos.side).toBe('bottom');
    // Ein winziges Fenster: nirgends passt die Box, also mittig und innerhalb des Randes.
    const tiny = placeBox({ left: 100, top: 100, width: 100, height: 100 }, { width: 300, height: 300 }, box);
    expect(tiny.side).toBe('center');
    expect(tiny.left).toBe(12);
  });

  it('bleibt im Fenster und der Keil bleibt von den Ecken weg', () => {
    const anchor = { left: 1400, top: 20, width: 30, height: 30 };
    const pos = placeBox(anchor, viewport, box);
    expect(pos.left + box.width).toBeLessThanOrEqual(viewport.width - 12);
    expect(pos.arrow?.x).toBe(box.width - 22);
  });

  it('inflate und sameRect', () => {
    expect(inflate({ left: 10, top: 10, width: 20, height: 20 }, 6)).toEqual({
      left: 4,
      top: 4,
      width: 32,
      height: 32,
    });
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect({ left: 1, top: 1, width: 1, height: 1 }, null)).toBe(false);
    expect(sameRect({ left: 1, top: 1, width: 1, height: 1 }, { left: 1, top: 1, width: 1, height: 1 })).toBe(true);
  });
});
