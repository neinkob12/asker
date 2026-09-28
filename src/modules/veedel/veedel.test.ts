import { describe, expect, it } from 'vitest';
import {
  allVeedel,
  getBoundary,
  getVeedel,
  type LngLatTuple,
  neighborsOf,
  sharesBorder,
  veedelAt,
  veedelLinks,
  veedelName,
} from './index';

/** Unabhängiger Punkt-in-Polygon-Test, damit Überlappungen auffallen. */
function inside(lng: number, lat: number, ring: readonly LngLatTuple[]): boolean {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

describe('veedel', () => {
  it('enthält die zentralen Kölner Veedel mit Eigenschaften und Beschreibung', () => {
    const ids = allVeedel().map((v) => v.id);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ['altstadt-nord', 'altstadt-sued', 'neustadt-nord', 'neustadt-sued', 'deutz', 'ehrenfeld']) {
      expect(ids).toContain(id);
    }
    for (const id of ['lindenthal', 'suelz', 'nippes', 'kalk', 'muelheim', 'bayenthal']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const v of allVeedel()) {
      expect(v.purchasingPower, v.id).toBeGreaterThan(0);
      expect(v.policePresence, v.id).toBeGreaterThan(0);
      expect(v.density, v.id).toBeGreaterThan(0);
      expect(v.description.length, v.id).toBeGreaterThan(40);
      expect(v.startInfluence, v.id).toBeGreaterThan(50);
      expect(v.startInfluence, v.id).toBeLessThanOrEqual(100);
    }
    expect(veedelName('kalk')).toBe('Kalk');
    expect(veedelName('gibtsnicht')).toBe('gibtsnicht');
  });

  it('jedes Veedel hat eine Grenze, und sein Mittelpunkt liegt darin', () => {
    for (const v of allVeedel()) {
      expect(getBoundary(v.id).length, v.id).toBeGreaterThan(20);
      expect(veedelAt(v.center.lng, v.center.lat)?.id, v.id).toBe(v.id);
    }
    expect(getBoundary('gibtsnicht')).toEqual([]);
  });

  it('veedelAt prüft echte Grenzen: bekannte Orte landen im richtigen Veedel', () => {
    const places: [string, number, number, string][] = [
      ['Dom', 6.9583, 50.9413, 'altstadt-nord'],
      ['Hauptbahnhof', 6.9589, 50.943, 'altstadt-nord'],
      ['LANXESS arena', 6.983, 50.9384, 'deutz'],
      ['Kalk Post', 7.001, 50.9405, 'kalk'],
      ['Wiener Platz', 7.0075, 50.9625, 'muelheim'],
      ['Neptunplatz', 6.92, 50.947, 'ehrenfeld'],
      ['Stadtwald', 6.905, 50.928, 'lindenthal'],
      ['Berrenrather Straße', 6.915, 50.918, 'suelz'],
      ['Schillplatz', 6.953, 50.966, 'nippes'],
      ['Bayenthalgürtel', 6.97, 50.911, 'bayenthal'],
      ['Aachener Weiher', 6.9282, 50.9356, 'neustadt-sued'],
    ];
    for (const [name, lng, lat, id] of places) expect(veedelAt(lng, lat)?.id, name).toBe(id);
  });

  it('außerhalb der Veedel im Spiel gibt es kein Veedel', () => {
    expect(veedelAt(4.4, 51.9)).toBeNull(); // Rotterdam
    expect(veedelAt(6.973, 50.958)).toBeNull(); // Zoo in Riehl, nicht im Spiel
    expect(veedelAt(7.065, 50.882)).toBeNull(); // Porz
  });

  it('die Grenzen überlappen sich nicht', () => {
    const shapes = allVeedel().map((v) => getBoundary(v.id));
    for (let lng = 6.89; lng <= 7.04; lng += 0.0015) {
      for (let lat = 50.9; lat <= 50.98; lat += 0.001) {
        const hits = shapes.filter((ring) => inside(lng, lat, ring)).length;
        expect(hits, `${lng.toFixed(4)}, ${lat.toFixed(4)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('benachbarte Veedel teilen ihre Grenzpunkte (keine Lücken)', () => {
    for (const v of allVeedel()) {
      for (const n of neighborsOf(v.id)) {
        if (!sharesBorder(v.id, n)) continue;
        const own = new Set(getBoundary(v.id).map((p) => p.join(',')));
        const common = getBoundary(n).filter((p) => own.has(p.join(','))).length;
        expect(common, `${v.id} ↔ ${n}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('Nachbarschaft ist gegenseitig, verweist nur auf bekannte Veedel und verbindet ganz Köln', () => {
    for (const v of allVeedel()) {
      expect(neighborsOf(v.id).length, v.id).toBeGreaterThan(0);
      for (const n of neighborsOf(v.id)) {
        expect(getVeedel(n), `${v.id} → ${n}`).toBeDefined();
        expect(neighborsOf(n), `${n} → ${v.id}`).toContain(v.id);
        expect(sharesBorder(v.id, n)).toBe(sharesBorder(n, v.id));
      }
    }
    expect(sharesBorder('altstadt-nord', 'deutz')).toBe(true); // über den Rhein
    expect(sharesBorder('nippes', 'muelheim')).toBe(false);
    expect(neighborsOf('nippes')).toContain('muelheim'); // Mülheimer Brücke
    for (const link of veedelLinks()) expect(sharesBorder(link.a, link.b), link.via).toBe(false);

    const reached = new Set(['altstadt-nord']);
    const queue = ['altstadt-nord'];
    while (queue.length > 0) {
      for (const n of neighborsOf(queue.shift() ?? '')) {
        if (!reached.has(n)) {
          reached.add(n);
          queue.push(n);
        }
      }
    }
    expect(reached.size).toBe(allVeedel().length);
  });
});
