// Oberfläche der Spots: Marker und Hotspots auf der Karte, das Spot-Panel (freischalten oder Slot für Kunden, Preise, Läufer)
// und die Spot-Liste im Tab "Geschäft" mit "Eigenen Spot gründen" per Klick auf die Karte.
// Das Panel hat den Slot 'spots.spotPanel', in den andere Module Abschnitte hängen (Kunden, Preise, Läufer …).

import { formatEuro, formatPercent } from '../../../core';
import { mapEffects, registerMapLayer } from '../../../map';
import {
  Button,
  Card,
  Hint,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerPanel,
  registerSearch,
  registerSlot,
  Slot,
  useGame,
  useUi,
} from '../../../ui';
import { getSalesStats, waitingAt } from '../../customers';
import { formatProductAmount } from '../../goods';
import { veedelName } from '../../veedel';
import {
  customSpots,
  FOUND_SPOT_COST,
  getAllSpots,
  getSpot,
  getSpots,
  isSpotActive,
  lockedSpots,
  MAX_CUSTOM_SPOTS,
} from '../index';
import { recordSaleGlow, spotsLayer } from './map';
import './spots.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'spots.spot': { spotId: string };
  }
  interface SlotRegistry {
    /** Abschnitte im Spot-Panel (nur bei offenen Spots). */
    'spots.spotPanel': { spotId: string };
  }
}

function SpotPanel(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const spot = getSpot(state, props.spotId);
  if (!spot) return null;
  const active = isSpotActive(state, spot.id);
  return (
    <div class="spot-panel">
      <p class="ui-hint">
        {veedelName(spot.veedelId)} · Preisniveau {formatPercent(spot.priceMultiplier)}, Andrang{' '}
        {formatPercent(spot.demand)}
        {spot.custom ? ' · eigener Spot' : ''}
      </p>
      {active ? (
        <Slot name="spots.spotPanel" props={{ spotId: spot.id }} />
      ) : (
        <div class="spot-locked">
          <p>Hier verkauft noch niemand für dich. Mit ein paar Kontakten vor Ort gehört der Platz dir.</p>
          <Button
            variant="primary"
            wide
            disabled={state.wallet.dirty < (spot.unlockCost ?? 0)}
            onClick={() => dispatch({ type: 'spots.unlock', payload: { spotId: spot.id } })}
          >
            Freischalten ({formatEuro(spot.unlockCost ?? 0)})
          </Button>
        </div>
      )}
    </div>
  );
}

function SpotsSection() {
  const { state } = useGame();
  const ui = useUi();
  const spots = getSpots(state);
  const locked = lockedSpots(state);
  const canFound = customSpots(state).length < MAX_CUSTOM_SPOTS;
  const waiting = spots.reduce((sum, s) => sum + waitingAt(state, s.id).length, 0);
  const found = async () => {
    const pos = await ui.pickLocation(
      `Klick auf die Karte, wo dein neuer Spot hin soll (${formatEuro(FOUND_SPOT_COST)}).`,
    );
    if (!pos) return;
    const result = ui.dispatch({ type: 'spots.found', payload: { lng: pos.lng, lat: pos.lat } });
    if (result.ok) {
      const spotId = (result.data as { spotId: string }).spotId;
      ui.toast('Neuer Spot gegründet.', 'good');
      ui.openPanel('spots.spot', { spotId });
    }
  };
  return (
    <Card
      title="Spots"
      icon="pin"
      color="place"
      status={waiting > 0 ? 'warn' : 'good'}
      summary={waiting > 0 ? `${waiting} warten` : `${spots.length} aktiv`}
    >
      <List>
        {spots.map((s) => (
          <ListItem
            key={s.id}
            onClick={() => ui.openPanel('spots.spot', { spotId: s.id })}
            aside={<span class="ui-hint">{waitingAt(state, s.id).length} warten</span>}
          >
            {s.name} <span class="ui-hint">· {veedelName(s.veedelId)}</span>
          </ListItem>
        ))}
      </List>
      {locked.length > 0 && (
        <Hint>
          {locked.length} weitere Spots kannst du freischalten (grau auf der Karte, ab{' '}
          {formatEuro(Math.min(...locked.map((s) => s.unlockCost ?? 0)))}).
        </Hint>
      )}
      <Button wide disabled={!canFound || state.wallet.dirty < FOUND_SPOT_COST} onClick={found}>
        Eigenen Spot gründen ({formatEuro(FOUND_SPOT_COST)})
      </Button>
    </Card>
  );
}

registerPanel({
  id: 'spots.spot',
  title: (props, state) => getSpot(state, props.spotId)?.name ?? 'Spot',
  component: SpotPanel,
});
registerSlot('tab:business', { id: 'spots.list', order: 15, component: SpotsSection });
registerMapLayer(spotsLayer);

// Geld-Popup am Spot bei jedem Straßenverkauf, und der Hotspot leuchtet eine Weile stärker.
onGameEvent('sale.completed', 'spots.moneyFx', (p, _ui, state) => {
  const spot = p.spotId ? getSpot(state, p.spotId) : undefined;
  if (!spot) return;
  recordSaleGlow(spot.id, state.time);
  mapEffects.money(spot, p.revenue, { caption: formatProductAmount(p.productId, p.amount) });
});

// Empfehlungen und Suche
registerAdvisor({
  id: 'spots.sell',
  advise: (state) => {
    const spots = getSpots(state);
    let busiest: (typeof spots)[number] | undefined;
    let most = 0;
    for (const spot of spots) {
      const count = waitingAt(state, spot.id).length;
      if (count > most) {
        most = count;
        busiest = spot;
      }
    }
    if (busiest) {
      const spot = busiest;
      return {
        id: 'spots.waiting',
        priority: 85,
        icon: 'smile',
        title: `${most} ${most === 1 ? 'Kunde wartet' : 'Kunden warten'} am ${spot.name}`,
        text: 'Geh hin und verkaufe, bevor sie wieder gehen.',
        actionLabel: 'Hin',
        highlight: '.spot-marker',
        target: { lng: spot.lng, lat: spot.lat },
        action: (ui) => {
          ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
          ui.openPanel('spots.spot', { spotId: spot.id });
        },
      };
    }
    const first = spots[0];
    if (first && getSalesStats(state).customersServed === 0) {
      return {
        id: 'spots.firstSale',
        priority: 70,
        icon: 'pin',
        title: 'Erster Verkauf',
        text: `Tipp auf einen Spot, zum Beispiel ${first.name}. Dort warten bald Kunden.`,
        actionLabel: 'Zum Spot',
        highlight: '.spot-marker',
        target: { lng: first.lng, lat: first.lat },
        action: (ui) => {
          ui.flyTo({ lng: first.lng, lat: first.lat }, 16);
          ui.openPanel('spots.spot', { spotId: first.id });
        },
      };
    }
    return null;
  },
});

registerSearch({
  id: 'spots.search',
  label: 'Spots',
  order: 10,
  items: (state) =>
    getAllSpots(state).map((spot) => ({
      id: spot.id,
      title: spot.name,
      subtitle: veedelName(spot.veedelId),
      icon: 'pin',
      run: (ui) => {
        ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
        ui.openPanel('spots.spot', { spotId: spot.id });
      },
    })),
});
