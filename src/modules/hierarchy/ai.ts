// Die Leutnant-KI. Ein Leutnant führt seine bis zu drei Spots selbstständig: Er stellt Läufer und Sicherheit hin,
// heuert an (mit Tagesbudget), ersetzt Ausfälle und entlässt Abwesende nach seinen Regeln, setzt die Preise, kauft
// nach seinen Bestellregeln ein, verkauft selbst an freien Spots und zieht seine Leute in einem Veedel ab, wenn es dort
// zu heiß wird (Vorsicht pro Veedel).
//
// Wichtig: Er handelt ausschließlich über ctx.dispatch(...) mit actor 'staff:<id>', also über dieselben Befehle wie
// der Spieler. Direkt ändert er nur den eigenen Zustand (state.modules.hierarchy) und das Journal.

import { type Actor, type Command, type Ctx, clock, type GameState, journal, messages, texts } from '../../core';
import { allWaiting, canServe, waitingAt } from '../customers';
import { stockSummary } from '../goods';
import { getSpotPrice, hasOwnPrice, priceRatio, roundPrice, spotReferencePrice } from '../market';
import { getHeat } from '../police';
import { atSpot, type Spot } from '../spots';
import {
  activeRunnerAt,
  freeStaff,
  getStaff,
  getStaffMember,
  isAbsent,
  isEmployed,
  isLyingLow,
  isMemberLive,
  runnerAt,
  runnerHireCost,
  type StaffMember,
  securityAt,
  serveTime,
  staffContact,
} from '../staff';
import { veedelName } from '../veedel';
import {
  ACTION_INTERVAL_BASE,
  ACTION_INTERVAL_MIN,
  CAUTION_LEVELS,
  HEAT_HYSTERESIS,
  LOG_LIMIT,
  PRICE_LEVELS,
  PRICE_TOLERANCE,
} from './config';
import { hireRunnerFor } from './hire';
import { homeWarehouse, isLieutenant, lieutenantSpots, spotList, teamOf } from './index';
import { runRestock } from './orders';
import { getRightHand, isRightHand, leadSpendingLimit, recordLeadSpending } from './righthand';
import { HIERARCHY_TEXTS } from './texts';
import type { CautionLevel, LieutenantPost } from './types';

/** Abstand zwischen zwei Runden, in denen er seine Spots ordnet. Gute Leutnants reagieren schneller. */
export function actionInterval(m: StaffMember): number {
  return Math.max(ACTION_INTERVAL_MIN, Math.round(ACTION_INTERVAL_BASE - m.stats.speed / 2 - 5 * m.level));
}

/** Ab diesem Heat zieht er die Leute ab. Ein vorsichtiger Leutnant (Wert) etwas früher. */
export function heatThreshold(caution: CautionLevel, m: StaffMember): number {
  const base = CAUTION_LEVELS[caution].heat;
  return caution === 'bold' ? base : base - Math.round((m.stats.caution - 50) / 5);
}

const byDemand = (spots: Spot[]): Spot[] => [...spots].sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));

interface Turn {
  ctx: Ctx;
  post: LieutenantPost;
  lt: StaffMember;
  run: (command: Command) => boolean;
  /** Spots, an denen er gerade arbeitet (ohne die in Veedeln, in denen er abgetaucht ist). */
  spots: Spot[];
}

/**
 * Eintrag ins Protokoll des Leutnants, wichtige Dinge auch ins Journal. Mit phone schreibt er dir zusätzlich
 * aufs Handy (still, ohne Banner), wie jede Figur im Spiel.
 */
