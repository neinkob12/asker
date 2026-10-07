// Fehler aus der Code-Review zu den Städten (Auftrag 30): Leutnants führen nur in ihrer Stadt, die Rechte Hand prüft den
// Bestand der Stadt des Auftrags, der Tagesbericht zählt nur ihre Stadt, Bestellregeln nehmen kein Lager aus einer
// anderen Stadt, und die schnellen Abfragen nach Leutnants hängen nicht von der Reihenfolge ab.

import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY, type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { getOrders, offerDelivery } from '../customers';
import { getStock, store } from '../goods';
import { changeReputation } from '../reputation';
import { enlist, generateProfile, invalidateStaffIndex, type StaffMember, type StaffRole, setStatus } from '../staff';
import { getSuppliers } from '../suppliers';
import { RIGHT_HAND_RANK_XP } from './config';
import {
  buildReport,
  checkSpots,
  getPost,
  getRightHand,
  isVeedelHidden,
  lieutenantOfSpot,
  ruleWarehouse,
  teamLeadOf,
} from './index';
import type { LieutenantPost, OrderRule } from './types';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.suppliers.unlocked = getSuppliers(sim.state).map((s) => s.id);
  sim.state.modules.customers.directOrders = false;
  sim.state.wallet.dirty = 40000;
  // Zwei Hamburger Spots sind offen, dazu ein Hamburger Lager (ohne den Weg dorthin zu spielen).
  sim.state.modules.spots.unlocked.push('hansaplatz', 'lange-reihe');
  sim.state.modules.goods.owned.push('keller-st-georg');
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 2, cityId = 'koeln'): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = 80;
  member.stats.caution = 90;
  member.cityId = cityId;
  invalidateStaffIndex();
  return member;
}

function rule(patch: Partial<OrderRule> = {}): OrderRule {
  return {
    id: 'r1',
    productId: 'weed',
    supplierId: null,
    packageId: null,
    minStock: 100,
    warehouseId: null,
    paused: null,
    ...patch,
  };
}

describe('Leutnants führen nur in ihrer Stadt', () => {
  it('ein Kölner Läufer bekommt keine Hamburger Spots, auch nicht gemischt', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner');
    const direct = checkSpots(sim.state, m.id, ['hansaplatz']);
    expect(direct.ok).toBe(false);
    expect(!direct.ok && direct.reason).toMatch(/Hamburg/);
    expect(checkSpots(sim.state, m.id, ['uni', 'hansaplatz']).ok).toBe(false);
    const result = sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: ['hansaplatz'] } });
    expect(result.ok).toBe(false);
    expect(getPost(sim.state, m.id)).toBeUndefined();
    expect(m.assignment).toBeNull();
  });

  it('ein Hamburger Läufer führt Hamburger Spots, aber keine Kölner und keine aus beiden Städten', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', 2, 'hamburg');
    expect(checkSpots(sim.state, m.id, ['uni']).ok).toBe(false);
    expect(checkSpots(sim.state, m.id, ['hansaplatz', 'uni']).ok).toBe(false);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: ['hansaplatz'] } }).ok).toBe(
      true,
    );
    expect(getPost(sim.state, m.id)?.spotIds).toEqual(['hansaplatz']);
    // Auch später (Spots ändern) bleibt es bei der Stadt.
    const wrong = sim.dispatch({
      type: 'hierarchy.setSpots',
      payload: { staffId: m.id, spotIds: ['hansaplatz', 'uni'] },
    });
    expect(wrong.ok).toBe(false);
    expect(getPost(sim.state, m.id)?.spotIds).toEqual(['hansaplatz']);
    expect(
      sim.dispatch({ type: 'hierarchy.setSpots', payload: { staffId: m.id, spotIds: ['hansaplatz', 'lange-reihe'] } })
        .ok,
    ).toBe(true);
  });

  it('ein Kölner Leutnant führt weiter Kölner Spots (kein Rückschritt)', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner');
    const result = sim.dispatch({
      type: 'hierarchy.appoint',
      payload: { staffId: m.id, spotIds: ['uni', 'neumarkt'] },
    });
    expect(result.ok).toBe(true);
  });
});

