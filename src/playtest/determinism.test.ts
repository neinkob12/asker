// Determinismus mit allen Modulen: Gleicher Seed und gleiche Befehle ergeben die gleichen Ereignisse und den gleichen
// Zustand, auch mit Geldbuch, Leutnants mit mehreren Spots, Rechter Hand, Ausfällen und Polizei-Stufen. Und ein
// Spielstand, der mitten im Spiel gespeichert und geladen wird, läuft genauso weiter wie ohne Unterbrechung.

import { describe, expect, it } from 'vitest';
import { type GameEvent, loadSimulation, type Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { createTestGame, recordEvents } from '../core/testing';
import { DEFAULT_BOT, newBotStats, playFor } from './bot';

const DAY = 24 * 60;

function run(seed: number, days: number): { sim: Simulation; events: GameEvent[] } {
  const sim = createTestGame({ seed });
  const events = recordEvents(sim);
  playFor(sim, days * DAY, newBotStats(), DEFAULT_BOT);
  return { sim, events };
}

describe('Determinismus', () => {
  it('gleicher Seed, gleicher Bot: gleiche Ereignisse und gleicher Zustand', () => {
    const a = run(7, 14);
    const b = run(7, 14);
    expect(b.events.length).toBe(a.events.length);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.sim.state)).toBe(JSON.stringify(a.sim.state));
    // Die neuen Systeme waren auch wirklich im Spiel.
    const types = new Set(a.events.map((e) => e.type));
    expect(types.has('wallet.changed')).toBe(true);
    expect(types.has('hierarchy.appointed')).toBe(true);
    expect(types.has('hierarchy.rightHandAppointed')).toBe(true);
    expect(types.has('hierarchy.dailyReport')).toBe(true);
    expect(a.sim.state.modules.finance.days.length).toBeGreaterThan(5);
    // Zwei Spiele über 14 Tage brauchen je nach Rechner mehr als die 5 Sekunden Standard.
  }, 120_000);

  it('Speichern und Laden mitten im Spiel ändert nichts am weiteren Verlauf', () => {
    const straight = createTestGame({ seed: 4 });
    const stats = newBotStats();
    playFor(straight, 6 * DAY, stats, DEFAULT_BOT);
    const saved = JSON.parse(JSON.stringify(straight.state));
    const resumed = loadSimulation(saved, discoverModules());
    playFor(straight, 4 * DAY, stats, DEFAULT_BOT);
    playFor(resumed, 4 * DAY, newBotStats(), DEFAULT_BOT);
    expect(JSON.stringify(resumed.state)).toBe(JSON.stringify(straight.state));
  }, 120_000);
});
