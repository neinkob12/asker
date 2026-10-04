import { describe, expect, it } from 'vitest';
import { loadSimulation, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters, autoResolveEncounter, getEncounter, startEncounter } from '../encounters';
import { getStock } from '../goods';
import { getCompetitionFactor } from '../market';
import { getSpot } from '../spots';
import { controllerOf, getInfluence } from '../territory';
import { allVeedel, getVeedel } from '../veedel';
import { crewFor, demandOptions, say } from './common';
import {
  ALLIANCE_COST,
  ATTACK_AT,
  GANG_SPOT_MIN_INFLUENCE,
  OFFER_DURATION,
  SMALL_FISH_UNITS,
  THREAT_AT,
  WARN_AT,
} from './config';
import {
  canJoinRaid,
  type GangStatus,
  gangPower,
  gangVeedel,
  getGang,
  getGangStatus,
  getGangs,
  hasCeasefire,
  isAtPeace,
  isGangBroken,
  paysTribute,
  playerPower,
  raidCrew,
  raidTargets,
  veedelGang,
} from './index';
import { GANG_VOICES } from './texts';

function status(sim: Simulation, gangId: string): GangStatus {
  const s = getGangStatus(sim.state, gangId);
  if (!s) throw new Error(`Gang ${gangId} fehlt`);
  return s;
}

/** Verkauf des Spielers an einem Spot melden, wie ihn customers melden würde. */
function sell(sim: Simulation, spotId: string, amount: number): void {
  const spot = getSpot(sim.state, spotId);
  if (!spot) throw new Error(spotId);
  sim.ctx('test').emit('sale.completed', {
    channel: 'street',
    spotId,
    veedelId: spot.veedelId,
    productId: 'weed',
    amount,
    quality: 0.6,
    revenue: amount * 10,
    sellerId: null,
    customerId: null,
  });
}

function hire(sim: Simulation, spotId: string): string {
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  return (result.data as { staffId: string }).staffId;
}

function richer(sim: Simulation, amount: number): void {
  wallet.earn(sim.ctx('test'), amount, 'dirty', 'Test');
}

/** Stunden vorspulen, dabei jede Stunde am Spot verkaufen. */
function sellHours(sim: Simulation, spotId: string, perHour: number, hours: number): void {
  for (let h = 0; h < hours && !sim.isOver; h++) {
    sell(sim, spotId, perHour);
    sim.advance(60);
  }
}

describe('gangs: Identität und Stärke', () => {
  it('je vier frei erfundene Gangs in Köln und Hamburg mit Boss, Heimat, Farbe, Stil und Stärken', () => {
    const sim = createTestGame();
    expect(getGangs(sim.state, 'koeln').map((g) => g.id)).toEqual(['nord', 'west', 'ost', 'sued']);
    expect(getGangs(sim.state, 'hamburg').map((g) => g.id)).toEqual([
      'hh-kiez',
      'hh-hafen',
      'hh-schanze',
      'hh-elbchaussee',
    ]);
    const gangs = getGangs(sim.state);
    expect(new Set(gangs.map((g) => g.color)).size).toBe(8);
    expect(new Set(gangs.map((g) => g.homeVeedelId)).size).toBe(8);
    for (const g of gangs) expect(getVeedel(g.homeVeedelId)?.cityId, g.id).toBe(g.cityId);
    // Hamburg ist härter: mehr Kampfkraft, Geld und Leute als Köln im Schnitt (etwa ein Viertel).
    const avg = (city: string, f: (g: (typeof gangs)[number]) => number) =>
      getGangs(sim.state, city).reduce((s, g) => s + f(g), 0) / 4;
    for (const f of [
      (g: (typeof gangs)[number]) => g.traits.fighting,
      (g: (typeof gangs)[number]) => g.traits.start.money,
      (g: (typeof gangs)[number]) => g.traits.start.people,
    ]) {
      expect(avg('hamburg', f)).toBeGreaterThan(avg('koeln', f) * 1.15);
    }
    for (const g of gangs) {
      expect(getVeedel(g.homeVeedelId)).toBeDefined();
      expect(g.name && g.boss && g.style && g.crew).toBeTruthy();
      expect(g.strengths.length).toBeGreaterThan(0);
      expect(getGang(sim.state, g.id)).toBe(g);
      expect(controllerOf(sim.state, g.homeVeedelId)).toBe(g.id);
      const s = status(sim, g.id);
      expect(s.money).toBeGreaterThan(0);
      expect(s.people).toBeGreaterThan(0);
      expect(s.goods).toBeGreaterThan(0);
      expect(s.hostility).toBe(0);
    }
  });

  it('zu Beginn sind die Gangs spürbar mächtiger als der Spieler', () => {
    const sim = createTestGame();
    for (const g of getGangs(sim.state))
      expect(gangPower(sim.state, g.id)).toBeGreaterThan(20 * playerPower(sim.state));
  });

  it('die Gangs drücken die Preise in ihren Veedeln, sobald du dort Konkurrenz machst', () => {
    const sim = createTestGame();
    sell(sim, 'rheinpark', 3);
    sell(sim, 'ebertplatz', 3);
    sim.advance(60);
    expect(getCompetitionFactor(sim.state, 'deutz')).toBe(0.8);
    expect(getCompetitionFactor(sim.state, 'neustadt-nord')).toBe(0.9);
    // Wo du nicht bist, lassen sie den Markt in Ruhe.
    expect(getCompetitionFactor(sim.state, 'bayenthal')).toBe(1);
    // Preiskrieg, wenn sie dich hassen.
    status(sim, 'nord').hostility = 80;
    sim.advance(60);
    expect(getCompetitionFactor(sim.state, 'neustadt-nord')).toBe(0.8);
    // Nach einem Tag ohne Präsenz normalisiert sich der Preis.
    sim.advance(26 * 60);
    expect(getCompetitionFactor(sim.state, 'deutz')).toBe(1);
  });
});

