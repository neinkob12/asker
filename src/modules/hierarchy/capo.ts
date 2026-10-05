// Capo (Auftrag 34): Ein Leutnant ab Level 5 mit drei Spots führt bis zu drei Leutnants in benachbarten Veedeln
// (Bezirk: die Veedel seiner Spots und ihre Nachbarn). Er bleibt selbst Leutnant. Fällt ein Leutnant seines Bezirks
// aus, springt er ein (Ausfälle, Läufer, Nachschub nach dessen Bestellregeln); steht eine Gang an einem Spot im Bezirk,
// schickt er freie Sicherheit hin. Sein Lohnanspruch ist doppelt so hoch wie der eines Leutnants mit drei Spots. Die
// Rechte Hand spricht dann nur noch mit ihm (sie kümmert sich nicht mehr selbst um die Leutnants seines Bezirks).
// Ein Capo ist die fertige Rechte Hand für die nächste Stadt (Auftrag 36: getCapos, isCapo).

import { type CommandResult, type Ctx, formatEuro, type GameState, journal } from '../../core';
import { activeCity, isCityLive } from '../city';
import { intimidationAt } from '../gangs';
import { getSpot } from '../spots';
import {
  addCareer,
  addLoyalty,
  expectedWage,
  freeStaff,
  getStaffMember,
  isEmployed,
  securityAt,
  setDemand,
  setWage,
} from '../staff';
import { neighborsOf, veedelName } from '../veedel';
import { standIn } from './ai';
import {
  CAPO_DEMAND_FACTOR,
  CAPO_DEMOTION_LOYALTY,
  CAPO_INTERVAL,
  CAPO_MAX_LIEUTENANTS,
  CAPO_MIN_LEVEL,
  CAPO_PROMOTION_LOYALTY,
  LIEUTENANT_DEMAND_BY_SPOTS,
  LOG_LIMIT,
  MAX_SPOTS_PER_LIEUTENANT,
} from './config';
import type { CapoPost } from './types';

const NOT_CAPO = 'Diese Person ist kein Capo.';

function capos(state: GameState): Record<string, CapoPost> {
  return state.modules.hierarchy.capos ?? {};
}

function post(state: GameState, staffId: string) {
  return state.modules.hierarchy.posts[staffId];
}

/** Ist die Person Capo? */
export function isCapo(state: GameState, staffId: string): boolean {
  return !!capos(state)[staffId];
}

/** Posten eines Capos. */
export function getCapo(state: GameState, staffId: string): CapoPost | undefined {
  return capos(state)[staffId];
}

/** Alle Capos (in einer Stadt, ohne Angabe: in allen), nach ID sortiert. Für Auftrag 36: Capo als nächste Rechte Hand. */
export function getCapos(state: GameState, cityId?: string): CapoPost[] {
  const all = capos(state);
  return Object.keys(all)
    .sort()
    .map((id) => all[id])
    .filter((c) => !cityId || (getStaffMember(state, c.staffId)?.cityId ?? 'koeln') === cityId);
}

/** Capo, der diesen Leutnant führt (oder null). */
export function capoOf(state: GameState, lieutenantId: string): string | null {
  const all = capos(state);
  for (const id of Object.keys(all).sort()) if (all[id].lieutenants.includes(lieutenantId)) return id;
  return null;
}

/** Lohnanspruch eines Capos (Faktor auf den üblichen Lohn). */
export function capoDemand(): number {
  const three = LIEUTENANT_DEMAND_BY_SPOTS[Math.min(MAX_SPOTS_PER_LIEUTENANT, LIEUTENANT_DEMAND_BY_SPOTS.length - 1)];
  return three * CAPO_DEMAND_FACTOR;
}

/** Veedel der Spots eines Leutnants. */
function spotVeedels(state: GameState, staffId: string): string[] {
  const ids = new Set<string>();
  for (const spotId of post(state, staffId)?.spotIds ?? []) {
    const veedelId = getSpot(state, spotId)?.veedelId;
    if (veedelId) ids.add(veedelId);
  }
  return [...ids];
}

/** Bezirk eines Capos: die Veedel seiner Spots und ihre Nachbarn. */
export function capoDistrict(state: GameState, staffId: string): string[] {
  const own = spotVeedels(state, staffId);
  const all = new Set(own);
  for (const v of own) for (const n of neighborsOf(v)) all.add(n);
  return [...all].sort();
}

