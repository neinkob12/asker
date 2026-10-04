// Auftrag 33: Der Bot nutzt Lager-Ausbau, Fahrzeuge und Nachtfahrten bei Bedarf.
import { describe, expect, it } from 'vitest';
import { clock } from '../core';
import { createTestGame } from '../core/testing';
import { getVehicles } from '../modules/fleet';
import { storeFitting, upgradeLevel, warehouseFree } from '../modules/goods';
import { getTrips, receiveCargo } from '../modules/logistics';
import { botTurn, newBotStats } from './bot';

describe('Bot: Lager, Fahrzeuge, Nachtfahrten (Auftrag 33)', () => {
  it('baut Regale ein, wenn ein volles Lager Ware abweist', () => {
    const sim = createTestGame({ seed: 1 });
    sim.state.wallet.clean = 20_000;
    storeFitting(sim.ctx('test'), { productId: 'weed', amount: warehouseFree(sim.state, 'ehrenfeld') + 600 });
    botTurn(sim, newBotStats());
    expect(upgradeLevel(sim.state, 'ehrenfeld', 'shelves')).toBe(1);
  });

  it('kauft einen Transporter, wenn mehr am Kai steht, als ins Privatauto passt, und holt nachts ab', () => {
    const sim = createTestGame({ seed: 2 });
    sim.state.wallet.clean = 30_000;
    sim.state.wallet.dirty = 5_000;
    sim.state.modules.logistics.berths.koeln = { since: 0, level: 0 };
    sim.dispatch({ type: 'staff.hireDriver', payload: {} });
    // Am Vormittag: Bis nach Mitternacht steht die Ware sicher (Kai ohne Ausbau: 16 Stunden).
    sim.state.time = sim.state.time - clock.minuteOfDay(sim.state.time) + 9 * 60;
    receiveCargo(sim.ctx('test'), {
      supplierId: 'rotterdam',
      productId: 'weed',
      amount: 6000,
      quality: 0.6,
      unitCost: 2,
    });
    botTurn(sim, newBotStats());
    const [trip] = getTrips(sim.state);
    expect(trip?.choice).toBe('night');
    expect(trip?.status).toBe('planned');
    expect(getVehicles(sim.state).map((v) => v.model)).toEqual(['van']);
  });
});
