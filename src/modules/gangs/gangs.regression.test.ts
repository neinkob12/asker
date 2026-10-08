// Regressionstests zu Befunden aus dem Bugreview (Gangs): je Befund ein Block mit seiner ID.

import { describe, expect, it } from 'vitest';
import { fillText, type GameEvents, type Simulation, wallet } from '../../core';
import { createTestGame } from '../../core/testing';
import { activeCity, unlockCity } from '../city';
import { activeEncounters } from '../encounters';
import { fitsInto, formatProductAmount, getStock, productName, store, warehouseSites } from '../goods';
import { getStaffMember, invalidateStaffIndex, isEmployed } from '../staff';
import { addInfluence, controllerOf, getInfluence, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import { pickRaidTarget, pickTarget } from './ai';
import { statusOf } from './common';
import { GANGS, type Gang } from './data';
import {
  type GangStatus,
  gangMemories,
  getGangStatus,
  INCIDENT_CHOICES,
  intimidationFactor,
  raidTargets,
  scriptedRaid,
} from './index';
import { type GangIncident, runMethod } from './methods';
import { onEncounterResolved } from './reactions';
import { gangVeedel } from './state';
import { GANG_VOICES, INCIDENT_TEXTS } from './texts';

function gang(id: string): Gang {
  const g = GANGS.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

function status(sim: Simulation, gangId: string): GangStatus {
  const s = getGangStatus(sim.state, gangId);
  if (!s) throw new Error(`Gang ${gangId} fehlt`);
  return s;
}

function hire(sim: Simulation, spotId: string, loyalty = 30): string {
  wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  const id = (result.data as { staffId: string }).staffId;
  const m = getStaffMember(sim.state, id);
  if (m) m.stats.loyalty = loyalty;
  return id;
}

function run(sim: Simulation, gangId: string, method: 'poach' | 'intimidate'): boolean {
  const ctx = sim.ctx('gangs');
  const s = statusOf(ctx, gangId);
  if (!s) throw new Error(gangId);
  return runMethod(ctx, gang(gangId), s, method);
}

function incidents(sim: Simulation): GangIncident[] {
  return sim.state.modules.gangs.incidents;
}

function respond(sim: Simulation, incident: GangIncident, choice: string) {
  return sim.dispatch({ type: 'gangs.respond', payload: { incidentId: incident.id, choice } });
}

/** Hamburg freischalten und live schalten (Köln schläft danach). */
function switchToHamburg(sim: Simulation): void {
  unlockCity(sim.ctx('city'), 'hamburg');
  const result = sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } });
  if (!result.ok) throw new Error(result.reason);
  expect(activeCity(sim.state)).toBe('hamburg');
}

function raidResolved(outcome: 'success' | 'failure'): GameEvents['encounter.resolved'] {
  return {
    encounterId: 1,
    kind: 'raidDefense',
    outcome,
    request: {
      kind: 'raidDefense',
      opponent: { factionId: 'ost', label: 'Leute', strength: 50, count: 2 },
      origin: { module: 'gangs', ref: 'raid:ost' },
    },
    playerKilled: false,
  };
}

describe('Gedächtnis „Überfall abgewehrt“ nur, wenn du gewinnst', () => {
  it('abgewehrt (success): die Gang merkt es sich; verloren (failure): kein „abgewehrt“', () => {
    const won = createTestGame();
    onEncounterResolved(won.ctx('gangs'), raidResolved('success'));
    expect(gangMemories(won.state, 'ost').map((m) => m.kind)).toContain('raidRepelled');

    const lost = createTestGame();
    onEncounterResolved(lost.ctx('gangs'), raidResolved('failure'));
    expect(gangMemories(lost.state, 'ost').map((m) => m.kind)).not.toContain('raidRepelled');
  });
});

describe('Vorfälle der schlafenden Stadt ruhen', () => {
  it('ein Kölner Abwerbe-Vorfall läuft nicht ab, solange Hamburg live ist, und erst nach der Rückkehr', () => {
    const sim = createTestGame({ seed: 3 });
    const member = hire(sim, 'ebertplatz');
    expect(run(sim, 'ost', 'poach')).toBe(true);
    const [incident] = incidents(sim);
    expect(incident.cityId).toBe('koeln');
    switchToHamburg(sim);
    sim.advance(incident.expiresAt - sim.state.time + 3 * 60);
    expect(incidents(sim).some((i) => i.id === incident.id)).toBe(true);
    expect(isEmployed(sim.state, member)).toBe(true);
    // Zurück in Köln: Die Frist ist um, jetzt gilt die vorsichtige Wahl (gehen lassen).
    expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } }).ok).toBe(true);
    sim.advance(2 * 60);
    expect(incidents(sim).some((i) => i.id === incident.id)).toBe(false);
    expect(isEmployed(sim.state, member)).toBe(false);
  });
});

