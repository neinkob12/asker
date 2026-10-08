// Regressionstests zu Befunden aus dem Bugreview (Polizei): Zivi-Verkauf im Tutorial, Hysterese der Händler-Stufe,
// Razzia am Spot ohne Spot, Oktoberfest-Heat und die Statistik.

import { describe, expect, it } from 'vitest';
import { clock, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getEventDef, isEventActive } from '../events';
import { store } from '../goods';
import { activeChallenge } from '../minigames';
import { getSpot, spotsInVeedel } from '../spots';
import { enlist, generateProfile, getStaffMember } from '../staff';
import { MISSIONS } from '../tutorial';
import { DEALER_DOWN, DEALER_UP, RAID_LEAD_TIME } from './config';
import {
  arrestStaff,
  getHeat,
  getPoliceStats,
  type OperationFacts,
  startUndercoverShift,
  tipOffAgainstPlayer,
} from './index';
import { nextTier } from './tier';

/** Ein Wiesn-Spot und sein Veedel (Oktoberfest in München). */
const WIESN_SPOT = 'theresienwiese';
const WIESN_VEEDEL = 'isarvorstadt';

/** Spiel ohne zufällig auftauchende Kunden. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  return sim;
}

/** Keine zufälligen Kontrollen und Razzien. */
function noRandomPolice(sim: Simulation): void {
  const police = sim.state.modules.police;
  for (const id of Object.keys(police.heat)) {
    police.checkReadyAt[id] = Infinity;
    police.raidReadyAt[id] = Infinity;
  }
  police.majorReadyAt = Infinity;
}

describe('Zivi-Verkauf im Tutorial vor Stufe 9 ohne Kontrolle', () => {
  /** Tutorial auf Stufe stage, du stehst selbst am Neumarkt, eine Schicht Zivis läuft, du verkaufst an einen. */
  function soldToZivi(stage: number) {
    const sim = quietGame(3);
    const started = sim.dispatch({ type: 'tutorial.start', payload: {} });
    if (!started.ok) throw new Error(started.reason);
    const t = sim.state.modules.tutorial;
    t.stage = stage;
    t.mission = null;
    t.done = MISSIONS.filter((m) => m.stage < stage).map((m) => m.id);
    sim.advance(5);
    store(sim.ctx('goods'), { productId: 'weed', amount: 500 });
    const stand = sim.dispatch({ type: 'customers.standAt', payload: { spotId: 'neumarkt' } });
    if (!stand.ok) throw new Error(stand.reason);
    const id = startUndercoverShift(sim.ctx('police'), 'neumarkt', 80);
    if (id === null) throw new Error('keine Schicht');
    const c = activeChallenge(sim.state);
    if (!c) throw new Error('kein Minispiel');
    const events = recordEvents(sim);
    const checks = getPoliceStats(sim.state).checks;
    const done = sim.dispatch({ type: 'minigames.finish', payload: { id: c.id, score: 0.2, picks: ['soldZivi:1'] } });
    if (!done.ok) throw new Error(done.reason);
    return { sim, events, checks };
  }

  it('Stufe 8: Journal zum Verkauf, aber keine Kontrolle, keine Beschlagnahme, keine Jagd', () => {
    const { sim, events, checks } = soldToZivi(8);
    expect(sim.state.journal.some((j) => j.text.includes('an einen Zivi verkauft'))).toBe(true);
    expect(eventsOfType(events, 'police.check')).toHaveLength(0);
    expect(eventsOfType(events, 'encounter.resolved')).toHaveLength(0);
    expect(getPoliceStats(sim.state).checks).toBe(checks);
  });

  it('Stufe 9: die Kontrolle kommt wie gehabt', () => {
    const { sim, events, checks } = soldToZivi(9);
    expect(eventsOfType(events, 'police.check')[0]?.payload).toMatchObject({ spotId: 'neumarkt', staffId: null });
    expect(getPoliceStats(sim.state).checks).toBe(checks + 1);
  });
});

