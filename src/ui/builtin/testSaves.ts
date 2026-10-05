// Test-Spielstände zum Ausprobieren, einer für jeden Abschnitt des Bogens: vom Bot gespielt und manche für einen Moment
// zurechtgerückt (src/playtest/testSaves.ts, Dateien in public/spielstaende/, neu erzeugen mit `npm run saves:build`).
// Zu laden im Spielstände-Dialog unter "Test-Spielstände" (nach Phase gruppiert) oder direkt mit ?spielstand=<id> in der
// Adresse. Sie kommen nicht in die Bestenliste.

import type { GameSession } from '../../core';
import type { CategoryColor, IconName } from '../components';

/** Abschnitt des Bogens, unter dem ein Test-Spielstand im Spielstände-Dialog steht. */
export type TestSavePhase = 'koeln' | 'germany' | 'harbor' | 'production';

export const TEST_SAVE_PHASES: readonly { id: TestSavePhase; title: string; icon: IconName; color: CategoryColor }[] = [
  { id: 'koeln', title: 'Köln', icon: 'dom', color: 'place' },
  { id: 'germany', title: 'Deutschland', icon: 'map', color: 'place' },
  { id: 'harbor', title: 'Hafen', icon: 'anchor', color: 'goods' },
  { id: 'production', title: 'Produktion', icon: 'leaf', color: 'goods' },
];

export interface TestSaveInfo {
  /** Dateiname ohne .json, wie in src/playtest/testSaves.ts. */
  id: string;
  phase: TestSavePhase;
  title: string;
  /** Ein Satz, was drin ist. */
  text: string;
}

/** In der Reihenfolge des Bogens (wie TEST_SAVES in src/playtest/testSaves.ts). */
export const TEST_SAVE_FILES: readonly TestSaveInfo[] = [
  {
    id: 'koeln-anfang',
    phase: 'koeln',
    title: 'Die ersten Tage',
    text: 'Tag 3: vier Spots, zwei Läufer, ein Lager und Peters Aufträge. Noch kein Veedel, noch kein Leutnant.',
  },
  {
    id: 'koeln-veedel',
    phase: 'koeln',
    title: 'Das erste Veedel',
    text: 'Tag 7: Das erste Veedel gehört dir, der erste Leutnant ist ernannt. Die Gangs halten dagegen.',
  },
  {
    id: 'boss-von-koeln',
    phase: 'koeln',
    title: 'Boss von Köln',
    text: 'Tag 17: 7 von 12 Veedeln, gerade ist die Mehrheit gefallen. 23 Spots, sieben Leutnants und eine Rechte Hand.',
  },
  {
    id: 'koeln-komplett',
    phase: 'koeln',
    title: 'Köln fast komplett',
    text: '50.000 € Schwarzgeld, 11 von 12 Veedeln, Rechte Hand auf höchster Stufe (Geldwäsche aus). Das zwölfte Veedel fällt gleich nach dem Laden.',
  },
  {
    id: 'ankunft-berlin',
    phase: 'germany',
    title: 'Ankunft in Berlin',
    text: 'Köln gehört dem Statthalter. Gerade in Berlin angekommen, mit Startpaket, noch ohne Lager: Clubs, die Nacht.',
  },
  {
    id: 'ankunft-hamburg',
    phase: 'germany',
    title: 'Ankunft in Hamburg',
    text: 'Köln und Berlin laufen beim Statthalter. Gerade in Hamburg angekommen: Hafen, Zoll, Reeperbahn.',
  },
  {
    id: 'ankunft-frankfurt',
    phase: 'germany',
    title: 'Ankunft in Frankfurt',
    text: 'Drei Städte komplett. Gerade in Frankfurt angekommen: Banker, Bahnhofsviertel, Flughafen.',
  },
  {
    id: 'ankunft-muenchen',
    phase: 'germany',
    title: 'Ankunft in München',
    text: 'Vier Städte komplett, die letzte fehlt. Gerade in München angekommen: teuer und streng.',
  },
  {
    id: 'deutschland',
    phase: 'germany',
    title: 'Boss von Deutschland',
    text: 'Alle fünf Städte komplett, vom Bot gespielt. In ein paar Stunden ruft Jansen aus Rotterdam an: Verkauf und Hafen.',
  },
  {
    id: 'hafen',
    phase: 'harbor',
    title: 'Hafen-Phase',
    text: 'Verkauft und in Rotterdam angekommen: Jansens Halle, die ersten Bestellungen, die App „Kunden“ im Dock.',
  },
  {
    id: 'hafen-europa',
    phase: 'harbor',
    title: 'Schiff und Europa',
    text: 'Knapp zwei Wochen später: ein eigenes Schiff, Antwerpen als zweiter Hafen, die ersten drei Städte in Europa bestellen.',
  },
  {
    id: 'produktion',
    phase: 'production',
    title: 'Produktion',
    text: 'Fincas in Kolumbien und Marokko, die erste Ernte liegt verpackt in Cartagena bzw. Tanger. Kunden-App › Anbau.',
  },
  {
    id: 'produzent',
    phase: 'production',
    title: 'Produzent',
    text: 'Die Hälfte deiner Lieferungen kommt aus den eigenen Fincas. Als Nächstes ganz Europa aus eigener Produktion.',
  },
  {
    id: 'europa',
    phase: 'production',
    title: 'Europa',
    text: 'Das Ende des Bogens: Jeder Kunde in Europa bekommt Ware aus deinen Fincas. Von hier geht es offen weiter.',
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
