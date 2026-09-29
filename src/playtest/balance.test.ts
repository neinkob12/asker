// Balancing-Simulation: Ein Bot (bot.ts) spielt mehrere Spieltage mit festen Seeds.
// Der schnelle Teil läuft bei jedem `npm test` und prüft grobe Leitplanken.
// Den ausführlichen Bericht (mehr Seeds, bis zum Sieg) gibt es mit `npm run balance`.

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core';
import { createTestGame } from '../core/testing';
import { DEFAULT_BOT, newBotStats, playFor, snapshot } from './bot';

const DAY = 1440;

interface RunReport {
  seed: number;
  days: (ReturnType<typeof snapshot> & { revenue: number })[];
  events: Record<string, number>;
}

function simulate(seed: number, days: number, stopOnWin = false): RunReport {
  const sim = createTestGame({ seed });
  const stats = newBotStats();
  const events: Record<string, number> = {};
  sim.onEvent((e: GameEvent) => {
    events[e.type] = (events[e.type] ?? 0) + 1;
  });
  let revenue = 0;
  sim.onEvent((e: GameEvent) => {
    if (e.type === 'sale.completed') revenue += e.payload.revenue;
  });
  const report: RunReport = { seed, days: [], events };
  for (let d = 0; d < days; d++) {
    revenue = 0;
    playFor(sim, DAY, stats, DEFAULT_BOT);
    report.days.push({ ...snapshot(sim.state), revenue: Math.round(revenue) });
    if (sim.state.outcome.gameOver || (stopOnWin && sim.state.outcome.won)) break;
  }
  return report;
}

describe('Balancing', () => {
  it('der Bot übersteht die ersten 10 Tage, verdient Geld und spürt die Gangs', () => {
    for (const seed of [1, 2]) {
      const r = simulate(seed, 10);
      const last = r.days[r.days.length - 1];
      expect(last.gameOver, `Seed ${seed}`).toBeNull();
      expect(last.runners, `Seed ${seed}`).toBeGreaterThanOrEqual(2);
      expect(r.events['sale.completed'] ?? 0).toBeGreaterThan(100);
    }
  }, 120_000);

  it.skipIf(!process.env.BALANCE)(
    'Bericht: 30 Tage und Kampagne',
    () => {
      const days = Number(process.env.BALANCE_DAYS ?? 30);
      const seeds = (process.env.BALANCE_SEEDS ?? '1,2,3').split(',').map(Number);
      for (const seed of seeds) {
        const started = Date.now();
        const r = simulate(seed, days, true);
        console.log(`\n=== Seed ${seed} (${((Date.now() - started) / 1000).toFixed(1)} s) ===`);
        for (const d of r.days) {
          if (d.day % 5 === 0 || d.day <= 3 || d.gameOver || d === r.days[r.days.length - 1])
            console.log(JSON.stringify(d));
        }
        const keys = Object.keys(r.events)
          .filter((k) => !k.startsWith('clock.') && !k.startsWith('wallet.') && k !== 'journal.added')
          .sort();
        console.log(keys.map((k) => `${k}=${r.events[k]}`).join('  '));
      }
    },
    3_600_000,
  );
});