describe('Händler-Stufe mit Hysterese bei Spots und Leuten', () => {
  const facts = (patch: Partial<OperationFacts> = {}): OperationFacts => ({
    veedel: 0,
    spots: 0,
    people: 0,
    lieutenants: 0,
    warehouses: 1,
    berth: false,
    revenue: 0,
    ...patch,
  });

  it('auf genau den Haltewerten bleibt der Händler Händler, ein Kleindealer steigt dort nicht auf', () => {
    expect(nextTier(facts({ spots: DEALER_DOWN.spots }), 1)).toBe(1);
    expect(nextTier(facts({ people: DEALER_DOWN.people }), 1)).toBe(1);
    expect(nextTier(facts({ spots: DEALER_DOWN.spots, people: DEALER_DOWN.people }), 0)).toBe(0);
    expect(nextTier(facts({ spots: DEALER_UP.spots }), 0)).toBe(1);
    expect(nextTier(facts({ people: DEALER_UP.people }), 0)).toBe(1);
  });

  it('darunter geht es zurück; Veedel, Leutnant und zweites Lager halten wie bisher', () => {
    expect(nextTier(facts({ spots: DEALER_DOWN.spots - 1, people: DEALER_DOWN.people - 1 }), 1)).toBe(0);
    expect(nextTier(facts({ veedel: 1 }), 1)).toBe(1);
    expect(nextTier(facts({ lieutenants: 1 }), 1)).toBe(1);
    expect(nextTier(facts({ warehouses: 2 }), 1)).toBe(1);
    expect(nextTier(facts({ warehouses: 1 }), 1)).toBe(0);
    expect(nextTier(facts({ revenue: DEALER_DOWN.revenue }), 1)).toBe(1);
  });

  it('ein Läufer fällt weg und kommt wieder: die Stufe springt nicht hin und her', () => {
    const sim = quietGame(2);
    const events = recordEvents(sim);
    sim.state.wallet.dirty = 50_000;
    sim.advance(60);
    expect(sim.state.modules.police.tiers.koeln).toBe(0);
    for (const spotId of ['ebertplatz', 'neumarkt', 'zuelpicher', 'uni']) {
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
    }
    sim.advance(60);
    expect(sim.state.modules.police.tiers.koeln).toBe(1);
    const runner = sim.state.modules.staff.members.find(
      (m) => m.assignment?.kind === 'spot' && m.assignment.targetId === 'uni',
    );
    if (!runner) throw new Error('kein Läufer an der Uni');
    expect(sim.dispatch({ type: 'staff.assign', payload: { staffId: runner.id, assignment: null } }).ok).toBe(true);
    sim.advance(60);
    expect(sim.state.modules.police.tiers.koeln).toBe(1);
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: runner.id, assignment: { kind: 'spot', targetId: 'uni' } },
      }).ok,
    ).toBe(true);
    sim.advance(60);
    expect(eventsOfType(events, 'police.tierChanged').map((e) => e.payload)).toEqual([
      { from: 0, to: 1, cityId: 'koeln' },
    ]);
  });
});

describe('Razzia am Spot ohne freien Spot nimmt kein Lager-Personal fest', () => {
  it('über mehrere Seeds: der Wächter im Lager Ehrenfeld bleibt draußen', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const sim = quietGame(seed);
      const ctx = sim.ctx('staff');
      const guard = enlist(ctx, generateProfile(ctx, 'security'), { origin: 'pool' });
      const assigned = sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: guard.id, assignment: { kind: 'warehouse', targetId: 'ehrenfeld' } },
      });
      if (!assigned.ok) throw new Error(assigned.reason);
      expect(spotsInVeedel(sim.state, 'ehrenfeld')).toHaveLength(0);
      const events = recordEvents(sim);
      expect(tipOffAgainstPlayer(sim.ctx('gangs'), 'ehrenfeld', 0, true)).toBe(true);
      expect(sim.state.modules.police.plannedRaids.ehrenfeld).toMatchObject({ scope: 'spot', spotId: null });
      sim.advance(RAID_LEAD_TIME + 60);
      const raid = eventsOfType(events, 'police.raid').find((e) => e.payload.veedelId === 'ehrenfeld');
      expect(raid, `Seed ${seed}`).toBeDefined();
      expect(raid?.payload.arrested ?? [], `Seed ${seed}`).toEqual([]);
      expect(eventsOfType(events, 'police.arrest'), `Seed ${seed}`).toHaveLength(0);
      expect(getStaffMember(sim.state, guard.id)?.status, `Seed ${seed}`).toBe('active');
    }
  });
});

describe('Oktoberfest treibt den Heat pro Verkauf an den Wiesn-Spots', () => {
  /** Heat aus einem Verkauf auf der Theresienwiese am Tag d (12 Uhr), frisch von 0. */
  function heatFromSale(d: number): number {
    const sim = quietGame();
    noRandomPolice(sim);
    sim.state.time = clock.at(d, 12);
    sim.state.modules.police.heat[WIESN_VEEDEL] = 0;
    sim.ctx('customers').emit('sale.completed', {
      channel: 'street',
      spotId: WIESN_SPOT,
      veedelId: WIESN_VEEDEL,
      productId: 'weed',
      amount: 4,
      quality: 1,
      revenue: 40,
      sellerId: null,
      customerId: null,
    });
    sim.step();
    return getHeat(sim.state, WIESN_VEEDEL);
  }

  it('während der Wiesn um den Faktor des Events mehr als danach', () => {
    const wiesn = getEventDef('oktoberfest');
    if (wiesn?.schedule.kind !== 'cycle') throw new Error('Oktoberfest fehlt');
    expect(wiesn.area.spots).toContain(WIESN_SPOT);
    const during = wiesn.schedule.firstDay + 2;
    const after = wiesn.schedule.firstDay + wiesn.schedule.days + 2;
    expect(isEventActive(wiesn, clock.at(during, 12))).toBe(true);
    expect(isEventActive(wiesn, clock.at(after, 12))).toBe(false);
    const quiet = heatFromSale(after);
    expect(quiet).toBeGreaterThan(0);
    expect(heatFromSale(during) / quiet).toBeCloseTo(wiesn.effects.heatPerSale ?? 1, 2);
  });
});

