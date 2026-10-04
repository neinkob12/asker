// Lieferung live (Look "Glas"): unten links über der Kartenfläche eine Tracking-Karte, solange eine Schiffslieferung
// läuft, Ware am Kai steht oder eine Abholung unterwegs ist. Status als Zeile, darunter der Weg Rhein → Kai → Lager
// in zwei Teilen; am Kai der Gold-Knopf "Fahrer schicken" (logistics.pickup). Die Live-Aktivität in der Island bleibt,
// die Karte ist die Ansicht am Desktop (am Handy-Bildschirm entfällt sie).

import { formatPercent, type GameState } from '../../../core';
import { Icon, islandCountdown, registerSlot, useGame, useIsMobile } from '../../../ui';
import { formatProductAmount, productName } from '../../goods';
import { getSupplier, type Shipment, shipmentProgress, shipmentsInTransit } from '../../suppliers';
import {
  cargoRisk,
  cargoRiskFrom,
  freeDrivers,
  getCargo,
  getTrips,
  PORT_ID,
  placeOf,
  type Trip,
  tripAmount,
  tripProgress,
} from '../index';

type Stage = 'sea' | 'quay' | 'road';

interface Tracking {
  stage: Stage;
  title: string;
  status: string;
  /** Rhein (0–1) und Straße ins Lager (0–1). */
  sea: number;
  road: number;
  tone: 'info' | 'warn' | 'bad';
  more: number;
}

function shipTracking(state: GameState, shipment: Shipment): Tracking {
  const progress = shipmentProgress(state, shipment);
  const supplier = getSupplier(state, shipment.supplierId);
  return {
    stage: 'sea',
    title: `${formatProductAmount(shipment.productId, shipment.amount)} ${productName(shipment.productId)} · ${supplier?.name ?? 'Lieferant'}`,
    status: `Schiff auf dem Rhein · ${formatPercent(progress)}`,
    sea: progress,
    road: 0,
    tone: shipment.problem === 'delayed' && shipment.problemRevealed ? 'warn' : 'info',
    more: 0,
  };
}

function roadTracking(state: GameState, trip: Trip): Tracking {
  const progress = tripProgress(state, trip);
  const to = placeOf(state, trip.toId)?.name ?? 'Lager';
  const item = trip.items[0];
  const stopped = trip.status === 'stopped';
  const who = trip.driverId ? 'Fahrer fährt' : 'Du fährst';
  const status = stopped
    ? 'Verkehrskontrolle! Die Fahrt steht.'
    : progress.leg === 'toPickup'
      ? `${who} zum Hafen · ${formatPercent(progress.total)}`
      : progress.leg === 'loading'
        ? `Am Kai wird geladen · ${formatPercent(progress.total)}`
        : `${who} ins ${to} · ${formatPercent(progress.total)}`;
  return {
    stage: 'road',
    title: `${item ? `${formatProductAmount(item.productId, tripAmount(trip))} ${productName(item.productId)}` : `${tripAmount(trip)} Einheiten`} · Abholung`,
    status,
    sea: 1,
    road: progress.leg === 'delivering' || progress.leg === 'stopped' ? progress.t : 0,
    tone: stopped ? 'bad' : 'info',
    more: 0,
  };
}

/** Was die Karte zeigt: die am weitesten fortgeschrittene Hafenlieferung (Straße vor Kai vor Rhein). */
function currentTracking(state: GameState): Tracking | null {
  const pickups = getTrips(state).filter((t) => t.kind === 'pickup' && t.fromId === PORT_ID && t.status !== 'planned');
  const cargo = getCargo(state);
  const ships = shipmentsInTransit(state).filter((s) => getSupplier(state, s.supplierId)?.kind === 'port');
  const total = pickups.length + cargo.length + ships.length;
  let tracking: Tracking | null = null;
  if (pickups.length > 0) tracking = roadTracking(state, pickups[0]);
  else if (cargo.length > 0) {
    const c = cargo[0];
    const risky = cargoRisk(state, c) === 'risky';
    const amount = cargo.filter((x) => x.productId === c.productId).reduce((sum, x) => sum + x.amount, 0);
    tracking = {
      stage: 'quay',
      title: `${formatProductAmount(c.productId, amount)} ${productName(c.productId)} · ${getSupplier(state, c.supplierId)?.name ?? 'Lieferant'}`,
      status: risky
        ? 'Am Kai · der Zoll kann sie jederzeit finden'
        : `Am Kai · Zoll in ${islandCountdown(cargoRiskFrom(c) - state.time)}`,
      sea: 1,
      road: 0,
      tone: risky ? 'bad' : 'warn',
      more: 0,
    };
  } else if (ships.length > 0) {
    tracking = ships.map((s) => shipTracking(state, s)).sort((a, b) => b.sea - a.sea)[0];
  }
  if (tracking) tracking.more = total - 1;
  return tracking;
}

function TrackingCard() {
  const { state, dispatch } = useGame();
  const mobile = useIsMobile();
  const tracking = mobile ? null : currentTracking(state);
  if (!tracking) return null;
  const drivers = freeDrivers(state).length;
  return (
    <section class={`logi-track is-${tracking.stage} is-${tracking.tone}`} aria-label="Lieferung live">
      <header class="logi-track__head">
        <span class="logi-track__tile">
          <Icon name={tracking.stage === 'road' ? 'truck' : 'ship'} strokeWidth={2} />
        </span>
        <span class="logi-track__text">
          <span class="logi-track__label">Lieferung live{tracking.more > 0 ? ` · +${tracking.more}` : ''}</span>
          <strong>{tracking.title}</strong>
          <span class="logi-track__status">{tracking.status}</span>
        </span>
      </header>
      <div class="logi-track__way" aria-hidden="true">
        <span class="logi-track__part">
          <span style={{ width: `${Math.round(tracking.sea * 100)}%` }} />
        </span>
        <span class={`logi-track__dot ${tracking.sea >= 1 ? 'is-on' : ''}`} />
        <span class="logi-track__part is-road">
          <span style={{ width: `${Math.round(tracking.road * 100)}%` }} />
        </span>
      </div>
      <div class="logi-track__legend" aria-hidden="true">
        <span>Rhein</span>
        <span>Kai</span>
        <span>Lager</span>
      </div>
      {tracking.stage === 'quay' && (
        <button
          type="button"
          class="logi-track__action"
          onClick={() =>
            dispatch({ type: 'logistics.pickup', payload: drivers > 0 ? { by: 'driver' } : { by: 'player' } })
          }
        >
          {drivers > 0 ? 'Fahrer schicken' : 'Selbst abholen'}
        </button>
      )}
    </section>
  );
}

registerSlot('map.overlay', { id: 'logistics.tracking', order: 30, component: TrackingCard });
