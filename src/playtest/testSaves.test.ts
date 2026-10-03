// Test-Spielstände (testSaves.ts): Die Dateien in public/spielstaende/ lassen sich laden (auch nach künftigen
// Migrationen) und zeigen den Moment, für den sie gemacht sind.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadSimulation, parseSaveFile } from '../core';
import { discoverModules } from '../core/discover';
import { recordEvents } from '../core/testing';
import { fullPowerMissing, getRightHand } from '../modules/hierarchy';
import { TEST_SAVE_FILES } from '../ui/builtin/testSaves';
import { KOELN_KOMPLETT_DIRTY, ownedInKoeln, TEST_SAVES } from './testSaves';

const loadFile = (id: string) => {
  const file = parseSaveFile(readFileSync(`public/spielstaende/${id}.json`, 'utf8'));
  return loadSimulation(file.state, discoverModules());
};

describe('Test-Spielstände', () => {
  it('zu jedem Test-Spielstand gibt es die Datei, und der Spielstände-Dialog kennt alle', () => {
    for (const save of TEST_SAVES) expect(() => loadFile(save.id), save.id).not.toThrow();
    expect(TEST_SAVE_FILES.map((t) => t.id)).toEqual(TEST_SAVES.map((t) => t.id));
  });

  it('Köln fast komplett: 50.000 € schwarz, 11 Veedel, das zwölfte fällt gleich, dann ruft Hamburg an', () => {
    const sim = loadFile('koeln-komplett');
    const events = recordEvents(sim);
    expect(sim.state.meta.scenario).toBe('koeln-komplett');
    expect(sim.state.wallet.dirty).toBe(KOELN_KOMPLETT_DIRTY);
    expect(ownedInKoeln(sim.state)).toHaveLength(11);
    expect(sim.state.outcome.won).toBeNull();
    expect(getRightHand(sim.state, 'koeln')).not.toBeNull();

    // Die erste Spielminute nach dem Laden ist die volle Stunde: Das zwölfte Veedel fällt, Köln ist komplett.
    sim.step();
    expect(ownedInKoeln(sim.state)).toHaveLength(12);
    expect(events.some((e) => e.type === 'campaign.won')).toBe(true);
    expect(sim.state.outcome.gameOver).toBeNull();
    // Für die Vollmacht fehlt nur noch die Geldwäsche (aus, damit die 50.000 € stehen bleiben).
    expect(fullPowerMissing(sim.state, 'koeln')).toEqual(['Diese Aufgaben sind aus: Geldwäsche.']);
    expect(sim.state.wallet.dirty).toBeGreaterThan(KOELN_KOMPLETT_DIRTY - 1000);

    // Eine halbe Stunde später ruft Fiete aus Hamburg an.
    sim.advance(40);
    expect(events.some((e) => e.type === 'call.ringing')).toBe(true);
  });
});
