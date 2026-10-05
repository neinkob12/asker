// Auftrag 42: eigene Produktion im Ausland (Auslöser, Fincas, Kette, Kartell, Behörden, Ziele).

import { describe, expect, it } from 'vitest';
import { loadSimulation, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { playableCities, playerRank } from '../city';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { getStaffMember } from '../staff';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import {
  containerRisk,
  EUROPE_CITIES,
  getShipments,
  originStock,
  placeOrders,
  portStock,
  shippingMinutes,
  tradeStats,
} from '../trade';
import { allVeedel } from '../veedel';
import {
  CALL_AFTER_WEEKS,
  CALL_MIN_REVENUE,
  DRY_DAYS,
  GROW_DAYS,
  LEASE_LOST_DAYS,
  PACK_DAYS,
  PRESS_DAYS,
  STANDING_CROP_DAYS,
} from './config';
import {
  costPerGram,
  cropDays,
  europeProgress,
  expectedHarvest,
  fincaQuality,
  fincaWorkers,
  getFincas,
  goalShares,
  growGoals,
  regionAttention,
  regionStatus,
  workersNeeded,
} from './index';

const DAY = 1440;

/** Ganz Deutschland, verkauft und in Rotterdam angekommen; Kundschaft in den Städten aus. */
function soldGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
  sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
  const sold = sim.dispatch({ type: 'city.sell', payload: {} });
  if (!sold.ok) throw new Error(sold.reason);
  while (sim.state.modules.city.travel) sim.advance(30);
  return sim;
}

/** Hafen-Phase lange genug und mit genug Umsatz: Die Anrufe kommen. */
function readyForCalls(sim: Simulation): void {
  const trade = sim.state.modules.trade;
  trade.startedAt = sim.state.time - CALL_AFTER_WEEKS * 7 * DAY;
  trade.stats.revenue = CALL_MIN_REVENUE;
}

/** Beide Regionen frei, viel Geld. */
function openGame(seed = 1): Simulation {
  const sim = soldGame(seed);
  readyForCalls(sim);
  sim.advance(8 * 60);
  for (const id of ['kolumbien', 'marokko']) {
    const r = sim.dispatch({ type: 'grow.openRegion', payload: { regionId: id } });
    if (!r.ok) throw new Error(r.reason);
  }
  sim.state.wallet.clean = 5_000_000;
  sim.state.wallet.dirty = 5_000_000;
  return sim;
}

function settle(sim: Simulation, minutes: number): void {
  for (let t = 0; t < minutes; t += 60) {
    sim.advance(60);
    for (const e of activeEncounters(sim.state)) autoResolveEncounter(sim.ctx('test'), e.id);
  }
}

