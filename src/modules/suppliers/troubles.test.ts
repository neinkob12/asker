import { describe, expect, it } from 'vitest';
import { messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock } from '../goods';
import type { Shipment } from './index';
import { shipmentReason, shipmentsInTransit } from './index';

/** Bestellung bei Toni (Frankfurt, Autobahn) mit erzwungenem Problem; gibt die Lieferung zurück. */
function troubled(seed: number, problem: 'delayed' | 'seized'): { sim: Simulation; s: Shipment } {
  const sim = createTestGame({ seed });
  wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
  const r = sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } });
  if (!r.ok) throw new Error(r.reason);
  const s = shipmentsInTransit(sim.state).at(-1) as Shipment;
  delete s.luck;
  if (s.delayMinutes) s.arrivesAt -= s.delayMinutes;
  s.problem = problem;
  s.problemAt = sim.state.time + 30;
  s.problemRevealed = false;
  s.delayMinutes = problem === 'delayed' ? 120 : undefined;
  if (problem === 'delayed') s.arrivesAt += 120;
  return { sim, s };
}

/** Seeds durchprobieren, bis das Problem mit Rückfrage kommt. */
function withDecision(problem: 'delayed' | 'seized'): { sim: Simulation; s: Shipment } {
  for (let seed = 1; seed < 40; seed++) {
    const t = troubled(seed, problem);
    t.sim.advance(31);
    if (t.s.decision) return t;
  }
  throw new Error('keine Rückfrage');
}

function resolve(sim: Simulation, s: Shipment, choice: string) {
  return sim.dispatch({
    type: 'suppliers.resolveProblem',
    payload: { shipmentId: s.id, choice: choice as 'wait' },
  });
}

describe('Lieferprobleme mit Entscheidungen (Auftrag 23)', () => {
  it('Verspätung nennt einen Grund in der Stimme des Lieferanten', () => {
    const { sim, s } = troubled(1, 'delayed');
    sim.advance(31);
    expect(shipmentReason(sim.state, s)).toBeTruthy();
    const text = messages.thread(sim.state, 'supplier:frankfurt').at(-1)?.text ?? '';
    expect(text).not.toMatch(/\{\w+\}/);
  });

  it('Umweg kostet Aufpreis und verkürzt die Verspätung', () => {
    const { sim, s } = withDecision('delayed');
    expect(s.decision?.choices).toContain('detour');
    const before = s.arrivesAt;
    const money = sim.state.wallet.dirty;
    expect(resolve(sim, s, 'detour').ok).toBe(true);
    expect(s.arrivesAt).toBeLessThan(before);
    expect(sim.state.wallet.dirty).toBeLessThan(money);
    expect(s.choice).toBe('detour');
    // Die Optionen im Chat sind weg.
    const open = messages
      .thread(sim.state, 'supplier:frankfurt')
      .filter((m) => m.options?.some((o) => o.command?.type === 'suppliers.resolveProblem'));
    expect(open.some((m) => messages.canAnswer(sim.state, m))).toBe(false);
  });

  it('Teillieferung: ein Teil kommt pünktlich, der Rest später', () => {
    for (let seed = 1; seed < 60; seed++) {
      const { sim, s } = troubled(seed, 'delayed');
      sim.advance(31);
      if (!s.decision?.choices.includes('partial')) continue;
      const total = s.amount;
      const stock = getStock(sim.state);
      expect(resolve(sim, s, 'partial').ok).toBe(true);
      const parts = shipmentsInTransit(sim.state);
      expect(parts).toHaveLength(2);
      expect(parts[0].amount + parts[1].amount).toBe(total);
      sim.advance(parts[0].arrivesAt - sim.state.time);
      expect(getStock(sim.state)).toBeGreaterThan(stock);
      expect(shipmentsInTransit(sim.state)).toHaveLength(1);
      return;
    }
    throw new Error('keine Teillieferung angeboten');
  });

  it('ohne Antwort wird abgewartet', () => {
    const { sim, s } = withDecision('delayed');
    const arrival = s.arrivesAt;
    sim.advance(s.decision ? s.decision.until - sim.state.time + 1 : 1);
    expect(s.decision).toBeUndefined();
    expect(s.choice).toBe('wait');
    expect(s.arrivesAt).toBe(arrival);
  });

  it('drohende Beschlagnahme: schmieren rettet manchmal, aufgeben verliert die Ware', () => {
    let saved = 0;
    let lost = 0;
    for (let seed = 1; seed < 40 && (saved === 0 || lost === 0); seed++) {
      const { sim, s } = troubled(seed, 'seized');
      sim.advance(31);
      if (!s.decision) continue;
      expect(resolve(sim, s, 'bribe').ok).toBe(true);
      if (shipmentsInTransit(sim.state).some((x) => x.id === s.id)) saved++;
      else lost++;
    }
    expect(saved).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);

    const { sim, s } = withDecision('seized');
    const events = recordEvents(sim);
    sim.advance(s.decision ? s.decision.until - sim.state.time + 1 : 1);
    expect(shipmentsInTransit(sim.state).some((x) => x.id === s.id)).toBe(false);
    expect(eventsOfType(events, 'shipment.problem')[0]?.payload.kind).toBe('seized');
  });

  it('Chancen: Ware obendrauf kommt bei der Ankunft dazu', () => {
    const sim = createTestGame({ seed: 2 });
    sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed50' } });
    const s = shipmentsInTransit(sim.state).at(-1) as Shipment;
    delete s.problem;
    s.luck = 'bonus';
    const events = recordEvents(sim);
    const stock = getStock(sim.state);
    sim.advance(s.arrivesAt - sim.state.time);
    expect(getStock(sim.state) - stock).toBeGreaterThan(50);
    expect(eventsOfType(events, 'shipment.luck')).toHaveLength(1);
  });
});