describe('Statistik zählt nur wirksame Festnahmen und Razzien gegen dich', () => {
  it('wer schon sitzt oder weg ist, zählt nicht noch einmal als Festnahme', () => {
    const sim = quietGame();
    const ctx = sim.ctx('staff');
    const member = enlist(ctx, generateProfile(ctx, 'runner'), { origin: 'pool' });
    arrestStaff(sim.ctx('police'), member.id, 'ehrenfeld');
    sim.step();
    expect(getStaffMember(sim.state, member.id)?.status).toBe('jailed');
    expect(getPoliceStats(sim.state).arrests).toBe(1);
    arrestStaff(sim.ctx('police'), member.id, 'ehrenfeld');
    sim.step();
    expect(getPoliceStats(sim.state).arrests).toBe(1);
    arrestStaff(sim.ctx('police'), 'gibt-es-nicht', 'ehrenfeld');
    sim.step();
    expect(getPoliceStats(sim.state).arrests).toBe(1);
  });

  it('eine Großrazzia zählt einmal, Razzien gegen eine Gang nur in gangRaids', () => {
    const sim = quietGame();
    noRandomPolice(sim);
    const police = sim.state.modules.police;
    police.majorRaid = { at: sim.state.time, veedelIds: ['ehrenfeld', 'neustadt-sued', 'altstadt-nord'] };
    sim.advance(60);
    expect(police.majorRaid).toBeNull();
    expect(getPoliceStats(sim.state).raids).toBe(1);

    const snitched = quietGame();
    const events = recordEvents(snitched);
    expect(snitched.dispatch({ type: 'police.snitch', payload: { gangId: 'ost' } }).ok).toBe(true);
    snitched.advance(48 * 60);
    const gangRaids = eventsOfType(events, 'police.raid').filter((e) => e.payload.target === 'ost');
    expect(gangRaids.length).toBeGreaterThan(0);
    expect(getPoliceStats(snitched.state).gangRaids).toBe(gangRaids.length);
    expect(getPoliceStats(snitched.state).raids).toBe(0);
  });

  it('geplante Razzia und Großrazzia im selben Schritt nehmen niemanden zweimal fest', () => {
    let both = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const sim = quietGame(seed);
      noRandomPolice(sim);
      const veedelId = getSpot(sim.state, 'neumarkt')?.veedelId;
      if (!veedelId) throw new Error('Neumarkt fehlt');
      const ctx = sim.ctx('staff');
      // Läufer und Sicherheit am Neumarkt: zwei Leute, die beide Razzien treffen können.
      for (const role of ['runner', 'security'] as const) {
        const member = enlist(ctx, generateProfile(ctx, role), { origin: 'pool' });
        const assigned = sim.dispatch({
          type: 'staff.assign',
          payload: { staffId: member.id, assignment: { kind: 'spot', targetId: 'neumarkt' } },
        });
        if (!assigned.ok) throw new Error(assigned.reason);
      }
      const police = sim.state.modules.police;
      const before = getPoliceStats(sim.state).arrests;
      const events = recordEvents(sim);
      // Beide warten (Karneval, schlafende Stadt) und fallen dann in denselben Schritt.
      police.plannedRaids[veedelId] = { at: sim.state.time, scope: 'veedel', spotId: null };
      police.majorRaid = { at: sim.state.time, veedelIds: [veedelId] };
      sim.advance(60);
      const raids = eventsOfType(events, 'police.raid').filter((e) => e.payload.veedelId === veedelId);
      expect(
        raids.map((e) => e.payload.scope),
        `Seed ${seed}`,
      ).toEqual(['veedel', 'major']);
      expect(raids[0].time, `Seed ${seed}`).toBe(raids[1].time);
      const inRaids = raids.flatMap((e) => e.payload.arrested ?? []);
      expect(new Set(inRaids).size, `Seed ${seed}`).toBe(inRaids.length);
      const arrests = eventsOfType(events, 'police.arrest').map((e) => e.payload.staffId);
      expect(new Set(arrests).size, `Seed ${seed}`).toBe(arrests.length);
      expect(getPoliceStats(sim.state).arrests - before, `Seed ${seed}`).toBe(arrests.length);
      if ((raids[0].payload.arrested?.length ?? 0) > 0 && (raids[1].payload.arrested?.length ?? 0) > 0) both += 1;
    }
    // Die Seeds treffen auch Fälle, in denen beide Razzien jemanden festnehmen.
    expect(both).toBeGreaterThan(0);
  });
});
