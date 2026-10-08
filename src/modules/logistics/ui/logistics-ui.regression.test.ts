// Bugreview Logistik-Oberfläche: Karte „Lieferung live“ (Hamburg, umgeleitete und wartende Abholungen, Nachtfahrt,
// Reise, Einheiten), sichtbarer Grund bei „Selbst abholen“, Fahrzeugwahl, Rat und Fahrerseite. Ohne DOM: geprüft wird,
// was die Karte und die Seiten aus dem Zustand ableiten.

import { describe, expect, it } from 'vitest';
import type { Simulation } from '../../../core';
import { createTestGame } from '../../../core/testing';
import { activeCity, cityTravel } from '../../city';
import { formatProductAmount, store, warehouseFree } from '../../goods';
import { getTrips, receiveCargo } from '../index';
import { driverTripText } from './routes';
import { currentTracking, productTotals, selfPickupBlocked } from './tracking';
import { AUTO, shownVehicle, vehicleChoice } from './vehicles';

/** Ruhiges Spiel mit Geld und Kölner Liegeplatz. */
function quietGame(seed = 1): Simulation {
  const sim = createTestGame({ seed });
  for (const key of Object.keys(sim.state.modules.customers.nextSpawnAt)) {
    sim.state.modules.customers.nextSpawnAt[key] = Infinity;
  }
  sim.state.wallet.clean = 200_000;
  sim.state.wallet.dirty = 200_000;
  sim.state.modules.logistics.berths.koeln = { since: sim.state.time, level: 0 };
  return sim;
}

function cargo(sim: Simulation, productId: string, amount: number, cityId = 'koeln'): number {
  return receiveCargo(sim.ctx('suppliers'), {
    supplierId: cityId === 'koeln' ? 'rotterdam' : 'amsterdam',
    productId,
    amount,
    quality: 0.7,
    unitCost: 2,
    cityId,
  });
}

/** Keine Verkehrskontrolle unterwegs. */
function noChecks(sim: Simulation): void {
  for (const trip of sim.state.modules.logistics.trips) trip.checkAt = null;
}

/** Hamburg frei und aktiv (city.switch: du selbst bleibst in Köln), mit Liegeplatz, Lager und Fahrer. */
function hamburg(sim: Simulation): void {
  expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
  expect(sim.dispatch({ type: 'city.switch', payload: { cityId: 'hamburg' } }).ok).toBe(true);
  expect(activeCity(sim.state)).toBe('hamburg');
  sim.state.modules.logistics.berths.hamburg = { since: sim.state.time, level: 0 };
  expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'werkstatt-ottensen' } }).ok).toBe(true);
}

function hireDriver(sim: Simulation): void {
  const hired = sim.dispatch({ type: 'staff.hireDriver', payload: {} });
  if (!hired.ok) throw new Error(hired.reason);
}

/** Eigene Abholung nach Ehrenfeld, die dort am vollen Lager wartet. */
function waitingPickup(sim: Simulation, cargoId: number) {
  expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player', cargoIds: [cargoId] } }).ok).toBe(true);
  noChecks(sim);
  const [trip] = getTrips(sim.state);
  // Während der Fahrt läuft das Lager voll (z.B. durch eine andere Einlagerung).
  store(sim.ctx('test'), { productId: 'weed', amount: warehouseFree(sim.state, trip.toId), warehouseId: trip.toId });
  sim.advance(trip.arrivesAt - sim.state.time);
  expect(trip.status).toBe('waiting');
  return trip;
}

describe('Lieferung live: Abholungen jeder Stadt', () => {
  it('Hamburg: Abholung mit Fahrer zeigt die Straßenetappe statt des Kais', () => {
    const sim = quietGame();
    hamburg(sim);
    hireDriver(sim);
    cargo(sim, 'haze', 1000, 'hamburg');
    expect(currentTracking(sim.state)?.stage).toBe('quay');
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } }).ok).toBe(true);
    const [trip] = getTrips(sim.state);
    expect(trip.fromId).toBe('port:hamburg');
    const tracking = currentTracking(sim.state);
    expect(tracking?.stage).toBe('road');
    expect(tracking?.pickup).toBe(false);
  });

  it('Köln: eine umgeleitete Abholung bleibt auf der Karte', () => {
    const sim = quietGame();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    const trip = waitingPickup(sim, cargo(sim, 'hash', 500));
    expect(sim.dispatch({ type: 'logistics.redirect', payload: { tripId: trip.id, toId: 'kalk' } }).ok).toBe(true);
    expect(trip.fromId).not.toBe('port');
    const tracking = currentTracking(sim.state);
    expect(tracking?.stage).toBe('road');
    expect(tracking?.status).toContain('Halle Kalk');
  });
});

