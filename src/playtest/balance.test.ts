// Balancing-Simulation: Ein Bot (bot.ts) spielt mehrere Spieltage mit festen Seeds.
// Der schnelle Teil läuft bei jedem `npm test` und prüft grobe Leitplanken.
// Den ausführlichen Bericht (mehr Seeds, bis zum Sieg) gibt es mit `npm run balance`.

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core';
import { MONEY_CATEGORIES } from '../core';
import { createTestGame } from '../core/testing';
import { activeCity, saleRecord } from '../modules/city';
import { allProducts } from '../modules/goods';
import { priceIndex } from '../modules/market';
import { contractStats } from '../modules/quests';
import { getCustomers, supplierReputation, totalStock, tradeStats } from '../modules/trade';
import { type BotOptions, CAREFUL_BOT, DEFAULT_BOT, newBotStats, playFor, snapshot } from './bot';
import { koelnKomplett, playToGermany, sellAndArrive } from './scenario';

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

interface CitiesReport {
  seed: number;
  /** Tag der Ankunft in der Stadt (Spieltag), Köln ab Tag 1. */
  arrived: Record<string, number>;
  /** Tag, an dem die Stadt komplett war. */
  complete: Record<string, number>;
  /** Reihenfolge der Städte, wie der Bot sie gespielt hat. */
  order: string[];
  days: (ReturnType<typeof snapshot> & { revenue: number; sleepIncome: number; activeCity: string })[];
  events: Record<string, number>;
  stats: ReturnType<typeof newBotStats>;
}

/**
 * Mehrere Städte nacheinander (Auftrag 36, früher simulateHamburg): Der Bot spielt koelnDays Tage Köln, dann ist Köln
 * komplett und die Rechte Hand bereit (koelnKomplett), danach wählt er die nächste Stadt selbst, übergibt mit
 * Startpaket und spielt dort weiter, insgesamt laterDays Tage. Gemessen: Tage pro Stadt (Ankunft bis komplett).
 */
function simulateCities(
  seed: number,
  koelnDays: number,
  laterDays: number,
  money?: number,
  cityOrder?: readonly string[],
): CitiesReport {
  const options = { ...DEFAULT_BOT, ...(cityOrder ? { cityOrder } : {}) };
  const sim = createTestGame({ seed });
  const stats = newBotStats();
  const events: Record<string, number> = {};
  const report: CitiesReport = {
    seed,
    arrived: { koeln: 1 },
    complete: {},
    order: ['koeln'],
    days: [],
    events,
    stats,
  };
  let revenue = 0;
  let sleepIncome = 0;
  sim.onEvent((e: GameEvent) => {
    events[e.type] = (events[e.type] ?? 0) + 1;
    const day = Math.floor(e.time / DAY) + 1;
    if (e.type === 'city.arrived' && report.arrived[e.payload.cityId] === undefined) {
      report.arrived[e.payload.cityId] = day;
      report.order.push(e.payload.cityId);
    }
    if (e.type === 'campaign.won' && e.payload.cityId && report.complete[e.payload.cityId] === undefined) {
      report.complete[e.payload.cityId] = day;
    }
    if (e.type === 'sale.completed' && e.payload.veedelId && report.order.length > 1) revenue += e.payload.revenue;
    if (e.type === 'wallet.changed' && e.payload.category === 'income.city') sleepIncome += e.payload.amount;
    if (e.type === 'city.slept' && e.payload.raid) events.sleepRaids = (events.sleepRaids ?? 0) + 1;
    if (e.type === 'wallet.changed' && e.payload.category === 'transfer' && e.payload.reason.startsWith('Startgeld')) {
      events.startMoney = Math.round(e.payload.amount);
    }
  });
  for (let d = 0; d < koelnDays; d++) playFor(sim, DAY, stats, options);
  if (money !== undefined) {
    sim.state.wallet.dirty = Math.max(sim.state.wallet.dirty, money);
    sim.state.wallet.clean = Math.max(sim.state.wallet.clean, money / 4);
  }
  koelnKomplett(sim);
  for (let d = 0; d < laterDays; d++) {
    revenue = 0;
    sleepIncome = 0;
    playFor(sim, DAY, stats, options);
    report.days.push({
      ...snapshot(sim.state),
      revenue: Math.round(revenue),
      sleepIncome: Math.round(sleepIncome),
      activeCity: activeCity(sim.state),
    });
    if (sim.state.outcome.gameOver) break;
  }
  return report;
}

