import { describe, expect, it } from 'vitest';
import { SPRINGS, Spring, type SpringConfig, springEasing, springState } from './spring';

const FRAME = 1 / 60;

/** Lässt die Feder Bild für Bild laufen und sammelt die Werte. */
function run(spring: Spring, seconds: number, dt = FRAME): number[] {
  const values: number[] = [];
  for (let t = 0; t < seconds; t += dt) values.push(spring.step(dt));
  return values;
}

describe('Spring', () => {
  it.each(Object.entries(SPRINGS))('erreicht das Ziel und kommt zur Ruhe (%s)', (_name, config) => {
    const spring = new Spring(config, 0, 1);
    run(spring, 3);
    expect(spring.settled).toBe(true);
    expect(spring.value).toBe(1);
    expect(spring.velocity).toBe(0);
  });

  it('schießt bei Dämpfung 1 nicht über und läuft nur in eine Richtung', () => {
    const spring = new Spring({ response: 0.35, dampingFraction: 1 }, 0, 1);
    const values = run(spring, 2);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
  });

  it('schießt auch überdämpft nicht über', () => {
    const values = run(new Spring({ response: 0.3, dampingFraction: 1.4 }, 0, 1), 3);
    expect(Math.max(...values)).toBeLessThanOrEqual(1);
  });

  it('federt mit kleinerer Dämpfung etwas nach (Island)', () => {
    const values = run(new Spring(SPRINGS.island, 0, 1), 2);
    const peak = Math.max(...values);
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.1);
  });

  it('ist unterbrechbar: neues Ziel mitten in der Bewegung ohne Sprung', () => {
    const spring = new Spring(SPRINGS.push, 0, 1);
    run(spring, 0.12);
    const before = spring.value;
    const speed = spring.velocity;
    expect(before).toBeGreaterThan(0.2);
    expect(before).toBeLessThan(0.95);
    expect(speed).toBeGreaterThan(0);
    spring.setTarget(0);
    // Wert und Geschwindigkeit laufen stetig weiter
    expect(spring.value).toBe(before);
    expect(spring.velocity).toBe(speed);
    const next = spring.step(FRAME);
    expect(Math.abs(next - before)).toBeLessThan(speed * FRAME * 1.5);
    // Erst läuft der Schwung weiter, dann kehrt die Feder um und kommt bei 0 zur Ruhe
    expect(next).toBeGreaterThan(before);
    run(spring, 3);
    expect(spring.value).toBe(0);
  });

  it('übernimmt die Geschwindigkeit einer Geste', () => {
    // Seite bei 60 % losgelassen, schnell nach rechts: Pop mit Restgeschwindigkeit
    const flung = new Spring(SPRINGS.push, 0.6).setTarget(1, 4);
    const calm = new Spring(SPRINGS.push, 0.6).setTarget(1, 0);
    flung.step(0.05);
    calm.step(0.05);
    expect(flung.value).toBeGreaterThan(calm.value);
    // Am Ziel, aber mit Schwung: läuft erst weg und kommt zurück
    const pushed = new Spring(SPRINGS.snap, 0).setTarget(0, -3);
    pushed.step(0.03);
    expect(pushed.value).toBeLessThan(0);
    run(pushed, 2);
    expect(pushed.value).toBe(0);
  });

  it('rechnet unabhängig von der Bildrate', () => {
    const at = (dt: number) => {
      const spring = new Spring(SPRINGS.app, 0, 1);
      let t = 0;
      while (t < 0.2 - 1e-9) {
        spring.step(dt);
        t += dt;
      }
      return spring.value;
    };
    expect(at(1 / 60)).toBeCloseTo(at(1 / 120), 6);
    expect(at(1 / 60)).toBeCloseTo(at(0.05), 6);
  });

  it('längere response ist träger', () => {
    const fast = new Spring({ response: 0.3, dampingFraction: 0.9 }, 0, 1);
    const slow = new Spring({ response: 0.6, dampingFraction: 0.9 }, 0, 1);
    fast.step(0.15);
    slow.step(0.15);
    expect(fast.value).toBeGreaterThan(slow.value);
  });

  it('jump setzt sofort, ohne Bewegung', () => {
    const spring = new Spring(SPRINGS.push, 0, 1);
    spring.step(0.1);
    spring.jump(0.4);
    expect(spring.value).toBe(0.4);
    expect(spring.velocity).toBe(0);
    expect(spring.settled).toBe(true);
    expect(spring.step(0.1)).toBe(0.4);
  });
});

