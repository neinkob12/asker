// Darstellung von Karten (Card) in Listen-Tabs: Im Modus 'rows' zeigt eine Karte nur eine tippbare Zeile
// (Status-Punkt, Icon, Titel, Kennzahl), im Modus 'detail' den ganzen Inhalt. Die Shell setzt den Kontext
// pro Slot-Beitrag (z.B. im Tab "Geschäft"); ohne Kontext zeigen Karten wie gewohnt alles.

import { createContext } from 'preact';

export interface SectionMode {
  mode: 'rows' | 'detail';
  /** Öffnet die Detailansicht dieses Abschnitts. */
  open: () => void;
}

export const SectionContext = createContext<SectionMode | null>(null);
