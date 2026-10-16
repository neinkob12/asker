// Konvois auf der Karte (Feedback 16.10.2026): Viele Bestellungen fahren als ein Fahrzeug je Lieferant und Ziel, nur
// in der aktiven Stadt. Ohne DOM: geprüft wird, was die Karte aus dem Zustand ableitet.

import { describe, expect, it } from 'vitest';
import { wallet } from '../../../core';
import { createTestGame } from '../../../core/testing';
import { DEFAULT_WAREHOUSE } from '../../goods';
import { type Shipment, shipmentsInTransit } from '../index';
import { convoyLabel, convoyTitle, shipmentConvoys } from './convoys';

/** Lieferung von Hand, ohne Würfel (Ware, Ziel und Zeiten wie bestellt). */
function shipment(id: number, over: Partial<Shipment>): Shipment {
  return {
    id,
    supplierId: 'frankfurt',
    packageId: 'weed50',
    productId: 'weed',
    amount: 50,
    quality: 0.8,
    warehouseId: DEFAULT_WAREHOUSE,
    price: 200,
    orderedAt: 0,
    arrivesAt: 600,
    cityId: 'koeln',
    ...over,
  };
}

describe('Lieferungen als Konvois', () => {
  it('fasst alle Lieferungen eines Lieferanten an dasselbe Lager zu einem Fahrzeug zusammen', () => {
    const sim = createTestGame({ seed: 1 });
    const t = sim.state.time;
    sim.state.modules.suppliers.shipments.push(
      shipment(1, { orderedAt: t - 100, arrivesAt: t + 100 }),
      shipment(2, { orderedAt: t - 300, arrivesAt: t + 100 }),
      shipment(3, { orderedAt: t, arrivesAt: t + 400 }),
      shipment(4, { supplierId: 'berlin', orderedAt: t - 10, arrivesAt: t + 90 }),
      shipment(5, { warehouseId: 'nippes', orderedAt: t - 10, arrivesAt: t + 90 }),
    );
    const convoys = shipmentConvoys(sim.state, 'koeln');
    expect(convoys.map((c) => c.key)).toEqual([
      'berlin|koeln|ehrenfeld',
      'frankfurt|koeln|ehrenfeld',
      'frankfurt|koeln|nippes',
    ]);
    const frankfurt = convoys[1];
    // Vorneweg die am weitesten gefahrene (Nr. 2 ist zu drei Vierteln da), dahinter nach Fortschritt.
    expect(frankfurt.shipments.map((s) => s.id)).toEqual([2, 1, 3]);
    expect(frankfurt.lead.id).toBe(2);
    expect(frankfurt.progress).toBeCloseTo(0.75);
    expect(convoyLabel(frankfurt)).toBe('3 Lieferungen · 75 %');
    expect(convoyTitle(frankfurt)).toMatch(/^3 Lieferungen aus .+: 50 g .+, 50 g .+, 50 g .+$/);
    // Eine einzelne Lieferung bleibt beschriftet wie bisher.
    expect(convoyLabel(convoys[0])).toMatch(/^50 g .+ · 10 %$/);
  });

  it('zeigt nur die aktive Stadt, auch wenn in der anderen viel unterwegs ist', () => {
    const sim = createTestGame({ seed: 1 });
    const t = sim.state.time;
    for (let i = 0; i < 30; i++) {
      sim.state.modules.suppliers.shipments.push(
        shipment(100 + i, {
          cityId: 'hamburg',
          supplierId: 'hamburg',
          warehouseId: 'garage-barmbek',
          arrivesAt: t + i,
        }),
      );
    }
    sim.state.modules.suppliers.shipments.push(shipment(1, { arrivesAt: t + 50 }));
    expect(shipmentsInTransit(sim.state)).toHaveLength(31);
    expect(shipmentConvoys(sim.state, 'koeln').map((c) => c.shipments.length)).toEqual([1]);
    expect(shipmentConvoys(sim.state, 'hamburg').map((c) => c.shipments.length)).toEqual([30]);
  });

  it('viele Einzelbestellungen bei einem Lieferanten sind ein Konvoi', () => {
    const sim = createTestGame({ seed: 2 });
    wallet.earn(sim.ctx('test'), 100_000, 'dirty', 'Test');
    // Höchstens acht Pakete auf einmal: dreimal bestellt, jedes Paket eine eigene Lieferung.
    const lines = [{ packageId: 'weed50', count: 8 }];
    for (let i = 0; i < 3; i++) {
      const ordered = sim.dispatch({
        type: 'suppliers.orderBatch',
        payload: { supplierId: 'frankfurt', lines, mode: 'single' },
      });
      expect(ordered.ok).toBe(true);
    }
    expect(shipmentsInTransit(sim.state, 'koeln')).toHaveLength(24);
    const convoys = shipmentConvoys(sim.state, 'koeln');
    expect(convoys).toHaveLength(1);
    expect(convoys[0].shipments).toHaveLength(24);
  });

  it('meldet eine bekannte Verspätung am ganzen Konvoi', () => {
    const sim = createTestGame({ seed: 1 });
    const t = sim.state.time;
    sim.state.modules.suppliers.shipments.push(
      shipment(1, { arrivesAt: t + 100 }),
      shipment(2, { arrivesAt: t + 200, problem: 'delayed', problemRevealed: true, delayMinutes: 60, problemAt: t }),
    );
    expect(shipmentConvoys(sim.state, 'koeln')[0].late).toBe(true);
  });
});
