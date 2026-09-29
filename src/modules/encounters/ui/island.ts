// Dynamic Island: laufende Konfrontationen (Überfall, Kontrolle …) ganz oben, rot.

import { registerLiveActivity } from '../../../ui';
import { activeEncounters } from '../index';

registerLiveActivity({
  id: 'encounters.active',
  activities: (state) =>
    activeEncounters(state).map((encounter) => ({
      id: `encounters.${encounter.id}`,
      priority: 95,
      icon: 'siren',
      tone: 'bad',
      leading: 'Überfall',
      trailing: encounter.place,
      title: encounter.opponent.label,
      detail: `${encounter.place} · Runde ${Math.min(encounter.round + 1, encounter.maxRounds)} von ${encounter.maxRounds}`,
      open: (ui) => ui.openDialog('encounters.encounter', { encounterId: encounter.id }),
    })),
});
