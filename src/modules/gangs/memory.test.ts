// Auftrag 34, Etappe 2: Gangs mit Gedächtnis und Gang-Kriege.

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getStock, store } from '../goods';
import { say } from './common';
import { ALLIANCE_COST, MEMORIES, WAR_AT, WAR_GOODS } from './config';
import { GANG_RIVALRY, GANGS, rivalryKey } from './data';
import {
  activeWars,
  allianceCost,
  ceasefireCost,
  type GangStatus,
  gangMemories,
  getGangStatus,
  MEMORY_TEXTS,
  memoryScore,
  pastWars,
  remember,
  rivalry,
} from './index';
import { forgetFaded } from './memory';
import { endWar, onPushIntoGang, recoverRivalries } from './war';

function status(sim: Simulation, gangId: string): GangStatus {
  const s = getGangStatus(sim.state, gangId);
  if (!s) throw new Error(`Gang ${gangId} fehlt`);
  return s;
}

function gang(id: string) {
  const g = GANGS.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

describe('Gedächtnis der Gangs', () => {
  it('Erinnerungen summieren sich begrenzt und verblassen', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('gangs');
    remember(ctx, 'nord', 'snitched');
    expect(memoryScore(sim.state, 'nord')).toBe(MEMORIES.snitched.effect);
    remember(ctx, 'nord', 'snitched');
    remember(ctx, 'nord', 'snitched');
    expect(memoryScore(sim.state, 'nord')).toBe(MEMORIES.snitched.effect * MEMORIES.snitched.stack);
    sim.advance(10 * 1440);
    expect(Math.abs(memoryScore(sim.state, 'nord'))).toBeLessThan(Math.abs(MEMORIES.snitched.effect * 2));
    sim.advance(11 * 1440);
    forgetFaded(sim.ctx('gangs'));
    expect(gangMemories(sim.state, 'nord')).toEqual([]);
  });

  it('Groll macht Waffenstillstand und Bündnis teurer, pünktliches Schutzgeld billiger', () => {
    const sim = createTestGame();
    status(sim, 'nord').hostility = 50;
    status(sim, 'west').hostility = 50;
    const before = ceasefireCost(sim.state, 'nord');
    remember(sim.ctx('gangs'), 'nord', 'snitched');
    expect(ceasefireCost(sim.state, 'nord')).toBeGreaterThan(before);
    expect(allianceCost(sim.state, 'nord')).toBeGreaterThan(ALLIANCE_COST);
    wallet.earn(sim.ctx('test'), 50_000, 'dirty', 'Test', 'income.other');
    const westBefore = ceasefireCost(sim.state, 'west');
    expect(sim.dispatch({ type: 'gangs.payTribute', payload: { gangId: 'west' } }).ok).toBe(true);
    expect(gangMemories(sim.state, 'west').map((m) => m.kind)).toEqual(['tributePaid']);
    expect(ceasefireCost(sim.state, 'west')).toBeLessThanOrEqual(westBefore);
  });

  it('aus bestehenden Ereignissen: Überfall auf ihren Spot, Abkommen gebrochen', () => {
    const sim = createTestGame();
    wallet.earn(sim.ctx('test'), 50_000, 'dirty', 'Test', 'income.other');
    status(sim, 'nord').hostility = 50;
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: 'nord' } }).ok).toBe(true);
    expect(gangMemories(sim.state, 'nord').map((m) => m.kind)).toContain('ceasefire');
    const veedelId = gang('nord').homeVeedelId;
    expect(
      sim.dispatch({ type: 'gangs.attack', payload: { gangId: 'nord', veedelId, staffIds: [], playerPresent: true } })
        .ok,
    ).toBe(true);
    const kinds = gangMemories(sim.state, 'nord').map((m) => m.kind);
    expect(kinds).toContain('spotRaided');
    expect(kinds).toContain('agreementBroken');
  });

  it('Nachrichten beziehen sich auf die stärkste Erinnerung', () => {
    const sim = createTestGame();
    remember(sim.ctx('gangs'), 'ost', 'snitched');
    const id = say(sim.ctx('gangs'), gang('ost'), 'warning', { veedel: 'Kalk' });
    const text = sim.state.messages.list.find((m) => m.id === id)?.text ?? '';
    expect(MEMORY_TEXTS.snitched.some((line) => text.endsWith(line))).toBe(true);
  });

  it('Version 4 → 5: Gedächtnis und Kriege fangen leer an', () => {
    const sim = createTestGame();
    remember(sim.ctx('gangs'), 'nord', 'deal');
    const raw = structuredClone(sim.state) as unknown as {
      moduleVersions: Record<string, number>;
      modules: { gangs: Record<string, unknown> };
    };
    raw.moduleVersions.gangs = 4;
    for (const key of ['memories', 'rivalry', 'wars', 'warLog', 'lastWarAskAt', 'warCount']) {
      delete raw.modules.gangs[key];
    }
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.gangs.memories).toEqual({});
    expect(activeWars(loaded.state)).toEqual([]);
    expect(rivalry(loaded.state, 'nord', 'ost')).toBe(GANG_RIVALRY[rivalryKey('nord', 'ost')]);
  });
});

