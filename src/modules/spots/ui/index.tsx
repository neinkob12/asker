// Oberfläche der Spots: Marker und Hotspots auf der Karte, das Spot-Panel (freischalten oder Slot für Kunden, Preise, Läufer)
// und die Spot-Liste im Tab "Geschäft". Spot gründen über die Karte ist weg (Auftrag 46d), es kommt als Shop (46e).
// Das Panel hat den Slot 'spots.spotPanel', in den andere Module Abschnitte hängen (Kunden, Preise, Läufer …).

import { clock, formatEuro, formatPercent } from '../../../core';
import { isMobile, mapEffects, registerMapLayer } from '../../../map';
import {
  Disclosure,
  Group,
  Icon,
  ItemContent,
  List,
  ListItem,
  LockedWidget,
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
import { activeCity, cityName, isBusinessSold } from '../../city';
import { getSalesStats, playerSpot, waitingAt } from '../../customers';
import { formatProductAmount, getWarehouses } from '../../goods';
import { activeRunnerAt } from '../../staff';
import { tutorialLockText } from '../../tutorial';
import { veedelName } from '../../veedel';
import {
  customSpots,
  getSpot,
  getSpots,
  isKneipe,
  isSpotActive,
  isSpotOpen,
  KNEIPE,
  lockedSpots,
  MAX_CUSTOM_SPOTS,
  SPOT_TYPES,
  type SpotType,
  spotCity,
  spotHoursLabel,
  spotOpensAt,
  unlockCostOf,
} from '../index';
import { recordSaleGlow, recordSpotRaid, syncSpotGlow } from './glow';
import { SpotManage } from './manage';
import { spotsLayer } from './map';
import { peopleLayer } from './people';
import './spots.css';

declare module '../../../ui' {
  interface PanelRegistry {
    'spots.spot': { spotId: string };
    /** Shop-Platzhalter „Spot gründen“ (Auftrag 46e). */
    'spots.shop': Record<string, never>;
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

/** „zu, öffnet in 3 Std.“ bzw. „zu, öffnet Fr 22 Uhr“ (Auftrag 43, L1). */
function closedLabel(spot: Parameters<typeof spotOpensAt>[0], time: number): string {
  const at = spotOpensAt(spot, time);
  if (at === null) return 'zu';
  const minutes = at - time;
  return minutes < 24 * 60
    ? `zu, öffnet in ${clock.formatDuration(minutes)}`
    : `zu, öffnet ${clock.weekdayName(at, true)} ${clock.hour(at)} Uhr`;
}

function SpotPanel(props: { spotId: string }) {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const spot = getSpot(state, props.spotId);
  if (!spot) return null;
  const active = isSpotActive(state, spot.id);
  const waiting = waitingAt(state, spot.id).length;
  const cost = unlockCostOf(state, spot);
  return (
    <div class="spot-panel" data-tour="spot.panel">
      <SummaryTiles
        items={[
          { icon: 'smile', color: waiting > 0 ? 'warn' : 'money', value: waiting, label: 'warten' },
          // „Kaufkraft“ statt „Preise“: Weiter unten steht die Gruppe „Preise“ mit deinen eigenen Preisen.
          { icon: 'tag', color: 'money', value: formatPercent(spot.priceMultiplier), label: 'Kaufkraft' },
          { icon: 'users', color: 'people', value: formatPercent(spot.demand), label: 'Andrang' },
        ]}
      />
      {/* J15: „Preise 90 %“ stand ohne Erklärung da. */}
      <Disclosure label="Was heißen Kaufkraft und Andrang?">
        Kaufkraft {formatPercent(spot.priceMultiplier)}: was die Kunden hier zahlen, gemessen am Richtpreis des Veedels
        (100 %){spot.priceMultiplier > 1 ? ', hier also mehr' : spot.priceMultiplier < 1 ? ', hier also weniger' : ''}.
        Andrang {formatPercent(spot.demand)}: wie viele Kunden kommen, gemessen an einem gewöhnlichen Spot (100 %).
      </Disclosure>
      <List>
        <ListItem onClick={() => ui.openPanel('veedel.veedel', { veedelId: spot.veedelId })}>
          <ItemContent
            icon="map"
            color="place"
            title={veedelName(spot.veedelId)}
            meta="Veedel"
            tags={[
              spot.custom && { label: 'eigener Spot', icon: 'pinPlus', color: 'brand' },
              // Öffnungszeiten auch für feste Spots mit Wochenzeiten (Berliner Clubs, Auftrag 43, L1).
              !isKneipe(spot) &&
                (!!spot.custom || !!spot.weekHours) &&
                !!spotHoursLabel(spot) && { label: spotHoursLabel(spot) ?? '', icon: 'clock', color: 'system' },
              !isKneipe(spot) &&
                !isSpotOpen(spot, state.time) && { label: closedLabel(spot, state.time), color: 'system' },
              isKneipe(spot) && { label: `Kneipe ${KNEIPE.from}–${KNEIPE.to} Uhr`, icon: 'beer', color: 'goods' },
              isKneipe(spot) &&
                !isSpotOpen(spot, state.time) && { label: closedLabel(spot, state.time), color: 'system' },
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
        <>
          <Slot name="spots.spotPanel" props={{ spotId: spot.id }} />
          <SpotManage spotId={spot.id} />
        </>
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

/**
 * Shop (Feedback 13.10.2026): Spot gründen gegen Schwarzgeld. Eine Kachel je Art, die man selbst gründen kann; ein Tipp
 * fragt auf der Karte nach dem Ort und gründet dort. Die Spots selbst stehen in den Veedel-Seiten der Reviere.
 */
function ShopPanel() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const used = customSpots(state).length;
  const full = used >= MAX_CUSTOM_SPOTS;
  const locked = tutorialLockText(state, 'spots.found');
  const kinds = (Object.values(SPOT_TYPES) as SpotType[]).filter((t) => t.foundable);
  const found = async (type: SpotType) => {
    const pos = await ui.pickLocation(`Wo soll ${type.name} hin? (${formatEuro(type.foundCost)})`);
    if (!pos) return;
    dispatch({ type: 'spots.found', payload: { lng: pos.lng, lat: pos.lat, kind: type.id } });
  };
  return (
    <div class="spot-shop">
      <Group
        title="Spot gründen"
        icon="pinPlus"
        color="place"
        value={`${used} von ${MAX_CUSTOM_SPOTS}`}
        note={
          locked ??
          (full
            ? `Mehr als ${MAX_CUSTOM_SPOTS} eigene Spots kannst du nicht halten.`
            : 'Tipp auf eine Art, dann auf die Stelle in einem Veedel.')
        }
      >
        <div class="spot-shop__tiles">
          {kinds.map((type) => (
            <button
              key={type.id}
              type="button"
              class="spot-shop__tile"
              disabled={!!locked || full || state.wallet.dirty < type.foundCost}
              onClick={() => found(type)}
            >
              <span class="spot-shop__icon">
                <Icon name={type.icon} size={22} />
              </span>
              <strong>{type.name}</strong>
              <span class="spot-shop__text">{type.description}</span>
              <span class="spot-shop__price">{formatEuro(type.foundCost)}</span>
            </button>
          ))}
        </div>
      </Group>
    </div>
  );
}

/** Shop als kleines Widget oben links auf dem Startbildschirm (wo vorher der Rang stand). */
function ShopWidget() {
  const { state } = useGame();
  const ui = useUi();
  if (isBusinessSold(state)) return null;
  const locked = tutorialLockText(state, 'spots.found');
  if (locked) return <LockedWidget icon="bag" label="Shop" hint={locked} />;
  return (
    <button
      type="button"
      class="phone-widget phone-stat phone-shop"
      style={{ '--stat-accent': 'var(--home-place)' }}
      onClick={() => ui.openPanel('spots.shop', {})}
      title="Shop: eigene Spots gründen"
    >
      <span class="phone-widget__label">
        <Icon name="bag" size={12} /> Shop
      </span>
      <span class="phone-shop__icon" aria-hidden="true">
        <Icon name="pinPlus" size={26} />
      </span>
      <span class="phone-stat__sub">Spot gründen</span>
    </button>
  );
}

registerPanel({
  id: 'spots.spot',
  title: (props, state) => getSpot(state, props.spotId)?.name ?? 'Spot',
  component: SpotPanel,
});
registerPanel({ id: 'spots.shop', title: () => 'Shop', component: ShopPanel });
registerSlot('phone.home', { id: 'spots.shop', order: 5, component: ShopWidget });
registerMapLayer(spotsLayer);
registerMapLayer(peopleLayer);

// Geld-Popup am Spot bei jedem Straßenverkauf, und der Hotspot leuchtet eine Weile stärker.
onGameEvent('sale.completed', 'spots.moneyFx', (p, _ui, state) => {
  const spot = p.spotId ? getSpot(state, p.spotId) : undefined;
  if (!spot) return;
  syncSpotGlow(state);
  recordSaleGlow(spot.id, state.time);
  mapEffects.money(spot, p.revenue, { caption: formatProductAmount(p.productId, p.amount) });
});

// Nach einer Razzia an einem Spot wird sein Marker eine Weile blau.
onGameEvent('police.raid', 'spots.raidLook', (p, _ui, state) => {
  if (!p.spotId || p.empty) return;
  syncSpotGlow(state);
  recordSpotRaid(p.spotId, state.time);
});

// Empfehlungen und Suche
// Erster Spot in einer neuen Stadt (Auftrag 43, G6): Ohne offenen Spot gibt es keine Kunden. Erst mit Lager, damit es
// Ware zu verkaufen gibt; der günstigste zuerst.
registerAdvisor({
  id: 'spots.firstSpot',
  advise: (state) => {
    const city = activeCity(state);
    if (isBusinessSold(state) || getSpots(state, city).length > 0 || getWarehouses(state, city).length === 0)
      return null;
    // Der beste, den du dir leisten kannst (Andrang je Euro), sonst der günstigste (Auftrag 43, L9: in Berlin war der
    // billigste ein schwacher Spot mit 80 % Andrang, der Kotti mit 160 % kostete nur das Doppelte).
    const candidates = lockedSpots(state).filter((s) => spotCity(s) === city);
    // Höchstens die Hälfte des Geldes, damit noch Ware drin ist.
    const costOf = (s: { id: string; unlockCost?: number }) => unlockCostOf(state, s);
    const affordable = candidates.filter((s) => costOf(s) <= state.wallet.dirty / 2);
    const spot =
      [...affordable].sort((a, b) => b.demand - a.demand || costOf(a) - costOf(b))[0] ??
      [...candidates].sort((a, b) => costOf(a) - costOf(b))[0];
    if (!spot) return null;
    const cost = costOf(spot);
    return {
      id: 'spots.firstSpot',
      priority: 68,
      icon: 'pin',
      title: `Ersten Spot in ${cityName(city)} freischalten`,
      text: `Ohne Spot keine Kunden. Ein guter Anfang: ${spot.name} (Andrang ${formatPercent(spot.demand)}).`,
      ...(cost ? { cost } : {}),
      actionLabel: 'Zum Spot',
      target: { lng: spot.lng, lat: spot.lat },
      action: (ui) => {
        ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
        ui.openPanel('spots.spot', { spotId: spot.id });
      },
    };
  },
});

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
      // Ort zuerst: In den Mitteilungen bleibt so der Ort stehen, auch wenn der Rest gekürzt wird (J5).
      const title = `${spot.name}: ${most} ${most === 1 ? 'Kunde wartet' : 'Kunden warten'}`;
      // Feedback 13.10.2026: Bedient wird nur mit einem Tipp auf den Spot, der Rat führt nur hin.
      return {
        id: 'spots.waiting',
        priority: 85,
        icon: 'smile',
        title,
        text: 'Tipp auf den Spot, dann bedienst du den Nächsten. Oder stell einen Läufer hin.',
        actionLabel: 'Zum Spot',
        highlight: '.spot-marker',
        target: { lng: spot.lng, lat: spot.lat },
        action: (ui) => {
          if (isMobile()) ui.closePhone();
          ui.flyTo({ lng: spot.lng, lat: spot.lat }, 16);
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
  // Nur die Spots der Stadt, in der du bist (Auftrag 43: in Rotterdam standen die Kölner).
  items: (state) =>
    getSpots(state, activeCity(state)).map((spot) => ({
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
