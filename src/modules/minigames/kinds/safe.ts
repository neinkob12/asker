// Tresor knacken (Teil 0, fertig). Wert der Rechten Hand: Vorsicht. Auslöser: Überfall auf einen Gang-Spot mit Erfolg,
// der Spieler selbst dabei (gangs, reactions.ts). Folgen: gangs (Geld aus dem Tresor oder Alarm).

import type { MinigameKindDef } from '../types';

export const safe: MinigameKindDef = { name: 'Tresor knacken', stat: 'caution', ready: true };
