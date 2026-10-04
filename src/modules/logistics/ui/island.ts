// Dynamic Island: Ware am Kai (mit Zeit bis zum Zoll-Risiko) und Fahrten unterwegs (auch Routen über die A1, Auftrag
// 30), Kontrollen ganz oben.

import { clock } from '../../../core';
import { islandCountdown, type LiveActivity, onGameEvent, registerLiveActivity } from '../../../ui';
import { formatProductAmount, productName } from '../../goods';
import {
  cargoRisk,
  cargoRiskFrom,
  getCargo,
  getTrips,
  isInterCityTrip,
  placeOf,
  tripAmount,
  tripProgress,
} from '../index';

registerLiveActivity({
  id: 'logistics',
  activities: (state) => {
    const cargo = getCargo(state).map((c): LiveActivity => {
      const risky = cargoRisk(state, c) === 'risky';
      return {
        id: `logistics.cargo.${c.id}`,
        priority: risky ? 80 : 66,
        icon: 'ship',
        tone: risky ? 'bad' : 'warn',
        leading: 'Hafen',
        trailing: risky ? 'Zoll!' : islandCountdown(cargoRiskFrom(c, state) - state.time),
        title: `${formatProductAmount(c.productId, c.amount)} ${productName(c.productId)} am Kai`,
        detail: risky
          ? 'Der Zoll kann sie jederzeit finden'
          : `Sicher bis ${clock.formatTime(cargoRiskFrom(c, state))}`,
        open: (ui) => ui.openPanel('logistics.port', {}),
      };
    });
    // Geplante Nachtfahrten stehen noch nicht in der Island (Auftrag 33), erst wenn sie losfahren.
    const trips = getTrips(state)
      .filter((trip) => trip.status !== 'planned')
      .map((trip): LiveActivity => {
        const stopped = trip.status === 'stopped';
        // Am vollen Lager steht die Fahrt (Auftrag 33): keine Restzeit, sondern "voll".
        const waiting = trip.status === 'waiting';
        const to = placeOf(state, trip.toId)?.name ?? 'Lager';
        const interCity = isInterCityTrip(state, trip);
        return {
          id: `logistics.trip.${trip.id}`,
          priority: stopped ? 88 : 54,
          icon: stopped ? 'siren' : 'truck',
          tone: stopped ? 'bad' : 'info',
          leading: stopped ? (interCity ? 'Zoll' : 'Kontrolle') : interCity ? 'A1' : 'Fahrt',
          trailing: stopped ? '!' : waiting ? 'voll' : islandCountdown(trip.arrivesAt - state.time),
          title:
            trip.kind === 'pickup'
              ? `Abholung am Hafen → ${to}`
              : trip.kind === 'route'
                ? `${interCity ? 'A1' : 'Route'} → ${to}`
                : `Umlagern → ${to}`,
          detail: waiting
            ? `${tripAmount(trip)} Einheiten warten, das Lager ist voll`
            : `${tripAmount(trip)} Einheiten`,
          progress: tripProgress(state, trip).total,
          open: (ui) => ui.openPanel(trip.kind === 'route' ? 'logistics.routes' : 'logistics.port', {}),
        };
      });
    return [...cargo, ...trips];
  },
});

onGameEvent('cargo.docked', 'logistics.island', (_payload, ui) =>
  ui.pulseIsland({ icon: 'ship', tone: 'accent', text: 'Schiff im Hafen' }),
);
