// Dynamic Island: geplante Razzia im eigenen Revier (mit Restzeit) und hohe Heat.

import { islandCountdown, registerLiveActivity } from '../../../ui';
import { veedelName } from '../../veedel';
import { heatLevel, plannedRaid, playerHeat } from '../index';

registerLiveActivity({
  id: 'police.status',
  activities: (state) => {
    const hot = playerHeat(state);
    if (!hot) return null;
    const raid = plannedRaid(state, hot.veedelId);
    if (raid !== null && raid > state.time) {
      return {
        id: `police.raid.${hot.veedelId}`,
        priority: 88,
        icon: 'siren',
        tone: 'bad',
        leading: 'Razzia',
        trailing: islandCountdown(raid - state.time),
        title: `Razzia in ${veedelName(hot.veedelId)}`,
        detail: 'Ware und Leute rausholen oder abtauchen',
        open: (ui) => ui.openPanel('veedel.veedel', { veedelId: hot.veedelId }),
      };
    }
    const level = heatLevel(hot.heat);
    if (level.index < 2) return null;
    return {
      id: 'police.heat',
      priority: 40,
      icon: 'flame',
      tone: level.index >= 3 ? 'bad' : 'warn',
      leading: 'Heat',
      trailing: level.label,
      title: `Heat in ${veedelName(hot.veedelId)}: ${level.label}`,
      detail: `${Math.round(hot.heat)} von 100`,
      progress: hot.heat / 100,
      open: (ui) => ui.openPanel('veedel.veedel', { veedelId: hot.veedelId }),
    };
  },
});
