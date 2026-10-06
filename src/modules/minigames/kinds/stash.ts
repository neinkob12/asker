// Razzia-Countdown (Teil 3, fertig). Wert der Rechten Hand: Vorsicht. Auslöser: eine Razzia gegen dich wird geplant,
// du bist in der Stadt und dort liegt Ware (police, stash.ts). Folgen: police (versteckter Anteil an der Razzia).

import type { MinigameKindDef } from '../types';

export const stash: MinigameKindDef = { name: 'Razzia-Countdown', stat: 'caution', ready: true };
