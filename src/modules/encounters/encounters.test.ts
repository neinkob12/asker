import { describe, expect, it } from 'vitest';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters, ENCOUNTER_KINDS, getEncounter, startEncounter } from './index';

describe('encounters', () => {
  it('der Stub entscheidet sofort und meldet das Ergebnis mit dem Auslöser', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    const { encounterId } = startEncounter(sim.ctx('police'), {
      kind: 'policeChase',
      veedelId: 'kalk',
      staffIds: [],
      origin: { module: 'police', ref: 'kontrolle-1' },
    });
    sim.step();
    const resolved = eventsOfType(events, 'encounter.resolved');
    expect(resolved).toHaveLength(1);
    expect(resolved[0].payload).toMatchObject({ encounterId, kind: 'policeChase', playerKilled: false });
    expect(resolved[0].payload.request.origin).toEqual({ module: 'police', ref: 'kontrolle-1' });
    expect(['success', 'failure']).toContain(resolved[0].payload.outcome);
    expect(activeEncounters(sim.state)).toHaveLength(0);
    expect(getEncounter(sim.state, encounterId)?.outcome).toBe(resolved[0].payload.outcome);
  });

  it('ist bei gleichem Seed deterministisch', () => {
    const outcomes = (seed: number) => {
      const sim = createTestGame({ seed });
      return Array.from({ length: 20 }, () => {
        const { encounterId } = startEncounter(sim.ctx('gangs'), { kind: 'raidDefense' });
        return getEncounter(sim.state, encounterId)?.outcome;
      });
    };
    expect(outcomes(5)).toEqual(outcomes(5));
  });

  it('kennt die vier Anlässe und lehnt unbekannte ab', () => {
    expect(Object.keys(ENCOUNTER_KINDS)).toEqual(['raidDefense', 'policeChase', 'debtCollection', 'dealGoneWrong']);
    const sim = createTestGame();
    expect(() => startEncounter(sim.ctx('x'), { kind: 'picknick' })).toThrow(/Unbekannter Anlass/);
  });
});
