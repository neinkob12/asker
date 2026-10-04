// Marktbericht am Montag um 9 (Auftrag 32).

import { describe, expect, it } from 'vitest';
import { clock } from '../../core';
import { createTestGame } from '../../core/testing';
import { supplierContactId } from '../suppliers';
import { marketReport } from './index';

describe('market: Marktbericht', () => {
  it('kommt montags um 9 vom Lieferanten mit dem meisten Vertrauen, still', () => {
    const sim = createTestGame({ seed: 4 });
    // Tag 1 ist ein Freitag: Montag ist Tag 4.
    sim.state.modules.suppliers.relations.koeln.trust = 70;
    const monday9 = clock.at(4, 9);
    sim.advance(monday9 - sim.state.time - 1);
    const contact = supplierContactId('koeln');
    expect(sim.state.messages.list.some((m) => m.contactId === contact && m.text.startsWith('Marktbericht'))).toBe(
      false,
    );
    sim.advance(1);
    const report = sim.state.messages.list.filter((m) => m.text.startsWith('Marktbericht'));
    expect(report).toHaveLength(1);
    expect(report[0].contactId).toBe(contact);
    sim.advance(7 * 1440);
    expect(sim.state.messages.list.filter((m) => m.text.startsWith('Marktbericht'))).toHaveLength(2);
  });

  it('nennt, was steigt, was fällt und welche Aktion läuft', () => {
    const sim = createTestGame();
    expect(marketReport(sim.state)).toBe(
      'Der Markt ist ruhig, die Preise stehen normal. Aktionen gibt es gerade keine.',
    );
    sim.state.modules.market.index = { koeln: { weed: 1.08, hash: 0.94 } };
    sim.state.modules.suppliers.deals.push({
      id: 1,
      supplierId: 'frankfurt',
      packageId: 'weed50',
      cityId: 'koeln',
      discount: 0.15,
      startedAt: sim.state.time,
      endsAt: sim.state.time + 2000,
    });
    const text = marketReport(sim.state);
    expect(text).toContain('Gras zieht an (+8 %)');
    expect(text).toContain('Hasch gibt nach (−6 %)');
    expect(text).toContain('Aktion: 50 g Gras bei Toni 15 % billiger');
  });

  it('kennt in Hamburg die Pakete, wie der Lieferant dort auftritt', () => {
    const sim = createTestGame();
    sim.state.modules.suppliers.deals.push({
      id: 2,
      supplierId: 'amsterdam',
      packageId: 'hh-haze1kg',
      cityId: 'hamburg',
      discount: 0.2,
      startedAt: sim.state.time,
      endsAt: sim.state.time + 2000,
    });
    expect(marketReport(sim.state, 'hamburg')).toContain('Aktion: 1 kg Amnesia Haze bei Daan 20 % billiger');
  });
});
