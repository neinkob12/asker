// Oberfläche der Spots: Marker auf der Karte, das Spot-Panel (freischalten oder Slot für Kunden, Preise, Läufer)
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
  registerPanel,
  registerSlot,
  Slot,
  useGame,
  useUi,
} from '../../../ui';
import { waitingAt } from '../../customers';
import { formatProductAmount } from '../../goods';
import { veedelName } from '../../veedel';
import { customSpots, FOUND_SPOT_COST, getSpot, getSpots, isSpotActive, lockedSpots, MAX_CUSTOM_SPOTS } from '../index';
import { spotsLayer } from './map';
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
    <Card title="Spots">
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

// Geld-Popup am Spot bei jedem Straßenverkauf.
onGameEvent('sale.completed', 'spots.moneyFx', (p, _ui, state) => {
  const spot = p.spotId ? getSpot(state, p.spotId) : undefined;
  if (spot) mapEffects.money(spot, p.revenue, { caption: formatProductAmount(p.productId, p.amount) });
});
