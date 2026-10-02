// Dynamic Island: geplante Razzien im eigenen Revier (jede mit Restzeit, die nächste zuerst) und hohe Heat.

import { islandCountdown, type LiveActivity, registerLiveActivity } from '../../../ui';
import { allVeedel, veedelName } from '../../veedel';
import { heatLevel, plannedMajorRaid, plannedRaidInfo, playerHeat } from '../index';

registerLiveActivity({
  id: 'police.status',
  activities: (state) => {
    const raids: LiveActivity[] = [];
    const major = plannedMajorRaid(state);
    if (major && major.at > state.time) {
      raids.push({
        id: 'police.majorRaid',
        priority: 90,
        icon: 'siren',
        tone: 'bad',
        leading: 'Groß',
        trailing: islandCountdown(major.at - state.time),
        title: `Großrazzia in ${major.veedelIds.map(veedelName).join(', ')}`,
        detail: 'Leute abziehen, Ware umlagern',
        open: (ui) => ui.openPanel('veedel.veedel', { veedelId: major.veedelIds[0] }),
      });
    }
    // Jede geplante Razzia bekommt ihren Eintrag, nicht nur die im heißesten Veedel: Auch die anderen lassen sich abwenden.
    const planned = allVeedel()
      .map((v) => ({ veedelId: v.id, info: plannedRaidInfo(state, v.id) }))
      .filter((r) => r.info !== null && r.info.at > state.time)
      .sort((a, b) => (a.info?.at ?? 0) - (b.info?.at ?? 0));
    for (const { veedelId, info } of planned) {
      if (!info) continue;
      raids.push({
        id: `police.raid.${veedelId}`,
        priority: 88,
        icon: 'siren',
        tone: 'bad',
        leading: 'Razzia',
        trailing: islandCountdown(info.at - state.time),
        title:
          info.scope === 'spot'
            ? `Razzia an einem Spot in ${veedelName(veedelId)}`
            : `Razzia in ${veedelName(veedelId)}`,
        detail: 'Ware und Leute rausholen oder abtauchen',
        open: (ui) => ui.openPanel('veedel.veedel', { veedelId }),
      });
    }
    if (raids.length > 0) return raids;
    const hot = playerHeat(state);
    if (!hot) return null;
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