describe('Produktion: Auslöser (Auftrag 42, Etappe 1)', () => {
  it('vor dem Verkauf und in den ersten Wochen am Hafen ruft niemand an', () => {
    const sim = soldGame();
    sim.advance(2 * DAY);
    expect(sim.state.modules.grow.startedAt).toBeNull();
    expect(regionStatus(sim.state, 'kolumbien')).toBe('none');
  });

  it('nach genug Wochen und Umsatz rufen Kolumbien und Marokko an (mit Gesicht und Stimme); Annehmen macht die Region frei', () => {
    const sim = soldGame();
    const events = recordEvents(sim);
    readyForCalls(sim);
    sim.advance(60);
    expect(regionStatus(sim.state, 'kolumbien')).toBe('called');
    expect(regionStatus(sim.state, 'marokko')).toBe('none');
    sim.advance(7 * 60);
    expect(regionStatus(sim.state, 'marokko')).toBe('called');
    expect(eventsOfType(events, 'grow.called').map((e) => e.payload.regionId)).toEqual(['kolumbien', 'marokko']);
    const call = sim.state.messages.list.find((m) => m.contactId === 'grow:kolumbien' && m.call);
    expect(call?.call?.lines.length).toBeGreaterThan(2);
    const contact = sim.state.messages.contacts['grow:kolumbien'];
    expect(contact.look && Object.keys(contact.look).length).toBeGreaterThan(5);
    expect(contact.voice).toBeDefined();
    // Die Antwort im Anruf ist der Befehl.
    const option = call?.options?.find((o) => o.command?.type === 'grow.openRegion');
    expect(option).toBeDefined();
    expect(sim.dispatch({ type: 'grow.openRegion', payload: { regionId: 'kolumbien' } }).ok).toBe(true);
    expect(regionStatus(sim.state, 'kolumbien')).toBe('open');
    expect(eventsOfType(events, 'grow.regionOpened')).toHaveLength(1);
    // Ohne Anruf geht es nicht.
    expect(sim.dispatch({ type: 'grow.openRegion', payload: { regionId: 'atlantis' } }).ok).toBe(false);
  });

  it('wer das Angebot in der Kunden-App annimmt, bekommt keinen Rückruf mehr mit demselben Angebot', () => {
    const sim = soldGame();
    const events = recordEvents(sim);
    readyForCalls(sim);
    // Anruf aus Kolumbien verpassen: Esteban will später noch einmal anrufen.
    sim.advance(3 * 60);
    expect(sim.state.messages.calls.retries.some((r) => r.call.contact.id === 'grow:kolumbien')).toBe(true);
    expect(sim.dispatch({ type: 'grow.openRegion', payload: { regionId: 'kolumbien' } }).ok).toBe(true);
    expect(sim.state.messages.calls.retries.some((r) => r.call.contact.id === 'grow:kolumbien')).toBe(false);
    const rings = () =>
      eventsOfType(events, 'call.ringing').filter((e) => e.payload.contactId === 'grow:kolumbien').length;
    const before = rings();
    sim.advance(DAY);
    expect(rings()).toBe(before);
  });

  it('Cartagena hat einen Seeweg über den Atlantik: gut zwei Wochen bis Rotterdam, Tanger eine', () => {
    const cartagena = shippingMinutes('own-kolumbien', 'rotterdam');
    const tanger = shippingMinutes('own-marokko', 'rotterdam');
    expect(cartagena / DAY).toBeGreaterThan(14);
    expect(cartagena / DAY).toBeLessThan(25);
    expect(tanger / DAY).toBeLessThan(cartagena / DAY - 7);
  });
});

