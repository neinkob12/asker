// Abläufe des Personals: Läufer bedienen Kunden, Haft und Verletzung laufen ab, Löhne, Loyalität,
// Werte zeigen sich mit der Zeit, seltener Verrat und die Warnung des Polizei-Kontakts.

import { type Ctx, clock, formatEuro, type GameState, journal, messages, wallet } from '../../core';
import { canServe, waitingAt } from '../customers';
import { formatProductAmount, stockSummary, take } from '../goods';
import { addHeat, getHeat } from '../police';
import { getSpot } from '../spots';
import { veedelName } from '../veedel';
import {
  BETRAYAL_COOLDOWN,
  BETRAYAL_MAX_CHANCE,
  BETRAYAL_THRESHOLD,
  BETRAYAL_WEIGHTS,
  DANGER_HEAT,
  HIDE_AFTER_RAID,
  LOYALTY,
  REVEAL_CHANCE,
  TALK_HEAT,
  THEFT_GOODS_MAX,
  THEFT_GOODS_SHARE,
  THEFT_MONEY_MAX,
  THEFT_MONEY_SHARE,
  UNPAID_DAYS_TO_QUIT,
  UNPAID_QUIT_LOYALTY,
  XP_PER_DUTY_HOUR,
  XP_PER_SPECIALIST_DAY,
  XP_PER_WARNING,
} from './config';
import {
  activeRunnerAt,
  addCareer,
  addLoyalty,
  addXp,
  assign,
  bonus,
  bonusProvider,
  effectiveWage,
  expectedWage,
  hidingReturn,
  isMemberLive,
  isSpecialist,
  removeMember,
  revealStat,
  serveTime,
  setStatus,
  staffContact,
  staffVeedel,
  talkChance,
  wageCategory,
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
    // Schlafende Stadt: keine Haft-Ereignisse, entlassen wird beim Aufwachen.
    if (!isMemberLive(ctx.state, m)) continue;
    if (m.status !== 'jailed' && m.status !== 'injured') continue;
    const wasJailed = m.status === 'jailed';
    // Ohne Stillhaltegeld hat die Person in der Haft eher geredet.
    if (wasJailed && !m.jailSupport) {
      const place = m.returnTo;
      const veedelId = place?.kind === 'spot' ? (getSpot(ctx.state, place.targetId)?.veedelId ?? null) : null;
      maybeTalk(ctx, m, veedelId, talkChance(m), `${m.name} hat in der Haft kein Geld von dir gesehen und geredet.`);
    }
    setStatus(ctx, m.id, 'active');
    addCareer(ctx, m.id, wasJailed ? 'Aus der Haft entlassen.' : 'Wieder gesund.');
    journal.add(ctx, `${m.name} ist ${wasJailed ? 'wieder draußen' : 'wieder fit'}.`, 'info', { staffId: m.id });
  }
}

/** Läufer bedienen die Kunden an ihrem Spot, solange Ware da ist. Sie nutzen denselben Befehl wie der Spieler. */
function serveCustomers(ctx: Ctx): void {
  for (const member of [...ctx.state.modules.staff.members]) {
    if (member.role !== 'runner' || member.status !== 'active' || member.assignment?.kind !== 'spot') continue;
    if (!isMemberLive(ctx.state, member)) continue;
    if (member.busyUntil > ctx.now) continue;
    const customer = waitingAt(ctx.state, member.assignment.targetId).find((c) => canServe(ctx.state, c.id));
    if (!customer) continue;
    const result = ctx.dispatch(
      { type: 'customers.serve', payload: { customerId: customer.id, sellerId: member.id } },
      { actor: `staff:${member.id}` },
    );
    if (result.ok) member.busyUntil = ctx.now + serveTime(member);
  }
}

/** Zur vollen Stunde: Sicherheit im Einsatz sammelt Erfahrung, Abgetauchte kehren zurück. */
export function hourly(ctx: Ctx): void {
  for (const m of ctx.state.modules.staff.members) {
    if (m.role === 'security' && m.status === 'active' && m.assignment) addXp(ctx, m.id, XP_PER_DUTY_HOUR);
  }
  returnFromHiding(ctx);
}

/** Ist das Veedel gerade abgetaucht (nach einer Warnung vor einer Razzia)? */
export function isLyingLow(state: GameState, veedelId: string): boolean {
  const hiding = state.modules.staff.hiding[veedelId];
  return !!hiding && hiding.until > state.time;
}

/**
 * Alle Leute an den Spots eines Veedels von der Straße holen, bis until. Danach gehen sie an ihren Platz zurück
 * (wenn er noch frei ist). Gibt die Zahl der Abgezogenen zurück.
 */
