import { describe, expect, it } from 'vitest';
import { allVeedel, getVeedel, neighborsOf, veedelAt } from './index';

describe('veedel', () => {
  it('enthält die zentralen Kölner Veedel', () => {
    const ids = allVeedel().map((v) => v.id);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ['altstadt-nord', 'altstadt-sued', 'neustadt-nord', 'neustadt-sued', 'deutz', 'ehrenfeld']) {
      expect(ids).toContain(id);
    }
    for (const id of ['lindenthal', 'suelz', 'nippes', 'kalk', 'muelheim']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('veedelAt findet das nächste Veedel, außerhalb von Köln keins', () => {
    expect(veedelAt(6.9583, 50.9413)?.id).toBe('altstadt-nord'); // Dom
    expect(veedelAt(7.0, 50.937)?.id).toBe('kalk');
    expect(veedelAt(4.4, 51.9)).toBeNull(); // Rotterdam
  });

  it('Nachbarschaft ist gegenseitig und verweist nur auf bekannte Veedel', () => {
    for (const v of allVeedel()) {
      expect(neighborsOf(v.id).length, v.id).toBeGreaterThan(0);
      for (const n of neighborsOf(v.id)) {
        expect(getVeedel(n), `${v.id} → ${n}`).toBeDefined();
        expect(neighborsOf(n), `${n} → ${v.id}`).toContain(v.id);
      }
    }
  });
});
