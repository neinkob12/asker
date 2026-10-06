// Dynamic Island: Vorstöße der Gangs in ein Veedel, mit Restzeit.

import { islandCountdown, registerLiveActivity } from '../../../ui';
import { activeCity } from '../../city';
import { atSpot, getSpot } from '../../spots';
import { controllerOf, PLAYER_FACTION } from '../../territory';
import { veedelName } from '../../veedel';
import { getGang, getGangStatus, getGangs } from '../index';

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

// Auftrag 23: Gang-Leute an einem deiner Spots, mit Restzeit.
registerLiveActivity({
  id: 'gangs.intimidation',
  activities: (state) =>
    (state.modules.gangs?.intimidations ?? [])
      .filter((i) => i.until > state.time)
      .flatMap((i) => {
        const gang = getGang(state, i.gangId);
        const spot = getSpot(state, i.spotId);
        if (!gang || !spot) return [];
        return [
          {
            id: `gangs.intimidation.${i.spotId}`,
            priority: 70,
            icon: 'skull',
            tone: 'warn' as const,
            leading: 'Spot',
            trailing: islandCountdown(i.until - state.time),
            title: `${gang.name} ${atSpot(spot)}`,
            detail: 'Kaum Kunden, solange sie dort stehen',
            open: (ui) => {
              ui.selectTab('gangs');
              ui.openPanel('gangs.gang', { gangId: gang.id });
            },
          },
        ];
      }),
});
