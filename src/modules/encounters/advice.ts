// Rat der Rechten Hand (Auftrag 35, Etappe 3). Ist in der Stadt der Konfrontation eine Rechte Hand im Dienst,
// kommentiert sie die Lage in einem Satz. Keine eigene Meinung, nur Rat: Die Regeln sind Daten (ADVICE_RULES), die
// erste passende gewinnt. Gelesen wird nur, was der Dialog auch zeigt (Gang-Stil, Zeiger, Uhr, Absicht).

import type { GameState } from '../../core';
import { getRightHand } from '../hierarchy';
import { getStaffMember } from '../staff';
import { AGGRESSION_FIGHT, RETREAT_AT } from './config';
import { requestCity } from './engine';
import { ENCOUNTER_KINDS } from './kinds';
import { gangTemper, getIntent, stakeName } from './tactics';
import type { Encounter } from './types';

/** Bedingung einer Regel (alle angegebenen müssen passen). */
export interface AdviceWhen {
  phase?: 'briefing' | 'rounds';
  brawl?: boolean;
  aggressionMin?: number;
  resolveMin?: number;
  resolveMax?: number;
  clockMax?: number;
  /** Polizei oder Zoll als Gegenseite (die Uhr bringt deren Verstärkung). */
  police?: boolean;
  /** Absicht der Gegenseite (eine von). */
  intents?: readonly string[];
  /** Gang-Stil: wie schnell die Gang zuschlägt (traits.aggression), mindestens. */
  temperMin?: number;
}

export interface AdviceRule {
  when: AdviceWhen;
  /** Platzhalter {stake}: der Einsatz, auf den die Absicht zielt. */
  text: string;
}

export const ADVICE_RULES: readonly AdviceRule[] = [
  { when: { brawl: true }, text: 'Das ist jetzt eine Schlägerei. Leute schützen oder raus da.' },
  { when: { police: true, clockMax: 1 }, text: 'Gleich ist die Verstärkung da. Jetzt oder nie.' },
  {
    when: { police: false, clockMax: 1, phase: 'rounds' },
    text: 'Gleich ist die Streife da. Hinhalten, dann laufen die von selbst.',
  },
  { when: { intents: ['knife'] }, text: 'Der hat ein Messer. Pass auf die Leute auf.' },
  {
    when: { temperMin: 1.3, resolveMin: 60 },
    text: 'Die lassen sich nicht einschüchtern. Zahl oder lass sie ziehen.',
  },
  { when: { aggressionMin: AGGRESSION_FIGHT - 12 }, text: 'Die sind kurz vorm Zuschlagen. Runter mit dem Ton.' },
  { when: { resolveMax: RETREAT_AT + 15 }, text: 'Die wackeln. Noch ein Stoß, dann ziehen sie ab.' },
  { when: { intents: ['leaderTalks', 'whine'] }, text: 'Der will reden. Lass ihn, das kostet nichts.' },
  {
    when: { intents: ['grabGoods', 'grabCash', 'hideMoney', 'hideLoot', 'emptyTill'] },
    text: 'Die wollen an die {stake}. Deck sie oder geh dazwischen.',
  },
  { when: { intents: ['exit', 'nervousWavers'] }, text: 'Die suchen schon den Ausgang. Lass sie gehen.' },
  {
    when: { intents: ['search', 'searchVan', 'tarp'] },
    text: 'Wenn die suchen, finden die was. Weg mit dem Zeug oder Papiere raus.',
  },
  { when: { intents: ['dog'] }, text: 'Der Hund riecht was. Lenk die ab.' },
  { when: { intents: ['radio', 'callOffice'] }, text: 'Die rufen Verstärkung. Lange haben wir nicht.' },
  { when: { police: true }, text: 'Ruhig bleiben. Die wollen nur einen Grund.' },
  { when: {}, text: 'Ruhig bleiben. Erst sehen, was die wollen.' },
];

function matches(encounter: Encounter, temper: number, police: boolean, when: AdviceWhen): boolean {
  if (when.phase && encounter.phase !== when.phase) return false;
  if (when.brawl !== undefined && encounter.brawl !== when.brawl) return false;
  if (when.aggressionMin !== undefined && encounter.aggression < when.aggressionMin) return false;
  if (when.resolveMin !== undefined && encounter.resolve < when.resolveMin) return false;
  if (when.resolveMax !== undefined && encounter.resolve > when.resolveMax) return false;
  if (when.clockMax !== undefined && encounter.clock > when.clockMax) return false;
  if (when.police !== undefined && police !== when.police) return false;
  if (when.intents && (!encounter.intent || !when.intents.includes(encounter.intent))) return false;
  if (when.temperMin !== undefined && temper < when.temperMin) return false;
  return true;
}

/** Satz zur Lage aus den Regeln (ohne Rechte Hand; für Tests und andere Ratgeber). */
export function adviceText(state: GameState, encounter: Encounter): string {
  const kind = ENCOUNTER_KINDS[encounter.kind];
  const police = (kind?.clockOutcome ?? 'retreat') === 'failure';
  const temper = gangTemper(state, encounter.opponent.factionId);
  const rule =
    ADVICE_RULES.find((r) => matches(encounter, temper, police, r.when)) ?? ADVICE_RULES[ADVICE_RULES.length - 1];
  const stake = getIntent(encounter.intent)?.stake;
  return rule.text.replace('{stake}', stake ? stakeName(kind, stake) : 'Ware');
}

export interface Advice {
  staffId: string;
  name: string;
  text: string;
}

/** Rat der Rechten Hand der Stadt, wenn es eine gibt und sie im Dienst ist; sonst null. */
export function rightHandAdvice(state: GameState, encounter: Encounter): Advice | null {
  if (encounter.phase === 'done') return null;
  const post = getRightHand(state, requestCity(state, encounter.request));
  const member = post ? getStaffMember(state, post.staffId) : undefined;
  if (!member || member.status !== 'active') return null;
  return { staffId: member.id, name: member.name, text: adviceText(state, encounter) };
}
