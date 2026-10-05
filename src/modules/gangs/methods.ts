// Methoden der Gangs (Auftrag 23): Jede Gang macht auf ihre Art Druck (Gewichte in data.ts, traits.methods).
// Neben dem Überfall (ai.ts: launchRaid) gibt es Einbruch und Diebstahl, Abwerben, Einschüchtern, einen Tipp an die
// Polizei und Erpressung, dazu Chancen (Warnung vor einem Rivalen, ein bezahlter Gefallen).
// Was eine Antwort braucht, liegt als Vorfall (incident) im Zustand; die Nachricht trägt Optionen mit dem Befehl
// 'gangs.respond'. Ohne Antwort bis zur Frist gilt die vorsichtige Wahl (abhaken, gehen lassen, abwarten, ablehnen).

import {
  type CommandResult,
  type Contact,
  type Ctx,
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
import { addHostility, addRelation, crewFor, say, statusOf } from './common';
import type { MemoryKind } from './config';
import {
  ACTION_LOG_LIMIT,
  BLACKMAIL_BASE,
  BLACKMAIL_HEAT,
  BLACKMAIL_MAX,
  BLACKMAIL_RAID_CHANCE,
  BLACKMAIL_STOCK_SHARE,
  BURGLARY_GUARD_STOP,
  BURGLARY_HOURS,
  BURGLARY_MAX,
  BURGLARY_REPORT_HOUR,
  BURGLARY_SHARE,
  BURGLARY_TRAIL,
  FAVOR_HEAT,
  FAVOR_PAY,
  FAVOR_RELATION,
  GOOD_TURN_CHANCE,
  GOOD_TURN_MIN_RELATION,
  INCIDENT_EXPIRY,
  INTIMIDATION_DURATION,
  INTIMIDATION_FACTOR,
  INTIMIDATION_LEAVE_CHANCE,
  METHOD_GLOBAL_GAP,
  METHOD_HOSTILITY_RELIEF,
  METHOD_INTERVAL_BY_CITY,
  METHOD_MIN_PEOPLE,
  METHOD_RETRY,
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
import { remember } from './memory';
import { type GangStatus, gangVeedel, getGang, isAtPeace, isGangBroken } from './state';
import { INCIDENT_TEXTS } from './texts';

export type IncidentKind = 'burglary' | 'poach' | 'intimidation' | 'blackmail' | 'warnRival' | 'favor';

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
  /** Einbruch: geplant für diese Nacht (volle Stunde), danach ausgeführt und entfernt. */
  plannedAt?: number;
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
  return (state.modules.gangs?.incidents ?? []).filter((i) => i.reported !== false && i.kind in INCIDENT_CHOICES);
}

/** Sicherheitsleute, die zu einem eingeschüchterten Spot können. */
function securityCrew(state: GameState, spotId: string): string[] {
  return crewFor(state, { spotId }).filter((id) => getStaffMember(state, id)?.role === 'security');
}

/**
 * Antworten, die bei einem Vorfall gerade gehen (dieselben in der Nachricht und auf der Gangs-Seite). Die erste ist
 * immer die Wahl ohne Antwort bis zur Frist.
 */
export function incidentChoices(state: GameState, incident: GangIncident): string[] {
  const all = INCIDENT_CHOICES[incident.kind] ?? [];
  return all.filter((choice) => {
    if (choice === all[0]) return true;
    switch (`${incident.kind}:${choice}`) {
      case 'burglary:snitch':
        return !!incident.gangId && canSnitch(state, incident.gangId).ok;
      case 'burglary:fire':
        return !!incident.staffId && isEmployed(state, incident.staffId);
      case 'intimidation:security':
        return !!incident.spotId && securityCrew(state, incident.spotId).length > 0;
      case 'intimidation:tribute':
        return !!incident.gangId && !isAtPeace(state, incident.gangId);
      default:
        return true;
    }
  });
}

/** Beschriftung und Antworttext einer Wahl (Nachricht und Gangs-Seite). */
export function incidentChoiceLabel(state: GameState, incident: GangIncident, choice: string): [string, string] {
  const gang = incident.gangId ? getGang(state, incident.gangId) : undefined;
  const member = incident.staffId ? getStaffMember(state, incident.staffId) : undefined;
  switch (`${incident.kind}:${choice}`) {
    case 'burglary:hunt':
      return ['Täter suchen', 'Ich schick Leute los.'];
    case 'burglary:snitch':
      return [`${gang?.name ?? 'Gang'} verpfeifen`, 'Das geht an die Bullen.'];
    case 'burglary:fire':
      return [`${member?.name ?? 'Ihn'} rauswerfen`, 'Der fliegt.'];
    case 'burglary:drop':
      return ['Abhaken', 'Lass gut sein.'];
    case 'poach:raise':
      return [`Lohn auf ${formatEuro((member?.wage ?? 0) + (incident.extra ?? 0))}`, 'Du kriegst mehr. Bleib.'];
    case 'poach:threaten':
      return ['Drohen', 'Überleg dir gut, wem du was schuldest.'];
    case 'poach:release':
      return ['Gehen lassen', 'Dann geh halt.'];
    case 'intimidation:security':
      return ['Sicherheit hinschicken', 'Ich schick Leute.'];
    case 'intimidation:wait':
      return ['Abwarten', 'Die gehen schon wieder.'];
    case 'intimidation:tribute':
      return ['Schutzgeld zahlen', 'Okay. Ich zahle.'];
    case 'blackmail:pay':
      return [`Zahlen (${formatEuro(incident.amount ?? 0)})`, 'Hier ist euer Geld.'];
    case 'blackmail:refuse':
      return ['Ablehnen', 'Macht doch.'];
    case 'warnRival:prepare':
      return [`Leute in Stellung (${formatEuro(WARN_PREPARE_COST)})`, 'Danke. Wir sind bereit.'];
    case 'warnRival:thanks':
      return ['Danke für den Tipp', 'Danke. Ich merk mir das.'];
    case 'favor:accept':
      return [`Annehmen (${formatEuro(incident.amount ?? 0)})`, 'Bringt es vorbei.'];
    case 'favor:decline':
      return ['Ablehnen', 'Diesmal nicht.'];
    default:
      return [choice, choice];
  }
}

/** Antworten als Optionen der Nachricht: erst die aktiven, die Wahl ohne Antwort zuletzt. */
function incidentOptions(state: GameState, incident: GangIncident): MessageOption[] {
  const [fallback, ...rest] = incidentChoices(state, incident);
  return [...rest, fallback].map((choice) => {
    const [label, reply] = incidentChoiceLabel(state, incident, choice);
    return respondOption(incident, choice, label, reply);
  });
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
    case 'burglary':
      // Geplant wird jederzeit, eingebrochen in der nächsten Nacht (planBurglary).
      return (
        stage >= 2 &&
        stockedWarehouses(state, gang.cityId).length > 0 &&
        !state.modules.gangs.incidents.some((i) => i.plannedAt !== undefined && i.byGangId === gang.id)
      );
    case 'intimidate':
      return stage >= 2 && intimidationTargets(state, gang).length > 0;
    case 'tipOff':
      return stage >= 2 && getSpots(state, gang.cityId).some((s) => activeRunnerAt(state, s.id));
    case 'blackmail':
      return stage >= 2 && stockedWarehouses(state, gang.cityId).length > 0;
  }
}

