import { describe, expect, it } from 'vitest';
import { distanceMeters } from '../../core';
import { seaLanes, seaNodes, seaPorts, seaRoute, shipRoute } from './index';

describe('Seewege (Auftrag 41)', () => {
  it('führen von jedem Hafen der Produzenten in jeden Hafen der Hafen-Phase', () => {
    expect(seaPorts().sort()).toEqual(['antwerpen', 'hamburg', 'rotterdam']);
    for (const from of ['tanger', 'algeciras', 'durres']) {
      for (const port of seaPorts()) {
        const route = seaRoute(from, port);
        expect(route, `${from} -> ${port}`).not.toBeNull();
        expect(route?.nodes[0]).toBe(from);
        expect(route?.path.length).toBeGreaterThan(5);
      }
    }
  });

  it('haben echte Längen (Tanger – Rotterdam gut 2.500 km, durchs Mittelmeer doppelt so weit)', () => {
    const tanger = seaRoute('tanger', 'rotterdam')?.km ?? 0;
    const durres = seaRoute('durres', 'rotterdam')?.km ?? 0;
    expect(tanger).toBeGreaterThan(2300);
    expect(tanger).toBeLessThan(2900);
    expect(durres).toBeGreaterThan(4600);
    expect(durres).toBeLessThan(5600);
    // Hamburg liegt weiter weg als Rotterdam, Antwerpen etwa gleich.
    expect((seaRoute('tanger', 'hamburg')?.km ?? 0) - tanger).toBeGreaterThan(300);
    expect(Math.abs((seaRoute('tanger', 'antwerpen')?.km ?? 0) - tanger)).toBeLessThan(200);
  });

  it('gehen ohne Sprung vom Meer ins Fahrwasser und enden am Liegeplatz', () => {
    const nodes = new Map(seaNodes().map((n) => [n.id, n]));
    for (const lane of seaLanes()) {
      const a = nodes.get(lane.from);
      const b = nodes.get(lane.to);
      expect(a && distanceMeters(a, lane.path[0])).toBeLessThan(100);
      expect(b && distanceMeters(b, lane.path[lane.path.length - 1])).toBeLessThan(100);
    }
    for (const port of seaPorts()) {
      const path = seaRoute('algeciras', port)?.path ?? [];
      for (let i = 1; i < path.length; i++) {
        // Lange Geraden gibt es nur auf offener See; nirgends springt der Weg zurück.
        expect(distanceMeters(path[i - 1], path[i])).toBeLessThan(1_500_000);
      }
    }
    // Hamburg: derselbe Weg die Elbe hinauf wie für die Stadt Hamburg.
    const elbe = shipRoute('hamburg');
    const end = seaRoute('tanger', 'hamburg')?.path.at(-1);
    expect(end && distanceMeters(end, elbe[elbe.length - 1])).toBeLessThan(1);
  });

  it('kennt keinen Weg zu unbekannten Orten', () => {
    expect(seaRoute('tanger', 'koeln')).toBeNull();
    expect(seaRoute('atlantis', 'rotterdam')).toBeNull();
  });
});
