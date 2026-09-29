// Die Leutnant-KI. Ein Leutnant führt sein Veedel selbstständig: Er stellt Läufer und Sicherheit an die
// Spots, setzt die Preise, hält den Bestand, verkauft selbst an freien Spots und zieht seine Leute ab,
// wenn es zu heiß wird.
//
// Wichtig: Er handelt ausschließlich über ctx.dispatch(...) mit actor 'staff:<id>', also über dieselben
// Befehle wie der Spieler. Direkt ändert er nur den eigenen Zustand (state.modules.hierarchy) und das Journal.

import { type Actor, type Command, type Ctx, journal, messages } from '../../core';
import { canServe, getSalesStats, waitingAt } from '../customers';
import { getStock, stockSummary } from '../goods';
import { getSpotPrice, hasOwnPrice, priceRatio, roundPrice, spotReferencePrice } from '../market';
import { getHeat } from '../police';
import { getCandidates } from '../recruiting';
import { type Spot, spotsInVeedel } from '../spots';
import {
  activeRunnerAt,
  getStaff,
  getStaffMember,
  isEmployed,
  isLyingLow,
  RUNNER_HIRE_COST,
  type StaffMember,
  securityAt,
  serveTime,
  staffContact,
} from '../staff';
import { availablePackages, getSuppliers, isBlocked, packagePrice, shipmentsInTransit } from '../suppliers';
import { veedelName } from '../veedel';
import {
  ACTION_INTERVAL_BASE,
  ACTION_INTERVAL_MIN,
  BASE_CAPACITY,
  CAUTION_LEVELS,
  HEAT_HYSTERESIS,
  LOG_LIMIT,
  PRICE_LEVELS,
  PRICE_TOLERANCE,
} from './config';
import type { CautionLevel, LieutenantPost } from './types';

/** Wie viele Spots ein Leutnant besetzt hält: mehr mit Level und Charisma. */
export function lieutenantCapacity(m: StaffMember): number {
  return BASE_CAPACITY + Math.floor(m.level / 2) + (m.stats.charisma >= 60 ? 1 : 0);
}

/** Abstand zwischen zwei Runden, in denen er sein Veedel ordnet. Gute Leutnants reagieren schneller. */
export function actionInterval(m: StaffMember): number {
  return Math.max(ACTION_INTERVAL_MIN, Math.round(ACTION_INTERVAL_BASE - m.stats.speed / 2 - 5 * m.level));
}

/** Ab diesem Heat zieht er die Leute ab. Ein vorsichtiger Leutnant (Wert) etwas früher. */
export function heatThreshold(caution: CautionLevel, m: StaffMember): number {
  const base = CAUTION_LEVELS[caution].heat;
  return caution === 'bold' ? base : base - Math.round((m.stats.caution - 50) / 5);
}

/** Spots, die der Leutnant besetzt hält: die mit dem meisten Andrang, so viele, wie er schafft. */
export function managedSpots(state: Ctx['state'], veedelId: string, m: StaffMember): Spot[] {
  return byDemand(spotsInVeedel(state, veedelId)).slice(0, lieutenantCapacity(m));
}

const byDemand = (spots: Spot[]): Spot[] => [...spots].sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));

/** Freie Leute eines Typs (aktiv, ohne Einsatz), die besten zuerst. */
function freeStaff(state: Ctx['state'], role: 'runner' | 'security'): StaffMember[] {
  return getStaff(state, { role, status: 'active' })
    .filter((m) => !m.assignment)
    .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
}

interface Turn {
  ctx: Ctx;
  veedelId: string;
  post: LieutenantPost;
  lt: StaffMember;
  run: (command: Command) => boolean;
}

/**
 * Eintrag ins Protokoll des Leutnants, wichtige Dinge auch ins Journal. Mit phone schreibt er dir zusätzlich
 * aufs Handy (still, ohne Banner), wie jede Figur im Spiel.
 */