function note(turn: Turn, text: string, toJournal = true, phone = false): void {
  const { ctx, post, lt } = turn;
  // Dasselbe noch einmal (z.B. Preise nachgezogen): nur die Zeit aktualisieren.
  if (post.log[0]?.text === text) {
    post.log[0].time = ctx.now;
    return;
  }
  post.log.unshift({ time: ctx.now, text });
  if (post.log.length > LOG_LIMIT) post.log.length = LOG_LIMIT;
  if (toJournal) journal.add(ctx, `${lt.name}: ${text}`, 'info', { staffId: lt.id });
  if (phone) messages.send(ctx, { contact: staffContact(lt), text, silent: true });
}

function turnFor(ctx: Ctx, post: LieutenantPost, lt: StaffMember): Turn {
  const actor: Actor = `staff:${lt.id}`;
  const hiding = (spot: Spot) => post.lyingLow.includes(spot.veedelId) || isLyingLow(ctx.state, spot.veedelId);
  // Die Spots erst ausrechnen, wenn jemand fragt (der Einkauf bei jedem Tick braucht sie nicht).
  let spots: Spot[] | null = null;
  return {
    ctx,
    post,
    lt,
    run: (command) => ctx.dispatch(command, { actor }).ok,
    get spots() {
      spots ??= byDemand(lieutenantSpots(ctx.state, post.staffId).filter((s) => !hiding(s)));
      return spots;
    },
  };
}

/**
 * Wer in diesem Schritt wegen Heat Leute von der Straße holt (Auftrag 43, K9): Statt eines Chats pro Leutnant und Veedel
 * kommt am Ende des Schritts eine Nachricht pro Stadt (von der Rechten Hand, sonst vom ersten Leutnant).
 */
interface HeatPull {
  cityId: string;
  staffId: string;
  veedelId: string;
  heat: number;
  pulled: number;
}
let heatPulls: HeatPull[] | null = null;

function reportHeatPulls(ctx: Ctx, pulls: readonly HeatPull[]): void {
  const cities = [...new Set(pulls.map((p) => p.cityId))].sort();
  for (const cityId of cities) {
    const here = pulls.filter((p) => p.cityId === cityId);
    const veedels = [...new Set(here.map((p) => p.veedelId))];
    const heat = (id: string) => Math.max(...here.filter((p) => p.veedelId === id).map((p) => p.heat));
    const people = here.reduce((sum, p) => sum + p.pulled, 0);
    const where = veedels.map((id) => `${veedelName(id)} (Heat ${heat(id)})`).join(', ');
    const rightHand = getRightHand(ctx.state, cityId);
    const from =
      getStaffMember(ctx.state, rightHand?.staffId ?? here[0].staffId) ?? getStaffMember(ctx.state, here[0].staffId);
    if (!from) continue;
    const who =
      people === 0
        ? 'Keiner stand draußen'
        : people === 1
          ? 'Einen von der Straße geholt'
          : `${people} Leute von der Straße geholt`;
    messages.send(ctx, {
      contact: staffContact(from),
      text: `Zu heiß in ${where}. ${who}. Sie gehen wieder raus, wenn es abkühlt.`,
      silent: true,
    });
  }
}

/** Alle paar Minuten: jeder Leutnant ordnet seine Spots (wenn es Zeit ist) und verkauft selbst. */
export function tick(ctx: Ctx): void {
  heatPulls = [];
  try {
    tickPosts(ctx);
  } finally {
    const pulls = heatPulls;
    heatPulls = null;
    if (pulls.length > 0) reportHeatPulls(ctx, pulls);
  }
}

function tickPosts(ctx: Ctx): void {
  const h = ctx.state.modules.hierarchy;
  for (const staffId of Object.keys(h.posts).sort()) {
    const post = h.posts[staffId];
    const lt = getStaffMember(ctx.state, staffId);
    if (!lt || !isEmployed(ctx.state, lt.id) || lt.status !== 'active') continue;
    // Leutnants in einer schlafenden Stadt ruhen (Auftrag 30): Ihr Geschäft steckt im Tagesergebnis.
    if (!isMemberLive(ctx.state, lt)) continue;
    if (ctx.now >= post.nextActionAt) {
      manage(turnFor(ctx, post, lt));
      post.nextActionAt = ctx.now + actionInterval(lt);
    }
    // Einkauf bei jedem Tick: Der Mindestbestand soll nicht erst in der nächsten Ordnungsrunde greifen. Einkauf und
    // Verkauf teilen sich einen Zug (der Einkauf fragt nicht nach den Spots, die werden erst beim Verkauf gerechnet).
    const turn = turnFor(ctx, post, lt);
    if (post.settings.mayOrder) restock(turn);
    if (ctx.now >= post.busyUntil) serveInPerson(turn);
  }
}

