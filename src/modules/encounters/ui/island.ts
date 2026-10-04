// Dynamic Island: laufende Konfrontationen (Überfall, Kontrolle …) ganz oben, rot.

import { registerLiveActivity } from '../../../ui';
import { activeEncounters, ENCOUNTER_KINDS, getIntent } from '../index';

registerLiveActivity({
  id: 'encounters.active',
  activities: (state) =>
    activeEncounters(state).map((encounter) => ({
      id: `encounters.${encounter.id}`,
      priority: 95,
      icon: 'siren',
      tone: 'bad',
      leading: ENCOUNTER_KINDS[encounter.kind]?.name ?? 'Konfrontation',
      trailing: encounter.place,
      title: encounter.opponent.label,
      // Absicht der Gegenseite und Polizei-Uhr, kompakt (Auftrag 35).
      detail:
        encounter.phase === 'rounds'
          ? `${getIntent(encounter.intent)?.label ?? encounter.place} · Streife in ${Math.max(0, encounter.clock)}`
          : `${encounter.place} · Wie gehst du vor?`,
      open: (ui) => ui.openDialog('encounters.encounter', { encounterId: encounter.id }),
    })),
});
