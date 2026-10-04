// Methoden der Gangs (Auftrag 23): Jede Gang macht auf ihre Art Druck (Gewichte in data.ts, traits.methods).
// Neben dem Überfall (ai.ts: launchRaid) gibt es Einbruch und Diebstahl, Abwerben, Einschüchtern, einen Tipp an die
// Polizei und Erpressung, dazu Chancen (Warnung vor einem Rivalen, ein bezahlter Gefallen, ein Überläufer).
// Was eine Antwort braucht, liegt als Vorfall (incident) im Zustand; die Nachricht trägt Optionen mit dem Befehl
// 'gangs.respond'. Ohne Antwort bis zur Frist gilt die vorsichtige Wahl (abhaken, gehen lassen, abwarten, ablehnen).

import {
  type CommandResult,
  type Contact,
  type Ctx,
  clock,
  formatEuro,
  type GameState,
  journal,
  type MessageOption,
  MINUTES_PER_DAY,
  messages,
  texts,
  wallet,
} from '../../core';
import { activeCity } from '../city';
import { activeEncounters, startEncounter } from '../encounters';
import {
  formatProductAmount,
  getLots,
  getStock,
  getWarehouse,
  getWarehouses,
  productName,
  store,
  take,
  type Warehouse,
} from '../goods';
import { allRightHands, isLieutenant } from '../hierarchy';
import { addHeat, canSnitch, tipOffAgainstPlayer } from '../police';
import { getSpot, getSpots } from '../spots';
import {
  activeRunnerAt,
  addCareer,
  addLoyalty,
  getStaff,
  getStaffMember,
  isEmployed,
  removeMember,
  setWage,
  staffContact,
} from '../staff';
import { veedelAt, veedelName } from '../veedel';
import { addRelation, crewFor, say, statusOf } from './common';
import {
  ACTION_LOG_LIMIT,
  BLACKMAIL_BASE,
  BLACKMAIL_HEAT,
  BLACKMAIL_MAX,
  BLACKMAIL_STOCK_SHARE,
  BURGLARY_GUARD_STOP,
  BURGLARY_HOURS,
  BURGLARY_MAX,
  BURGLARY_REPORT_HOUR,
  BURGLARY_SHARE,
  BURGLARY_TRAIL,
  DEFECTOR_CHANCE,
  DEFECTOR_PRICE,
  FAVOR_HEAT,
  FAVOR_PAY,
  FAVOR_RELATION,
  GOOD_TURN_CHANCE,
  GOOD_TURN_MIN_RELATION,
  INCIDENT_EXPIRY,
  INTIMIDATION_DURATION,
  INTIMIDATION_FACTOR,
  INTIMIDATION_LEAVE_CHANCE,
  METHOD_CHANCE,
  METHOD_COOLDOWN,
  METHOD_GLOBAL_GAP,
  POACH_EXTRA_SHARE,
  POACH_MAX_LOYALTY,
  POACH_MIN_EXTRA,
  POACH_RAISE_LOYALTY,
  POACH_TALK_HEAT,
  POACH_THREAT_LOYALTY,
  POACH_THREAT_STAY,
  RECOVER_SHARE,
  TIPOFF_HEAT,
  TIPOFF_RAID_CHANCE,
  WARN_AT,
  WARN_PREPARE_COST,
} from './config';
import { GANGS, type Gang, type GangMethod } from './data';
import { type GangStatus, gangVeedel, getGang, isAtPeace } from './state';
import { INCIDENT_TEXTS } from './texts';

export type IncidentKind = 'burglary' | 'poach' | 'intimidation' | 'blackmail' | 'warnRival' | 'favor' | 'defector';

/** Wohin die Spur nach einem Einbruch führt. */
export type BurglaryTrail = keyof typeof BURGLARY_TRAIL;

/** Ein Vorfall, der eine Antwort des Spielers braucht (oder, beim Einbruch, erst am Morgen auffällt). */
export interface GangIncident {
  id: number;
  kind: IncidentKind;
  /** Gang dahinter (beim Einbruch die, zu der die Spur führt; null bei Junkies oder einem eigenen Mann). */
  gangId: string | null;
  /** Ausführende Gang (beim Einbruch auch, wenn die Spur woandershin führt). */
  byGangId: string;
  cityId: string;
  at: number;
  /** Antwortfrist (beim Einbruch erst ab der Meldung). */
  expiresAt: number;
  /** Einbruch: wird um diese Zeit gemeldet. */
  reportAt?: number;
  reported?: boolean;
  messageId?: number;
  spotId?: string;
  warehouseId?: string;
  staffId?: string;
  productId?: string;
  amount?: number;
  quality?: number;
  unitCost?: number;
  extra?: number;
  price?: number;
  enemyId?: string;
  trail?: BurglaryTrail;
  /** Laufende Konfrontation zum Vorfall (Täter suchen, Sicherheit am Spot). */
  encounterId?: number;
}

/** Gang-Leute an einem deiner Spots. */
export interface GangIntimidation {
  gangId: string;
  spotId: string;
  until: number;
}

export interface GangActionEntry {
  at: number;
  text: string;
}

/** Antworten pro Vorfall; die erste ist die Wahl ohne Antwort bis zur Frist. */
export const INCIDENT_CHOICES: Readonly<Record<IncidentKind, readonly string[]>> = {
  burglary: ['drop', 'hunt', 'snitch', 'fire'],
  poach: ['release', 'raise', 'threaten'],
  intimidation: ['wait', 'security', 'tribute'],
  blackmail: ['refuse', 'pay'],
  warnRival: ['thanks', 'prepare'],
  favor: ['decline', 'accept'],
  defector: ['decline', 'buy'],
};

