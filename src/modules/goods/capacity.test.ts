import { describe, expect, it } from 'vitest';
import { loadSimulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { WAREHOUSE_UPGRADES } from './config';
import {
  getStock,
  storageStats,
  store,
  storeFitting,
  upgradeCost,
  warehouseCapacity,
  warehouseFree,
  warehouseLoad,
  warehouseModifiers,
  warehouseSite,
  warehouseSites,
} from './index';

describe('goods: Kapazität und Ausbau (Auftrag 33)', () => {
  it('jedes Lager hat Platz in Gramm: Keller und Garagen klein, Hallen groß', () => {
    for (const site of warehouseSites()) expect(site.capacity, site.id).toBeGreaterThan(0);
    const kalk = warehouseSite('kalk')?.capacity ?? 0;
    expect(kalk).toBeGreaterThan(warehouseSite('nippes')?.capacity ?? 0);
    expect(kalk).toBeGreaterThan(warehouseSite('suelz')?.capacity ?? 0);
    const sim = createTestGame();
    // Startbestand 40 g Gras, Vapes wiegen 20 g pro Stück.
    expect(warehouseLoad(sim.state, 'ehrenfeld')).toBe(40);
    store(sim.ctx('test'), { productId: 'vape', amount: 10 });
    expect(warehouseLoad(sim.state, 'ehrenfeld')).toBe(240);
    expect(warehouseFree(sim.state, 'ehrenfeld')).toBe(warehouseCapacity(sim.state, 'ehrenfeld') - 240);
  });

  it('storeFitting nimmt nur, was passt, und meldet den Rest', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const free = warehouseFree(sim.state, 'ehrenfeld');
    const result = storeFitting(sim.ctx('test'), { productId: 'weed', amount: free + 100, warehouseId: 'ehrenfeld' });
    expect(result).toMatchObject({ stored: free, rest: 100 });
    expect(warehouseFree(sim.state, 'ehrenfeld')).toBe(0);
    sim.step();
    expect(eventsOfType(events, 'goods.storeRejected')[0].payload).toMatchObject({ rest: 100 });
    // Volles Lager: nichts geht mehr rein, Vapes passen erst recht nicht.
    expect(storeFitting(sim.ctx('test'), { productId: 'vape', amount: 3 })).toMatchObject({ stored: 0, rest: 3 });
    expect(storageStats(sim.state)).toEqual({ offered: free + 100 + 60, rejected: 160 });
    // store ohne Prüfung (Beute) darf überfüllen.
    store(sim.ctx('test'), { productId: 'weed', amount: 5 });
    expect(warehouseFree(sim.state, 'ehrenfeld')).toBe(0);
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBe(40 + free + 5);
  });

  it('Regale, Tresor und Tarnung kosten sauberes Geld und wirken über warehouseModifiers', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const upgrade = (kind: 'shelves' | 'vault' | 'cover') =>
      sim.dispatch({ type: 'goods.upgradeWarehouse', payload: { warehouseId: 'ehrenfeld', kind } });
    const base = warehouseCapacity(sim.state, 'ehrenfeld');
    expect(warehouseModifiers(sim.state, 'ehrenfeld')).toMatchObject({ lossFactor: 1, raidFactor: 1 });
    sim.state.wallet.clean = 0;
    expect(upgrade('shelves').ok).toBe(false);
    sim.state.wallet.clean = 100_000;
    for (const level of WAREHOUSE_UPGRADES.shelves.levels) {
      expect(upgrade('shelves').ok).toBe(true);
      expect(warehouseCapacity(sim.state, 'ehrenfeld')).toBe(Math.round(base * level.value));
    }
    expect(upgradeCost(sim.state, 'ehrenfeld', 'shelves')).toBeNull();
    expect(upgrade('shelves').ok).toBe(false);
    expect(upgrade('vault').ok).toBe(true);
    expect(upgrade('cover').ok).toBe(true);
    expect(warehouseModifiers(sim.state, 'ehrenfeld')).toMatchObject({
      lossFactor: WAREHOUSE_UPGRADES.vault.levels[0].value,
      raidFactor: WAREHOUSE_UPGRADES.cover.levels[0].value,
      levels: { shelves: 3, vault: 1, cover: 1 },
    });
    sim.step();
    expect(eventsOfType(events, 'goods.warehouseUpgraded')).toHaveLength(5);
    // Fremde Lager baut man nicht aus.
    expect(sim.dispatch({ type: 'goods.upgradeWarehouse', payload: { warehouseId: 'kalk', kind: 'vault' } }).ok).toBe(
      false,
    );
  });

  it('Ausbau in Hamburg kostet mehr (Immobilien-Faktor der Stadt)', () => {
    const sim = createTestGame();
    sim.state.modules.goods.owned.push('garage-barmbek');
    expect(upgradeCost(sim.state, 'garage-barmbek', 'shelves')).toBeGreaterThan(
      upgradeCost(sim.state, 'ehrenfeld', 'shelves') ?? 0,
    );
  });

  it('migriert Version 3: keine Ausbauten, nichts geht verloren, auch wenn das Lager übervoll ist', () => {
    const sim = createTestGame();
    const raw = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    raw.modules.goods = {
      owned: ['ehrenfeld'],
      stock: { ehrenfeld: [{ id: 1, productId: 'weed', amount: 50_000, quality: 0.6, cut: 0, unitCost: 3 }] },
    };
    raw.moduleVersions.goods = 3;
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.goods.upgrades).toEqual({});
    expect(getStock(loaded.state)).toBe(50_000);
    expect(warehouseFree(loaded.state, 'ehrenfeld')).toBe(0);
  });
});