describe('gekaufte Gang-Ware nur mit Platz und in der Stadt der Gang', () => {
  it('Ist im Lager kein Platz, scheitert der Kauf ohne Zahlung, das Angebot bleibt', () => {
    const sim = createTestGame();
    const s = status(sim, 'ost');
    s.relation = 100;
    s.hostility = 0;
    // Lager bis auf 50 g voll machen (store prüft keinen Platz).
    sim.state.modules.goods.stock = {};
    const free = 50;
    const fill = fitsInto(sim.state, 'ehrenfeld', 'weed') - free;
    store(sim.ctx('test'), { productId: 'weed', amount: fill, warehouseId: 'ehrenfeld' });
    wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
    s.offer = { id: 7, amount: 100, price: 400, expiresAt: sim.state.time + 60 };
    const money = sim.state.wallet.dirty;
    const result = sim.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: 'ost', offerId: 7 } });
    expect(result.ok).toBe(false);
    expect(sim.state.wallet.dirty).toBe(money);
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBe(fill);
    expect(s.offer?.id).toBe(7);
    // Passt es, klappt der Kauf.
    s.offer = { id: 8, amount: free, price: 200, expiresAt: sim.state.time + 60 };
    expect(sim.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: 'ost', offerId: 8 } }).ok).toBe(true);
    expect(getStock(sim.state, { warehouseId: 'ehrenfeld' })).toBe(fill + free);
  });

  it('Ware einer Hamburger Gang landet in deinem Hamburger Lager, ohne Lager dort gibt es keinen Kauf', () => {
    const sim = createTestGame();
    switchToHamburg(sim);
    const hh = gang('hh-hafen');
    const s = status(sim, hh.id);
    s.relation = 100;
    s.hostility = 0;
    wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
    const koeln = getStock(sim.state, { cityId: 'koeln' });
    s.offer = { id: 9, amount: 100, price: 400, expiresAt: sim.state.time + 60 };
    expect(sim.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: hh.id, offerId: 9 } }).ok).toBe(false);
    const site = warehouseSites('hamburg')[0];
    sim.state.modules.goods.owned.push(site.id);
    const hamburg = getStock(sim.state, { cityId: 'hamburg' });
    expect(sim.dispatch({ type: 'gangs.acceptOffer', payload: { gangId: hh.id, offerId: 9 } }).ok).toBe(true);
    expect(getStock(sim.state, { cityId: 'hamburg' })).toBe(hamburg + 100);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(koeln);
  });
});

describe('Gefallen zahlt die Gang aus ihrer Kasse', () => {
  function favorIncident(sim: Simulation, amount: number): GangIncident {
    const incident: GangIncident = {
      id: 9001,
      kind: 'favor',
      gangId: 'west',
      byGangId: 'west',
      cityId: 'koeln',
      at: sim.state.time,
      expiresAt: sim.state.time + 8 * 60,
      warehouseId: 'ehrenfeld',
      amount,
    };
    sim.state.modules.gangs.incidents.push(incident);
    return incident;
  }

  it('volle Kasse: der ganze Betrag wandert von der Gang zu dir', () => {
    const sim = createTestGame();
    const s = status(sim, 'west');
    s.money = 5000;
    const incident = favorIncident(sim, 600);
    const money = sim.state.wallet.dirty;
    expect(respond(sim, incident, 'accept').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money + 600);
    expect(s.money).toBe(4400);
  });

  it('knappe Kasse: nur, was drin ist; nichts entsteht aus dem Nichts', () => {
    const sim = createTestGame();
    const s = status(sim, 'west');
    s.money = 200;
    const incident = favorIncident(sim, 600);
    const money = sim.state.wallet.dirty;
    expect(respond(sim, incident, 'accept').ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money + 200);
    expect(s.money).toBe(0);
  });
});

