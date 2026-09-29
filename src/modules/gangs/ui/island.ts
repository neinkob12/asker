// Dynamic Island: Vorstöße der Gangs in ein Veedel, mit Restzeit.

import { islandCountdown, registerLiveActivity } from '../../../ui';
import { veedelName } from '../../veedel';
import { getGangStatus, getGangs } from '../index';

registerLiveActivity({
  id: 'gangs.pushes',
  activities: (state) =>
    getGangs(state).flatMap((gang) => {
      const push = getGangStatus(state, gang.id)?.push;
      if (!push || push.until <= state.time) return [];
      return [
        {
          id: `gangs.push.${gang.id}`,
          priority: 82,
          icon: 'skull',
          tone: 'bad',
          leading: 'Vorstoß',
          trailing: islandCountdown(push.until - state.time),
          title: `${gang.name} greift ${veedelName(push.veedelId)} an`,
          detail: 'Leute hinschicken oder verhandeln',
          progress: (state.time - push.startedAt) / Math.max(1, push.until - push.startedAt),
          open: (ui) => ui.selectTab('gangs'),
        },
      ];
    }),
});
