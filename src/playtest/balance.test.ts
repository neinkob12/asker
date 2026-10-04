// Balancing-Simulation: Ein Bot (bot.ts) spielt mehrere Spieltage mit festen Seeds.
// Der schnelle Teil läuft bei jedem `npm test` und prüft grobe Leitplanken.
// Den ausführlichen Bericht (mehr Seeds, bis zum Sieg) gibt es mit `npm run balance`.

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core';
import { MONEY_CATEGORIES } from '../core';
import { createTestGame } from '../core/testing';
import { allProducts } from '../modules/goods';
import { priceIndex } from '../modules/market';
import { contractStats } from '../modules/quests';
import { type BotOptions, CAREFUL_BOT, DEFAULT_BOT, newBotStats, playFor, snapshot } from './bot';
import { koelnKomplett } from './scenario';

const DAY = 1440;

interface RunReport {
  seed: number;
  days: (ReturnType<typeof snapshot> & { revenue: number })[];
  events: Record<string, number>;
  /** Geldfluss der ersten sieben Tage nach Kategorie der Kasse (Umbuchungen wie Geldwäsche gehen in beide Richtungen). */
  flow: Record<string, number>;
  /** Preisindex Köln aller Waren am Ende jedes Tages (Auftrag 32). */
  index: number[];
  /** Wochenverträge (Auftrag 32). */
  contracts: ReturnType<typeof contractStats>;
  /** Rabatt-Aktionen, bei denen der Bot gekauft hat. */
  dealsBought: number;
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
  const report: RunReport = {
    seed,
    days: [],
    events,
    flow,
    index: [],
    contracts: contractStats(sim.state),
    dealsBought: 0,
  };
  for (let d = 0; d < days; d++) {
    revenue = 0;
    playFor(sim, DAY, stats, options);
    report.days.push({ ...snapshot(sim.state), revenue: Math.round(revenue) });
    for (const p of allProducts()) report.index.push(priceIndex(sim.state, p.id, 'koeln'));
    if (sim.state.outcome.gameOver || (stopOnWin && sim.state.outcome.won)) break;
  }
  report.contracts = contractStats(sim.state);
  report.dealsBought = stats.deals?.length ?? 0;
  return report;
}

interface HamburgReport {
  seed: number;
  /** Tag der Ankunft in Hamburg (Spieltag). */
  arrived: number | null;
  days: (ReturnType<typeof snapshot> & { revenue: number; koelnIncome: number })[];
  events: Record<string, number>;
}

/**
 * Hamburg nach "Köln komplett" (Auftrag 30): Der Bot spielt koelnDays Tage Köln, dann ist Köln komplett und die Rechte
 * Hand bereit; der Bot erteilt die Vollmacht, fährt nach Hamburg und spielt dort hamburgDays Tage.
 */
function simulateHamburg(seed: number, koelnDays: number, hamburgDays: number, money?: number): HamburgReport {
  const sim = createTestGame({ seed });
  const stats = newBotStats();
  const events: Record<string, number> = {};
  let arrived: number | null = null;
  let revenue = 0;
  let koelnIncome = 0;
  sim.onEvent((e: GameEvent) => {
    events[e.type] = (events[e.type] ?? 0) + 1;
    if (e.type === 'city.arrived' && e.payload.cityId === 'hamburg') arrived = Math.floor(e.time / DAY) + 1;
    if (e.type === 'sale.completed' && e.payload.veedelId && arrived !== null) revenue += e.payload.revenue;
    if (e.type === 'wallet.changed' && e.payload.cityId === 'koeln' && e.payload.category === 'income.city') {
      koelnIncome += e.payload.amount;
    }
  });
  for (let d = 0; d < koelnDays; d++) playFor(sim, DAY, stats);
  if (money !== undefined) {
    sim.state.wallet.dirty = Math.max(sim.state.wallet.dirty, money);
    sim.state.wallet.clean = Math.max(sim.state.wallet.clean, money / 4);
  }
  koelnKomplett(sim);
  const report: HamburgReport = { seed, arrived: null, days: [], events };
  for (let d = 0; d < hamburgDays; d++) {
    revenue = 0;
    koelnIncome = 0;
    playFor(sim, DAY, stats);
    report.days.push({ ...snapshot(sim.state), revenue: Math.round(revenue), koelnIncome: Math.round(koelnIncome) });
    if (sim.state.outcome.gameOver) break;
  }
  report.arrived = arrived;
  return report;
}

