// Container packen (Auftrag 44, Teil 7): Auslöser bei eigener Bestellung (trade.buy, trade.sail), nicht bei Fenna,
// Faktor auf das Zollrisiko aus dem Score, Rechte Hand, timeout (wie bisher).

import { describe, expect, it } from 'vitest';
import { journal, type Simulation } from '../../core';
import { createTestGame, eventsOfType, recordEvents } from '../../core/testing';
import { playableCities } from '../city';
import { activeChallenge, MINIGAME_KINDS, MINIGAME_TIMEOUT } from '../minigames';
import { addInfluence, factions, PLAYER_FACTION } from '../territory';
import { allVeedel } from '../veedel';
import {
  buyContainer,
  containerRisk,
  getShipments,
  type PackingParams,
  packingFactor,
  packingIds,
  packingRef,
} from './index';
import { onPackingFinished } from './packing';

/** Ganz Deutschland, verkauft und in Rotterdam angekommen; Kundschaft in den Städten aus. */
function soldGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.modules.customers.directOrders = false;
  const ctx = sim.ctx('test');
  for (const city of playableCities()) {
    if (city.id !== 'koeln') sim.dispatch({ type: 'city.unlock', payload: { cityId: city.id } }, { actor: 'system' });
    for (const v of allVeedel(city.id)) {
      for (const f of factions(sim.state)) if (f !== PLAYER_FACTION) addInfluence(ctx, v.id, f, -100);
      addInfluence(ctx, v.id, PLAYER_FACTION, 100);
    }
  }
  sim.advance(60);
  sim.state.modules.city.sale = { status: 'calling', callAt: null, sold: null };
  const sold = sim.dispatch({ type: 'city.sell', payload: {} });
  if (!sold.ok) throw new Error(sold.reason);
  while (sim.state.modules.city.travel) sim.advance(30);
  sim.state.wallet.dirty += 3_000_000;
  sim.state.wallet.clean += 1_000_000;
  return sim;
}

function buyTwo(sim: Simulation) {
  const bought = sim.dispatch({
    type: 'trade.buy',
    payload: { producerId: 'marokko', productId: 'hash', size: 'full', cover: 'bananas', count: 2 },
  });
  if (!bought.ok) throw new Error(bought.reason);
  return (bought.data as { shipmentIds: number[] }).shipmentIds;
}

