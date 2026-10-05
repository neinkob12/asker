// Eigenschaften und Beziehungen der Leute (Auftrag 34). Gewürfelt wird fest aus einem Schlüssel (Hash), nicht mit
// ctx.random(): So bekommen alte Spielstände in der Migration dieselben Eigenschaften wie beim nächsten Laden, und die
// Würfelfolge der Module bleibt, wie sie war. Die Wirkung sind kleine Faktoren (TRAITS, RELATIONS in config.ts).

import { type Ctx, feminineName, type GameState, rngNext, seedStream } from '../../core';
import {
  REFERRAL_FRIENDS_SHARE,
  RELATION_CHANCE,
  RELATION_TEAM_SHARE,
  RELATIONS,
  RELATIONS_PER_PERSON,
  THIRD_TRAIT_CHANCE,
  TRAIT_EXCLUDES,
  TRAITS,
  type TraitInfo,
} from './config';
import type { RelationKind, StaffMember, StaffRelation, TraitId } from './types';

export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[];
export const RELATION_KINDS = Object.keys(RELATIONS) as RelationKind[];

/** Zufallsfolge fest aus einem Schlüssel (gleicher Schlüssel = gleiche Folge). */
export function keyedRandom(key: string): () => number {
  let s = seedStream(0x5eed, key);
  return () => {
    const [value, next] = rngNext(s);
    s = next;
    return value;
  };
}