/** Kann die Person Capo werden? Leutnant ab Level 5 mit drei Spots, einsatzbereit. */
export function canBeCapo(state: GameState, staffId: string): CommandResult {
  const m = getStaffMember(state, staffId);
  const p = post(state, staffId);
  if (!m || !isEmployed(state, staffId)) return { ok: false, reason: 'Diese Person arbeitet nicht für dich.' };
  if (!p) return { ok: false, reason: `${m.name} ist kein Leutnant.` };
  if (m.level < CAPO_MIN_LEVEL) return { ok: false, reason: `${m.name} braucht mindestens Level ${CAPO_MIN_LEVEL}.` };
  if (p.spotIds.length < MAX_SPOTS_PER_LIEUTENANT) {
    return { ok: false, reason: `${m.name} muss erst ${MAX_SPOTS_PER_LIEUTENANT} Spots führen.` };
  }
  if (m.status !== 'active') return { ok: false, reason: `${m.name} ist gerade nicht einsatzbereit.` };
  return { ok: true };
}

/** Leutnants, die dieser Capo führen könnte: im Bezirk, in seiner Stadt, kein Capo, nicht bei einem anderen Capo. */
export function capoCandidates(state: GameState, capoId: string): string[] {
  const district = new Set(capoDistrict(state, capoId));
  const city = getStaffMember(state, capoId)?.cityId ?? 'koeln';
  return Object.keys(state.modules.hierarchy.posts)
    .sort()
    .filter((id) => {
      if (id === capoId || isCapo(state, id)) return false;
      const other = capoOf(state, id);
      if (other && other !== capoId) return false;
      if ((getStaffMember(state, id)?.cityId ?? 'koeln') !== city) return false;
      return spotVeedels(state, id).some((v) => district.has(v));
    });
}

/** Satzende ohne doppelten Punkt (Namen wie "Jupp H." enden schon mit einem). */
const sentence = (text: string): string => (text.endsWith('.') ? text : `${text}.`);

function log(c: CapoPost, now: number, raw: string): void {
  const text = sentence(raw.replace(/\.\.$/, '.'));
  if (c.log[0]?.text === text) {
    c.log[0].time = now;
    return;
  }
  c.log.unshift({ time: now, text });
  if (c.log.length > LOG_LIMIT) c.log.length = LOG_LIMIT;
}

/** Befehl 'hierarchy.appointCapo': Leutnant zum Capo machen (oder seine Leutnants ändern). */
export function appointCapo(ctx: Ctx, staffId: string, lieutenantIds: readonly string[]): CommandResult {
  const check = canBeCapo(ctx.state, staffId);
  if (!check.ok) return check;
  const ids = [...new Set(lieutenantIds ?? [])];
  if (ids.length > CAPO_MAX_LIEUTENANTS) {
    return { ok: false, reason: `Ein Capo führt höchstens ${CAPO_MAX_LIEUTENANTS} Leutnants.` };
  }
  const allowed = new Set(capoCandidates(ctx.state, staffId));
  for (const id of ids) {
    if (allowed.has(id)) continue;
    const name = getStaffMember(ctx.state, id)?.name ?? 'Diese Person';
    return { ok: false, reason: `${name} ist kein Leutnant in seinem Bezirk (oder hat schon einen Capo).` };
  }
  const m = getStaffMember(ctx.state, staffId);
  if (!m) return { ok: false, reason: NOT_CAPO };
  const h = ctx.state.modules.hierarchy;
  h.capos ??= {};
  // Wer Capo wird, führt keinen Bezirk mehr unter einem anderen.
  for (const other of Object.values(h.capos)) other.lieutenants = other.lieutenants.filter((id) => id !== staffId);
  const existing = h.capos[staffId];
  if (existing) {
    existing.lieutenants = ids;
    log(existing, ctx.now, `Führt jetzt ${names(ctx.state, ids)}.`);
    ctx.emit('hierarchy.capoAppointed', { staffId, lieutenantIds: ids });
    return { ok: true };
  }
  h.capos[staffId] = { staffId, lieutenants: ids, appointedAt: ctx.now, nextActionAt: ctx.now, standIns: 0, log: [] };
  setDemand(ctx, staffId, capoDemand());
  setWage(ctx, staffId, Math.max(m.wage, expectedWage(ctx.state, staffId)));
  addLoyalty(ctx, staffId, CAPO_PROMOTION_LOYALTY);
  addCareer(ctx, staffId, sentence(`Zum Capo ernannt${ids.length ? `: führt ${names(ctx.state, ids)}` : ''}`));
  for (const id of ids) addCareer(ctx, id, `Hat jetzt ${m.name} als Capo.`);
  journal.add(ctx, `${m.name} ist jetzt Capo (${formatEuro(m.wage)} pro Tag).`, 'good', { staffId });
  log(h.capos[staffId], ctx.now, ids.length ? `Übernimmt ${names(ctx.state, ids)}.` : 'Übernimmt den Bezirk.');
  ctx.emit('hierarchy.capoAppointed', { staffId, lieutenantIds: ids });
  return { ok: true };
}

