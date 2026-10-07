// Bewerbungsgespräch (Teil 9, fertig). Wert der Rechten Hand: Charisma. Auslöser: „Gespräch führen“ im Bewerber-Blatt
// ('recruiting.interview', einmal je Bewerber). Folgen: recruiting (richtig erkannte Eigenschaften werden sichtbar, ein
// gutes Gespräch zeigt dazu einen versteckten Wert; die Rechte Hand deckt mit ihrer Chance eine Eigenschaft auf).

import type { MinigameKindDef } from '../types';

export const interview: MinigameKindDef = { name: 'Bewerbungsgespräch', stat: 'charisma', ready: true };
