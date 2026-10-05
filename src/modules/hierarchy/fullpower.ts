// Vollmacht der Rechten Hand (Auftrag 30): Bevor du Köln verlässt, übergibst du die Stadt deiner Rechten Hand. Sie
// braucht dafür die höchste Stufe und alle Aufgaben an, und alle Veedel der Stadt müssen dir gehören
// (fullPowerMissing). Mit Vollmacht macht sie, was du sonst machst, jede Aufgabe einzeln abschaltbar
// (settings.fullPowerTasks), alles über ctx.dispatch mit ihrem Actor und bestehende Befehle:
//   - Leutnants: ernennt für Spots ohne Leutnant jemanden ab Level 3 mit genug Loyalität (bis zu drei Spots, die im
//     selben Veedel zuerst) und setzt ab, wer zwei Tage Verlust macht oder untreu wird.
//   - Preise: an Spots ohne Leutnant um den Richtpreis, billiger im Preiskrieg, teurer bei gutem Ruf.
//   - Personal führen: entlässt Untreue und Leute ohne Einsatz, wenn die Löhne drücken (einstellen macht "Personal").
//   - Ausbau: schaltet Spots frei und kauft Lager, wenn das Tagesbudget es hergibt und die Kasse zwei Wochen Löhne deckt.
//   - Gangs und Chefsache: Schutzgeld bis zu ihrem Betrag zahlen, sonst ablehnen; Deals bis zu ihrem Betrag.
// Dafür bekommt sie jeden Tag ihren Anteil (FULL_POWER_SHARE) am Tagesgewinn der Stadt laut Kasse, nur bei Gewinn.
// Widerrufen kostet Loyalität und Laune; Stufe und Aufgaben behält sie.

import {
  type Actor,
  type CommandMeta,
  type CommandResult,
  type Ctx,
  clock,
  formatEuro,
  type GameState,
  journal,
  messages,
  wallet,
} from '../../core';
import { activeCity, cityName } from '../city';
import { cityReport, lieutenantResult, wageRunway } from '../finance';
import { getGangStatus, tributeAmount } from '../gangs';
import { getWarehouses, isWarehouseOwned, stockSummary, warehouseSites } from '../goods';
import { getCompetitionFactor, getSpotPrice, hasOwnPrice, priceRatio, roundPrice, spotReferencePrice } from '../market';
import { getReputation } from '../reputation';
import { getSpots, lockedSpots, type Spot, spotCity } from '../spots';
import {
  addCareer,
  addLoyalty,
  getStaff,
  getStaffMember,
  isSpecialist,
  payrollDue,
  type StaffMember,
  staffContact,
} from '../staff';
import {
  FP_DISMISS_LOSS_DAYS,
  FP_DISMISS_LOYALTY,
  FP_EXPANSION_RUNWAY_DAYS,
  FP_FIRE_IDLE_DAYS,
  FP_FIRE_LOYALTY,
  FP_LIEUTENANT_MIN_LEVEL,
  FP_LIEUTENANT_MIN_LOYALTY,
  FP_PRICE_DEFAULT,
  FP_PRICE_GOOD_REPUTATION,
  FP_PRICE_PRICE_WAR,
  FULL_POWER_SHARE,
  LOG_LIMIT,
  MAX_SPOTS_PER_LIEUTENANT,
  PRICE_TOLERANCE,
  REVOKE_GRUDGE_DAYS,
  REVOKE_LOYALTY,
} from './config';
import { canBeLieutenant, getLieutenantIds, getPost, isLieutenant, lieutenantOfSpot } from './index';
import { activeRightHand, allRightHands, fullPowerMissing, getRightHand, isRightHand } from './righthand';
import type { FullPowerDone, FullPowerTaskKey, RightHandPost } from './types';

const VIA = 'Rechte Hand';
const DAY = 24 * 60;

/** Name der Stadt für Texte. */
export function cityLabel(cityId: string): string {
  return cityName(cityId);
}

export function emptyFullPowerDone(): FullPowerDone {
  return { appointed: 0, dismissed: 0, repriced: 0, fired: 0, expanded: 0, answered: 0, share: 0 };
}

