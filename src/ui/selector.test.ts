import { describe, expect, it } from 'vitest';
import { createSelection, shallowEqual } from './selector';

describe('shallowEqual', () => {
  it('vergleicht Zahlen, Objekte und Listen flach', () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual(1, 2)).toBe(false);
    expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [1, 3])).toBe(false);
    expect(shallowEqual([1], { 0: 1 })).toBe(false);
    expect(shallowEqual(null, {})).toBe(false);
    expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true);
  });
  it('geht nicht in verschachtelte Objekte', () => {
    expect(shallowEqual({ a: { n: 1 } }, { a: { n: 1 } })).toBe(false);
  });
});

describe('createSelection', () => {
  it('meldet eine Änderung erst, wenn der Auszug anders ist als beim letzten Zeichnen', () => {
    // Veränderbarer Zustand wie in der Simulation: dieselbe Referenz, neue Werte.
    const state = { time: 100, money: 5 };
    const sel = createSelection<number>();
    expect(sel.update(() => state.money)).toBe(5);
    state.time = 101;
    expect(sel.changed()).toBe(false);
    state.money = 7;
    expect(sel.changed()).toBe(true);
    // Nach dem Neuzeichnen gilt der neue Wert als Stand.
    expect(sel.update(() => state.money)).toBe(7);
    expect(sel.changed()).toBe(false);
  });
  it('nutzt den übergebenen Vergleich (frisch gebaute Auszüge)', () => {
    const state = { a: 1, b: 2 };
    const sel = createSelection<{ a: number; b: number }>();
    sel.update(() => ({ a: state.a, b: state.b }), shallowEqual);
    expect(sel.changed()).toBe(false);
    state.b = 3;
    expect(sel.changed()).toBe(true);
  });
  it('ein werfender Selektor gilt als Änderung, vor dem ersten Zeichnen nicht', () => {
    const sel = createSelection<number>();
    expect(sel.changed()).toBe(false);
    let ok = true;
    sel.update(() => {
      if (!ok) throw new Error('weg');
      return 1;
    });
    ok = false;
    expect(sel.changed()).toBe(true);
  });
});
