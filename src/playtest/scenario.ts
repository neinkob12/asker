// Ausgangslagen für Bot-Läufe (Auftrag 30): "Köln komplett" mit einer Rechten Hand, die alle Voraussetzungen für die
// Vollmacht erfüllt. Den Rest (Vollmacht erteilen, nach Hamburg fahren, dort anfangen) macht der Bot selbst.
// Nur für Tests und den Balancing-Bericht; verändert den Zustand direkt wie die Dev-Abkürzungen im Browser.

import type { Simulation } from '../core';
import { isBossOfGermany, isBusinessSold, isPlayerTraveling } from '../modules/city';
import { getRightHand, RIGHT_HAND_RANK_XP } from '../modules/hierarchy';
import { getSpots } from '../modules/spots';
import { enlist, generateProfile, getStaff } from '../modules/staff';
import { addInfluence, factions, PLAYER_FACTION } from '../modules/territory';
import { allVeedel } from '../modules/veedel';
import { type BotOptions, type BotStats, DEFAULT_BOT, playFor } from './bot';

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
 * Eine Rechte Hand in der Stadt bereit für die Vollmacht: Gibt es noch keine, kommen zwei Leutnants dazu, und ein
 * dritter steigt gleich zur Rechten Hand auf (Auftrag 46e: Sie kommt aus den Leutnants). Höchste Stufe, alle Aufgaben an.
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
    const third = getSpots(sim.state, cityId)[2] ?? getSpots(sim.state, cityId)[0];
    sim.dispatch({ type: 'hierarchy.appoint', payload: { staffId: boss.id, spotIds: [third.id] } });
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

/**
 * Nach Deutschland (Auftrag 40): Der Bot spielt Köln koelnDays Tage, dann ist Köln komplett (koelnKomplett), danach
 * spielt er die übrigen Städte in seiner Reihenfolge, bis er Boss von Deutschland ist (höchstens maxDays Tage). Gibt den
 * Tag zurück, an dem es so weit war (null, wenn nicht).
 */
export function playToGermany(
  sim: Simulation,
  stats: BotStats,
  options: BotOptions = DEFAULT_BOT,
  koelnDays = 25,
  maxDays = 160,
): number | null {
  for (let d = 0; d < koelnDays; d++) playFor(sim, 1440, stats, options);
  koelnKomplett(sim);
  for (let d = koelnDays; d < maxDays && !isBossOfGermany(sim.state); d++) {
    playFor(sim, 1440, stats, { ...options, sellBusiness: false });
    if (sim.state.outcome.gameOver) return null;
  }
  return isBossOfGermany(sim.state) ? Math.floor(sim.state.time / 1440) + 1 : null;
}

/** Bis der Verkauf durch ist und du in Rotterdam bist (der Bot verkauft, sobald Jansen anruft). */
export function sellAndArrive(sim: Simulation, stats: BotStats, options: BotOptions = DEFAULT_BOT): boolean {
  for (let i = 0; i < 6 * 24 && (!isBusinessSold(sim.state) || isPlayerTraveling(sim.state)); i++) {
    playFor(sim, 60, stats, options);
  }
  return isBusinessSold(sim.state) && !isPlayerTraveling(sim.state);
}
