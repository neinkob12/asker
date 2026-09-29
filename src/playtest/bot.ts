// Einfache Bot-Strategie für die Balancing-Simulation (balance.test.ts, `npm run balance`).
// Der Bot spielt wie ein vernünftiger, aber nicht perfekter Spieler: Er verkauft anfangs selbst an wenigen Spots,
// bestellt Ware nach, heuert Läufer an, schaltet Spots frei, befördert Leutnants, stellt Sicherheit ein, wenn die
// Gangs ungemütlich werden, antwortet auf Handy-Nachrichten und lässt Konfrontationen von seinen Leuten auswürfeln.
// Er schickt nur Befehle, genau wie die Oberfläche.
//
// Liegt außerhalb von src/modules, weil er alle Module zusammen benutzt (wie ein Spieler).

import { type Command, type GameState, messages, type Simulation } from '../core';
import { allWaiting, canServe } from '../modules/customers';
import { activeEncounters } from '../modules/encounters';
import { ceasefireCost, getGangs, tributeAmount } from '../modules/gangs';
import { DEFAULT_WAREHOUSE, getStock } from '../modules/goods';
import { getLieutenant } from '../modules/hierarchy';
import { getCandidates } from '../modules/recruiting';
import { canFoundSpotAt, getSpots, lockedSpots } from '../modules/spots';
import { dailyWages, getStaff, runnerHireCost, securityAt } from '../modules/staff';
import {
  availableCredit,
  availablePackages,
  getRelation,
  getSuppliers,
  packagePrice,
  shipmentsInTransit,
} from '../modules/suppliers';
import { controlledBy, PLAYER_FACTION } from '../modules/territory';
import { allVeedel, neighborsOf } from '../modules/veedel';

export interface BotOptions {
  /** An so vielen Spots ohne Läufer verkauft der Bot selbst (ein Mensch schafft nicht alle gleichzeitig). */
  personalSpots: number;
  /** Alle so viele Spielminuten schaut der Bot aufs Spiel. */
  attentionEvery: number;
  /** Schläft der Bot nachts (keine eigenen Verkäufe von 3 bis 9 Uhr)? */
  sleeps: boolean;
}

export const DEFAULT_BOT: BotOptions = { personalSpots: 2, attentionEvery: 10, sleeps: true };

export interface BotStats {
  commands: number;
  failed: number;
  byType: Record<string, number>;
}

function money(state: GameState): number {
  return state.wallet.dirty;
}

function run(sim: Simulation, stats: BotStats, command: Command): boolean {
  const result = sim.dispatch(command);
  stats.commands++;
  stats.byType[command.type] = (stats.byType[command.type] ?? 0) + 1;
  if (!result.ok) stats.failed++;
  return result.ok;
}

/** Laufende Kosten für einen Tag: Löhne plus Puffer. */
function reserve(state: GameState): number {
  return Math.round(dailyWages(state) * 1.5) + 500;
}

/** Selbst verkaufen: an den Spots ohne Läufer mit den meisten Wartenden. */
function sellPersonally(sim: Simulation, stats: BotStats, options: BotOptions): void {
  const state = sim.state;
  const hour = Math.floor((state.time % 1440) / 60);
  if (options.sleeps && hour >= 3 && hour < 9) return;
  const staffed = new Set(
    getStaff(state, { role: 'runner', status: 'active' })
      .filter((m) => m.assignment?.kind === 'spot')
      .map((m) => m.assignment?.targetId),
  );
  const bySpot = new Map<string, number[]>();
  for (const c of allWaiting(state)) {
    if (staffed.has(c.spotId) || !canServe(state, c.id)) continue;
    bySpot.set(c.spotId, [...(bySpot.get(c.spotId) ?? []), c.id]);
  }
  const spots = [...bySpot.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, options.personalSpots);
  for (const [, ids] of spots) {
    for (const id of ids) run(sim, stats, { type: 'customers.serve', payload: { customerId: id } });
  }
}

/** Teurere Läufer stellt der Bot nicht ein. */
const MAX_RUNNER_WAGE = 120;

