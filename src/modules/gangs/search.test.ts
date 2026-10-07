// Bude durchsuchen (Auftrag 44, Teil 6): Auslöser nach dem Eintreiben mit dir selbst dabei, Geld, Lärm, Rechte Hand,
// timeout.

import { describe, expect, it } from 'vitest';
import { type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getEncounter } from '../encounters';
import { activeChallenge, MINIGAME_TIMEOUT, RIGHT_HAND_LOSE_SCORE, RIGHT_HAND_WIN_SCORE } from '../minigames';
import { getHeat } from '../police';
import { getAllSpots, spotCity } from '../spots';
import { enlist, generateProfile } from '../staff';
import { SEARCH_BONUS, SEARCH_MIN, SEARCH_NOISE_HEAT, searchAmount } from './index';

const STAKE = 900;

function status(sim: Simulation, gangId: string) {
  return sim.state.modules.gangs.gangs[gangId];
}

/**
 * „ost“ schuldet dir Schutzgeld, du treibst selbst ein. Mit dir vor Ort wartet der Straßenkampf (Auftrag 46d): Ohne
 * Treffer wackelt er danach und gibt nach (gaveUp). Rückzug und abgelaufene Uhr lassen sich nicht mehr von Hand
 * spielen; dafür wird das Ereignis der entschiedenen Konfrontation nachgestellt (die Konfrontation selbst endet
 * verloren, ohne Bude).
 */
function collect(sim: Simulation, how: 'gaveUp' | 'flee' | 'clock' = 'gaveUp', playerPresent = true): number {
  const s = status(sim, 'ost');
  s.money = 20000;
  s.protection = { amount: STAKE, nextDueAt: sim.state.time + 1440, overdue: true };
  const result = sim.dispatch({
    type: 'gangs.collect',
    payload: { gangId: 'ost', staffIds: [], playerPresent },
  });
  if (!result.ok) throw new Error(result.reason);
  const encounterId = (result.data as { encounterId: number }).encounterId;
  const e = getEncounter(sim.state, encounterId);
  if (!e) throw new Error('Konfrontation fehlt');
  if (!playerPresent) return encounterId;
  const open = e.minigame;
  if (!open) throw new Error('Der Straßenkampf hätte starten müssen');
  if (how === 'gaveUp') {
    // Er wackelt schon: Nach dem Kampf ohne Treffer gibt er nach.
    e.resolve = 1;
    e.aggression = 0;
    e.intent = null;
    sim.dispatch({ type: 'minigames.finish', payload: { id: open.challengeId, score: 0.5, picks: [] } });
    expect(getEncounter(sim.state, encounterId)?.outcome).toBe('success');
    return encounterId;
  }
  // Du gehst zu Boden: verloren, keine Bude. Dann das Ereignis nachstellen, um das es geht.
  sim.dispatch({ type: 'minigames.finish', payload: { id: open.challengeId, score: 0, picks: ['ko'] } });
  const done = getEncounter(sim.state, encounterId);
  if (!done?.result) throw new Error('nicht entschieden');
  expect(activeChallenge(sim.state)).toBeUndefined();
  sim.ctx('encounters').emit('encounter.resolved', {
    encounterId,
    kind: done.kind,
    outcome: 'retreat',
    request: done.request,
    playerKilled: false,
    result: { ...done.result, money: 0, ending: how === 'flee' ? 'fled' : 'clock' },
    mode: 'self',
  });
  sim.advance(1);
  return encounterId;
}

/** Rechte Hand in Köln (lohnt sich erst ab zwei Leutnants), wie in minigames.test.ts. */
function rightHand(sim: Simulation) {
  const recruit = (level: number) => {
    const ctx = sim.ctx('staff');
    const m = enlist(ctx, generateProfile(ctx, 'runner', { level }), { origin: 'pool' });
    m.stats.loyalty = 70;
    return m;
  };
  const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === 'koeln');
  sim.state.modules.spots.unlocked = spots.map((s) => s.id);
  for (const spot of spots.slice(0, 2)) {
    const r = sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: recruit(4).id, spotIds: [spot.id] } });
    if (!r.ok) throw new Error(r.reason);
  }
  const r = sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: recruit(5).id } });
  if (!r.ok) throw new Error(r.reason);
}

