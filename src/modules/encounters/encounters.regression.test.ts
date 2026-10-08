// Regressionstests für die Konfrontationen.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { getStock, store } from '../goods';
import { MINIGAME_KINDS, type MinigameKind } from '../minigames';
import { getStaffMember } from '../staff';
import { type Encounter, type EncounterEffects, type EncounterRequest, getEncounter, startEncounter } from './index';

const READY: MinigameKind[] = ['chase', 'brawl'];
const before = new Map<MinigameKind, boolean>();
beforeEach(() => {
  for (const kind of READY) {
    before.set(kind, MINIGAME_KINDS[kind].ready);
    MINIGAME_KINDS[kind].ready = true;
  }
});
afterEach(() => {
  for (const [kind, ready] of before) MINIGAME_KINDS[kind].ready = ready;
});

function hireRunner(sim: Simulation, spotId = 'ebertplatz'): string {
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

function get(sim: Simulation, id: number): Encounter {
  const e = getEncounter(sim.state, id);
  if (!e) throw new Error('Konfrontation fehlt');
  return e;
}

function begin(sim: Simulation, request: EncounterRequest, module = 'police'): Encounter {
  const { encounterId } = startEncounter(sim.ctx(module), request);
  sim.advance(1);
  return get(sim, encounterId);
}

const finishMinigame = (sim: Simulation, e: Encounter, score: number, picks: string[] = []) => {
  if (!e.minigame) throw new Error('Kein Minispiel offen');
  return sim.dispatch({ type: 'minigames.finish', payload: { id: e.minigame.challengeId, score, picks } });
};

const chaseRequest: EncounterRequest = {
  kind: 'policeChase',
  veedelId: 'ehrenfeld',
  playerPresent: true,
  opponent: { label: 'Polizei', strength: 1 },
  origin: { module: 'police', ref: 'check' },
};

describe('Beute landet in der Stadt der Konfrontation', () => {
  /** Köln ist aktiv, Hamburg ist frei. */
  function withHamburg(ownHamburgWarehouse: boolean): Simulation {
    const sim = createTestGame({ seed: 3 });
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' });
    if (ownHamburgWarehouse) sim.state.modules.goods.owned.push('werkstatt-ottensen');
    return sim;
  }
  // Schulden eintreiben hat keinen Einsatz „Ware“: Gewonnene Ware wird ganz gebucht, egal wie es ausgeht.
  const gain: EncounterEffects = { goods: 80 };
  const request: EncounterRequest = {
    kind: 'debtCollection',
    veedelId: 'st-pauli',
    playerPresent: false,
    effects: { success: gain, failure: gain, retreat: gain },
  };

  it('Gewinn an Ware in Hamburg geht ins Hamburger Lager, nicht nach Ehrenfeld', () => {
    const sim = withHamburg(true);
    const koeln = getStock(sim.state, { cityId: 'koeln' });
    const e = begin(sim, request, 'gangs');
    expect(e.result?.goods).toBe(80);
    expect(getStock(sim.state, { warehouseId: 'werkstatt-ottensen' })).toBe(80);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(koeln);
  });

  it('beim Überfall auf ein Lager geht der Gewinn in dieses Lager', () => {
    const sim = withHamburg(true);
    sim.state.modules.goods.owned.push('keller-st-georg');
    const ctx = sim.ctx('test');
    store(ctx, { productId: 'weed', amount: 10, warehouseId: 'keller-st-georg' });
    const e = begin(sim, { ...request, warehouseId: 'keller-st-georg' }, 'gangs');
    expect(e.result?.goods).toBe(80);
    expect(getStock(sim.state, { warehouseId: 'keller-st-georg' })).toBe(90);
    expect(getStock(sim.state, { warehouseId: 'werkstatt-ottensen' })).toBe(0);
  });

  it('in Köln bleibt alles wie bisher (Standardlager Ehrenfeld)', () => {
    const sim = withHamburg(true);
    const ehrenfeld = getStock(sim.state, { warehouseId: 'ehrenfeld' });
    const e = begin(sim, { ...request, veedelId: 'ehrenfeld' }, 'gangs');
    expect(e.result?.goods).toBe(80);
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBe(ehrenfeld + 80);
  });
});

describe('Ergebnis-Karte einer verlorenen Polizeiflucht zeigt Beschlagnahme und Festnahme', () => {
  it('mit dir und einem Läufer: Ware weg, Läufer in Haft, auf Karte und Chips', () => {
    const sim = createTestGame();
    const runner = hireRunner(sim);
    const stock = getStock(sim.state, { cityId: 'koeln' });
    expect(stock).toBeGreaterThan(0);
    const e = begin(sim, { ...chaseRequest, staffIds: [runner] });
    expect(finishMinigame(sim, e, 0.2).ok).toBe(true);
    sim.advance(1);
    const after = get(sim, e.id);
    expect(after.outcome).toBe('failure');
    const lost = stock - getStock(sim.state, { cityId: 'koeln' });
    expect(lost).toBeGreaterThan(0);
    expect(getStaffMember(sim.state, runner)?.status).toBe('jailed');
    const result = after.result;
    expect(result?.goods).toBe(-lost);
    expect(result?.staffArrested).toContain(runner);
    const goods = result?.parts?.find((p) => p.stake === 'goods');
    expect(goods?.state).not.toBe('kept');
    expect(goods?.text).not.toBe('gehalten');
    const people = result?.parts?.find((p) => p.stake === 'people');
    expect(people?.text).not.toBe('alle heil');
    expect(people?.text).toContain('in Haft');
    expect(result?.text).toContain('festgenommen');
  });

  it('nur der Läufer (wie bei einer Kontrolle): jede verlorene Flucht zeigt die Festnahme', () => {
    let failures = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = createTestGame({ seed });
      const runner = hireRunner(sim);
      const e = begin(sim, { ...chaseRequest, playerPresent: false, staffIds: [runner] });
      sim.advance(1);
      const after = get(sim, e.id);
      if (after.outcome !== 'failure') continue;
      failures += 1;
      expect(getStaffMember(sim.state, runner)?.status).toBe('jailed');
      expect(after.result?.staffArrested).toContain(runner);
      expect(after.result?.parts?.find((p) => p.stake === 'people')?.text).not.toBe('alle heil');
    }
    expect(failures).toBeGreaterThan(0);
  });

  it('entkommen: nichts wird nachgetragen', () => {
    const sim = createTestGame();
    const stock = getStock(sim.state, { cityId: 'koeln' });
    const e = begin(sim, chaseRequest);
    finishMinigame(sim, e, 0.9);
    sim.advance(1);
    const after = get(sim, e.id);
    expect(after.outcome).toBe('success');
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(stock);
    expect(after.result?.goods).toBe(0);
    expect(after.result?.parts?.find((p) => p.stake === 'goods')?.text).toBe('gehalten');
  });
});

