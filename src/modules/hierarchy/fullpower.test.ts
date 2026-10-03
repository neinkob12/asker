// Vollmacht der Rechten Hand (Auftrag 30): Voraussetzungen, Anteil am Tagesgewinn, Widerruf, Aufgaben mit Vollmacht.

import { describe, expect, it } from 'vitest';
import { messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { dayReport } from '../finance';
import { getGangs } from '../gangs';
import { enlist, generateProfile, getStaffMember, type StaffMember } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { FULL_POWER_SHARE, REVOKE_LOYALTY, RIGHT_HAND_RANK_XP } from './config';
import {
  fullPowerMissing,
  getLieutenantIds,
  getRightHand,
  hasFullPower,
  isLieutenant,
  lieutenantOfSpot,
  rightHandSatisfaction,
} from './index';

const DAY = 1440;

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  return sim;
}

function hire(sim: Simulation, level: number, loyalty: number): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
  m.stats.loyalty = loyalty;
  m.stats.caution = 90;
  return m;
}

function allKoeln(sim: Simulation): void {
  const ctx = sim.ctx('test');
  for (const v of allVeedel()) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/** Zwei Leutnants und eine Rechte Hand; ready: Stufe 5 und alle Aufgaben an. */
function withRightHand(sim: Simulation, ready = true): StaffMember {
  sim.state.wallet.dirty = 50000;
  const a = hire(sim, 2, 70);
  const b = hire(sim, 2, 70);
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
  sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
  const boss = hire(sim, 5, 90);
  expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
  if (ready) {
    const rh = getRightHand(sim.state);
    if (!rh) throw new Error('keine Rechte Hand');
    rh.xp = RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: {
        settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
      },
    });
  }
  return boss;
}

