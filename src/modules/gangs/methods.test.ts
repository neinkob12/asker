import { describe, expect, it } from 'vitest';
import { clock, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { getStock, getWarehouses, store } from '../goods';
import { getHeat } from '../police';
import { getSpot } from '../spots';
import { getStaffMember, isEmployed } from '../staff';
import { statusOf } from './common';
import { GANGS, type Gang, type GangMethod } from './data';
import { type GangIncident, intimidationFactor, runMethod } from './methods';

function gang(id: string): Gang {
  const g = GANGS.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

function run(sim: Simulation, gangId: string, method: GangMethod): boolean {
  const ctx = sim.ctx('gangs');
  const s = statusOf(ctx, gangId);
  if (!s) throw new Error(gangId);
  return runMethod(ctx, gang(gangId), s, method);
}

function incidents(sim: Simulation): GangIncident[] {
  return sim.state.modules.gangs.incidents;
}

/** Bis zur nächsten vollen Stunde h vorspulen. */
function advanceToHour(sim: Simulation, h: number): void {
  while (clock.hour(sim.state.time) !== h || sim.state.time % 60 !== 0) sim.advance(60 - (sim.state.time % 60) || 60);
}

function hire(sim: Simulation, spotId: string, loyalty = 20): string {
  wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  const id = (result.data as { staffId: string }).staffId;
  const m = getStaffMember(sim.state, id);
  if (m) m.stats.loyalty = loyalty;
  return id;
}

/** Ware ins erste Kölner Lager legen (Läufer verkaufen bis zur Nacht oft alles). */
function stock(sim: Simulation, amount = 300): void {
  const w = getWarehouses(sim.state, 'koeln')[0];
  store(sim.ctx('test'), { productId: 'weed', amount, warehouseId: w.id, quality: 0.6, unitCost: 3 });
}

function respond(sim: Simulation, incident: GangIncident, choice: string) {
  return sim.dispatch({ type: 'gangs.respond', payload: { incidentId: incident.id, choice } });
}

describe('Gang-Methoden (Auftrag 23)', () => {
  it('Einbruch: nachts gestohlen, am Morgen gemeldet, mit Antworten', () => {
    const sim = createTestGame({ seed: 4 });
    const events = recordEvents(sim);
    advanceToHour(sim, 2);
    const before = getStock(sim.state, { cityId: 'koeln' });
    expect(before).toBeGreaterThan(0);
    expect(run(sim, 'west', 'burglary')).toBe(true);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBeLessThan(before);
    const [incident] = incidents(sim);
    expect(incident.reported).toBe(false);
    // Noch keine Nachricht in der Nacht.
    expect(messages.thread(sim.state, 'other:neighbor')).toHaveLength(0);
    advanceToHour(sim, 8);
    const report = messages.thread(sim.state, 'other:neighbor').at(-1);
    expect(report?.options?.map((o) => o.id)).toContain('hunt');
    expect(report?.options?.map((o) => o.id)).toContain('drop');
    expect(eventsOfType(events, 'gang.burglary')).toHaveLength(1);
    // Abhaken schließt den Vorfall.
    expect(respond(sim, incident, 'drop').ok).toBe(true);
    expect(incidents(sim)).toHaveLength(0);
  });

  it('Einbruch: Täter suchen startet eine Konfrontation, Erfolg bringt Ware zurück', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = createTestGame({ seed });
      hire(sim, 'ebertplatz', 80);
      advanceToHour(sim, 2);
      stock(sim);
      run(sim, 'west', 'burglary');
      advanceToHour(sim, 8);
      const [incident] = incidents(sim);
      if (!incident?.amount) continue;
      const stolen = getStock(sim.state, { cityId: 'koeln' });
      expect(respond(sim, incident, 'hunt').ok).toBe(true);
      const [encounter] = activeEncounters(sim.state);
      expect(encounter.kind).toBe('recoverLoot');
      autoResolveEncounter(sim.ctx('test'), encounter.id);
      sim.advance(1);
      expect(incidents(sim)).toHaveLength(0);
      const after = getStock(sim.state, { cityId: 'koeln' });
      if (after > stolen) return; // Erfolg gesehen.
    }
    throw new Error('In sechs Seeds keine erfolgreiche Suche');
  });

  it('Einbruch: verpfeifen, wenn die Spur zu einer Gang führt, rauswerfen bei einem eigenen Mann', () => {
    const sim = createTestGame({ seed: 4 });
    const runner = hire(sim, 'ebertplatz');
    advanceToHour(sim, 2);
    stock(sim);
    run(sim, 'west', 'burglary');
    const [incident] = incidents(sim);
    incident.trail = 'gang';
    incident.gangId = 'west';
    incident.staffId = undefined;
    advanceToHour(sim, 8);
    expect(respond(sim, incident, 'fire').ok).toBe(false);
    const events = recordEvents(sim);
    expect(respond(sim, incident, 'snitch').ok).toBe(true);
    expect(eventsOfType(events, 'police.tipOff')).toHaveLength(1);

    // Zweiter Einbruch, diesmal war es der eigene Läufer.
    sim.state.modules.gangs.lastMethodAt = null;
    advanceToHour(sim, 2);
    stock(sim);
    run(sim, 'nord', 'burglary');
    const [second] = incidents(sim);
    second.trail = 'insider';
    second.gangId = null;
    second.staffId = runner;
    advanceToHour(sim, 8);
    expect(respond(sim, second, 'snitch').ok).toBe(false);
    expect(respond(sim, second, 'fire').ok).toBe(true);
    expect(isEmployed(sim.state, runner)).toBe(false);
  });

  it('Einbruch: eine Wache am Lager verscheucht Einbrecher oft', () => {
    let foiled = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createTestGame({ seed });
      wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
      const guard = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
      const id = ((guard as { data?: { staffId: string } }).data as { staffId: string }).staffId;
      const m = getStaffMember(sim.state, id);
      const w = getWarehouses(sim.state, 'koeln')[0];
      if (!m) throw new Error('kein Mitarbeiter');
      m.role = 'security';
      m.assignment = { kind: 'warehouse', targetId: w.id };
      advanceToHour(sim, 2);
      const before = getStock(sim.state, { warehouseId: w.id });
      run(sim, 'west', 'burglary');
      if (getStock(sim.state, { warehouseId: w.id }) === before) foiled++;
    }
    expect(foiled).toBeGreaterThan(2);
  });

  it('Abwerben: Lohn erhöhen hält ihn, gehen lassen verliert ihn, drohen würfelt', () => {
    const raise = createTestGame({ seed: 3 });
    const a = hire(raise, 'ebertplatz');
    const wage = getStaffMember(raise.state, a)?.wage ?? 0;
    expect(run(raise, 'ost', 'poach')).toBe(true);
    const [incident] = incidents(raise);
    const text = messages.thread(raise.state, `staff:${a}`).at(-1)?.text ?? '';
    expect(text).toContain('Schäl Sick');
    expect(respond(raise, incident, 'raise').ok).toBe(true);
    expect(getStaffMember(raise.state, a)?.wage).toBeGreaterThan(wage);
    expect(isEmployed(raise.state, a)).toBe(true);

    const release = createTestGame({ seed: 3 });
    const b = hire(release, 'ebertplatz');
    run(release, 'ost', 'poach');
    // Ohne Antwort geht er nach der Frist.
    release.advance(9 * 60);
    expect(isEmployed(release.state, b)).toBe(false);

    let stayed = 0;
    let left = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createTestGame({ seed });
      const c = hire(sim, 'ebertplatz', 30);
      run(sim, 'ost', 'poach');
      respond(sim, incidents(sim)[0], 'threaten');
      if (isEmployed(sim.state, c)) stayed++;
      else left++;
    }
    expect(stayed).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it('Einschüchtern: weniger Kunden am Spot, bis es vorbei ist', () => {
    const sim = createTestGame({ seed: 2 });
    hire(sim, 'ebertplatz', 80);
    expect(intimidationFactor(sim.state, 'ebertplatz')).toBe(1);
    expect(run(sim, 'nord', 'intimidate')).toBe(true);
    const spotId = sim.state.modules.gangs.intimidations[0].spotId;
    expect(getSpot(sim.state, spotId)).toBeDefined();
    expect(intimidationFactor(sim.state, spotId)).toBeLessThan(1);
    sim.advance(9 * 60);
    expect(intimidationFactor(sim.state, spotId)).toBe(1);
    expect(incidents(sim)).toHaveLength(0);
  });

  it('Erpressung: zahlen kostet Geld, ablehnen bringt Heat', () => {
    const pay = createTestGame({ seed: 1 });
    wallet.earn(pay.ctx('test'), 10000, 'dirty', 'Test');
    expect(run(pay, 'sued', 'blackmail')).toBe(true);
    const [incident] = incidents(pay);
    const money = pay.state.wallet.dirty;
    expect(respond(pay, incident, 'pay').ok).toBe(true);
    expect(pay.state.wallet.dirty).toBe(money - (incident.amount ?? 0));

    const refuse = createTestGame({ seed: 1 });
    run(refuse, 'sued', 'blackmail');
    const [other] = incidents(refuse);
    const heatBefore = Object.values(refuse.state.modules.police.heat).reduce((a, b) => a + b, 0);
    expect(respond(refuse, other, 'refuse').ok).toBe(true);
    const heatAfter = Object.values(refuse.state.modules.police.heat).reduce((a, b) => a + b, 0);
    expect(heatAfter).toBeGreaterThan(heatBefore);
  });

  it('Tipp an die Polizei: Heat im Veedel deines Spots', () => {
    const sim = createTestGame({ seed: 1 });
    hire(sim, 'ebertplatz', 80);
    const veedelId = getSpot(sim.state, 'ebertplatz')?.veedelId ?? '';
    const before = getHeat(sim.state, veedelId);
    expect(run(sim, 'west', 'tipOff')).toBe(true);
    expect(getHeat(sim.state, veedelId)).toBeGreaterThan(before);
    expect(messages.thread(sim.state, 'gang:west').length).toBeGreaterThan(0);
  });

  it('ist deterministisch', () => {
    const play = () => {
      const sim = createTestGame({ seed: 7 });
      hire(sim, 'ebertplatz');
      advanceToHour(sim, 2);
      run(sim, 'west', 'burglary');
      run(sim, 'ost', 'poach');
      sim.advance(12 * 60);
      return JSON.stringify(sim.state.modules.gangs) + JSON.stringify(sim.state.messages.list.slice(-5));
    };
    expect(play()).toBe(play());
  });
});
