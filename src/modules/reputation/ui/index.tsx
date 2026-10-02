// Oberfläche des Rufs: Kachel „Ruf · Reviere“ im HUD (mit aufklappbarer Karte) und ein Abschnitt mit den letzten
// Gründen im Tab "Reviere".

import { formatNumber } from '../../../core';
import {
  Card,
  Empty,
  Group,
  HudBar,
  HudPill,
  Icon,
  ItemContent,
  List,
  ListItem,
  ProgressBar,
  registerHudItem,
  registerSlot,
  useGame,
  useUi,
} from '../../../ui';
import { campaignProgress, controlledBy, PLAYER_FACTION } from '../../territory';
import { veedelName } from '../../veedel';
import { getReputation, recentReputationChanges, reputationLabel, reputationTier, reputationTiers } from '../index';
import './reputation.css';

/**
 * HUD über der Karte: Ruf und Reviere in einer Kachel (Auftrag 26). Leiste 0–100 mit den Stufen, daneben die Zahl
 * der Veedel. Beim Drüberfahren oder Antippen klappt eine Karte auf: die Stufe, die darunter und die darüber mit je
 * einem Satz, und die Reviere als kleine Liste. Der Knopf unten führt zu den Revieren.
 */
function ReputationHud() {
  const { state } = useGame();
  const ui = useUi();
  const value = getReputation(state);
  const tiers = reputationTiers();
  const index = tiers.indexOf(reputationTier(value));
  const tier = tiers[index];
  const below = tiers[index - 1];
  const above = tiers[index + 1];
  const progress = campaignProgress(state);
  const mine = controlledBy(state, PLAYER_FACTION).map(veedelName).sort();
  return (
    <HudPill
      icon="star"
      color="brand"
      label="Ruf · Reviere"
      value={`${Math.round(value)} ${tier.name}`}
      tone={value < 20 ? 'bad' : value < 40 ? 'warn' : undefined}
      title={`Ruf ${Math.round(value)} von 100: ${tier.name}. ${progress.controlled} von ${progress.total} Veedeln, ${progress.needed} zum Sieg.`}
      onClick={() => ui.selectTab('territory')}
      detailsAction="Reviere öffnen"
      details={
        <div class="rep-flyout">
          <div class="rep-flyout__now">
            <span class="hud-label is-brand">Ruf</span>
            <strong>
              {Math.round(value)} · {tier.name}
            </strong>
          </div>
          <p class="rep-flyout__text">{tier.effect}</p>
          <ul class="rep-flyout__tiers">
            {above && (
              <li>
                <span class="rep-flyout__dir">
                  <Icon name="arrowUp" /> ab {above.min}: {above.name}
                </span>
                <span class="rep-flyout__text">{above.effect}</span>
              </li>
            )}
            {below && (
              <li>
                <span class="rep-flyout__dir">
                  <Icon name="arrowDown" /> unter {tier.min}: {below.name}
                </span>
                <span class="rep-flyout__text">{below.effect}</span>
              </li>
            )}
          </ul>
          <div class="rep-flyout__now">
            <span class="hud-label is-place">Reviere</span>
            <strong>
              {progress.controlled}/{progress.needed}
              {progress.won ? ' · Köln gehört dir' : ' zum Sieg'}
            </strong>
          </div>
          <p class="rep-flyout__text">
            {mine.length === 0 ? 'Noch kein Veedel unter deiner Kontrolle.' : mine.join(', ')}
          </p>
        </div>
      }
    >
      <span class="hud-rep">
        <HudBar value={value} label="Ruf" marks={tiers.slice(1).map((t) => t.min)} />
        <span class="hud-rep__veedel" title={`${progress.controlled} von ${progress.total} Veedeln`}>
          <Icon name="flag" />
          {progress.controlled}/{progress.needed}
        </span>
      </span>
    </HudPill>
  );
}

function ReputationSection() {
  const { state } = useGame();
  const value = getReputation(state);
  const recent = recentReputationChanges(state);
  return (
    <Card
      title={`Ruf: ${reputationLabel(value)}`}
      icon="star"
      color="brand"
      status={value < 25 ? 'bad' : value < 45 ? 'warn' : 'good'}
      summary={Math.round(value)}
    >
      <List>
        <ListItem value={`${Math.round(value)} von 100`}>
          <ItemContent icon="star" color="brand" title={reputationLabel(value)}>
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
registerSlot('tab:territory', { id: 'reputation.summary', title: 'Ruf', order: 20, component: ReputationSection });
