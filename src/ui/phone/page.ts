// Kontext einer Seite im Navigationsstapel des Handys: welche Seite (Eintrag) und welche darunter liegt. Seiten
// bleiben montiert, wenn neue darüber kommen; jede kennt so ihre eigenen Parameter (z.B. Chat-Liste und Chat sind
// dieselbe App mit verschiedenen Parametern) und den Titel der Vorseite für den Zurück-Knopf.

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { NavEntry } from './navModel';

export interface PageInfo {
  entry: NavEntry;
  below: NavEntry | null;
}

export const PageContext = createContext<PageInfo | null>(null);

/** Die Seite, in der eine Komponente steht (null außerhalb des Handys). */
export function usePage(): PageInfo | null {
  return useContext(PageContext);
}
