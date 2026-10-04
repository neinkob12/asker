import { describe, expect, it, vi } from 'vitest';
import { GAME_MINUTES_PER_REAL_SECOND } from './config';
import { GameLoop } from './loop';

function loopWithCounter() {
  let steps = 0;
  const loop = new GameLoop({ step: (n) => (steps += n) });
  return { loop, steps: () => steps };
}

describe('GameLoop: fester Zeitschritt', () => {
  it('die Zahl der Schritte hängt nur von der echten Zeit ab, nicht von der Bildrate', () => {
    const smooth = loopWithCounter();
    for (let i = 0; i < 600; i++) smooth.loop.advanceReal(1 / 60); // 10 s bei 60 fps
    const choppy = loopWithCounter();
    const frames = [0.2, 0.013, 0.05, 0.1, 0.037];
    let t = 0;
    for (let i = 0; t < 10 - 1e-9; i++) {
      const dt = Math.min(frames[i % frames.length], 10 - t);
      choppy.loop.advanceReal(dt);
      t += dt;
    }
    expect(smooth.steps()).toBe(10 * GAME_MINUTES_PER_REAL_SECOND);
    expect(choppy.steps()).toBe(10 * GAME_MINUTES_PER_REAL_SECOND);
  });

  it('das Tempo ändert nur die Zahl der Schritte pro Sekunde', () => {
    for (const speed of [1, 2, 4]) {
      const { loop, steps } = loopWithCounter();
      loop.setSpeed(speed);
      for (let i = 0; i < 300; i++) loop.advanceReal(1 / 30);
      expect(steps()).toBe(10 * GAME_MINUTES_PER_REAL_SECOND * speed);
    }
  });

  it('Pause lässt keine Zeit vergehen', () => {
    const { loop, steps } = loopWithCounter();
    loop.setSpeed(0);
    for (let i = 0; i < 100; i++) loop.advanceReal(0.1);
    expect(steps()).toBe(0);
  });

  it('lange Unterbrechungen (Tab im Hintergrund) laufen nicht nach', () => {
    const { loop, steps } = loopWithCounter();
    loop.advanceReal(3600);
    expect(steps()).toBeLessThanOrEqual(Math.ceil(0.25 * GAME_MINUTES_PER_REAL_SECOND));
  });

  it('läuft mit einem Zeitgeber wie requestAnimationFrame', () => {
    const callbacks: ((now: number) => void)[] = [];
    let steps = 0;
    let frames = 0;
    const loop = new GameLoop({
      step: (n) => (steps += n),
      frame: () => frames++,
      scheduler: { request: (cb) => callbacks.push(cb), cancel: () => undefined },
    });
    loop.start();
    for (let i = 0; i <= 60; i++) callbacks[i](i * (1000 / 60));
    loop.stop();
    expect(frames).toBe(61);
    expect(steps).toBe(GAME_MINUTES_PER_REAL_SECOND);
  });

  it('wirft ein Schritt, läuft das Bild trotzdem zu Ende (Anzeige, Autosave) und die nächsten Bilder kommen', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const callbacks: ((now: number) => void)[] = [];
    let frames = 0;
    const loop = new GameLoop({
      step: () => {
        throw new Error('Tick kaputt');
      },
      frame: () => frames++,
      scheduler: { request: (cb) => callbacks.push(cb), cancel: () => undefined },
    });
    loop.start();
    for (let i = 0; i <= 30; i++) expect(() => callbacks[i](i * (1000 / 60) * 10)).not.toThrow();
    expect(frames).toBe(31);
    expect(callbacks).toHaveLength(32);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('wirft die Oberfläche im frame, kommt das nächste Bild trotzdem (es ist vorher angefordert)', () => {
    const callbacks: ((now: number) => void)[] = [];
    let frames = 0;
    const loop = new GameLoop({
      step: () => undefined,
      frame: () => {
        if (frames++ === 0) throw new Error('UI kaputt');
      },
      scheduler: { request: (cb) => callbacks.push(cb), cancel: () => undefined },
    });
    loop.start();
    expect(() => callbacks[0](0)).toThrow('UI kaputt');
    callbacks[1](16);
    expect(frames).toBe(2);
  });

  it('Tempo: Infinity und NaN werden ignoriert, das alte Tempo bleibt', () => {
    const { loop, steps } = loopWithCounter();
    loop.setSpeed(2);
    loop.setSpeed(Number.POSITIVE_INFINITY);
    expect(loop.speed).toBe(2);
    loop.setSpeed(Number.NaN);
    expect(loop.speed).toBe(2);
    loop.setSpeed(-3);
    expect(loop.speed).toBe(0);
    loop.setSpeed(1);
    for (let i = 0; i < 100; i++) loop.advanceReal(0.1);
    expect(steps()).toBe(10 * GAME_MINUTES_PER_REAL_SECOND);
  });

  it('eine NaN-Bildzeit vergiftet den Übertrag nicht', () => {
    const { loop, steps } = loopWithCounter();
    loop.advanceReal(Number.NaN);
    loop.advanceReal(Number.POSITIVE_INFINITY);
    const before = steps();
    for (let i = 0; i < 100; i++) loop.advanceReal(0.1);
    expect(steps() - before).toBe(10 * GAME_MINUTES_PER_REAL_SECOND);
  });

  it('frame bekommt nie NaN als Bildzeit', () => {
    const callbacks: ((now: number) => void)[] = [];
    const seen: number[] = [];
    const loop = new GameLoop({
      step: () => undefined,
      frame: (dt) => seen.push(dt),
      scheduler: { request: (cb) => callbacks.push(cb), cancel: () => undefined },
    });
    loop.start();
    callbacks[0](0);
    callbacks[1](Number.NaN);
    callbacks[2](100);
    expect(seen.every((dt) => Number.isFinite(dt) && dt >= 0)).toBe(true);
  });
});