describe('Fincas und Kette (Auftrag 42, Etappe 2)', () => {
  it('pachten, Leute anheuern, pflanzen, ernten, trocknen, verpacken: die Ware liegt in Cartagena', () => {
    const sim = openGame();
    const events = recordEvents(sim);
    const lease = sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } });
    expect(lease.ok).toBe(true);
    const finca = getFincas(sim.state)[0];
    expect(finca.tenure).toBe('leased');
    expect(sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } }).ok).toBe(false);
    expect(
      sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) } })
        .ok,
    ).toBe(true);
    expect(sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'gardener' } }).ok).toBe(true);
    const gardener = getStaffMember(sim.state, finca.gardenerId ?? '');
    expect(gardener?.role).toBe('gardener');
    expect(gardener?.cityId).toBe('kolumbien');
    expect(finca.workerIds).toHaveLength(workersNeeded(finca));
    expect(sim.dispatch({ type: 'grow.plant', payload: { fincaId: finca.id, productId: 'hash' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'grow.plant', payload: { fincaId: finca.id, productId: 'weed' } }).ok).toBe(true);
    const harvest = expectedHarvest(sim.state, finca);
    expect(harvest).toBeGreaterThan(0);
    const quality = fincaQuality(sim.state, finca);
    settle(sim, (GROW_DAYS.outdoor + DRY_DAYS + PACK_DAYS) * DAY + 2 * 60);
    const harvested = eventsOfType(events, 'grow.harvested')[0]?.payload;
    expect(harvested?.grams).toBe(harvest);
    // Das Kartell nimmt seinen Anteil (Standard: du zahlst).
    expect(harvested?.cartel).toBeGreaterThan(0);
    const stock = originStock(sim.state, 'own-kolumbien').weed;
    expect(stock?.amount).toBe(harvest - (harvested?.cartel ?? 0));
    expect(stock?.quality).toBe(quality);
    expect(stock?.pack).toBeLessThan(1);
    // Gleich wieder gepflanzt.
    expect(getFincas(sim.state)[0].crop?.productId).toBe('weed');
    // Laufende Kosten durch die Gramm: ein Bruchteil des Einkaufs (Gras bei der Costa-Gärtnerei 0,19 × 11 € = 2,09 €).
    const perGram = costPerGram(sim.state) ?? 99;
    expect(perGram).toBeGreaterThan(0.05);
    expect(perGram).toBeLessThan(0.7);
  });

  it('Hasch wird nach dem Trocknen gepresst; das Gewächshaus halbiert die Zeit', () => {
    const sim = openGame();
    sim.dispatch({ type: 'grow.buyFinca', payload: { siteId: 'ketama-hang' } });
    const finca = getFincas(sim.state)[0];
    expect(finca.tenure).toBe('owned');
    sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) } });
    // Die Finca kommt mit der Pflanzung des Vorbesitzers (Hasch, reif nach STANDING_CROP_DAYS).
    expect(finca.crop?.productId).toBe('hash');
    expect((finca.crop?.readyAt ?? 0) - sim.state.time).toBe(STANDING_CROP_DAYS * DAY);
    expect(sim.dispatch({ type: 'grow.buildGreenhouse', payload: { fincaId: finca.id } }).ok).toBe(true);
    // Unter Glas wächst, was steht, doppelt so schnell; die nächste Aussaat braucht GROW_DAYS.greenhouse.
    expect((finca.crop?.readyAt ?? 0) - sim.state.time).toBe((STANDING_CROP_DAYS / 2) * DAY);
    expect(cropDays(finca)).toBe(GROW_DAYS.greenhouse);
    sim.dispatch({ type: 'grow.plant', payload: { fincaId: finca.id, productId: 'hash' } });
    settle(sim, (STANDING_CROP_DAYS / 2 + DRY_DAYS) * DAY + 2 * 60);
    expect(getFincas(sim.state)[0].batch?.stage).toBe('pressing');
    settle(sim, (PRESS_DAYS + PACK_DAYS) * DAY);
    expect(originStock(sim.state, 'own-marokko').hash?.amount).toBeGreaterThan(0);
  });

  it('eigene Container fahren aus Cartagena: ohne Warenkosten, als eigene Ware ins Lager und zum Kunden', () => {
    const sim = openGame();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    sim.state.modules.trade.origins['own-kolumbien'] = { weed: { amount: 30_000, quality: 0.8, pack: 0.6 } };
    const dirty = sim.state.wallet.dirty;
    const buy = sim.dispatch({
      type: 'trade.buy',
      payload: { producerId: 'own-kolumbien', productId: 'weed', size: 'medium', portId: 'rotterdam' },
    });
    expect(buy.ok).toBe(true);
    // Nur Fracht, keine Ware; der Container nimmt, was da ist (30 kg statt 50).
    expect(dirty - sim.state.wallet.dirty).toBe(6_000);
    const shipment = getShipments(sim.state).find((x) => x.producerId === 'own-kolumbien');
    expect(shipment?.amount).toBe(30_000);
    expect(shipment?.own).toBe(true);
    expect(originStock(sim.state, 'own-kolumbien').weed).toBeUndefined();
    // Die Verpackung senkt die Chance einer Kontrolle.
    expect(containerRisk(sim.state, 'own-kolumbien', 'medium', 'rotterdam', 'none', null, 0.6)).toBeLessThan(
      containerRisk(sim.state, 'own-kolumbien', 'medium', 'rotterdam'),
    );
    expect(
      sim.dispatch({ type: 'trade.buy', payload: { producerId: 'own-kolumbien', productId: 'weed', size: 'small' } })
        .ok,
    ).toBe(false);
    settle(sim, shippingMinutes('own-kolumbien', 'rotterdam') + 2 * 60);
    const lot = portStock(sim.state, 'rotterdam').weed;
    expect(lot?.own).toBe(30_000);
    // Ausliefern: Die eigene Ware geht anteilig mit, trade.delivered meldet sie.
    const order = sim.state.modules.trade.orders.find(
      (o) => o.items.some((i) => i.productId === 'weed') && o.status === 'open',
    );
    if (order) {
      sim.dispatch({ type: 'trade.answer', payload: { orderId: order.id, choice: 'accept' } });
      sim.dispatch({ type: 'trade.deliver', payload: { orderId: order.id, portId: 'rotterdam' } });
      settle(sim, 3 * DAY);
      const delivered = eventsOfType(events, 'trade.delivered').filter((e) => e.payload.orderId === order.id);
      if (delivered.length > 0) {
        expect(delivered.reduce((s, e) => s + e.payload.ownAmount, 0)).toBeGreaterThan(0);
        expect(tradeStats(sim.state).ownDelivered).toBeGreaterThan(0);
        expect(goalShares(sim.state).own).toBeGreaterThan(0);
      }
    }
    expect(ctx).toBeDefined();
  }, 30_000);

  it('ohne Anteil schlägt das Kartell zu; die Aufmerksamkeit steigt mit dem Anbau und Schmiergeld senkt sie', () => {
    const sim = openGame(3);
    const events = recordEvents(sim);
    sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'san-isidro' } });
    const finca = getFincas(sim.state)[0];
    sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) } });
    sim.dispatch({ type: 'grow.plant', payload: { fincaId: finca.id, productId: 'weed' } });
    expect(sim.dispatch({ type: 'grow.setCartel', payload: { regionId: 'kolumbien', pay: false } }).ok).toBe(true);
    settle(sim, 55 * DAY);
    expect(eventsOfType(events, 'grow.cartelHit').length).toBeGreaterThan(0);
    expect(regionAttention(sim.state, 'kolumbien')).toBeGreaterThan(0);
    const before = regionAttention(sim.state, 'kolumbien');
    expect(sim.dispatch({ type: 'grow.bribe', payload: { regionId: 'kolumbien' } }).ok).toBe(true);
    expect(regionAttention(sim.state, 'kolumbien')).toBeLessThan(before);
    expect(sim.dispatch({ type: 'grow.bribe', payload: { regionId: 'kolumbien' } }).ok).toBe(false);
  }, 30_000);

  it('gleicher Seed, gleiche Befehle: gleiche Ernten und gleiche Schläge', () => {
    const run = () => {
      const sim = openGame(2);
      const events = recordEvents(sim);
      sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'la-esperanza' } });
      const finca = getFincas(sim.state)[0];
      sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: 3 } });
      sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'gardener' } });
      sim.dispatch({ type: 'grow.setCartel', payload: { regionId: 'kolumbien', pay: false } });
      sim.dispatch({ type: 'grow.plant', payload: { fincaId: finca.id, productId: 'kush' } });
      sim.advance(70 * DAY);
      return events.filter((e) => e.type.startsWith('grow.')).map((e) => JSON.stringify(e));
    };
    expect(run()).toEqual(run());
  }, 30_000);
});