describe('gangs: KI', () => {
  it('ist bei gleichem Seed deterministisch', () => {
    const run = (seed: number) => {
      const sim = createTestGame({ seed });
      hire(sim, 'ebertplatz');
      sim.advance(6 * 24 * 60);
      return JSON.stringify([sim.state.modules.gangs, sim.state.modules.territory, sim.state.journal]);
    };
    expect(run(42)).toBe(run(42));
    expect(run(42)).not.toBe(run(43));
  });

  it('expandiert sichtbar in Nachbar-Veedel und verteidigt ihr Revier', () => {
    const sim = createTestGame({ seed: 7 });
    const events = recordEvents(sim);
    sim.advance(8 * 24 * 60);
    const started = eventsOfType(events, 'gang.pushStarted');
    expect(started.length).toBeGreaterThan(0);
    expect(eventsOfType(events, 'gang.pushEnded').length).toBeGreaterThan(0);
    expect(eventsOfType(events, 'journal.added').some((e) => e.payload.entry.text.includes('drängt nach'))).toBe(true);
    // Jede Gang hält weiter ein Revier, niemand ist nach ein paar Tagen ausgelöscht.
    for (const g of getGangs(sim.state)) expect(gangVeedel(sim.state, g.id).length).toBeGreaterThan(0);
  });

  it('wirtschaftet: verkauft Ware, zahlt Löhne, kauft nach', () => {
    const sim = createTestGame();
    const before = { ...status(sim, 'ost') };
    sim.advance(3 * 24 * 60);
    const after = status(sim, 'ost');
    expect(after.money).not.toBe(before.money);
    expect(after.goods).not.toBe(before.goods);
    expect(after.people).toBeGreaterThan(0);
  });

  it('ignoriert einen kleinen Fisch', () => {
    const sim = createTestGame();
    const events = recordEvents(sim);
    // Ein paar Gramm pro Tag am Ebertplatz (Revier der Hafenkolonne).
    for (let day = 0; day < 3; day++) {
      sell(sim, 'ebertplatz', 8);
      sim.advance(24 * 60);
    }
    expect(status(sim, 'nord').turfSales).toBeLessThan(SMALL_FISH_UNITS);
    expect(status(sim, 'nord').hostility).toBe(0);
    expect(eventsOfType(events, 'gang.escalated')).toHaveLength(0);
  });

  it('wird feindseliger, je mehr du in ihrem Revier verkaufst: Warnung, Drohung, Überfall', () => {
    const sim = createTestGame({ seed: 2 });
    const events = recordEvents(sim);
    sellHours(sim, 'ebertplatz', 15, 72);
    const stages = eventsOfType(events, 'gang.escalated')
      .filter((e) => e.payload.gangId === 'nord')
      .map((e) => e.payload.stage);
    expect(stages.slice(0, 3)).toEqual([1, 2, 3]);
    const fromNord = messages.thread(sim.state, 'gang:nord');
    expect(fromNord.length).toBeGreaterThanOrEqual(3);
    // Die Drohung bietet Diplomatie als Antwort an.
    expect(fromNord[1].options?.map((o) => o.command?.type)).toEqual([
      'gangs.payTribute',
      'gangs.ceasefire',
      'gangs.refuse',
    ]);
    const raids = eventsOfType(events, 'gang.raidStarted').filter((e) => e.payload.gangId === 'nord');
    expect(raids.length).toBeGreaterThan(0);
    const raid = getEncounter(sim.state, raids[0].payload.encounterId);
    expect(raid?.kind).toBe('raidDefense');
    expect(raid?.request.opponent?.factionId).toBe('nord');
    expect(status(sim, 'nord').hostility).toBeGreaterThanOrEqual(WARN_AT);
  });

  it('dein Verkauf in ihrem Revier kostet sie Einfluss (wirtschaftlicher Druck)', () => {
    const sim = createTestGame();
    const before = getInfluence(sim.state, 'neustadt-nord', 'nord');
    sell(sim, 'ebertplatz', 40);
    sim.step();
    expect(getInfluence(sim.state, 'neustadt-nord', 'nord')).toBeLessThan(before);
    expect(veedelGang(sim.state, 'neustadt-nord')).toBe('nord');
  });
});

