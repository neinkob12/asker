import { describe, expect, it } from 'vitest';
import { messages, START_DIRTY_MONEY } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import { ROTTERDAM_DELIVERY_TIME, SUPPLIERS } from './config';
import { cheapestPackagePrice, shipmentProgress, shipmentsInTransit } from './index';

const small = SUPPLIERS[0].packages[0];

describe('suppliers', () => {
  it('Bestellung in Rotterdam kommt nach der Lieferzeit im Lager an', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const stock = getStock(sim.state);
    expect(sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } }).ok).toBe(
      true,
    );
    expect(sim.state.wallet.dirty).toBe(START_DIRTY_MONEY - small.price);
    const [shipment] = shipmentsInTransit(sim.state);
    sim.advance(ROTTERDAM_DELIVERY_TIME / 2);
    expect(shipmentProgress(sim.state, shipment)).toBeCloseTo(0.5);
    sim.state.modules.goods.stock.ehrenfeld.weed = stock; // keine Verkäufe mitzählen
    sim.advance(ROTTERDAM_DELIVERY_TIME / 2 - 1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
    sim.advance(1);
    expect(shipmentsInTransit(sim.state)).toHaveLength(0);
    expect(getStock(sim.state)).toBe(stock + small.amount);
    expect(eventsOfType(events, 'shipment.arrived')[0].payload).toMatchObject({
      amount: 100,
      warehouseId: 'ehrenfeld',
    });
    expect(sim.state.journal.some((j) => j.text === 'Lieferung angekommen: 100 g im Lager Ehrenfeld.')).toBe(true);
  });

  it('ohne genug Geld keine Bestellung', () => {
    const sim = createTestGame();
    sim.state.wallet.dirty = 10;
    expect(sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } })).toEqual(
      {
        ok: false,
        reason: 'Nicht genug Geld.',
      },
    );
  });

  it('der Hafen schreibt zu Beginn eine Nachricht, über die man bestellen kann', () => {
    const sim = createTestGame();
    const [thread] = messages.threads(sim.state);
    expect(thread.contact.id).toBe('supplier:rotterdam');
    const result = sim.dispatch({ type: 'messages.answer', payload: { messageId: thread.last.id, optionId: 'order' } });
    expect(result.ok).toBe(true);
    expect(shipmentsInTransit(sim.state)).toHaveLength(1);
  });

  it('Pleite: kein Geld für eine Bestellung, keine Ware, keine Lieferung → Game Over', () => {
    const sim = createTestGame();
    sim.state.modules.goods.stock.ehrenfeld.weed = 0;
    sim.state.wallet.dirty = cheapestPackagePrice(sim.state) - 1;
    sim.step();
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
  });

  it('keine Pleite, solange eine Lieferung unterwegs ist', () => {
    const sim = createTestGame();
    sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'rotterdam', packageId: 'small' } });
    sim.state.modules.goods.stock.ehrenfeld.weed = 0;
    sim.state.wallet.dirty = 0;
    sim.advance(ROTTERDAM_DELIVERY_TIME - 1);
    expect(sim.isOver).toBe(false);
    sim.advance(1);
    expect(getStock(sim.state)).toBeGreaterThan(0);
    expect(sim.isOver).toBe(false);
  });
});
