// Darstellung von Karten (Card) in Listen-Tabs: Im Modus 'rows' zeigt eine Karte nur eine tippbare Zeile
// (Status-Punkt, Icon, Titel, Kennzahl), im Modus 'detail' den ganzen Inhalt. Die Shell setzt den Kontext
// pro Slot-Beitrag (z.B. im Tab "Geschäft"); ohne Kontext zeigen Karten wie gewohnt alles.

import { createContext } from 'preact';

export interface SectionMode {
  mode: 'rows' | 'detail';
  /** Öffnet die Detailansicht dieses Abschnitts. */
  open: () => void;
  /** ID des Slot-Beitrags (damit sich das Handy den Titel für den Zurück-Knopf merken kann). */
  id?: string;
}

export const SectionContext = createContext<SectionMode | null>(null);

/** Titel der Abschnitte, so wie ihre Zeilen sie zeigen (ID des Slot-Beitrags → Titel). */
const titles = new Map<string, string>();

/** Merkt sich den Titel eines Abschnitts (die Zeile kennt ihn, das Handy braucht ihn für Titel und Zurück-Knopf). */
export function rememberSectionTitle(id: string, title: string): void {
  titles.set(id, title);
}

/** Titel eines Abschnitts, sofern seine Zeile schon einmal zu sehen war. */
export function sectionTitle(id: string): string | undefined {
  return titles.get(id);
}
