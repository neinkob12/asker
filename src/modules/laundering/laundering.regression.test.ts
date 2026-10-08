// Regressionstests zu Befunden aus dem Bugreview (Geldwäsche).

import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { canUnlockChannel, isChannelUnlocked } from './index';

describe('Jansens Reederei nur mit dem Verkauf, nicht über den Befehl', () => {
  it('vor dem Verkauf: Befehl abgelehnt, nichts freigeschaltet, nichts gebucht', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const wallet = { ...sim.state.wallet };
    expect(canUnlockChannel(sim.state, 'shipping').ok).toBe(false);
    const result = sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'shipping', pay: 'clean' } });
    expect(result.ok).toBe(false);
    expect(isChannelUnlocked(sim.state, 'shipping')).toBe(false);
    expect(sim.state.wallet).toEqual(wallet);
    expect(eventsOfType(events, 'laundering.unlocked')).toHaveLength(0);
    // Ohne Weg wäscht der Befehl weiter über den Kiosk.
    expect(sim.dispatch({ type: 'laundering.launder', payload: { amount: 1000 } }).ok).toBe(true);
    expect(sim.state.modules.laundering.batches.map((b) => b.channel)).toEqual(['kiosk']);
  });

  it('mit dem Verkauf kommt sie wie gehabt', () => {
    const sim = createTestGame();
    // Nur das Ereignis (der Verkauf selbst ist Sache von city): Die Geldwäsche hängt die Reederei an.
    sim.ctx('city').emit('business.sold', { price: 0, rotterdamPrice: 0, dailyProfit: 0, cities: ['koeln'] });
    sim.step();
    expect(isChannelUnlocked(sim.state, 'shipping')).toBe(true);
    expect(canUnlockChannel(sim.state, 'shipping')).toEqual({ ok: false, reason: 'Schon freigeschaltet.' });
  });
});
