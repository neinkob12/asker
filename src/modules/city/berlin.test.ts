// Berlin als dritte Stadt (Auftrag 37): Daten nach der Checkliste, der Dreh „die Nacht“ als Daten, alte Spielstände.

import { describe, expect, it } from 'vitest';
import { clock, loadSimulation } from '../../core';
import { createTestGame } from '../../core/testing';
import { CITY_EVENTS } from '../events';
import { GANG_RIVALRY, getGangStatus, getGangs } from '../gangs';
import { store, warehouseSites } from '../goods';
import { roadRoute } from '../roads';
import { getAllSpots, isSpotOpen, nextSpotOpening, spotCity, spotHoursLabel } from '../spots';
import { getSupplier, isUnlocked, packagePrice } from '../suppliers';
import { controllerOf, PLAYER_FACTION } from '../territory';
import { allVeedel, neighborsOf } from '../veedel';
import { CITY_OFFERS, START_MONEY_MIN_BY_CITY } from './config';
import { cityAt, getCity, playableCities } from './index';

describe('Berlin (Auftrag 37)', () => {
  it('ist spielbar: zwölf Ortsteile, vier Gangs, jeder Ortsteil gehört zu Beginn einer Berliner Gang', () => {
    const sim = createTestGame();
    const berlin = getCity('berlin');
    expect(berlin?.template).toBeUndefined();
    expect(playableCities().map((c) => c.id)).toContain('berlin');
    expect(berlin?.roadsNetworkId).toBe('berlin');
    expect(CITY_OFFERS.berlin.welcome.length).toBeGreaterThan(1);
    expect(START_MONEY_MIN_BY_CITY.berlin).toBeGreaterThan(0);
    const veedel = allVeedel('berlin');
    expect(veedel).toHaveLength(12);
    const gangs = getGangs(sim.state, 'berlin');
    expect(gangs).toHaveLength(4);
    const owners = new Set<string>();
    for (const v of veedel) {
      expect(cityAt(v.center.lng, v.center.lat), v.id).toBe('berlin');
      const owner = controllerOf(sim.state, v.id);
      expect(owner && gangs.some((g) => g.id === owner), v.id).toBe(true);
      owners.add(owner as string);
      // Alle Ortsteile hängen zusammen (Grenzen oder Verbindungen).
      expect(neighborsOf(v.id).length, v.id).toBeGreaterThan(0);
    }
    expect(owners.size).toBe(4);
    // Jedes Paar Berliner Gangs hat ein Verhältnis (Auftrag 34).
    for (const a of gangs)
      for (const b of gangs) if (a.id < b.id) expect(GANG_RIVALRY[`${a.id}|${b.id}`]).toBeDefined();
  });

  it('die Gangs sind die stärksten bisher: mehr Kampfkraft und Leute als in Köln und Hamburg', () => {
    const sim = createTestGame();
    const avg = (city: string, f: (g: ReturnType<typeof getGangs>[number]) => number) =>
      getGangs(sim.state, city).reduce((s, g) => s + f(g), 0) / getGangs(sim.state, city).length;
    for (const city of ['koeln', 'hamburg']) {
      expect(avg('berlin', (g) => g.traits.fighting)).toBeGreaterThan(avg(city, (g) => g.traits.fighting));
      expect(avg('berlin', (g) => g.traits.start.people)).toBeGreaterThan(avg(city, (g) => g.traits.start.people));
    }
  });

  it('viele Spots: in jedem Ortsteil mindestens zwei, alle zum Freischalten, Lager zum Kaufen', () => {
    const sim = createTestGame();
    const spots = getAllSpots(sim.state).filter((s) => spotCity(s) === 'berlin');
    expect(spots.length).toBeGreaterThanOrEqual(36);
    for (const v of allVeedel('berlin')) {
      expect(spots.filter((s) => s.veedelId === v.id).length, v.id).toBeGreaterThanOrEqual(2);
    }
    for (const s of spots) expect(s.unlockCost ?? 0, s.id).toBeGreaterThan(0);
    const sites = warehouseSites('berlin');
    expect(sites.length).toBeGreaterThanOrEqual(5);
    for (const w of sites) expect(w.cost, w.id).toBeGreaterThan(0);
    // Wege zwischen Lager und Spot gehen über das Berliner Straßennetz.
    const route = roadRoute(sites[0], spots[0]);
    expect(route.onRoads).toBe(true);
  });

  it('Clubs haben nur von Freitag 22 Uhr bis Montag 8 Uhr offen', () => {
    const sim = createTestGame();
    const clubs = getAllSpots(sim.state).filter((s) => s.weekHours);
    expect(clubs.length).toBeGreaterThanOrEqual(3);
    for (const c of clubs) expect(spotCity(c), c.id).toBe('berlin');
    const club = clubs[0];
    expect(club.weekHours).toEqual([4 * 24 + 22, 8]);
    // Einen Montag finden (Wochentag 0) und die Woche abgehen.
    let monday = 0;
    while (clock.weekday(monday) !== 0) monday += 24 * 60;
    const at = (weekday: number, hour: number) => monday + weekday * 24 * 60 + hour * 60;
    expect(isSpotOpen(club, at(0, 7))).toBe(true); // Montag 7 Uhr: noch offen
    expect(isSpotOpen(club, at(0, 8))).toBe(false); // Montag 8 Uhr: zu
    expect(isSpotOpen(club, at(2, 23))).toBe(false); // Mittwochnacht: zu
    expect(isSpotOpen(club, at(4, 21))).toBe(false); // Freitag 21 Uhr: noch zu
    expect(isSpotOpen(club, at(4, 22))).toBe(true); // Freitag 22 Uhr: auf
    expect(isSpotOpen(club, at(5, 12))).toBe(true); // Samstagmittag: durchgehend
    expect(isSpotOpen(club, at(6, 4))).toBe(true);
    expect(nextSpotOpening(club, at(2, 10) + 17)).toBe(at(4, 22));
    expect(nextSpotOpening(club, at(5, 3))).toBe(at(5, 3));
    expect(spotHoursLabel(club)).toBe('Fr 22 – Mo 8 Uhr');
  });

  it('Stammkunden eines Clubs kommen erst, wenn er offen hat (nicht am Mittwochnachmittag)', () => {
    const sim = createTestGame();
    sim.state.modules.customers.directOrders = false;
    sim.state.wallet.dirty = 50_000;
    sim.state.wallet.clean = 20_000;
    sim.dispatch({ type: 'city.unlock', payload: { cityId: 'berlin' } }, { actor: 'system' });
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'berlin' } }).ok).toBe(true);
    sim.state.modules.city.present = 'berlin';
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'keller-friedrichshain' } }).ok).toBe(
      true,
    );
    store(sim.ctx('goods'), { productId: 'weed', amount: 500, warehouseId: 'keller-friedrichshain', quality: 0.8 });
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'club-halle-ost' } }).ok).toBe(true);
    // Spieltag 1 ist ein Freitag, Tag 6 also Mittwoch, Tag 8 Freitag.
    const wednesday = clock.at(6, 14);
    const friday = clock.at(8, 22);
    sim.state.time = wednesday - 30;
    const customers = sim.state.modules.customers;
    for (const key of Object.keys(customers.nextSpawnAt)) customers.nextSpawnAt[key] = Infinity;
    customers.regulars.push({
      id: 'regular-club',
      name: 'Stammgast',
      typeId: 'party',
      spotId: 'club-halle-ost',
      productId: 'weed',
      amount: 2,
      visits: 3,
      lastPrice: 10,
      lastQuality: 0.8,
      satisfaction: 0.9,
      since: 0,
      nextVisitAt: wednesday,
      status: 'active',
    });
    sim.advance(90);
    const regular = () => customers.regulars.find((r) => r.id === 'regular-club');
    expect(customers.waiting.some((c) => c.regularId === 'regular-club')).toBe(false);
    expect(regular()?.nextVisitAt).toBe(friday + 30);
    for (const key of Object.keys(customers.nextSpawnAt)) customers.nextSpawnAt[key] = Infinity;
    sim.advance(friday + 31 - sim.state.time);
    // Freitagnacht: Er kommt (wartet am Club oder hat schon gekauft und plant den nächsten Besuch).
    expect(
      customers.waiting.some((c) => c.regularId === 'regular-club') || (regular()?.nextVisitAt ?? 0) > friday + 30,
    ).toBe(true);
  });

  it('die Nacht: viel Nachtleben, die Polizei lockerer als in Köln', () => {
    const veedel = allVeedel('berlin');
    const mean = (
      list: readonly { policePresence: number; nightlife?: number }[],
      f: (v: (typeof list)[number]) => number,
    ) => list.reduce((s, v) => s + f(v), 0) / list.length;
    const koeln = allVeedel('koeln');
    expect(mean(veedel, (v) => v.nightlife ?? 1)).toBeGreaterThan(mean(koeln, (v) => v.nightlife ?? 1) + 0.3);
    expect(mean(veedel, (v) => v.policePresence)).toBeLessThan(mean(koeln, (v) => v.policePresence));
    const city = getCity('berlin');
    expect(city?.propertyFactor).toBeLessThan(getCity('hamburg')?.propertyFactor ?? 0);
  });

  it('Events: Fête de la Musique, CSD und Silvester am Brandenburger Tor, nur in Berliner Ortsteilen', () => {
    const ids = CITY_EVENTS.filter((e) => e.cityId === 'berlin').map((e) => e.id);
    expect(ids).toEqual(expect.arrayContaining(['fete', 'csd', 'silvester']));
    for (const e of CITY_EVENTS.filter((ev) => ev.cityId === 'berlin')) {
      for (const v of e.area.veedel ?? [])
        expect(
          allVeedel('berlin').some((x) => x.id === v),
          `${e.id}:${v}`,
        ).toBe(true);
    }
  });

  it('Mirko ist hier zu Hause: in Berlin billiger und schneller, beim ersten Betreten ohne Vermittlung dabei', () => {
    const sim = createTestGame();
    const mirko = getSupplier(sim.state, 'berlin');
    expect(mirko?.cities).toContain('berlin');
    expect(mirko?.priceFactors?.berlin).toBeLessThan(1);
    expect(mirko?.deliveryTimes?.berlin).toBeLessThan(mirko?.deliveryTime ?? 0);
    expect(isUnlocked(sim.state, 'berlin')).toBe(false);
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'berlin' } }, { actor: 'system' }).ok).toBe(true);
    expect(isUnlocked(sim.state, 'berlin')).toBe(true);
    expect(packagePrice(sim.state, 'berlin', 'haze50', 'berlin')).toBeLessThan(
      packagePrice(sim.state, 'berlin', 'haze50', 'koeln'),
    );
    // Hein bleibt der Hamburger: Berlin schaltet ihn nicht frei.
    expect(isUnlocked(sim.state, 'hamburg')).toBe(false);
  });

  it('alte Spielstände ohne Berlin bekommen Ortsteile und Gangs wie bei einem neuen Spiel', () => {
    const sim = createTestGame({ seed: 3 });
    const fresh = JSON.parse(JSON.stringify(sim.state));
    const old = JSON.parse(JSON.stringify(sim.state));
    const gangs = old.modules.gangs.gangs as Record<string, unknown>;
    for (const id of Object.keys(gangs)) if (id.startsWith('be-')) delete gangs[id];
    old.moduleVersions.gangs = 5;
    for (const v of allVeedel('berlin')) {
      delete old.modules.territory.influence[v.id];
      delete old.modules.territory.controller[v.id];
    }
    old.moduleVersions.territory = 4;
    const loaded = loadSimulation(old as never, sim.modules);
    expect(loaded.state.moduleVersions.gangs).toBeGreaterThanOrEqual(6);
    expect(loaded.state.moduleVersions.territory).toBeGreaterThanOrEqual(5);
    expect(getGangStatus(loaded.state, 'be-kotti')?.people).toBeGreaterThan(0);
    for (const v of allVeedel('berlin')) {
      expect(loaded.state.modules.territory.influence[v.id], v.id).toEqual(fresh.modules.territory.influence[v.id]);
      expect(controllerOf(loaded.state, v.id), v.id).not.toBe(PLAYER_FACTION);
    }
    // Köln bleibt, wie es war.
    expect(loaded.state.modules.territory.influence.kalk).toEqual(fresh.modules.territory.influence.kalk);
  });
});