describe('nach dem ersten Straßenkampf spielen die Leute den Rest ohne weiteres Minispiel aus', () => {
  const picksList: string[][] = [[], ['down:1'], ['down:1', 'playerHurt'], ['fled:1'], ['down:2']];
  it('kein zweiter Straßenkampf, die Konfrontation ist entschieden', () => {
    let cases = 0;
    for (let seed = 1; seed <= 8; seed++) {
      for (const count of [2, 3, 4]) {
        for (const score of [0, 0.4, 0.8]) {
          for (const picks of picksList) {
            const sim = createTestGame({ seed });
            const e = begin(
              sim,
              {
                kind: 'raidDefense',
                spotId: 'ebertplatz',
                veedelId: 'neustadt-nord',
                staffIds: [hireRunner(sim)],
                playerPresent: true,
                opponent: { factionId: 'nord', label: 'Leute der Hafenkolonne', strength: 50, count },
              },
              'gangs',
            );
            expect(e.minigame).toMatchObject({ kind: 'brawl' });
            finishMinigame(sim, e, score, picks);
            const after = get(sim, e.id);
            expect(after.minigame ?? null).toBeNull();
            expect(after.phase).toBe('done');
            expect(sim.state.modules.minigames.active).toHaveLength(0);
            cases += 1;
          }
        }
      }
    }
    expect(cases).toBe(8 * 3 * 3 * picksList.length);
  });
});

describe('zu Boden gerissen (nicht tödlich) zählt als verletzt', () => {
  it('Polizeiflucht: du liegst am Boden, das Ergebnis sagt „verletzt“', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    const player = get(sim, e.id).participants.find((p) => p.isPlayer);
    if (!player) throw new Error('Spieler fehlt');
    // So steht es nach dem zweiten Treffer im nicht tödlichen Zweig (hitOwn): am Boden, aber nicht tot.
    player.condition = 'down';
    finishMinigame(sim, e, 0.2);
    const after = get(sim, e.id);
    expect(after.playerKilled).toBe(false);
    expect(after.result?.playerInjured).toBe(true);
    expect(after.result?.text).toContain('du bist verletzt');
  });

  it('unverletzt bleibt unverletzt', () => {
    const sim = createTestGame();
    const e = begin(sim, chaseRequest);
    finishMinigame(sim, e, 0.9);
    expect(get(sim, e.id).result?.playerInjured).toBe(false);
  });
});