/**
 * Methode nach den Gewichten der Gang wählen (nur, was gerade geht). Der Überfall ('raid') zählt hier nicht: Er läuft
 * über die Eskalation in ai.ts, sein Gewicht in traits.methods ist nur die Anzeige auf der Gangs-Seite.
 */
export function pickMethod(ctx: Ctx, gang: Gang, stage: number): GangMethod | null {
  const weights: Partial<Record<GangMethod, number>> = {};
  for (const [method, w] of Object.entries(gang.traits.methods) as [GangMethod, number][]) {
    if (method !== 'raid' && w > 0 && eligible(ctx, gang, method, stage)) weights[method] = w;
  }
  return weightedPick(ctx, weights);
}

/** Abstand bis zur nächsten Methode (METHOD_INTERVAL_BY_CITY, auf Stufe 1 doppelt). */
function methodInterval(ctx: Ctx, gang: Gang, s: GangStatus): number {
  const [from, to] = METHOD_INTERVAL_BY_CITY[gang.cityId] ?? METHOD_INTERVAL_BY_CITY.koeln;
  const minutes = ctx.randomInt(from * MINUTES_PER_DAY, to * MINUTES_PER_DAY);
  return s.stage >= 2 ? minutes : minutes * 2;
}

/**
 * Methoden, solange die Gang droht (ab Stufe 1, voll ab Stufe 2), zusätzlich zu den Überfällen ab Stufe 3: Ab dem
 * Beginn der Drohung hat jede Gang einen Termin (methodInterval), dazu ein Abstand zwischen allen Gangs. Hört die
 * Drohung auf, verfällt der Termin. Eine Gang ohne Leute macht keinen Druck.
 */
