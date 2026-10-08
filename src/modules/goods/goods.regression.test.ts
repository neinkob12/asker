// Regressionstests zu Befunden aus dem Bugreview (Buchung des Lagerkaufs).

import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeCity } from '../city';
import { warehouseSites } from './index';

describe('Lagerkauf bucht in die Stadt des Standorts', () => {
  it('Kauf eines Hamburger Lagers, während Köln aktiv ist, landet in der Kasse von Hamburg', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
    expect(activeCity(sim.state)).toBe('koeln');
    const site = warehouseSites('hamburg').find((w) => w.cost > 0);
    if (!site) throw new Error('kein Lager zu kaufen in Hamburg');
    sim.state.wallet.clean = site.cost + 1000;
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }).ok).toBe(true);
    const paid = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.reason === `Kauf ${site.name}`);
    expect(paid).toHaveLength(1);
    expect(paid[0].payload.category).toBe('expansion');
    expect(paid[0].payload.cityId).toBe('hamburg');
  });
});
