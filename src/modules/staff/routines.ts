// Abläufe des Personals: Läufer bedienen Kunden, Haft und Verletzung laufen ab, Löhne, Loyalität,
// Werte zeigen sich mit der Zeit, seltener Verrat und die Warnung des Polizei-Kontakts.

import { type Ctx, formatEuro, journal, messages, wallet } from '../../core';
import { canServe, waitingAt } from '../customers';
import { DEFAULT_PRODUCT, getStock, take } from '../goods';
import { addHeat, getHeat } from '../police';
import { veedelName } from '../veedel';
import {
  BETRAYAL_COOLDOWN,
  BETRAYAL_MAX_CHANCE,
  BETRAYAL_THRESHOLD,
  BETRAYAL_WEIGHTS,
  DANGER_HEAT,
  FIRED_TALK_CHANCE,
  FIRED_TALK_LOYALTY,
  LOYALTY,
  RAID_WARNING_COOLDOWN,
  RAID_WARNING_HEAT,
  REVEAL_CHANCE,
  TALK_HEAT,
  THEFT_GOODS_MAX,
  THEFT_GOODS_SHARE,
  THEFT_MONEY_MAX,
  THEFT_MONEY_SHARE,
  XP_PER_DUTY_HOUR,
  XP_PER_SPECIALIST_DAY,
} from './config';
import {
  addCareer,
  addLoyalty,
  addXp,
  bonus,
  bonusProvider,
  expectedWage,
  isSpecialist,
  meetsPriceFloor,
  removeMember,
  revealStat,
  serveTime,
  setStatus,
  staffContact,
  staffVeedel,
} from './members';
import type { BetrayalKind, StaffMember } from './types';

/** Jede Spielminute: Haft und Verletzung ablaufen lassen, Läufer bedienen Kunden. */
export function tick(ctx: Ctx): void {
  releaseDue(ctx);
  serveCustomers(ctx);
}

function releaseDue(ctx: Ctx): void {
  for (const m of [...ctx.state.modules.staff.members]) {
    if (m.statusUntil === null || m.statusUntil > ctx.now) continue;
    if (m.status !== 'jailed' && m.status !== 'injured') continue;
    const wasJailed = m.status === 'jailed';
    setStatus(ctx, m.id, 'active');
    addCareer(ctx, m.id, wasJailed ? 'Aus der Haft entlassen.' : 'Wieder gesund.');
    journal.add(ctx, `${m.name} ist ${wasJailed ? 'wieder draußen' : 'wieder fit'}.`, 'info', { staffId: m.id });
  }
}

/** Läufer bedienen die Kunden an ihrem Spot, solange Ware da ist. Sie nutzen denselben Befehl wie der Spieler. */
function serveCustomers(ctx: Ctx): void {
  for (const member of [...ctx.state.modules.staff.members]) {
    if (member.role !== 'runner' || member.status !== 'active' || member.assignment?.kind !== 'spot') continue;
    if (member.busyUntil > ctx.now) continue;
    const customer = waitingAt(ctx.state, member.assignment.targetId).find(
      (c) => canServe(ctx.state, c.id) && meetsPriceFloor(ctx.state, c, member.orders.priceFloor),
    );
    if (!customer) continue;
    const result = ctx.dispatch(
      { type: 'customers.serve', payload: { customerId: customer.id, sellerId: member.id } },
      { actor: `staff:${member.id}` },
    );
    if (result.ok) member.busyUntil = ctx.now + serveTime(member);
  }
}

/** Zur vollen Stunde: Sicherheit im Einsatz sammelt Erfahrung, der Polizei-Kontakt warnt. */
export function hourly(ctx: Ctx): void {
  for (const m of ctx.state.modules.staff.members) {
    if (m.role === 'security' && m.status === 'active' && m.assignment) addXp(ctx, m.id, XP_PER_DUTY_HOUR);
  }
  warnOfRaids(ctx);
}

/**
 * Übergangslösung für "Warnung vor Razzien": Der Polizei-Kontakt meldet sich, wenn es in einem Veedel,
 * in dem deine Leute arbeiten, heiß wird. Die echte Warnung vor einer geplanten Razzia gehört in die
 * Polizei (Auftrag 10), die dafür bonus(state, 'raidWarning') abfragt.
 */