describe('gangs: Diplomatie', () => {
  function makeHostile(sim: Simulation, gangId: string, hostility: number): void {
    const s = status(sim, gangId);
    s.hostility = hostility;
  }

  it('Waffenstillstand: nur wenn es Streit gibt, kostet Geld, hält die Gang still', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: 'nord' } })).toEqual({
      ok: false,
      reason: 'Hafenkolonne hat gar kein Problem mit dir.',
    });
    makeHostile(sim, 'nord', ATTACK_AT + 20);
    richer(sim, 2000);
    const money = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: 'nord' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBeLessThan(money);
    expect(hasCeasefire(sim.state, 'nord')).toBe(true);
    expect(isAtPeace(sim.state, 'nord')).toBe(true);
    expect(status(sim, 'nord').hostility).toBeLessThan(ATTACK_AT + 20);
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: 'nord' } }).ok).toBe(false);
  });

  it('kein Überfall während eines Waffenstillstands', () => {
    const sim = createTestGame({ seed: 4 });
    const events = recordEvents(sim);
    makeHostile(sim, 'nord', 60);
    richer(sim, 5000);
    expect(sim.dispatch({ type: 'gangs.ceasefire', payload: { gangId: 'nord' } }).ok).toBe(true);
    status(sim, 'nord').hostility = 100;
    status(sim, 'nord').stage = 3;
    sim.advance(2 * 24 * 60);
    expect(eventsOfType(events, 'gang.raidStarted').filter((e) => e.payload.gangId === 'nord')).toHaveLength(0);
  });

  it('Schutzgeld zahlen per Antwort auf die Drohung, nach einer Woche kommt die nächste Forderung', () => {
    const sim = createTestGame({ seed: 5 });
    richer(sim, 3000);
    makeHostile(sim, 'nord', THREAT_AT + 1);
    sim.advance(60);
    const threat = messages.thread(sim.state, 'gang:nord').find((m) => m.options?.length);
    if (!threat) throw new Error('keine Drohung');
    const money = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'messages.answer', payload: { messageId: threat.id, optionId: 'tribute' } }).ok).toBe(
      true,
    );
    expect(paysTribute(sim.state, 'nord')).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBeLessThan(money);
    expect(status(sim, 'nord').relation).toBeGreaterThan(0);
    sim.advance(7 * 24 * 60 + 60);
    expect(paysTribute(sim.state, 'nord')).toBe(false);
    const due = messages.thread(sim.state, 'gang:nord').at(-1);
    expect(due?.options?.[0].command?.type).toBe('gangs.payTribute');
  });

  it('Schutzgeld kassieren geht erst, wenn du stärker bist als die Gang', () => {
    const sim = createTestGame();
    const refused = sim.dispatch({ type: 'gangs.demandProtection', payload: { gangId: 'sued' } });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.reason).toMatch(/zu klein/);
    // Marienburger Kreis geschwächt, du hast Leute und Geld.
    const s = status(sim, 'sued');
    s.people = 1;
    s.money = 8000;
    s.goods = 100;
    richer(sim, 20000);
    const money = wallet.balance(sim.state, 'dirty');
    expect(sim.dispatch({ type: 'gangs.demandProtection', payload: { gangId: 'sued' } }).ok).toBe(true);
    expect(wallet.balance(sim.state, 'dirty')).toBeGreaterThan(money);
    expect(status(sim, 'sued').protection).not.toBeNull();
    // Nach einer Woche zahlen sie wieder, solange du stark genug bist. Erholt sich die Gang, verweigert sie.
    const events = recordEvents(sim);
    sim.advance(7 * 24 * 60 - 120);
    s.people = 1;
    s.goods = 0;
    sim.advance(180);
    const payments = eventsOfType(events, 'wallet.changed').filter((e) => e.payload.reason.includes('Marienburger'));
    expect(payments).toHaveLength(1);
    expect(status(sim, 'sued').protection?.overdue).toBe(false);
    sim.advance(7 * 24 * 60 - 120);
    s.people = 20;
    sim.advance(180);
    expect(status(sim, 'sued').protection?.overdue).toBe(true);
    expect(messages.thread(sim.state, 'gang:sued').at(-1)?.options?.[0].command?.type).toBe('gangs.collect');
  });

  it('verweigertes Schutzgeld lässt sich eintreiben (Konfrontation Schulden eintreiben)', () => {
    const sim = createTestGame({ seed: 9 });
    const s = status(sim, 'sued');
    s.protection = { amount: 800, nextDueAt: sim.state.time + 10000, overdue: true };
    const result = sim.dispatch({ type: 'gangs.collect', payload: { gangId: 'sued', playerPresent: true } });
    expect(result.ok).toBe(true);
    const encounterId = (result.ok && (result.data as { encounterId: number }).encounterId) || 0;
    const encounter = getEncounter(sim.state, encounterId);
    expect(encounter?.kind).toBe('debtCollection');
    expect(encounter?.request.stakes?.money).toBe(800);
    expect(sim.dispatch({ type: 'gangs.collect', payload: { gangId: 'sued' } }).ok).toBe(false);
  });

  it('Bündnis gegen eine andere Gang: kostet, braucht Vertrauen, der Feind bekommt es mit', () => {
    const sim = createTestGame();
    expect(sim.dispatch({ type: 'gangs.ally', payload: { gangId: 'west', againstGangId: 'nord' } })).toEqual({
      ok: false,
      reason: `Nicht genug Schwarzgeld (${ALLIANCE_COST.toLocaleString('de-DE')} €).`,
    });
    status(sim, 'west').relation = -20;
    richer(sim, 5000);
    expect(sim.dispatch({ type: 'gangs.ally', payload: { gangId: 'west', againstGangId: 'nord' } }).ok).toBe(false);
    status(sim, 'west').relation = 20;
    expect(sim.dispatch({ type: 'gangs.ally', payload: { gangId: 'west', againstGangId: 'west' } }).ok).toBe(false);
    expect(sim.dispatch({ type: 'gangs.ally', payload: { gangId: 'west', againstGangId: 'nord' } }).ok).toBe(true);
    expect(status(sim, 'west').alliance?.againstGangId).toBe('nord');
    expect(status(sim, 'nord').hostility).toBeGreaterThan(0);
    expect(isAtPeace(sim.state, 'west')).toBe(true);
  });

  it('Ware kaufen: ein sauberer Deal oder eine Konfrontation, wenn er kippt', () => {
    const clean = createTestGame();
    const s = status(clean, 'ost');
    s.relation = 100;
    s.offer = { id: 999, amount: 100, price: 400, expiresAt: clean.state.time + 60 };
    const stock = getStock(clean.state);
    expect(clean.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: 'ost', offerId: 999 } }).ok).toBe(true);
    expect(getStock(clean.state)).toBe(stock + 100);
    expect(s.offer).toBeNull();
    expect(clean.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: 'ost', offerId: 999 } }).ok).toBe(false);

    let betrayed = false;
    for (let seed = 1; seed <= 20 && !betrayed; seed++) {
      const sim = createTestGame({ seed });
      const st = status(sim, 'ost');
      st.hostility = 30;
      st.relation = -100;
      st.offer = { id: 5, amount: 100, price: 400, expiresAt: sim.state.time + 60 };
      sim.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: 'ost', offerId: 5 } });
      const encounter = activeEncounters(sim.state)[0];
      if (!encounter) continue;
      betrayed = true;
      expect(encounter.kind).toBe('dealGoneWrong');
      expect(encounter.request.stakes).toEqual({ money: 400, goods: 100 });
    }
    expect(betrayed).toBe(true);
  });
});

