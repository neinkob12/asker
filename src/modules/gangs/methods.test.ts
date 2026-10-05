import { describe, expect, it } from 'vitest';
import { clock, MINUTES_PER_DAY as DAY, messages, type Simulation, wallet } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { activeEncounters, autoResolveEncounter } from '../encounters';
import { getStock, getWarehouses, store } from '../goods';
import { getHeat } from '../police';
import { getSpot } from '../spots';
import { getStaff, getStaffMember, isEmployed } from '../staff';
import { statusOf } from './common';
import { METHOD_GLOBAL_GAP, METHOD_INTERVAL_BY_CITY, THREAT_AT } from './config';
import { GANGS, type Gang, type GangMethod } from './data';
import {
  type GangIncident,
  goodTurns,
  incidentChoices,
  intimidationFactor,
  maybePressure,
  onRecoverResolved,
  runMethod,
} from './methods';
import { getGangStatus } from './state';

function gang(id: string): Gang {
  const g = GANGS.find((x) => x.id === id);
  if (!g) throw new Error(id);
  return g;
}

function run(sim: Simulation, gangId: string, method: GangMethod): boolean {
  const ctx = sim.ctx('gangs');
  const s = statusOf(ctx, gangId);
  if (!s) throw new Error(gangId);
  return runMethod(ctx, gang(gangId), s, method);
}

function incidents(sim: Simulation): GangIncident[] {
  return sim.state.modules.gangs.incidents;
}

/** Bis zur nächsten vollen Stunde h vorspulen. */
function advanceToHour(sim: Simulation, h: number): void {
  while (clock.hour(sim.state.time) !== h || sim.state.time % 60 !== 0) sim.advance(60 - (sim.state.time % 60) || 60);
}

function hire(sim: Simulation, spotId: string, loyalty = 20): string {
  wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
  const result = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId } });
  if (!result.ok) throw new Error(result.reason);
  const id = (result.data as { staffId: string }).staffId;
  const m = getStaffMember(sim.state, id);
  if (m) m.stats.loyalty = loyalty;
  return id;
}

/** Ware ins erste Kölner Lager legen (Läufer verkaufen bis zur Nacht oft alles). */
function stock(sim: Simulation, amount = 300): void {
  const w = getWarehouses(sim.state, 'koeln')[0];
  store(sim.ctx('test'), { productId: 'weed', amount, warehouseId: w.id, quality: 0.6, unitCost: 3 });
}

function respond(sim: Simulation, incident: GangIncident, choice: string) {
  return sim.dispatch({ type: 'gangs.respond', payload: { incidentId: incident.id, choice } });
}

/** Einbruch planen und die Nacht abwarten (bis 6 Uhr, gemeldet wird um 7). */
function burgle(sim: Simulation, gangId: string): GangIncident {
  stock(sim);
  expect(run(sim, gangId, 'burglary')).toBe(true);
  advanceToHour(sim, 6);
  const incident = incidents(sim).find((i) => i.kind === 'burglary' && i.byGangId === gangId);
  if (!incident) throw new Error('kein Einbruch');
  expect(incident.plannedAt).toBeUndefined();
  return incident;
}