/** Gewünschter Produktmix (grob nach Kundschaft). */
const PRODUCT_MIX: Record<string, number> = { weed: 0.35, hash: 0.2, haze: 0.15, edibles: 0.12, vape: 0.1, kush: 0.08 };

/**
 * Nachbestellen, wenn Vorrat plus Lieferungen unter dem Ziel liegen. Bestellt das Produkt, das im Verhältnis zum
 * Mix am knappsten ist, beim günstigsten Paket pro Einheit, das ins Budget passt.
 */
function restock(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const stock = getStock(state);
  const incoming = shipmentsInTransit(state).reduce((sum, s) => sum + s.amount, 0);
  const sellers = getStaff(state, { role: 'runner' }).length + 1;
  const want = 80 + sellers * 70;
  if (stock + incoming >= want) return;
  const budget = money(state) - reserve(state);
  const have = (productId: string) =>
    getStock(state, { productId }) +
    shipmentsInTransit(state)
      .filter((s) => s.productId === productId)
      .reduce((sum, s) => sum + s.amount, 0);
  const products = Object.keys(PRODUCT_MIX).sort(
    (a, b) => have(a) / PRODUCT_MIX[a] - have(b) / PRODUCT_MIX[b] || a.localeCompare(b),
  );
  for (const productId of products) {
    let best: { supplierId: string; packageId: string; price: number; perUnit: number } | null = null;
    for (const supplier of getSuppliers(state)) {
      for (const pkg of availablePackages(state, supplier.id)) {
        if (pkg.productId !== productId) continue;
        const price = packagePrice(state, supplier.id, pkg.id);
        if (price > budget) continue;
        // Rotterdam dauert: nur, wenn noch genug im Lager ist, um die Zeit zu überbrücken.
        if (supplier.kind === 'port' && stock < 40) continue;
        const perUnit = price / pkg.amount;
        if (!best || perUnit < best.perUnit) best = { supplierId: supplier.id, packageId: pkg.id, price, perUnit };
      }
    }
    if (best) {
      const payload = { supplierId: best.supplierId, packageId: best.packageId };
      if (run(sim, stats, { type: 'suppliers.order', payload })) return;
    }
  }
  // Kein Geld mehr: auf Kredit, wenn ein Lieferant welchen gibt.
  if (stock + incoming > 0) return;
  for (const supplier of getSuppliers(state)) {
    const pkg = availablePackages(state, supplier.id)
      .filter((p) => packagePrice(state, supplier.id, p.id) <= availableCredit(state, supplier.id))
      .sort((a, b) => packagePrice(state, supplier.id, a.id) - packagePrice(state, supplier.id, b.id))[0];
    if (!pkg) continue;
    const payload = { supplierId: supplier.id, packageId: pkg.id, onCredit: true };
    if (run(sim, stats, { type: 'suppliers.order', payload })) return;
  }
}

