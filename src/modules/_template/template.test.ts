// Tests liegen neben dem Code im Modulordner. createTestGame() startet ein Spiel mit allen Modulen;
// die Vorlage selbst ist nicht registriert und wird hier deshalb ausdrücklich dazugenommen.

import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { TEMPLATE_PRICE } from './config';
import template, { getCounter } from './index';

// In einem echten Modul reicht: const sim = createTestGame();
const withTemplate = () => createTestGame({ extraModules: [template] });

describe('Modul-Vorlage', () => {
  it('legt den Anfangszustand an', () => {
    const sim = withTemplate();
    expect(getCounter(sim.state)).toBe(0);
  });

  it('verarbeitet den eigenen Befehl und meldet ein Ereignis', () => {
    const sim = withTemplate();
    const events = recordEvents(sim);
    const money = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'template.increment', payload: { by: 2 } })).toEqual({ ok: true });
    expect(getCounter(sim.state)).toBe(2);
    expect(sim.state.wallet.dirty).toBe(money - 2 * TEMPLATE_PRICE);
    expect(eventsOfType(events, 'template.incremented')[0].payload).toEqual({ counter: 2 });
    expect(sim.dispatch({ type: 'template.increment', payload: { by: 0 } }).ok).toBe(false);
  });

  it('reagiert auf Ereignisse anderer Module', () => {
    const sim = withTemplate();
    sim.advance(3 * 60);
    const customer = sim.state.modules.customers.waiting[0];
    expect(customer).toBeDefined();
    sim.dispatch({ type: 'customers.serve', payload: { customerId: customer.id } });
    expect(sim.state.modules.template.salesSeen).toBe(1);
  });
});