function note(turn: Turn, text: string, toJournal = true, phone = false): void {
  const { ctx, post, lt, veedelId } = turn;
  // Dasselbe noch einmal (z.B. Preise nachgezogen): nur die Zeit aktualisieren.
  if (post.log[0]?.text === text) {
    post.log[0].time = ctx.now;
    return;
  }
  post.log.unshift({ time: ctx.now, text });
  if (post.log.length > LOG_LIMIT) post.log.length = LOG_LIMIT;
  if (toJournal)
    journal.add(ctx, `${lt.name} (${veedelName(veedelId)}): ${text}`, 'info', { veedelId, staffId: lt.id });
  if (phone) messages.send(ctx, { contact: staffContact(lt), text: `${veedelName(veedelId)}: ${text}`, silent: true });
}

/** Alle paar Minuten: jeder Leutnant ordnet sein Veedel (wenn es Zeit ist) und verkauft selbst. */
export function tick(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  for (const veedelId of Object.keys(h.posts).sort()) {
    const post = h.posts[veedelId];
    const lt = getStaffMember(ctx.state, post.staffId);
    if (!lt || !isEmployed(ctx.state, lt.id) || lt.status !== 'active') continue;
    const actor: Actor = `staff:${lt.id}`;
    const turn: Turn = { ctx, veedelId, post, lt, run: (command) => ctx.dispatch(command, { actor }).ok };
    // Nach einer Razzia-Warnung hält er still, bis die Luft rein ist.
    if (isLyingLow(ctx.state, veedelId)) continue;
    if (ctx.now >= post.nextActionAt) {
      manage(turn);
      post.nextActionAt = ctx.now + actionInterval(lt);
    }
    if (!post.lyingLow && ctx.now >= post.busyUntil) serveInPerson(turn);
  }
}

function manage(turn: Turn): void {
  if (handleHeat(turn)) return;
  staffSpots(turn);
  setPrices(turn);
  guardSpots(turn);
  if (turn.post.settings.mayOrder) restock(turn);
}

/**
 * Warnung des Polizei-Kontakts vor einer Razzia in seinem Veedel: Der Leutnant zieht die Leute sofort ab
 * (über denselben Befehl wie der Spieler).
 */
export function onRaidWarning(ctx: Ctx, veedelId: string, post: LieutenantPost, until: number): void {
  const lt = getStaffMember(ctx.state, post.staffId);
  if (lt?.status !== 'active' || !isEmployed(ctx.state, lt.id)) return;
  const actor: Actor = `staff:${lt.id}`;
  const turn: Turn = { ctx, veedelId, post, lt, run: (command) => ctx.dispatch(command, { actor }).ok };
  if (turn.run({ type: 'staff.lieLow', payload: { veedelId, until } })) {
    note(turn, 'Tipp vom Polizei-Kontakt: Razzia im Anmarsch. Alle runter von der Straße.', false, true);
  }
}

/** Vorsicht: bei zu viel Heat alle von der Straße holen, später zurückschicken. true = er taucht ab. */
function handleHeat(turn: Turn): boolean {
  const { ctx, veedelId, post, lt, run } = turn;
  const heat = Math.round(getHeat(ctx.state, veedelId));
  const threshold = heatThreshold(post.settings.caution, lt);
  if (!post.lyingLow && heat >= threshold) {
    post.lyingLow = true;
    let pulled = 0;
    for (const spot of spotsInVeedel(ctx.state, veedelId)) {
      for (const m of getStaff(ctx.state, { spotId: spot.id, status: 'active' })) {
        if (run({ type: 'staff.assign', payload: { staffId: m.id, assignment: null } })) pulled++;
      }
    }
    note(
      turn,
      `Zu heiß hier (Heat ${heat}). ${pulled === 1 ? 'Einen' : pulled} von der Straße geholt, wir tauchen ab.`,
      true,
      true,
    );
    return true;
  }
  if (post.lyingLow) {
    if (heat >= threshold - HEAT_HYSTERESIS) return true;
    post.lyingLow = false;
    note(turn, 'Die Luft ist wieder rein, zurück an die Arbeit.', true, true);
  }
  return false;
}

