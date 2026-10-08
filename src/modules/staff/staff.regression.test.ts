// Regressionstests zum Bugreview (Personal): Abtauchen und Rückkehr, Verrat, Löhne mit Buchhalter, Texte.

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { getPost } from '../hierarchy';
import { getHeat } from '../police';
import { getSpot } from '../spots';
import { INJURED_WAGE_FACTOR, SPECIALIST_GOOD_STAT, TALK_HEAT } from './config';
import {
  activeRunnerAt,
  effectiveWage,
  enlist,
  generateProfile,
  getStaffMember,
  runnerAt,
  type StaffMember,
  type StaffRole,
  securityAt,
  setStatus,
  wageDue,
} from './index';
import { betray } from './routines';

function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.dirty = 50000;
  return sim;
}

function recruit(sim: Simulation, role: StaffRole, level = 1): StaffMember {
  const ctx = sim.ctx('staff');
  const member = enlist(ctx, generateProfile(ctx, role, { level }), { origin: 'pool' });
  member.stats.loyalty = 80;
  return member;
}

function neumarktVeedel(sim: Simulation): string {
  return getSpot(sim.state, 'neumarkt')?.veedelId ?? '';
}

/** Alle Leute im Veedel des Neumarkts für zwei Stunden abtauchen lassen. */
function lieLowAtNeumarkt(sim: Simulation): void {
  const until = sim.state.time + 120;
  expect(sim.dispatch({ type: 'staff.lieLow', payload: { veedelId: neumarktVeedel(sim), until } }).ok).toBe(true);
}

function hireRunnerAtNeumarkt(sim: Simulation): StaffMember {
  expect(sim.dispatch({ type: 'staff.hireRunner', payload: { spotId: 'neumarkt' } }).ok).toBe(true);
  return activeRunnerAt(sim.state, 'neumarkt') as StaffMember;
}

describe('Abgetauchte Sicherheit kommt nicht neben eine neu eingesetzte zurück', () => {
  it('nach dem Abtauchen steht nur eine Sicherheit am Spot, die andere bleibt frei', () => {
    const sim = quietGame();
    const a = recruit(sim, 'security');
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: a.id, assignment: { kind: 'spot', targetId: 'neumarkt' } },
      }).ok,
    ).toBe(true);
    lieLowAtNeumarkt(sim);
    expect(getStaffMember(sim.state, a.id)?.assignment).toBeNull();
    // Während des Abtauchens holt der Spieler eine andere Sicherheit an den Spot.
    const b = recruit(sim, 'security');
    expect(
      sim.dispatch({
        type: 'staff.assign',
        payload: { staffId: b.id, assignment: { kind: 'spot', targetId: 'neumarkt' } },
      }).ok,
    ).toBe(true);
    sim.advance(180);
    expect(sim.state.modules.staff.hiding).toEqual({});
    expect(securityAt(sim.state, { spotId: 'neumarkt' }).map((m) => m.id)).toEqual([b.id]);
    expect(getStaffMember(sim.state, a.id)?.assignment).toBeNull();
    expect(sim.state.journal.some((j) => j.text.startsWith(`${a.name} bleibt ohne Einsatz`))).toBe(true);
  });

  it('ohne neue Sicherheit geht die Abgetauchte zurück an ihren Spot', () => {
    const sim = quietGame();
    const a = recruit(sim, 'security');
    sim.dispatch({
      type: 'staff.assign',
      payload: { staffId: a.id, assignment: { kind: 'spot', targetId: 'neumarkt' } },
    });
    lieLowAtNeumarkt(sim);
    sim.advance(180);
    expect(securityAt(sim.state, { spotId: 'neumarkt' }).map((m) => m.id)).toEqual([a.id]);
  });
});

describe('Abgetauchte Läufer gehen nicht still verloren', () => {
  it('ist der Spot inzwischen besetzt, steht das im Journal', () => {
    const sim = quietGame();
    const hidden = hireRunnerAtNeumarkt(sim);
    lieLowAtNeumarkt(sim);
    const replacement = hireRunnerAtNeumarkt(sim);
    expect(replacement.id).not.toBe(hidden.id);
    sim.advance(180);
    expect(activeRunnerAt(sim.state, 'neumarkt')?.id).toBe(replacement.id);
    expect(getStaffMember(sim.state, hidden.id)?.assignment).toBeNull();
    const line = sim.state.journal.find((j) => j.text.startsWith(`${hidden.name} bleibt ohne Einsatz`));
    expect(line?.text).toContain('steht inzwischen jemand anderes');
  });

  it('wer beim Ende des Abtauchens verletzt ist, kehrt nach der Heilung an seinen Spot zurück', () => {
    const sim = quietGame();
    const runner = hireRunnerAtNeumarkt(sim);
    lieLowAtNeumarkt(sim);
    // So setzen Konfrontationen den Status (auch für Leute ohne Einsatz, z. B. in der Crew).
    expect(setStatus(sim.ctx('encounters'), runner.id, 'injured')).toBe(true);
    expect(getStaffMember(sim.state, runner.id)?.returnTo).toBeNull();
    sim.advance(180);
    expect(sim.state.modules.staff.hiding).toEqual({});
    // Der Platz wartet wie nach einer Verletzung am Spot.
    expect(getStaffMember(sim.state, runner.id)?.returnTo).toEqual({ kind: 'spot', targetId: 'neumarkt' });
    expect(runnerAt(sim.state, 'neumarkt')?.id).toBe(runner.id);
    sim.advance(2 * 1440);
    const back = getStaffMember(sim.state, runner.id);
    expect(back?.status).toBe('active');
    expect(back?.assignment).toEqual({ kind: 'spot', targetId: 'neumarkt' });
  });
});

