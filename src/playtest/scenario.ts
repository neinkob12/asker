// Ausgangslagen für Bot-Läufe (Auftrag 30): "Köln komplett" mit einer Rechten Hand, die alle Voraussetzungen für die
// Vollmacht erfüllt. Den Rest (Vollmacht erteilen, nach Hamburg fahren, dort anfangen) macht der Bot selbst.
// Nur für Tests und den Balancing-Bericht; verändert den Zustand direkt wie die Dev-Abkürzungen im Browser.

import type { Simulation } from '../core';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../modules/hierarchy';
import { getSpots } from '../modules/spots';
import { enlist, generateProfile, getStaff } from '../modules/staff';
import { addInfluence, factions, PLAYER_FACTION } from '../modules/territory';
import { allVeedel } from '../modules/veedel';

/** Alle Veedel einer Stadt gehören dir. */
export function takeCity(sim: Simulation, cityId: string): void {
  const ctx = sim.ctx('scenario');
  for (const v of allVeedel(cityId)) {
    for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
    addInfluence(ctx, v.id, PLAYER_FACTION, 100);
  }
  sim.step();
}

/**
 * Eine Rechte Hand in der Stadt bereit für die Vollmacht: Gibt es noch keine, kommen zwei Leutnants und eine Rechte Hand
 * dazu. Höchste Stufe, alle Aufgaben an.
 */
export function rightHandReady(sim: Simulation, cityId = 'koeln'): void {
  const ctx = sim.ctx('scenario');
  if (!getRightHand(sim.state, cityId)) {
    for (const spot of getSpots(sim.state, cityId).slice(0, 2)) {
      const lt = enlist(ctx, generateProfile(ctx, 'runner', { level: 3 }), { origin: 'pool', cityId });
      lt.stats.loyalty = 85;
      sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: lt.id, spotIds: [spot.id] } });
    }
    const boss = enlist(ctx, generateProfile(ctx, 'runner', { level: 5 }), { origin: 'pool', cityId });
    boss.stats.loyalty = 92;
    sim.dispatch({ type: 'hierarchy.appointRightHand', payload: { staffId: boss.id } });
  }
  const rh = getRightHand(sim.state, cityId);
  if (!rh) throw new Error(`Keine Rechte Hand in ${cityId}.`);
  rh.xp = Math.max(rh.xp, RIGHT_HAND_RANK_XP[RIGHT_HAND_RANK_XP.length - 1]);
  const boss = getStaff(sim.state).find((m) => m.id === rh.staffId);
  if (boss) boss.stats.loyalty = Math.max(boss.stats.loyalty, 85);
  sim.dispatch({
    type: 'hierarchy.configureRightHand',
    payload: {
      settings: { orders: true, pickup: true, restock: true, staffing: true, wholesale: true, laundering: true },
      cityId,
    },
  });
}

/**
 * Köln komplett und eine Rechte Hand bereit für die Vollmacht (rightHandReady). Danach erteilt der Bot die Vollmacht und
 * fährt nach Hamburg.
 */
export function koelnKomplett(sim: Simulation): void {
  rightHandReady(sim, 'koeln');
  takeCity(sim, 'koeln');
}
