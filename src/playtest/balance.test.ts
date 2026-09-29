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
      // Das erste Veedel ist in Reichweite, die Gangs merken es und machen Druck.
      expect(Math.max(...r.days.map((d) => d.veedel)), `Seed ${seed}`).toBeGreaterThanOrEqual(1);
      expect(r.events['gang.escalated'] ?? 0, `Seed ${seed}`).toBeGreaterThan(0);
    }
  }, 120_000);

  it.skipIf(!process.env.BALANCE)(
    'Bericht: Kampagne mit mehreren Seeds',
    () => {
      const days = Number(process.env.BALANCE_DAYS ?? 30);
      const seeds = (process.env.BALANCE_SEEDS ?? '1,2,3').split(',').map(Number);
      const verbose = !!process.env.BALANCE_VERBOSE;
      for (const seed of seeds) {
        const started = Date.now();
        const r = simulate(seed, days, true);
        const last = r.days[r.days.length - 1];
        const firstDay = (n: number) => r.days.find((d) => d.veedel >= n)?.day ?? '-';
        const e = (k: string) => r.events[k] ?? 0;
        const avg = (from: number, to: number) =>
          Math.round(
            r.days.slice(from, to).reduce((sum, d) => sum + d.revenue, 0) / Math.max(1, r.days.slice(from, to).length),
          );
        console.log(
          `Seed ${seed}: ${last.won ? `Sieg an Tag ${last.won}` : last.gameOver ? `Game Over (${last.gameOver}) an Tag ${last.day}` : `Tag ${last.day}, ${last.veedel} Veedel`}` +
            ` | Veedel 1/3/5/7 ab Tag ${firstDay(1)}/${firstDay(3)}/${firstDay(5)}/${firstDay(7)}` +
            ` | Umsatz/Tag T1-5 ${avg(0, 5)}, T6-15 ${avg(5, 15)}, T16-30 ${avg(15, 30)}, danach ${avg(30, r.days.length)}` +
            ` | Gang-Überfälle ${e('gang.raidStarted')}, Vorstöße ${e('gang.pushStarted')}, Eskalationen ${e('gang.escalated')}` +
            ` | Razzien ${e('police.raidPlanned')}, Kontrollen ${e('police.check')}, Festnahmen ${e('police.arrest')}` +
            ` | ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        if (verbose) for (const d of r.days) if (d.day % 10 === 0 || d === last) console.log(JSON.stringify(d));
      }
    },
    3_600_000,
  );
});
