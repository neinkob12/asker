// Test-Spielstände der Minispiele (Auftrag 46): für jede der zehn Arten ein Stand, in dem genau dieses Minispiel
// ansteht, ausgelöst auf dem echten Weg des jeweiligen Moduls aus dem Stand „Boss von Köln“ (Rechte Hand, Lager mit
// Ware, Gangs mit Kasse) bzw. „Hafen-Phase“ (Container packen). Nach dem Laden öffnet die Oberfläche den Rahmen von
// selbst (minigames/ui, PendingHud), und die Folgen laufen wie im Spiel: Konfrontation, Razzia, Lieferung, Bewerber.
//
// Zufall: Wo sonst ein Wurf entscheidet (Kontrolle am Spot, Zivis), startet police hier ohne Wurf (playerChase,
// startUndercoverShift). Konfrontationen, deren Ausgang das Minispiel erst bringt (Tresor nach dem Überfall, Bude nach
// dem Eintreiben), spielt der Bau auf einer Kopie so oft, bis der Ausgang passt (jeder Versuch eine Spielminute
// später, mit anderen Würfeln). Alles kommt fest aus Seed 1, wie die übrigen Test-Spielstände (testSaves.ts).

import { type CommandResult, clock, type GameState, loadSimulation, MINUTES_PER_HOUR, type Simulation } from '../core';
import { discoverModules } from '../core/discover';
import { activeEncounters, autoResolveEncounter } from '../modules/encounters';
import { getGangStatus, getGangs, isGangBroken, protectionAmount, raidCrew, raidTargets } from '../modules/gangs';
import { getLots, getWarehouses, isWarehouseOwned, store, warehouseFree, warehouseSites } from '../modules/goods';
import { getTrips, playerBusy } from '../modules/logistics';
import {
  activeChallenge,
  MINIGAME_KIND_IDS,
  MINIGAME_KINDS,
  type MinigameKind,
  resolveMinigameNow,
} from '../modules/minigames';
import { getHeat, playerChase, startUndercoverShift, tipOffAgainstPlayer } from '../modules/police';
import { canInterview, getPool } from '../modules/recruiting';
import { getSpot, getSpots } from '../modules/spots';
import { availablePackages, getSuppliers, packagePrice, type Shipment } from '../modules/suppliers';
import { controllerOf, hasPlayerPresence, PLAYER_FACTION } from '../modules/territory';
import { PRODUCERS } from '../modules/trade';
import { allVeedel, veedelAt } from '../modules/veedel';
import type { TestSave } from './testSaves';

/** Kennung des Stands einer Art: minispiel-<art>. */
export function minigameSaveId(kind: MinigameKind): string {
  return `minispiel-${kind}`;
}

/** Alle Kennungen in der Reihenfolge der Arten (MINIGAME_KIND_IDS). */
export const MINIGAME_SAVE_IDS: readonly string[] = MINIGAME_KIND_IDS.map(minigameSaveId);

/** Ist das die Kennung eines Minispiel-Stands? */
export function isMinigameSave(id: string): boolean {
  return MINIGAME_SAVE_IDS.includes(id);
}

/** Ausgangsstände (aus testSaves.ts, ohne Kreis-Import): Boss von Köln und die Hafen-Phase. */
export interface MinigameBases {
  koeln: () => GameState;
  harbor: () => GameState;
}

const SEED = 1;
const CITY = 'koeln';
/** Uhrzeit des Stands (Nacht für Blaulicht, Lampen und Kneipenlicht); ohne Angabe die Zeit des Ausgangsstands. */
const HOUR_BY_KIND: Partial<Record<MinigameKind, number>> = {
  chase: 22,
  brawl: 23,
  stash: 23,
  traffic: 21,
  undercover: 20,
  safe: 2,
};
/** So viel Ware liegt mindestens in jedem Kölner Lager (Gramm): Razzia, Zivis und Fahrt brauchen etwas zu zeigen. */
const STOCK_MIN = 300;
/** Kasse der Gang mindestens, damit Tresor und Bude etwas hergeben (SAFE_MIN, SEARCH_MIN in gangs). */
const GANG_MONEY_MIN = 25_000;
/** So oft wird eine Konfrontation mit offenem Ausgang höchstens versucht. */
const ATTEMPTS = 60;