/** Text für den Bericht, z.B. "1 Leutnant ernannt, Preise an 3 Spots angepasst". */
export function describeFullPowerDone(done: FullPowerDone): string {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
  if (done.appointed > 0) parts.push(`${n(done.appointed, 'Leutnant', 'Leutnants')} ernannt`);
  if (done.dismissed > 0) parts.push(`${n(done.dismissed, 'Leutnant', 'Leutnants')} abgesetzt`);
  if (done.repriced > 0) parts.push(`Preise an ${n(done.repriced, 'Spot', 'Spots')} angepasst`);
  if (done.fired > 0) parts.push(`${n(done.fired, 'Person', 'Leute')} entlassen`);
  if (done.expanded > 0) parts.push(`${n(done.expanded, 'Ausbau', 'Ausbauten')}`);
  if (done.answered > 0) parts.push(`${n(done.answered, 'Sache', 'Sachen')} mit den Gangs geregelt`);
  return parts.join(', ');
}

/** Führt die Rechte Hand diese Stadt mit Vollmacht? */
export function hasFullPower(state: GameState, cityId = 'koeln'): boolean {
  return getRightHand(state, cityId)?.fullPower?.cityId === cityId;
}

function isFullPowerTaskActive(rh: RightHandPost, key: FullPowerTaskKey): boolean {
  return !!rh.fullPower && rh.settings.fullPowerTasks[key];
}

function note(ctx: Ctx, rh: RightHandPost, text: string): void {
  if (rh.log[0]?.text === text) {
    rh.log[0].time = ctx.now;
    return;
  }
  rh.log.unshift({ time: ctx.now, text });
  if (rh.log.length > LOG_LIMIT) rh.log.length = LOG_LIMIT;
}

// ---------------------------------------------------------------------------------------------
// Befehle

/** Vollmacht geben (Chefsache, nur vom Spieler). */
export function grantFullPower(ctx: Ctx, cityId: string, meta: CommandMeta): CommandResult {
  if (meta.actor !== 'player') return { ok: false, reason: 'Vollmacht gibt nur der Boss.' };
  // Die Rechte Hand dieser Stadt (eine pro Stadt).
  const rh = getRightHand(ctx.state, cityId);
  if (rh?.fullPower) return { ok: false, reason: `Sie führt schon ${cityLabel(rh.fullPower.cityId)}.` };
  const missing = fullPowerMissing(ctx.state, cityId);
  if (missing.length > 0 || !rh) return { ok: false, reason: missing[0] ?? 'Du hast keine Rechte Hand.' };
  const m = getStaffMember(ctx.state, rh.staffId);
  if (!m) return { ok: false, reason: 'Du hast keine Rechte Hand.' };
  const day = clock.day(ctx.now);
  rh.fullPower = {
    since: ctx.now,
    cityId,
    share: FULL_POWER_SHARE,
    // Ihr erster Anteil gilt für den laufenden Buchungstag (Mitternacht gehört zum Vortag, siehe finance).
    paidDay: Math.max(0, day - 1),
    spentDay: day,
    spent: 0,
    done: emptyFullPowerDone(),
  };
  rh.grudgeUntil = null;
  rh.nextActionAt = ctx.now;
  addCareer(ctx, m.id, `Hat volle Macht über ${cityLabel(cityId)} bekommen.`);
  journal.add(
    ctx,
    `${m.name} führt ${cityLabel(cityId)} jetzt mit voller Macht. Ihr Anteil: ${Math.round(FULL_POWER_SHARE * 100)} % vom Tagesgewinn.`,
    'good',
    { staffId: m.id },
  );
  messages.send(ctx, {
    contact: staffContact(m),
    text: `${cityLabel(cityId)} ist bei mir in guten Händen. Jeden Morgen kriegst du den Bericht, und jeden Tag mein Anteil, wenn was übrig ist. Du kannst jederzeit zurückkommen.`,
    silent: true,
  });
  ctx.emit('hierarchy.fullPowerGranted', { staffId: m.id, cityId });
  return { ok: true };
}