describe('Lieferung live: Sperrgrund sichtbar', () => {
  it('eigene Fahrt unterwegs: der Grund steht als Satz bereit', () => {
    const sim = quietGame();
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: 100, warehouseId: 'kalk' });
    expect(
      sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'player' } }).ok,
    ).toBe(true);
    cargo(sim, 'hash', 500);
    expect(currentTracking(sim.state)?.pickup).toBe(true);
    expect(selfPickupBlocked(sim.state, 'koeln')).toBe('Du bist schon mit einer Fahrt unterwegs.');
  });

  it('Karte auf Hamburg, du in Köln, kein Fahrer: der Satz nennt einen Weg, der geht', () => {
    const sim = quietGame();
    hamburg(sim);
    cargo(sim, 'haze', 1000, 'hamburg');
    expect(currentTracking(sim.state)?.pickup).toBe(true);
    const blocked = selfPickupBlocked(sim.state, 'hamburg');
    expect(blocked).toContain('Du bist nicht in Hamburg');
    expect(blocked).toContain('heuer dort einen Fahrer an');
    expect(blocked).not.toContain('Schick einen Fahrer');
    // In der eigenen Stadt und frei: nichts sperrt.
    expect(selfPickupBlocked(sim.state, 'koeln')).toBeNull();
  });
});

describe('Lieferung live: Fahrzeugwahl', () => {
  it('ist das gewählte Fahrzeug unterwegs, schickt die Auswahl „Passendes Fahrzeug“', () => {
    const sim = quietGame();
    expect(sim.dispatch({ type: 'fleet.buy', payload: { model: 'kombi' } }).ok).toBe(true);
    const vehicleId = sim.state.modules.fleet.vehicles[0].id;
    const chosen = String(vehicleId);
    expect(shownVehicle(sim.state, 'koeln', chosen)).toBe(chosen);
    expect(shownVehicle(sim.state, 'koeln', 'private')).toBe('private');
    // Der Kombi fährt los (hier: eine eigene Umlagerfahrt), die Hafen-Seite hat ihn noch gewählt.
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: 100, warehouseId: 'kalk' });
    hireDriver(sim);
    expect(
      sim.dispatch({
        type: 'logistics.transfer',
        payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'driver', vehicleId },
      }).ok,
    ).toBe(true);
    expect(shownVehicle(sim.state, 'koeln', chosen)).toBe(AUTO);
    // Der alte Wert wäre abgelehnt worden, der angezeigte geht durch.
    cargo(sim, 'hash', 500);
    const old = sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player', vehicleId } });
    expect(old.ok).toBe(false);
    const shown = vehicleChoice(shownVehicle(sim.state, 'koeln', chosen));
    expect(shown).toBeUndefined();
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'player', vehicleId: shown } }).ok).toBe(true);
  });
});

describe('Lieferung live: Reise zwischen den Städten', () => {
  it('während deiner Fahrt nach Hamburg zeigt die Karte nichts (Platz für die Reisekarte)', () => {
    const sim = quietGame();
    cargo(sim, 'hash', 500);
    expect(currentTracking(sim.state)).not.toBeNull();
    expect(sim.dispatch({ type: 'city.unlock', payload: { cityId: 'hamburg' } }, { actor: 'system' }).ok).toBe(true);
    expect(sim.dispatch({ type: 'city.travel', payload: { cityId: 'hamburg' } }).ok).toBe(true);
    expect(activeCity(sim.state)).toBe('koeln');
    expect(currentTracking(sim.state)).toBeNull();
    const travel = cityTravel(sim.state);
    if (!travel) throw new Error('keine Fahrt');
    sim.advance(travel.arrivesAt - sim.state.time + 5);
    expect(cityTravel(sim.state)).toBeNull();
  });
});

describe('Lieferung live: Fahrt am vollen Lager', () => {
  it('wartende Fahrt mit Rest am Kai: „voll“ statt 100 %, Knopf für den Kai', () => {
    const sim = quietGame();
    const first = cargo(sim, 'hash', 500);
    cargo(sim, 'weed', 300);
    waitingPickup(sim, first);
    const tracking = currentTracking(sim.state);
    expect(tracking?.stage).toBe('road');
    expect(tracking?.tone).toBe('warn');
    expect(tracking?.status).toContain('ist voll');
    expect(tracking?.status).not.toContain('100');
    expect(tracking?.pickup).toBe(true);
    // Du bist frei: Der Knopf wäre nicht gesperrt.
    expect(selfPickupBlocked(sim.state, 'koeln')).toBeNull();
  });

  it('ohne Ware am Kai bleibt es bei der Meldung, kein Knopf', () => {
    const sim = quietGame();
    waitingPickup(sim, cargo(sim, 'hash', 500));
    const tracking = currentTracking(sim.state);
    expect(tracking?.status).toContain('wartet auf Platz');
    expect(tracking?.pickup).toBe(false);
  });
});