describe('Ziele (Auftrag 42, Etappe 3)', () => {
  it('Produzent ab der Hälfte eigener Ware in zwei Wochen, Europa erst mit allen Kunden', () => {
    const sim = openGame();
    const events = recordEvents(sim);
    const ctx = sim.ctx('test');
    const customers = sim.state.modules.trade.customers;
    for (const c of customers) {
      ctx.emit('trade.delivered', {
        orderId: 0,
        customerId: c.id,
        amount: 10_000,
        revenue: 1,
        late: false,
        ownAmount: 2_000,
        items: [{ productId: 'weed', amount: 10_000, own: 2_000 }],
      });
    }
    sim.advance(60);
    expect(growGoals(sim.state).producer).toBe(false);
    for (const c of customers) {
      ctx.emit('trade.delivered', {
        orderId: 0,
        customerId: c.id,
        amount: 10_000,
        revenue: 1,
        late: false,
        ownAmount: 10_000,
        items: [{ productId: 'weed', amount: 10_000, own: 10_000 }],
      });
    }
    sim.advance(60);
    expect(growGoals(sim.state).producer).toBe(true);
    expect(growGoals(sim.state).europe).toBe(false);
    expect(eventsOfType(events, 'grow.goalReached').map((e) => e.payload.goal)).toEqual(['producer']);
    // Der Rang folgt zur vollen Stunde (city), und er bleibt.
    sim.advance(60);
    expect(playerRank(sim.state).title).toBe('Produzent');
    expect(playerRank(sim.state).score).toBe(70);
    // Europa: alle Kunden aus eigener Produktion, auch jede Stadt in Europa.
    for (const city of EUROPE_CITIES) {
      if (!customers.some((c) => c.europeId === city.id)) {
        customers.push({
          ...customers[0],
          id: `europe:${city.id}`,
          kind: 'europe',
          europeId: city.id,
          name: city.name,
        });
      }
    }
    for (const c of customers) {
      ctx.emit('trade.delivered', {
        orderId: 0,
        customerId: c.id,
        amount: 10_000,
        revenue: 1,
        late: false,
        ownAmount: 10_000,
        items: [{ productId: 'weed', amount: 10_000, own: 10_000 }],
      });
    }
    sim.advance(2 * 60);
    expect(growGoals(sim.state).europe).toBe(true);
    expect(playerRank(sim.state).title).toBe('Europa');
    expect(playerRank(sim.state).score).toBe(80);
  });
});