function fail(id: string, what: string): never {
  throw new Error(`Seed ${SEED}, „${id}“: ${what}`);
}

function ok(result: CommandResult, id: string, what: string): asserts result is { ok: true; data?: unknown } {
  if (!result.ok) fail(id, `${what}: ${result.reason}`);
}

function encounterIdOf(result: { ok: true; data?: unknown }): number {
  return (result.data as { encounterId: number }).encounterId;
}

/** Offene Konfrontationen und Minispiele auswürfeln: Es soll nur das eine Minispiel anstehen. */
function quiet(sim: Simulation): void {
  const ctx = sim.ctx('scenario');
  for (const e of [...activeEncounters(sim.state)]) autoResolveEncounter(ctx, e.id);
  for (const c of [...sim.state.modules.minigames.active]) resolveMinigameNow(ctx, c.id);
}

/**
 * Ohne Bot bis zur Uhrzeit (Minute 5 bis 44, damit weder der Auslöser noch der Schritt danach in die volle Stunde mit
 * ihren Kontrollen fällt); ohne Uhrzeit nur aus der vollen Stunde heraus. Unterwegs bleibt alles ruhig (quiet).
 */
function toHour(sim: Simulation, id: string, hour?: number): void {
  for (let guard = 0; guard <= 25 * MINUTES_PER_HOUR; guard++) {
    const t = sim.state.time;
    const minute = clock.minute(t);
    if ((hour === undefined || clock.hour(t) === hour) && minute >= 5 && minute < 45) return;
    sim.step();
    quiet(sim);
    if (sim.state.outcome.gameOver) fail(id, `Game Over (${sim.state.outcome.gameOver.reason}).`);
  }
  fail(id, `${hour} Uhr nicht erreicht.`);
}

/** Kölner Veedel, die dir gehören. */
function ownedVeedel(state: GameState): string[] {
  return allVeedel(CITY)
    .filter((v) => controllerOf(state, v.id) === PLAYER_FACTION)
    .map((v) => v.id);
}

/** Du stellst dich an einen Spot: in einem eigenen Veedel, mit der meisten Nachfrage. */
function standAt(sim: Simulation, id: string): string {
  const owned = ownedVeedel(sim.state);
  const spots = [...getSpots(sim.state, CITY)].sort(
    (a, b) => Number(owned.includes(b.veedelId)) - Number(owned.includes(a.veedelId)) || b.demand - a.demand,
  );
  for (const spot of spots) {
    if (sim.dispatch({ type: 'customers.standAt', payload: { spotId: spot.id } }).ok) return spot.id;
  }
  return fail(id, 'kein Spot, an den du dich stellen kannst.');
}

/** In jedem Kölner Lager liegt mindestens STOCK_MIN Gramm Gras. */
function stockUp(sim: Simulation): void {
  const ctx = sim.ctx('scenario');
  for (const w of getWarehouses(sim.state, CITY)) {
    const grams = getLots(sim.state, { warehouseId: w.id }).reduce((sum, lot) => sum + lot.amount, 0);
    const amount = Math.min(STOCK_MIN - grams, warehouseFree(sim.state, w.id));
    if (amount > 0) store(ctx, { productId: 'weed', amount, warehouseId: w.id, quality: 0.6 });
  }
}

/** Das Minispiel dieser Art steht an, sonst Fehler mit dem, was stattdessen offen ist. */
function pending(sim: Simulation, id: string, kind: MinigameKind): Simulation {
  if (sim.state.outcome.gameOver) fail(id, `Game Over (${sim.state.outcome.gameOver.reason}).`);
  const open = activeChallenge(sim.state);
  if (open?.kind !== kind) {
    fail(id, `kein Minispiel „${MINIGAME_KINDS[kind].name}“ (offen: ${open?.kind ?? 'keins'}).`);
  }
  return sim;
}

/**
 * Eine Konfrontation mit offenem Ausgang auf einer Kopie spielen, bis danach das Minispiel ansteht (jeder Versuch eine
 * Spielminute später, mit anderen Würfeln).
 */