export function lieLow(ctx: Ctx, veedelId: string, until: number): number {
  const s = ctx.state.modules.staff;
  const hiding = s.hiding[veedelId] ?? { until, returns: [] };
  hiding.until = Math.max(hiding.until, until);
  let pulled = 0;
  for (const m of [...s.members]) {
    if (m.status !== 'active' || m.assignment?.kind !== 'spot') continue;
    if (staffVeedel(ctx.state, m) !== veedelId) continue;
    hiding.returns.push({ staffId: m.id, assignment: { ...m.assignment } });
    assign(ctx, m.id, null);
    pulled++;
  }
  s.hiding[veedelId] = hiding;
  return pulled;
}

/**
 * Warnung des Polizei-Kontakts: Wenn eine Razzia geplant ist und der Kontakt davon erfährt (bonus 'raidWarning'),
 * schreibt er dem Spieler. Die Antwort "Leute abziehen" lässt das Veedel abtauchen.
 */
export function warnOfRaid(ctx: Ctx, veedelId: string, at: number, major = false): void {
  const contact = bonusProvider(ctx.state, 'raidWarning');
  // Eine Großrazzia bekommt der Kontakt immer mit (einen Tag Vorlauf), normale Razzien nur mit seinem Bonus.
  if (!contact || (!major && !ctx.chance(bonus(ctx.state, 'raidWarning')))) return;
  const time = major ? `${clock.weekdayName(at)}, ${clock.formatTime(at)}` : clock.formatTime(at);
  messages.send(ctx, {
    contact: staffContact(contact),
    text: major
      ? `Großes Ding: Die Kripo plant für ${time} eine Großrazzia, auch in ${veedelName(veedelId)}. Zieh die Leute dort vorher ab.`
      : `Pass auf: Die Kollegen planen für ${time} eine Razzia in ${veedelName(veedelId)}. Zieh deine Leute ab, wenn du schlau bist.`,
    options: [
      {
        id: 'lieLow',
        label: 'Leute abziehen',
        command: { type: 'staff.lieLow', payload: { veedelId, until: at + HIDE_AFTER_RAID } },
        reply: 'Danke. Alle runter von der Straße.',
      },
      { id: 'ignore', label: 'Ignorieren', reply: 'Die sollen ruhig kommen.' },
    ],
    expiresIn: Math.max(1, at - ctx.now),
  });
  addXp(ctx, contact.id, XP_PER_WARNING);
  ctx.emit('staff.raidWarning', { veedelId, staffId: contact.id, heat: getHeat(ctx.state, veedelId), at });
}

/** Wer abgetaucht war, geht zurück an seinen Platz, wenn der noch frei ist und er einsatzbereit ist. */
function returnFromHiding(ctx: Ctx): void {
  const s = ctx.state.modules.staff;
  for (const veedelId of Object.keys(s.hiding).sort()) {
    const hiding = s.hiding[veedelId];
    if (hiding.until > ctx.now) continue;
    delete s.hiding[veedelId];
    let back = 0;
    for (const { staffId, assignment } of hiding.returns) {
      const m = s.members.find((x) => x.id === staffId);
      if (m?.status !== 'active' || m.assignment) continue;
      if (m.role === 'runner' && assignment.kind === 'spot' && activeRunnerAt(ctx.state, assignment.targetId)) continue;
      assign(ctx, m.id, assignment);
      back++;
    }
    if (back > 0) {
      journal.add(
        ctx,
        `Die Luft ist rein: ${back} von deinen Leuten in ${veedelName(veedelId)} wieder auf der Straße.`,
        'info',
        {
          veedelId,
        },
      );
    }
  }
}

/** Um Mitternacht: Löhne, Loyalität, neue Erkenntnisse, Erfahrung der Spezialisten, Verrat. */
export function daily(ctx: Ctx): void {
  payWages(ctx);
  for (const m of [...ctx.state.modules.staff.members]) {
    // Schlafende Stadt: keine Loyalitätsverluste, kein Verrat (die Löhne stecken im Tagesergebnis).
    if (!isMemberLive(ctx.state, m)) continue;
    dailyLoyalty(ctx, m);
    if (ctx.chance(REVEAL_CHANCE)) revealStat(ctx, m.id);
    if (isSpecialist(m.role) && m.status === 'active') addXp(ctx, m.id, XP_PER_SPECIALIST_DAY);
  }
  for (const m of [...ctx.state.modules.staff.members]) if (isMemberLive(ctx.state, m)) maybeBetray(ctx, m);
}

/**
 * Spot, zu dem die Person gehört, für die Kasse: auch wer abgetaucht, in Haft oder verletzt ist, kostet dort weiter. Der
 * Lohn wird um Mitternacht gebucht, die Kasse liest ihn erst später im Schritt (dann kann die Person schon weg sein).
 */
function wageSpot(state: GameState, m: StaffMember): string | null {
  const place = m.assignment ?? m.returnTo ?? hidingReturn(state, m.id);
  return place?.kind === 'spot' ? place.targetId : null;
}

/**
 * Löhne pro Person, die Loyalsten zuerst. Wer nicht bezahlt werden kann, ist sauer (Loyalität sinkt) und
 * schreibt dir. Wer dann kaum noch loyal ist oder schon gestern leer ausging, kündigt.
 */
