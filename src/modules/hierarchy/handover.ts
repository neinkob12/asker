// Übergabe mit Startpaket (Auftrag 36): Wer eine Stadt an den Statthalter übergibt, nimmt in die nächste mit, was er
// will: eine neue Rechte Hand (bis es Capos gibt, Auftrag 34, ein Leutnant ab START_PACK_LEADER_MIN_LEVEL), bis zu
// START_PACK_MAX_STAFF Leute und Fahrzeuge (fleet). Das Vertrauen der Lieferanten bleibt ohnehin. Die Fahrt selbst und
// das Umziehen macht city ('city.handOver' mit pack); hier steht, wer mitkommen darf, und wie die mitgebrachte Person
// in der neuen Stadt Rechte Hand wird ('hierarchy.installRightHand', sobald sie angekommen ist).
//
// Für die Integration mit Auftrag 34: Nur startPackLeaders muss auf Capos umgestellt werden (Auswahl), der Rest bleibt.
//
// Statthalter (Auftrag 36): So heißt die Rechte Hand, die eine Stadt mit Vollmacht führt (rightHandTitle). Keine neue
// Person, nur ein Titel mit Gesicht auf der Deutschland-Ansicht und dem Bericht aus der Stadt.

import { type CommandResult, type Ctx, type GameState, journal, messages } from '../../core';
import { cityName } from '../city';
import { getStaff, getStaffMember, isEmployed, isSpecialist, type StaffMember, staffContact } from '../staff';
import {
  RIGHT_HAND_MAX_RANK,
  RIGHT_HAND_RANK_XP,
  RIGHT_HAND_TASKS,
  START_PACK_LEADER_MIN_LEVEL,
  START_PACK_RANK_BY_LEVEL,
} from './config';
import { hasFullPower } from './fullpower';
import { isLieutenant } from './index';
import { installPost, isRightHand } from './righthand';

/** Titel der Rechten Hand einer Stadt: mit Vollmacht Statthalter. */
export function rightHandTitle(state: GameState, cityId: string): string {
  return hasFullPower(state, cityId) ? `Statthalter von ${cityName(cityId)}` : 'Rechte Hand';
}

/** Ist die Person gerade frei genug, um mitzufahren (aktiv, nicht unterwegs)? */
function canTravel(m: StaffMember): boolean {
  const kind = m.assignment?.kind;
  return m.status === 'active' && kind !== 'delivery' && kind !== 'transport' && kind !== 'travel';
}

/**
 * Wer als neue Rechte Hand mitkommen kann (Haken für Auftrag 34: dann Capos statt Leutnants ab Level 5). Die beste
 * zuerst (Level, dann Loyalität).
 */
export function startPackLeaders(state: GameState, cityId: string): StaffMember[] {
  return getStaff(state, { cityId })
    .filter((m) => isEmployed(state, m.id) && canTravel(m) && !isRightHand(state, m.id))
    .filter((m) => isLieutenant(state, m.id) && m.level >= START_PACK_LEADER_MIN_LEVEL)
    .sort((a, b) => b.level - a.level || b.stats.loyalty - a.stats.loyalty || a.id.localeCompare(b.id));
}

/** Wer sonst mitkommen kann: Leute der Stadt ohne Führungsposten (Läufer, Sicherheit, Fahrer …). */
export function startPackStaff(state: GameState, cityId: string): StaffMember[] {
  return getStaff(state, { cityId })
    .filter((m) => isEmployed(state, m.id) && canTravel(m) && !isRightHand(state, m.id) && !isLieutenant(state, m.id))
    .filter((m) => m.role !== 'policeContact')
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
}

/** Stufe als Rechte Hand für die Person aus dem Startpaket (nach ihrem Level). */
export function startPackRank(level: number): number {
  let rank = 1;
  for (const [min, r] of Object.entries(START_PACK_RANK_BY_LEVEL)) if (level >= Number(min)) rank = Math.max(rank, r);
  return Math.min(RIGHT_HAND_MAX_RANK, rank);
}

/**
 * Die mitgebrachte Person wird Rechte Hand der Stadt, in der sie jetzt ist (Startpaket): Stufe nach ihrem Level, alle
 * Aufgaben, die diese Stufe freigibt, gleich an. Nur das Spiel selbst (actor 'system', aus city nach der Ankunft).
 */
export function installRightHand(ctx: Ctx, staffId: string, cityId: string): CommandResult {
  const m = getStaffMember(ctx.state, staffId);
  if (!m || !isEmployed(ctx.state, staffId)) return { ok: false, reason: 'Diese Person arbeitet nicht für dich.' };
  if (m.cityId !== cityId) return { ok: false, reason: `${m.name} ist noch nicht in ${cityName(cityId)}.` };
  if (isSpecialist(m.role)) return { ok: false, reason: `${m.name} führt keine Leute.` };
  const rank = startPackRank(m.level);
  const post = installPost(ctx, m, cityId, RIGHT_HAND_RANK_XP[rank - 1]);
  for (const task of RIGHT_HAND_TASKS) if (task.rank <= rank) post.settings[task.key] = true;
  journal.add(
    ctx,
    `${m.name} ist deine Rechte Hand in ${cityName(cityId)} (Stufe ${rank} von ${RIGHT_HAND_MAX_RANK}).`,
    'good',
    { staffId },
  );
  messages.send(ctx, {
    contact: staffContact(m),
    text: `Bin da. ${cityName(cityId)} ist neu für mich, aber das Geschäft kenn ich. Ich fang gleich an.`,
    silent: true,
  });
  ctx.emit('hierarchy.rightHandAppointed', { staffId });
  return { ok: true };
}