/** Die Nachbarin am Lager: sieht alles, meldet Einbrüche. */
const NEIGHBOR: Contact = {
  id: 'other:neighbor',
  name: 'Frau Krämer (Nachbarin)',
  kind: 'other',
  role: 'Nachbarin an deinen Lagern',
  about: 'Rentnerin, Fenster immer offen, Fernglas auf der Fensterbank. Meldet dir, wenn am Lager etwas nicht stimmt.',
  look: { feminine: true, age: 74, hair: 'bun', hairColor: 6, glasses: 'round', top: 'raincoat', topColor: 5 },
  voice: { pitch: 1.1, rate: 0.9 },
};

/** Überläufer aus einer Gang: verkauft Infos. */
const DEFECTOR: Contact = {
  id: 'other:defector',
  name: 'Unbekannte Nummer',
  kind: 'other',
  role: 'Überläufer',
  about: 'Hat eine Gang verlassen und will Geld für das, was er weiß.',
  look: { feminine: false, age: 29, hat: 'hood', top: 'hoodie', topColor: 0 },
};

// ---------------------------------------------------------------------------------------------
// Lesen

/** Faktor auf die Kundschaft an einem Spot, solange Gang-Leute dort stehen (1 = niemand). */
export function intimidationFactor(state: GameState, spotId: string): number {
  const list = state.modules.gangs?.intimidations;
  if (!list || list.length === 0) return 1;
  return list.some((i) => i.spotId === spotId && i.until > state.time) ? INTIMIDATION_FACTOR : 1;
}

/** Die Gang, die gerade an einem Spot steht, oder null. */
export function intimidationAt(state: GameState, spotId: string): GangIntimidation | null {
  return state.modules.gangs?.intimidations.find((i) => i.spotId === spotId && i.until > state.time) ?? null;
}

/** Letzte Aktionen einer Gang gegen dich (neueste zuerst). */
export function gangActions(state: GameState, gangId: string): readonly GangActionEntry[] {
  return state.modules.gangs?.log[gangId] ?? [];
}

/** Offene Vorfälle (z.B. für die Gangs-Seite). */
export function openIncidents(state: GameState): readonly GangIncident[] {
  return (state.modules.gangs?.incidents ?? []).filter((i) => i.reported !== false);
}

// ---------------------------------------------------------------------------------------------
// Schreiben: Hilfen

export function logAction(ctx: Ctx, gangId: string, text: string): void {
  const log = ctx.state.modules.gangs.log;
  const list = log[gangId] ?? [];
  list.unshift({ at: ctx.now, text });
  if (list.length > ACTION_LOG_LIMIT) list.length = ACTION_LOG_LIMIT;
  log[gangId] = list;
}

function addIncident(ctx: Ctx, incident: Omit<GangIncident, 'id' | 'at'>): GangIncident {
  const full: GangIncident = { id: ctx.nextId(), at: ctx.now, ...incident };
  ctx.state.modules.gangs.incidents.push(full);
  return full;
}

function respondOption(incident: GangIncident, choice: string, label: string, reply?: string): MessageOption {
  const option: MessageOption = {
    id: choice,
    label,
    command: { type: 'gangs.respond', payload: { incidentId: incident.id, choice } },
  };
  if (reply) option.reply = reply;
  return option;
}

