// Spielende mit allen Modulen zusammen: Pleite, Tod, Sieg "Köln übernehmen", Normal- und Hardcore-Modus.

import { describe, expect, it } from 'vitest';
import { GameSession, MANUAL_SLOTS, memoryStorage, type Simulation, wallet } from '../core';
import { discoverModules } from '../core/discover';
import { createTestGame, eventsOfType, recordEvents } from '../core/testing';
import { getEncounter, startEncounter } from '../modules/encounters';
import { act } from '../modules/encounters/engine';
import { getLots, take } from '../modules/goods';
import { MINIGAME_KINDS } from '../modules/minigames';
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
    // Auftrag 46d: Mit dir vor Ort kommt der Straßenkampf (Minispiel). Hier wird er weggenommen, und du prügelst
    // Runde für Runde (act aus der Engine), bis es vorbei ist.
    const brawlReady = MINIGAME_KINDS.brawl.ready;
    let deaths = 0;
    try {
      for (let seed = 1; seed <= 60 && deaths === 0; seed++) {
        MINIGAME_KINDS.brawl.ready = true;
        const sim = createTestGame({ seed });
        const { encounterId } = startEncounter(sim.ctx('gangs'), {
          kind: 'gangSpotRaid',
          veedelId: 'kalk',
          playerPresent: true,
          opponent: { factionId: 'ost', label: 'Die Wachen', strength: 85, count: 5 },
        });
        const encounter = getEncounter(sim.state, encounterId);
        const open = encounter?.minigame;
        if (encounter && open) {
          encounter.minigame = null;
          sim.state.modules.minigames.active = sim.state.modules.minigames.active.filter(
            (c) => c.id !== open.challengeId,
          );
        }
        MINIGAME_KINDS.brawl.ready = false;
        for (let round = 0; round < 20 && encounter?.phase === 'rounds'; round++) {
          act(sim.ctx('gangs'), encounterId, 'fight');
        }
        if (sim.state.outcome.gameOver?.reason !== 'killed') continue;
        deaths++;
        expect(sim.isOver).toBe(true);
      }
    } finally {
      MINIGAME_KINDS.brawl.ready = brawlReady;
    }
    expect(deaths).toBeGreaterThan(0);
  }, 60_000);

  it('Sieg: Wer alle Veedel kontrolliert, hat Köln komplett übernommen, danach geht es weiter', () => {
    const sim = createTestGame({ seed: 4 });
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const { needed, majority } = campaignProgress(sim.state);
    expect(needed).toBe(allVeedel('koeln').length);
    // Die Mehrheit ist nur ein Meilenstein.
    for (const v of allVeedel('koeln').slice(0, majority)) addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    sim.step();
    expect(eventsOfType(events, 'campaign.milestone')).toHaveLength(1);
    expect(eventsOfType(events, 'campaign.won')).toHaveLength(0);
    for (const v of allVeedel('koeln').slice(majority)) addInfluence(ctx, v.id, PLAYER_FACTION, 100);
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