describe('Verrat „Reden“ bei Verletzten heizt das Veedel des Spots an', () => {
  it('die Heat landet im Veedel, nicht unter der ID des Spots', () => {
    const sim = quietGame();
    const runner = hireRunnerAtNeumarkt(sim);
    setStatus(sim.ctx('encounters'), runner.id, 'injured');
    const veedelId = neumarktVeedel(sim);
    const before = getHeat(sim.state, veedelId);
    const member = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(member.assignment).toBeNull();
    expect(betray(sim.ctx('staff'), member, 'talk')).toBe(TALK_HEAT);
    expect(getHeat(sim.state, veedelId)).toBe(before + TALK_HEAT);
    expect(sim.state.modules.police.heat.neumarkt).toBeUndefined();
  });
});

describe('Tageskosten von Ausgefallenen mit Buchhalter', () => {
  it('wageDue rechnet den Buchhalter ein und trifft genau die Buchung um Mitternacht', () => {
    const sim = quietGame();
    const runner = hireRunnerAtNeumarkt(sim);
    runner.wage = 400;
    const ctx = sim.ctx('staff');
    const accountant = enlist(ctx, generateProfile(ctx, 'accountant'), { origin: 'pool', cityId: 'koeln' });
    const v = SPECIALIST_GOOD_STAT;
    accountant.stats = { speed: v, caution: v, strength: v, charisma: v, loyalty: 70 };
    setStatus(sim.ctx('encounters'), runner.id, 'injured', sim.state.time + 3 * 1440);
    const member = getStaffMember(sim.state, runner.id) as StaffMember;
    expect(effectiveWage(member)).toBe(Math.round(400 * INJURED_WAGE_FACTOR));
    const due = wageDue(sim.state, member);
    expect(due).toBeLessThan(effectiveWage(member));
    const booked: number[] = [];
    sim.onEvent((e) => {
      if (e.type === 'wallet.changed' && e.payload.category === 'wages.injured') booked.push(-e.payload.amount);
    });
    sim.advance(1440 - (sim.state.time % 1440));
    expect(booked).toEqual([due]);
  });
});

describe('Verrat „Ware“ nimmt die Ware der Stadt, in der geklaut wird', () => {
  it('liegt der größte Bestand in einer anderen Stadt, fehlt trotzdem Ware in Köln (nicht Geld)', () => {
    const sim = quietGame();
    const events = recordEvents(sim);
    const runner = hireRunnerAtNeumarkt(sim);
    const stock = sim.state.modules.goods.stock;
    for (const id of Object.keys(stock)) stock[id] = [];
    stock.ehrenfeld = [{ id: 9001, productId: 'weed', amount: 20, quality: 1, cut: 0, unitCost: 3 }];
    stock['werkstatt-ottensen'] = [{ id: 9002, productId: 'hash', amount: 1000, quality: 1, cut: 0, unitCost: 3 }];
    const money = sim.state.wallet.dirty;
    const taken = betray(sim.ctx('staff'), runner, 'goods');
    sim.step();
    expect(taken).toBeGreaterThan(0);
    expect(stock.ehrenfeld[0].amount).toBe(20 - taken);
    expect(stock['werkstatt-ottensen'][0].amount).toBe(1000);
    expect(sim.state.wallet.dirty).toBe(money);
    expect(eventsOfType(events, 'staff.betrayed').at(-1)?.payload).toMatchObject({ staffId: runner.id, kind: 'goods' });
  });
});

describe('Abtauchen ohne Leute auf der Straße', () => {
  it('der Verlauf sagt nicht „0 Leute“', () => {
    const sim = quietGame();
    lieLowAtNeumarkt(sim);
    const line = sim.state.journal.find((j) => j.text.includes('taucht ab'));
    expect(line?.text).not.toContain('0 Leute');
    expect(line?.text).toContain('niemand von deinen Leuten');
  });
});

describe('Festnahme-Nachricht des Leutnants passt zum Stillhaltegeld', () => {
  function arrestedMessage(jailSupport: boolean): string {
    const sim = quietGame();
    const runner = hireRunnerAtNeumarkt(sim);
    runner.jailSupport = jailSupport;
    const lead = recruit(sim, 'runner', 2);
    expect(sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lead.id, spotIds: ['neumarkt'] } }).ok).toBe(
      true,
    );
    // Der Leutnant regelt den Ausfall nicht selbst, er fragt.
    const post = getPost(sim.state, lead.id);
    if (post) post.settings.onAbsent = 'wait';
    sim.ctx('police').emit('police.arrest', { staffId: runner.id, veedelId: neumarktVeedel(sim) });
    sim.step();
    expect(getStaffMember(sim.state, runner.id)?.status).toBe('jailed');
    const message = sim.state.messages.list.filter((m) => m.contactId === `staff:${lead.id}`).at(-1);
    return message?.text ?? '';
  }

  it('ohne Stillhaltegeld heißt es nicht „Kostet jetzt nur Stillhaltegeld“', () => {
    const text = arrestedMessage(false);
    expect(text).toContain('Ohne Stillhaltegeld');
    expect(text).not.toContain('Kostet jetzt nur Stillhaltegeld');
  });

  it('mit Stillhaltegeld bleibt der alte Satz', () => {
    expect(arrestedMessage(true)).toContain('Kostet jetzt nur Stillhaltegeld');
  });
});
