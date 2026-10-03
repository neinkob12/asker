// Determinismus mit allen Modulen: Gleicher Seed und gleiche Befehle ergeben die gleichen Ereignisse und den gleichen
// Zustand, auch mit Geldbuch, Leutnants mit mehreren Spots, Rechter Hand, Ausfällen und Polizei-Stufen. Und ein
// Spielstand, der mitten im Spiel gespeichert und geladen wird, läuft genauso weiter wie ohne Unterbrechung. Seit
// Auftrag 30 auch über zwei Städte: Vollmacht, Fahrt nach Hamburg, Umschalten, Route über die A1, Schlafmodus.

import { describe, expect, it } from 'vitest';
import { type GameEvent, loadSimulation, type Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { createTestGame, recordEvents } from '../core/testing';
import { DEFAULT_BOT, newBotStats, playFor } from './bot';
import { koelnKomplett } from './scenario';

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

  it('zwei Städte: gleiche Befehle mit Umzug, Umschalten und Route ergeben denselben Zustand, auch nach dem Laden', () => {
    const twoCities = (seed: number): { sim: Simulation; events: GameEvent[] } => {
      const sim = createTestGame({ seed });
      const events = recordEvents(sim);
      sim.state.wallet.dirty = 40_000;
      sim.state.wallet.clean = 15_000;
      const stats = newBotStats();
      playFor(sim, 2 * DAY, stats, DEFAULT_BOT);
      koelnKomplett(sim);
      // Der Bot erteilt die Vollmacht, fährt nach Hamburg und fängt dort an.
      playFor(sim, 2 * DAY, stats, DEFAULT_BOT);
      sim.dispatch({ type: 'staff.hireDriver', payload: {} });
      const driver = sim.state.modules.staff.members.find((m) => m.role === 'driver' && m.cityId === 'hamburg');
      const home = Object.keys(sim.state.modules.goods.stock).find((id) => id !== 'ehrenfeld') ?? 'werkstatt-ottensen';
      sim.dispatch({
        type: 'logistics.addRoute',
        payload: {
          driverId: driver?.id ?? null,
          fromId: home,
          toId: 'ehrenfeld',
          items: [{ productId: 'weed', amount: 50 }],
          departure: 9 * 60,
          roundTrip: true,
        },
      });
      sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } });
      playFor(sim, DAY, stats, DEFAULT_BOT);
      sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
      playFor(sim, DAY, stats, DEFAULT_BOT);
      return { sim, events };
    };
    const a = twoCities(11);
    const b = twoCities(11);
    expect(JSON.stringify(b.events)).toBe(JSON.stringify(a.events));
    expect(JSON.stringify(b.sim.state)).toBe(JSON.stringify(a.sim.state));
    const types = new Set(a.events.map((e) => e.type));
    for (const type of ['hierarchy.fullPowerGranted', 'city.arrived', 'city.switched', 'city.slept']) {
      expect(types.has(type as GameEvent['type']), type).toBe(true);
    }
    expect(a.sim.state.modules.logistics.routes).toHaveLength(1);
    // Mitten in Hamburg speichern und laden: Es geht genauso weiter.
    const saved = JSON.parse(JSON.stringify(a.sim.state));
    const resumed = loadSimulation(saved, discoverModules());
    playFor(a.sim, 2 * DAY, newBotStats(), DEFAULT_BOT);
    playFor(resumed, 2 * DAY, newBotStats(), DEFAULT_BOT);
    expect(JSON.stringify(resumed.state)).toBe(JSON.stringify(a.sim.state));
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