/** Läufer anheuern, Spots freischalten, Leutnants befördern, Sicherheit einstellen. */
function grow(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const free = () =>
    getSpots(state).filter(
      (s) => !getStaff(state, { spotId: s.id, status: 'active' }).some((m) => m.role === 'runner'),
    );
  const stock = getStock(state);

  // Bewerber mit Level zuerst, sonst von der Straße.
  const openSpots = free().sort((a, b) => b.demand - a.demand);
  if (
    openSpots.length > 0 &&
    stock > 60 &&
    money(state) > runnerHireCost(state, openSpots[0].id) + reserve(state) + 1000
  ) {
    // Günstige Leute zuerst: Ein Läufer soll mehr einbringen, als er kostet.
    const candidate = getCandidates(state)
      .filter(
        (c) => c.role === 'runner' && c.wage <= MAX_RUNNER_WAGE && c.hireCost <= money(state) - reserve(state) - 400,
      )
      .sort((a, b) => a.wage - b.wage || b.level - a.level)[0];
    if (candidate) {
      run(sim, stats, {
        type: 'recruiting.hire',
        payload: { candidateId: candidate.id, assignment: { kind: 'spot', targetId: openSpots[0].id } },
      });
    } else {
      run(sim, stats, { type: 'staff.hireRunner', payload: { spotId: openSpots[0].id } });
    }
  }

  // Freischalten, wenn alle Spots besetzt sind und Geld übrig ist.
  if (free().length === 0) {
    const next = lockedSpots(state).sort((a, b) => (a.unlockCost ?? 0) - (b.unlockCost ?? 0))[0];
    if (next && money(state) > (next.unlockCost ?? 0) + reserve(state) + runnerHireCost(state, next.id) + 600) {
      run(sim, stats, { type: 'spots.unlock', payload: { spotId: next.id } });
    }
  }

  // Später: eigene Spots in Nachbar-Veedeln gründen, um weiter zu wachsen (Köln übernehmen).
  if (lockedSpots(state).length === 0 && free().length === 0 && money(state) > reserve(state) + 3000) {
    const mine = new Set(controlledBy(state, PLAYER_FACTION));
    const withSpot = new Set(getSpots(state).map((s) => s.veedelId));
    const target = allVeedel()
      .filter((v) => !mine.has(v.id) && !withSpot.has(v.id) && neighborsOf(v.id).some((n) => mine.has(n)))
      .sort((a, b) => b.purchasingPower - a.purchasingPower || a.id.localeCompare(b.id))[0];
    if (target) {
      for (const [dx, dy] of [
        [0, 0],
        [0.003, 0],
        [0, 0.003],
        [-0.003, 0],
        [0, -0.003],
      ]) {
        const lng = target.center.lng + dx;
        const lat = target.center.lat + dy;
        if (!canFoundSpotAt(state, lng, lat).ok) continue;
        run(sim, stats, { type: 'spots.found', payload: { lng, lat } });
        break;
      }
    }
  }

  // Leutnant in Veedeln mit zwei Spots, eigenen Veedeln oder sobald das Team groß genug ist.
  const byVeedel = new Map<string, number>();
  for (const s of getSpots(state)) byVeedel.set(s.veedelId, (byVeedel.get(s.veedelId) ?? 0) + 1);
  for (const [veedelId, count] of byVeedel) {
    const enough = count >= 2 || controlledBy(state, PLAYER_FACTION).includes(veedelId) || getStaff(state).length >= 4;
    if (!enough || getLieutenant(state, veedelId)) continue;
    const best = getStaff(state, { status: 'active', veedelId })
      .filter((m) => m.role === 'runner' && m.level >= 2)
      .sort((a, b) => b.level - a.level)[0];
    if (best && money(state) > reserve(state) + 800) {
      run(sim, stats, { type: 'hierarchy.appoint', payload: { staffId: best.id, veedelId } });
    }
  }

  // Sicherheit: eine pro Veedel mit Leuten, sobald eine Gang droht.
  const threatened = getGangs(state).some((g) => (state.modules.gangs.gangs[g.id]?.hostility ?? 0) >= 40);
  if (threatened) {
    const guards = getStaff(state, { role: 'security' }).length;
    const runners = getStaff(state, { role: 'runner' }).length;
    if (guards < Math.ceil(runners / 3) + 1) {
      const candidate = getCandidates(state)
        .filter(
          (c) =>
            c.role === 'security' &&
            c.wage <= MAX_RUNNER_WAGE * 1.5 &&
            c.hireCost <= money(state) - reserve(state) - 500,
        )
        .sort((a, b) => a.wage - b.wage || b.level - a.level)[0];
      // Erst das Lager, dann die Spots mit dem meisten Andrang.
      const warehouseGuarded = securityAt(state, { warehouseId: DEFAULT_WAREHOUSE }).length > 0;
      const spot = getSpots(state)
        .filter((s) => getStaff(state, { spotId: s.id, role: 'security' }).length === 0)
        .sort((a, b) => b.demand - a.demand)[0];
      const assignment = !warehouseGuarded
        ? { kind: 'warehouse' as const, targetId: DEFAULT_WAREHOUSE }
        : spot
          ? { kind: 'spot' as const, targetId: spot.id }
          : null;
      if (candidate && assignment) {
        run(sim, stats, { type: 'recruiting.hire', payload: { candidateId: candidate.id, assignment } });
      }
    }
  }
}