describe('Überfall und Eintreiben nur in der Stadt, die live ist', () => {
  it('Kölner Gang bei aktivem Hamburg: abgelehnt, keine Abmachung bricht', () => {
    const sim = createTestGame({ seed: 11 });
    const s = status(sim, 'ost');
    s.ceasefireUntil = sim.state.time + 10_000;
    switchToHamburg(sim);
    const attack = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [], playerPresent: true },
    });
    expect(attack).toEqual({ ok: false, reason: 'Du bist nicht in der Stadt.' });
    expect(s.ceasefireUntil).not.toBeNull();
    s.protection = { amount: 800, nextDueAt: sim.state.time + 10_000, overdue: true };
    expect(sim.dispatch({ type: 'gangs.collect', payload: { gangId: 'ost', playerPresent: true } })).toEqual({
      ok: false,
      reason: 'Du bist nicht in der Stadt.',
    });
    expect(s.protection.overdue).toBe(true);
  });

  it('Hamburg live, du selbst noch in Köln: „Selbst mitgehen“ allein reicht nicht', () => {
    const sim = createTestGame({ seed: 11 });
    switchToHamburg(sim);
    const hh = GANGS.find((g) => g.cityId === 'hamburg' && raidTargets(sim.state, g.id).length > 0);
    if (!hh) throw new Error('keine Hamburger Gang mit Spot');
    const result = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: hh.id, veedelId: raidTargets(sim.state, hh.id)[0], staffIds: [], playerPresent: true },
    });
    expect(result).toEqual({ ok: false, reason: 'Du bist gerade nicht in der Stadt.' });
  });
});

describe('Überfall nur auf ein Lager, in dem etwas liegt', () => {
  it('von zwei Kölner Lagern wird immer das mit Ware gewählt', () => {
    const sim = createTestGame({ seed: 3 });
    sim.state.modules.goods.owned.push('nippes');
    sim.state.modules.goods.stock = {};
    store(sim.ctx('test'), { productId: 'weed', amount: 300, warehouseId: 'nippes' });
    const ctx = sim.ctx('gangs');
    const g = gang('ost');
    const s = status(sim, 'ost');
    for (let i = 0; i < 30; i++) {
      const target = pickRaidTarget(ctx, g, s);
      expect(target?.kind).toBe('warehouse');
      if (target?.kind === 'warehouse') expect(target.warehouseId).toBe('nippes');
    }
  });
});

describe('Gang ohne Revier respektiert Frieden, Schonfrist und Sperren beim Heimat-Veedel', () => {
  it('kein Vorstoß in dein Heimat-Veedel der Gang während Schonfrist oder Waffenstillstand', () => {
    const sim = createTestGame({ seed: 7 });
    const ctx = sim.ctx('test');
    const g = gang('ost');
    const home = g.homeVeedelId;
    // Die Gang verliert überall ihren Einfluss, ihr Heimat-Veedel übernimmst du.
    for (const v of allVeedel(g.cityId)) {
      if (getInfluence(sim.state, v.id, g.id) > 0) addInfluence(ctx, v.id, g.id, -100);
    }
    for (const f of Object.keys(sim.state.modules.territory.influence[home] ?? {})) addInfluence(ctx, home, f, -100);
    addInfluence(ctx, home, PLAYER_FACTION, 60);
    sim.advance(60);
    expect(controllerOf(sim.state, home)).toBe(PLAYER_FACTION);
    expect(gangVeedel(sim.state, g.id)).toEqual([]);
    const s = status(sim, g.id);
    s.push = null;
    s.ceasefireUntil = null;
    s.tribute = null;
    s.alliance = null;
    const gangsCtx = sim.ctx('gangs');
    // Schonfrist nach deiner Übernahme.
    expect(sim.state.modules.gangs.graceUntil?.[home]).toBeGreaterThan(sim.state.time);
    expect(pickTarget(gangsCtx, g, s)).toBeNull();
    // Schonfrist vorbei: Sie will ihr Heimat-Veedel zurück.
    sim.state.modules.gangs.graceUntil = {};
    expect(pickTarget(gangsCtx, g, s)).toBe(home);
    // Waffenstillstand: nicht in dein Revier.
    s.ceasefireUntil = sim.state.time + 10_000;
    expect(pickTarget(gangsCtx, g, s)).toBeNull();
  });
});

describe('Sicherheit hinschicken während einer laufenden Konfrontation', () => {
  it('wird abgelehnt, statt die Gang ohne Wurf abziehen zu lassen', () => {
    const sim = createTestGame({ seed: 11 });
    hire(sim, 'ebertplatz', 80);
    const guard = hire(sim, 'neumarkt', 80);
    const m = getStaffMember(sim.state, guard);
    if (!m) throw new Error('kein Mitarbeiter');
    m.role = 'security';
    m.assignment = null;
    invalidateStaffIndex();
    expect(run(sim, 'nord', 'intimidate')).toBe(true);
    const incident = incidents(sim).find((i) => i.kind === 'intimidation');
    if (!incident?.spotId) throw new Error('keine Einschüchterung');
    expect(INCIDENT_CHOICES.intimidation).toContain('security');
    // Eine Konfrontation wartet auf dich (Straßenkampf beim Überfall mit dir selbst).
    status(sim, 'ost').money = 20_000;
    const attack = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId: 'ost', veedelId: 'kalk', staffIds: [], playerPresent: true },
    });
    expect(attack.ok).toBe(true);
    expect(activeEncounters(sim.state).length).toBeGreaterThan(0);
    const result = respond(sim, incident, 'security');
    expect(result).toEqual({ ok: false, reason: 'Gerade läuft schon eine Konfrontation.' });
    expect(intimidationFactor(sim.state, incident.spotId)).toBeLessThan(1);
    expect(incidents(sim).some((i) => i.id === incident.id)).toBe(true);
  });
});

