// Tresor knacken (Auftrag 44, Teil 0): Auslöser nach einem Überfall mit dir selbst dabei, Geld, Alarm, timeout.

import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getEncounter } from '../encounters';
import { activeChallenge, MINIGAME_TIMEOUT } from '../minigames';
import { getHeat } from '../police';
import { SAFE_ALARM_HEAT, SAFE_MAX, SAFE_MIN, safeAmount } from './index';

function status(sim: Simulation, gangId: string) {
  return sim.state.modules.gangs.gangs[gangId];
}

/**
 * Überfall auf den Spot von „ost“ in Kalk mit dir selbst. Mit dir vor Ort wartet der Straßenkampf (Auftrag 46d); alle
 * Gegner gehen zu Boden, der Überfall ist gewonnen.
 */
function raidWon(sim: Simulation, gangMoney = 20000, playerPresent = true): number {
  const s = status(sim, 'ost');
  s.money = gangMoney;
  const result = sim.dispatch({
    type: 'gangs.attack',
    payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [], playerPresent },
  });
  if (!result.ok) throw new Error(result.reason);
  const encounterId = (result.data as { encounterId: number }).encounterId;
  const e = getEncounter(sim.state, encounterId);
  if (!e) throw new Error('Konfrontation fehlt');
  const open = e.minigame;
  if (!open) throw new Error('Der Straßenkampf hätte starten müssen');
  sim.dispatch({
    type: 'minigames.finish',
    payload: { id: open.challengeId, score: 1, picks: [`down:${e.opponent.count}`] },
  });
  expect(getEncounter(sim.state, encounterId)?.outcome).toBe('success');
  return encounterId;
}

describe('Tresor knacken', () => {
  it('so viel liegt drin: ein Zehntel vom Geld der Gang, höchstens 4000, unter 200 keiner', () => {
    expect(safeAmount(20000)).toBe(2000);
    expect(safeAmount(90000)).toBe(SAFE_MAX);
    expect(safeAmount(1500)).toBe(0);
    expect(safeAmount(SAFE_MIN * 10)).toBe(SAFE_MIN);
    expect(safeAmount(-50)).toBe(0);
  });

  it('nach einem gewonnenen Überfall mit dir selbst: Minispiel mit max und Ort', () => {
    const sim = createTestGame({ seed: 11 });
    const events = recordEvents(sim);
    const encounterId = raidWon(sim);
    const c = activeChallenge(sim.state);
    expect(c).toMatchObject({
      kind: 'safe',
      origin: { module: 'gangs', ref: `safe:ost:${encounterId}` },
      cityId: 'koeln',
      veedelId: 'kalk',
    });
    expect(c?.params.max).toBe(safeAmount(status(sim, 'ost').money));
    // Erst der Straßenkampf des Überfalls (Auftrag 46d), dann der Tresor.
    expect(eventsOfType(events, 'minigame.started').map((e) => e.payload.kind)).toEqual(['brawl', 'safe']);
  });

  it('ohne dich, bei einer armen Gang oder verlorenem Überfall kein Tresor', () => {
    const sim = createTestGame({ seed: 11 });
    const hire = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
    const runner = hire.ok ? (hire.data as { staffId: string }).staffId : '';
    status(sim, 'ost').money = 20000;
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [runner], playerPresent: false },
    });
    const id = result.ok ? (result.data as { encounterId: number }).encounterId : 0;
    // Ohne dich ist der Überfall sofort entschieden (Auftrag 46d), wie auch immer: kein Tresor.
    expect(getEncounter(sim.state, id)?.phase).toBe('done');
    expect(activeChallenge(sim.state)).toBeUndefined();

    const poor = createTestGame({ seed: 11 });
    raidWon(poor, 1000);
    expect(activeChallenge(poor.state)).toBeUndefined();
  });

  it('geknackt: max · Score Schwarzgeld aus der Kasse der Gang, mit Stadt gebucht', () => {
    const sim = createTestGame({ seed: 11 });
    raidWon(sim);
    const c = activeChallenge(sim.state);
    const max = Number(c?.params.max);
    const money = wallet.balance(sim.state, 'dirty');
    const gangMoney = status(sim, 'ost').money;
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.75 } }).ok).toBe(true);
    const amount = Math.round(max * 0.75);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money + amount);
    expect(status(sim, 'ost').money).toBe(gangMoney - amount);
    expect(sim.state.journal.some((j) => j.text.includes('knackst den Tresor'))).toBe(true);
  });

  it('nicht geknackt: Alarm, Heat in Kalk; timeout: nichts', () => {
    const sim = createTestGame({ seed: 11 });
    raidWon(sim);
    const heat = getHeat(sim.state, 'kalk');
    const money = wallet.balance(sim.state, 'dirty');
    sim.dispatch({ type: 'minigames.finish', payload: { id: activeChallenge(sim.state)?.id ?? 0, score: 0.2 } });
    expect(getHeat(sim.state, 'kalk')).toBe(heat + SAFE_ALARM_HEAT);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money);

    const idle = createTestGame({ seed: 11 });
    raidWon(idle);
    const idleMoney = wallet.balance(idle.state, 'dirty');
    idle.advance(MINIGAME_TIMEOUT);
    expect(activeChallenge(idle.state)).toBeUndefined();
    expect(idle.state.modules.minigames.history[0]).toMatchObject({ kind: 'safe', by: 'timeout' });
    // Löhne o. ä. können in der Stunde laufen, aus dem Tresor kommt nichts.
    expect(idle.state.journal.some((j) => j.text.includes('Tresor'))).toBe(false);
    expect(wallet.balance(idle.state, 'dirty')).toBeLessThanOrEqual(idleMoney);
  });
});