function untilPending(sim: Simulation, id: string, kind: MinigameKind, play: (trial: Simulation) => void): Simulation {
  const modules = discoverModules();
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const trial = loadSimulation(structuredClone(sim.state), modules);
    play(trial);
    if (!trial.state.outcome.gameOver && activeChallenge(trial.state)?.kind === kind) return trial;
    sim.step();
    quiet(sim);
  }
  return fail(id, `nach ${ATTEMPTS} Versuchen steht kein „${MINIGAME_KINDS[kind].name}“ an.`);
}

/** Eine Kölner Gang mit einem Spot, den du überfallen kannst, mit Kasse, und das Veedel dazu. */
function raidTarget(state: GameState, id: string): { gangId: string; veedelId: string } {
  for (const gang of getGangs(state, CITY)) {
    const status = getGangStatus(state, gang.id);
    if (!status || isGangBroken(state, gang.id)) continue;
    const [veedelId] = raidTargets(state, gang.id);
    if (!veedelId) continue;
    status.money = Math.max(status.money, GANG_MONEY_MIN);
    return { gangId: gang.id, veedelId };
  }
  return fail(id, 'keine Gang mit einem Spot zum Überfallen.');
}

/** Eine Kölner Gang, die dir Schutzgeld schuldet (gefordert, dann die Zahlung verweigert). */
function debtor(sim: Simulation, id: string): string {
  const state = sim.state;
  const gang = getGangs(state, CITY).find((g) => !isGangBroken(state, g.id) && getGangStatus(state, g.id));
  const status = gang ? getGangStatus(state, gang.id) : undefined;
  if (!gang || !status) return fail(id, 'keine Gang für Schutzgeld.');
  status.money = Math.max(status.money, GANG_MONEY_MIN);
  if (!status.protection) sim.dispatch({ type: 'gangs.demandProtection', payload: { gangId: gang.id } });
  const protection = status.protection ?? {
    amount: protectionAmount(state, gang.id),
    nextDueAt: state.time,
    overdue: true,
  };
  status.protection = { ...protection, overdue: true };
  return gang.id;
}

type Build = (sim: Simulation, id: string) => Simulation;