/** Vollmacht zurückziehen: Sie ist verstimmt (Loyalität, Laune), behält Stufe und Aufgaben. */
export function revokeFullPower(ctx: Ctx, meta: CommandMeta, cityId?: string): CommandResult {
  if (meta.actor !== 'player') return { ok: false, reason: 'Das entscheidet nur der Boss.' };
  // Ohne Stadt: die aktive, sonst die einzige mit Vollmacht.
  const rh =
    (cityId ? getRightHand(ctx.state, cityId) : getRightHand(ctx.state)) ??
    (cityId ? null : (allRightHands(ctx.state).find((r) => r.post.fullPower)?.post ?? null));
  const fp = rh?.fullPower;
  if (!rh || !fp) return { ok: false, reason: 'Deine Rechte Hand hat keine Vollmacht.' };
  const m = getStaffMember(ctx.state, rh.staffId);
  rh.fullPower = null;
  rh.grudgeUntil = ctx.now + REVOKE_GRUDGE_DAYS * DAY;
  if (m) {
    addLoyalty(ctx, m.id, REVOKE_LOYALTY);
    addCareer(ctx, m.id, `Die Vollmacht über ${cityLabel(fp.cityId)} wurde ihr entzogen.`);
    messages.send(ctx, {
      contact: staffContact(m),
      text: 'Wie du willst. Dann machst du das ab jetzt wieder selbst. Ich hätte mir mehr Vertrauen gewünscht.',
    });
  }
  journal.add(ctx, `Vollmacht über ${cityLabel(fp.cityId)} zurückgezogen. Ab jetzt entscheidest du wieder.`, 'info');
  ctx.emit('hierarchy.fullPowerRevoked', { staffId: rh.staffId, cityId: fp.cityId });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Anteil am Tagesgewinn

/**
 * Ist ein Buchungstag abgeschlossen (nach Mitternacht, alle Löhne gebucht), bekommt sie ihren Anteil am Gewinn dieses
 * Tages. Ihr eigener Anteil vom Vortag zählt dabei nicht als Kosten (sonst schrumpfte er jeden Tag).
 */
export function payShare(ctx: Ctx, rh: RightHandPost, member: StaffMember): void {
  const fp = rh.fullPower;
  if (!fp) return;
  // finance: Mitternacht gehört zum Vortag; der abgeschlossene Tag ist der vor dem laufenden Buchungstag.
  const closed = Math.max(1, clock.day(ctx.now - 1)) - 1;
  if (closed <= fp.paidDay) return;
  const today = Math.max(1, clock.day(ctx.now - 1));
  for (let day = fp.paidDay + 1; day <= closed; day++) {
    // Nur ihre Stadt (Auftrag 30): eigenes Geschäft, im Schlafmodus das Tagesergebnis (income.city).
    const report = cityReport(ctx.state, fp.cityId, 1, today - day);
    const ownShare = report.rows.find((r) => r.category === 'share.righthand')?.amount ?? 0;
    const profit = report.profit - ownShare;
    fp.paidDay = day;
    if (profit <= 0) {
      note(ctx, rh, `Tag ${day}: kein Gewinn, kein Anteil.`);
      continue;
    }
    const amount = Math.min(Math.round(profit * fp.share), Math.floor(ctx.state.wallet.dirty));
    if (amount <= 0) continue;
    wallet.pay(ctx, amount, 'dirty', `Anteil ${member.name} (${cityLabel(fp.cityId)})`, {
      category: 'share.righthand',
      staffId: member.id,
      cityId: fp.cityId,
    });
    fp.done.share += amount;
    note(ctx, rh, `Tag ${day}: Gewinn ${formatEuro(profit)}, mein Anteil ${formatEuro(amount)}.`);
    ctx.emit('hierarchy.shareTaken', { staffId: member.id, cityId: fp.cityId, day, profit, amount });
  }
}

// ---------------------------------------------------------------------------------------------
// Aufgaben mit Vollmacht (stündlich)

export function runFullPowerTasks(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const hour = clock.hour(ctx.now);
  if (isFullPowerTaskActive(rh, 'diplomacy')) diplomacy(ctx, rh, actor);
  if (isFullPowerTaskActive(rh, 'lieutenants')) {
    appointLieutenants(ctx, rh, actor);
    if (hour === 9) dismissLieutenants(ctx, rh, actor);
  }
  if (isFullPowerTaskActive(rh, 'pricing') && hour % 6 === 0) setPrices(ctx, rh, actor);
  if (isFullPowerTaskActive(rh, 'hr')) manageStaff(ctx, rh, member, actor);
  if (isFullPowerTaskActive(rh, 'expansion') && hour === 12) expand(ctx, rh, actor);
}

/** Spots, um die sie sich kümmert: die ihrer Stadt (sie arbeitet nur, wenn die Stadt live ist). */
function citySpots(state: GameState): readonly Spot[] {
  return getSpots(state, activeCity(state));
}

/** Leutnants: Spots ohne Leutnant bekommen jemanden (höchstens einen pro Stunde). */
function appointLieutenants(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  const state = ctx.state;
  const unled = citySpots(state)
    .filter((s) => !lieutenantOfSpot(state, s.id))
    .sort((a, b) => b.demand - a.demand || a.id.localeCompare(b.id));
  if (unled.length === 0) return;
  const candidates = getStaff(state, { status: 'active', role: 'runner', cityId: activeCity(state) })
    .filter((m) => m.level >= FP_LIEUTENANT_MIN_LEVEL && m.stats.loyalty >= FP_LIEUTENANT_MIN_LOYALTY)
    // Wer aus einem alten Spielstand noch in eine andere Stadt fährt, bleibt dabei.
    .filter((m) => m.assignment?.kind !== 'travel')
    .filter((m) => !isLieutenant(state, m.id) && !isRightHand(state, m.id) && canBeLieutenant(state, m.id).ok)
    .sort((a, b) => b.level - a.level || b.stats.loyalty - a.stats.loyalty || a.id.localeCompare(b.id));
  const best = candidates[0];
  if (!best) return;
  // Wo er steht, zuerst; dann das Veedel mit den meisten führungslosen Spots, dann nach Andrang.
  const own = best.assignment?.kind === 'spot' ? best.assignment.targetId : null;
  const count = (veedelId: string) => unled.filter((s) => s.veedelId === veedelId).length;
  const first = unled.find((s) => s.id === own) ?? [...unled].sort((a, b) => count(b.veedelId) - count(a.veedelId))[0];
  const spotIds = [
    first.id,
    ...unled.filter((s) => s.id !== first.id && s.veedelId === first.veedelId).map((s) => s.id),
    ...unled.filter((s) => s.veedelId !== first.veedelId).map((s) => s.id),
  ].slice(0, MAX_SPOTS_PER_LIEUTENANT);
  const result = ctx.dispatch({ type: 'hierarchy.appoint', payload: { staffId: best.id, spotIds } }, { actor });
  if (!result.ok) return;
  // Er bestellt selbst nach (Regel "alles nach Nachfrage"), sonst laufen seine Spots leer.
  ctx.dispatch({ type: 'hierarchy.configure', payload: { staffId: best.id, settings: { mayOrder: true } } }, { actor });
  if (rh.fullPower) rh.fullPower.done.appointed += 1;
  note(ctx, rh, `${best.name} zum Leutnant gemacht (${spotIds.length} ${spotIds.length === 1 ? 'Spot' : 'Spots'}).`);
}

/** Leutnants absetzen: zwei Tage Verlust an ihren Spots oder untreu. Einmal am Tag. */
function dismissLieutenants(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  const state = ctx.state;
  for (const staffId of getLieutenantIds(state)) {
    const m = getStaffMember(state, staffId);
    const post = getPost(state, staffId);
    if (!m || !post) continue;
    let losing = true;
    for (let back = 1; back <= FP_DISMISS_LOSS_DAYS; back++) {
      const r = lieutenantResult(state, staffId, 1, back);
      if (r.revenue === 0 && r.wages === 0) losing = false;
      if (r.result >= 0) losing = false;
    }
    // Wer erst kurz dabei ist, bekommt seine zwei Tage.
    if (ctx.now - post.appointedAt < FP_DISMISS_LOSS_DAYS * DAY) losing = false;
    const disloyal = m.stats.loyalty < FP_DISMISS_LOYALTY;
    if (!losing && !disloyal) continue;
    if (!ctx.dispatch({ type: 'hierarchy.dismiss', payload: { staffId } }, { actor }).ok) continue;
    if (rh.fullPower) rh.fullPower.done.dismissed += 1;
    note(
      ctx,
      rh,
      `${m.name} als Leutnant abgesetzt: ${disloyal ? 'auf den ist kein Verlass mehr' : 'zwei Tage Verlust'}.`,
    );
    return;
  }
}

/** Preise an Spots ohne Leutnant (die setzen ihre selbst): um den Richtpreis, je nach Lage. */
function setPrices(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  const state = ctx.state;
  const reputation = getReputation(state);
  let changed = 0;
  for (const spot of citySpots(state)) {
    if (lieutenantOfSpot(state, spot.id)) continue;
    const priceWar = getCompetitionFactor(state, spot.veedelId) < 0.97;
    const factor = priceWar ? FP_PRICE_PRICE_WAR : reputation >= 70 ? FP_PRICE_GOOD_REPUTATION : FP_PRICE_DEFAULT;
    let spotChanged = false;
    for (const { productId } of stockSummary(state)) {
      if (factor === FP_PRICE_DEFAULT) {
        if (!hasOwnPrice(state, spot.id, productId)) continue;
        const reset = { type: 'market.setPrice' as const, payload: { spotId: spot.id, productId, price: null } };
        if (ctx.dispatch(reset, { actor }).ok) spotChanged = true;
        continue;
      }
      if (Math.abs(priceRatio(state, spot.id, productId) - factor) <= PRICE_TOLERANCE) continue;
      const price = roundPrice(spotReferencePrice(state, spot.id, productId) * factor);
      if (price === getSpotPrice(state, spot.id, productId)) continue;
      if (ctx.dispatch({ type: 'market.setPrice', payload: { spotId: spot.id, productId, price } }, { actor }).ok) {
        spotChanged = true;
      }
    }
    if (spotChanged) changed++;
  }
  if (changed === 0) return;
  if (rh.fullPower) rh.fullPower.done.repriced += changed;
  note(ctx, rh, `Preise an ${changed === 1 ? 'einem Spot' : `${changed} Spots`} angepasst.`);
}

/**
 * Personal führen: Drücken die Löhne, fliegt einer pro Stunde: wer untreu ist oder seit Tagen ohne Einsatz herumsteht
 * (Fahrer und Spezialisten nicht, die haben nur ab und zu zu tun). Wer ohne Einsatz ist, merkt sie sich.
 */
function manageStaff(ctx: Ctx, rh: RightHandPost, member: StaffMember, actor: Actor): void {
  const state = ctx.state;
  const fp = rh.fullPower;
  if (!fp) return;
  fp.idleSince ??= {};
  const idle = fp.idleSince;
  const present = new Set<string>();
  for (const m of getStaff(state, { status: 'active', cityId: activeCity(state) })) {
    if (m.id === member.id || isSpecialist(m.role) || m.role === 'driver') continue;
    present.add(m.id);
    if (m.assignment) delete idle[m.id];
    else idle[m.id] ??= ctx.now;
  }
  for (const id of Object.keys(idle)) if (!present.has(id)) delete idle[id];
  if (!wageRunway(state).warn) return;
  const victim = getStaff(state, { status: 'active' })
    .filter((m) => present.has(m.id) && !isLieutenant(state, m.id) && !isRightHand(state, m.id))
    .find(
      (m) =>
        m.stats.loyalty < FP_FIRE_LOYALTY ||
        (idle[m.id] !== undefined && ctx.now - idle[m.id] >= FP_FIRE_IDLE_DAYS * DAY),
    );
  if (!victim) return;
  if (!ctx.dispatch({ type: 'staff.fire', payload: { staffId: victim.id } }, { actor }).ok) return;
  delete idle[victim.id];
  fp.done.fired += 1;
  note(ctx, rh, `${victim.name} entlassen, die Löhne drücken.`);
}

/** Ausbau: einmal am Tag einen Spot freischalten oder ein Lager kaufen, wenn Budget und Kasse es hergeben. */
function expand(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  const state = ctx.state;
  const fp = rh.fullPower;
  if (!fp) return;
  const day = clock.day(ctx.now);
  if (fp.spentDay !== day) {
    fp.spentDay = day;
    fp.spent = 0;
  }
  const due = payrollDue(state);
  if (due > 0 && state.wallet.dirty / due < FP_EXPANSION_RUNWAY_DAYS) return;
  const budget = rh.settings.expansionBudgetPerDay - fp.spent;
  const city = activeCity(state);
  const spot = lockedSpots(state)
    .filter((s) => spotCity(s) === city)
    .filter((s) => (s.unlockCost ?? 0) <= budget && (s.unlockCost ?? 0) <= state.wallet.dirty - due * 2)
    .sort((a, b) => (a.unlockCost ?? 0) - (b.unlockCost ?? 0) || b.demand - a.demand || a.id.localeCompare(b.id))[0];
  if (spot && ctx.dispatch({ type: 'spots.unlock', payload: { spotId: spot.id } }, { actor }).ok) {
    fp.spent += spot.unlockCost ?? 0;
    fp.done.expanded += 1;
    note(ctx, rh, `${spot.name} freigeschaltet (${formatEuro(spot.unlockCost ?? 0)}).`);
    return;
  }
  // Ein zweites Lager, wenn es nur eins gibt und sauberes Geld da ist.
  if (getWarehouses(state, city).length >= 2) return;
  const site = warehouseSites(city)
    .filter((w) => !isWarehouseOwned(state, w.id) && w.cost <= state.wallet.clean)
    .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0];
  if (site && ctx.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }, { actor }).ok) {
    fp.done.expanded += 1;
    note(ctx, rh, `${site.name} als Lager gekauft (${formatEuro(site.cost)} sauber).`);
  }
}