function weighted<T>(random: () => number, items: readonly T[], weight: (item: T) => number): T | undefined {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  if (total <= 0) return undefined;
  let roll = random() * total;
  for (const item of items) {
    roll -= weight(item);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

function excluded(a: TraitId, b: TraitId): boolean {
  return TRAIT_EXCLUDES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Zwei bis drei Eigenschaften, fest aus dem Schlüssel (z.B. Mitarbeiter-ID oder Name mit Zeit). */
export function rollTraits(key: string): TraitId[] {
  const random = keyedRandom(`traits:${key}`);
  const count = random() < THIRD_TRAIT_CHANCE ? 3 : 2;
  const traits: TraitId[] = [];
  while (traits.length < count) {
    const free = TRAIT_IDS.filter((t) => !traits.includes(t) && !traits.some((x) => excluded(x, t)));
    const next = weighted(random, free, (t) => TRAITS[t].weight);
    if (!next) break;
    traits.push(next);
  }
  return traits;
}

/** Eigenschaften einer Person (alte Zustände ohne Feld: keine). */
export function traitsOf(member: { traits?: readonly TraitId[] }): readonly TraitId[] {
  return member.traits ?? [];
}

export function hasTrait(member: { traits?: readonly TraitId[] }, trait: TraitId): boolean {
  return traitsOf(member).includes(trait);
}

/** Name der Eigenschaft für diese Person (Familienvater oder Familienmutter). */
export function traitName(trait: TraitId, name = ''): string {
  const info = TRAITS[trait];
  return info.nameFeminine && feminineName(name) ? info.nameFeminine : info.name;
}

/** Produkt eines Faktors über alle Eigenschaften (1 ohne Wirkung). */
export function traitFactor(
  member: { traits?: readonly TraitId[] },
  key: 'wage' | 'risk' | 'pace' | 'combat' | 'xp' | 'betrayal' | 'talk' | 'fear',
): number {
  let factor = 1;
  for (const t of traitsOf(member)) factor *= (TRAITS[t] as TraitInfo)[key] ?? 1;
  return factor;
}

/** Loyalität pro Tag aus den Eigenschaften. */
export function traitLoyaltyDay(member: { traits?: readonly TraitId[] }): number {
  return traitsOf(member).reduce((sum, t) => sum + (TRAITS[t].loyaltyDay ?? 0), 0);
}

// --- Beziehungen ---

/** Alle Beziehungen einer Person zu Leuten, die noch für dich arbeiten. */
export function relationsOf(state: GameState, staffId: string): { other: StaffMember; kind: RelationKind }[] {
  const s = state.modules.staff;
  const list: { other: StaffMember; kind: RelationKind }[] = [];
  for (const r of s.relations ?? []) {
    if (r.a !== staffId && r.b !== staffId) continue;
    const otherId = r.a === staffId ? r.b : r.a;
    const other = s.members.find((m) => m.id === otherId);
    if (other) list.push({ other, kind: r.kind });
  }
  return list;
}

/** Beziehung zwischen zwei Personen oder null. */
export function relationBetween(state: GameState, a: string, b: string): RelationKind | null {
  const r = (state.modules.staff.relations ?? []).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  return r?.kind ?? null;
}

function relationCount(state: GameState, staffId: string): number {
  return (state.modules.staff.relations ?? []).filter((r) => r.a === staffId || r.b === staffId).length;
}

/** Beziehung anlegen (ohne Prüfung außer: nicht doppelt, nicht mit sich selbst). */
export function addRelation(ctx: Ctx, a: string, b: string, kind: RelationKind): boolean {
  if (a === b || relationBetween(ctx.state, a, b)) return false;
  const s = ctx.state.modules.staff;
  s.relations ??= [];
  const relation: StaffRelation = { a, b, kind, since: ctx.now };
  s.relations.push(relation);
  return true;
}

const lastName = (name: string): string => name.trim().split(/\s+/).pop() ?? '';

/** Passt die Beziehung zu den beiden? Geschwister tragen denselben Nachnamen, ein Paar ist erwachsen. */
function relationFits(kind: RelationKind, a: StaffMember, b: StaffMember): boolean {
  if (kind === 'siblings') return lastName(a.name) === lastName(b.name) && Math.abs(a.age - b.age) <= 14;
  if (kind === 'couple') return a.age >= 20 && b.age >= 20 && Math.abs(a.age - b.age) <= 12;
  return true;
}

/**
 * Beim Einstellen: Mit RELATION_CHANCE kennt die neue Person schon jemanden im Team derselben Stadt (befreundet,
 * Geschwister, Rivalen, ein Paar), höchstens RELATIONS_PER_PERSON pro Person und eine auf RELATION_TEAM_SHARE Leute.
 * Mit referrerId (Empfehlung) immer mit der empfehlenden Person.
 */
export function relateNewMember(ctx: Ctx, member: StaffMember, referrerId?: string | null): RelationKind | null {
  const s = ctx.state.modules.staff;
  const random = keyedRandom(`relation:${ctx.state.meta.seed}:${member.id}`);
  const referrer = referrerId ? s.members.find((m) => m.id === referrerId) : undefined;
  if (referrer) {
    const kind: RelationKind =
      random() < REFERRAL_FRIENDS_SHARE
        ? 'friends'
        : relationFits('siblings', member, referrer)
          ? 'siblings'
          : 'friends';
    return addRelation(ctx, member.id, referrer.id, kind) ? kind : null;
  }
  const team = s.members.filter((m) => m.id !== member.id && m.cityId === member.cityId);
  const teamRelations = (s.relations ?? []).filter((r) => team.some((m) => m.id === r.a || m.id === r.b)).length;
  if (team.length === 0 || teamRelations + 1 > Math.max(1, Math.floor((team.length + 1) / RELATION_TEAM_SHARE))) {
    return null;
  }
  if (random() >= RELATION_CHANCE) return null;
  const partners = team.filter((m) => relationCount(ctx.state, m.id) < RELATIONS_PER_PERSON);
  const partner = partners[Math.floor(random() * partners.length)];
  if (!partner) return null;
  const kinds = RELATION_KINDS.filter((k) => relationFits(k, member, partner));
  const kind = weighted(random, kinds, (k) => RELATIONS[k].weight) ?? 'friends';
  return addRelation(ctx, member.id, partner.id, kind) ? kind : null;
}

/** Name der Beziehung aus Sicht einer Person, z.B. "Befreundet mit Kevin K.". */
export function relationLabel(kind: RelationKind, otherName: string): string {
  if (kind === 'friends') return `Befreundet mit ${otherName}`;
  if (kind === 'siblings') return `Geschwister von ${otherName}`;
  if (kind === 'rivals') return `Rivale von ${otherName}`;
  return `Zusammen mit ${otherName}`;
}