function warnOfRaids(ctx: Ctx): void {
  const contact = bonusProvider(ctx.state, 'raidWarning');
  if (!contact) return;
  const chance = bonus(ctx.state, 'raidWarning');
  const s = ctx.state.modules.staff;
  const veedelIds = new Set<string>();
  for (const m of s.members) {
    const v = staffVeedel(ctx.state, m);
    if (v) veedelIds.add(v);
  }
  for (const veedelId of [...veedelIds].sort()) {
    const heat = getHeat(ctx.state, veedelId);
    if (heat < RAID_WARNING_HEAT) continue;
    if (ctx.now - (s.warnings[veedelId] ?? -Infinity) < RAID_WARNING_COOLDOWN) continue;
    s.warnings[veedelId] = ctx.now;
    if (!ctx.chance(chance)) continue;
    messages.send(ctx, {
      contact: staffContact(contact),
      text: `In ${veedelName(veedelId)} ist es heiß. Die Kollegen planen da was. Zieh deine Leute ab, wenn du schlau bist.`,
    });
    ctx.emit('staff.raidWarning', { veedelId, staffId: contact.id, heat });
  }
}

/** Um Mitternacht: Löhne, Loyalität, neue Erkenntnisse, Erfahrung der Spezialisten, Verrat. */
export function daily(ctx: Ctx): void {
  payWages(ctx);
  for (const m of [...ctx.state.modules.staff.members]) {
    dailyLoyalty(ctx, m);
    if (ctx.chance(REVEAL_CHANCE)) revealStat(ctx, m.id);
    if (isSpecialist(m.role) && m.status === 'active') addXp(ctx, m.id, XP_PER_SPECIALIST_DAY);
  }
  for (const m of [...ctx.state.modules.staff.members]) maybeBetray(ctx, m);
}

/** Löhne pro Person. Wer nicht bezahlt werden kann, kündigt (wie im Prototyp). */
function payWages(ctx: Ctx): void {
  const members = [...ctx.state.modules.staff.members];
  if (members.length === 0) return;
  let paid = 0;
  let total = 0;
  const quitting: StaffMember[] = [];
  for (const m of members) {
    if (m.wage <= 0 || wallet.pay(ctx, m.wage, 'dirty', `Lohn ${m.name}`)) {
      paid++;
      total += m.wage;
    } else {
      quitting.push(m);
    }
  }
  if (paid > 0 && total > 0) {
    journal.add(ctx, `Löhne gezahlt: ${formatEuro(total)} für ${paid} ${paid === 1 ? 'Person' : 'Leute'}.`);
  }
  if (quitting.length > 0) {
    for (const m of quitting) removeMember(ctx, m.id, 'quit');
    const n = quitting.length;
    journal.add(
      ctx,
      `Kein Geld für Löhne: ${n} ${n === 1 ? 'Mitarbeiter hat' : 'Mitarbeiter haben'} gekündigt.`,
      'bad',
    );
  }
}

function dailyLoyalty(ctx: Ctx, m: StaffMember): void {
  const expected = expectedWage(ctx.state, m.id);
  const ratio = expected > 0 ? m.wage / expected : 1;
  let delta = 0;
  if (ratio >= 1.2) delta += LOYALTY.wageGenerous;
  else if (ratio >= 1) delta += LOYALTY.wageFair;
  else if (ratio < 0.6) delta += LOYALTY.wageBad;
  else if (ratio < 0.85) delta += LOYALTY.wageLow;
  if (m.status === 'jailed') delta += LOYALTY.jailDay;
  const veedelId = staffVeedel(ctx.state, m);
  if (veedelId && getHeat(ctx.state, veedelId) >= DANGER_HEAT) delta += LOYALTY.heatDay;
  if (delta !== 0) addLoyalty(ctx, m.id, delta);
}