describe('Geld, Pacht und Europa (Review zu Auftrag 42)', () => {
  /** Eine gepachtete Finca mit Arbeitern und Gärtner, die Pflanzung des Vorbesitzers steht. */
  function leased(sim: Simulation) {
    sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } });
    const finca = getFincas(sim.state)[0];
    sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) } });
    return finca;
  }

  it('eine Finca kommt mit stehender Pflanzung: die erste Ernte nach drei Wochen', () => {
    const sim = openGame();
    const events = recordEvents(sim);
    const finca = leased(sim);
    expect(finca.crop?.productId).toBe('weed');
    settle(sim, STANDING_CROP_DAYS * DAY + 2 * 60);
    expect(eventsOfType(events, 'grow.harvested')).toHaveLength(1);
  });

  it('Pacht nur mit sauberem Geld: erst eine Warnung, nach LEASE_LOST_DAYS ist das Land weg', () => {
    const sim = openGame();
    const finca = leased(sim);
    sim.state.wallet.clean = 0;
    sim.state.wallet.dirty = 5_000_000;
    // Die erste Woche ist vorab bezahlt, danach fehlt die Pacht jeden Tag.
    settle(sim, (7 + LEASE_LOST_DAYS + 1) * DAY);
    // Schwarzgeld zahlt keine Pacht.
    expect(getFincas(sim.state)).toHaveLength(0);
    expect(sim.state.messages.list.some((m) => m.contactId === 'grow:kolumbien' && m.text.includes('Verpächter'))).toBe(
      true,
    );
    // Die Leute dort sind gegangen und stehen nicht bei den Ehemaligen.
    for (const id of finca.workerIds) expect(getStaffMember(sim.state, id)).toBeUndefined();
    expect(sim.state.modules.staff.former.some((m) => finca.workerIds.includes(m.id))).toBe(false);
  });

  it('ohne Geld für Löhne arbeitet niemand (der Tag fehlt der Ernte); ohne Geld für Dünger wird später gesät', () => {
    const sim = openGame();
    const finca = leased(sim);
    sim.state.wallet.clean = 0;
    sim.state.wallet.dirty = 0;
    settle(sim, DAY + 60);
    const now = getFincas(sim.state)[0];
    expect(now.unpaidWages).toBe(true);
    expect(fincaWorkers(sim.state, now)).toBe(0);
    expect(now.crop?.loss ?? 0).toBeGreaterThan(0);
    // Geld zurück, bevor das Land weg ist: Löhne laufen wieder.
    sim.state.wallet.clean = 5_000_000;
    settle(sim, DAY);
    expect(getFincas(sim.state)[0].unpaidWages).toBe(false);
    expect(fincaWorkers(sim.state, getFincas(sim.state)[0])).toBe(workersNeeded(finca));
    // Ernte, dann ohne Geld keine neue Aussaat (der Gärtner sagt es einmal), mit Geld am nächsten Tag doch.
    const until = (getFincas(sim.state)[0].crop?.readyAt ?? 0) - sim.state.time;
    settle(sim, until - 60);
    sim.state.wallet.clean = 0;
    sim.state.wallet.dirty = 0;
    settle(sim, 2 * 60);
    expect(getFincas(sim.state)[0].crop).toBeNull();
    expect(getFincas(sim.state)[0].stalled).toBe(true);
    sim.state.wallet.clean = 5_000_000;
    settle(sim, DAY);
    expect(getFincas(sim.state)[0].crop).not.toBeNull();
    expect(getFincas(sim.state)[0].stalled).toBe(false);
  }, 30_000);

  it('Europa zählt nur Waren, die man anbauen kann: Laborware (Edibles, Öl, Vapes) ändert nichts', () => {
    const sim = openGame();
    const ctx = sim.ctx('test');
    const customer = sim.state.modules.trade.customers[0];
    const deliver = (items: { productId: string; amount: number; own: number }[]) =>
      ctx.emit('trade.delivered', {
        orderId: 0,
        customerId: customer.id,
        amount: items.reduce((s, i) => s + i.amount, 0),
        revenue: 1,
        late: false,
        ownAmount: items.reduce((s, i) => s + i.own, 0),
        items,
      });
    // 6 kg eigenes Gras und 10 kg zugekaufte Edibles: nach Gramm nur 37 % eigen, beim Anbau aber 100 %.
    deliver([
      { productId: 'weed', amount: 6_000, own: 6_000 },
      { productId: 'edibles', amount: 10_000, own: 0 },
    ]);
    sim.advance(60);
    expect(europeProgress(sim.state).missing).not.toContain(customer.name);
    expect(goalShares(sim.state).share).toBeLessThan(0.5);
    // Nur Laborware: nichts zum Anbauen, gilt als versorgt.
    const other = sim.state.modules.trade.customers[1];
    ctx.emit('trade.delivered', {
      orderId: 0,
      customerId: other.id,
      amount: 3_000,
      revenue: 1,
      late: false,
      ownAmount: 0,
      items: [{ productId: 'oil', amount: 3_000, own: 0 }],
    });
    sim.advance(60);
    expect(europeProgress(sim.state).missing).not.toContain(other.name);
  });

  it('Arbeiter und Gärtner werden weder Leutnant noch Rechte Hand', () => {
    const sim = openGame();
    const finca = leased(sim);
    const id = finca.workerIds[0];
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: id, spotIds: [] } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: id } }).ok).toBe(false);
  });
});

