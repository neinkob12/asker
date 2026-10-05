// Neue Leute erzeugen: Name, Alter, Hintergrund, Werte je nach Typ. Und die Regeln für Level und Lohn.
// Nutzt nur den Zufall des übergebenen Kontexts, damit alles deterministisch bleibt.

import type { Ctx } from '../../core';
import { activeCity, getCity } from '../city';
import {
  BACKGROUNDS,
  FIRST_NAMES,
  LAST_NAMES,
  LEVEL_STAT_GAIN,
  LEVEL_XP,
  MAX_LEVEL,
  NICKNAME_CHANCE,
  NICKNAMES,
  QUALITY_BONUS,
  ROLE_INFO,
  STAT_SPREAD,
  WAGE_PER_LEVEL,
} from './config';
import { rollTraits, traitFactor } from './traits';
import type { RecruitProfile, StaffRole, StaffStats, StatKey } from './types';

export const STAT_KEYS: readonly StatKey[] = ['speed', 'caution', 'strength', 'charisma', 'loyalty'];

export const clampStat = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const roundTo5 = (value: number): number => Math.max(5, Math.round(value / 5) * 5);

/** Üblicher Tageslohn für Typ und Level, mal Anspruch (Leutnants verlangen mehr). */
export function expectedWageFor(role: StaffRole, level: number, demand = 1): number {
  return roundTo5(ROLE_INFO[role].wage * (1 + WAGE_PER_LEVEL * (level - 1)) * demand);
}

/** Level zu einer Gesamt-Erfahrung. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= LEVEL_XP[level]) level++;
  return level;
}

/** Fortschritt zum nächsten Level: 0 bis 1 (1 auf dem Höchstlevel). */
export function levelProgress(level: number, xp: number): { current: number; needed: number; fraction: number } {
  if (level >= MAX_LEVEL) return { current: 0, needed: 0, fraction: 1 };
  const from = LEVEL_XP[level - 1];
  const to = LEVEL_XP[level];
  return { current: xp - from, needed: to - from, fraction: Math.min(1, (xp - from) / (to - from)) };
}

/** Werte steigen beim Level-Aufstieg: jeder wichtige Wert des Typs etwas. */
export function levelUpGains(ctx: Ctx, role: StaffRole): Partial<StaffStats> {
  const gains: Partial<StaffStats> = {};
  for (const key of ROLE_INFO[role].keyStats) gains[key] = ctx.randomInt(LEVEL_STAT_GAIN[0], LEVEL_STAT_GAIN[1]);
  return gains;
}

/** Zufälliger Name wie "Kevin K." (manchmal mit Spitzname). */
export function randomName(ctx: Ctx): string {
  const first = ctx.pick(FIRST_NAMES);
  const last = ctx.pick(LAST_NAMES);
  return ctx.chance(NICKNAME_CHANCE) ? `${first} „${ctx.pick(NICKNAMES)}“ ${last}` : `${first} ${last}`;
}

export interface GenerateOptions {
  /** 0 = normal, 1 = deutlich besser (Kontakte, Empfehlungen). */
  quality?: number;
  level?: number;
}

/** Einen neuen Menschen erzeugen. Werte nach Typ, zufällig gestreut; höhere Level haben schon zugelegt. */
export function generateProfile(ctx: Ctx, role: StaffRole, options: GenerateOptions = {}): RecruitProfile {
  const info = ROLE_INFO[role];
  const quality = options.quality ?? 0;
  const level = Math.max(1, Math.min(MAX_LEVEL, options.level ?? 1));
  const stats = { ...info.stats };
  for (const key of STAT_KEYS) {
    // Summe zweier Zufallszahlen: Werte nahe am Durchschnitt sind häufiger als Ausreißer.
    const spread = (ctx.random() + ctx.random() - 1) * STAT_SPREAD;
    stats[key] = clampStat(stats[key] + spread + quality * QUALITY_BONUS);
  }
  for (let l = 1; l < level; l++) {
    for (const [key, gain] of Object.entries(levelUpGains(ctx, role))) {
      stats[key as StatKey] = clampStat(stats[key as StatKey] + (gain ?? 0));
    }
  }
  // Lohnniveau der Stadt, in der angeheuert wird (Auftrag 30: Hamburg × 1,25).
  const city = getCity(activeCity(ctx.state))?.wageFactor ?? 1;
  const wageRoll = 0.9 + ctx.random() * 0.3;
  const name = randomName(ctx);
  const age = ctx.randomInt(info.age[0], info.age[1]);
  // Eigenschaften fest aus Name, Alter und Zeit (Auftrag 34; ohne ctx.random, die Würfelfolge bleibt).
  const traits = rollTraits(`${ctx.state.meta.seed}:${ctx.now}:${name}:${age}`);
  const wage = roundTo5(expectedWageFor(role, level) * city * wageRoll * traitFactor({ traits }, 'wage'));
  return {
    name,
    role,
    age,
    background: ctx.pick(BACKGROUNDS[role]),
    stats,
    level,
    wage,
    portrait: null,
    traits,
  };
}
