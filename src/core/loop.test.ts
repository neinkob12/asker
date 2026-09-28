import { describe, expect, it } from 'vitest';
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
});
