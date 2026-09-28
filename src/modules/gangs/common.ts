// Gemeinsame Hilfen der Gang-Logik (KI, Diplomatie, Reaktionen). Schreiben nur mit ctx.

import { type Ctx, formatEuro, type GameState, journal, type MessageOption, messages } from '../../core';
import { getSpot } from '../spots';
import { getStaff } from '../staff';
import { veedelName } from '../veedel';
import { MESSAGE_EXPIRY, RELATION_ON_BETRAYAL } from './config';
import type { Gang } from './data';
import { ceasefireCost, type GangStatus, gangContact, tributeAmount } from './state';
import { GANG_TEXTS } from './texts';

export function statusOf(ctx: Ctx, gangId: string): GangStatus | undefined {
  return ctx.state.modules.gangs.gangs[gangId];
}

export function addHostility(s: GangStatus, delta: number): void {
  s.hostility = Math.round(Math.min(100, Math.max(0, s.hostility + delta)) * 100) / 100;
}

export function addRelation(s: GangStatus, delta: number): void {
  s.relation = Math.round(Math.min(100, Math.max(-100, s.relation + delta)));
}

export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match);
}

/** Veedel, auf das sich eine Nachricht bezieht: wo du zuletzt in ihrem Revier verkauft hast, sonst ihr Heimat-Veedel. */
export function focusVeedel(state: GameState, gang: Gang, s: GangStatus): string {
  const spot = s.lastSaleSpotId ? getSpot(state, s.lastSaleSpotId) : undefined;
  return veedelName(spot?.veedelId ?? gang.homeVeedelId);
}

export function commandOption(
  id: string,
  label: string,
  command: MessageOption['command'],
  reply?: string,
): MessageOption {
  const option: MessageOption = { id, label, command };
  if (reply) option.reply = reply;
  return option;
}

/** Antwort-Optionen für Forderungen: zahlen, Waffenstillstand, ablehnen. Die genannten Preise gelten bis zur Frist. */
export function demandOptions(ctx: Ctx, gang: Gang, s: GangStatus): MessageOption[] {
  s.quote = null;
  const tribute = tributeAmount(ctx.state, gang.id);
  const ceasefire = ceasefireCost(ctx.state, gang.id);
  s.quote = { tribute, ceasefire, until: ctx.now + MESSAGE_EXPIRY };
  return [
    commandOption(
      'tribute',
      `Zahlen (${formatEuro(tribute)})`,
      { type: 'gangs.payTribute', payload: { gangId: gang.id } },
      'Okay. Ich zahle.',
    ),
    commandOption(
      'ceasefire',
      `Waffenstillstand (${formatEuro(ceasefire)})`,
      { type: 'gangs.ceasefire', payload: { gangId: gang.id } },
      'Lass uns das ruhig regeln. Ich hab was für dich, und dann ist erst mal Ruhe.',
    ),
    commandOption('refuse', 'Verpiss dich.', { type: 'gangs.refuse', payload: { gangId: gang.id } }),
  ];
}

/** Nachricht des Bosses schicken. */
export function say(
  ctx: Ctx,
  gang: Gang,
  key: keyof typeof GANG_TEXTS,
  vars: Record<string, string> = {},
  options?: MessageOption[],
): number {
  const text = fill(ctx.pick(GANG_TEXTS[key]), { boss: gang.boss, gang: gang.name, ...vars });
  return messages.send(ctx, {
    contact: gangContact(gang),
    text,
    ...(options?.length ? { options, expiresIn: MESSAGE_EXPIRY } : {}),
  });
}

/** Bricht alle Abkommen mit der Gang (nach einem Angriff oder Verrat). Gibt zurück, ob eins bestand. */
export function breakAgreements(ctx: Ctx, gang: Gang, s: GangStatus, why: string): boolean {
  const now = ctx.now;
  const had =
    (s.ceasefireUntil !== null && s.ceasefireUntil > now) ||
    (s.tribute !== null && s.tribute.until > now) ||
    (s.alliance !== null && s.alliance.until > now) ||
    s.protection !== null;
  const kinds: ('ceasefire' | 'tribute' | 'alliance' | 'protection')[] = [];
  if (s.ceasefireUntil !== null) kinds.push('ceasefire');
  if (s.tribute) kinds.push('tribute');
  if (s.alliance) kinds.push('alliance');
  if (s.protection) kinds.push('protection');
  s.ceasefireUntil = null;
  s.tribute = null;
  s.alliance = null;
  s.protection = null;
  for (const kind of kinds) ctx.emit('gang.diplomacyChanged', { gangId: gang.id, kind, active: false });
  if (had) {
    addRelation(s, RELATION_ON_BETRAYAL);
    journal.add(ctx, `${why}: Alle Abmachungen mit ${gang.name} sind geplatzt.`, 'bad');
  }
  return had;
}

/**
 * Eigene Leute für eine Konfrontation, die die Gang auslöst: aktive Sicherheitsleute, dazu wer am Ort arbeitet.
 * Höchstens `max` Personen.
 */
export function crewFor(state: GameState, where: { spotId?: string; warehouseId?: string }, max = 4): string[] {
  const ids: string[] = [];
  if (where.spotId) for (const m of getStaff(state, { spotId: where.spotId, status: 'active' })) ids.push(m.id);
  for (const m of getStaff(state, { status: 'active' })) {
    if (where.warehouseId && m.assignment?.kind === 'warehouse' && m.assignment.targetId === where.warehouseId) {
      ids.push(m.id);
    }
  }
  for (const m of getStaff(state, { role: 'security', status: 'active' })) {
    const free = !m.assignment;
    const here =
      (where.spotId && m.assignment?.kind === 'spot' && m.assignment.targetId === where.spotId) ||
      (where.warehouseId && m.assignment?.kind === 'warehouse' && m.assignment.targetId === where.warehouseId);
    if (free || here) ids.push(m.id);
  }
  return [...new Set(ids)].slice(0, max);
}