describe('Journal des geskripteten Überfalls mit der richtigen Einheit je Ware', () => {
  it('Gramm, Stück und ml stehen getrennt, keine Summe „g Ware“', () => {
    const sim = createTestGame();
    sim.state.modules.goods.stock = {};
    store(sim.ctx('test'), { productId: 'weed', amount: 100, warehouseId: 'ehrenfeld' });
    store(sim.ctx('test'), { productId: 'edibles', amount: 10, warehouseId: 'ehrenfeld' });
    const result = scriptedRaid(sim.ctx('gangs'), { spotId: 'neumarkt', goodsShare: 0.3, cashShare: 0.4 });
    expect(result?.goodsLost).toBe(33);
    const entry = sim.state.journal.find((j) => j.text.includes('überfallen'));
    expect(entry?.text).toContain(`${formatProductAmount('weed', 30)} ${productName('weed')}`);
    expect(entry?.text).toContain(`${formatProductAmount('edibles', 3)} ${productName('edibles')}`);
    expect(entry?.text).not.toMatch(/\d g Ware/);
  });
});

describe('Gangs mit Artikel im Namen in den Vorfall-Texten', () => {
  it('kein „von Die …“, „Die von …“ oder „ist Die …“ für irgendeine Gang', () => {
    const wrong = /\b(von|zu|mit|ist|bei)\s(Die|Das|Der)\s|\bDie von\b/;
    for (const key of ['burglaryGang', 'poach', 'intimidationReport'] as const) {
      for (const template of INCIDENT_TEXTS[key]) {
        expect(template, key).not.toContain('{gang}');
        for (const g of GANGS) {
          const text = fillText(template, {
            gang: g.name,
            crew: g.crew,
            warehouse: 'Lager Ehrenfeld',
            goods: '40 g Gras',
            extra: '30 €',
            spot: 'Ebertplatz',
            atSpot: 'am Ebertplatz',
            AtSpot: 'Am Ebertplatz',
          });
          expect(text, `${g.id}: ${template}`).not.toMatch(wrong);
        }
      }
    }
  });
});

describe('Ware im Gang-Krieg bringt nur, was die Gang zahlen kann', () => {
  it('knappe Kasse: du bekommst nur ihren Kassenstand', () => {
    const sim = createTestGame();
    store(sim.ctx('test'), { productId: 'weed', amount: 200, quality: 0.6, unitCost: 4 });
    const s = status(sim, 'nord');
    s.money = 100;
    sim.state.modules.gangs.wars = [
      {
        id: 4242,
        cityId: 'koeln',
        attacker: 'nord',
        defender: 'ost',
        veedelId: gang('ost').homeVeedelId,
        startedAt: sim.state.time,
        asker: 'nord',
        support: null,
      },
    ];
    const money = sim.state.wallet.dirty;
    expect(sim.dispatch({ type: 'gangs.supportWar', payload: { warId: 4242, kind: 'goods' } }).ok).toBe(true);
    expect(sim.state.wallet.dirty).toBe(money + 100);
    expect(s.money).toBe(0);
  });
});

describe('Abgeworbener, der nach einer Drohung geht, verstärkt die Gang', () => {
  it('geht er, hat die Gang einen Mann mehr', () => {
    let left = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createTestGame({ seed });
      const member = hire(sim, 'ebertplatz', 10);
      expect(run(sim, 'ost', 'poach')).toBe(true);
      const people = status(sim, 'ost').people;
      respond(sim, incidents(sim)[0], 'threaten');
      if (isEmployed(sim.state, member)) {
        expect(status(sim, 'ost').people).toBe(people);
      } else {
        left++;
        expect(status(sim, 'ost').people).toBe(people + 1);
      }
    }
    expect(left).toBeGreaterThan(0);
  });
});

describe('Angebote und Erpressungen nennen keine feste Zeit, die nicht zur Frist passt', () => {
  it('kein „in einer Stunde“, „bis morgen“, „bis Börsenschluss“ oder „bis Ladenschluss“ (Fristen 4 bzw. 8 Std.)', () => {
    const fixed = /in einer Stunde|bis morgen|Börsenschluss|Ladenschluss/i;
    for (const [id, voice] of Object.entries(GANG_VOICES)) {
      for (const text of [...voice.offer, ...voice.blackmail]) expect(text, id).not.toMatch(fixed);
    }
  });
});
