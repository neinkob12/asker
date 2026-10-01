// Balancing-Simulation: Ein Bot (bot.ts) spielt mehrere Spieltage mit festen Seeds.
// Der schnelle Teil läuft bei jedem `npm test` und prüft grobe Leitplanken.
// Den ausführlichen Bericht (mehr Seeds, bis zum Sieg) gibt es mit `npm run balance`.

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core';
import { MONEY_CATEGORIES } from '../core';
import { createTestGame } from '../core/testing';
import { type BotOptions, CAREFUL_BOT, DEFAULT_BOT, newBotStats, playFor, snapshot } from './bot';

const DAY = 1440;

interface RunReport {
  seed: number;
  days: (ReturnType<typeof snapshot> & { revenue: number })[];
  events: Record<string, number>;
  /** Geldfluss der ersten sieben Tage nach Kategorie der Kasse (Umbuchungen wie Geldwäsche gehen in beide Richtungen). */
  flow: Record<string, number>;
}

function simulate(seed: number, days: number, stopOnWin = false, options: BotOptions = DEFAULT_BOT): RunReport {
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
  const flow: Record<string, number> = {};
  sim.onEvent((e: GameEvent) => {
    if (e.type !== 'wallet.changed' || e.time >= 7 * DAY + 18 * 60) return;
    const key = e.payload.category ? MONEY_CATEGORIES[e.payload.category].label : '(ohne)';
    flow[key] = (flow[key] ?? 0) + e.payload.amount;
  });
  const report: RunReport = { seed, days: [], events, flow };
  for (let d = 0; d < days; d++) {
    revenue = 0;
    playFor(sim, DAY, stats, options);
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
        console.log(
          `  Kontostand (Schwarzgeld) am Ende von Tag 1-7: ${r.days
            .slice(0, 7)
            .map((d) => d.dirty)
            .join(' / ')}`,
        );
        console.log(
          `  Geldfluss Tag 1-7 nach Kategorie: ${Object.entries(r.flow)
            .sort((a, b) => a[1] - b[1])
            .map(([k, v]) => `${k} ${Math.round(v)}`)
            .join(', ')}`,
        );
        if (verbose) for (const d of r.days) if (d.day % 10 === 0 || d === last) console.log(JSON.stringify(d));
        // Vorsichtiger Spieler: zwei Läufer, kein Ausbau. Kann er ansparen?
        const careful = simulate(seed, 10, false, CAREFUL_BOT);
        const profit = careful.days.slice(0, 10).map((d, i, all) => d.dirty - (i === 0 ? 1500 : all[i - 1].dirty));
        console.log(
          `  Vorsichtig (2 Läufer, kein Ausbau): Kontostand Tag 1-10 ${careful.days.map((d) => d.dirty).join(' / ')}` +
            ` | Plus pro Tag ${profit.join(' / ')} | Umsatz/Tag T3-10 ${Math.round(careful.days.slice(2, 10).reduce((s, d) => s + d.revenue, 0) / 8)}`,
        );
      }
    },
    3_600_000,
  );
});
