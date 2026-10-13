// Oberfläche des Rufs: Kacheln „Ruf“ und „Reviere“ im HUD (je mit aufklappbarer Karte) und ein Abschnitt mit den
// letzten Gründen im Tab "Reviere".

import { formatNumber } from '../../../core';
import {
  Card,
  Empty,
  Group,
  HudPill,
  Icon,
  ItemContent,
  List,
  ListItem,
  LockedWidget,
  ProgressBar,
  registerHudItem,
  registerSlot,
  useGame,
  useUi,
} from '../../../ui';
import { activeCity, cityName, isBusinessSold } from '../../city';
import { campaignProgress, controlledBy, PLAYER_FACTION } from '../../territory';
import { supplierReputation } from '../../trade';
import { tutorialAllows, tutorialLockText } from '../../tutorial';
import { veedelCity, veedelName } from '../../veedel';
import { getReputation, recentReputationChanges, reputationLabel, reputationTier, reputationTiers } from '../index';
import './reputation.css';

/**
 * HUD über der Karte: Ruf (Leiste 0–100 mit den Stufen) und Reviere (Zahl der Veedel) als zwei Kacheln mit eigener
 * Farbe; in einer Kachel neben „Rang“ waren Rang und Ruf kaum zu unterscheiden. Beim Drüberfahren oder Antippen
 * klappt eine Karte auf: beim Ruf die Stufe, die darunter und die darüber mit je einem Satz, bei den Revieren die
 * eigenen Veedel. Der Knopf unten führt zu den Revieren.
 */
/**
 * Nach dem Verkauf (Auftrag 43): Ruf als Lieferant statt Ruf und Reviere (es gibt keine Veedel mehr). Pünktlich und
 * Qualität entscheiden, wie viel die Kunden bei dir bestellen.
 */
function SupplierReputationHud() {
  const { state } = useGame();
  const ui = useUi();
  const { reliability, quality } = supplierReputation(state);
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  return (
    <HudPill
      icon="star"
      color="brand"
      label="Ruf als Lieferant"
      value={`${pct(reliability)} pünktlich`}
      tone={reliability < 0.6 ? 'bad' : reliability < 0.75 ? 'warn' : undefined}
      title={`Pünktlich ${pct(reliability)}, Qualität ${pct(quality)}. Danach bestellen die Kunden bei dir.`}
      onClick={() => ui.openPhone('trade.app', { view: 'customers' })}
    />
  );
}

function ReputationHud() {
  const { state } = useGame();
  // Auftrag 46b: Im Tutorial erscheint der Ruf mit dem ersten Stammkunden.
  if (!tutorialAllows(state, 'hud.reputation')) return null;
  // Der Ruf des Spielers steht als Widget im Handy (ReputationWidget); im HUD bleibt nur der Ruf als Lieferant.
  return isBusinessSold(state) ? <SupplierReputationHud /> : null;
}

/**
 * Ruf als kleines Widget oben rechts auf dem Startbildschirm des Handys (vorher Kachel im HUD): Zahl, Stufe, Balken
 * und die nächste Stufe. Ein Tipp öffnet die Reviere (dort steht der Ruf ausführlich).
 */
function ReputationWidget() {
  const { state } = useGame();
  const ui = useUi();
  // Nach dem Verkauf zählt der Ruf als Lieferant (Kachel im HUD).
  if (isBusinessSold(state)) return null;
  const locked = tutorialLockText(state, 'hud.reputation');
  if (locked) return <LockedWidget icon="star" label="Ruf" hint={locked} data-tour="hud.reputation" />;
  const value = getReputation(state);
  // Stufe aus der gezeigten Zahl, sonst stünde bei 59,6 „60 Bekannt“ unter „ab 60: Gefragt“.
  const shown = Math.round(value);
  const tiers = reputationTiers();
  const index = tiers.indexOf(reputationTier(shown));
  const tier = tiers[index];
  // Hell für den dunklen Startbildschirm: Leute (cyan), bei schlechtem Ruf Warnung bzw. Gefahr.
  const accent = shown < 20 ? '#ff7b73' : shown < 40 ? '#ff9f0a' : '#40c8e0';
  return (
    <button
      type="button"
      class="phone-widget phone-stat"
      style={{ '--stat-accent': accent }}
      data-tour="hud.reputation"
      onClick={() => ui.selectTab('territory')}
      title={`Ruf ${shown} von 100: ${tier.name}. ${tier.effect}`}
    >
      <span class="phone-widget__label">
        <Icon name="star" size={12} /> Ruf
      </span>
      <strong class="phone-stat__value">{shown}</strong>
      <span class="phone-stat__sub">{tier.name}</span>
      <span class="phone-stat__bar" aria-hidden="true">
        <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
    </button>
  );
}