describe('Balancing', () => {
  it('nach Köln komplett wählt der Bot die nächste Stadt, übergibt mit Startpaket und fängt dort an', () => {
    const r = simulateCities(1, 0, 4, 30_000, ['berlin']);
    const last = r.days[r.days.length - 1];
    expect(r.events['hierarchy.fullPowerGranted']).toBe(1);
    expect(r.order).toEqual(['koeln', 'berlin']);
    expect(r.stats.cities?.[0]).toMatchObject({ from: 'koeln', to: 'berlin' });
    expect(last.city).toBe('berlin');
    expect(last.gameOver).toBeNull();
    expect(r.events['goods.warehouseBought'] ?? 0).toBeGreaterThanOrEqual(1);
    expect(r.days.some((d) => d.revenue > 0)).toBe(true);
  }, 120_000);

  it('München nach Köln (Auftrag 38): der Bot fährt hin, kauft ein Lager und verkauft dort', () => {
    const r = simulateCities(1, 0, 4, 60_000, ['muenchen']);
    const last = r.days[r.days.length - 1];
    expect(r.order).toEqual(['koeln', 'muenchen']);
    expect(last.city).toBe('muenchen');
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
            ` | Gang-Kriege ${e('gang.warStarted')} (geholfen ${e('gang.warSupported')}), Geschichten ${e('staff.story')}` +
            ` | Stammabnehmer: Stufen ${e('dealer.stageChanged')}, weg ${e('dealer.left')}, Zwischenhandel ${e('dealer.middlemanDelivered')}` +
            ` | Capos ${e('hierarchy.capoAppointed')}` +
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
    'Bericht: Tage pro Stadt',
    () => {
      const seeds = (process.env.BALANCE_SEEDS ?? '1,2,3').split(',').map(Number);
      const koelnDays = Number(process.env.BALANCE_KOELN_DAYS ?? 25);
      const laterDays = Number(process.env.BALANCE_LATER_DAYS ?? 30);
      // Reihenfolge der Städte nach Köln (Auftrag 38), z.B. BALANCE_ORDER=muenchen; fehlt: der Bot wählt selbst.
      const order = process.env.BALANCE_ORDER?.split(',').filter(Boolean);
      for (const seed of seeds) {
        const started = Date.now();
        const r = simulateCities(seed, koelnDays, laterDays, undefined, order);
        const last = r.days[r.days.length - 1];
        const e = (k: string) => r.events[k] ?? 0;
        const perCity = r.order.slice(1).map((cityId) => {
          const arrived = r.arrived[cityId];
          const done = r.complete[cityId];
          const veedel = (n: number) => {
            const day = r.days.find((d) => d.activeCity === cityId && (d.controlled[cityId] ?? 0) >= n)?.day;
            return day ? `${day - arrived}` : '-';
          };
          return (
            `${cityId}: Ankunft Tag ${arrived}, komplett ${done ? `nach ${done - arrived} Tagen` : 'noch nicht'}` +
            ` (Veedel 1/3/6/9/12 nach ${veedel(1)}/${veedel(3)}/${veedel(6)}/${veedel(9)}/${veedel(12)} Tagen)`
          );
        });
        console.log(
          `Tage pro Stadt, Seed ${seed}: Köln ${koelnDays} Tage gespielt, dann komplett | Reihenfolge ${r.order.join(' → ')}` +
            ` | ${perCity.join(' | ')}` +
            ` | ${last.gameOver ? `Game Over (${last.gameOver})` : 'keine Pleite'}` +
            ` | Startpaket ${r.stats.cities?.map((c) => `${c.pack} Leute`).join(', ') ?? '-'}` +
            ` | Startgeld ${r.events.startMoney ?? 0}` +
            ` | Schlaftage ${e('city.slept')}, davon Razzien ${r.events.sleepRaids ?? 0}` +
            ` | ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        console.log(
          `  Lager: abgelehnt ${(last.rejected * 100).toFixed(1)} % der Gramm, Lager gekauft ${e('goods.warehouseBought')}` +
            ` | Fahrzeuge ${last.vehicles} | Liegeplatz ${last.berth ? 'ja' : 'nein'} | Razzien ${e('police.raidPlanned')}` +
            `, Gang-Überfälle ${e('gang.raidStarted')}`,
        );
        console.log(
          `  Schwarzgeld je Tag: ${r.days.map((d) => d.dirty).join(' / ')}` +
            `\n  Umsatz neue Stadt je Tag: ${r.days.map((d) => d.revenue).join(' / ')}` +
            `\n  Ergebnis schlafende Städte je Tag: ${r.days.map((d) => d.sleepIncome).join(' / ')}`,
        );
      }
    },
    3_600_000,
  );

  it.skipIf(!process.env.BALANCE)(
    'Bericht: Hafen-Phase (nach Deutschland)',
    () => {
      const seeds = (process.env.BALANCE_SEEDS ?? '1,2,3').split(',').map(Number);
      const harborDays = Number(process.env.BALANCE_HARBOR_DAYS ?? 30);
      for (const seed of seeds) {
        const started = Date.now();
        const sim = createTestGame({ seed });
        const stats = newBotStats();
        const germany = playToGermany(sim, stats);
        if (germany === null) {
          console.log(
            `Hafen-Phase, Seed ${seed}: nicht Boss von Deutschland (${sim.state.outcome.gameOver?.reason ?? 'zu langsam'})`,
          );
          continue;
        }
        const before = Math.round(sim.state.wallet.dirty + sim.state.wallet.clean);
        if (!sellAndArrive(sim, stats)) {
          console.log(`Hafen-Phase, Seed ${seed}: Boss von Deutschland an Tag ${germany}, aber kein Verkauf`);
          continue;
        }
        const sale = saleRecord(sim.state);
        const arrived = Math.floor(sim.state.time / DAY) + 1;
        const start = Math.round(sim.state.wallet.dirty + sim.state.wallet.clean);
        const money: number[] = [];
        for (let d = 0; d < harborDays && !sim.state.outcome.gameOver; d++) {
          playFor(sim, DAY, stats);
          money.push(Math.round((sim.state.wallet.dirty + sim.state.wallet.clean) / 1000));
        }
        const t = tradeStats(sim.state);
        const rep = supplierReputation(sim.state);
        const share = t.demand > 0 ? t.ordered / t.demand : 0;
        const delivered = t.onTime + t.late;
        console.log(
          `Hafen-Phase, Seed ${seed}: Boss von Deutschland an Tag ${germany}, in Rotterdam an Tag ${arrived}` +
            ` | Tagesgewinn ${sale?.dailyProfit ?? 0}, Verkauf ${sale?.price ?? 0}, Rotterdam ${sale?.rotterdamPrice ?? 0}` +
            ` | Geld vorher ${before}, bei Ankunft ${start}, nach ${harborDays} Tagen ${money[money.length - 1] ?? 0} Tsd.` +
            ` | Umsatz ${t.revenue} (${Math.round(t.revenue / Math.max(1, harborDays))}/Tag)` +
            ` | Marktanteil ${Math.round(share * 100)} % | Lieferungen ${delivered} (pünktlich ${t.onTime}, zu spät ${t.late}, geplatzt ${t.failed}, gekippt ${t.tipped})` +
            ` | Container ${t.containers}, aufgeflogen ${t.seized}, Lkw-Ladungen beschlagnahmt ${t.deliveriesSeized}` +
            ` | Ruf pünktlich ${Math.round(rep.reliability * 100)} %, Qualität ${Math.round(rep.quality * 100)} %` +
            ` | Ware im Hafen ${Math.round(totalStock(sim.state) / 1000)} kg` +
            ` | ${sim.state.outcome.gameOver ? `Game Over (${sim.state.outcome.gameOver.reason})` : 'keine Pleite'}` +
            ` | ${((Date.now() - started) / 1000).toFixed(1)} s`,
        );
        console.log(`  Geld je Tag (Tsd.): ${money.join(' / ')}`);
        console.log(
          `  Kunden (Vertrauen/Anteil): ${getCustomers(sim.state)
            .map((c) => `${c.name} ${c.trust}/${Math.round(c.share * 100)} %`)
            .join(', ')}`,
        );
      }
    },
    3_600_000,
  );
});