/**
 * Capo (Auftrag 34): Fällt ein Leutnant seines Bezirks aus, springt der Capo ein. Er ordnet dessen Spots (Ausfälle,
 * Läufer, Preise, Sicherheit) und bestellt nach dessen Bestellregeln, im eigenen Namen (actor = Capo).
 */
export function standIn(ctx: Ctx, post: LieutenantPost, capo: StaffMember): void {
  manage(turnFor(ctx, post, capo));
  if (post.settings.mayOrder) restock(turnFor(ctx, post, capo));
}

function manage(turn: Turn): void {
  handleHeat(turn);
  const fresh = turnFor(turn.ctx, turn.post, turn.lt);
  handleAbsences(fresh);
  staffSpots(fresh);
  setPrices(fresh);
  guardSpots(fresh);
}

/**
 * Warnung des Polizei-Kontakts vor einer Razzia in einem Veedel mit seinen Spots: Der Leutnant zieht die Leute dort
 * sofort ab (über denselben Befehl wie der Spieler).
 */
export function onRaidWarning(ctx: Ctx, veedelId: string, post: LieutenantPost, until: number): void {
  const lt = getStaffMember(ctx.state, post.staffId);
  if (lt?.status !== 'active' || !isEmployed(ctx.state, lt.id)) return;
  const turn = turnFor(ctx, post, lt);
  if (isLyingLow(ctx.state, veedelId)) return;
  if (turn.run({ type: 'staff.lieLow', payload: { veedelId, until } })) {
    const text = texts.pick(ctx, 'lieutenant:raidPulled', HIERARCHY_TEXTS.raidPulled, { veedel: veedelName(veedelId) });
    note(turn, text, false, true);
  }
}

/** Alle aktiven Leute an seinen Spots in diesem Veedel von der Straße holen. Gibt die Zahl zurück. */
function pullFromStreet(turn: Turn, veedelId: string): number {
  const { ctx, post, run } = turn;
  let pulled = 0;
  for (const spot of lieutenantSpots(ctx.state, post.staffId).filter((s) => s.veedelId === veedelId)) {
    for (const m of getStaff(ctx.state, { spotId: spot.id, status: 'active' })) {
      if (run({ type: 'staff.assign', payload: { staffId: m.id, assignment: null } })) pulled++;
    }
  }
  return pulled;
}

