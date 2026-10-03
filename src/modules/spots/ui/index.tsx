// Oberfläche der Spots: Marker und Hotspots auf der Karte, das Spot-Panel (freischalten oder Slot für Kunden, Preise, Läufer)
// und die Spot-Liste im Tab "Geschäft" mit "Eigenen Spot gründen" per Klick auf die Karte.
// Das Panel hat den Slot 'spots.spotPanel', in den andere Module Abschnitte hängen (Kunden, Preise, Läufer …).

import { formatEuro, formatPercent } from '../../../core';
import { mapEffects, registerMapLayer } from '../../../map';
import {
  Card,
  ContextMenu,
  Disclosure,
  Group,
  ItemContent,
  List,
  ListItem,
  onGameEvent,
  registerAdvisor,
  registerPanel,
  registerSearch,
  registerSlot,
  Slot,
  SummaryTiles,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity } from '../../city';
import { getSalesStats, isPlayerAway, playerSpot, waitingAt } from '../../customers';
import { formatProductAmount } from '../../goods';
import { activeRunnerAt } from '../../staff';
import { veedelName } from '../../veedel';
import {
  customSpots,
  FOUND_SPOT_COST,
  getAllSpots,
  getSpot,
  getSpots,
  isKneipe,
  isSpotActive,
  isSpotOpen,
  KNEIPE,
  lockedSpots,
  MAX_CUSTOM_SPOTS,
  spotCity,
} from '../index';
import { recordSaleGlow, recordSpotRaid, spotsLayer } from './map';
import { peopleLayer } from './people';
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

/**
 * Spot-Seite im Handy: oben die Kennzahlen (wer wartet, Preisniveau, Andrang) und wo der Spot liegt, darunter die
 * Abschnitte der anderen Module als Gruppen (Selbst verkaufen, Kundschaft, Preise, Personal …).
 */
function SpotPanel(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const spot = getSpot(state, props.spotId);
  if (!spot) return null;
  const active = isSpotActive(state, spot.id);
  const waiting = waitingAt(state, spot.id).length;
  const cost = spot.unlockCost ?? 0;
  return (
    <div class="spot-panel">
      <SummaryTiles
        items={[
          { icon: 'smile', color: waiting > 0 ? 'warn' : 'money', value: waiting, label: 'warten' },
          { icon: 'tag', color: 'money', value: formatPercent(spot.priceMultiplier), label: 'Preise' },
          { icon: 'users', color: 'people', value: formatPercent(spot.demand), label: 'Andrang' },
        ]}
      />
      <List>
        <ListItem onClick={() => ui.openPanel('veedel.veedel', { veedelId: spot.veedelId })}>
          <ItemContent
            icon="map"
            color="place"
            title={veedelName(spot.veedelId)}
            meta="Veedel"
            tags={[
              spot.custom && { label: 'eigener Spot', icon: 'pinPlus', color: 'brand' },
              isKneipe(spot) && { label: `Kneipe ${KNEIPE.from}–${KNEIPE.to} Uhr`, icon: 'beer', color: 'goods' },
              isKneipe(spot) && !isSpotOpen(spot, state.time) && { label: 'zu', color: 'system' },
            ]}
          />
        </ListItem>
      </List>
      {isKneipe(spot) && (
        <Disclosure label="Was ist anders in der Kneipe?" icon="beer">
          Offen von {KNEIPE.from} bis {KNEIPE.to} Uhr. Weniger Laufkundschaft, dafür werden Gäste doppelt so oft zu
          Stammkunden, und sie schauen weniger auf den Preis. Der Ruf zählt hier doppelt, im Guten wie im Schlechten.
        </Disclosure>
      )}
      {active ? (
        <Slot name="spots.spotPanel" props={{ spotId: spot.id }} />
      ) : (
        <Group
          title="Noch nicht deiner"
          icon="lock"
          color="brand"
          note="Hier verkauft noch niemand für dich. Mit ein paar Kontakten vor Ort gehört der Platz dir."
        >
          <List>
            <ListItem
              action
              disabled={state.wallet.dirty < cost}
              value={formatEuro(cost)}
              onClick={() => dispatch({ type: 'spots.unlock', payload: { spotId: spot.id } })}
            >
              <ItemContent
                icon="unlock"
                color="brand"
                title="Freischalten"
                meta={state.wallet.dirty < cost ? `Dir fehlen ${formatEuro(cost - state.wallet.dirty)}` : undefined}
              />
            </ListItem>
          </List>
        </Group>
      )}
    </div>
  );
}