function weightedPick<T extends string>(ctx: Ctx, weights: Partial<Record<T, number>>): T | null {
  const entries = (Object.entries(weights) as [T, number][]).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = ctx.random() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function warehouseVeedel(w: Warehouse): string | null {
  return veedelAt(w.lng, w.lat)?.id ?? null;
}

function goodsText(productId: string, amount: number): string {
  return `${formatProductAmount(productId, amount)} ${productName(productId)}`;
}

// ---------------------------------------------------------------------------------------------
// Auswahl der Methode

/** Leute, die eine Gang abwerben kann: Läufer, Fahrer, Sicherheit mit wenig Loyalität, keine Leutnants, keine Rechte Hand. */
function poachable(state: GameState, cityId: string) {
  const rightHands = new Set(allRightHands(state).map((r) => r.post.staffId));
  return getStaff(state, { status: 'active', cityId }).filter(
    (m) =>
      (m.role === 'runner' || m.role === 'driver' || m.role === 'security') &&
      m.stats.loyalty < POACH_MAX_LOYALTY &&
      !isLieutenant(state, m.id) &&
      !rightHands.has(m.id) &&
      !state.modules.gangs.incidents.some((i) => i.staffId === m.id),
  );
}

/** Lager der Stadt mit Ware und ohne laufenden Vorfall. */
function stockedWarehouses(state: GameState, cityId: string): Warehouse[] {
  return getWarehouses(state, cityId).filter(
    (w) =>
      getStock(state, { warehouseId: w.id }) > 0 &&
      !state.modules.gangs.incidents.some((i) => i.warehouseId === w.id && i.kind !== 'favor'),
  );
}

/** Spots, an denen die Gang einschüchtern kann: deine besetzten Spots in ihrem Revier oder daneben. */
function intimidationTargets(state: GameState, gang: Gang) {
  const turf = new Set(gangVeedel(state, gang.id));
  const busy = new Set(state.modules.gangs.intimidations.filter((i) => i.until > state.time).map((i) => i.spotId));
  const staffed = getSpots(state, gang.cityId).filter((s) => !busy.has(s.id) && activeRunnerAt(state, s.id));
  const inTurf = staffed.filter((s) => turf.has(s.veedelId));
  return inTurf.length > 0 ? inTurf : staffed;
}

function eligible(ctx: Ctx, gang: Gang, method: GangMethod, stage: number): boolean {
  const state = ctx.state;
  switch (method) {
    case 'raid':
      return stage >= 3;
    case 'poach':
      return stage >= 1 && poachable(state, gang.cityId).length > 0;
    case 'burglary': {
      const hour = clock.hour(ctx.now);
      const night = hour >= BURGLARY_HOURS[0] && hour < BURGLARY_HOURS[1];
      return stage >= 2 && night && stockedWarehouses(state, gang.cityId).length > 0;
    }
    case 'intimidate':
      return stage >= 2 && intimidationTargets(state, gang).length > 0;
    case 'tipOff':
      return stage >= 2 && getSpots(state, gang.cityId).some((s) => activeRunnerAt(state, s.id));
    case 'blackmail':
      return stage >= 2 && stockedWarehouses(state, gang.cityId).length > 0;
  }
}

/** Methode nach den Gewichten der Gang wählen (nur, was gerade geht). */
export function pickMethod(ctx: Ctx, gang: Gang, stage: number): GangMethod | null {
  const weights: Partial<Record<GangMethod, number>> = {};
  for (const [method, w] of Object.entries(gang.traits.methods) as [GangMethod, number][]) {
    if (w > 0 && eligible(ctx, gang, method, stage)) weights[method] = w;
  }
  return weightedPick(ctx, weights);
}

/**
 * Leichtere Methoden, solange die Gang droht (Stufe 1–2) oder zwischen Überfällen: selten, mit Abklingzeit pro Gang
 * und einem Abstand zwischen allen Gangs. Die Überfälle ab Stufe 3 wählt ai.ts (reactToPlayer) über pickMethod.
 */
export function maybePressure(ctx: Ctx, gang: Gang, s: GangStatus): void {
  if (s.stage < 1 || isAtPeace(ctx.state, gang.id)) return;
  const g = ctx.state.modules.gangs;
  if (ctx.now < (g.nextMethodAt[gang.id] ?? 0)) return;
  if (g.lastMethodAt !== null && ctx.now - g.lastMethodAt < METHOD_GLOBAL_GAP) return;
  const stageFactor = s.stage >= 2 ? 1 : 0.4;
  if (!ctx.chance(METHOD_CHANCE * gang.traits.aggression * stageFactor)) return;
  // Unterhalb von Stufe 3 keine Überfälle: die laufen über die bestehende Eskalation.
  const method = pickMethod(ctx, gang, Math.min(2, s.stage));
  if (!method || method === 'raid') return;
  if (runMethod(ctx, gang, s, method)) g.nextMethodAt[gang.id] = ctx.now + METHOD_COOLDOWN;
}

/** Methode ausführen (außer Überfall). Gibt zurück, ob etwas passiert ist. */
export function runMethod(ctx: Ctx, gang: Gang, s: GangStatus, method: GangMethod): boolean {
  let done = false;
  if (method === 'burglary') done = burglary(ctx, gang);
  else if (method === 'poach') done = poach(ctx, gang);
  else if (method === 'intimidate') done = intimidate(ctx, gang);
  else if (method === 'tipOff') done = tipOff(ctx, gang);
  else if (method === 'blackmail') done = blackmail(ctx, gang);
  if (done) {
    ctx.state.modules.gangs.lastMethodAt = ctx.now;
    s.lastAttackAt = method === 'raid' ? ctx.now : s.lastAttackAt;
  }
  return done;
}

// ---------------------------------------------------------------------------------------------
// Einbruch und Diebstahl

function burglary(ctx: Ctx, gang: Gang): boolean {
  const state = ctx.state;
  const candidates = stockedWarehouses(state, gang.cityId);
  if (candidates.length === 0) return false;
  // Lieber ein Lager ohne Wache.
  const unguarded = candidates.filter((w) => crewFor(state, { warehouseId: w.id }).length === 0);
  const w = ctx.pick(unguarded.length > 0 ? unguarded : candidates);
  const guards = getStaff(state, { status: 'active', cityId: gang.cityId }).filter(
    (m) => m.role === 'security' && m.assignment?.kind === 'warehouse' && m.assignment.targetId === w.id,
  ).length;
  const reportAt = nextReport(ctx.now);
  if (guards > 0 && ctx.chance(1 - (1 - BURGLARY_GUARD_STOP) ** guards)) {
    // Verscheucht: Die Nachbarin meldet es am Morgen, nichts fehlt (Chance).
    addIncident(ctx, {
      kind: 'burglary',
      gangId: null,
      byGangId: gang.id,
      cityId: gang.cityId,
      expiresAt: reportAt,
      reportAt,
      reported: false,
      warehouseId: w.id,
      amount: 0,
    });
    return true;
  }
  const lot = [...getLots(state, { warehouseId: w.id })].sort((a, b) => b.amount - a.amount)[0];
  if (!lot) return false;
  const want = Math.min(BURGLARY_MAX, Math.ceil(lot.amount * BURGLARY_SHARE * (guards > 0 ? 0.5 : 1)));
  const got = take(ctx, { productId: lot.productId, amount: want, warehouseId: w.id, partial: true });
  if (got.taken <= 0) return false;
  const roll = ctx.random();
  const insiders = getStaff(state, { status: 'active', cityId: gang.cityId }).filter(
    (m) => !isLieutenant(state, m.id) && m.stats.loyalty < POACH_MAX_LOYALTY,
  );
  let trail: BurglaryTrail = 'gang';
  if (roll >= BURGLARY_TRAIL.gang) trail = roll < BURGLARY_TRAIL.gang + BURGLARY_TRAIL.junkies ? 'junkies' : 'insider';
  if (trail === 'insider' && insiders.length === 0) trail = 'junkies';
  addIncident(ctx, {
    kind: 'burglary',
    gangId: trail === 'gang' ? gang.id : null,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: reportAt + INCIDENT_EXPIRY,
    reportAt,
    reported: false,
    warehouseId: w.id,
    productId: lot.productId,
    amount: got.taken,
    quality: got.quality,
    unitCost: got.unitCost,
    trail,
    ...(trail === 'insider' ? { staffId: ctx.pick(insiders).id } : {}),
  });
  const s = statusOf(ctx, gang.id);
  if (s) s.goods += got.taken;
  return true;
}

/** Nächste Meldezeit am Morgen (BURGLARY_REPORT_HOUR). */
function nextReport(now: number): number {
  const day = Math.floor(now / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  const at = day + BURGLARY_REPORT_HOUR * 60;
  return at > now ? at : at + MINUTES_PER_DAY;
}

function reportBurglary(ctx: Ctx, incident: GangIncident): void {
  incident.reported = true;
  const w = incident.warehouseId ? getWarehouse(ctx.state, incident.warehouseId) : undefined;
  const warehouse = w?.name ?? 'Lager';
  const by = getGang(ctx.state, incident.byGangId);
  if (!incident.amount || !incident.productId) {
    // Verscheucht.
    messages.send(ctx, {
      contact: NEIGHBOR,
      text: texts.pick(ctx, 'gang:burglaryFoiled', INCIDENT_TEXTS.burglaryFoiled, { warehouse }),
    });
    journal.add(ctx, `Einbruchsversuch am ${warehouse}: Deine Wache hat sie verscheucht.`, 'good');
    removeIncident(ctx, incident.id);
    if (by) logAction(ctx, by.id, `Einbruchsversuch am ${warehouse}, verscheucht`);
    ctx.emit('gang.burglary', { gangId: incident.byGangId, warehouseId: incident.warehouseId ?? '', amount: 0 });
    return;
  }
  const goods = goodsText(incident.productId, incident.amount);
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  const insider = incident.staffId ? getStaffMember(ctx.state, incident.staffId) : undefined;
  const key =
    incident.trail === 'gang' ? 'burglaryGang' : incident.trail === 'insider' ? 'burglaryInsider' : 'burglaryJunkies';
  const text = texts.pick(ctx, `gang:${key}`, INCIDENT_TEXTS[key], {
    warehouse,
    goods,
    gang: gang?.name ?? '',
    name: insider?.name ?? 'jemand',
  });
  const options: MessageOption[] = [respondOption(incident, 'hunt', 'Täter suchen', 'Ich schick Leute los.')];
  if (gang && canSnitch(ctx.state, gang.id).ok) {
    options.push(respondOption(incident, 'snitch', `${gang.name} verpfeifen`, 'Das geht an die Bullen.'));
  }
  if (insider) options.push(respondOption(incident, 'fire', `${insider.name} rauswerfen`, 'Der fliegt.'));
  options.push(respondOption(incident, 'drop', 'Abhaken', 'Lass gut sein.'));
  incident.messageId = messages.send(ctx, {
    contact: NEIGHBOR,
    text,
    options,
    expiresIn: Math.max(60, incident.expiresAt - ctx.now),
  });
  journal.add(
    ctx,
    `Einbruch im ${warehouse}: ${goods} gestohlen.${gang ? ` Die Spur führt zu ${gang.name}.` : ''}`,
    'bad',
  );
  if (by) logAction(ctx, by.id, `Einbruch im ${warehouse}: ${goods}`);
  ctx.emit('gang.burglary', {
    gangId: incident.byGangId,
    warehouseId: incident.warehouseId ?? '',
    amount: incident.amount,
    productId: incident.productId,
  });
}

function huntThieves(ctx: Ctx, incident: GangIncident): CommandResult {
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  if (activeEncounters(ctx.state).length > 0) return { ok: false, reason: 'Gerade läuft schon eine Konfrontation.' };
  const w = incident.warehouseId ? getWarehouse(ctx.state, incident.warehouseId) : undefined;
  const veedelId = w ? (warehouseVeedel(w) ?? undefined) : undefined;
  const recover = Math.round((incident.amount ?? 0) * RECOVER_SHARE);
  let staffIds = crewFor(ctx.state, { cityId: incident.cityId, ...(w ? { warehouseId: w.id } : {}) });
  // Ohne Sicherheit am Lager gehen die zwei Stärksten aus deinen Leuten in der Stadt los.
  if (staffIds.length === 0) {
    staffIds = getStaff(ctx.state, { status: 'active', cityId: incident.cityId })
      .filter((m) => m.role === 'runner' || m.role === 'driver' || m.role === 'security')
      .sort((a, b) => b.stats.strength - a.stats.strength || a.id.localeCompare(b.id))
      .slice(0, 2)
      .map((m) => m.id);
  }
  const opponent = gang
    ? { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count: 2 }
    : { label: 'Die Diebe', strength: 30, count: 2 };
  const { encounterId } = startEncounter(ctx, {
    kind: 'recoverLoot',
    ...(veedelId ? { veedelId } : {}),
    staffIds,
    askPlayer: true,
    opponent,
    origin: { module: 'gangs', ref: `recover:${incident.id}` },
    stakes: { goods: recover },
    // Die Ware lagert gangs selbst wieder ein (mit Qualität und Einkaufspreis des gestohlenen Postens).
    skipEffects: true,
  });
  incident.encounterId = encounterId;
  return { ok: true };
}

/** Ergebnis der Suche nach den Tätern: Erfolg bringt einen Teil der Ware zurück. */
export function onRecoverResolved(ctx: Ctx, incidentId: number, outcome: string): void {
  const incident = ctx.state.modules.gangs.incidents.find((i) => i.id === incidentId);
  if (!incident) return;
  removeIncident(ctx, incident.id);
  if (outcome !== 'success' || !incident.productId || !incident.amount) {
    journal.add(ctx, 'Die Suche nach den Dieben war umsonst. Die Ware bleibt weg.', 'bad');
    return;
  }
  const amount = Math.round(incident.amount * RECOVER_SHARE);
  const warehouseId =
    incident.warehouseId && getWarehouse(ctx.state, incident.warehouseId) ? incident.warehouseId : undefined;
  store(ctx, {
    productId: incident.productId,
    amount,
    ...(warehouseId ? { warehouseId } : {}),
    quality: incident.quality ?? 0.5,
    unitCost: incident.unitCost ?? 0,
  });
  const gang = incident.gangId ? statusOf(ctx, incident.gangId) : undefined;
  if (gang) gang.goods = Math.max(0, gang.goods - amount);
  journal.add(ctx, `Diebe gestellt: ${goodsText(incident.productId, amount)} sind zurück im Lager.`, 'good');
}

// ---------------------------------------------------------------------------------------------
// Abwerben

function poach(ctx: Ctx, gang: Gang): boolean {
  const list = poachable(ctx.state, gang.cityId).sort((a, b) => a.stats.loyalty - b.stats.loyalty);
  const m = list[0];
  if (!m) return false;
  const extra = Math.max(POACH_MIN_EXTRA, Math.round((m.wage * POACH_EXTRA_SHARE) / 5) * 5);
  const incident = addIncident(ctx, {
    kind: 'poach',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: ctx.now + INCIDENT_EXPIRY,
    staffId: m.id,
    extra,
  });
  incident.messageId = messages.send(ctx, {
    contact: staffContact(m),
    text: texts.pick(ctx, 'staff:poach', INCIDENT_TEXTS.poach, { gang: gang.name, extra: formatEuro(extra) }),
    options: [
      respondOption(incident, 'raise', `Lohn auf ${formatEuro(m.wage + extra)}`, 'Du kriegst mehr. Bleib.'),
      respondOption(incident, 'threaten', 'Drohen', 'Überleg dir gut, wem du was schuldest.'),
      respondOption(incident, 'release', 'Gehen lassen', 'Dann geh halt.'),
    ],
    expiresIn: INCIDENT_EXPIRY,
  });
  journal.add(ctx, `${gang.name} will ${m.name} abwerben.`, 'bad', { staffId: m.id });
  logAction(ctx, gang.id, `Wollte ${m.name} abwerben`);
  ctx.emit('gang.poachAttempt', { gangId: gang.id, staffId: m.id });
  return true;
}

function resolvePoach(ctx: Ctx, incident: GangIncident, choice: string): CommandResult {
  const m = incident.staffId ? getStaffMember(ctx.state, incident.staffId) : undefined;
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  if (!m || !isEmployed(ctx.state, m.id)) return { ok: true };
  if (choice === 'raise') {
    setWage(ctx, m.id, m.wage + (incident.extra ?? 0));
    addLoyalty(ctx, m.id, POACH_RAISE_LOYALTY);
    addCareer(ctx, m.id, `Bleibt, nachdem ${gang?.name ?? 'eine Gang'} ihn abwerben wollte. Mehr Lohn.`);
    journal.add(ctx, `${m.name} bleibt, für ${formatEuro(m.wage)} am Tag.`, 'good', { staffId: m.id });
    return { ok: true };
  }
  if (choice === 'threaten') {
    const stays = ctx.chance(Math.min(0.95, POACH_THREAT_STAY + m.stats.loyalty / 100));
    if (stays) {
      addLoyalty(ctx, m.id, POACH_THREAT_LOYALTY);
      journal.add(ctx, `${m.name} bleibt, aber nicht gern.`, 'info', { staffId: m.id });
      return { ok: true };
    }
    const veedelId = m.assignment?.kind === 'spot' ? getSpot(ctx.state, m.assignment.targetId)?.veedelId : undefined;
    removeMember(ctx, m.id, 'quit');
    if (veedelId) addHeat(ctx, veedelId, POACH_TALK_HEAT);
    journal.add(
      ctx,
      `${m.name} lässt sich nicht drohen und geht zu ${gang?.name ?? 'der Konkurrenz'}. Und redet.`,
      'bad',
      {
        staffId: m.id,
      },
    );
    return { ok: true };
  }
  removeMember(ctx, m.id, 'quit');
  journal.add(ctx, `${m.name} wechselt zu ${gang?.name ?? 'der Konkurrenz'}.`, 'bad', { staffId: m.id });
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (s) s.people += 1;
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Einschüchtern

function intimidate(ctx: Ctx, gang: Gang): boolean {
  const targets = intimidationTargets(ctx.state, gang);
  if (targets.length === 0) return false;
  const spot = ctx.pick(targets);
  const until = ctx.now + INTIMIDATION_DURATION;
  ctx.state.modules.gangs.intimidations.push({ gangId: gang.id, spotId: spot.id, until });
  const incident = addIncident(ctx, {
    kind: 'intimidation',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: until,
    spotId: spot.id,
  });
  const options = [
    respondOption(incident, 'security', 'Sicherheit hinschicken', 'Ich schick Leute.'),
    respondOption(incident, 'wait', 'Abwarten', 'Die gehen schon wieder.'),
  ];
  if (!isAtPeace(ctx.state, gang.id))
    options.push(respondOption(incident, 'tribute', 'Schutzgeld zahlen', 'Okay. Ich zahle.'));
  const runner = activeRunnerAt(ctx.state, spot.id);
  incident.messageId = runner
    ? messages.send(ctx, {
        contact: staffContact(runner),
        text: texts.pick(ctx, 'staff:intimidation', INCIDENT_TEXTS.intimidationReport, {
          spot: spot.name,
          gang: gang.name,
        }),
        options,
        expiresIn: INTIMIDATION_DURATION,
      })
    : say(ctx, gang, 'intimidation', { spot: spot.name }, options, INTIMIDATION_DURATION);
  journal.add(ctx, `${gang.name} stellt sich an deinen Spot ${spot.name}. Die Kunden bleiben weg.`, 'bad', {
    spotId: spot.id,
  });
  logAction(ctx, gang.id, `Hat am ${spot.name} eingeschüchtert`);
  ctx.emit('gang.intimidation', { gangId: gang.id, spotId: spot.id, until });
  return true;
}

function endIntimidation(ctx: Ctx, spotId: string): void {
  const g = ctx.state.modules.gangs;
  g.intimidations = g.intimidations.filter((i) => i.spotId !== spotId);
}

function resolveIntimidation(ctx: Ctx, incident: GangIncident, choice: string): CommandResult {
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  const spot = incident.spotId ? getSpot(ctx.state, incident.spotId) : undefined;
  if (!gang || !spot) return { ok: true };
  if (choice === 'tribute') return ctx.dispatch({ type: 'gangs.payTribute', payload: { gangId: gang.id } });
  if (choice !== 'security') return { ok: true };
  const crew = crewFor(ctx.state, { spotId: spot.id }).filter(
    (id) => getStaffMember(ctx.state, id)?.role === 'security',
  );
  if (crew.length === 0) return { ok: false, reason: 'Du hast gerade keine freien Sicherheitsleute.' };
  if (ctx.chance(INTIMIDATION_LEAVE_CHANCE) || activeEncounters(ctx.state).length > 0) {
    endIntimidation(ctx, spot.id);
    journal.add(ctx, `Deine Sicherheit taucht am ${spot.name} auf. ${gang.name} zieht ab.`, 'good', {
      spotId: spot.id,
    });
    return { ok: true };
  }
  const { encounterId } = startEncounter(ctx, {
    kind: 'raidDefense',
    spotId: spot.id,
    veedelId: spot.veedelId,
    staffIds: crew,
    playerPresent: false,
    situation: '{opponent} stehen {place} und rühren sich nicht. Deine Leute kommen an. Einer muss nachgeben.',
    opponent: { factionId: gang.id, label: gang.crew, strength: gang.traits.fighting, count: 3 },
    origin: { module: 'gangs', ref: `intimidation:${incident.id}` },
  });
  incident.encounterId = encounterId;
  return { ok: true };
}

/** Konfrontation am eingeschüchterten Spot: gewonnen, dann ziehen sie ab. */
export function onIntimidationResolved(ctx: Ctx, incidentId: number, outcome: string): void {
  const incident = ctx.state.modules.gangs.incidents.find((i) => i.id === incidentId);
  if (!incident?.spotId) return;
  if (outcome === 'success') endIntimidation(ctx, incident.spotId);
  removeIncident(ctx, incident.id);
}

// ---------------------------------------------------------------------------------------------
// Tipp an die Polizei

function tipOff(ctx: Ctx, gang: Gang): boolean {
  const spots = getSpots(ctx.state, gang.cityId).filter((s) => activeRunnerAt(ctx.state, s.id));
  if (spots.length === 0) return false;
  const turf = new Set(gangVeedel(ctx.state, gang.id));
  const near = spots.filter((s) => turf.has(s.veedelId));
  const spot = ctx.pick(near.length > 0 ? near : spots);
  const raid = tipOffAgainstPlayer(ctx, spot.veedelId, TIPOFF_HEAT, ctx.chance(TIPOFF_RAID_CHANCE));
  say(ctx, gang, 'tipOff', { veedel: veedelName(spot.veedelId) });
  journal.add(
    ctx,
    `${gang.name} hat dich in ${veedelName(spot.veedelId)} bei der Polizei angeschwärzt.${raid ? ' Dort ist eine Razzia geplant.' : ''}`,
    'bad',
    { veedelId: spot.veedelId },
  );
  logAction(ctx, gang.id, `Tipp an die Polizei: ${veedelName(spot.veedelId)}`);
  ctx.emit('gang.tipOff', { gangId: gang.id, veedelId: spot.veedelId, raid });
  return true;
}

// ---------------------------------------------------------------------------------------------
// Erpressung

function blackmail(ctx: Ctx, gang: Gang): boolean {
  const list = stockedWarehouses(ctx.state, gang.cityId);
  if (list.length === 0) return false;
  const w = ctx.pick(list);
  const value = getLots(ctx.state, { warehouseId: w.id }).reduce((sum, l) => sum + l.amount * l.unitCost, 0);
  const amount = Math.min(BLACKMAIL_MAX, Math.round((BLACKMAIL_BASE + value * BLACKMAIL_STOCK_SHARE) / 50) * 50);
  const incident = addIncident(ctx, {
    kind: 'blackmail',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: ctx.now + INCIDENT_EXPIRY,
    warehouseId: w.id,
    amount,
  });
  incident.messageId = say(
    ctx,
    gang,
    'blackmail',
    { warehouse: w.name, amount: formatEuro(amount) },
    [
      respondOption(incident, 'pay', `Zahlen (${formatEuro(amount)})`, 'Hier ist euer Geld.'),
      respondOption(incident, 'refuse', 'Ablehnen', 'Macht doch.'),
    ],
    INCIDENT_EXPIRY,
  );
  journal.add(ctx, `${gang.name} erpresst dich mit deinem ${w.name}.`, 'bad');
  logAction(ctx, gang.id, `Erpressung mit dem ${w.name}`);
  ctx.emit('gang.blackmail', { gangId: gang.id, warehouseId: w.id, amount });
  return true;
}

function resolveBlackmail(ctx: Ctx, incident: GangIncident, choice: string): CommandResult {
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  const w = incident.warehouseId ? getWarehouse(ctx.state, incident.warehouseId) : undefined;
  if (!gang || !w) return { ok: true };
  if (choice === 'pay') {
    const amount = incident.amount ?? 0;
    if (!wallet.pay(ctx, amount, 'dirty', `Schweigegeld ${gang.name}`, { category: 'tribute', cityId: w.cityId })) {
      return { ok: false, reason: 'Nicht genug Geld.' };
    }
    const s = statusOf(ctx, gang.id);
    if (s) s.money += amount;
    journal.add(ctx, `Schweigegeld an ${gang.name} gezahlt (${formatEuro(amount)}). Der ${w.name} bleibt geheim.`);
    return { ok: true };
  }
  const veedelId = warehouseVeedel(w);
  if (veedelId) {
    const raid = tipOffAgainstPlayer(ctx, veedelId, BLACKMAIL_HEAT, true);
    journal.add(
      ctx,
      `${gang.name} macht die Drohung wahr: Die Polizei weiß vom ${w.name}.${raid ? ' Eine Razzia ist geplant.' : ''}`,
      'bad',
      { veedelId },
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Chancen: Warnung vor einem Rivalen, Gefallen, Überläufer (einmal am Tag gewürfelt)

export function goodTurns(ctx: Ctx): void {
  const g = ctx.state.modules.gangs;
  const city = activeCity(ctx.state);
  if (g.lastMethodAt !== null && ctx.now - g.lastMethodAt < METHOD_GLOBAL_GAP) return;
  for (const gang of GANGS) {
    if (gang.cityId !== city) continue;
    const s = statusOf(ctx, gang.id);
    if (!s) continue;
    if (s.relation >= GOOD_TURN_MIN_RELATION && s.hostility < WARN_AT && ctx.chance(GOOD_TURN_CHANCE)) {
      if ((ctx.chance(0.5) && warnRival(ctx, gang)) || favor(ctx, gang)) {
        g.lastMethodAt = ctx.now;
        return;
      }
    }
    if (s.stage >= 2 && s.people > 2 && ctx.chance(DEFECTOR_CHANCE) && defector(ctx, gang)) {
      g.lastMethodAt = ctx.now;
      return;
    }
  }
}

/** Rivale, der dir gerade am meisten droht. */
function hostileRival(ctx: Ctx, gang: Gang): Gang | undefined {
  return GANGS.filter((o) => o.cityId === gang.cityId && o.id !== gang.id)
    .map((o) => ({ o, s: statusOf(ctx, o.id) }))
    .filter(({ s }) => s && s.stage >= 2 && s.people > 0)
    .sort((a, b) => (b.s?.hostility ?? 0) - (a.s?.hostility ?? 0))[0]?.o;
}

function warnRival(ctx: Ctx, gang: Gang): boolean {
  const enemy = hostileRival(ctx, gang);
  if (!enemy) return false;
  const incident = addIncident(ctx, {
    kind: 'warnRival',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: ctx.now + INCIDENT_EXPIRY,
    enemyId: enemy.id,
  });
  incident.messageId = say(
    ctx,
    gang,
    'warnRival',
    { enemy: enemy.name },
    [
      respondOption(
        incident,
        'prepare',
        `Leute in Stellung (${formatEuro(WARN_PREPARE_COST)})`,
        'Danke. Wir sind bereit.',
      ),
      respondOption(incident, 'thanks', 'Danke für den Tipp', 'Danke. Ich merk mir das.'),
    ],
    INCIDENT_EXPIRY,
  );
  journal.add(ctx, `${gang.name} warnt dich vor ${enemy.name}.`, 'good');
  ctx.emit('gang.goodTurn', { gangId: gang.id, kind: 'warnRival' });
  return true;
}

function favor(ctx: Ctx, gang: Gang): boolean {
  const w = getWarehouses(ctx.state, gang.cityId)[0];
  if (!w) return false;
  const amount = Math.round(ctx.randomInt(FAVOR_PAY[0], FAVOR_PAY[1]) / 50) * 50;
  const incident = addIncident(ctx, {
    kind: 'favor',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: ctx.now + INCIDENT_EXPIRY,
    warehouseId: w.id,
    amount,
  });
  incident.messageId = say(
    ctx,
    gang,
    'favor',
    { amount: formatEuro(amount) },
    [
      respondOption(incident, 'accept', `Annehmen (${formatEuro(amount)})`, 'Bringt es vorbei.'),
      respondOption(incident, 'decline', 'Ablehnen', 'Diesmal nicht.'),
    ],
    INCIDENT_EXPIRY,
  );
  ctx.emit('gang.goodTurn', { gangId: gang.id, kind: 'favor' });
  return true;
}

function defector(ctx: Ctx, gang: Gang): boolean {
  const price = Math.round(ctx.randomInt(DEFECTOR_PRICE[0], DEFECTOR_PRICE[1]) / 10) * 10;
  const incident = addIncident(ctx, {
    kind: 'defector',
    gangId: gang.id,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: ctx.now + INCIDENT_EXPIRY,
    price,
  });
  incident.messageId = messages.send(ctx, {
    contact: DEFECTOR,
    text: texts.pick(ctx, 'gang:defector', INCIDENT_TEXTS.defector, { gang: gang.name, price: formatEuro(price) }),
    options: [
      respondOption(incident, 'buy', `Kaufen (${formatEuro(price)})`, 'Erzähl.'),
      respondOption(incident, 'decline', 'Kein Interesse', 'Verschwinde.'),
    ],
    expiresIn: INCIDENT_EXPIRY,
  });
  ctx.emit('gang.goodTurn', { gangId: gang.id, kind: 'defector' });
  return true;
}

function resolveGoodTurn(ctx: Ctx, incident: GangIncident, choice: string): CommandResult {
  const gang = incident.gangId ? getGang(ctx.state, incident.gangId) : undefined;
  const s = gang ? statusOf(ctx, gang.id) : undefined;
  if (!gang || !s) return { ok: true };
  if (incident.kind === 'warnRival') {
    if (choice === 'thanks') {
      addRelation(s, 3);
      return { ok: true };
    }
    if (choice !== 'prepare') return { ok: true };
    const enemy = incident.enemyId ? statusOf(ctx, incident.enemyId) : undefined;
    if (!wallet.pay(ctx, WARN_PREPARE_COST, 'dirty', 'Leute in Stellung', 'expense.other')) {
      return { ok: false, reason: 'Nicht genug Geld.' };
    }
    // Vorgewarnt: Der Rivale schlägt so bald nicht zu (seine Abklingzeit beginnt neu).
    if (enemy) enemy.lastAttackAt = ctx.now;
    addRelation(s, 3);
    journal.add(ctx, 'Deine Leute sind vorgewarnt. Der Überfall bleibt vorerst aus.', 'good');
    return { ok: true };
  }
  if (incident.kind === 'favor') {
    if (choice !== 'accept') return { ok: true };
    const w = incident.warehouseId ? getWarehouse(ctx.state, incident.warehouseId) : undefined;
    const amount = incident.amount ?? 0;
    wallet.earn(ctx, amount, 'dirty', `Gefallen für ${gang.name}`, { category: 'income.other', cityId: gang.cityId });
    addRelation(s, FAVOR_RELATION);
    const veedelId = w ? warehouseVeedel(w) : null;
    if (veedelId) addHeat(ctx, veedelId, FAVOR_HEAT);
    journal.add(
      ctx,
      `Ware von ${gang.name} zwischengelagert: ${formatEuro(amount)}, die Beziehung wird besser.`,
      'good',
    );
    return { ok: true };
  }
  if (incident.kind === 'defector') {
    if (choice !== 'buy') return { ok: true };
    const price = incident.price ?? 0;
    if (!wallet.pay(ctx, price, 'dirty', 'Infos eines Überläufers', 'expense.other')) {
      return { ok: false, reason: 'Nicht genug Geld.' };
    }
    s.people = Math.max(0, s.people - 1);
    s.lastAttackAt = ctx.now;
    const push = s.push ? ` Gerade drängen sie nach ${veedelName(s.push.veedelId)}.` : '';
    journal.add(
      ctx,
      `Der Überläufer packt aus: ${gang.name} hat ${s.people} Leute und ${formatEuro(Math.round(s.money / 100) * 100)} in der Kasse.${push} Ihren nächsten Überfall kennst du jetzt.`,
      'good',
    );
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Antworten, Fristen, Meldungen

function removeIncident(ctx: Ctx, id: number): void {
  const g = ctx.state.modules.gangs;
  g.incidents = g.incidents.filter((i) => i.id !== id);
}

/** Befehl 'gangs.respond': Antwort auf einen Vorfall. */
export function respond(ctx: Ctx, incidentId: number, choice: string): CommandResult {
  const g = ctx.state.modules.gangs;
  const incident = g.incidents.find((i) => i.id === incidentId);
  if (!incident) return { ok: false, reason: 'Das hat sich schon erledigt.' };
  if (!INCIDENT_CHOICES[incident.kind].includes(choice)) return { ok: false, reason: 'Unbekannte Antwort.' };
  if (incident.encounterId !== undefined) return { ok: false, reason: 'Darum kümmern sich gerade deine Leute.' };
  let result: CommandResult = { ok: true };
  if (incident.kind === 'burglary') {
    if (choice === 'hunt') {
      result = huntThieves(ctx, incident);
      if (result.ok) {
        retract(ctx, incident);
        ctx.emit('gang.incidentResolved', { incidentId, kind: incident.kind, choice });
        // Bleibt offen, bis die Konfrontation entschieden ist (onRecoverResolved).
        return result;
      }
      return result;
    }
    if (choice === 'snitch') {
      if (!incident.gangId) return { ok: false, reason: 'Die Spur führt zu keiner Gang.' };
      result = ctx.dispatch({ type: 'police.snitch', payload: { gangId: incident.gangId } });
    } else if (choice === 'fire') {
      if (!incident.staffId) return { ok: false, reason: 'Niemand aus deinen Leuten steht unter Verdacht.' };
      if (isEmployed(ctx.state, incident.staffId)) {
        result = ctx.dispatch({ type: 'staff.fire', payload: { staffId: incident.staffId } });
      }
    }
  } else if (incident.kind === 'poach') result = resolvePoach(ctx, incident, choice);
  else if (incident.kind === 'intimidation') {
    result = resolveIntimidation(ctx, incident, choice);
    if (result.ok && choice === 'security' && incident.encounterId !== undefined) {
      retract(ctx, incident);
      ctx.emit('gang.incidentResolved', { incidentId, kind: incident.kind, choice });
      return result;
    }
  } else if (incident.kind === 'blackmail') result = resolveBlackmail(ctx, incident, choice);
  else result = resolveGoodTurn(ctx, incident, choice);
  if (!result.ok) return result;
  retract(ctx, incident);
  removeIncident(ctx, incident.id);
  ctx.emit('gang.incidentResolved', { incidentId, kind: incident.kind, choice });
  return { ok: true };
}

/** Optionen der Nachricht zurückziehen, wenn über die App (oder die Frist) entschieden wurde. */
function retract(ctx: Ctx, incident: GangIncident): void {
  messages.retractWhere(
    ctx,
    (m) =>
      !!m.options?.some((o) => o.command?.type === 'gangs.respond' && o.command.payload.incidentId === incident.id),
  );
}

/** Stündlich: Einbrüche am Morgen melden, abgelaufene Vorfälle mit der vorsichtigen Wahl schließen. */
export function upkeepIncidents(ctx: Ctx): void {
  const g = ctx.state.modules.gangs;
  g.intimidations = g.intimidations.filter((i) => i.until > ctx.now);
  for (const incident of [...g.incidents]) {
    if (incident.reported === false) {
      if (incident.reportAt !== undefined && incident.reportAt <= ctx.now) reportBurglary(ctx, incident);
      continue;
    }
    if (incident.encounterId !== undefined) {
      // Konfrontation läuft noch (oder ist vorbei, ohne dass gangs davon erfahren hat): nach der Frist aufräumen.
      if (incident.expiresAt + INCIDENT_EXPIRY <= ctx.now) removeIncident(ctx, incident.id);
      continue;
    }
    if (incident.expiresAt > ctx.now) continue;
    respond(ctx, incident.id, INCIDENT_CHOICES[incident.kind][0]);
  }
}

/** Kurztext eines Vorfalls für die Gangs-Seite. */
export function describeIncident(state: GameState, incident: GangIncident): string {
  const gang = incident.gangId ? getGang(state, incident.gangId) : undefined;
  switch (incident.kind) {
    case 'burglary':
      return `Einbruch im ${getWarehouse(state, incident.warehouseId ?? '')?.name ?? 'Lager'}`;
    case 'poach':
      return `${gang?.name ?? 'Eine Gang'} will ${getStaffMember(state, incident.staffId ?? '')?.name ?? 'jemanden'} abwerben`;
    case 'intimidation':
      return `${gang?.name ?? 'Eine Gang'} am ${getSpot(state, incident.spotId ?? '')?.name ?? 'Spot'}`;
    case 'blackmail':
      return `Erpressung (${formatEuro(incident.amount ?? 0)})`;
    case 'warnRival':
      return `Warnung vor ${getGang(state, incident.enemyId ?? '')?.name ?? 'einem Rivalen'}`;
    case 'favor':
      return `Gefallen für ${gang?.name ?? 'eine Gang'}`;
    case 'defector':
      return `Überläufer von ${gang?.name ?? 'einer Gang'}`;
  }
}