function payWages(ctx: Ctx): void {
  // Nur die Leute in der Stadt, die live ist: In einer schlafenden Stadt stecken die Löhne im Tagesergebnis (city).
  const members = ctx.state.modules.staff.members
    .filter((m) => isMemberLive(ctx.state, m))
    .sort((a, b) => b.stats.loyalty - a.stats.loyalty || a.id.localeCompare(b.id));
  if (members.length === 0) return;
  let paid = 0;
  let total = 0;
  const quitting: StaffMember[] = [];
  let complained = 0;
  for (const m of members) {
    // In Haft nur Stillhaltegeld, verletzt der halbe Lohn (effectiveWage).
    const amount = effectiveWage(m);
    const category = m.status === 'jailed' ? 'wages.jail' : m.status === 'injured' ? 'wages.injured' : wageCategory(m);
    const reason =
      m.status === 'jailed'
        ? `Stillhaltegeld ${m.name}`
        : m.status === 'injured'
          ? `Lohn ${m.name} (verletzt)`
          : `Lohn ${m.name}`;
    const spotId = wageSpot(ctx.state, m);
    const tag = { category, staffId: m.id, ...(spotId ? { spotId } : {}) };
    if (amount <= 0 || wallet.pay(ctx, amount, 'dirty', reason, tag)) {
      paid++;
      total += amount;
      m.unpaidDays = 0;
      continue;
    }
    m.unpaidDays = (m.unpaidDays ?? 0) + 1;
    const loyalty = addLoyalty(ctx, m.id, LOYALTY.unpaid);
    if (m.unpaidDays >= UNPAID_DAYS_TO_QUIT || loyalty < UNPAID_QUIT_LOYALTY) {
      quitting.push(m);
    } else if (complained++ === 0) {
      messages.send(ctx, {
        contact: staffContact(m),
        text: `Chef, wo bleibt mein Geld? ${formatEuro(amount)} für gestern. Noch einen Tag mach ich das nicht mit.`,
      });
    }
  }
  if (paid > 0 && total > 0) {
    journal.add(ctx, `Löhne gezahlt: ${formatEuro(total)} für ${paid} ${paid === 1 ? 'Person' : 'Leute'}.`);
  }
  const unpaid = members.length - paid - quitting.length;
  if (unpaid > 0) {
    journal.add(
      ctx,
      `Kein Geld für Löhne: ${unpaid === 1 ? 'Eine Person wartet' : `${unpaid} Leute warten`} auf ihr Geld. Morgen gehen sie.`,
      'bad',
    );
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
  if (m.status === 'jailed') delta += m.jailSupport ? LOYALTY.jailDay : LOYALTY.jailDayUnsupported;
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
    // Vom Produkt, von dem am meisten da ist, fällt es am wenigsten auf.
    const row = [...stockSummary(ctx.state)].sort((a, b) => b.amount - a.amount)[0];
    const want = row ? Math.min(THEFT_GOODS_MAX, Math.ceil(row.amount * THEFT_GOODS_SHARE)) : 0;
    amount = row && want > 0 ? take(ctx, { productId: row.productId, amount: want, partial: true }).taken : 0;
    if (!row || amount === 0) return betray(ctx, m, 'money');
    const what = formatProductAmount(row.productId, amount);
    journal.add(ctx, `Im Lager fehlen ${what}. Verdacht: ${m.name}.`, 'bad', { staffId: m.id });
    addCareer(ctx, m.id, `Hat ${what} Ware mitgehen lassen.`);
  } else if (kind === 'money') {
    const want = Math.min(THEFT_MONEY_MAX, Math.round(ctx.state.wallet.dirty * THEFT_MONEY_SHARE));
    amount = wallet.lose(ctx, want, 'dirty', `Diebstahl ${m.name}`, { category: 'loss.betrayal', staffId: m.id });
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

/**
 * Wer mit Groll entlassen wird, redet manchmal (chance aus talkChance, vor dem Entlassen bestimmt: Wer in Haft kein
 * Stillhaltegeld bekam, redet eher).
 */
export function afterFired(ctx: Ctx, m: StaffMember, veedelId: string | null, chance: number): void {
  maybeTalk(ctx, m, veedelId, chance, `${m.name} ist sauer über die Entlassung und hat geredet.`);
}

/** Mit Wahrscheinlichkeit chance redet die Person: Heat im Veedel, Journal, Ereignis 'staff.betrayed'. */
function maybeTalk(ctx: Ctx, m: StaffMember, veedelId: string | null, chance: number, text: string): boolean {
  if (chance <= 0 || !veedelId || !ctx.chance(chance)) return false;
  addHeat(ctx, veedelId, TALK_HEAT);
  journal.add(ctx, text, 'bad', { staffId: m.id, veedelId });
  ctx.emit('staff.betrayed', { staffId: m.id, kind: 'talk', amount: TALK_HEAT });
  return true;
}