export function maybePressure(ctx: Ctx, gang: Gang, s: GangStatus): void {
  const g = ctx.state.modules.gangs;
  if (
    s.stage < 1 ||
    isAtPeace(ctx.state, gang.id) ||
    s.people < METHOD_MIN_PEOPLE ||
    isGangBroken(ctx.state, gang.id)
  ) {
    delete g.nextMethodAt[gang.id];
    return;
  }
  const due = g.nextMethodAt[gang.id];
  if (due === undefined) {
    g.nextMethodAt[gang.id] = ctx.now + methodInterval(ctx, gang, s);
    return;
  }
  if (ctx.now < due) return;
  if (g.lastMethodAt !== null && ctx.now - g.lastMethodAt < METHOD_GLOBAL_GAP) return;
  const method = pickMethod(ctx, gang, s.stage);
  if (method && runMethod(ctx, gang, s, method)) g.nextMethodAt[gang.id] = ctx.now + methodInterval(ctx, gang, s);
  else g.nextMethodAt[gang.id] = ctx.now + METHOD_RETRY;
}

/** Methode ausführen (außer Überfall). Gibt zurück, ob etwas passiert ist. */
export function runMethod(ctx: Ctx, gang: Gang, s: GangStatus, method: GangMethod): boolean {
  let done = false;
  if (method === 'burglary') done = planBurglary(ctx, gang);
  else if (method === 'poach') done = poach(ctx, gang);
  else if (method === 'intimidate') done = intimidate(ctx, gang);
  else if (method === 'tipOff') done = tipOff(ctx, gang);
  else if (method === 'blackmail') done = blackmail(ctx, gang);
  if (done) {
    ctx.state.modules.gangs.lastMethodAt = ctx.now;
    // Die Gang hat Druck gemacht und ist erst mal zufriedener, wie nach einem gelungenen Überfall (nur schwächer).
    addHostility(s, -METHOD_HOSTILITY_RELIEF);
  }
  return done;
}

// ---------------------------------------------------------------------------------------------
// Einbruch und Diebstahl

/** Einbruch für die nächste Nacht einplanen (volle Stunde in BURGLARY_HOURS). */
function planBurglary(ctx: Ctx, gang: Gang): boolean {
  if (stockedWarehouses(ctx.state, gang.cityId).length === 0) return false;
  const day = Math.floor(ctx.now / MINUTES_PER_DAY) * MINUTES_PER_DAY;
  const hours: number[] = [];
  for (let h = BURGLARY_HOURS[0]; h < BURGLARY_HOURS[1]; h++) hours.push(h);
  const tonight = hours.map((h) => day + h * 60).filter((t) => t > ctx.now);
  const plannedAt = tonight.length > 0 ? ctx.pick(tonight) : day + MINUTES_PER_DAY + ctx.pick(hours) * 60;
  const reportAt = nextReport(plannedAt);
  addIncident(ctx, {
    kind: 'burglary',
    gangId: null,
    byGangId: gang.id,
    cityId: gang.cityId,
    expiresAt: reportAt + INCIDENT_EXPIRY,
    plannedAt,
    reportAt,
    reported: false,
  });
  return true;
}