describe('Balancing', () => {
  it('nach Köln komplett erteilt der Bot die Vollmacht, zieht nach Hamburg und fängt dort an', () => {
    const r = simulateHamburg(1, 0, 4, 30_000);
    const last = r.days[r.days.length - 1];
    expect(r.events['hierarchy.fullPowerGranted']).toBe(1);
    expect(r.arrived).not.toBeNull();
    expect(last.city).toBe('hamburg');
    expect(last.gameOver).toBeNull();
    expect(r.events['goods.warehouseBought'] ?? 0).toBeGreaterThanOrEqual(1);
    expect(r.days.some((d) => d.revenue > 0)).toBe(true);
  }, 120_000);

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
      // Markt und Verträge (Auftrag 32): Der Index bewegt sich mild, der Bot nimmt am Montag einen Vertrag.
      expect(Math.min(...r.index), `Seed ${seed}`).toBeGreaterThanOrEqual(0.85);
      expect(Math.max(...r.index), `Seed ${seed}`).toBeLessThanOrEqual(1.2);
      expect(r.contracts.accepted, `Seed ${seed}`).toBeGreaterThanOrEqual(1);
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
          `Seed ${seed}: ${last.won ? `Köln komplett an Tag ${last.won}` : last.gameOver ? `Game Over (${last.gameOver}) an Tag ${last.day}` : `Tag ${last.day}, ${last.veedel} Veedel`}` +
            ` | Boss von Köln (7) an Tag ${last.boss ?? '-'}` +
            ` | Veedel 1/3/5/7/9/12 ab Tag ${firstDay(1)}/${firstDay(3)}/${firstDay(5)}/${firstDay(7)}/${firstDay(9)}/${firstDay(12)}` +
            ` | Umsatz/Tag T1-5 ${avg(0, 5)}, T6-15 ${avg(5, 15)}, T16-30 ${avg(15, 30)}, danach ${avg(30, r.days.length)}` +
            ` | Gang-Überfälle ${e('gang.raidStarted')}, Vorstöße ${e('gang.pushStarted')}, Eskalationen ${e('gang.escalated')}` +
            ` | Razzien ${e('police.raidPlanned')}, Kontrollen ${e('police.check')}, Festnahmen ${e('police.arrest')}` +
            ` | ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        // Auftrag 33: Lager, Fahrzeuge, Routenwahl.
        console.log(
          `  Lager: abgelehnt ${(last.rejected * 100).toFixed(1)} % der Gramm, Regale ${e('goods.warehouseUpgraded')}, ` +
            `Lager gekauft ${e('goods.warehouseBought')} | Fahrzeuge ${last.vehicles} (beschlagnahmt ${e('fleet.seized')}) | ` +
            `Fahrten ${e('transport.started')}, am vollen Lager gewartet ${e('transport.waiting')}, Kontrollen unterwegs ${e('transport.stopped')}`,
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
        const c = r.contracts;
        const fmt = (n: number) => n.toFixed(2).replace('.', ',');
        console.log(
          `  Markt: Index Köln ${fmt(Math.min(...r.index))}–${fmt(Math.max(...r.index))}` +
            ` (Mittel ${fmt(r.index.reduce((a, b) => a + b, 0) / Math.max(1, r.index.length))})` +
            ` | Marktereignisse ${e('events.marketStarted')} | Aktionen ${e('supplier.dealStarted')}, gekauft ${r.dealsBought}` +
            ` | Verträge angenommen ${c.accepted}, erfüllt ${c.done}, geplatzt ${c.failed}` +
            ` (${c.accepted > 0 ? Math.round((c.done / c.accepted) * 100) : 0} %)`,
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

  it.skipIf(!process.env.BALANCE)(
    'Bericht: Hamburg nach Köln komplett',
    () => {
      const seeds = (process.env.BALANCE_SEEDS ?? '1,2,3').split(',').map(Number);
      const koelnDays = Number(process.env.BALANCE_KOELN_DAYS ?? 25);
      const hamburgDays = Number(process.env.BALANCE_HAMBURG_DAYS ?? 20);
      for (const seed of seeds) {
        const started = Date.now();
        const r = simulateHamburg(seed, koelnDays, hamburgDays);
        const last = r.days[r.days.length - 1];
        const arrived = r.arrived ?? 0;
        const firstDay = (n: number) => {
          const day = r.days.find((d) => d.hamburg >= n)?.day;
          return day ? `${day - arrived}` : '-';
        };
        const e = (k: string) => r.events[k] ?? 0;
        console.log(
          `Hamburg Seed ${seed}: Köln ${koelnDays} Tage gespielt, dann komplett | Ankunft Tag ${r.arrived ?? '-'}` +
            ` | Hamburger Veedel 1/3/5 nach ${firstDay(1)}/${firstDay(3)}/${firstDay(5)} Tagen` +
            ` | am Ende ${last.hamburg}/12 Veedel, ${last.spots} Spots gesamt, ${last.runners} Läufer` +
            ` | ${last.gameOver ? `Game Over (${last.gameOver})` : 'keine Pleite'}` +
            ` | Liegeplatz ${last.berth ? 'ja' : 'nein'} | Razzien ${e('police.raidPlanned')}, Gang-Überfälle ${e('gang.raidStarted')}` +
            ` | ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        console.log(
          `  Lager: abgelehnt ${(last.rejected * 100).toFixed(1)} % der Gramm, Regale ${e('goods.warehouseUpgraded')}, ` +
            `Lager gekauft ${e('goods.warehouseBought')} | Fahrzeuge ${last.vehicles} | Fahrten ${e('transport.started')}, ` +
            `am vollen Lager gewartet ${e('transport.waiting')}`,
        );
        console.log(
          `  Schwarzgeld je Tag: ${r.days.map((d) => d.dirty).join(' / ')}` +
            `\n  Umsatz Hamburg je Tag: ${r.days.map((d) => d.revenue).join(' / ')}` +
            `\n  Ergebnis Köln (schläft) je Tag: ${r.days.map((d) => d.koelnIncome).join(' / ')}`,
        );
      }
    },
    3_600_000,
  );
});