/** Vorsicht pro Veedel: bei zu viel Heat die Leute an seinen Spots dort von der Straße holen, später zurück. */
function handleHeat(turn: Turn): void {
  const { ctx, post, lt } = turn;
  const threshold = heatThreshold(post.settings.caution, lt);
  const veedels = [...new Set(lieutenantSpots(ctx.state, post.staffId).map((s) => s.veedelId))].sort();
  for (const veedelId of veedels) {
    const heat = Math.round(getHeat(ctx.state, veedelId));
    const hiding = post.lyingLow.includes(veedelId);
    if (!hiding && heat >= threshold) {
      post.lyingLow.push(veedelId);
      const pulled = pullFromStreet(turn, veedelId);
      // Aufs Handy gesammelt am Ende des Schritts (K9), sonst (Capo springt ein) wie bisher direkt.
      const collect = heatPulls !== null;
      heatPulls?.push({ cityId: lt.cityId ?? 'koeln', staffId: lt.id, veedelId, heat, pulled });
      note(
        turn,
        `Zu heiß in ${veedelName(veedelId)} (Heat ${heat}). ${pulled === 1 ? 'Einen' : pulled} von der Straße geholt.`,
        true,
        !collect,
      );
    } else if (hiding && heat >= threshold - HEAT_HYSTERESIS) {
      // Immer noch heiß: Wer inzwischen wieder dort steht (z.B. nach dem Abtauchen wegen einer Razzia), geht wieder runter.
      pullFromStreet(turn, veedelId);
    } else if (hiding) {
      post.lyingLow = post.lyingLow.filter((id) => id !== veedelId);
      const text = texts.pick(ctx, 'lieutenant:backToWork', HIERARCHY_TEXTS.backToWork, {
        veedel: veedelName(veedelId),
      });
      note(turn, text, true, true);
    }
  }
  // Veedel, in denen er keine Spots mehr hat, vergessen.
  post.lyingLow = post.lyingLow.filter((id) => veedels.includes(id));
}

/** Was er heute noch ausgeben darf (Rücklage, Tagesbudget fürs Anheuern, Grenze der Rechten Hand). */
function budget(turn: Turn, forHiring: boolean): number {
  const { ctx, post } = turn;
  const day = clock.day(ctx.now);
  if (post.spentDay !== day) {
    post.spentDay = day;
    post.hireSpent = 0;
  }
  let left = ctx.state.wallet.dirty - post.settings.reserve;
  if (forHiring) left = Math.min(left, post.settings.hireBudgetPerDay - post.hireSpent);
  return Math.min(left, leadSpendingLimit(ctx.state, forHiring ? 'staff' : 'goods'));
}

function spend(turn: Turn, amount: number, hiring: boolean): void {
  if (hiring) turn.post.hireSpent += amount;
  recordLeadSpending(turn.ctx, amount);
}

/**
 * Ausfälle im Team (Haft, verletzt) nach seinen Regeln: sofort ersetzen ('replace', 'fireAndReplace'), bei
 * 'fireAndReplace' nach absentDays Tagen entlassen, bei 'fireNow' sofort entlassen und ersetzen. Fehlen gerade Leute
 * oder Budget, sagt er das einmal und versucht es bei jedem Durchgang wieder. Aktive Leute entlässt er nie. Jede
 * Entscheidung geht still aufs Handy und ins Protokoll.
 */