/**
 * Reviere als kleines Widget oben auf dem Startbildschirm des Handys (vorher Kachel im HUD): Veedel der aktiven Stadt
 * („7/12“), das nächste Ziel und eine Leiste. Ein Tipp öffnet die Reviere.
 */
function TerritoryWidget() {
  const { state } = useGame();
  const ui = useUi();
  // Das Widget ist der Weg in die Reviere (die App hat keine Kachel mehr). Nach dem Verkauf gibt es keine Veedel mehr;
  // im Tutorial steht es schon da, gesperrt bis zur Stufe der Reviere.
  if (isBusinessSold(state)) return null;
  const locked = tutorialLockText(state, 'app.territory');
  if (locked) return <LockedWidget icon="flag" label="Reviere" hint={locked} data-tour="hud.territory" />;
  const cityId = activeCity(state);
  const city = cityName(cityId);
  const progress = campaignProgress(state, cityId);
  const mine = controlledBy(state, PLAYER_FACTION)
    .filter((id) => veedelCity(id) === cityId)
    .map(veedelName)
    .sort();
  return (
    <button
      type="button"
      class="phone-widget phone-stat"
      // Hell wie die Bedeutungsfarbe Ort im dunklen Schema (der Startbildschirm ist immer dunkel).
      style={{ '--stat-accent': '#6ab2ff' }}
      data-tour="hud.territory"
      onClick={() => ui.selectTab('territory')}
      title={`${progress.controlled} von ${progress.total} Veedeln: ${
        mine.length === 0 ? 'noch keins unter deiner Kontrolle' : mine.join(', ')
      }`}
    >
      <span class="phone-widget__label">
        <Icon name="flag" size={12} /> Reviere
      </span>
      <strong class="phone-stat__value">
        {progress.controlled}/{progress.total}
      </strong>
      <span class="phone-stat__sub">{city}</span>
      <span class="phone-stat__bar" aria-hidden="true">
        <span style={{ width: `${progress.total > 0 ? (100 * progress.controlled) / progress.total : 0}%` }} />
      </span>
    </button>
  );
}

function ReputationSection() {
  const { state } = useGame();
  const value = getReputation(state);
  // Stufe aus der gezeigten Zahl (wie im HUD).
  const shown = Math.round(value);
  const recent = recentReputationChanges(state);
  return (
    <Card
      title={`Ruf: ${reputationLabel(shown)}`}
      icon="star"
      color="brand"
      status={value < 25 ? 'bad' : value < 45 ? 'warn' : 'good'}
      summary={shown}
    >
      <List>
        <ListItem value={`${shown} von 100`}>
          <ItemContent icon="star" color="brand" title={reputationLabel(shown)}>
            <ProgressBar value={value / 100} tone={value < 25 ? 'bad' : value < 45 ? 'warn' : 'accent'} label="Ruf" />
          </ItemContent>
        </ListItem>
      </List>
      <Group title="Zuletzt" icon="clock" color="system">
        {recent.length === 0 ? (
          <Empty>Noch redet keiner über dich.</Empty>
        ) : (
          <List>
            {recent.map((c) => (
              <ListItem
                key={`${c.reason}:${c.time}`}
                value={
                  <span class={c.delta >= 0 ? 'rep-up' : 'rep-down'}>
                    {c.delta >= 0 ? '+' : ''}
                    {formatNumber(c.delta, 1)}
                  </span>
                }
              >
                <ItemContent
                  icon={c.delta >= 0 ? 'trendUp' : 'trendDown'}
                  color={c.delta >= 0 ? 'money' : 'danger'}
                  title={c.reason}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Group>
    </Card>
  );
}

registerHudItem({ id: 'reputation.value', order: 40, placement: 'more', icon: 'star', component: ReputationHud });
registerSlot('phone.home', { id: 'reputation.widget', order: 20, component: ReputationWidget });
registerSlot('phone.home', { id: 'reputation.territory', order: 30, component: TerritoryWidget });
registerSlot('tab:territory', { id: 'reputation.summary', title: 'Ruf', order: 20, component: ReputationSection });