/** Geplante Einbrüche einer Gang sofort ausführen (Tests, Dev-Abkürzungen, Szenen). */
export function burgleNow(ctx: Ctx, gangId: string): void {
  for (const incident of [...ctx.state.modules.gangs.incidents]) {
    if (incident.plannedAt !== undefined && incident.byGangId === gangId) runBurglary(ctx, incident);
  }
}

/** Geplanter Einbruch: Jetzt ist es so weit. Gibt es nichts mehr zu holen, fällt er aus. */
function runBurglary(ctx: Ctx, incident: GangIncident): void {
  incident.plannedAt = undefined;
  delete incident.plannedAt;
  const gang = getGang(ctx.state, incident.byGangId);
  if (!gang || !burglary(ctx, gang, incident)) removeIncident(ctx, incident.id);
}

function burglary(ctx: Ctx, gang: Gang, incident: GangIncident): boolean {
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
    // Verscheucht: Die Nachbarin meldet es am Morgen, nichts fehlt.
    Object.assign(incident, { expiresAt: reportAt, reportAt, warehouseId: w.id, amount: 0 });
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
  Object.assign(incident, {
    gangId: trail === 'gang' ? gang.id : null,
    expiresAt: reportAt + INCIDENT_EXPIRY,
    reportAt,
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
  if (!incident.amount || !incident.productId) {
    // Verscheucht.
    messages.send(ctx, {
      contact: NEIGHBOR,
      text: texts.pick(ctx, 'gang:burglaryFoiled', INCIDENT_TEXTS.burglaryFoiled, { warehouse }),
    });
    journal.add(ctx, `Einbruchsversuch am ${warehouse}: Deine Wache hat sie verscheucht.`, 'good');
    removeIncident(ctx, incident.id);
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
  const options = incidentOptions(ctx.state, incident);
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
  // Ins Protokoll einer Gang nur, wenn die Spur zu ihr führt: Wer es wirklich war, weißt du sonst nicht.
  if (gang) logAction(ctx, gang.id, `Einbruch im ${warehouse}: ${goods}`);
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

/**
 * Ergebnis der Suche nach den Tätern: Nur ein Erfolg bringt das Diebesgut zurück (RECOVER_SHARE davon). Rückzug und
 * Niederlage bringen nichts (wegen skipEffects zählt das Teil-Ergebnis der Ware hier nicht: Bei einem Rückzug stünde
 * es auf „gehalten“, obwohl niemand etwas zurückgeholt hat).
 */
export function onRecoverResolved(ctx: Ctx, incidentId: number, outcome: string): void {
  const incident = ctx.state.modules.gangs.incidents.find((i) => i.id === incidentId);
  if (!incident) return;
  removeIncident(ctx, incident.id);
  const amount = outcome === 'success' ? Math.round((incident.amount ?? 0) * RECOVER_SHARE) : 0;
  if (amount <= 0 || !incident.productId) {
    journal.add(ctx, 'Die Suche nach den Dieben war umsonst. Die Ware bleibt weg.', 'bad');
    return;
  }
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
    options: incidentOptions(ctx.state, incident),
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
  const options = incidentOptions(ctx.state, incident);
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
  if (choice === 'tribute') {
    const paid = ctx.dispatch({ type: 'gangs.payTribute', payload: { gangId: gang.id } });
    if (!paid.ok) return paid;
    endIntimidation(ctx, spot.id);
    journal.add(ctx, `Schutzgeld an ${gang.name}: Ihre Leute ziehen vom ${spot.name} ab.`, 'info', {
      spotId: spot.id,
    });
    return paid;
  }
  if (choice !== 'security') return { ok: true };
  const crew = securityCrew(ctx.state, spot.id);
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
    incidentOptions(ctx.state, incident),
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
    const raid = tipOffAgainstPlayer(ctx, veedelId, BLACKMAIL_HEAT, ctx.chance(BLACKMAIL_RAID_CHANCE));
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
// Chancen: Warnung vor einem Rivalen, Gefallen (einmal am Tag gewürfelt)

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
    incidentOptions(ctx.state, incident),
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
    incidentOptions(ctx.state, incident),
    INCIDENT_EXPIRY,
  );
  ctx.emit('gang.goodTurn', { gangId: gang.id, kind: 'favor' });
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
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Antworten, Fristen, Meldungen

function removeIncident(ctx: Ctx, id: number): void {
  const g = ctx.state.modules.gangs;
  g.incidents = g.incidents.filter((i) => i.id !== id);
}

/** Woran sich die Gang nach deiner Antwort auf einen Vorfall erinnert (Auftrag 34). */
const INCIDENT_MEMORIES: Readonly<Record<string, MemoryKind>> = {
  'burglary:hunt': 'hunted',
  'poach:threaten': 'threatened',
  'intimidation:security': 'chasedOff',
  'intimidation:tribute': 'tributePaid',
  'blackmail:pay': 'blackmailPaid',
  'blackmail:refuse': 'blackmailRefused',
  'favor:accept': 'favor',
  'warnRival:thanks': 'warned',
  'warnRival:prepare': 'warned',
};

function rememberIncident(ctx: Ctx, incident: GangIncident, choice: string): void {
  const kind = INCIDENT_MEMORIES[`${incident.kind}:${choice}`];
  const gangId = incident.gangId ?? incident.byGangId;
  if (kind && gangId) remember(ctx, gangId, kind);
}

/** Befehl 'gangs.respond': Antwort auf einen Vorfall. */
export function respond(ctx: Ctx, incidentId: number, choice: string): CommandResult {
  const g = ctx.state.modules.gangs;
  const incident = g.incidents.find((i) => i.id === incidentId);
  if (!incident) return { ok: false, reason: 'Das hat sich schon erledigt.' };
  if (!INCIDENT_CHOICES[incident.kind]?.includes(choice)) return { ok: false, reason: 'Unbekannte Antwort.' };
  if (incident.encounterId !== undefined) return { ok: false, reason: 'Darum kümmern sich gerade deine Leute.' };
  let result: CommandResult = { ok: true };
  if (incident.kind === 'burglary') {
    if (choice === 'hunt') {
      result = huntThieves(ctx, incident);
      if (result.ok) {
        retract(ctx, incident);
        rememberIncident(ctx, incident, choice);
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
      rememberIncident(ctx, incident, choice);
      ctx.emit('gang.incidentResolved', { incidentId, kind: incident.kind, choice });
      return result;
    }
  } else if (incident.kind === 'blackmail') result = resolveBlackmail(ctx, incident, choice);
  else result = resolveGoodTurn(ctx, incident, choice);
  if (!result.ok) return result;
  retract(ctx, incident);
  removeIncident(ctx, incident.id);
  rememberIncident(ctx, incident, choice);
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
    // Vorfälle einer Art, die es nicht mehr gibt (Überläufer aus älteren Ständen dieses Auftrags): weg.
    if (!(incident.kind in INCIDENT_CHOICES)) {
      removeIncident(ctx, incident.id);
      continue;
    }
    if (incident.reported === false) {
      if (incident.plannedAt !== undefined) {
        if (incident.plannedAt <= ctx.now) runBurglary(ctx, incident);
        continue;
      }
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
    default:
      return 'Vorfall';
  }
}