describe('Gang-Methoden (Auftrag 23)', () => {
  it('Einbruch: am Tag geplant, nachts gestohlen, am Morgen gemeldet, mit Antworten', () => {
    const sim = createTestGame({ seed: 4 });
    const events = recordEvents(sim);
    advanceToHour(sim, 12);
    stock(sim);
    const before = getStock(sim.state, { cityId: 'koeln' });
    expect(run(sim, 'west', 'burglary')).toBe(true);
    // Erst geplant: noch nichts weg, nichts zu sehen.
    const [planned] = incidents(sim);
    expect(planned.plannedAt).toBeGreaterThan(sim.state.time);
    expect(clock.hour(planned.plannedAt ?? 0)).toBeGreaterThanOrEqual(1);
    expect(clock.hour(planned.plannedAt ?? 0)).toBeLessThan(5);
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(before);
    advanceToHour(sim, 6);
    const [incident] = incidents(sim);
    expect(incident.reported).toBe(false);
    expect(incident.amount).toBeGreaterThan(0);
    // Noch keine Nachricht in der Nacht.
    expect(messages.thread(sim.state, 'other:neighbor')).toHaveLength(0);
    advanceToHour(sim, 8);
    const report = messages.thread(sim.state, 'other:neighbor').at(-1);
    expect(report?.options?.map((o) => o.id)).toContain('hunt');
    expect(report?.options?.map((o) => o.id)).toContain('drop');
    expect(eventsOfType(events, 'gang.burglary')).toHaveLength(1);
    // Abhaken schließt den Vorfall.
    expect(respond(sim, incident, 'drop').ok).toBe(true);
    expect(incidents(sim)).toHaveLength(0);
  });

  it('Einbruch: Syndikat und Marienburger Kreis brechen auch ein (nicht nur, wenn der Wurf nachts fällt)', () => {
    for (const gangId of ['west', 'sued']) {
      const sim = createTestGame({ seed: 2 });
      advanceToHour(sim, 15);
      expect(burgle(sim, gangId).byGangId).toBe(gangId);
    }
  });

  it('Täter suchen: Erfolg bringt Ware zurück', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = createTestGame({ seed });
      hire(sim, 'ebertplatz', 80);
      advanceToHour(sim, 12);
      const incident = burgle(sim, 'west');
      advanceToHour(sim, 8);
      if (!incident.amount) continue;
      const stolen = getStock(sim.state, { cityId: 'koeln' });
      expect(respond(sim, incident, 'hunt').ok).toBe(true);
      const [encounter] = activeEncounters(sim.state);
      expect(encounter.kind).toBe('recoverLoot');
      autoResolveEncounter(sim.ctx('test'), encounter.id);
      sim.advance(1);
      expect(incidents(sim)).toHaveLength(0);
      if (getStock(sim.state, { cityId: 'koeln' }) > stolen) return; // Erfolg gesehen.
    }
    throw new Error('In sechs Seeds keine erfolgreiche Suche');
  });

  it('Täter suchen: Rückzug und Niederlage bringen nichts zurück', () => {
    for (const outcome of ['retreat', 'failure']) {
      const sim = createTestGame({ seed: 1 });
      advanceToHour(sim, 12);
      const incident = burgle(sim, 'west');
      const before = getStock(sim.state, { cityId: 'koeln' });
      onRecoverResolved(sim.ctx('gangs'), incident.id, outcome);
      expect(getStock(sim.state, { cityId: 'koeln' }), outcome).toBe(before);
      expect(incidents(sim)).toHaveLength(0);
    }
  });

  it('Täter suchen ohne Leute in der Stadt: Rückzug, die Ware bleibt weg', () => {
    const sim = createTestGame({ seed: 1 });
    advanceToHour(sim, 12);
    const incident = burgle(sim, 'west');
    advanceToHour(sim, 8);
    if (!incident.amount) throw new Error('nichts gestohlen');
    for (const m of getStaff(sim.state)) m.cityId = 'hamburg';
    const before = getStock(sim.state, { cityId: 'koeln' });
    const events = recordEvents(sim);
    expect(respond(sim, incident, 'hunt').ok).toBe(true);
    const [encounter] = activeEncounters(sim.state);
    expect(encounter.request.staffIds ?? []).toHaveLength(0);
    autoResolveEncounter(sim.ctx('test'), encounter.id);
    sim.advance(1);
    expect(eventsOfType(events, 'encounter.resolved')[0]?.payload.outcome).not.toBe('success');
    expect(getStock(sim.state, { cityId: 'koeln' })).toBe(before);
  });

  it('Einbruch: verpfeifen, wenn die Spur zu einer Gang führt, rauswerfen bei einem eigenen Mann', () => {
    const sim = createTestGame({ seed: 4 });
    const runner = hire(sim, 'ebertplatz');
    advanceToHour(sim, 12);
    const incident = burgle(sim, 'west');
    incident.trail = 'gang';
    incident.gangId = 'west';
    incident.staffId = undefined;
    advanceToHour(sim, 8);
    expect(incidentChoices(sim.state, incident)).not.toContain('fire');
    expect(respond(sim, incident, 'fire').ok).toBe(false);
    const events = recordEvents(sim);
    expect(respond(sim, incident, 'snitch').ok).toBe(true);
    expect(eventsOfType(events, 'police.tipOff')).toHaveLength(1);

    // Zweiter Einbruch, diesmal war es der eigene Läufer.
    sim.state.modules.gangs.lastMethodAt = null;
    advanceToHour(sim, 12);
    const second = burgle(sim, 'nord');
    second.trail = 'insider';
    second.gangId = null;
    second.staffId = runner;
    advanceToHour(sim, 8);
    expect(incidentChoices(sim.state, second)).toEqual(['drop', 'hunt', 'fire']);
    const options = messages
      .thread(sim.state, 'other:neighbor')
      .at(-1)
      ?.options?.map((o) => o.id);
    expect(options?.sort()).toEqual(['drop', 'fire', 'hunt']);
    expect(respond(sim, second, 'snitch').ok).toBe(false);
    expect(respond(sim, second, 'fire').ok).toBe(true);
    expect(isEmployed(sim.state, runner)).toBe(false);
  });

  it('Einbruch: Protokoll und Gangs-Seite nur bei der Gang, zu der die Spur führt', () => {
    const sim = createTestGame({ seed: 4 });
    advanceToHour(sim, 12);
    const incident = burgle(sim, 'west');
    incident.trail = 'junkies';
    incident.gangId = null;
    advanceToHour(sim, 8);
    expect(sim.state.modules.gangs.log.west ?? []).toHaveLength(0);
    expect(incidentChoices(sim.state, incident)).toEqual(['drop', 'hunt']);
  });

  it('Einbruch: eine Wache am Lager verscheucht Einbrecher oft', () => {
    let foiled = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createTestGame({ seed });
      wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
      const guard = sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'ebertplatz' } });
      const id = ((guard as { data?: { staffId: string } }).data as { staffId: string }).staffId;
      const m = getStaffMember(sim.state, id);
      const w = getWarehouses(sim.state, 'koeln')[0];
      if (!m) throw new Error('kein Mitarbeiter');
      m.role = 'security';
      m.assignment = { kind: 'warehouse', targetId: w.id };
      advanceToHour(sim, 12);
      const incident = burgle(sim, 'west');
      if (incident.amount === 0) foiled++;
    }
    expect(foiled).toBeGreaterThan(2);
  });

  it('Abwerben: Lohn erhöhen hält ihn, gehen lassen verliert ihn, drohen würfelt', () => {
    const raise = createTestGame({ seed: 3 });
    const a = hire(raise, 'ebertplatz');
    const wage = getStaffMember(raise.state, a)?.wage ?? 0;
    expect(run(raise, 'ost', 'poach')).toBe(true);
    const [incident] = incidents(raise);
    const text = messages.thread(raise.state, `staff:${a}`).at(-1)?.text ?? '';
    expect(text).toContain('Schäl Sick');
    expect(respond(raise, incident, 'raise').ok).toBe(true);
    expect(getStaffMember(raise.state, a)?.wage).toBeGreaterThan(wage);
    expect(isEmployed(raise.state, a)).toBe(true);

    const release = createTestGame({ seed: 3 });
    const b = hire(release, 'ebertplatz');
    run(release, 'ost', 'poach');
    // Ohne Antwort geht er nach der Frist.
    release.advance(9 * 60);
    expect(isEmployed(release.state, b)).toBe(false);

    let stayed = 0;
    let left = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const sim = createTestGame({ seed });
      const c = hire(sim, 'ebertplatz', 30);
      run(sim, 'ost', 'poach');
      respond(sim, incidents(sim)[0], 'threaten');
      if (isEmployed(sim.state, c)) stayed++;
      else left++;
    }
    expect(stayed).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it('Einschüchtern: weniger Kunden am Spot, bis es vorbei ist', () => {
    const sim = createTestGame({ seed: 2 });
    hire(sim, 'ebertplatz', 80);
    expect(intimidationFactor(sim.state, 'ebertplatz')).toBe(1);
    expect(run(sim, 'nord', 'intimidate')).toBe(true);
    const spotId = sim.state.modules.gangs.intimidations[0].spotId;
    expect(getSpot(sim.state, spotId)).toBeDefined();
    expect(intimidationFactor(sim.state, spotId)).toBeLessThan(1);
    // Ohne Sicherheitsleute gibt es die Antwort „Sicherheit hinschicken“ nicht.
    expect(incidentChoices(sim.state, incidents(sim)[0])).not.toContain('security');
    sim.advance(9 * 60);
    expect(intimidationFactor(sim.state, spotId)).toBe(1);
    expect(incidents(sim)).toHaveLength(0);
  });

  it('Einschüchtern: Schutzgeld zahlen beendet es sofort', () => {
    const sim = createTestGame({ seed: 2 });
    hire(sim, 'ebertplatz', 80);
    wallet.earn(sim.ctx('test'), 20000, 'dirty', 'Test');
    expect(run(sim, 'nord', 'intimidate')).toBe(true);
    const [incident] = incidents(sim);
    const spotId = incident.spotId ?? '';
    expect(incidentChoices(sim.state, incident)).toContain('tribute');
    expect(respond(sim, incident, 'tribute').ok).toBe(true);
    expect(intimidationFactor(sim.state, spotId)).toBe(1);
    expect(sim.state.journal.some((e) => e.text.includes('Schutzgeld'))).toBe(true);
  });

  it('Erpressung: zahlen kostet Geld, ablehnen bringt Heat', () => {
    const pay = createTestGame({ seed: 1 });
    wallet.earn(pay.ctx('test'), 10000, 'dirty', 'Test');
    expect(run(pay, 'sued', 'blackmail')).toBe(true);
    const [incident] = incidents(pay);
    const money = pay.state.wallet.dirty;
    expect(respond(pay, incident, 'pay').ok).toBe(true);
    expect(pay.state.wallet.dirty).toBe(money - (incident.amount ?? 0));

    const refuse = createTestGame({ seed: 1 });
    run(refuse, 'sued', 'blackmail');
    const [other] = incidents(refuse);
    const heatBefore = Object.values(refuse.state.modules.police.heat).reduce((a, b) => a + b, 0);
    expect(respond(refuse, other, 'refuse').ok).toBe(true);
    const heatAfter = Object.values(refuse.state.modules.police.heat).reduce((a, b) => a + b, 0);
    expect(heatAfter).toBeGreaterThan(heatBefore);
  });

  it('Tipp an die Polizei: Heat im Veedel deines Spots', () => {
    const sim = createTestGame({ seed: 1 });
    hire(sim, 'ebertplatz', 80);
    const veedelId = getSpot(sim.state, 'ebertplatz')?.veedelId ?? '';
    const before = getHeat(sim.state, veedelId);
    expect(run(sim, 'west', 'tipOff')).toBe(true);
    expect(getHeat(sim.state, veedelId)).toBeGreaterThan(before);
    expect(messages.thread(sim.state, 'gang:west').length).toBeGreaterThan(0);
  });

  it('Chancen: Warnung vor einem Rivalen und bezahlter Gefallen', () => {
    let warned = 0;
    let favored = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = createTestGame({ seed });
      const friend = getGangStatus(sim.state, 'west');
      const enemy = getGangStatus(sim.state, 'nord');
      if (!friend || !enemy) throw new Error('Gangs fehlen');
      for (let day = 0; day < 20 && warned + favored < 12; day++) {
        friend.relation = 40;
        friend.hostility = 0;
        enemy.hostility = THREAT_AT + 10;
        enemy.stage = 2;
        sim.state.modules.gangs.lastMethodAt = null;
        goodTurns(sim.ctx('gangs'));
        for (const incident of [...incidents(sim)]) {
          if (incident.kind === 'warnRival') {
            warned++;
            wallet.earn(sim.ctx('test'), 5000, 'dirty', 'Test');
            const lastAttack = enemy.lastAttackAt;
            expect(incidentChoices(sim.state, incident)).toEqual(['thanks', 'prepare']);
            expect(respond(sim, incident, 'prepare').ok).toBe(true);
            expect(enemy.lastAttackAt).not.toBe(lastAttack);
          } else if (incident.kind === 'favor') {
            favored++;
            const money = sim.state.wallet.dirty;
            expect(respond(sim, incident, 'accept').ok).toBe(true);
            expect(sim.state.wallet.dirty).toBe(money + (incident.amount ?? 0));
          }
        }
        sim.advance(DAY);
      }
    }
    expect(warned).toBeGreaterThan(0);
    expect(favored).toBeGreaterThan(0);
    // Sechs Spiele über Wochen: unter Last knapp über den 5 Sekunden Standard.
  }, 30_000);

  it('Abklingzeiten: eine drohende Gang zeigt in etwa acht Tagen eine Methode, aber es hagelt nicht', () => {
    let shown = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = createTestGame({ seed });
      hire(sim, 'ebertplatz');
      const g = getGangStatus(sim.state, 'nord');
      if (!g) throw new Error('nord');
      const times: number[] = [];
      const start = sim.state.time;
      for (let hour = 0; hour < 20 * 24; hour++) {
        // Hafenkolonne droht (Stufe 2), greift aber nicht an; Ware liegt im Lager.
        g.hostility = THREAT_AT + 5;
        g.stage = 2;
        if (hour % 24 === 0) stock(sim, 100);
        const before = sim.state.modules.gangs.lastMethodAt;
        maybePressure(sim.ctx('gangs'), gang('nord'), g);
        if (sim.state.modules.gangs.lastMethodAt !== before) times.push(sim.state.time);
        // Nur die Uhr weiterstellen: So zählt allein diese Gang, die übrige Simulation steht.
        sim.state.time += 60;
      }
      // Erster Termin nach höchstens acht Tagen, dazu etwas Luft, falls gerade nichts geht.
      const firstWithin8 = times.some((t) => t - start <= 8.5 * DAY);
      if (firstWithin8) shown++;
      // Abstand pro Gang: zwischen zwei Methoden derselben Gang mindestens der kürzeste Abstand ihrer Stadt.
      const gap = Math.max(METHOD_INTERVAL_BY_CITY.koeln[0] * DAY, METHOD_GLOBAL_GAP);
      for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(gap);
      expect(times.length).toBeLessThanOrEqual(Math.ceil((20 * DAY) / gap));
    }
    expect(shown).toBeGreaterThanOrEqual(5);
  });

  it('eine Gang ohne Leute macht keinen Druck', () => {
    const sim = createTestGame({ seed: 1 });
    hire(sim, 'ebertplatz');
    stock(sim);
    const g = getGangStatus(sim.state, 'nord');
    if (!g) throw new Error('nord');
    for (let hour = 0; hour < 10 * 24; hour++) {
      g.hostility = THREAT_AT + 5;
      g.stage = 2;
      g.people = 1;
      maybePressure(sim.ctx('gangs'), gang('nord'), g);
      sim.advance(60);
    }
    expect(sim.state.modules.gangs.lastMethodAt).toBeNull();
  });

  it('ist deterministisch', () => {
    const play = () => {
      const sim = createTestGame({ seed: 7 });
      hire(sim, 'ebertplatz');
      advanceToHour(sim, 12);
      stock(sim);
      run(sim, 'west', 'burglary');
      run(sim, 'ost', 'poach');
      sim.advance(20 * 60);
      return JSON.stringify(sim.state.modules.gangs) + JSON.stringify(sim.state.messages.list.slice(-5));
    };
    expect(play()).toBe(play());
  });
});
