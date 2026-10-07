// Container packen (Teil 7, fertig). Wert der Rechten Hand: Vorsicht. Auslöser: du bestellst selbst Container
// (trade.buy) oder belädst dein Schiff (trade.sail). Folgen: trade (packing.ts, Faktor auf das Zollrisiko).

import type { MinigameKindDef } from '../types';

export const container: MinigameKindDef = { name: 'Container packen', stat: 'caution', ready: true };
