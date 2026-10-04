// Einfache Strategie für Konfrontationen ohne Boss (Auftrag 35): wenn die Leute selbst entscheiden ("auswürfeln"),
// beim Bot und bei der Vollmacht der Rechten Hand. Dieselben Regeln wie im Dialog, nur ohne Oberfläche:
// den Einsatz schützen, auf den die Absicht zielt, und die Handlung nehmen, die die Zeiger am besten verschiebt.

import type { GameState } from '../../core';
import { AGGRESSION_FIGHT, RETREAT_AT } from './config';
import { availableActions, availableMoves, getKind, resolveAction } from './engine';
import { activeOwn, foesIn, getIntent, previewShift } from './tactics';
import type { Encounter, StakeId } from './types';

export interface AutoChoice {
  actionId: string;
  protect: StakeId | null;
}

/** Welchen Einsatz schützen: den, auf den die Absicht zielt; in der Schlägerei die Leute; sonst wie bisher. */
export function autoProtect(encounter: Encounter): StakeId | null {
  const kind = getKind(encounter.kind);
  if (!kind) return null;
  const target = getIntent(encounter.intent)?.stake;
  const ids = encounter.stakes.map((x) => x.id);
  if (target && ids.includes(target)) return target;
  if (encounter.brawl && ids.includes('people')) return 'people';
  return encounter.protect ?? ids[0] ?? null;
}

/** Bewertung einer Handlung: wie sehr sie die Entschlossenheit senkt, ohne die Aggression über die Kante zu treiben. */
export function scoreAction(encounter: Encounter, actionId: string): number {
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!action) return Number.NEGATIVE_INFINITY;
  const shift = previewShift(encounter, action, actionId).mid;
  const aggression = encounter.aggression + shift.aggression;
  const resolve = encounter.resolve + shift.resolve;
  const intent = getIntent(encounter.intent);
  const weight = aggression >= AGGRESSION_FIGHT ? 1.2 : encounter.aggression >= 50 ? 0.5 : 0.15;
  let score = -shift.resolve - shift.aggression * weight;
  if (resolve < RETREAT_AT) score += 30;
  if (action.strike) score += action.strike * 12 * Math.max(0, activeOwn(encounter).length - foesIn(encounter) + 1);
  if (action.removesTarget) score += 6;
  // Die Absicht abwenden lohnt sich, je mehr sie anrichten würde.
  if (intent?.counters?.includes(actionId)) score += 4 + (intent.damage ?? 0) / 4 + (intent.hit ?? 0) * 20;
  if (intent?.stake && action.shields === intent.stake) score += 6;
  return score;
}

/**
 * Einfache Bewertung, wie die Leute ohne Boss entscheiden: beide Zeiger runter, Entschlossenheit zählt doppelt.
 * Auf die Absicht und die Kante zur Schlägerei achten sie nicht.
 */
export function simpleScore(encounter: Encounter, actionId: string): number {
  const kind = getKind(encounter.kind);
  const action = kind && resolveAction(kind, actionId);
  if (!action) return Number.NEGATIVE_INFINITY;
  const shift = previewShift(encounter, action, actionId).mid;
  return -shift.resolve - shift.aggression / 2;
}

/**
 * Nächster Zug. Ohne smart wie die Leute ohne Boss (einfach: den Einsatz der Absicht schützen, die Entschlossenheit
 * drücken); mit smart wie ein guter Spieler (Absicht abwenden, Aggression im Blick, Spezialzüge). null, wenn es
 * nichts mehr zu tun gibt.
 */
export function chooseAuto(_state: GameState, encounter: Encounter, smart = false): AutoChoice | null {
  const kind = getKind(encounter.kind);
  if (!kind) return null;
  const all = availableActions(encounter);
  const options = all.filter((id) => {
    const action = resolveAction(kind, id);
    return action && !action.costsBribe && !action.ends && action.clock !== 'call';
  });
  // Ohne Boss schützen die Leute, was sie gerade schützen (am Anfang den ersten Einsatz), nur der gute Spieler
  // schaut auf die Absicht.
  const protect = smart ? autoProtect(encounter) : (encounter.protect ?? encounter.stakes[0]?.id ?? null);
  // Aussichtslos: alle verletzt mitten in der Schlägerei, dann lieber abhauen.
  const own = activeOwn(encounter);
  const beaten = own.length > 0 && own.every((p) => p.condition !== 'ok') && encounter.brawl;
  if (beaten && all.includes('flee')) return { actionId: 'flee', protect };
  if (options.length === 0) return all[0] ? { actionId: all[0], protect } : null;
  const rate = smart ? scoreAction : simpleScore;
  let best = options[0];
  let bestScore = rate(encounter, best);
  for (const id of options.slice(1)) {
    const score = rate(encounter, id);
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  }
  return { actionId: best, protect };
}

/**
 * Spezialzug, der sich jetzt lohnt (participantId) oder null: Ware gleich in Sicherheit bringen, die zweite
 * Verhandlung sofort nutzen; den Fluchtwagen nur, wenn es aussichtslos ist (smart) bzw. alle verletzt sind.
 */
export function chooseMove(encounter: Encounter, smart: boolean): string | null {
  const moves = availableMoves(encounter);
  const pick = (move: string) => moves.find((m) => m.move === move)?.participantId ?? null;
  const stash = pick('stash');
  if (stash) return stash;
  const talk = pick('secondTalk');
  if (talk && (!smart || encounter.aggression < AGGRESSION_FIGHT)) return talk;
  const getaway = pick('getaway');
  const own = activeOwn(encounter);
  const hopeless = own.length > 0 && own.every((p) => p.condition !== 'ok') && encounter.brawl;
  const lost = smart && encounter.brawl && own.length < foesIn(encounter) && encounter.resolve > 60;
  if (getaway && (hopeless || lost)) return getaway;
  return null;
}
