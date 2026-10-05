// Schlafende Städte (Auftrag 43): Ware am Kai einer Stadt, in der du gerade nicht bist, holt ihr Statthalter selbst ins
// Lager; der Hafenmeister fragt dich nicht mit Frist.

import { describe, expect, it } from 'vitest';
import { messages } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStock, storageStats, storeFitting, warehouseFree } from '../goods';
import { getCargo, receiveCargo } from './index';

describe('Ware am Kai einer schlafenden Stadt (Auftrag 43)', () => {
  it('der Statthalter holt sie ins Lager, keine Frage an dich', () => {
    const sim = createTestGame({ seed: 3 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    const before = getStock(sim.state, { productId: 'weed', warehouseId: 'ehrenfeld' });
    const asked = () => sim.state.messages.list.filter((m) => m.options?.some((o) => o.id === 'driver')).length;
    const questions = asked();
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 500,
      quality: 0.6,
      unitCost: 2,
      cityId: 'koeln',
    });
    sim.step();
    expect(getCargo(sim.state, 'koeln')).toHaveLength(0);
    expect(getStock(sim.state, { productId: 'weed', warehouseId: 'ehrenfeld' })).toBe(before + 500);
    expect(asked()).toBe(questions);
    expect(messages.thread(sim.state, 'other:harbor').filter((m) => m.options).length).toBe(0);
  });

  it('ist das Lager voll, wartet die Ware am Kai, ohne jede Stunde als abgewiesen zu zählen', () => {
    const sim = createTestGame({ seed: 3 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    // Ehrenfeld bis unters Dach voll.
    storeFitting(sim.ctx('test'), {
      productId: 'weed',
      amount: warehouseFree(sim.state, 'ehrenfeld'),
      warehouseId: 'ehrenfeld',
    });
    expect(warehouseFree(sim.state, 'ehrenfeld')).toBe(0);
    receiveCargo(sim.ctx('suppliers'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 500,
      quality: 0.6,
      unitCost: 2,
      cityId: 'koeln',
    });
    sim.step();
    const rejected = storageStats(sim.state).rejected;
    sim.advance(6 * 60);
    expect(getCargo(sim.state, 'koeln')).toHaveLength(1);
    expect(storageStats(sim.state).rejected).toBe(rejected);
  });
});