describe('Container packen', () => {
  it('ist scharf und zählt Vorsicht der Rechten Hand', () => {
    expect(MINIGAME_KINDS.container).toMatchObject({ ready: true, stat: 'caution' });
  });

  it('Faktor aus dem Score: 0 → 1,25, 0,5 → 0,9, 1 → 0,55, ohne Wert 1', () => {
    expect(packingFactor(0)).toBe(1.25);
    expect(packingFactor(0.5)).toBe(0.9);
    expect(packingFactor(1)).toBe(0.55);
    expect(packingFactor(undefined)).toBe(1);
    expect(packingFactor(Number.NaN)).toBe(1);
    expect(packingFactor(3)).toBe(0.55);
    expect(packingIds(packingRef([4, 17]))).toEqual([4, 17]);
    expect(packingIds('container:4')).toEqual([]);
  });

  it('eigene Bestellung startet das Minispiel mit Ware, Größe, Deckladung und Anzahl', () => {
    const sim = soldGame(31);
    const events = recordEvents(sim);
    const ids = buyTwo(sim);
    const c = activeChallenge(sim.state);
    expect(c).toMatchObject({ kind: 'container', origin: { module: 'trade', ref: packingRef(ids) } });
    const params = c?.params as unknown as PackingParams;
    expect(params).toMatchObject({
      products: [{ id: 'hash', name: 'Hasch' }],
      size: 'full',
      cover: 'bananas',
      count: 2,
      grams: 120_000,
      vessel: null,
    });
    expect(c?.situation).toContain('die anderen 1 genauso');
    expect(eventsOfType(events, 'minigame.started')).toHaveLength(1);
  }, 30_000);

  it('gut gepackt senkt das Zollrisiko aller Container der Bestellung, schlecht gepackt hebt es', () => {
    const sim = soldGame(32);
    const ids = buyTwo(sim);
    const base = containerRisk(sim.state, 'marokko', 'full', 'rotterdam', 'bananas');
    const id = activeChallenge(sim.state)?.id ?? -1;
    expect(sim.dispatch({ type: 'minigames.finish', payload: { id, score: 1 } }).ok).toBe(true);
    const list = getShipments(sim.state).filter((x) => ids.includes(x.id));
    expect(list.map((x) => x.packing)).toEqual([1, 1]);
    // pack (Verpackung eigener Ware aus grow) bleibt davon unberührt.
    expect(list.every((x) => x.pack === undefined)).toBe(true);
    const packed = containerRisk(sim.state, 'marokko', 'full', 'rotterdam', 'bananas', null, 1, list[0].packing);
    expect(packed).toBeCloseTo(base * 0.55, 6);
    expect(journal.entries(sim.state).some((e) => e.text.startsWith('Gut gepackt'))).toBe(true);

    const bad = soldGame(33);
    const badIds = buyTwo(bad);
    const badId = activeChallenge(bad.state)?.id ?? -1;
    bad.dispatch({ type: 'minigames.finish', payload: { id: badId, score: 0 } });
    expect(getShipments(bad.state).find((x) => x.id === badIds[0])?.packing).toBe(0);
    expect(containerRisk(bad.state, 'marokko', 'full', 'rotterdam', 'bananas', null, 1, 0)).toBeCloseTo(
      containerRisk(bad.state, 'marokko', 'full', 'rotterdam', 'bananas') * 1.25,
      6,
    );
  }, 60_000);

  it('timeout (ohne Oberfläche): kein Faktor, alles wie bisher', () => {
    const sim = soldGame(34);
    const ids = buyTwo(sim);
    sim.advance(MINIGAME_TIMEOUT + 1);
    expect(activeChallenge(sim.state)).toBeUndefined();
    expect(
      getShipments(sim.state)
        .filter((x) => ids.includes(x.id))
        .every((x) => x.packing === undefined),
    ).toBe(true);
  }, 30_000);

  it('Rechte Hand: ihr Score gilt wie der des Spielers', () => {
    const sim = soldGame(35);
    const ids = buyTwo(sim);
    const c = activeChallenge(sim.state);
    if (!c) throw new Error('kein Minispiel');
    // Rotterdam hat keine Rechte Hand: delegieren geht nicht.
    expect(sim.dispatch({ type: 'minigames.delegate', payload: { id: c.id } }).ok).toBe(false);
    // Das Ergebnis, wie es käme, wenn sie übernommen hätte.
    onPackingFinished(sim.ctx('trade'), {
      id: c.id,
      kind: 'container',
      origin: c.origin,
      cityId: c.cityId,
      score: 0.7,
      won: true,
      by: 'rightHand',
      picks: [],
    });
    expect(getShipments(sim.state).find((x) => x.id === ids[0])?.packing).toBe(0.7);
  }, 30_000);

  it('Fenna (direkt), andere Actors und schon gelandete Container: kein Minispiel bzw. kein Faktor', () => {
    const sim = soldGame(36);
    expect(buyContainer(sim.ctx('trade'), 'marokko', 'hash', 'small').ok).toBe(true);
    expect(activeChallenge(sim.state)).toBeUndefined();
    const system = sim.dispatch(
      { type: 'trade.buy', payload: { producerId: 'marokko', productId: 'hash', size: 'small' } },
      { actor: 'system' },
    );
    expect(system.ok).toBe(true);
    expect(activeChallenge(sim.state)).toBeUndefined();
    // Container schon gelandet: das Ergebnis ändert nichts mehr.
    const ids = buyTwo(sim);
    const c = activeChallenge(sim.state);
    if (!c) throw new Error('kein Minispiel');
    for (const x of getShipments(sim.state)) if (ids.includes(x.id)) x.status = 'quay';
    sim.dispatch({ type: 'minigames.finish', payload: { id: c.id, score: 1 } });
    expect(
      getShipments(sim.state)
        .filter((x) => ids.includes(x.id))
        .every((x) => x.packing === undefined),
    ).toBe(true);
  }, 30_000);

  it('eigenes Schiff beladen: Minispiel mit dem Namen des Schiffs, größter Container und alle Waren', () => {
    const sim = soldGame(37);
    const bought = sim.dispatch({ type: 'fleet.buy', payload: { model: 'coaster', cityId: 'rotterdam' } });
    if (!bought.ok) throw new Error(bought.reason);
    const vesselId = (bought.data as { vehicleId: number }).vehicleId;
    const load = [
      { productId: 'weed', size: 'medium' as const, cover: 'tiles' as const },
      { productId: 'haze', size: 'full' as const, cover: 'tiles' as const },
    ];
    const sent = sim.dispatch({ type: 'trade.sail', payload: { vesselId, producerId: 'spanien', load } });
    if (!sent.ok) throw new Error(sent.reason);
    const params = activeChallenge(sim.state)?.params as unknown as PackingParams;
    expect(params.size).toBe('full');
    expect(params.cover).toBe('tiles');
    expect(params.products.map((p) => p.id)).toEqual(['weed', 'haze']);
    expect(typeof params.vessel).toBe('string');
    expect(params.count).toBe(2);
  }, 30_000);
});
