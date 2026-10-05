// Gemeinsame Hilfen der Gang-Logik (KI, Diplomatie, Reaktionen). Schreiben nur mit ctx.

import { type Ctx, formatEuro, type GameState, journal, type MessageOption, messages, texts } from '../../core';
import { activeCity } from '../city';
import { warehouseCity } from '../goods';
import { getSpot, spotCity } from '../spots';
import { getStaff } from '../staff';
import { veedelName } from '../veedel';
import {
  CEASEFIRE_COOLDOWN_AFTER_ATTACK,
  MESSAGE_EXPIRY,
  MIN_RELATION_TO_TALK,
  RELATION_ON_BETRAYAL,
  WARN_AT,
} from './config';
import type { Gang } from './data';
import { ceasefireCost, type GangStatus, gangContact, hasCeasefire, paysTribute, tributeAmount } from './state';
import { type GangTextKey, gangVariants } from './texts';

export function statusOf(ctx: Ctx, gangId: string): GangStatus | undefined {
  return ctx.state.modules.gangs.gangs[gangId];
}

export function addHostility(s: GangStatus, delta: number): void {
  s.hostility = Math.round(Math.min(100, Math.max(0, s.hostility + delta)) * 100) / 100;
}

export function addRelation(s: GangStatus, delta: number): void {
  s.relation = Math.round(Math.min(100, Math.max(-100, s.relation + delta)));
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

/**
 * Warum es gerade keinen Waffenstillstand mit dieser Gang gibt (sonst null). Befehl und Angebote in Nachrichten fragen
 * dasselbe, sonst bietet eine Nachricht einen Weg an, der nicht geht.
 */
export function ceasefireBlock(state: GameState, now: number, gang: Gang, s: GangStatus): string | null {
  if (hasCeasefire(state, gang.id)) return `Mit ${gang.name} ist schon Waffenstillstand.`;
  if (s.hostility < WARN_AT) return `${gang.name} hat gar kein Problem mit dir.`;
  if (s.relation <= MIN_RELATION_TO_TALK) return `${gang.name} redet nicht mehr mit dir.`;
  if (s.lastPlayerAttackAt !== null && now - s.lastPlayerAttackAt < CEASEFIRE_COOLDOWN_AFTER_ATTACK) {
    return 'Zu frisch. Nach deinem Angriff redet dort niemand über Frieden.';
  }
  return null;
}

/**
 * Antwort-Optionen für Forderungen: zahlen, Waffenstillstand, ablehnen. Nur Wege, die jetzt gehen (wer schon zahlt oder
 * Ruhe hat, bekommt sie nicht noch einmal angeboten). Die genannten Preise gelten bis zur Frist.
 */
export function demandOptions(ctx: Ctx, gang: Gang, s: GangStatus): MessageOption[] {
  s.quote = null;
  const tribute = tributeAmount(ctx.state, gang.id);
  const ceasefire = ceasefireCost(ctx.state, gang.id);
  s.quote = { tribute, ceasefire, until: ctx.now + MESSAGE_EXPIRY };
  const options: MessageOption[] = [];
  if (!paysTribute(ctx.state, gang.id)) {
    options.push(
      commandOption(
        'tribute',
        `Zahlen (${formatEuro(tribute)})`,
        { type: 'gangs.payTribute', payload: { gangId: gang.id } },
        'Okay. Ich zahle.',
      ),
    );
  }
  if (!ceasefireBlock(ctx.state, ctx.now, gang, s)) {
    options.push(
      commandOption(
        'ceasefire',
        `Waffenstillstand (${formatEuro(ceasefire)})`,
        { type: 'gangs.ceasefire', payload: { gangId: gang.id } },
        'Lass uns das ruhig regeln. Ich hab was für dich, und dann ist erst mal Ruhe.',
      ),
    );
  }
  options.push(commandOption('refuse', 'Verpiss dich.', { type: 'gangs.refuse', payload: { gangId: gang.id } }));
  return options;
}

/** Nachricht des Bosses schicken. */
export function say(
  ctx: Ctx,
  gang: Gang,
  key: GangTextKey,
  vars: Record<string, string> = {},
  options?: MessageOption[],
  /** Antwortfrist der Nachricht; bei Angeboten die des Angebots (sonst gilt "Deal" in der Nachricht länger als das Angebot). */
  expiresIn = MESSAGE_EXPIRY,
): number {
  // Eigene Stimme pro Gang, ohne dieselbe Variante direkt zu wiederholen (Text-Helfer des Kerns, Auftrag 23).
  const text = texts.pick(ctx, `gang:${gang.id}:${key}`, gangVariants(gang.id, key), {
    boss: gang.boss,
    gang: gang.name,
    ...vars,
  });
  return messages.send(ctx, {
    contact: gangContact(gang),
    text,
    ...(options?.length ? { options, expiresIn } : {}),
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
 * Nur aus der Stadt des Anlasses (cityId, sonst die von Spot oder Lager, sonst die aktive): Leute aus der schlafenden
 * Stadt können nicht mitgehen. Höchstens `max` Personen.
 */
export function crewFor(
  state: GameState,
  where: { spotId?: string; warehouseId?: string; cityId?: string },
  max = 4,
): string[] {
  const spot = where.spotId ? getSpot(state, where.spotId) : undefined;
  const cityId =
    where.cityId ?? (spot ? spotCity(spot) : where.warehouseId ? warehouseCity(where.warehouseId) : activeCity(state));
  const ids: string[] = [];
  if (where.spotId) for (const m of getStaff(state, { spotId: where.spotId, status: 'active', cityId })) ids.push(m.id);
  for (const m of getStaff(state, { status: 'active', cityId })) {
    if (where.warehouseId && m.assignment?.kind === 'warehouse' && m.assignment.targetId === where.warehouseId) {
      ids.push(m.id);
    }
  }
  for (const m of getStaff(state, { role: 'security', status: 'active', cityId })) {
    const free = !m.assignment;
    const here =
      (where.spotId && m.assignment?.kind === 'spot' && m.assignment.targetId === where.spotId) ||
      (where.warehouseId && m.assignment?.kind === 'warehouse' && m.assignment.targetId === where.warehouseId);
    if (free || here) ids.push(m.id);
  }
  return [...new Set(ids)].slice(0, max);
}