function handleAbsences(turn: Turn): void {
  const { ctx, post, run } = turn;
  const policy = post.settings.onAbsent;
  if (policy === 'wait') return;
  // Wer schon ersetzt wurde, steht nicht mehr an seinem Spot, zählt aber bis zur Entscheidung weiter mit.
  const tracked = Object.keys(post.absences)
    .map((id) => getStaffMember(ctx.state, id))
    .filter((m): m is StaffMember => !!m && isEmployed(ctx.state, m.id));
  const people = [...teamOf(ctx.state, post.staffId), ...tracked].filter(
    (m, i, all) =>
      all.findIndex((x) => x.id === m.id) === i && !isLieutenant(ctx.state, m.id) && !isRightHand(ctx.state, m.id),
  );
  for (const m of people) {
    if (!isAbsent(m)) continue;
    const absence = post.absences[m.id] ?? { since: ctx.now, replaced: false };
    post.absences[m.id] = absence;
    const what = m.status === 'jailed' ? 'sitzt' : 'ist verletzt';
    const until = m.statusUntil !== null ? ` bis Tag ${clock.day(m.statusUntil)}` : '';
    const atMySpot = m.returnTo?.kind === 'spot' && post.spotIds.includes(m.returnTo.targetId);
    const fireNow = policy === 'fireNow';
    if (!absence.replaced && atMySpot) {
      const spotId = m.returnTo?.targetId ?? '';
      const free = freeStaff(ctx.state, m.role === 'security' ? 'security' : 'runner')[0];
      const cost = free || m.role !== 'runner' ? 0 : runnerHireCost(ctx.state, spotId);
      const canHire = free || (post.settings.mayHire && cost <= budget(turn, true));
      if (canHire && run({ type: 'staff.replace', payload: { staffId: m.id, fire: fireNow } })) {
        absence.replaced = true;
        if (cost > 0) spend(turn, cost, true);
        const replacement = activeRunnerAt(ctx.state, spotId) ?? securityAt(ctx.state, { spotId })[0];
        const team = replacement && !post.team.includes(replacement.id) && cost > 0;
        if (team && replacement) post.team.push(replacement.id);
        const who = replacement?.name ?? 'Jemand Neues';
        if (fireNow) {
          delete post.absences[m.id];
          note(turn, `${m.name} ${what}. Hab ihn rausgeworfen, ${who} übernimmt.`, true, true);
          continue;
        }
        note(turn, `${m.name} ${what}${until}. ${who} übernimmt.`, true, true);
      } else if (fireNow) {
        // Sofort raus, auch wenn gerade niemand einspringen kann: Den leeren Spot besetzt er, sobald es geht.
        if (run({ type: 'staff.fire', payload: { staffId: m.id } })) {
          delete post.absences[m.id];
          note(turn, `${m.name} ${what}. Hab ihn rausgeworfen, für den Spot such ich noch wen.`, true, true);
        }
        continue;
      } else if (!absence.stuck) {
        absence.stuck = true;
        note(turn, `${m.name} ${what}${until}. Gerade kann niemand einspringen, ich bleib dran.`, true, true);
      }
    } else if (fireNow && !atMySpot) {
      // Ausfall ohne Spot (z.B. schon ersetzt): sofort raus.
      if (run({ type: 'staff.fire', payload: { staffId: m.id } })) {
        delete post.absences[m.id];
        note(turn, `${m.name} ${what}. Hab ihn rausgeworfen.`, true, true);
      }
      continue;
    }
    // Entlassen nur, wer in Haft sitzt oder lange verletzt ist, nach absentDays Tagen.
    if (policy === 'fireAndReplace' && ctx.now - absence.since >= post.settings.absentDays * 1440) {
      if (run({ type: 'staff.fire', payload: { staffId: m.id } })) {
        delete post.absences[m.id];
        const since = post.settings.absentDays === 1 ? 'einem Tag' : `${post.settings.absentDays} Tagen`;
        note(turn, `${m.name} ${what} seit ${since}. Hab ihn rausgeworfen.`, true, true);
      }
    }
  }
}

/** Läufer verteilen: leere Spots mit freien Leuten besetzen, sonst anheuern (mit Tagesbudget). */
function staffSpots(turn: Turn): void {
  const { ctx, post, run } = turn;
  for (const spot of turn.spots) {
    if (activeRunnerAt(ctx.state, spot.id)) continue;
    // "Abwarten": Der Platz bleibt frei, bis die Person aus Haft oder Krankenhaus zurück ist.
    if (post.settings.onAbsent === 'wait' && runnerAt(ctx.state, spot.id)) continue;
    const free = freeStaff(ctx.state, 'runner')[0];
    if (free) {
      if (run(assignTo(free.id, spot))) note(turn, `${free.name} steht jetzt ${atSpot(spot)}.`);
      continue;
    }
    if (post.settings.mayHire) hireFor(turn, spot);
  }
}

const assignTo = (staffId: string, spot: Spot): Command => ({
  type: 'staff.assign',
  payload: { staffId, assignment: { kind: 'spot', targetId: spot.id } },
});