/** Befehl 'hierarchy.dismissCapo': Er bleibt Leutnant, verlangt wieder normal und ist gekränkt. */
export function dismissCapo(ctx: Ctx, staffId: string, quiet = false): CommandResult {
  const h = ctx.state.modules.hierarchy;
  if (!h.capos?.[staffId]) return { ok: false, reason: NOT_CAPO };
  delete h.capos[staffId];
  const m = getStaffMember(ctx.state, staffId);
  const p = post(ctx.state, staffId);
  if (m && isEmployed(ctx.state, staffId)) {
    const i = Math.min(p?.spotIds.length ?? 0, LIEUTENANT_DEMAND_BY_SPOTS.length - 1);
    setDemand(ctx, staffId, p ? LIEUTENANT_DEMAND_BY_SPOTS[i] : 1);
    if (!quiet) {
      addLoyalty(ctx, staffId, CAPO_DEMOTION_LOYALTY);
      addCareer(ctx, staffId, 'Nicht mehr Capo.');
      journal.add(ctx, `${m.name} ist nicht mehr Capo.`, 'info', { staffId });
    }
  }
  ctx.emit('hierarchy.capoDismissed', { staffId });
  return { ok: true };
}

/** Aufräumen: Wer kein Leutnant mehr ist, ist auch kein Capo und gehört zu keinem Bezirk. */
export function cleanupCapos(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  if (!h.capos) return;
  for (const id of Object.keys(h.capos).sort()) {
    if (!h.posts[id] || !isEmployed(ctx.state, id)) {
      dismissCapo(ctx, id, true);
      continue;
    }
    h.capos[id].lieutenants = h.capos[id].lieutenants.filter((lt) => !!h.posts[lt] && !h.capos[lt]);
  }
}

function names(state: GameState, ids: readonly string[]): string {
  const list = ids.map((id) => getStaffMember(state, id)?.name ?? id);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} und ${list[list.length - 1]}`;
}

/**
 * Alle paar Minuten: Jeder Capo (in der Stadt, die live ist) springt für ausgefallene Leutnants seines Bezirks ein
 * und schickt freie Sicherheit an Spots im Bezirk, an denen eine Gang steht.
 */
export function capoTick(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  if (!h.capos) return;
  for (const id of Object.keys(h.capos).sort()) {
    const c = h.capos[id];
    const capo = getStaffMember(ctx.state, id);
    if (capo?.status !== 'active' || !isEmployed(ctx.state, id)) continue;
    if (!isCityLive(ctx.state, capo.cityId ?? 'koeln') || ctx.now < c.nextActionAt) continue;
    c.nextActionAt = ctx.now + CAPO_INTERVAL;
    for (const ltId of c.lieutenants) {
      const lt = getStaffMember(ctx.state, ltId);
      const p = post(ctx.state, ltId);
      if (!lt || !p || lt.status === 'active') continue;
      standIn(ctx, p, capo);
      c.standIns += 1;
      log(c, ctx.now, `Vertritt ${lt.name} (${lt.status === 'jailed' ? 'in Haft' : 'verletzt'}).`);
    }
    guardDistrict(ctx, c);
  }
}

/** Steht eine Gang an einem Spot im Bezirk, schickt der Capo freie Sicherheit hin. */
function guardDistrict(ctx: Ctx, c: CapoPost): void {
  const spotIds = [c.staffId, ...c.lieutenants].flatMap((id) => post(ctx.state, id)?.spotIds ?? []);
  for (const spotId of spotIds) {
    if (!intimidationAt(ctx.state, spotId) || securityAt(ctx.state, { spotId }).length > 0) continue;
    const guard = freeStaff(ctx.state, 'security')[0];
    if (!guard) return;
    const ok = ctx.dispatch(
      { type: 'staff.assign', payload: { staffId: guard.id, assignment: { kind: 'spot', targetId: spotId } } },
      { actor: `staff:${c.staffId}` },
    ).ok;
    if (ok) {
      c.standIns += 1;
      const where = getSpot(ctx.state, spotId)?.veedelId;
      log(c, ctx.now, `${guard.name} gegen die Gang-Leute geschickt${where ? ` (${veedelName(where)})` : ''}.`);
    }
  }
}

/** Ist der Capo dieses Leutnants im Dienst (dann regelt er, die Rechte Hand nicht)? */
export function capoInCharge(state: GameState, lieutenantId: string): boolean {
  const id = capoOf(state, lieutenantId);
  const capo = id ? getStaffMember(state, id) : undefined;
  return capo?.status === 'active';
}

/** Capos und ihre Leutnants in der Stadt (für die Anzeige). */
export function capoCount(state: GameState, cityId: string = activeCity(state)): number {
  return getCapos(state, cityId).length;
}