describe('Gang-Kriege', () => {
  it('Verhältnisse stehen als Daten, Vorstöße machen sie schlechter, die Zeit heilt', () => {
    const sim = createTestGame();
    expect(rivalry(sim.state, 'ost', 'nord')).toBe(-70);
    expect(rivalry(sim.state, 'west', 'sued')).toBe(20);
    onPushIntoGang(sim.ctx('gangs'), gang('west'), 'sued', 'lindenthal');
    expect(rivalry(sim.state, 'west', 'sued')).toBeLessThan(20);
    expect(activeWars(sim.state)).toEqual([]);
    for (let i = 0; i < 10; i++) recoverRivalries(sim.ctx('gangs'));
    expect(rivalry(sim.state, 'west', 'sued')).toBe(20);
  });

  it('Vorstoß gegen Todfeinde: Krieg, Bitte um Hilfe, Ware liefern, Ausgang', () => {
    const sim = createTestGame();
    status(sim, 'nord').relation = 20;
    store(sim.ctx('test'), { productId: 'weed', amount: 200, quality: 0.6, unitCost: 4 });
    const stock = getStock(sim.state, { productId: 'weed' });
    const veedelId = gang('ost').homeVeedelId;
    onPushIntoGang(sim.ctx('gangs'), gang('nord'), 'ost', veedelId);
    expect(rivalry(sim.state, 'nord', 'ost')).toBeLessThanOrEqual(WAR_AT);
    const war = activeWars(sim.state)[0];
    expect(war).toMatchObject({ attacker: 'nord', defender: 'ost', asker: 'nord' });
    const msg = sim.state.messages.list.at(-1);
    expect(msg?.contactId).toBe('gang:nord');
    expect(msg?.options?.map((o) => o.id)).toContain('goods');
    const dirty = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'gangs.supportWar', payload: { warId: war.id, kind: 'goods' } }).ok).toBe(true);
    expect(getStock(sim.state, { productId: 'weed' })).toBe(stock - WAR_GOODS);
    expect(sim.state.wallet.dirty).toBeGreaterThan(dirty);
    expect(gangMemories(sim.state, 'nord')[0].kind).toBe('warHelp');
    expect(gangMemories(sim.state, 'ost')[0].kind).toBe('warAgainst');
    expect(sim.dispatch({ type: 'gangs.supportWar', payload: { warId: war.id, kind: 'goods' } }).ok).toBe(false);
    endWar(sim.ctx('gangs'), 'nord', veedelId, false);
    expect(activeWars(sim.state)).toEqual([]);
    expect(pastWars(sim.state)[0]).toMatchObject({ winner: 'ost', supported: 'nord' });
  });

  it('höchstens eine Bitte um Hilfe alle paar Tage pro Stadt', () => {
    const sim = createTestGame();
    onPushIntoGang(sim.ctx('gangs'), gang('nord'), 'ost', 'kalk');
    const asked = sim.state.messages.list.length;
    onPushIntoGang(sim.ctx('gangs'), gang('sued'), 'ost', 'porz');
    onPushIntoGang(sim.ctx('gangs'), gang('sued'), 'ost', 'porz');
    onPushIntoGang(sim.ctx('gangs'), gang('sued'), 'ost', 'porz');
    expect(sim.state.messages.list.length).toBe(asked);
  });

  it('kommen im Spiel vor, aber nicht dauernd (zwei Wochen, deterministisch)', () => {
    const run = () => {
      const sim = createTestGame({ seed: 4 });
      const events = recordEvents(sim);
      sim.advance(14 * 1440);
      return eventsOfType(events, 'gang.warStarted').map((e) => `${e.payload.attacker}>${e.payload.defender}`);
    };
    const first = run();
    expect(run()).toEqual(first);
    expect(first.length).toBeLessThanOrEqual(14);
  });
});