/** Anheuern (gemeinsam mit der Rechten Hand, siehe hire.ts): Bewerber vor Straße, nie an die Rücklage. */
function hireFor(turn: Turn, spot: Spot): void {
  const { ctx, post } = turn;
  const hired = hireRunnerFor(ctx, `staff:${turn.lt.id}`, spot.id, budget(turn, true));
  if (!hired) return;
  spend(turn, hired.cost, true);
  if (hired.staffId) post.team.push(hired.staffId);
  note(
    turn,
    hired.fromPool
      ? `${hired.name} eingestellt, steht jetzt ${atSpot(spot)}.`
      : `Neuen Läufer von der Straße ${atSpot(spot)} angeheuert.`,
    true,
    true,
  );
}

/** Preisniveau: eigene Preise an seinen Spots, für alles, was auf Lager ist. */
function setPrices(turn: Turn): void {
  const { ctx, post, run } = turn;
  const level = post.settings.priceLevel;
  if (level === 'keep') return;
  const factor = PRICE_LEVELS[level].factor ?? 1;
  let changed = 0;
  for (const spot of lieutenantSpots(ctx.state, post.staffId)) {
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

/** Freie Sicherheit an seine Spots mit dem meisten Andrang stellen. */
function guardSpots(turn: Turn): void {
  const { ctx, run } = turn;
  for (const spot of turn.spots) {
    if (securityAt(ctx.state, { spotId: spot.id }).length > 0) continue;
    const guard = freeStaff(ctx.state, 'security')[0];
    if (!guard) return;
    if (run(assignTo(guard.id, spot))) note(turn, `${guard.name} passt jetzt ${atSpot(spot)} auf.`);
  }
}

/**
 * Einkauf nach Bestellregeln (gemeinsamer Code mit der Rechten Hand, siehe orders.ts). Läuft bei jedem Tick, nicht nur
 * in seiner Ordnungsrunde, damit Ware rechtzeitig kommt. Gesperrte Lieferanten lassen die Regel ruhen (Meldung im
 * Protokoll und still aufs Handy, einmal pro Grund).
 */
function restock(turn: Turn): void {
  const { ctx, post, lt } = turn;
  if (post.settings.orderRules.length === 0) return;
  const home = () => homeWarehouse(ctx.state, post.staffId)?.id ?? null;
  runRestock(ctx, post.settings.orderRules, home, `staff:${lt.id}`, {
    cityId: lt.cityId ?? 'koeln',
    budget: () => budget(turn, false),
    onPause: (_rule, reason) => note(turn, `Bestellung ruht: ${reason}`, true, true),
    onResume: () => note(turn, 'Bestellungen laufen wieder.', false),
    onNoMoney: () => note(turn, 'Wir brauchen Ware, aber das Geld reicht nicht.', true, true),
    onOrdered: (plan) => {
      spend(turn, plan.price, false);
      note(turn, `Nachschub bestellt: ${plan.pkg.label} bei ${plan.supplier.name}.${plan.why}`);
    },
  });
}

/** Der Leutnant verkauft selbst an seinen Spots, an denen gerade kein Läufer steht. */
function serveInPerson(turn: Turn): void {
  const { ctx, post, lt, run } = turn;
  // Wartet an keinem seiner Spots jemand, gibt es nichts zu tun (spart das Sortieren seiner Spots).
  if (!allWaiting(ctx.state).some((c) => post.spotIds.includes(c.spotId))) return;
  for (const spot of turn.spots) {
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
export function postSummary(state: GameState, post: LieutenantPost): string {
  const lt = getStaffMember(state, post.staffId);
  if (!lt || !isEmployed(state, lt.id)) return 'weg';
  if (lt.status === 'jailed') return 'sitzt in Haft';
  if (lt.status === 'injured') return 'ist verletzt';
  if (post.spotIds.length === 0) return 'hat keine Spots';
  if (post.lyingLow.length > 0) return `abgetaucht in ${post.lyingLow.map(veedelName).join(', ')}`;
  if (post.busyUntil > state.time) return 'verkauft selbst';
  return `führt ${spotList(state, post.spotIds)}`;
}