/** Läufer verteilen: leere Spots mit freien Leuten besetzen, sonst von schwachen Spots umsetzen oder anheuern. */
function staffSpots(turn: Turn): void {
  const { ctx, veedelId, lt, run } = turn;
  const managed = managedSpots(ctx.state, veedelId, lt);
  for (const spot of managed) {
    if (activeRunnerAt(ctx.state, spot.id)) continue;
    const free = freeStaff(ctx.state, 'runner')[0];
    if (free) {
      if (run(assignTo(free.id, spot))) note(turn, `${free.name} an den ${spot.name} gestellt.`);
      continue;
    }
    // Läufer von einem Spot mit weniger Andrang herholen.
    const weaker = byDemand(spotsInVeedel(ctx.state, veedelId))
      .filter((s) => !managed.includes(s))
      .reverse()
      .map((s) => activeRunnerAt(ctx.state, s.id))
      .find((r) => r !== undefined);
    if (weaker) {
      if (run(assignTo(weaker.id, spot))) note(turn, `${weaker.name} an den ${spot.name} umgesetzt, da ist mehr los.`);
      continue;
    }
    if (turn.post.settings.mayHire) hireFor(turn, spot);
  }
}

const assignTo = (staffId: string, spot: Spot): Command => ({
  type: 'staff.assign',
  payload: { staffId, assignment: { kind: 'spot', targetId: spot.id } },
});

/** Anheuern: am liebsten einen Bewerber aus dem Pool, sonst jemanden von der Straße. Nie an die Rücklage. */
function hireFor(turn: Turn, spot: Spot): void {
  const { ctx, post, run } = turn;
  const budget = ctx.state.wallet.dirty - post.settings.reserve;
  const candidate = getCandidates(ctx.state)
    .filter((c) => c.role === 'runner' && c.hireCost <= budget && c.expiresAt > ctx.now)
    .sort((a, b) => a.hireCost - b.hireCost || a.id.localeCompare(b.id))[0];
  if (candidate) {
    const hired = run({
      type: 'recruiting.hire',
      payload: { candidateId: candidate.id, assignment: { kind: 'spot', targetId: spot.id } },
    });
    if (hired) note(turn, `${candidate.name} eingestellt und an den ${spot.name} gestellt.`);
    return;
  }
  if (budget < RUNNER_HIRE_COST) return;
  if (run({ type: 'staff.hireRunner', payload: { spotId: spot.id } })) {
    note(turn, `Neuen Läufer von der Straße für den ${spot.name} angeheuert.`);
  }
}

/** Preisniveau: eigene Preise an allen Spots im Veedel, für alles, was auf Lager ist. */
function setPrices(turn: Turn): void {
  const { ctx, veedelId, post, run } = turn;
  const level = post.settings.priceLevel;
  if (level === 'keep') return;
  const factor = PRICE_LEVELS[level].factor ?? 1;
  let changed = 0;
  for (const spot of spotsInVeedel(ctx.state, veedelId)) {
    for (const { productId } of stockSummary(ctx.state)) {
      if (level === 'fair') {
        if (!hasOwnPrice(ctx.state, spot.id, productId)) continue;
        if (run({ type: 'market.setPrice', payload: { spotId: spot.id, productId, price: null } })) changed++;
        continue;
      }
      if (Math.abs(priceRatio(ctx.state, spot.id, productId) - factor) <= PRICE_TOLERANCE) continue;
      const price = roundPrice(spotReferencePrice(ctx.state, spot.id, productId) * factor);
      if (price === getSpotPrice(ctx.state, spot.id, productId)) continue;
      if (run({ type: 'market.setPrice', payload: { spotId: spot.id, productId, price } })) changed++;
    }
  }
  if (changed > 0) note(turn, `Preise angepasst (${PRICE_LEVELS[level].name}).`, false);
}

/** Freie Sicherheit an die Spots mit dem meisten Andrang stellen. */
function guardSpots(turn: Turn): void {
  const { ctx, veedelId, lt, run } = turn;
  for (const spot of managedSpots(ctx.state, veedelId, lt)) {
    if (securityAt(ctx.state, { spotId: spot.id }).length > 0) continue;
    const guard = freeStaff(ctx.state, 'security')[0];
    if (!guard) return;
    if (run(assignTo(guard.id, spot))) note(turn, `${guard.name} passt jetzt am ${spot.name} auf.`);
  }
}