describe('gangs: Gewalt und Polizei', () => {
  it('Überfall auf einen Gang-Spot: braucht Leute, bricht Abkommen, Verluste landen bei der Gang', () => {
    const sim = createTestGame({ seed: 11 });
    const payload = { gangId: 'ost', veedelId: 'kalk', staffIds: [] as string[], playerPresent: false };
    expect(sim.dispatch({ type: 'gangs.attack', payload })).toEqual({
      ok: false,
      reason: 'Du brauchst Leute oder musst selbst mit.',
    });
    expect(sim.dispatch({ type: 'gangs.attack', payload: { ...payload, veedelId: 'nippes' } }).ok).toBe(false);
    const runner = hire(sim, 'ebertplatz');
    const s = status(sim, 'ost');
    s.ceasefireUntil = sim.state.time + 1000;
    s.hostility = 30;
    const before = { people: s.people, goods: s.goods, money: s.money };
    const result = sim.dispatch({ type: 'gangs.attack', payload: { ...payload, staffIds: [runner] } });
    expect(result.ok).toBe(true);
    expect(hasCeasefire(sim.state, 'ost')).toBe(false);
    expect(s.hostility).toBeGreaterThan(30);
    const encounterId = (result.ok && (result.data as { encounterId: number }).encounterId) || 0;
    autoResolveEncounter(sim.ctx('test'), encounterId);
    sim.step();
    const encounter = getEncounter(sim.state, encounterId);
    const r = encounter?.result;
    if (!r) throw new Error('kein Ergebnis');
    expect(encounter?.kind).toBe('gangSpotRaid');
    expect(s.people).toBe(Math.max(0, before.people - r.opponentLosses));
    if (encounter?.outcome === 'success') {
      expect(r.goods).toBeGreaterThan(0);
      expect(s.goods).toBeLessThan(before.goods);
    }
  });

  it('Verpfeifen: Die Polizei macht Razzien bei der Gang, die verliert Leute, Ware und Einfluss', () => {
    const sim = createTestGame({ seed: 3 });
    const events = recordEvents(sim);
    const s = status(sim, 'nord');
    expect(sim.dispatch({ type: 'police.snitch', payload: { gangId: 'nord' } }).ok).toBe(true);
    for (let i = 0; i < 5 * 24 && eventsOfType(events, 'gang.busted').length === 0; i++) {
      const before = { people: s.people, goods: s.goods };
      sim.advance(60);
      const busted = eventsOfType(events, 'gang.busted')[0];
      if (!busted) continue;
      expect(busted.payload.gangId).toBe('nord');
      expect(busted.payload.goods).toBeGreaterThan(0);
      expect(s.goods).toBeLessThan(before.goods);
      expect(s.people).toBeLessThanOrEqual(before.people);
    }
    expect(eventsOfType(events, 'gang.busted')).toHaveLength(1);
    const raid = eventsOfType(events, 'police.raid').find((e) => e.payload.target === 'nord');
    expect(raid).toBeDefined();
  });

  it('wer verpfeift, riskiert, dass die Gang es erfährt', () => {
    let found = false;
    for (let seed = 1; seed <= 10 && !found; seed++) {
      const sim = createTestGame({ seed });
      const s = status(sim, 'west');
      s.ceasefireUntil = sim.state.time + 5000;
      sim.dispatch({ type: 'police.snitch', payload: { gangId: 'west' } });
      sim.step();
      if (s.hostility === 0) continue;
      found = true;
      expect(s.relation).toBeLessThan(0);
      expect(hasCeasefire(sim.state, 'west')).toBe(false);
      const last = messages.thread(sim.state, 'gang:west').at(-1)?.text;
      expect(GANG_VOICES.west.snitch).toContain(last);
    }
    expect(found).toBe(true);
  });

  it('verlierst du einen Überfall, landen deine Ware und dein Geld bei der Gang', () => {
    const sim = createTestGame();
    const s = status(sim, 'nord');
    const before = { goods: s.goods, money: s.money };
    const { encounterId } = startEncounter(sim.ctx('gangs'), {
      kind: 'raidDefense',
      veedelId: 'nippes',
      playerPresent: false,
      opponent: { factionId: 'nord' },
    });
    sim.step();
    const r = getEncounter(sim.state, encounterId)?.result;
    if (!r) throw new Error('kein Ergebnis');
    expect(r.goods).toBeLessThan(0);
    expect(s.goods).toBe(before.goods - r.goods);
    expect(s.money).toBe(before.money - r.money);
  });
});

