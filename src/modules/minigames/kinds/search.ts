// Bude durchsuchen (Teil 6, fertig). Wert der Rechten Hand: Vorsicht. Auslöser: Schutzgeld eintreiben mit dem Spieler
// selbst, Ausgang Erfolg oder Rückzug (gangs, reactions.ts). Folgen: gangs (search.ts: Geld oder Heat durch Lärm).

import type { MinigameKindDef } from '../types';

export const search: MinigameKindDef = { name: 'Bude durchsuchen', stat: 'caution', ready: true };