const BUILDERS: Record<MinigameKind, Build> = {
  // Kontrolle an deinem Spot, du rennst los.
  chase: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.chase);
    const spotId = standAt(sim, id);
    if (!playerChase(sim.ctx('scenario'), spotId)) fail(id, 'keine Kontrolle am Spot.');
    sim.step();
    return pending(sim, id, 'chase');
  },
  // Überfall auf den Spot einer Gang, du bist dabei: Zuschlagen.
  brawl: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.brawl);
    const { gangId, veedelId } = raidTarget(sim.state, id);
    const staffIds = raidCrew(sim.state, CITY).map((m) => m.id);
    const attacked = sim.dispatch({
      type: 'gangs.attack',
      payload: { gangId, veedelId, staffIds, playerPresent: true },
    });
    ok(attacked, id, 'Überfall');
    const encounterId = encounterIdOf(attacked);
    ok(sim.dispatch({ type: 'encounters.act', payload: { encounterId, actionId: 'fight' } }), id, 'Zuschlagen');
    return pending(sim, id, 'brawl');
  },
  // Tipp vom Kontakt: Razzia in einem eigenen Veedel (am liebsten mit Lager), Ware liegt noch da.
  stash: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.stash);
    stockUp(sim);
    const state = sim.state;
    const police = state.modules.police;
    const withWarehouse = new Set(getWarehouses(state, CITY).map((w) => veedelAt(w.lng, w.lat)?.id));
    const candidates = ownedVeedel(state)
      .filter(
        (v) =>
          hasPlayerPresence(state, v) &&
          police.plannedRaids[v] === undefined &&
          !police.majorRaid?.veedelIds.includes(v),
      )
      .sort((a, b) => Number(withWarehouse.has(b)) - Number(withWarehouse.has(a)));
    for (const veedelId of candidates) {
      police.raidReadyAt[veedelId] = Math.min(police.raidReadyAt[veedelId] ?? 0, state.time);
      tipOffAgainstPlayer(sim.ctx('scenario'), veedelId, 10, true);
      if (activeChallenge(state)?.kind === 'stash') break;
    }
    sim.step();
    return pending(sim, id, 'stash');
  },
  // Du fährst selbst Ware von einem Lager ins andere und wirst rausgewunken.
  traffic: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.traffic);
    const busy = playerBusy(sim.state, CITY);
    if (busy) fail(id, busy);
    if (getWarehouses(sim.state, CITY).length < 2) {
      // Ein zweites Lager, ohne dass der Stand danach reich aussieht: Das Geld dafür kommt und geht.
      const site = warehouseSites(CITY).find((w) => !isWarehouseOwned(sim.state, w.id));
      if (!site) fail(id, 'kein zweites Lager zu kaufen.');
      const clean = sim.state.wallet.clean;
      sim.state.wallet.clean += 200_000;
      ok(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: site.id } }), id, 'Lager kaufen');
      sim.state.wallet.clean = clean;
    }
    stockUp(sim);
    const [from, to] = getWarehouses(sim.state, CITY);
    ok(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: from.id, toId: to.id, by: 'player' } }),
      id,
      'Umlagern',
    );
    const trip = getTrips(sim.state).find((t) => t.driverId === null && t.status === 'enRoute');
    if (!trip) fail(id, 'keine eigene Fahrt.');
    trip.checkAt = sim.state.time + 1;
    trip.loadedAt = sim.state.time;
    sim.advance(2);
    return pending(sim, id, 'traffic');
  },
  // Abends an deinem Spot: eine Schicht Zivis.
  undercover: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.undercover);
    stockUp(sim);
    const spotId = standAt(sim, id);
    const spot = getSpot(sim.state, spotId);
    if (!spot) fail(id, 'Spot weg.');
    if (startUndercoverShift(sim.ctx('scenario'), spotId, getHeat(sim.state, spot.veedelId)) === null) {
      fail(id, 'keine Schicht Zivis.');
    }
    sim.step();
    return pending(sim, id, 'undercover');
  },
  // Eigener Überfall auf den Spot einer Gang, gewonnen: der Tresor im Hinterzimmer.
  safe: (sim, id) => {
    toHour(sim, id, HOUR_BY_KIND.safe);
    return untilPending(sim, id, 'safe', (trial) => {
      const { gangId, veedelId } = raidTarget(trial.state, id);
      const staffIds = raidCrew(trial.state, CITY).map((m) => m.id);
      const attacked = trial.dispatch({
        type: 'gangs.attack',
        payload: { gangId, veedelId, staffIds, playerPresent: true },
      });
      ok(attacked, id, 'Überfall');
      autoResolveEncounter(trial.ctx('scenario'), encounterIdOf(attacked));
      trial.step();
    });
  },
  // Schutzgeld eintreiben, du bist dabei: danach die Bude des Schuldners.
  search: (sim, id) => {
    toHour(sim, id);
    return untilPending(sim, id, 'search', (trial) => {
      const gangId = debtor(trial, id);
      const collected = trial.dispatch({ type: 'gangs.collect', payload: { gangId, playerPresent: true } });
      ok(collected, id, 'Eintreiben');
      autoResolveEncounter(trial.ctx('scenario'), encounterIdOf(collected));
      trial.step();
    });
  },
  // Hafen-Phase: ein Container bei einem Produzenten bestellt, du packst ihn.
  container: (sim, id) => {
    toHour(sim, id);
    sim.state.wallet.dirty += 100_000;
    for (const producer of PRODUCERS) {
      for (const productId of Object.keys(producer.products)) {
        const bought = sim.dispatch({
          type: 'trade.buy',
          payload: { producerId: producer.id, productId, size: 'small' },
        });
        if (bought.ok) return pending(sim, id, 'container');
      }
    }
    return fail(id, 'keine Bestellung bei einem Produzenten möglich.');
  },
  // Der Zoll hält eine Sammellieferung fest: Papiere selbst machen statt schmieren.
  papers: (sim, id) => {
    toHour(sim, id);
    const state = sim.state;
    // Eine Sammellieferung sind zwei verschiedene Pakete (zweimal dasselbe wird ein Paket): Der Zoll fragt dann immer.
    const packagesOf = (supplierId: string) =>
      availablePackages(state, supplierId, CITY)
        .filter((p) => !p.container)
        .sort((a, b) => a.price - b.price);
    const supplier = getSuppliers(state, CITY).find((s) => s.kind !== 'port' && packagesOf(s.id).length >= 2);
    if (!supplier) fail(id, 'kein Lieferant mit zwei Paketen.');
    const packages = packagesOf(supplier.id);
    let shipment: Shipment | undefined;
    let why = '';
    for (const second of packages.slice(1)) {
      const lines = [packages[0], second].map((p) => ({ packageId: p.id, count: 1 }));
      state.wallet.dirty +=
        packagePrice(state, supplier.id, packages[0].id, CITY) +
        packagePrice(state, supplier.id, second.id, CITY) +
        1000;
      const ordered = sim.dispatch({
        type: 'suppliers.orderBatch',
        payload: { supplierId: supplier.id, lines, mode: 'group' },
      });
      if (!ordered.ok) {
        why = ordered.reason;
        continue;
      }
      const shipmentId = (ordered.data as { shipmentId?: number } | undefined)?.shipmentId;
      shipment = state.modules.suppliers.shipments.find((x) => x.id === shipmentId && (x.extra?.length ?? 0) > 0);
      if (shipment) break;
    }
    if (!shipment) fail(id, `keine Sammelbestellung möglich${why ? ` (${why})` : ''}.`);
    const s = shipment;
    s.problem = 'seized';
    s.problemAt = state.time + 1;
    s.problemRevealed = false;
    delete s.luck;
    sim.advance(2);
    if (!s.decision?.choices.includes('papers')) fail(id, 'der Zoll fragt nicht nach.');
    const message = state.messages.list.find((m) =>
      m.options?.some(
        (o) => o.id === 'papers' && (o.command?.payload as { shipmentId?: number } | undefined)?.shipmentId === s.id,
      ),
    );
    if (!message) fail(id, 'keine Nachricht mit der Wahl.');
    ok(
      sim.dispatch({ type: 'messages.answer', payload: { messageId: message.id, optionId: 'papers' } }),
      id,
      'Papiere fälschen',
    );
    return pending(sim, id, 'papers');
  },
  // Ein Bewerber aus dem Pool: drei Fragen.
  interview: (sim, id) => {
    toHour(sim, id);
    const find = () => getPool(sim.state, CITY).find((c) => canInterview(sim.state, c).ok);
    let candidate = find();
    if (!candidate) {
      sim.state.wallet.dirty += 5000;
      sim.dispatch({ type: 'recruiting.search', payload: {} });
      for (let hour = 0; hour < 48 && !candidate; hour++) {
        sim.advance(MINUTES_PER_HOUR);
        quiet(sim);
        candidate = find();
      }
    }
    if (!candidate) fail(id, 'kein Bewerber.');
    ok(sim.dispatch({ type: 'recruiting.interview', payload: { candidateId: candidate.id } }), id, 'Gespräch');
    return pending(sim, id, 'interview');
  },
};

/** Ein Stand je Art: Kopie des Ausgangsstands, der Auslöser, Kennung und eigener Lauf (nicht in der Bestenliste). */
export function buildMinigameSave(kind: MinigameKind, bases: MinigameBases): GameState {
  const id = minigameSaveId(kind);
  const base = kind === 'container' ? bases.harbor() : bases.koeln();
  const sim = loadSimulation(structuredClone(base), discoverModules());
  quiet(sim);
  const state = structuredClone(BUILDERS[kind](sim, id).state);
  state.meta.scenario = id;
  state.meta.runId = `test-${id}-${SEED}`;
  return state;
}

/** Die Einträge für TEST_SAVES (testSaves.ts), in der Reihenfolge der Arten. */
export function minigameSaves(bases: MinigameBases): TestSave[] {
  return MINIGAME_KIND_IDS.map((kind) => ({
    id: minigameSaveId(kind),
    label: `Test: Minispiel ${MINIGAME_KINDS[kind].name}`,
    build: () => buildMinigameSave(kind, bases),
  }));
}
