// Zivi oder Kunde (Teil 5, fertig). Wert der Rechten Hand: Vorsicht. Auslöser: du stehst selbst an einem Spot, die
// Polizei schickt Zivis (police, undercover.ts: ein Grundrauschen, ab UNDERCOVER_HEAT öfter). Folgen: police (Kontrolle bei
// Verkauf an einen Zivi, weniger Heat, wenn alle erkannt sind, Ruf für abgewimmelte Kunden).

import type { MinigameKindDef } from '../types';

export const undercover: MinigameKindDef = { name: 'Zivi oder Kunde', stat: 'caution', ready: true };
