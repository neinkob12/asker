// Auftrag 28: Mit einer Rechten Hand auf höchster Stufe und allen Aufgaben an läuft Köln ohne Befehle des Spielers.
// Der Bot baut erst ein paar Tage auf (wie ein Spieler), dann übernimmt die Rechte Hand allein: Sie fährt die
// Aufträge, holt den Hafen ab, bestellt nach, stellt ein, wäscht Geld. Zehn Tage lang kommt kein einziger Befehl
// vom Spieler, trotzdem wird verkauft und niemand geht pleite.

import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../core';
import { createTestGame } from '../core/testing';
import { canBeRightHand, getLieutenantIds, getRightHand, RIGHT_HAND_RANK_XP } from '../modules/hierarchy';
import { enlist, generateProfile, getStaff } from '../modules/staff';
import { newBotStats, playFor, snapshot } from './bot';

const DAY = 1440;

describe('Köln läuft allein', () => {
  it('Rechte Hand auf höchster Stufe mit allen Aufgaben: 10 Spieltage ohne Befehle des Spielers, keine Pleite', () => {
    const sim = createTestGame({ seed: 11 });
    const stats = newBotStats();
    // Aufbau durch den Bot: Läufer, Spots, Leutnants, Hafen.
    playFor(sim, 10 * DAY, stats);
    expect(sim.state.outcome.gameOver).toBeNull();

    // Rechte Hand sicherstellen (der Bot ernennt meist selbst eine; sonst bekommt er eine erfahrene Person).
    if (!getRightHand(sim.state)) {
      expect(getLieutenantIds(sim.state).length).toBeGreaterThanOrEqual(2);
      const ctx = sim.ctx('staff');
      const boss = enlist(ctx, generateProfile(ctx, 'runner', { level: 5 }), { origin: 'pool' });
      boss.stats.loyalty = 85;
      expect(canBeRightHand(sim.state, boss.id).ok).toBe(true);
      expect(sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } }).ok).toBe(true);
    }
    const rh = getRightHand(sim.state);
    if (!rh) throw new Error('keine Rechte Hand');
    rh.xp = RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1];
    expect(
      sim.dispatch({
        type: 'hierarchy.configureRightHand',
        payload: {
          settings: {
            orders: true,
            orderMaxPrice: 6000,
            pickup: true,
            restock: true,
            restockBudgetPerDay: 5000,
            staffing: true,
            wholesale: true,
            wholesaleMaxPrice: 10000,
            laundering: true,
            launderAbove: 8000,
            launderShare: 0.5,
          },
        },
      }).ok,
    ).toBe(true);
    const member = getStaff(sim.state).find((m) => m.id === rh.staffId);
    if (member) member.stats.loyalty = 90;

    // Ab jetzt kein Befehl mehr vom Spieler.
    const before = snapshot(sim.state);
    const events: Record<string, number> = {};
    let rightHandDeliveries = 0;
    let salesLastDays = 0;
    const end = sim.state.time + 10 * DAY;
    sim.onEvent((e: GameEvent) => {
      events[e.type] = (events[e.type] ?? 0) + 1;
      if (e.type === 'order.accepted' && e.payload.by === 'rightHand') rightHandDeliveries++;
      if (e.type === 'sale.completed' && e.time >= end - 2 * DAY) salesLastDays++;
    });
    sim.advance(10 * DAY);

    const after = snapshot(sim.state);
    expect(after.gameOver, JSON.stringify({ before, after, events })).toBeNull();
    expect(after.dirty).toBeGreaterThan(0);
    // Das Geschäft läuft weiter: Verkäufe bis zum Schluss, Nachschub kommt, die Rechte Hand fährt Aufträge.
    expect(salesLastDays, JSON.stringify(after)).toBeGreaterThan(20);
    expect(events['shipment.ordered'] ?? 0).toBeGreaterThan(0);
    expect(rightHandDeliveries).toBeGreaterThan(0);
    expect(after.staff).toBeGreaterThanOrEqual(2);
    // Sie hat berichtet und etwas erledigt.
    expect(events['hierarchy.dailyReport'] ?? 0).toBeGreaterThanOrEqual(9);
    expect(getRightHand(sim.state)?.lastReport?.done ?? '').not.toBe('');
  }, 180_000);
});