describe('Bestellregeln und Städte', () => {
  it('ruleWarehouse ignoriert ein Lager aus einer anderen Stadt', () => {
    const sim = quietGame();
    const koelnRule = rule({ warehouseId: 'ehrenfeld' });
    // Heimat-Lager in Hamburg: das Kölner Lager der Regel zählt nicht.
    expect(ruleWarehouse(sim.state, koelnRule, 'keller-st-georg')).toBe('keller-st-georg');
    expect(ruleWarehouse(sim.state, koelnRule, null, 'hamburg')).toBeNull();
    // Gleiche Stadt: das gewählte Lager bleibt.
    expect(ruleWarehouse(sim.state, koelnRule, 'ehrenfeld')).toBe('ehrenfeld');
    expect(ruleWarehouse(sim.state, koelnRule, null, 'koeln')).toBe('ehrenfeld');
    expect(ruleWarehouse(sim.state, koelnRule, null)).toBe('ehrenfeld');
    expect(ruleWarehouse(sim.state, rule({ warehouseId: 'keller-st-georg' }), 'ehrenfeld')).toBe('ehrenfeld');
  });

  it('die Vorlage nimmt das Lager nur in dieselbe Stadt mit', () => {
    const sim = quietGame();
    const first = recruit(sim, 'runner');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: first.id, spotIds: ['uni'] } });
    const set = sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: first.id, settings: { orderRules: [rule({ warehouseId: 'ehrenfeld' })] } },
    });
    expect(set.ok).toBe(true);
    expect(sim.state.modules.hierarchy.orderTemplate?.[0].warehouseId).toBe('ehrenfeld');

    const hamburger = recruit(sim, 'runner', 2, 'hamburg');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: hamburger.id, spotIds: ['hansaplatz'] } });
    expect(getPost(sim.state, hamburger.id)?.settings.orderRules[0].warehouseId).toBeNull();

    const second = recruit(sim, 'runner');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: second.id, spotIds: ['neumarkt'] } });
    expect(getPost(sim.state, second.id)?.settings.orderRules[0].warehouseId).toBe('ehrenfeld');
  });

  it('ein Hamburger Leutnant wählt kein Kölner Lager, ein Hamburger schon', () => {
    const sim = quietGame();
    const m = recruit(sim, 'runner', 2, 'hamburg');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: ['hansaplatz'] } });
    const koeln = sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: m.id, settings: { orderRules: [rule({ warehouseId: 'ehrenfeld' })] } },
    });
    expect(koeln.ok).toBe(false);
    expect(!koeln.ok && koeln.reason).toMatch(/andere[nr]? Stadt/);
    const hamburg = sim.dispatch({
      type: 'hierarchy.configure',
      payload: { staffId: m.id, settings: { orderRules: [rule({ warehouseId: 'keller-st-georg' })] } },
    });
    expect(hamburg.ok).toBe(true);
  });
});

describe('Rechte Hand: Aufträge und Bestand der Stadt des Auftrags', () => {
  it('Eine Hamburger Anfrage fasst die Kölner Rechte Hand nicht an (Auftrag 43, G1)', () => {
    const sim = quietGame();
    const a = recruit(sim, 'runner');
    const b = recruit(sim, 'runner');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: a.id, spotIds: ['uni'] } });
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: b.id, spotIds: ['neumarkt'] } });
    const boss = recruit(sim, 'runner', 4);
    expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
    const post = getRightHand(sim.state);
    if (!post) throw new Error('keine Rechte Hand');
    post.xp = RIGHT_HAND_RANK_XP[1];
    sim.dispatch({
      type: 'hierarchy.configureRightHand',
      payload: { settings: { orders: true, orderMaxPrice: 100000 } },
    });
    changeReputation(sim.ctx('test'), 40);
    store(sim.ctx('goods'), { productId: 'weed', amount: 500 });
    const order = offerDelivery(sim.ctx('customers'), true);
    if (!order) throw new Error('keine Bestellung');
    // Die Anfrage kommt aus Hamburg, wo kein Gramm liegt (in Köln reicht der Bestand).
    order.lng = 9.9637;
    order.lat = 53.5496;
    order.productId = 'weed';
    order.amount = 50;
    order.expiresAt = sim.state.time + 600;
    expect(getStock(sim.state, { productId: 'weed', cityId: 'hamburg' })).toBe(0);
    expect(getStock(sim.state, { productId: 'weed', cityId: 'koeln' })).toBeGreaterThanOrEqual(50);
    sim.advance(5);
    expect(getOrders(sim.state, { status: 'offered' }).map((o) => o.id)).toContain(order.id);
    expect(post.passed).not.toContain(order.id);
    expect(post.done.leftToBoss).toBe(0);
    // Auch kurz vor Fristende: Die Anfrage gehört nach Hamburg, sie fährt nicht hin und gibt sie nicht ab.
    order.expiresAt = sim.state.time + 10;
    sim.advance(5);
    expect(post.passed).not.toContain(order.id);
    // Und schicken lässt sie sich auch nicht: In Hamburg gibt es keine Rechte Hand.
    store(sim.ctx('goods'), { productId: 'weed', amount: 100, warehouseId: 'werkstatt-ottensen' });
    expect(sim.dispatch({ type: 'customers.acceptOrder', payload: { orderId: order.id, by: 'rightHand' } })).toEqual({
      ok: false,
      reason: 'In Hamburg hast du keine Rechte Hand, die ausfahren könnte.',
    });
  });
});

