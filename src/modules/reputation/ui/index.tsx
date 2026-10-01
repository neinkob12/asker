// Oberfläche des Rufs: Anzeige im HUD und ein Abschnitt mit den letzten Gründen im Tab "Geschäft".

import { formatNumber } from '../../../core';
import { Card, Empty, HudPill, ProgressBar, registerHudItem, registerSlot, useGame } from '../../../ui';
import { getReputation, recentReputationChanges, reputationLabel } from '../index';
import './reputation.css';

function ReputationHud() {
  const { state } = useGame();
  const value = getReputation(state);
  return (
    <HudPill
      icon="star"
      color="brand"
      label="Ruf"
      value={`${Math.round(value)} ${reputationLabel(value)}`}
      tone={value < 25 ? 'bad' : value < 45 ? 'warn' : undefined}
      title={`Ruf ${Math.round(value)} von 100: ${reputationLabel(value)}`}
    />
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
      <ProgressBar value={value / 100} tone={value < 25 ? 'bad' : value < 45 ? 'warn' : 'accent'} label="Ruf" />
      {recent.length === 0 ? (
        <Empty>Noch redet keiner über dich.</Empty>
      ) : (
        <ul class="rep-recent">
          {recent.map((c) => (
            <li key={`${c.reason}:${c.time}`}>
              <span>{c.reason}</span>
              <span class={c.delta >= 0 ? 'is-up' : 'is-down'}>
                {c.delta >= 0 ? '+' : ''}
                {formatNumber(c.delta, 1)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

registerHudItem({ id: 'reputation.value', order: 40, placement: 'more', icon: 'star', component: ReputationHud });
registerSlot('tab:business', { id: 'reputation.summary', title: 'Ruf', order: 35, component: ReputationSection });