describe('Vollmacht der Rechten Hand (Auftrag 30)', () => {
  it('Voraussetzungen: Rechte Hand auf Stufe 5, alle Aufgaben an, alle Veedel; nur der Spieler gibt sie', () => {
    const sim = quietGame();
    expect(fullPowerMissing(sim.state)).toEqual(expect.arrayContaining([expect.stringContaining('keine Rechte Hand')]));
    withRightHand(sim, false);
    const missing = fullPowerMissing(sim.state);
    expect(missing.some((m) => m.includes('Stufe'))).toBe(true);
    expect(missing.some((m) => m.includes('Aufgaben sind aus'))).toBe(true);
    expect(missing.some((m) => m.includes('Veedeln'))).toBe(true);
    const refused = sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} });
    expect(refused.ok).toBe(false);

    const ready = quietGame();
    withRightHand(ready);
    allKoeln(ready);
    expect(fullPowerMissing(ready.state)).toEqual([]);
    // Nicht die Rechte Hand selbst und kein Leutnant: Chefsache.
    expect(ready.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }, { actor: 'staff:x' }).ok).toBe(false);
    const events = recordEvents(ready);
    expect(ready.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(true);
    expect(hasFullPower(ready.state, 'koeln')).toBe(true);
    expect(getRightHand(ready.state)?.fullPower).toMatchObject({ cityId: 'koeln', share: FULL_POWER_SHARE });
    expect(eventsOfType(events, 'hierarchy.fullPowerGranted')).toHaveLength(1);
    expect(ready.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(false);
  });

  it('Anteil: 80 % vom Tagesgewinn laut Kasse, bei Verlust nichts; der Bericht kommt aus Köln', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    allKoeln(sim);
    expect(sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} }).ok).toBe(true);
    const events = recordEvents(sim);
    // Bis zur nächsten Mitternacht: ein guter Tag (Einnahme), dann abschließen lassen.
    sim.advance(DAY - (sim.state.time % DAY) - 60);
    wallet.earn(sim.ctx('test'), 20000, 'dirty', 'Test', 'sales.street');
    const today = dayReport(sim.state, 0);
    sim.advance(60 + 10);
    const taken = eventsOfType(events, 'hierarchy.shareTaken');
    expect(taken).toHaveLength(1);
    const { profit, amount, day } = taken[0].payload;
    expect(day).toBe(today.from);
    expect(profit).toBeGreaterThan(0);
    expect(amount).toBe(Math.round(profit * FULL_POWER_SHARE));
    // Gebucht als Anteil der Rechten Hand.
    const book = dayReport(sim.state, 0);
    expect(book.rows.find((r) => r.category === 'share.righthand')?.amount).toBe(-amount);

    // Ein Verlusttag: nur Ausgaben.
    sim.advance(DAY - 70 - 60);
    wallet.pay(sim.ctx('test'), 60000, 'dirty', 'Test', 'expense.other');
    sim.advance(60 + 10);
    expect(eventsOfType(events, 'hierarchy.shareTaken')).toHaveLength(1);

    // Bericht um acht: "Bericht aus Köln".
    sim.advance(9 * 60);
    const report = messages.thread(sim.state, `staff:${boss.id}`).find((m) => m.text.startsWith('Bericht aus Köln'));
    expect(report).toBeDefined();
  });

  it('Widerruf: Loyalität sinkt, Laune sinkt, sie behält Stufe und Aufgaben; danach entscheidest du wieder', () => {
    const sim = quietGame();
    const boss = withRightHand(sim);
    allKoeln(sim);
    sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} });
    const loyalty = getStaffMember(sim.state, boss.id)?.stats.loyalty ?? 0;
    const happy = rightHandSatisfaction(sim.state) ?? 0;
    const xp = getRightHand(sim.state)?.xp;
    expect(sim.dispatch({ type: 'hierarchy.revokeFullPower', payload: {} }).ok).toBe(true);
    expect(getStaffMember(sim.state, boss.id)?.stats.loyalty).toBe(Math.max(0, loyalty + REVOKE_LOYALTY));
    expect(rightHandSatisfaction(sim.state) ?? 0).toBeLessThan(happy);
    expect(getRightHand(sim.state)?.fullPower).toBeNull();
    expect(getRightHand(sim.state)?.xp).toBe(xp);
    expect(getRightHand(sim.state)?.settings.laundering).toBe(true);
    expect(sim.dispatch({ type: 'hierarchy.revokeFullPower', payload: {} }).ok).toBe(false);
  });

  it('Gangs und Chefsache: Schutzgeld bis zu ihrem Betrag zahlt sie, sonst lehnt sie ab', () => {
    const sim = quietGame();
    withRightHand(sim);
    allKoeln(sim);
    sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} });
    const gang = getGangs(sim.state)[0];
    const demand = (tribute: boolean) =>
      messages.send(sim.ctx('gangs'), {
        contact: { id: `gang:${gang.id}`, name: gang.name, kind: 'gang' },
        text: 'Zahl oder es knallt.',
        options: [
          ...(tribute
            ? [
                {
                  id: 'tribute',
                  label: 'Zahlen',
                  command: { type: 'gangs.payTribute' as const, payload: { gangId: gang.id } },
                },
              ]
            : []),
          {
            id: 'refuse',
            label: 'Verpiss dich.',
            command: { type: 'gangs.refuse' as const, payload: { gangId: gang.id } },
          },
        ],
        expiresIn: 600,
      });
    const rh = getRightHand(sim.state);
    if (!rh) throw new Error('keine Rechte Hand');
    rh.settings.protectionMax = 0;
    const first = demand(true);
    sim.advance(61);
    expect(messages.get(sim.state, first)?.answer).toBe('refuse');
    rh.settings.protectionMax = 1_000_000;
    const second = demand(true);
    sim.advance(61);
    expect(messages.get(sim.state, second)?.answer).toBe('tribute');
    expect(rh.fullPower?.done.answered).toBeGreaterThanOrEqual(2);
  });

  it('Leutnants: Spots ohne Leutnant bekommen jemanden ab Level 3 mit Loyalität', () => {
    const sim = quietGame();
    withRightHand(sim);
    allKoeln(sim);
    sim.dispatch({ type: 'hierarchy.grantFullPower', payload: {} });
    // Ein freier Spot und ein erfahrener, treuer Läufer.
    sim.state.modules.spots.unlocked.push('zuelpicher');
    const runner = hire(sim, 3, 70);
    const before = getLieutenantIds(sim.state).length;
    sim.advance(61);
    expect(getLieutenantIds(sim.state).length).toBeGreaterThan(before);
    expect(isLieutenant(sim.state, runner.id)).toBe(true);
    expect(lieutenantOfSpot(sim.state, 'zuelpicher')).not.toBeNull();
  });
});