describe('Hafen-Phase: der Ruf erholt sich (Review zu Auftrag 42)', () => {
  it('jeden Montag rückt die Pünktlichkeit 30 % zurück Richtung Startwert, nie darüber hinaus', () => {
    const sim = soldGame();
    const trade = sim.state.modules.trade;
    trade.reliability = 0.2;
    placeOrders(sim.ctx('test'));
    expect(trade.reliability).toBeCloseTo(0.395, 3);
    trade.reliability = 0.9;
    placeOrders(sim.ctx('test'));
    expect(trade.reliability).toBe(0.9);
  });
});

describe('Spielstände (Auftrag 42)', () => {
  it('alte Stände: trade bekommt Ausfuhrlager und Zähler der eigenen Ware (Version 3), grow wird frisch angelegt', () => {
    const sim = soldGame();
    const old = JSON.parse(JSON.stringify(sim.state));
    delete old.modules.trade.origins;
    delete old.modules.trade.stats.deliveredGrams;
    delete old.modules.trade.stats.ownDelivered;
    old.moduleVersions.trade = 2;
    delete old.modules.grow;
    delete old.moduleVersions.grow;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.trade).toBe(4);
    expect(loaded.state.modules.trade.origins).toEqual({});
    expect(loaded.state.modules.trade.stats.deliveredGrams).toBe(0);
    expect(loaded.state.modules.trade.stats.ownDelivered).toBe(0);
    // Was vorher da war, bleibt.
    expect(loaded.state.modules.trade.customers).toEqual(sim.state.modules.trade.customers);
    expect(loaded.state.modules.grow.startedAt).toBeNull();
    expect(loaded.state.modules.grow.fincas).toEqual([]);
  });

  it('grow Version 1: Fincas ohne Schulden, Lieferungen zählen ganz als Anbau-Ware (Version 2)', () => {
    const sim = openGame();
    expect(sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'san-isidro' } }).ok).toBe(true);
    const old = JSON.parse(JSON.stringify(sim.state));
    for (const f of old.modules.grow.fincas) {
      delete f.unpaidLease;
      delete f.unpaidWages;
      delete f.stalled;
    }
    old.modules.grow.deliveries = [{ at: sim.state.time, grams: 5_000, own: 2_000, customerId: 'amsterdam' }];
    old.moduleVersions.grow = 1;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.grow).toBe(2);
    const finca = loaded.state.modules.grow.fincas[0];
    expect(finca.unpaidLease).toBe(0);
    expect(finca.unpaidWages).toBe(false);
    expect(finca.stalled).toBe(false);
    expect(finca.siteId).toBe('san-isidro');
    expect(loaded.state.modules.grow.deliveries[0]).toMatchObject({
      grams: 5_000,
      own: 2_000,
      crop: 5_000,
      cropOwn: 2_000,
    });
  });
});