describe('Lieferung live: Nachtfahrt', () => {
  it('Ware, die eine Nachtfahrt eingeteilt hat, bietet die Karte nicht zum Abholen an', () => {
    const sim = quietGame(2);
    hireDriver(sim);
    cargo(sim, 'weed', 500);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', choice: 'night' } }).ok).toBe(true);
    const [trip] = getTrips(sim.state);
    expect(trip.status).toBe('planned');
    const tracking = currentTracking(sim.state);
    expect(tracking?.stage).toBe('quay');
    expect(tracking?.pickup).toBe(false);
    expect(tracking?.status).toContain('Nachtfahrt um 23:00');
    // Neue Ware am Kai ist frei: Nur sie zählt im Titel, und nur sie bietet die Karte an.
    cargo(sim, 'weed', 200);
    const next = currentTracking(sim.state);
    expect(next?.pickup).toBe(true);
    expect(next?.title).toContain(formatProductAmount('weed', 200));
    expect(next?.title).not.toContain(formatProductAmount('weed', 700));
  });
});

describe('Lieferung live: Einheiten', () => {
  it('gemischte Ladung: je Ware mit eigener Einheit, keine Summe aus Gramm und Stück', () => {
    const sim = quietGame();
    hamburg(sim);
    hireDriver(sim);
    cargo(sim, 'edibles', 20, 'hamburg');
    cargo(sim, 'haze', 2000, 'hamburg');
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver' } }).ok).toBe(true);
    const title = currentTracking(sim.state)?.title ?? '';
    expect(title).toContain(formatProductAmount('edibles', 20));
    expect(title).toContain(formatProductAmount('haze', 2000));
    expect(title).not.toContain(formatProductAmount('edibles', 2020));
    // Zwei Container derselben Ware werden zusammengezählt.
    expect(
      productTotals([
        { productId: 'weed', amount: 500 },
        { productId: 'edibles', amount: 20 },
        { productId: 'weed', amount: 300 },
      ]),
    ).toEqual([
      { productId: 'weed', amount: 800 },
      { productId: 'edibles', amount: 20 },
    ]);
  });
});

describe('Rat „Ware am Hafen abholen“', () => {
  it('der Grund passt zur Lage (nicht in der Stadt ≠ unterwegs)', () => {
    const sim = quietGame();
    hamburg(sim);
    expect(selfPickupBlocked(sim.state, 'hamburg')).not.toContain('unterwegs');
    sim.dispatch({ type: 'city.switch', payload: { cityId: 'koeln' } });
    expect(sim.dispatch({ type: 'goods.buyWarehouse', payload: { warehouseId: 'kalk' } }).ok).toBe(true);
    store(sim.ctx('test'), { productId: 'hash', amount: 100, warehouseId: 'kalk' });
    sim.dispatch({ type: 'logistics.transfer', payload: { fromId: 'kalk', toId: 'ehrenfeld', by: 'player' } });
    expect(selfPickupBlocked(sim.state, 'koeln')).toBe('Du bist schon mit einer Fahrt unterwegs.');
  });
});

describe('Seite „Fahrer“', () => {
  it('geplante Nachtfahrt fährt erst noch los, Fahrt am vollen Lager wartet', () => {
    const sim = quietGame(2);
    hireDriver(sim);
    cargo(sim, 'weed', 500);
    expect(sim.dispatch({ type: 'logistics.pickup', payload: { by: 'driver', choice: 'night' } }).ok).toBe(true);
    const [planned] = getTrips(sim.state);
    expect(planned.status).toBe('planned');
    const text = driverTripText(sim.state, planned);
    expect(text.chip).toBe('ab 23:00');
    expect(text.meta).toContain('fährt um 23:00');
    expect(text.chip).not.toMatch(/^an /);

    const other = quietGame();
    const waiting = waitingPickup(other, cargo(other, 'hash', 500));
    const wait = driverTripText(other.state, waiting);
    expect(wait.chip).toBe('Lager voll');
    expect(wait.meta).toContain('wartet');
  });
});
