import { describe, expect, it } from 'vitest';
import { loadSimulation } from './persistence';
import { Simulation } from './sim';
import { fillText, textMemorySize, texts } from './texts';

const VARIANTS = ['A {who}', 'B {who}', 'C {who}', 'D {who}', 'E {who}', 'F {who}'];

describe('Text-Helfer', () => {
  it('ersetzt Platzhalter und lässt unbekannte stehen', () => {
    expect(fillText('{boss} in {veedel}', { boss: 'Jupp', veedel: 'Nippes' })).toBe('Jupp in Nippes');
    expect(fillText('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('wiederholt dieselbe Variante nicht direkt', () => {
    const sim = Simulation.create([], { seed: 3 });
    const ctx = sim.ctx('test');
    let last = '';
    for (let i = 0; i < 300; i++) {
      const text = texts.pick(ctx, 'test:x', VARIANTS, { who: 'du' });
      expect(text).not.toBe(last);
      expect(text).not.toMatch(/\{\w+\}/);
      last = text;
    }
  });

  it('sperrt etwa die Hälfte der zuletzt benutzten Varianten', () => {
    expect(textMemorySize(1)).toBe(0);
    expect(textMemorySize(2)).toBe(1);
    expect(textMemorySize(5)).toBe(2);
    expect(textMemorySize(12)).toBe(3);
    const sim = Simulation.create([], { seed: 9 });
    const ctx = sim.ctx('test');
    const seen: string[] = [];
    for (let i = 0; i < 100; i++) seen.push(texts.pick(ctx, 'k', VARIANTS));
    for (let i = 3; i < seen.length; i++) expect(seen.slice(i - 3, i)).not.toContain(seen[i]);
  });

  it('merkt sich die Schlüssel getrennt und im Spielstand (deterministisch, auch nach dem Laden)', () => {
    const a = Simulation.create([], { seed: 5 });
    const b = Simulation.create([], { seed: 5 });
    const runA = [0, 1, 2].map(() => texts.pick(a.ctx('m'), 'gang:nord:warning', VARIANTS));
    const runB = [0, 1, 2].map(() => texts.pick(b.ctx('m'), 'gang:nord:warning', VARIANTS));
    expect(runA).toEqual(runB);
    expect(Object.keys(a.state.texts.recent)).toEqual(['gang:nord:warning']);
    const loaded = loadSimulation(JSON.parse(JSON.stringify(a.state)), []);
    const next = texts.pick(loaded.ctx('m'), 'gang:nord:warning', VARIANTS);
    expect(next).not.toBe(runA[2]);
  });

  it('pickItem wählt Einträge beliebiger Art', () => {
    const sim = Simulation.create([], { seed: 1 });
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const first = texts.pickItem(sim.ctx('m'), 'r', items);
    const second = texts.pickItem(sim.ctx('m'), 'r', items);
    expect(first).not.toBe(second);
    expect(texts.pick(sim.ctx('m'), 'leer', [])).toBe('');
  });
});
