// Nachbestellen der Rechten Hand: günstigster Preis pro Einheit statt kleinstes Paket, und ein größerer Bestand mit Vollmacht.

import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { getSuppliers } from '../suppliers';
import { planOrder } from './orders';
import type { OrderRule } from './types';

const rule: OrderRule = {
  id: 'r1',
  productId: 'weed',
  supplierId: null,
  packageId: null,
  minStock: 100,
  warehouseId: null,
  paused: null,
};

describe('Bestellplan', () => {
  it('nimmt den besten Preis pro Gramm, nicht das kleinste Paket vom teuren Kurier', () => {
    const sim = createTestGame({ seed: 1 });
    sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
    const plan = planOrder(sim.state, rule, 'nippes', 100000, 1000);
    expect(plan.kind).toBe('order');
    if (plan.kind !== 'order') return;
    const smallest = Math.min(
      ...getSuppliers(sim.state, 'koeln').flatMap((x) =>
        x.packages.filter((p) => p.productId === 'weed').map((p) => p.amount),
      ),
    );
    expect(plan.pkg.amount).toBeGreaterThan(smallest);
  });
});
