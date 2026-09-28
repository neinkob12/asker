/// <reference types="node" />
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverModules } from './discover';
import { createTestGame } from './testing';

const modulesDir = fileURLToPath(new URL('../modules/', import.meta.url));

describe('Modul-Registry', () => {
  it('findet jeden Modulordner automatisch, ohne zentrale Liste (außer _-Ordnern)', () => {
    const folders = readdirSync(modulesDir)
      .filter((name) => !name.startsWith('_') && statSync(modulesDir + name).isDirectory())
      .sort();
    expect(discoverModules().map((m) => m.id)).toEqual(folders);
  });

  it('enthält die Module aus dem Bauplan', () => {
    const ids = discoverModules().map((m) => m.id);
    for (const id of [
      'veedel',
      'territory',
      'police',
      'gangs',
      'encounters',
      'goods',
      'market',
      'suppliers',
      'customers',
      'spots',
      'reputation',
      'laundering',
      'staff',
      'hierarchy',
      'recruiting',
      'weather',
    ]) {
      expect(ids).toContain(id);
    }
  });

  it('das ganze Spiel läuft drei Tage lang deterministisch', () => {
    const play = () => {
      const sim = createTestGame({ seed: 99 });
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'zuelpicher' } });
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } });
      sim.advance(3 * 24 * 60);
      return sim;
    };
    const a = play();
    expect(a.isOver).toBe(false);
    expect(a.state.modules.customers.stats.customersServed).toBeGreaterThan(0);
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(play().state));
  });
});