describe('Geld und Meldungen in der Produktion (Auftrag 43)', () => {
  it('Löhne zahlt man vor Ort bar (schwarz), die Pacht sauber; ohne Arbeiter fällt die Ernte aus', () => {
    const sim = openGame(7);
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'el-tigre' } }).ok).toBe(true);
    const finca = getFincas(sim.state)[0];
    expect(
      sim.dispatch({ type: 'grow.hire', payload: { fincaId: finca.id, role: 'worker', count: workersNeeded(finca) } })
        .ok,
    ).toBe(true);
    const wages = eventsOfType(events, 'wallet.changed');
    settle(sim, 3 * DAY);
    const paid = eventsOfType(events, 'wallet.changed').slice(wages.length);
    const wagePays = paid.filter((e) => e.payload.reason.startsWith('Löhne'));
    const leasePays = paid.filter((e) => e.payload.reason.startsWith('Pacht'));
    expect(wagePays.length).toBeGreaterThan(0);
    expect(wagePays.every((e) => e.payload.kind === 'dirty')).toBe(true);
    expect(leasePays.every((e) => e.payload.kind === 'clean')).toBe(true);
    // Eine zweite Finca ohne Arbeiter: Die Ernte fällt aus, das Ereignis sagt es (0 g).
    expect(sim.dispatch({ type: 'grow.leaseFinca', payload: { siteId: 'san-isidro' } }).ok).toBe(true);
    const empty = getFincas(sim.state).find((f) => f.siteId === 'san-isidro');
    if (!empty) throw new Error('keine zweite Finca');
    settle(sim, 40 * DAY);
    const harvests = eventsOfType(events, 'grow.harvested').filter((e) => e.payload.fincaId === empty.id);
    expect(harvests.length).toBeGreaterThan(0);
    expect(harvests[0].payload.grams).toBe(0);
  });
});
