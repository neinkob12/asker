// Dynamic Island: Vorstöße der Gangs in ein Veedel, mit Restzeit.

import { islandCountdown, registerLiveActivity } from '../../../ui';
import { activeCity } from '../../city';
import { controllerOf, PLAYER_FACTION } from '../../territory';
import { veedelName } from '../../veedel';
import { getGangStatus, getGangs } from '../index';

registerLiveActivity({
  id: 'gangs.pushes',
  activities: (state) =>
    getGangs(state, activeCity(state)).flatMap((gang) => {
      const push = getGangStatus(state, gang.id)?.push;
      // Nur Vorstöße gegen dich (Gang gegen Gang oder gegen niemanden ist keine Sache für "Leute hinschicken").
      if (!push || push.until <= state.time || controllerOf(state, push.veedelId) !== PLAYER_FACTION) return [];
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