function SpotsSection() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const spots = getSpots(state, activeCity(state));
  const locked = lockedSpots(state).filter((s) => spotCity(s) === activeCity(state));
  const canFound = customSpots(state).length < MAX_CUSTOM_SPOTS;
  const waiting = spots.reduce((sum, s) => sum + waitingAt(state, s.id).length, 0);
  const mine = playerSpot(state);
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
      <Group
        title="Deine Spots"
        icon="pin"
        color="place"
        count={spots.length}
        note={
          locked.length > 0
            ? `${locked.length} weitere Spots kannst du freischalten (grau auf der Karte, ab ${formatEuro(Math.min(...locked.map((s) => s.unlockCost ?? 0)))}).`
            : undefined
        }
      >
        <List>
          {spots.map((s) => {
            const count = waitingAt(state, s.id).length;
            return (
              <ContextMenu
                key={s.id}
                label={`Aktionen für ${s.name}`}
                actions={[
                  { label: 'Öffnen', icon: 'pin', onSelect: () => ui.openPanel('spots.spot', { spotId: s.id }) },
                  {
                    label: mine === s.id ? 'Weggehen' : 'Hier hinstellen',
                    icon: 'runner',
                    onSelect: () =>
                      dispatch({ type: 'customers.standAt', payload: { spotId: mine === s.id ? null : s.id } }),
                  },
                  {
                    label: 'Auf der Karte zeigen',
                    icon: 'target',
                    onSelect: () => ui.flyTo({ lng: s.lng, lat: s.lat }, 16),
                  },
                ]}
              >
                <ListItem onClick={() => ui.openPanel('spots.spot', { spotId: s.id })} value={`${count} warten`}>
                  <ItemContent
                    icon={mine === s.id ? 'runner' : 'pin'}
                    color={mine === s.id ? 'brand' : count > 0 ? 'warn' : 'place'}
                    title={s.name}
                    meta={veedelName(s.veedelId)}
                    tags={[mine === s.id && { label: 'du stehst hier', icon: 'runner', color: 'brand' }]}
                  />
                </ListItem>
              </ContextMenu>
            );
          })}
        </List>
      </Group>
      <List>
        <ListItem
          action
          disabled={!canFound || state.wallet.dirty < FOUND_SPOT_COST}
          value={formatEuro(FOUND_SPOT_COST)}
          onClick={found}
        >
          <ItemContent
            icon="pinPlus"
            color="brand"
            title="Eigenen Spot gründen"
            meta={canFound ? 'Klick auf die Karte, wo er hin soll' : `Höchstens ${MAX_CUSTOM_SPOTS} eigene Spots`}
          />
        </ListItem>
      </List>
    </Card>
  );
}

registerPanel({
  id: 'spots.spot',
  title: (props, state) => getSpot(state, props.spotId)?.name ?? 'Spot',
  component: SpotPanel,
});
registerSlot('tab:territory', { id: 'spots.list', title: 'Spots', order: 10, component: SpotsSection });
registerMapLayer(spotsLayer);
registerMapLayer(peopleLayer);

// Geld-Popup am Spot bei jedem Straßenverkauf, und der Hotspot leuchtet eine Weile stärker.
onGameEvent('sale.completed', 'spots.moneyFx', (p, _ui, state) => {
  const spot = p.spotId ? getSpot(state, p.spotId) : undefined;
  if (!spot) return;
  recordSaleGlow(spot.id, state.time);
  mapEffects.money(spot, p.revenue, { caption: formatProductAmount(p.productId, p.amount) });
});

// Nach einer Razzia an einem Spot wird sein Schild eine Weile blau.
onGameEvent('police.raid', 'spots.raidLook', (p, _ui, state) => {
  if (p.spotId && !p.empty) recordSpotRaid(p.spotId, state.time);
});

// Empfehlungen und Suche
registerAdvisor({
  id: 'spots.sell',
  advise: (state) => {
    const spots = getSpots(state);
    // Wo niemand verkauft (kein Läufer, du stehst nicht da), zählen die Wartenden.
    const mine = playerSpot(state);
    let busiest: (typeof spots)[number] | undefined;
    let most = 0;
    for (const spot of spots) {
      if (spot.id === mine || activeRunnerAt(state, spot.id)) continue;
      const count = waitingAt(state, spot.id).length;
      if (count > most) {
        most = count;
        busiest = spot;
      }
    }
    if (busiest) {
      const spot = busiest;
      const title = `${most} ${most === 1 ? 'Kunde wartet' : 'Kunden warten'} am ${spot.name}`;
      // Stehst du noch nirgends: hinstellen, dann verkaufst du dort automatisch. Sonst sofort alle bedienen.
      if (!mine && !isPlayerAway(state)) {
        return {
          id: 'spots.waiting',
          priority: 85,
          icon: 'smile',
          title,
          text: 'Stell dich hin, dann verkaufst du dort automatisch, bis du weggehst.',
          actionLabel: 'Hinstellen',
          highlight: '.spot-marker',
          target: { lng: spot.lng, lat: spot.lat },
          action: (ui) => {
            ui.dispatch({ type: 'customers.standAt', payload: { spotId: spot.id } });
            ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
          },
        };
      }
      return {
        id: 'spots.waiting',
        priority: 85,
        icon: 'smile',
        title,
        text: 'Einmal kurz rüber und alle bedienen, oder einen Läufer hinstellen.',
        actionLabel: 'Verkaufen',
        highlight: '.spot-marker',
        target: { lng: spot.lng, lat: spot.lat },
        action: (ui) => {
          const result = ui.dispatch({ type: 'customers.serveAll', payload: { spotId: spot.id } });
          if (!result.ok) ui.openPanel('spots.spot', { spotId: spot.id });
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
        text: `Stell dich an einen Spot, zum Beispiel ${first.name}. Kommen Kunden, verkaufst du automatisch.`,
        actionLabel: 'Hinstellen',
        highlight: '.spot-marker',
        target: { lng: first.lng, lat: first.lat },
        action: (ui) => {
          if (!mine) ui.dispatch({ type: 'customers.standAt', payload: { spotId: first.id } });
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