/**
 * Bestand halten: Liegt der ganze Bestand (mit dem, was unterwegs ist) unter dem Mindestbestand, bestellt er
 * das günstigste Paket, das die Lücke füllt, sonst das größte, das er bezahlen kann. Nie an die Rücklage,
 * nie auf Kredit, nicht bei gesperrten Lieferanten.
 */
function restock(turn: Turn): void {
  const { ctx, post, run } = turn;
  const inTransit = shipmentsInTransit(ctx.state).reduce((sum, s) => sum + s.amount, 0);
  const deficit = post.settings.minStock - getStock(ctx.state) - inTransit;
  if (deficit <= 0) return;
  const budget = ctx.state.wallet.dirty - post.settings.reserve;
  const offers = getSuppliers(ctx.state)
    .filter((supplier) => !isBlocked(ctx.state, supplier.id))
    .flatMap((supplier) =>
      availablePackages(ctx.state, supplier.id).map((pkg) => ({
        supplier,
        pkg,
        price: packagePrice(ctx.state, supplier.id, pkg.id),
      })),
    )
    .filter((o) => o.price <= budget);
  if (offers.length === 0) {
    note(turn, 'Wir brauchen Ware, aber das Geld reicht nicht.', true, true);
    return;
  }
  // Was fragen die Kunden nach, das nicht da ist (customer.missed)? Davon zuerst, sonst irgendwas Günstiges.
  const missed = getSalesStats(ctx.state).missedByProduct;
  const wanted = (productId: string) => (missed[productId] ?? 0) / (1 + getStock(ctx.state, { productId }));
  const top = [...offers].sort((a, b) => wanted(b.pkg.productId) - wanted(a.pkg.productId))[0];
  const pool = wanted(top.pkg.productId) > 0 ? offers.filter((o) => o.pkg.productId === top.pkg.productId) : offers;
  const covering = pool.filter((o) => o.pkg.amount >= deficit).sort((a, b) => a.price - b.price)[0];
  const choice = covering ?? [...pool].sort((a, b) => b.pkg.amount - a.pkg.amount || a.price - b.price)[0];
  const ordered = run({
    type: 'suppliers.order',
    payload: { supplierId: choice.supplier.id, packageId: choice.pkg.id },
  });
  const why = pool !== offers ? ' Die Kunden fragen danach.' : '';
  if (ordered) note(turn, `Nachschub bestellt: ${choice.pkg.label} bei ${choice.supplier.name}.${why}`);
}

/** Der Leutnant verkauft selbst an Spots in seinem Veedel, an denen gerade kein Läufer steht. */
function serveInPerson(turn: Turn): void {
  const { ctx, veedelId, post, lt, run } = turn;
  for (const spot of byDemand(spotsInVeedel(ctx.state, veedelId))) {
    if (activeRunnerAt(ctx.state, spot.id)) continue;
    const customer = waitingAt(ctx.state, spot.id).find((c) => canServe(ctx.state, c.id));
    if (!customer) continue;
    if (run({ type: 'customers.serve', payload: { customerId: customer.id, sellerId: lt.id } })) {
      post.busyUntil = ctx.now + serveTime(lt);
      return;
    }
  }
}

/** Kurzer Text, was der Leutnant gerade tut (für die Oberfläche). */
export function postSummary(state: Ctx['state'], post: LieutenantPost): string {
  const lt = getStaffMember(state, post.staffId);
  if (!lt || !isEmployed(state, lt.id)) return 'weg';
  if (lt.status === 'jailed') return 'sitzt in Haft';
  if (lt.status === 'injured') return 'ist verletzt';
  if (post.lyingLow) return 'abgetaucht, zu viel Heat';
  if (post.busyUntil > state.time) return 'verkauft selbst';
  return 'hält die Stellung';
}