/**
 * Gangs und Chefsache: offene Forderungen der Gangs (Schutzgeld, Tribut, Waffenstillstand) und ihre Angebote. Bis zu
 * ihrem Betrag zahlt sie (Tribut vor Waffenstillstand), sonst lehnt sie ab; Deals nimmt sie bis zu ihrem Betrag an.
 * Bündnisse bleiben Chefsache.
 */
function diplomacy(ctx: Ctx, rh: RightHandPost, actor: Actor): void {
  const state = ctx.state;
  const open = state.messages.list.filter(
    (m) => m.contactId.startsWith('gang:') && !m.routine && messages.canAnswer(state, m),
  );
  for (const message of open) {
    const gangId = message.contactId.slice('gang:'.length);
    const options = message.options ?? [];
    const has = (id: string) => options.find((o) => o.id === id);
    let choice: string | null = null;
    const tribute = has('tribute');
    const ceasefire = has('ceasefire');
    const accept = has('accept');
    // Sie zahlt nur, was die Löhne heute Nacht nicht gefährdet (sonst laufen ihr die Leute weg).
    const spare = Math.max(0, state.wallet.dirty - payrollDue(state));
    const tributeCost = tributeAmount(state, gangId);
    const ceasefireCost = getGangStatus(state, gangId)?.quote?.ceasefire ?? Infinity;
    const dealCost = getGangStatus(state, gangId)?.offer?.price ?? Infinity;
    if (tribute && tributeCost <= rh.settings.protectionMax && tributeCost <= spare) choice = 'tribute';
    else if (ceasefire && ceasefireCost <= rh.settings.protectionMax && ceasefireCost <= spare) choice = 'ceasefire';
    else if (has('refuse')) choice = 'refuse';
    else if (accept && dealCost <= rh.settings.dealMax && dealCost <= spare) choice = 'accept';
    else if (accept && has('decline')) choice = 'decline';
    if (!choice) continue;
    const option = options.find((o) => o.id === choice);
    if (!option) continue;
    if (option.command && !ctx.dispatch(option.command, { actor }).ok) continue;
    messages.answerAs(ctx, { messageId: message.id, optionId: option.id, via: VIA });
    if (rh.fullPower) rh.fullPower.done.answered += 1;
    note(ctx, rh, `Mit ${messages.contact(state, message.contactId)?.name ?? 'einer Gang'} geregelt: ${option.label}.`);
  }
}

/** Ist die Rechte Hand gerade mit Vollmacht im Dienst (aktiv)? */
export function fullPowerActive(state: GameState, cityId?: string): boolean {
  return !!activeRightHand(state, cityId)?.fullPower;
}