describe('springState', () => {
  const configs: SpringConfig[] = [
    { response: 0.4, dampingFraction: 0.5 },
    { response: 0.4, dampingFraction: 1 },
    { response: 0.4, dampingFraction: 2 },
  ];

  it.each(configs)('beginnt bei Auslenkung und Geschwindigkeit (%o)', (config) => {
    const s = springState(config, 0.7, -2, 0);
    expect(s.x).toBeCloseTo(0.7, 10);
    expect(s.v).toBeCloseTo(-2, 10);
  });

  it.each(configs)('Geschwindigkeit ist die Ableitung der Auslenkung (%o)', (config) => {
    const t = 0.13;
    const h = 1e-6;
    const a = springState(config, 1, 0.5, t - h).x;
    const b = springState(config, 1, 0.5, t + h).x;
    expect(springState(config, 1, 0.5, t).v).toBeCloseTo((b - a) / (2 * h), 4);
  });
});

describe('Spring bei Pixeln', () => {
  /** Zeit in Sekunden, bis die Feder als in Ruhe gilt. */
  function settleTime(spring: Spring): number {
    let t = 0;
    while (!spring.settled && t < 5) {
      spring.step(FRAME);
      t += FRAME;
    }
    return t;
  }

  it('mit der Genauigkeit für Pixel ist ein Blatt fertig, kurz nachdem man es nicht mehr sieht', () => {
    // Ein Blatt fährt über 800 px: Mit der Vorgabe für Werte von 0 bis 1 dauert die Ruhe über eine Sekunde.
    const strict = settleTime(new Spring(SPRINGS.sheet, 800, 0));
    const pixels = new Spring(SPRINGS.sheet, 800, 0);
    pixels.restDelta = 0.5;
    pixels.restSpeed = 5;
    const loose = settleTime(pixels);
    expect(strict).toBeGreaterThan(0.9);
    expect(loose).toBeLessThan(0.7);
    expect(loose).toBeLessThan(strict - 0.3);
  });

  it('kommt auch mit der groben Genauigkeit genau am Ziel an', () => {
    const spring = new Spring(SPRINGS.sheet, 800, 0);
    spring.restDelta = 0.5;
    spring.restSpeed = 5;
    settleTime(spring);
    expect(spring.value).toBe(0);
    expect(spring.velocity).toBe(0);
  });
});

describe('springEasing (Feder als CSS-Kurve)', () => {
  it('beginnt bei 0, endet bei 1 und dauert so lange wie die Feder braucht', () => {
    const { easing, durationMs } = springEasing(SPRINGS.app);
    const stops = easing
      .replace(/^linear\(|\)$/g, '')
      .split(', ')
      .map(Number);
    expect(stops[0]).toBe(0);
    expect(stops[stops.length - 1]).toBe(1);
    expect(durationMs).toBeGreaterThan(300);
    expect(durationMs).toBeLessThan(2000);
    // app federt hauchzart nach: kurz über 1
    expect(Math.max(...stops)).toBeGreaterThan(1);
    expect(Math.max(...stops)).toBeLessThan(1.05);
  });

  it('kritisch gedämpft schießt nicht über', () => {
    const stops = springEasing(SPRINGS.snap)
      .easing.replace(/^linear\(|\)$/g, '')
      .split(', ')
      .map(Number);
    expect(Math.max(...stops)).toBeLessThanOrEqual(1);
  });
});
