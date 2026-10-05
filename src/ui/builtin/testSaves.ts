// Test-Spielstände zum Ausprobieren: vom Bot gespielt und für einen Moment zurechtgerückt (src/playtest/testSaves.ts,
// Dateien in public/spielstaende/, neu erzeugen mit `npm run saves:build`). Zu laden im Spielstände-Dialog unter
// "Test-Spielstände" oder direkt mit ?spielstand=<id> in der Adresse. Sie kommen nicht in die Bestenliste.

import type { GameSession } from '../../core';

export interface TestSaveInfo {
  /** Dateiname ohne .json, wie in src/playtest/testSaves.ts. */
  id: string;
  title: string;
  /** Ein Satz, was drin ist. */
  text: string;
}

export const TEST_SAVE_FILES: readonly TestSaveInfo[] = [
  {
    id: 'koeln-komplett',
    title: 'Köln fast komplett',
    text: '50.000 € Schwarzgeld, 11 von 12 Veedeln, Rechte Hand auf höchster Stufe (Geldwäsche aus). Das zwölfte Veedel fällt gleich nach dem Laden.',
  },
  {
    id: 'deutschland',
    title: 'Boss von Deutschland',
    text: 'Alle fünf Städte komplett, vom Bot gespielt. In ein paar Stunden ruft Jansen aus Rotterdam an: Verkauf und Hafen.',
  },
  {
    id: 'hafen',
    title: 'Hafen-Phase',
    text: 'Verkauft und in Rotterdam angekommen: Jansens Halle, die ersten Bestellungen, die App „Kunden“ im Dock.',
  },
];

/** Lädt einen Test-Spielstand (überschreibt den Autosave). Wirft mit Text für den Spieler. */
export async function loadTestSave(session: GameSession, id: string): Promise<TestSaveInfo> {
  const info = TEST_SAVE_FILES.find((s) => s.id === id);
  if (!info) throw new Error(`Den Test-Spielstand "${id}" gibt es nicht.`);
  const response = await fetch(`${import.meta.env.BASE_URL}spielstaende/${id}.json`);
  if (!response.ok) throw new Error(`"${info.title}" ließ sich nicht laden (${response.status}).`);
  session.importSave(await response.text());
  return info;
}