describe('gangs: Spielstände', () => {
  it('Spielstände aus dem Fundament (gangs ohne Zustand) bekommen frische Gangs', () => {
    const sim = createTestGame();
    const state = structuredClone(sim.state) as unknown as {
      modules: Record<string, unknown>;
      moduleVersions: Record<string, number>;
    };
    delete state.modules.gangs;
    state.moduleVersions.gangs = 1;
    const loaded = loadSimulation(state as unknown as typeof sim.state, sim.modules);
    expect(loaded.state.moduleVersions.gangs).toBe(3);
    expect(getGangStatus(loaded.state, 'hh-kiez')?.people).toBeGreaterThan(0);
    expect(getGangStatus(loaded.state, 'nord')?.people).toBeGreaterThan(0);
    loaded.advance(120);
    expect(loaded.isOver).toBe(false);
  });
});

describe('gangs: Überfall und Angebote (Fehler aus der Handy-Prüfung)', () => {
  it('beim Überfall gehen nur Läufer und Sicherheit mit, nicht Rechte Hand, Leutnants oder Fahrer auf Fahrt', () => {
    const sim = createTestGame({ seed: 11 });
    richer(sim, 5000);
    const runner = hire(sim, 'ebertplatz');
    const office = hire(sim, 'neumarkt');
    const lieutenant = hire(sim, 'zuelpicher');
    const driver = hire(sim, 'uni');
    const members = sim.state.modules.staff.members;
    const find = (id: string) => {
      const m = members.find((x) => x.id === id);
      if (!m) throw new Error(id);
      return m;
    };
    find(office).assignment = { kind: 'office', targetId: 'rightHand' };
    find(lieutenant).assignment = { kind: 'veedel', targetId: 'lindenthal' };
    find(driver).role = 'driver';
    find(driver).assignment = { kind: 'transport', targetId: '1' };
    expect(raidCrew(sim.state).map((m) => m.id)).toEqual([runner]);
    expect(canJoinRaid(find(office))).toBe(false);
    const s = status(sim, 'ost');
    s.hostility = 30;
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: {
        gangId: 'ost',
        veedelId: 'kalk',
        staffIds: [runner, office, lieutenant, driver],
        playerPresent: false,
      },
    });
    expect(result.ok).toBe(true);
    expect(activeEncounters(sim.state)[0]?.request.staffIds).toEqual([runner]);
  });

  it('Crew und Verstärkung kommen aus der Stadt des Anlasses, nicht aus der schlafenden', () => {
    const sim = createTestGame({ seed: 11 });
    richer(sim, 5000);
    const here = hire(sim, 'ebertplatz');
    const away = hire(sim, 'neumarkt');
    const awaySecurity = hire(sim, 'zuelpicher');
    const find = (id: string) => {
      const m = sim.state.modules.staff.members.find((x) => x.id === id);
      if (!m) throw new Error(id);
      return m;
    };
    // Zwei Leute aus Hamburg ohne Einsatz (Köln ist aktiv, Hamburg schläft).
    for (const id of [away, awaySecurity]) {
      find(id).cityId = 'hamburg';
      find(id).assignment = null;
    }
    find(awaySecurity).role = 'security';
    expect(raidCrew(sim.state).map((m) => m.id)).toEqual([here]);
    expect(canJoinRaid(find(away), 'koeln')).toBe(false);
    expect(canJoinRaid(find(away), 'hamburg')).toBe(true);
    expect(crewFor(sim.state, { spotId: 'ebertplatz' })).toEqual([here]);
    expect(crewFor(sim.state, {})).toEqual([]);
    expect(crewFor(sim.state, { cityId: 'hamburg' })).toEqual([awaySecurity]);
    // Wer aus der anderen Stadt mitgeschickt wird, geht nicht mit.
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [here, away], playerPresent: false },
    });
    expect(result.ok).toBe(true);
    expect(activeEncounters(sim.state)[0]?.request.staffIds).toEqual([here]);
  });

  it('ein Überfall nur mit Leuten, die nicht mitgehen dürfen, geht nicht', () => {
    const sim = createTestGame({ seed: 11 });
    const office = hire(sim, 'ebertplatz');
    const member = sim.state.modules.staff.members.find((m) => m.id === office);
    if (member) member.assignment = { kind: 'office', targetId: 'rightHand' };
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [office], playerPresent: false },
    });
    expect(result.ok).toBe(false);
  });

  it('die Beute ist nie negativ, auch wenn die Kasse der Gang es gerade ist', () => {
    const sim = createTestGame({ seed: 11 });
    const runner = hire(sim, 'ebertplatz');
    const s = status(sim, 'ost');
    s.money = -700;
    s.goods = 0;
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [runner], playerPresent: false },
    });
    expect(result.ok).toBe(true);
    expect(activeEncounters(sim.state)[0]?.request.stakes).toMatchObject({ money: 0, goods: 0 });
  });

  it('Ziele des Überfalls: dieselbe Liste für Oberfläche und Befehl', () => {
    const sim = createTestGame({ seed: 11 });
    const targets = raidTargets(sim.state, 'ost');
    expect(targets).toContain('kalk');
    for (const veedelId of allVeedel('koeln').map((v) => v.id)) {
      const hasSpot = getInfluence(sim.state, veedelId, 'ost') >= GANG_SPOT_MIN_INFLUENCE;
      expect(targets.includes(veedelId)).toBe(hasSpot);
    }
  });

  it('Forderungen bieten nur Wege an, die gerade gehen (kein zweites Zahlen, kein Frieden ohne Streit)', () => {
    const sim = createTestGame({ seed: 11 });
    const gang = getGang(sim.state, 'ost');
    const s = status(sim, 'ost');
    if (!gang) throw new Error('keine Gang');
    // Tribut läuft, die Feindseligkeit ist weg: bleibt nur "ablehnen".
    s.tribute = { amount: 300, until: sim.state.time + 1000 };
    s.hostility = 0;
    expect(demandOptions(sim.ctx('gangs'), gang, s).map((o) => o.id)).toEqual(['refuse']);
    // Kein Tribut, aber Streit: Zahlen und Waffenstillstand gehen.
    s.tribute = null;
    s.hostility = WARN_AT + 10;
    s.relation = 0;
    s.lastPlayerAttackAt = null;
    expect(demandOptions(sim.ctx('gangs'), gang, s).map((o) => o.id)).toEqual(['tribute', 'ceasefire', 'refuse']);
  });

  it('die Antwortfrist eines Angebots in der Nachricht ist die des Angebots', () => {
    const sim = createTestGame({ seed: 11 });
    const gang = getGang(sim.state, 'ost');
    if (!gang) throw new Error('keine Gang');
    const id = say(
      sim.ctx('gangs'),
      gang,
      'offer',
      { amount: '50 g', price: '100 €', veedel: 'Kalk' },
      [{ id: 'x', label: 'x' }],
      OFFER_DURATION,
    );
    expect(messages.get(sim.state, id)?.expiresAt).toBe(sim.state.time + OFFER_DURATION);
  });

  it('keine Bündnisse gegen zerschlagene Gangs', () => {
    const sim = createTestGame({ seed: 11 });
    const other = getGangs(sim.state).find((g) => g.id !== 'ost');
    if (!other) throw new Error('keine zweite Gang');
    // Zerschlagen: keine Leute und kein Revier mehr.
    status(sim, other.id).people = 0;
    for (const veedel of Object.values(sim.state.modules.territory.influence)) delete veedel[other.id];
    for (const veedelId of Object.keys(sim.state.modules.territory.controller)) {
      if (sim.state.modules.territory.controller[veedelId] === other.id)
        sim.state.modules.territory.controller[veedelId] = null;
    }
    expect(isGangBroken(sim.state, other.id)).toBe(true);
    status(sim, 'ost').relation = 60;
    richer(sim, 5000);
    const result = sim.dispatch({ type: 'gangs.ally', payload: { gangId: 'ost', againstGangId: other.id } });
    expect(result.ok).toBe(false);
  });
});
