// Spielende mit allen Modulen zusammen: Pleite, Tod, Sieg "Köln übernehmen", Normal- und Hardcore-Modus.

import { describe, expect, it } from 'vitest';
import { GameSession, MANUAL_SLOTS, memoryStorage, type Simulation, wallet } from '../core';
import { discoverModules } from '../core/discover';
import { createTestGame, eventsOfType, recordEvents } from '../core/testing';
import { activeEncounters } from '../modules/encounters';
import { getLots, take } from '../modules/goods';
import { addInfluence, campaignProgress, controlledBy, PLAYER_FACTION } from '../modules/territory';
import { allVeedel } from '../modules/veedel';

/** Alles weg: Schwarzgeld, sauberes Geld und die ganze Ware. */
function loseEverything(sim: Simulation): void {
  const ctx = sim.ctx('test');
  wallet.lose(ctx, sim.state.wallet.dirty, 'dirty', 'Test');
  wallet.lose(ctx, sim.state.wallet.clean, 'clean', 'Test');
  for (const lot of getLots(sim.state)) take(ctx, { productId: lot.productId, amount: lot.amount, partial: true });
}

describe('Spielende', () => {
  it('Pleite: kein Geld, keine Ware, nichts unterwegs → Game Over', () => {
    const sim = createTestGame({ seed: 3 });
    const events = recordEvents(sim);
    loseEverything(sim);
    sim.step();
    expect(sim.state.outcome.gameOver?.reason).toBe('bankrupt');
    expect(eventsOfType(events, 'game.over')).toHaveLength(1);
    // Danach geht nichts mehr.
    const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } });
    expect(result.ok).toBe(false);
  });

  it('keine Pleite, solange eine Lieferung unterwegs ist', () => {
    const sim = createTestGame({ seed: 3 });
    expect(
      sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'weed25' } }).ok,
    ).toBe(true);
    loseEverything(sim);
    sim.advance(30);
    expect(sim.state.outcome.gameOver).toBeNull();
  });

  it('Tod: Wer bei einem Überfall selbst hingeht, kann sterben → Game Over "killed"', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 40 && deaths === 0; seed++) {
      const sim = createTestGame({ seed });
      sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
      const gangs = sim.state.modules.gangs.gangs;
      // Die Hafenkolonne verliert die Geduld und überfällt den Spot.
      for (let i = 0; i < 200 && activeEncounters(sim.state).length === 0; i++) {
        gangs.nord.hostility = 100;
        gangs.nord.stage = 3;
        gangs.nord.lastAttackAt = null;
        gangs.nord.lastSaleSpotId = 'ebertplatz';
        sim.advance(60);
      }
      const encounter = activeEncounters(sim.state)[0];
      if (!encounter) continue;
      if (encounter.phase === 'briefing') {
        expect(
          sim.dispatch({ type: 'encounters.join', payload: { encounterId: encounter.id, present: true } }).ok,
        ).toBe(true);
      }
      for (let round = 0; round < 10 && !sim.state.outcome.gameOver; round++) {
        const open = activeEncounters(sim.state).find((e) => e.id === encounter.id);
        if (!open) break;
        sim.dispatch({ type: 'encounters.act', payload: { encounterId: encounter.id, actionId: 'fight' } });
      }
      if (sim.state.outcome.gameOver?.reason !== 'killed') continue;
      deaths++;
      expect(sim.isOver).toBe(true);
    }
    expect(deaths).toBeGreaterThan(0);
  }, 60_000);

  it('Sieg: Wer alle Veedel kontrolliert, hat Köln komplett übernommen, danach geht es weiter', () => {
    const sim = createTestGame({ seed: 4 });
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const { needed, majority } = campaignProgress(sim.state);
    expect(needed).toBe(allVeedel().length);
    // Die Mehrheit ist nur ein Meilenstein.
    for (const v of allVeedel().slice(0, majority)) addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    sim.step();
    expect(eventsOfType(events, 'campaign.milestone')).toHaveLength(1);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(0);
    for (const v of allVeedel().slice(majority)) addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    sim.step();
    expect(controlledBy(sim.state, PLAYER_FACTION)).toHaveLength(needed);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(1);
    expect(sim.state.outcome.won).not.toBeNull();
    // Endlosmodus: Das Spiel läuft weiter, Befehle gehen noch.
    sim.advance(120);
    expect(sim.isOver).toBe(false);
    expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'uni' } }).ok).toBe(true);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(1);
  });

  const session = (storage = memoryStorage()) => new GameSession({ modules: discoverModules(), storage });

  it('Normal: Nach Game Over bleiben die älteren Spielstände zum Laden', () => {
    const s = session();
    s.newGame('normal', 5);
    s.save(MANUAL_SLOTS[0]);
    loseEverything(s.sim as Simulation);
    s.sim?.step();
    expect(s.state?.outcome.gameOver?.reason).toBe('bankrupt');
    expect(s.hardcoreDeleted).toBe(false);
    expect(s.listSaves().map((x) => x.slot)).toContain(MANUAL_SLOTS[0]);
    s.load(MANUAL_SLOTS[0]);
    expect(s.state?.outcome.gameOver).toBeNull();
  });

  it('Hardcore: Game Over löscht alle Spielstände des Durchgangs', () => {
    const storage = memoryStorage();
    const other = session(storage);
    other.newGame('normal', 6);
    other.save(MANUAL_SLOTS[2]);
    const s = session(storage);
    s.newGame('hardcore', 7);
    s.save(MANUAL_SLOTS[0]);
    loseEverything(s.sim as Simulation);
    s.sim?.step();
    expect(s.hardcoreDeleted).toBe(true);
    expect(s.listSaves().map((x) => x.slot)).toEqual([MANUAL_SLOTS[2]]);
  });
});
