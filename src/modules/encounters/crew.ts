// Crew und Spezialzüge (Auftrag 35, Etappe 2). Im Briefing wählt der Spieler bis zu CREW_MAX Leute (Vorschlag
// vorbelegt: wer vor Ort ist, dann die Stärksten, die frei sind). Jede Person bringt einen Spezialzug aus Rolle und
// Werten mit, einmal pro Konfrontation:
//   block       Sicherheit fängt einen Treffer ab (passiv, beim ersten Treffer)
//   getaway     Fahrer mit Fahrzeug: Flucht ohne Verluste
//   secondTalk  hohes Charisma: eine zweite Verhandlung, ohne dass die Runde weiterläuft
//   stash       hohes Tempo: die halbe Ware ist sofort in Sicherheit
// Die Regeln sind Daten (SPECIAL_MOVE_RULES). Haken für Auftrag 34 (Eigenschaften der Leute): specialMoves(member)
// liest member.traits, sobald es sie gibt; neue Regeln mit `trait` kommen einfach in die Liste.

import type { GameState } from '../../core';
import { getStaff, getStaffMember, type StaffRole } from '../staff';
import { CREW_MAX, CREW_TRAVEL_COST, SPECIAL_CHARISMA, SPECIAL_SPEED } from './config';
import type { Encounter, SpecialMoveId } from './types';

export interface SpecialMove {
  label: string;
  /** Ein Satz für die Oberfläche. */
  hint: string;
  icon: string;
  /** Passiv: wirkt von selbst (kein Knopf). */
  passive?: boolean;
}

export const SPECIAL_MOVES: Record<SpecialMoveId, SpecialMove> = {
  block: {
    label: 'Treffer abfangen',
    hint: 'Fängt den ersten Treffer gegen euch ab.',
    icon: 'shield',
    passive: true,
  },
  getaway: { label: 'Fluchtwagen', hint: 'Sofort weg, ohne etwas zurückzulassen.', icon: 'car' },
  secondTalk: {
    label: 'Zweite Verhandlung',
    hint: 'Noch eine Verhandlung, ohne dass die Runde weiterläuft.',
    icon: 'handshake',
  },
  stash: { label: 'Ware wegbringen', hint: 'Die halbe Ware ist sofort in Sicherheit.', icon: 'bag' },
};

/** Was eine Person für ihren Spezialzug mitbringt (Teilmenge eines Mitarbeiters; traits ab Auftrag 34). */
export interface CrewMemberInfo {
  role: string;
  stats: { speed: number; caution: number; strength: number; charisma: number };
  /** Eigenschaften aus Auftrag 34 (später), z.B. ['Türsteher']. */
  traits?: readonly string[];
}

export interface SpecialMoveRule {
  move: SpecialMoveId;
  role?: string;
  stat?: { key: keyof CrewMemberInfo['stats']; min: number };
  /** Eigenschaft aus Auftrag 34. */
  trait?: string;
}

/** Regeln in Reihenfolge: Die erste passende gibt den Spezialzug einer Person. */
export const SPECIAL_MOVE_RULES: SpecialMoveRule[] = [
  { move: 'block', role: 'security' },
  { move: 'getaway', role: 'driver' },
  { move: 'secondTalk', stat: { key: 'charisma', min: SPECIAL_CHARISMA } },
  { move: 'stash', stat: { key: 'speed', min: SPECIAL_SPEED } },
];

/** Alle Spezialzüge, die zu einer Person passen (der erste zählt). Haken für Eigenschaften aus Auftrag 34. */
export function specialMoves(member: CrewMemberInfo): SpecialMoveId[] {
  const moves: SpecialMoveId[] = [];
  for (const rule of SPECIAL_MOVE_RULES) {
    if (rule.role && member.role !== rule.role) continue;
    if (rule.stat && member.stats[rule.stat.key] < rule.stat.min) continue;
    if (rule.trait && !member.traits?.includes(rule.trait)) continue;
    if (!moves.includes(rule.move)) moves.push(rule.move);
  }
  return moves;
}

/** Spezialzug einer Person (der erste passende) oder null. */
export function specialMoveOf(member: CrewMemberInfo | undefined): SpecialMoveId | null {
  return member ? (specialMoves(member)[0] ?? null) : null;
}

/** Rollen, die mitkommen können (keine Anwälte, Buchhalter, Kontakte bei der Polizei). */
const CREW_ROLES: readonly string[] = ['runner', 'security', 'driver', 'courier'];

export interface CrewCandidate {
  id: string;
  name: string;
  role: StaffRole;
  move: SpecialMoveId | null;
  /** Schon vor Ort (kostet nichts). */
  atSite: boolean;
  /** Taxi in Schwarzgeld, 0 vor Ort. */
  cost: number;
  strength: number;
}

/**
 * Wer mitkommen kann: die Leute vor Ort (aus der Anfrage), dann alle freien in der Stadt der Konfrontation,
 * die Stärksten zuerst.
 */
export function crewCandidates(state: GameState, encounter: Encounter, cityId: string): CrewCandidate[] {
  const site = new Set(encounter.request.staffIds ?? []);
  const list: CrewCandidate[] = [];
  for (const id of site) {
    const m = getStaffMember(state, id);
    if (m?.status !== 'active') continue;
    list.push({
      id,
      name: m.name,
      role: m.role,
      move: specialMoveOf(m),
      atSite: true,
      cost: 0,
      strength: m.stats.strength,
    });
  }
  const free = getStaff(state, { cityId })
    .filter((m) => m.status === 'active' && !m.assignment && CREW_ROLES.includes(m.role) && !site.has(m.id))
    .sort((a, b) => b.stats.strength - a.stats.strength || a.id.localeCompare(b.id));
  for (const m of free) {
    list.push({
      id: m.id,
      name: m.name,
      role: m.role,
      move: specialMoveOf(m),
      atSite: false,
      cost: CREW_TRAVEL_COST,
      strength: m.stats.strength,
    });
  }
  return list;
}

/** So viele schlägt der Vorschlag mindestens vor (wer fehlt, kommt mit dem Taxi). */
const SUGGESTED_MIN = 2;

/** Vorschlag: wer vor Ort ist, aufgefüllt mit den Stärksten, die frei sind, bis SUGGESTED_MIN (höchstens CREW_MAX). */
export function suggestedCrew(state: GameState, encounter: Encounter, cityId: string): string[] {
  const candidates = crewCandidates(state, encounter, cityId);
  const site = candidates.filter((c) => c.atSite).slice(0, CREW_MAX);
  const extra = candidates.filter((c) => !c.atSite).slice(0, Math.max(0, SUGGESTED_MIN - site.length));
  return [...site, ...extra].map((c) => c.id);
}

/** Taxi für eine Crew (wer nicht vor Ort ist). */
export function crewCost(state: GameState, encounter: Encounter, cityId: string, crew: readonly string[]): number {
  const candidates = crewCandidates(state, encounter, cityId);
  return crew.reduce((sum, id) => sum + (candidates.find((c) => c.id === id)?.cost ?? 0), 0);
}
