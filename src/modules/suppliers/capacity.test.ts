// Auftrag 33: Kurier-Lieferungen brauchen Platz im Lager.
import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getStock, store, warehouseFree } from '../goods';

describe('suppliers: Platz im Lager (Auftrag 33)', () => {
  it('ein volles Lager nimmt keine Bestellung an; ohne Angabe geht sie ins nächste Lager mit Platz', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 10_000;
    sim.state.wallet.clean = 10_000;
    store(sim.ctx('test'), { productId: 'weed', amount: warehouseFree(sim.state, 'ehrenfeld') - 10 });
    const order = (warehouseId?: string) =>
      sim.dispatch({
        type: 'suppliers.order',
        payload: { supplierId: 'frankfurt', packageId: 'weed25', ...(warehouseId ? { warehouseId } : {}) },
      });
    expect(order('ehrenfeld').ok).toBe(false);
    expect(order().ok).toBe(false);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } }).ok).toBe(true);
    expect(order().ok).toBe(true);
    expect(sim.state.modules.suppliers.shipments[0].warehouseId).toBe('nippes');
  });

  it('passt die Lieferung bei der Ankunft nicht mehr, geht der Rest in ein anderes Lager der Stadt', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 10_000;
    sim.state.wallet.clean = 10_000;
    sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'nippes' } });
    expect(
      sim.dispatch({
        type: 'suppliers.order',
        payload: { supplierId: 'frankfurt', packageId: 'weed50', warehouseId: 'ehrenfeld' },
      }).ok,
    ).toBe(true);
    const shipment = sim.state.modules.suppliers.shipments[0];
    shipment.problem = undefined;
    store(sim.ctx('test'), { productId: 'hash', amount: warehouseFree(sim.state, 'ehrenfeld') - 20 });
    sim.advance(shipment.arrivesAt - sim.state.time + 1);
    expect(warehouseFree(sim.state, 'ehrenfeld')).toBe(0);
    expect(getStock(sim.state, { productId: 'weed', warehouseId: 'nippes' })).toBe(30);
    // Die Meldung nennt die echte Verteilung auf die Lager.
    expect(
      sim.state.journal.some((j) => j.text.includes('verteilt: 20 g im Lager Ehrenfeld, 30 g im Garage Nippes')),
    ).toBe(true);
  });
});
