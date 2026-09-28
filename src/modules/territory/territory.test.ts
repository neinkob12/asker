import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getGangs } from '../gangs';
import { allVeedel } from '../veedel';
import { CONTROL_THRESHOLD } from './config';
import {
  addInfluence,
  controlledBy,
  controllerOf,
  factionColor,
  factions,
  getInfluence,
  PLAYER_FACTION,
} from './index';

describe('territory', () => {
  it('zu Beginn haben die Gangs Köln unter sich aufgeteilt, der Spieler hat nichts', () => {
    const sim = createTestGame();
    const gangIds = getGangs(sim.state).map((g) => g.id);
    for (const v of allVeedel()) {
      expect(gangIds).toContain(controllerOf(sim.state, v.id));
      expect(getInfluence(sim.state, v.id, PLAYER_FACTION)).toBe(0);
    }
    for (const g of getGangs(sim.state)) {
      expect(controlledBy(sim.state, g.id)).toContain(g.homeVeedelId);
    }
    expect(controlledBy(sim.state, PLAYER_FACTION)).toEqual([]);
    expect(factions(sim.state)).toEqual([PLAYER_FACTION, ...gangIds]);
  });

  it('Einfluss ist begrenzt, Kontrollwechsel werden gemeldet', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const owner = controllerOf(sim.state, 'deutz');
    expect(addInfluence(ctx, 'deutz', PLAYER_FACTION, 500)).toBe(100);
    expect(controllerOf(sim.state, 'deutz')).toBe(PLAYER_FACTION);
    addInfluence(ctx, 'deutz', PLAYER_FACTION, -100);
    addInfluence(ctx, 'deutz', owner ?? '', -100);
    expect(controllerOf(sim.state, 'deutz')).toBeNull();
    sim.step();
    expect(eventsOfType(events, 'territory.controlChanged').map((e) => e.payload)).toEqual([
      { veedelId: 'deutz', from: owner, to: PLAYER_FACTION },
      { veedelId: 'deutz', from: PLAYER_FACTION, to: owner },
      { veedelId: 'deutz', from: owner, to: null },
    ]);
  });

  it('unter der Schwelle kontrolliert niemand', () => {
    const sim = createTestGame();
    const ctx = sim.ctx('test');
    const owner = controllerOf(sim.state, 'kalk') ?? '';
    addInfluence(ctx, 'kalk', owner, -100);
    addInfluence(ctx, 'kalk', PLAYER_FACTION, CONTROL_THRESHOLD - 1);
    expect(controllerOf(sim.state, 'kalk')).toBeNull();
    expect(factionColor(sim.state, PLAYER_FACTION)).toMatch(/^#/);
  });
});