describe('Bude durchsuchen', () => {
  it('so viel liegt drin: offener Rest plus 30 % vom Einsatz, höchstens das Geld der Gang', () => {
    expect(searchAmount(1000, 0, 50000)).toBe(1000 + 1000 * SEARCH_BONUS);
    expect(searchAmount(1000, 1000, 50000)).toBe(1000 * SEARCH_BONUS);
    expect(searchAmount(1000, 400, 50000)).toBe(600 + 300);
    expect(searchAmount(1000, -200, 50000)).toBe(1300);
    expect(searchAmount(1000, 0, 700)).toBe(700);
    expect(searchAmount(100, 100, 50000)).toBe(0);
    expect(searchAmount(1000, 0, SEARCH_MIN - 1)).toBe(0);
  });

  it('nach dem Eintreiben mit dir selbst: Minispiel mit max, Gang und Tageszeit', () => {
    const sim = createTestGame({ seed: 11 });
    const events = recordEvents(sim);
    const encounterId = collect(sim);
    const e = getEncounter(sim.state, encounterId);
    expect(e?.outcome).toBe('success');
    const c = activeChallenge(sim.state);
    expect(c).toMatchObject({
      kind: 'search',
      origin: { module: 'gangs', ref: `search:ost:${encounterId}` },
      cityId: 'koeln',
      veedelId: e?.request.veedelId,
    });
    expect(c?.params.max).toBe(searchAmount(STAKE, e?.result?.money ?? 0, status(sim, 'ost').money));
    expect(Number(c?.params.max)).toBeGreaterThanOrEqual(Math.round(STAKE * SEARCH_BONUS));
    expect(c?.params.phase).toEqual(expect.any(String));
    // Erst der Straßenkampf beim Eintreiben (Auftrag 46d), dann die Bude.
    expect(eventsOfType(events, 'minigame.started').map((e) => e.payload.kind)).toEqual(['brawl', 'search']);
  });

  it('auch beim Rückzug (er haut ab), aber nicht, wenn die Polizei-Uhr abläuft oder du nicht dabei bist', () => {
    const fled = createTestGame({ seed: 11 });
    collect(fled, 'flee');
    expect(activeChallenge(fled.state)?.kind).toBe('search');

    const clock = createTestGame({ seed: 11 });
    collect(clock, 'clock');
    expect(activeChallenge(clock.state)).toBeUndefined();

    const away = createTestGame({ seed: 11 });
    const hire = away.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
    const runner = hire.ok ? (hire.data as { staffId: string }).staffId : '';
    const s = status(away, 'ost');
    s.money = 20000;
    s.protection = { amount: STAKE, nextDueAt: away.state.time + 1440, overdue: true };
    const r = away.dispatch({
      type: 'gangs.collect',
      payload: { gangId: 'ost', staffIds: [runner], playerPresent: false },
    });
    const awayId = r.ok ? (r.data as { encounterId: number }).encounterId : 0;
    expect(getEncounter(away.state, awayId)?.outcome).not.toBeNull();
    expect(activeChallenge(away.state)).toBeUndefined();
  });

  it('gefunden: max · Score Schwarzgeld aus der Kasse der Gang, mit Stadt gebucht', () => {
    const sim = createTestGame({ seed: 11 });
    collect(sim);
    const c = activeChallenge(sim.state);
    const max = Number(c?.params.max);
    const money = wallet.balance(sim.state, 'dirty');
    const gangMoney = status(sim, 'ost').money;
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.8 } }).ok).toBe(true);
    const amount = Math.round(max * 0.8);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money + amount);
    expect(status(sim, 'ost').money).toBe(gangMoney - amount);
    expect(sim.state.journal.some((j) => j.text.includes('Du findest in der Bude'))).toBe(true);
  });

  it('nicht geschafft: das Gefundene zählt; mit Lärm Heat im Veedel, ohne Lärm keine', () => {
    const loud = createTestGame({ seed: 11 });
    const id = collect(loud);
    const veedelId = getEncounter(loud.state, id)?.request.veedelId ?? '';
    const c = activeChallenge(loud.state);
    const max = Number(c?.params.max);
    const heat = getHeat(loud.state, veedelId);
    const money = wallet.balance(loud.state, 'dirty');
    loud.dispatch({ type: 'minigames.finish', payload: { id: c?.id ?? 0, score: 0.2, picks: ['found:1', 'noise'] } });
    expect(getHeat(loud.state, veedelId)).toBe(heat + SEARCH_NOISE_HEAT);
    expect(wallet.balance(loud.state, 'dirty')).toBe(money + Math.round(max * 0.2));
    expect(loud.state.journal.some((j) => j.text.includes('Nachbarn'))).toBe(true);

    const quiet = createTestGame({ seed: 11 });
    const quietId = collect(quiet);
    const quietVeedel = getEncounter(quiet.state, quietId)?.request.veedelId ?? '';
    const quietHeat = getHeat(quiet.state, quietVeedel);
    const qc = activeChallenge(quiet.state);
    quiet.dispatch({ type: 'minigames.finish', payload: { id: qc?.id ?? 0, score: 0, picks: ['found:0'] } });
    expect(getHeat(quiet.state, quietVeedel)).toBe(quietHeat);
    expect(quiet.state.journal.some((j) => j.text.includes('Nichts gefunden'))).toBe(true);
  });

  it('Rechte Hand übernimmt: Geld mit ihrem festen Score, Eintrag mit ihr', () => {
    const sim = createTestGame({ seed: 11 });
    rightHand(sim);
    collect(sim);
    const c = activeChallenge(sim.state);
    const max = Number(c?.params.max);
    const money = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: c?.id ?? 0 } }).ok).toBe(true);
    const done = sim.state.modules.minigames.history[0];
    expect(done).toMatchObject({ kind: 'search', by: 'rightHand' });
    const score = done.won ? RIGHT_HAND_WIN_SCORE : RIGHT_HAND_LOSE_SCORE;
    expect(wallet.balance(sim.state, 'dirty')).toBe(money + Math.round(max * score));
    if (done.won) expect(sim.state.journal.some((j) => j.text.includes('Deine Rechte Hand findet'))).toBe(true);
  });

  it('timeout: nichts (kein Geld, keine Heat, kein Eintrag)', () => {
    const idle = createTestGame({ seed: 11 });
    collect(idle);
    const money = wallet.balance(idle.state, 'dirty');
    const gangMoney = status(idle, 'ost').money;
    idle.advance(MINIGAME_TIMEOUT);
    expect(activeChallenge(idle.state)).toBeUndefined();
    expect(idle.state.modules.minigames.history[0]).toMatchObject({ kind: 'search', by: 'timeout' });
    expect(idle.state.journal.some((j) => j.text.includes('Bude'))).toBe(false);
    expect(status(idle, 'ost').money).toBeGreaterThanOrEqual(gangMoney);
    expect(wallet.balance(idle.state, 'dirty')).toBeLessThanOrEqual(money);
  });
});
