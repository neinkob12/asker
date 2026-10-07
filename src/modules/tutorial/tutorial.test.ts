import { describe, expect, it } from 'vitest';
import { type GameState, loadSimulation, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { DEFAULT_WAREHOUSE, getStock, store, warehouseCapacity } from '../goods';
import { getLieutenants } from '../hierarchy';
import { hasBerth } from '../logistics';
import { currentQuest, PETER as QUEST_PETER, questsSuppressed } from '../quests';
import { getAllSpots, getSpots, isSpotActive, lockedSpots, spotCity } from '../spots';
import { enlist, generateProfile, getStaff, type StaffMember } from '../staff';
import { getRelation, getSuppliers } from '../suppliers';
import { addInfluence, controlledBy, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { FEATURE_STAGE, type TutorialFeature } from './config';
import {
  currentMission,
  LAST_STAGE,
  MISSIONS,
  missionProgress,
  PETER,
  scriptedDone,
  tutorialActive,
  tutorialAllows,
  tutorialAllowsRole,
  tutorialEnabled,
  tutorialFinished,
  tutorialSpotCost,
  tutorialSpotOpen,
  tutorialStage,
  tutorialSupplierOpen,
} from './index';

const KOELN = (s: GameState) => getSpots(s, 'koeln').map((x) => x.id);

function start(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  const result = sim.dispatch({ type: 'tutorial.start', payload: {} });
  if (!result.ok) throw new Error(result.reason);
  return sim;
}

/** Wie der Dev-Haken: auf Stufe n springen, Missionen davor gelten als erledigt. */
function jump(sim: Simulation, stage: number): void {
  const t = sim.state.modules.tutorial;
  t.stage = stage;
  t.mission = null;
  t.done = MISSIONS.filter((m) => m.stage < stage).map((m) => m.id);
  sim.advance(5);
}

function sale(sim: Simulation, sellerId: string | null = null, productId = 'weed', amount = 2, revenue = 40): void {
  sim.ctx('customers').emit('sale.completed', {
    channel: 'street',
    spotId: 'neumarkt',
    veedelId: 'ehrenfeld',
    productId,
    amount,
    quality: 0.6,
    revenue,
    sellerId,
    customerId: null,
  });
  sim.advance(1);
}

function recruit(sim: Simulation, role: 'runner' = 'runner', level = 1): StaffMember {
  const ctx = sim.ctx('staff');
  const m = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  m.stats.loyalty = 70;
  return m;
}

/** Die ersten n Kölner Veedel gehören dir. */
function takeVeedel(sim: Simulation, n: number): void {
  const ctx = sim.ctx('territory');
  for (const v of allVeedel('koeln').slice(0, n)) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.advance(1);
}

describe('tutorial: Start und Stufen', () => {
  it('ist in einem neuen Spiel aus und ändert dann nichts (gleiche Würfelfolge wie ohne das Modul)', () => {
    const withModule = createTestGame({ seed: 3 });
    const without = createTestGame({
      seed: 3,
      modules: withModule.modules.filter((m) => m.id !== 'tutorial'),
    });
    expect(tutorialEnabled(withModule.state)).toBe(false);
    expect(tutorialActive(withModule.state)).toBe(false);
    expect(tutorialAllows(withModule.state, 'app.finance')).toBe(true);
    withModule.advance(2 * 24 * 60);
    without.advance(2 * 24 * 60);
    const strip = (s: GameState) => {
      const copy = structuredClone(s);
      Reflect.deleteProperty(copy.modules, 'tutorial');
      Reflect.deleteProperty(copy.moduleVersions, 'tutorial');
      return copy;
    };
    expect(strip(withModule.state)).toEqual(strip(without.state));
    // Die vier Start-Spots offen, Peter schickt Quests.
    expect(KOELN(withModule.state).sort()).toEqual(['ebertplatz', 'neumarkt', 'uni', 'zuelpicher']);
    expect(currentQuest(withModule.state)).not.toBeNull();
  });

  it('startet mit 700 € mehr, nur dem Neumarkt und ohne Quests', () => {
    const sim = start();
    expect(tutorialEnabled(sim.state)).toBe(true);
    expect(tutorialStage(sim.state)).toBe(0);
    expect(wallet.balance(sim.state, 'dirty')).toBe(2200);
    expect(KOELN(sim.state)).toEqual(['neumarkt']);
    // Ebertplatz und Zülpicher Platz sind weder offen noch zu haben (lockedSpots zeigt nur, was die Stufe erlaubt).
    expect(lockedSpots(sim.state).filter((s) => spotCity(s) === 'koeln')).toEqual([]);
    expect(
      getAllSpots(sim.state)
        .filter((s) => spotCity(s) === 'koeln')
        .map((s) => s.id),
    ).toEqual(['neumarkt']);
    expect(sim.dispatch({ type: 'tutorial.start', payload: {} }).ok).toBe(false);
    sim.advance(60);
    expect(questsSuppressed(sim.state)).toBe(true);
    expect(currentQuest(sim.state)).toBeNull();
    expect(messages.thread(sim.state, QUEST_PETER.id).some((m) => m.text.includes('Dafür gibt'))).toBe(false);
  });

  it('die Stufe steigt mit advance; eine Stufe mit Mission braucht erst die Mission', () => {
    const sim = start();
    const events = recordEvents(sim);
    expect(sim.dispatch({ type: 'tutorial.advance', payload: {} }).ok).toBe(true);
    expect(tutorialStage(sim.state)).toBe(1);
    expect(currentMission(sim.state)?.id).toBe('serve3');
    expect(eventsOfType(events, 'tutorial.stageReached').map((e) => e.payload.stage)).toEqual([1]);
    expect(eventsOfType(events, 'tutorial.missionStarted').map((e) => e.payload.id)).toEqual(['serve3']);
    expect(messages.thread(sim.state, PETER.id).at(-1)?.text).toContain('Bedien drei');
    const refused = sim.dispatch({ type: 'tutorial.advance', payload: {} });
    expect(refused.ok).toBe(false);
    expect(tutorialStage(sim.state)).toBe(1);
  });

  it('skip gibt alles frei, öffnet die Start-Spots wieder und lässt die Quests ruhen', () => {
    const sim = start();
    sim.dispatch({ type: 'tutorial.advance', payload: {} });
    expect(sim.dispatch({ type: 'tutorial.skip', payload: {} }).ok).toBe(true);
    expect(tutorialStage(sim.state)).toBe(LAST_STAGE);
    expect(tutorialActive(sim.state)).toBe(false);
    expect(tutorialFinished(sim.state)).toBe(true);
    expect(currentMission(sim.state)).toBeNull();
    expect(tutorialAllows(sim.state, 'app.finance')).toBe(true);
    expect(KOELN(sim.state).sort()).toEqual(['ebertplatz', 'neumarkt', 'uni', 'zuelpicher']);
    sim.advance(60);
    expect(currentMission(sim.state)).toBeNull();
    expect(questsSuppressed(sim.state)).toBe(true);
    expect(sim.dispatch({ type: 'tutorial.skip', payload: {} }).ok).toBe(false);
  });

  it('merkt sich geskriptete Momente', () => {
    const sim = start();
    expect(scriptedDone(sim.state, 'firstAttack')).toBe(false);
    expect(scriptedDone(sim.state, 'lowStockPopup')).toBe(false);
    expect(sim.dispatch({ type: 'tutorial.scripted', payload: { key: 'firstAttack' } }).ok).toBe(true);
    sim.dispatch({ type: 'tutorial.scripted', payload: { key: 'lowStockPopup' } });
    sim.dispatch({ type: 'tutorial.scripted', payload: { key: 'lowStockPopup' } });
    expect(scriptedDone(sim.state, 'firstAttack')).toBe(true);
    expect(sim.state.modules.tutorial.scripted.lowStockPopups).toBe(2);
    expect(sim.dispatch({ type: 'tutorial.scripted', payload: { key: 'nix' as 'seizure' } }).ok).toBe(false);
  });

  it('alte Spielstände ohne das Modul laden mit enabled: false', () => {
    const sim = createTestGame();
    sim.advance(10);
    const raw = structuredClone(sim.state);
    Reflect.deleteProperty(raw.modules, 'tutorial');
    Reflect.deleteProperty(raw.moduleVersions, 'tutorial');
    const loaded = loadSimulation(raw, sim.modules);
    expect(loaded.state.modules.tutorial.enabled).toBe(false);
    expect(tutorialAllows(loaded.state, 'app.gangs')).toBe(true);
  });
});

describe('tutorial: Missionen', () => {
  it('Mission 1: drei Kunden selbst bedienen (Läufer zählen nicht), Belohnung kommt, Stufe 2 mit Mission 2', () => {
    const sim = start();
    const events = recordEvents(sim);
    sim.dispatch({ type: 'tutorial.advance', payload: {} });
    const money = wallet.balance(sim.state, 'dirty');
    const stock = getStock(sim.state, { productId: 'weed' });
    sale(sim, 'staff:1');
    sale(sim);
    sale(sim);
    expect(missionProgress(sim.state).parts).toEqual([
      { id: 'served', label: 'Kunden selbst bedient', value: 2, target: 3, euro: false, done: false },
    ]);
    sale(sim, null, 'weed', 3, 60);
    expect(sim.state.modules.tutorial.done).toEqual(['serve3']);
    const done = eventsOfType(events, 'tutorial.missionDone');
    expect(done.map((e) => e.payload.id)).toEqual(['serve3']);
    // 7 g und 140 € in 24 Stunden: Untergrenzen 100 € und 10 g Gras.
    expect(done[0].payload.reward).toEqual({ money: 100, productId: 'weed', amount: 10 });
    expect(wallet.balance(sim.state, 'dirty')).toBe(money + 100);
    expect(getStock(sim.state, { productId: 'weed' })).toBe(stock + 10);
    expect(tutorialStage(sim.state)).toBe(2);
    expect(currentMission(sim.state)?.id).toBe('buySpots');
    expect(messages.thread(sim.state, PETER.id).at(-2)?.text).toContain('Drei Kunden');
  });

  it('Mission 2: Zülpicher Platz und Rudolfplatz für je 350 €, danach die Erklär-Stufen 3 und 4', () => {
    const sim = start();
    jump(sim, 2);
    expect(currentMission(sim.state)?.id).toBe('buySpots');
    const offered = lockedSpots(sim.state)
      .filter((s) => spotCity(s) === 'koeln')
      .map((s) => s.id)
      .sort();
    expect(offered).toEqual(['rudolfplatz', 'zuelpicher']);
    expect(tutorialSpotCost(sim.state, 'rudolfplatz')).toBe(350);
    expect(tutorialSpotCost(sim.state, 'aachener-weiher')).toBeNull();
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'aachener-weiher' } }).ok).toBe(false);
    const money = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'zuelpicher' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money - 350);
    expect(missionProgress(sim.state).parts.map((p) => p.done)).toEqual([true, false]);
    expect(sim.dispatch({ type: 'spots.unlock', payload: { spotId: 'rudolfplatz' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBe(money - 700 + 100);
    expect(sim.state.modules.tutorial.done).toContain('buySpots');
    expect(tutorialStage(sim.state)).toBe(3);
    expect(currentMission(sim.state)).toBeNull();
    expect(tutorialAllows(sim.state, 'app.territory')).toBe(true);
    expect(tutorialAllows(sim.state, 'app.gangs')).toBe(false);
    sim.dispatch({ type: 'tutorial.advance', payload: {} });
    expect(tutorialAllows(sim.state, 'app.gangs')).toBe(true);
    sim.dispatch({ type: 'tutorial.advance', payload: {} });
    expect(tutorialStage(sim.state)).toBe(5);
    expect(currentMission(sim.state)?.id).toBe('threeProducts');
  });

  it('Mission 3: drei verschiedene Produkte bestellt (dasselbe zählt nur einmal)', () => {
    const sim = start();
    jump(sim, 5);
    const order = (productId: string, shipmentId: number) => {
      sim.ctx('suppliers').emit('shipment.ordered', {
        shipmentId,
        supplierId: 'koeln',
        amount: 10,
        price: 60,
        productId,
        cityId: 'koeln',
      });
      sim.advance(1);
    };
    order('weed', 901);
    order('weed', 902);
    expect(missionProgress(sim.state).parts[0].value).toBe(1);
    order('hash', 903);
    expect(missionProgress(sim.state).parts[0].value).toBe(2);
    order('haze', 904);
    expect(sim.state.modules.tutorial.done).toContain('threeProducts');
    expect(tutorialStage(sim.state)).toBe(6);
    expect(currentMission(sim.state)?.id).toBe('earn4k');
  });

  it('Mission 4: Teilziele, einmal erreichtes Geld bleibt erreicht', () => {
    const sim = start();
    jump(sim, 6);
    sim.state.wallet.dirty = 4000;
    sim.advance(5);
    expect(sim.state.modules.tutorial.mission?.reached).toEqual(['money']);
    sim.state.wallet.dirty = 300;
    sim.advance(5);
    let parts = missionProgress(sim.state).parts;
    expect(parts.map((p) => [p.id, p.done])).toEqual([
      ['money', true],
      ['spots', false],
      ['runners', false],
    ]);
    sim.state.modules.spots.unlocked.push('zuelpicher', 'rudolfplatz', 'aachener-weiher', 'friesenplatz', 'breslauer');
    for (let i = 0; i < 3; i++) recruit(sim);
    sim.advance(5);
    // Sechs Spots sind drei mehr als nach Stufe 2, der vierte fehlt noch.
    expect(missionProgress(sim.state).parts[1]).toMatchObject({ value: 3, target: 4, done: false });
    sim.state.modules.spots.unlocked.push('rheinpark');
    sim.advance(5);
    parts = missionProgress(sim.state).parts;
    expect(sim.state.modules.tutorial.done).toContain('earn4k');
    expect(tutorialStage(sim.state)).toBe(7);
    expect(currentMission(sim.state)?.id).toBe('earn10k');
  });

  it('Mission 5: eigenes Veedel, fünf weitere Spots, einmal 10.000 €', () => {
    const sim = start();
    jump(sim, 7);
    sim.state.modules.spots.unlocked.push(
      ...['zuelpicher', 'rudolfplatz', 'aachener-weiher', 'friesenplatz', 'breslauer', 'rheinpark', 'stadtgarten'],
    );
    sim.state.wallet.dirty = 10000;
    sim.advance(5);
    expect(missionProgress(sim.state).parts.map((p) => p.done)).toEqual([true, false, false]);
    sim.state.modules.spots.unlocked.push('uni', 'domplatte', 'chlodwigplatz', 'ottoplatz');
    takeVeedel(sim, 1);
    sim.advance(5);
    expect(sim.state.modules.tutorial.done).toContain('earn10k');
    expect(currentMission(sim.state)?.id).toBe('harbor');
  });

  it('Mission 6: 4.000 € gewaschen, Liegeplatz, einmal bei Jansen bestellt', () => {
    const sim = start();
    jump(sim, 8);
    sim.state.modules.laundering.totalLaundered = 4000;
    sim.state.wallet.clean = 10000;
    expect(sim.dispatch({ type: 'logistics.buyBerth', payload: {} }).ok).toBe(true);
    expect(hasBerth(sim.state, 'koeln')).toBe(true);
    sim.advance(5);
    expect(missionProgress(sim.state).parts.map((p) => p.done)).toEqual([true, true, false]);
    sim.state.modules.suppliers.relations.rotterdam = { ...getRelation(sim.state, 'rotterdam'), orders: 1 };
    sim.advance(5);
    expect(sim.state.modules.tutorial.done).toContain('harbor');
    expect(currentMission(sim.state)?.id).toBe('lieutenants4');
  });

  it('Mission 7: drei Veedel und vier Leutnants; Mission 8: sieben Veedel', () => {
    const sim = start();
    jump(sim, 9);
    sim.state.modules.spots.unlocked.push('zuelpicher', 'rudolfplatz', 'aachener-weiher');
    for (const spotId of ['neumarkt', 'zuelpicher', 'rudolfplatz', 'aachener-weiher']) {
      const m = recruit(sim, 'runner', 2);
      const result = sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: [spotId] } });
      expect(result.ok, result.ok ? '' : result.reason).toBe(true);
    }
    expect(getLieutenants(sim.state).length).toBe(4);
    takeVeedel(sim, 3);
    sim.advance(5);
    expect(sim.state.modules.tutorial.done).toContain('lieutenants4');
    expect(tutorialStage(sim.state)).toBe(10);
    expect(currentMission(sim.state)).toBeNull();
    sim.dispatch({ type: 'tutorial.advance', payload: {} });
    expect(currentMission(sim.state)?.id).toBe('boss');
    takeVeedel(sim, 7);
    sim.advance(5);
    expect(sim.state.modules.tutorial.done).toContain('boss');
    expect(tutorialStage(sim.state)).toBe(LAST_STAGE);
    expect(tutorialActive(sim.state)).toBe(false);
    expect(currentMission(sim.state)?.id).toBe('koelnDone');
  });

  it('Mission 9: Köln komplett misst Geld, Spots, Veedel, Läufer, Regeln, Fahrer und Aufgaben', () => {
    const sim = start();
    jump(sim, LAST_STAGE);
    expect(currentMission(sim.state)?.id).toBe('koelnDone');
    sim.state.wallet.dirty = 50000;
    sim.state.wallet.clean = 12000;
    for (const spot of lockedSpots(sim.state))
      if (spotCity(spot) === 'koeln') sim.state.modules.spots.unlocked.push(spot.id);
    takeVeedel(sim, 12);
    sim.advance(5);
    const parts = Object.fromEntries(missionProgress(sim.state).parts.map((p) => [p.id, p.done]));
    expect(parts).toEqual({
      money: true,
      clean: true,
      spots: true,
      veedel: true,
      runners: false,
      rules: false,
      drivers: false,
      tasks: false,
    });
    expect(tutorialFinished(sim.state)).toBe(false);
  });

  it('Ware, die nicht mehr ins Lager passt, meldet Peter', () => {
    const sim = start();
    jump(sim, 1);
    store(sim.ctx('goods'), {
      warehouseId: DEFAULT_WAREHOUSE,
      productId: 'weed',
      amount: warehouseCapacity(sim.state, DEFAULT_WAREHOUSE),
    });
    sale(sim);
    sale(sim);
    sale(sim);
    expect(sim.state.modules.tutorial.done).toContain('serve3');
    expect(messages.thread(sim.state, PETER.id).some((m) => m.text.includes('kein Platz'))).toBe(true);
  });
});

