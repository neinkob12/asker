// Boss von Deutschland und Verkauf (Auftrag 40): Solange Jansens Angebot steht, eine Glas-Karte unter Geld und Heat;
// ein Tipp öffnet die Seite „Verkauf“ mit der Rechnung (Tagesgewinn, Preis der Statthalter, Rotterdam, was bleibt).
// Nach dem Verkauf der große Moment über der Karte („Verkauft“), dann geht es nach Rotterdam.

import { formatEuro } from '../../../core';
import {
  Button,
  Group,
  Icon,
  IconChip,
  ItemContent,
  List,
  ListItem,
  MapDialog,
  onGameEvent,
  registerAdvisor,
  registerDialog,
  registerHudItem,
  registerPanel,
  SummaryTiles,
  useGame,
  useUi,
} from '../../../ui';
import { cityReport } from '../../finance';
import { ROTTERDAM_SHARE, SALE_PROFIT_DAYS } from '../config';
import {
  cityName,
  isBusinessSold,
  jansenContact,
  ownedCities,
  saleBlocker,
  saleOffer,
  saleRecord,
  saleStatus,
} from '../index';

declare module '../../../ui' {
  interface PanelRegistry {
    'city.sale': Record<string, never>;
  }
  interface DialogRegistry {
    'city.sold': { price: number; rotterdamPrice: number };
  }
}

/** Steht Jansens Angebot (Anruf war da, noch nicht verkauft)? */
function offerOpen(status: string): boolean {
  return status === 'calling' || status === 'later';
}

/** Karte unter Geld und Heat: Jansen wartet, mit dem Preis. */
function SaleWaits() {
  const { state } = useGame();
  const ui = useUi();
  if (!offerOpen(saleStatus(state))) return null;
  const offer = saleOffer(state);
  const contact = jansenContact(state);
  return (
    <button
      type="button"
      class="city-hud"
      onClick={() => ui.openPanel('city.sale', {})}
      aria-label={`Verkauf: ${formatEuro(offer.price)}. Rechnung öffnen`}
    >
      <span class="hud-label is-city">{contact.name} · Rotterdam</span>
      <span class="city-hud__main">
        <IconChip icon="handshake" color="brand" size="md" />
        <span class="city-hud__text">
          <strong>Verkaufen für {formatEuro(offer.price)}</strong>
          <span class="city-hud__hint">Rotterdam kostet {formatEuro(offer.rotterdamPrice)}.</span>
          <span class="city-hud__action">Rechnung ansehen</span>
        </span>
        <Icon name="chevronRight" class="city-hud__go" />
      </span>
    </button>
  );
}

registerHudItem({ id: 'city.saleWaits', order: 44, placement: 'below', icon: 'handshake', component: SaleWaits });