describe('Tagesbericht pro Stadt', () => {
  function reportGame(): Simulation {
    const sim = quietGame();
    const ctx = sim.ctx('test');
    wallet.earn(ctx, 5000, 'dirty', 'Verkauf in Köln', { category: 'income.other', cityId: 'koeln' });
    wallet.earn(ctx, 300, 'dirty', 'Verkauf in Hamburg', { category: 'income.other', cityId: 'hamburg' });
    sim.advance(MINUTES_PER_DAY);
    return sim;
  }

  it('zählt Umsatz und Gewinn nur der angefragten Stadt, auch ohne Vollmacht', () => {
    const sim = reportGame();
    const hamburg = buildReport(sim.state, 'hamburg');
    const koeln = buildReport(sim.state, 'koeln');
    expect(hamburg.revenue).toBe(300);
    expect(koeln.revenue).toBeGreaterThanOrEqual(5000);
    expect(koeln.revenue).toBeLessThan(5300);
    expect(hamburg.day).toBe(koeln.day);
  });

  it('meldet nur Ausfälle aus der eigenen Stadt', () => {
    const sim = reportGame();
    const away = recruit(sim, 'runner', 1, 'koeln');
    setStatus(sim.ctx('staff'), away.id, 'jailed');
    sim.advance(1);
    expect(buildReport(sim.state, 'koeln').advice.join(' ')).toMatch(/fällt aus|fallen aus/);
    expect(buildReport(sim.state, 'hamburg').advice.join(' ')).not.toMatch(/fällt aus|fallen aus/);
  });
});

describe('Abfragen nach Leutnants ohne Sortieren', () => {
  /** Ein Posten wie ein echter, mit eigener ID und eigenen Spots. */
  function post(staffId: string, patch: Partial<LieutenantPost>): LieutenantPost {
    const sim = quietGame();
    const base = recruit(sim, 'runner');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: base.id, spotIds: ['uni'] } });
    const template = getPost(sim.state, base.id) as LieutenantPost;
    return { ...structuredClone(template), staffId, spotIds: [], team: [], lyingLow: [], ...patch };
  }

  it('bei doppelt vergebenen Spots (defekter Stand) gewinnt die kleinste ID, egal in welcher Reihenfolge sie stehen', () => {
    const sim = quietGame();
    const zed = post('zed', { spotIds: ['uni'] });
    const abe = post('abe', { spotIds: ['uni', 'neumarkt'], lyingLow: ['testveedel'] });
    sim.state.modules.hierarchy.posts = { zed, abe };
    expect(lieutenantOfSpot(sim.state, 'uni')).toBe('abe');
    expect(lieutenantOfSpot(sim.state, 'neumarkt')).toBe('abe');
    expect(lieutenantOfSpot(sim.state, 'nirgendwo')).toBeNull();
    expect(isVeedelHidden(sim.state, 'testveedel')).toBe(true);
    expect(isVeedelHidden(sim.state, 'anderes-veedel')).toBe(false);
    // Andere Reihenfolge der Schlüssel, gleiches Ergebnis.
    sim.state.modules.hierarchy.posts = { abe, zed };
    expect(lieutenantOfSpot(sim.state, 'uni')).toBe('abe');
  });

  it('teamLeadOf findet den Leutnant, in dessen Team die Person steht', () => {
    const sim = quietGame();
    const lead = recruit(sim, 'runner');
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lead.id, spotIds: ['uni'] } });
    const hand = recruit(sim, 'runner', 1);
    expect(teamLeadOf(sim.state, hand.id)).toBeNull();
    getPost(sim.state, lead.id)?.team.push(hand.id);
    expect(teamLeadOf(sim.state, hand.id)).toBe(lead.id);
  });
});