describe('tutorial: Freischalten', () => {
  const allowedAt = (stage: number, feature: TutorialFeature) => {
    const sim = start();
    jump(sim, stage);
    return tutorialAllows(sim.state, feature);
  };

  it('HUD: sauberes Geld ab 8, Lager ab 5, Ruf und Rang über Ereignisse', () => {
    expect(allowedAt(7, 'hud.cleanMoney')).toBe(false);
    expect(allowedAt(8, 'hud.cleanMoney')).toBe(true);
    expect(allowedAt(4, 'hud.stock')).toBe(false);
    expect(allowedAt(5, 'hud.stock')).toBe(true);
    const sim = start();
    expect(tutorialAllows(sim.state, 'hud.reputation')).toBe(false);
    expect(tutorialAllows(sim.state, 'hud.rank')).toBe(false);
    sim.ctx('customers').emit('customer.regularGained', { regularId: 'r1', spotId: 'neumarkt' });
    sim.ctx('city').emit('player.rankUp', { rankId: 'dealer', title: 'Dealer', score: 1 });
    sim.advance(1);
    expect(tutorialAllows(sim.state, 'hud.reputation')).toBe(true);
    expect(tutorialAllows(sim.state, 'hud.rank')).toBe(true);
  });

  it('Apps: Reviere 3, Gangs 4, Lieferanten 5, Geldwäsche und Lager 8, Kasse 10', () => {
    const sim = start();
    const apps: TutorialFeature[] = [
      'app.territory',
      'app.gangs',
      'app.suppliers',
      'app.laundering',
      'app.goods',
      'app.finance',
    ];
    for (const app of apps) expect(tutorialAllows(sim.state, app), app).toBe(false);
    for (const app of apps) {
      jump(sim, FEATURE_STAGE[app] - 1);
      expect(tutorialAllows(sim.state, app), app).toBe(false);
      jump(sim, FEATURE_STAGE[app]);
      expect(tutorialAllows(sim.state, app), app).toBe(true);
    }
  });

  it('Personal: Läufer immer, Sicherheit und Leutnants 7, Fahrer 8, Spezialisten 9, Buchhalter 10, Rechte Hand 11', () => {
    const sim = start();
    expect(tutorialAllowsRole(sim.state, 'runner')).toBe(true);
    expect(tutorialAllowsRole(sim.state, 'driver')).toBe(false);
    expect(sim.dispatch({ type: 'staff.hireDriver', payload: {} }).ok).toBe(false);
    expect(getStaff(sim.state, { role: 'driver' }).length).toBe(0);
    jump(sim, 7);
    expect(tutorialAllows(sim.state, 'staff.lieutenants')).toBe(true);
    expect(tutorialAllowsRole(sim.state, 'security')).toBe(true);
    expect(tutorialAllowsRole(sim.state, 'driver')).toBe(false);
    jump(sim, 8);
    expect(tutorialAllowsRole(sim.state, 'driver')).toBe(true);
    expect(tutorialAllowsRole(sim.state, 'lawyer')).toBe(false);
    jump(sim, 9);
    expect(tutorialAllowsRole(sim.state, 'policeContact')).toBe(true);
    expect(tutorialAllowsRole(sim.state, 'accountant')).toBe(false);
    jump(sim, 10);
    expect(tutorialAllowsRole(sim.state, 'accountant')).toBe(true);
    expect(tutorialAllows(sim.state, 'staff.rightHand')).toBe(false);
    jump(sim, 11);
    expect(tutorialAllows(sim.state, 'staff.rightHand')).toBe(true);
    // Leutnant ernennen geht vor Stufe 7 nicht.
    const early = start();
    const m = recruit(early, 'runner', 2);
    expect(early.dispatch({ type: 'hierarchy.appoint', payload: { staffId: m.id, spotIds: ['neumarkt'] } }).ok).toBe(
      false,
    );
  });

  it('Gangs: Drohungen ab 4, Angriffe, Schutzgeld und Übernahmen ab 7; Polizei: Zivis ab 0, Kontrollen und Razzien ab 9', () => {
    expect(allowedAt(3, 'gangs.threats')).toBe(false);
    expect(allowedAt(4, 'gangs.threats')).toBe(true);
    for (const f of ['gangs.attacks', 'gangs.protection', 'gangs.takeover'] as const) {
      expect(allowedAt(6, f), f).toBe(false);
      expect(allowedAt(7, f), f).toBe(true);
    }
    expect(allowedAt(0, 'police.undercover')).toBe(true);
    expect(allowedAt(8, 'police.checks')).toBe(false);
    expect(allowedAt(9, 'police.checks')).toBe(true);
    expect(allowedAt(8, 'police.raids')).toBe(false);
    expect(allowedAt(9, 'police.raids')).toBe(true);
  });

  it('Spots: Ausbau und Gründen nie im Tutorial, Geldwäsche alle Wege und Sammelbestellung ab 9', () => {
    expect(allowedAt(11, 'spots.upgrade')).toBe(false);
    expect(allowedAt(11, 'spots.found')).toBe(false);
    expect(allowedAt(LAST_STAGE, 'spots.found')).toBe(true);
    expect(allowedAt(8, 'laundering.allWays')).toBe(false);
    expect(allowedAt(9, 'laundering.allWays')).toBe(true);
    expect(allowedAt(8, 'suppliers.groupOrder')).toBe(false);
    expect(allowedAt(9, 'suppliers.groupOrder')).toBe(true);
    const sim = start();
    jump(sim, 2);
    sim.state.wallet.dirty = 50000;
    expect(sim.dispatch({ type: 'spots.upgrade', payload: { spotId: 'neumarkt', upgrade: 'lookout' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'laundering.unlock', payload: { channel: 'laundromat', pay: 'dirty' } }).ok).toBe(
      false,
    );
  });

  it('Spots nach Stufe: Neumarkt, dann die zwei, ab 6 Nachbarschaft, ab 7 alle', () => {
    const sim = start();
    expect(tutorialSpotOpen(sim.state, 'neumarkt')).toBe(true);
    expect(tutorialSpotOpen(sim.state, 'zuelpicher')).toBe(false);
    jump(sim, 2);
    expect(tutorialSpotOpen(sim.state, 'zuelpicher')).toBe(true);
    expect(tutorialSpotOpen(sim.state, 'ebertplatz')).toBe(false);
    expect(tutorialSpotOpen(sim.state, 'kalk-post')).toBe(false);
    jump(sim, 6);
    // Neumarkt liegt in der Altstadt: Nachbarn ja, Kalk nicht.
    expect(tutorialSpotOpen(sim.state, 'ebertplatz')).toBe(true);
    expect(tutorialSpotOpen(sim.state, 'kalk-post')).toBe(false);
    expect(lockedSpots(sim.state).some((s) => s.id === 'kalk-post')).toBe(false);
    jump(sim, 7);
    expect(tutorialSpotOpen(sim.state, 'kalk-post')).toBe(true);
    // Eigene und fremde Städte sind nicht betroffen.
    expect(tutorialSpotOpen(sim.state, 'spielbudenplatz')).toBe(true);
  });

  it('Lieferanten: Kalle und Toni ab 5, Hein ab 6, der Rest wie heute', () => {
    const sim = start();
    const ids = (s: GameState) => getSuppliers(s, 'koeln').map((x) => x.id);
    expect(ids(sim.state)).not.toContain('frankfurt');
    expect(ids(sim.state)).not.toContain('koeln');
    expect(tutorialSupplierOpen(sim.state, 'berlin')).toBe(true);
    const fast = sim.dispatch({ type: 'suppliers.order', payload: { supplierId: 'frankfurt', packageId: 'small' } });
    expect(fast.ok).toBe(false);
    jump(sim, 5);
    expect(ids(sim.state)).toContain('frankfurt');
    expect(ids(sim.state)).toContain('koeln');
    expect(tutorialSupplierOpen(sim.state, 'hamburg')).toBe(false);
    jump(sim, 6);
    expect(tutorialSupplierOpen(sim.state, 'hamburg')).toBe(true);
  });

  it('isSpotActive bleibt für gesperrte Spots falsch, getSpots zeigt nur offene', () => {
    const sim = start();
    expect(isSpotActive(sim.state, 'zuelpicher')).toBe(false);
    expect(controlledBy(sim.state, PLAYER_FACTION)).toEqual([]);
  });
});