/** Seite „Verkauf“: die Rechnung und die Entscheidung. */
function SalePanel() {
  const { state, dispatch } = useGame();
  const ui = useUi();
  const record = saleRecord(state);
  if (record) {
    return (
      <div class="city-sale">
        <SummaryTiles
          items={[
            { icon: 'handshake', color: 'money', value: formatEuro(record.price), label: 'Verkauft' },
            { icon: 'anchor', color: 'place', value: formatEuro(record.rotterdamPrice), label: 'Rotterdam' },
            {
              icon: 'moneyBag',
              color: 'dirty',
              value: formatEuro(record.price - record.rotterdamPrice),
              label: 'Geblieben',
            },
          ]}
        />
        <Group title="Deine alten Städte" icon="building" color="place" note="Sie sind jetzt deine Kunden.">
          <List>
            {record.cities.map((id) => (
              <ListItem key={id}>
                <ItemContent icon="building" color="place" title={cityName(id)} />
              </ListItem>
            ))}
          </List>
        </Group>
      </div>
    );
  }
  const offer = saleOffer(state);
  const blocked = saleBlocker(state);
  return (
    <div class="city-sale">
      <SummaryTiles
        items={[
          { icon: 'handshake', color: 'money', value: formatEuro(offer.price), label: 'Statthalter zahlen' },
          { icon: 'anchor', color: 'place', value: formatEuro(offer.rotterdamPrice), label: 'Rotterdam' },
          { icon: 'moneyBag', color: 'dirty', value: formatEuro(offer.rest), label: 'Bleibt dir' },
        ]}
      />
      <Group
        title="Tagesgewinn deiner Städte"
        icon="chart"
        color="money"
        value={formatEuro(offer.dailyProfit)}
        note={`Der Preis: ${SALE_PROFIT_DAYS} Tagesgewinne, Schnitt der letzten sieben Tage.`}
        more={`Gezählt wird das Ergebnis jeder Stadt vor dem Anteil der Statthalter, ohne einmaligen Ausbau. Rotterdam kostet ${Math.round(ROTTERDAM_SHARE * 100)} Prozent davon: Liegeplatz, Halle, Jansens Leute und Kunden. Dein Konto bleibt, wie es ist.`}
      >
        <List>
          {ownedCities(state).map((id) => {
            const r = cityReport(state, id, 7, 1);
            const share = r.rows.find((row) => row.category === 'share.righthand')?.amount ?? 0;
            const expansion = r.rows.find((row) => row.category === 'expansion')?.amount ?? 0;
            const perDay = Math.round((r.profit - share - expansion) / 7);
            return (
              <ListItem key={id} value={formatEuro(perDay)}>
                <ItemContent icon="building" color="place" title={cityName(id)} />
              </ListItem>
            );
          })}
        </List>
      </Group>
      <Group title="Danach" icon="ship" color="goods" note="Lieferant für alle, vom Hafen in Rotterdam aus.">
        <List>
          <ListItem>
            <ItemContent icon="users" color="people" title="Deine Städte werden Kunden" />
          </ListItem>
          <ListItem>
            <ItemContent icon="boxes" color="goods" title="Container aus Marokko, Spanien, Albanien" />
          </ListItem>
          <ListItem>
            <ItemContent icon="anchor" color="law" title="Der Zoll ist der Gegner" />
          </ListItem>
        </List>
      </Group>
      <div class="city-sale__actions">
        <Button
          variant="primary"
          wide
          big
          icon="handshake"
          disabled={blocked !== null}
          onClick={() => {
            if (dispatch({ type: 'city.sell', payload: {} }).ok) ui.closePanel();
          }}
        >
          Verkaufen und nach Rotterdam
        </Button>
        {blocked ? (
          <p class="city-sale__note">{blocked}</p>
        ) : (
          <Button wide onClick={() => dispatch({ type: 'city.postponeSale', payload: {} })}>
            Noch nicht
          </Button>
        )}
      </div>
    </div>
  );
}

registerPanel({ id: 'city.sale', title: () => 'Verkauf', component: SalePanel });

/** Der große Moment: verkauft. */
function SoldDialog(props: { price: number; rotterdamPrice: number }) {
  const ui = useUi();
  const close = () => ui.closeDialog();
  return (
    <MapDialog label="Verkauft" onClose={close} class="city-sold" scrim="none" detent="large">
      <div class="city-sold__glow" aria-hidden="true" />
      <p class="city-sold__kicker">Boss von Deutschland</p>
      <h2 class="city-sold__name">Verkauft</h2>
      <p class="city-sold__line">
        Deine Statthalter führen die Städte weiter. Ab jetzt sind sie deine Kunden, und du lieferst aus Rotterdam.
      </p>
      <div class="city-sold__bar">
        <div class="city-sold__stat">
          <span class="city-sold__label is-money">Verkauf</span>
          <strong>{formatEuro(props.price)}</strong>
        </div>
        <div class="city-sold__stat">
          <span class="city-sold__label is-place">Rotterdam</span>
          <strong>−{formatEuro(props.rotterdamPrice)}</strong>
        </div>
        <div class="city-sold__stat">
          <span class="city-sold__label is-brand">Startkapital</span>
          <strong>{formatEuro(props.price - props.rotterdamPrice)}</strong>
        </div>
        <button type="button" class="city-sold__next" onClick={close}>
          Nach Rotterdam
        </button>
      </div>
    </MapDialog>
  );
}

registerDialog({ id: 'city.sold', component: SoldDialog, area: 'map', pausesGame: true, lockPhone: false });

onGameEvent('business.sold', 'city.sold', (payload, ui) => {
  ui.openDialog('city.sold', { price: payload.price, rotterdamPrice: payload.rotterdamPrice });
});

/** Rat ganz oben: Jansen wartet auf eine Antwort. */
registerAdvisor({
  id: 'city.sale',
  advise(state) {
    if (!offerOpen(saleStatus(state)) || isBusinessSold(state)) return null;
    return {
      id: 'city.sale',
      priority: 75,
      icon: 'handshake',
      title: `Verkaufen für ${formatEuro(saleOffer(state).price)}`,
      action: (ui) => ui.openPanel('city.sale', {}),
    };
  },
});