/** Wahrscheinlichkeit für Verrat an einem Tag (0 bei ausreichender Loyalität). */
export function betrayalChance(m: StaffMember): number {
  if (m.stats.loyalty >= BETRAYAL_THRESHOLD) return 0;
  return BETRAYAL_MAX_CHANCE * ((BETRAYAL_THRESHOLD - m.stats.loyalty) / BETRAYAL_THRESHOLD);
}

/** Selten und mild: Wer kaum noch loyal ist, klaut etwas, kündigt oder redet. */
function maybeBetray(ctx: Ctx, m: StaffMember): void {
  if (m.status === 'jailed') return;
  if (m.lastIncidentAt !== null && ctx.now - m.lastIncidentAt < BETRAYAL_COOLDOWN) return;
  if (!ctx.chance(betrayalChance(m))) return;
  betray(ctx, m, pickBetrayal(ctx));
}

function pickBetrayal(ctx: Ctx): BetrayalKind {
  const entries = Object.entries(BETRAYAL_WEIGHTS) as [BetrayalKind, number][];
  let roll = ctx.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [kind, weight] of entries) {
    roll -= weight;
    if (roll < 0) return kind;
  }
  return entries[entries.length - 1][0];
}

/** Verrat ausführen. Gibt die Menge zurück (Einheiten Ware, Euro oder Heat). */
export function betray(ctx: Ctx, m: StaffMember, kind: BetrayalKind): number {
  m.lastIncidentAt = ctx.now;
  let amount = 0;
  if (kind === 'goods') {
    const want = Math.min(
      THEFT_GOODS_MAX,
      Math.ceil(getStock(ctx.state, { productId: DEFAULT_PRODUCT }) * THEFT_GOODS_SHARE),
    );
    amount = want > 0 ? take(ctx, { productId: DEFAULT_PRODUCT, amount: want, partial: true }).taken : 0;
    if (amount === 0) return betray(ctx, m, 'money');
    journal.add(ctx, `Im Lager fehlen ${amount} g. Verdacht: ${m.name}.`, 'bad', { staffId: m.id });
    addCareer(ctx, m.id, `Hat ${amount} g Ware mitgehen lassen.`);
  } else if (kind === 'money') {
    const want = Math.min(THEFT_MONEY_MAX, Math.round(ctx.state.wallet.dirty * THEFT_MONEY_SHARE));
    amount = wallet.lose(ctx, want, 'dirty', `Diebstahl ${m.name}`);
    if (amount === 0) return betray(ctx, m, 'quit');
    journal.add(ctx, `In der Kasse fehlen ${formatEuro(amount)}. Verdacht: ${m.name}.`, 'bad', { staffId: m.id });
    addCareer(ctx, m.id, `Hat ${formatEuro(amount)} aus der Kasse genommen.`);
  } else if (kind === 'quit') {
    messages.send(ctx, { contact: staffContact(m), text: 'Ich bin raus. Such dir wen anders.' });
    removeMember(ctx, m.id, 'quit');
    journal.add(ctx, `${m.name} hat hingeschmissen.`, 'bad', { staffId: m.id });
  } else {
    const veedelId = staffVeedel(ctx.state, m) ?? m.returnTo?.targetId ?? null;
    amount = TALK_HEAT;
    if (veedelId) addHeat(ctx, veedelId, amount);
    journal.add(ctx, `${m.name} hat geredet. Die Bullen wissen jetzt mehr.`, 'bad', { staffId: m.id });
    addCareer(ctx, m.id, 'Hat bei den Bullen geredet.');
  }
  ctx.emit('staff.betrayed', { staffId: m.id, kind, amount });
  return amount;
}

/** Wer mit Groll entlassen wird, redet manchmal. */
export function afterFired(ctx: Ctx, m: StaffMember, veedelId: string | null): void {
  if (m.stats.loyalty >= FIRED_TALK_LOYALTY || !veedelId || !ctx.chance(FIRED_TALK_CHANCE)) return;
  addHeat(ctx, veedelId, TALK_HEAT);
  journal.add(ctx, `${m.name} ist sauer über die Entlassung und hat geredet.`, 'bad', { staffId: m.id });
  ctx.emit('staff.betrayed', { staffId: m.id, kind: 'talk', amount: TALK_HEAT });
}
