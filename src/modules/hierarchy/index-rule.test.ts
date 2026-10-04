// Bestellregel mit Preisgrenze (Auftrag 32): Steht der Index der Ware zu hoch, wartet die Regel.

import { describe, expect, it } from 'vitest';
import { createTestGame } from '../../core/testing';
import { normalizeOrderRules, orderRuleLabel, planOrder } from './orders';
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

describe('Bestellregel mit Preisgrenze', () => {
  it('ohne Grenze bestellt sie wie vorher, mit Grenze nur bei Index darunter', () => {
    const sim = createTestGame({ seed: 1 });
    sim.state.modules.market.index = { koeln: { weed: 1.08 } };
    expect(planOrder(sim.state, rule, 'nippes', 100000).kind).toBe('order');
    const limited = { ...rule, maxIndex: 1 };
    const plan = planOrder(sim.state, limited, 'nippes', 100000);
    expect(plan.kind).toBe('pause');
    sim.state.modules.market.index = { koeln: { weed: 0.97 } };
    expect(planOrder(sim.state, limited, 'nippes', 100000).kind).toBe('order');
  });

  it('wird übernommen, geprüft und im Kurztext genannt', () => {
    const sim = createTestGame();
    const ok = normalizeOrderRules(sim.state, [{ ...rule, maxIndex: 0.95 }]);
    expect(ok.ok && ok.rules[0].maxIndex).toBe(0.95);
    const off = normalizeOrderRules(sim.state, [{ ...rule, maxIndex: null }]);
    expect(off.ok && 'maxIndex' in off.rules[0]).toBe(false);
    expect(normalizeOrderRules(sim.state, [{ ...rule, maxIndex: Number.NaN }]).ok).toBe(false);
    expect(orderRuleLabel(sim.state, { ...rule, maxIndex: 0.95 })).toContain('Index unter 0,95');
  });
});