/**
 * Offene Handy-Nachrichten beantworten. Schutzgeld und Waffenstillstand nur, wenn es aus der Portokasse geht
 * (höchstens ein Viertel des Geldes), sonst ablehnen. Aufträge und Angebote lehnt er ab, Warnungen nimmt er ernst.
 */
function answerMessages(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  const PREFERENCE = ['tribute', 'ceasefire', 'raise', 'lieLow', 'refuse', 'decline', 'no', 'later', 'ignore'];
  for (const m of [...state.messages.list]) {
    if (!messages.canAnswer(state, m)) continue;
    const options = m.options ?? [];
    const affordable = (id: string) => {
      const option = options.find((o) => o.id === id);
      const command = option?.command;
      if (!command) return true;
      if (command.type === 'gangs.payTribute') return tributeAmount(state, command.payload.gangId) <= money(state) / 4;
      if (command.type === 'gangs.ceasefire') return ceasefireCost(state, command.payload.gangId) <= money(state) / 4;
      return true;
    };
    const choices = PREFERENCE.filter((p) => options.some((o) => o.id === p) && affordable(p));
    for (const optionId of choices) {
      if (run(sim, stats, { type: 'messages.answer', payload: { messageId: m.id, optionId } })) break;
    }
  }
}

/** Konfrontationen: Die Leute sollen es regeln (der Bot geht nie selbst hin). */
function handleEncounters(sim: Simulation, stats: BotStats): void {
  for (const e of activeEncounters(sim.state)) {
    if (e.phase === 'done') continue;
    if (e.phase === 'briefing')
      run(sim, stats, { type: 'encounters.join', payload: { encounterId: e.id, present: false } });
    run(sim, stats, { type: 'encounters.auto', payload: { encounterId: e.id } });
  }
}

/** Kredit bei Lieferanten zurückzahlen, sobald das Geld reicht. */
function repay(sim: Simulation, stats: BotStats): void {
  const state = sim.state;
  for (const supplier of getSuppliers(state)) {
    const debt = getRelation(state, supplier.id).debt;
    if (debt > 0 && money(state) > reserve(state) + debt) {
      run(sim, stats, { type: 'suppliers.repay', payload: { supplierId: supplier.id, amount: debt } });
    }
  }
}

/** Ein Blick aufs Spiel. */
export function botTurn(sim: Simulation, stats: BotStats, options: BotOptions = DEFAULT_BOT): void {
  if (sim.state.outcome.gameOver) return;
  handleEncounters(sim, stats);
  answerMessages(sim, stats);
  sellPersonally(sim, stats, options);
  repay(sim, stats);
  restock(sim, stats);
  grow(sim, stats);
}

/** Lässt den Bot so viele Spielminuten spielen. */
export function playFor(sim: Simulation, minutes: number, stats: BotStats, options: BotOptions = DEFAULT_BOT): void {
  const end = sim.state.time + minutes;
  while (sim.state.time < end && !sim.state.outcome.gameOver) {
    botTurn(sim, stats, options);
    sim.advance(Math.min(options.attentionEvery, end - sim.state.time));
  }
}

export function newBotStats(): BotStats {
  return { commands: 0, failed: 0, byType: {} };
}

/** Kurzbericht eines Spielstands. */
export function snapshot(state: GameState) {
  const gangs = state.modules.gangs;
  return {
    day: Math.floor(state.time / 1440) + 1,
    dirty: Math.round(state.wallet.dirty),
    clean: Math.round(state.wallet.clean),
    stock: getStock(state),
    staff: getStaff(state).length,
    runners: getStaff(state, { role: 'runner' }).length,
    security: getStaff(state, { role: 'security' }).length,
    lieutenants: Object.keys(state.modules.hierarchy.lieutenants).length,
    spots: getSpots(state).length,
    veedel: controlledBy(state, PLAYER_FACTION).length,
    reputation: Math.round(state.modules.reputation.value),
    maxHostility: Math.round(Math.max(...Object.values(gangs.gangs).map((s) => s.hostility))),
    gameOver: state.outcome.gameOver?.reason ?? null,
    won: state.outcome.won ? Math.floor(state.outcome.won.time / 1440) + 1 : null,
  };
}
