// Test-Spielstände zum Ausprobieren, einer für jeden Abschnitt des Bogens: vom Bot gespielt und manche für einen Moment
// zurechtgerückt (src/playtest/testSaves.ts, Dateien in public/spielstaende/, neu erzeugen mit `npm run saves:build`).
// Dazu die Gruppe „Minispiele“ (Auftrag 46): ein Stand je Art, in dem das Minispiel gerade ansteht und sich nach dem
// Laden von selbst öffnet (src/playtest/minigameSaves.ts).
// Zu laden im Spielstände-Dialog unter "Test-Spielstände" (nach Stadt bzw. Phase gruppiert) oder direkt mit ?spielstand=<id> in der
// Adresse. Sie kommen nicht in die Bestenliste.

import type { GameSession } from '../../core';
import type { CategoryColor, IconName } from '../components';

/** Abschnitt des Bogens, unter dem ein Test-Spielstand im Spielstände-Dialog steht (Auftrag 43: eine Gruppe pro Stadt). */
export type TestSavePhase =
  | 'koeln'
  | 'hamburg'
  | 'berlin'
  | 'muenchen'
  | 'frankfurt'
  | 'germany'
  | 'harbor'
  | 'production'
  | 'minigames';

export const TEST_SAVE_PHASES: readonly { id: TestSavePhase; title: string; icon: IconName; color: CategoryColor }[] = [
  { id: 'koeln', title: 'Köln', icon: 'dom', color: 'place' },
  { id: 'hamburg', title: 'Hamburg', icon: 'anchor', color: 'place' },
  { id: 'berlin', title: 'Berlin', icon: 'music', color: 'place' },
  { id: 'muenchen', title: 'München', icon: 'beer', color: 'place' },
  { id: 'frankfurt', title: 'Frankfurt', icon: 'building', color: 'place' },
  { id: 'germany', title: 'Deutschland', icon: 'map', color: 'place' },
  { id: 'harbor', title: 'Hafen', icon: 'ship', color: 'goods' },
  { id: 'production', title: 'Produktion', icon: 'leaf', color: 'goods' },
  { id: 'minigames', title: 'Minispiele', icon: 'bolt', color: 'danger' },
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
    id: 'ankunft-hamburg',
    phase: 'hamburg',
    title: 'Ankunft in Hamburg',
    text: 'Köln gehört dem Statthalter. Gerade in Hamburg angekommen: keine Leute, keine Rechte Hand, keine Routen. Lager kaufen, anheuern, selbst bestellen.',
  },
  {
    id: 'boss-von-hamburg',
    phase: 'hamburg',
    title: 'Boss von Hamburg',
    text: 'Gerade ist die Mehrheit der Hamburger Stadtteile gefallen. Hafen, Zoll, Reeperbahn.',
  },
  {
    id: 'hamburg-komplett',
    phase: 'hamburg',
    title: 'Hamburg fast komplett',
    text: 'Elf von zwölf Stadtteilen, die Rechte Hand ist bereit für die Vollmacht. Der letzte fällt gleich nach dem Laden, dann meldet sich die nächste Stadt.',
  },
  {
    id: 'ankunft-berlin',
    phase: 'berlin',
    title: 'Ankunft in Berlin',
    text: 'Köln und Hamburg laufen beim Statthalter. Gerade in Berlin angekommen, ohne Leute und ohne Lager: Clubs, die Nacht.',
  },
  {
    id: 'boss-von-berlin',
    phase: 'berlin',
    title: 'Boss von Berlin',
    text: 'Gerade ist die Mehrheit der Berliner Ortsteile gefallen. Die Clubs haben Freitag bis Montag offen.',
  },
  {
    id: 'berlin-komplett',
    phase: 'berlin',
    title: 'Berlin fast komplett',
    text: 'Elf von zwölf Ortsteilen, die Rechte Hand ist bereit für die Vollmacht. Der letzte fällt gleich nach dem Laden, dann meldet sich die nächste Stadt.',
  },
  {
    id: 'ankunft-muenchen',
    phase: 'muenchen',
    title: 'Ankunft in München',
    text: 'Drei Städte komplett. Gerade in München angekommen, ohne Leute und ohne Lager: teuer und streng.',
  },
  {
    id: 'boss-von-muenchen',
    phase: 'muenchen',
    title: 'Boss von München',
    text: 'Gerade ist die Mehrheit der Münchner Stadtbezirke gefallen. Die Polizei schaut genau hin.',
  },
  {
    id: 'muenchen-komplett',
    phase: 'muenchen',
    title: 'München fast komplett',
    text: 'Elf von zwölf Stadtbezirken, die Rechte Hand ist bereit für die Vollmacht. Der letzte fällt gleich nach dem Laden, dann meldet sich Frankfurt.',
  },
  {
    id: 'ankunft-frankfurt',
    phase: 'frankfurt',
    title: 'Ankunft in Frankfurt',
    text: 'Vier Städte komplett, die letzte fehlt. Gerade in Frankfurt angekommen, ohne Leute und ohne Lager: Banker, Bahnhofsviertel, Flughafen.',
  },
  {
    id: 'boss-von-frankfurt',
    phase: 'frankfurt',
    title: 'Boss von Frankfurt',
    text: 'Gerade ist die Mehrheit der Frankfurter Stadtteile gefallen. Kofi am Flughafen, scharfer Zoll.',
  },
  {
    id: 'frankfurt-komplett',
    phase: 'frankfurt',
    title: 'Frankfurt fast komplett',
    text: 'Elf von zwölf Stadtteilen. Der letzte fällt gleich nach dem Laden: Boss von Deutschland, dann ruft Jansen aus Rotterdam an.',
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
    text: 'Knapp vier Wochen später: ein eigenes Schiff, Antwerpen als zweiter Hafen, die ersten drei Städte in Europa bestellen.',
  },
  {
    id: 'produktion',
    phase: 'production',
    title: 'Produktion',
    text: 'Fincas in Kolumbien und Marokko, die erste Ernte liegt verpackt in Cartagena bzw. Tanger. Handel › Anbau.',
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
  // Minispiele (Auftrag 46), in der Reihenfolge der Arten (MINIGAME_KIND_IDS): Das Spiel öffnet sich nach dem Laden.
  {
    id: 'minispiel-chase',
    phase: 'minigames',
    title: 'Verfolgungsjagd',
    text: 'Boss von Köln, 22 Uhr: Kontrolle an deinem Spot, du rennst los. Blaulicht im Nacken, drei Spuren, Turbo.',
  },
  {
    id: 'minispiel-brawl',
    phase: 'minigames',
    title: 'Straßenkampf',
    text: 'Überfall auf den Spot einer Gang, du bist dabei und schlägst zu. Danach geht die Akte weiter.',
  },
  {
    id: 'minispiel-stash',
    phase: 'minigames',
    title: 'Razzia-Countdown',
    text: 'Tipp vom Kontakt: Die Razzia kommt. Im Lager liegt noch Ware, versteck sie, bevor die Bullen da sind.',
  },
  {
    id: 'minispiel-traffic',
    phase: 'minigames',
    title: 'Verkehrskontrolle',
    text: 'Du fährst nachts selbst Ware von einem Lager ins andere und wirst rausgewunken. Verstecken und ruhig bleiben.',
  },
  {
    id: 'minispiel-undercover',
    phase: 'minigames',
    title: 'Zivi oder Kunde',
    text: 'Abends an deinem Spot: Unter den nächsten Kunden sind Zivis. Verkauf nur an echte.',
  },
  {
    id: 'minispiel-safe',
    phase: 'minigames',
    title: 'Tresor knacken',
    text: 'Der Überfall auf den Gang-Spot ist gewonnen, im Hinterzimmer steht der Tresor.',
  },
  {
    id: 'minispiel-search',
    phase: 'minigames',
    title: 'Bude durchsuchen',
    text: 'Schutzgeld eingetrieben, du warst dabei: Die Bude des Schuldners steht offen, irgendwo liegt sein Rest.',
  },
  {
    id: 'minispiel-container',
    phase: 'minigames',
    title: 'Container packen',
    text: 'Hafen-Phase: ein Container bei einem Produzenten bestellt. Pack ihn so, dass der Zoll nichts findet.',
  },
  {
    id: 'minispiel-papers',
    phase: 'minigames',
    title: 'Papiere fälschen',
    text: 'Der Zoll hält eine Sammellieferung fest. Du machst die Papiere selbst, statt zu schmieren.',
  },
  {
    id: 'minispiel-interview',
    phase: 'minigames',
    title: 'Bewerbungsgespräch',
    text: 'Ein Bewerber aus dem Pool: drei Fragen, Zeichen rechtzeitig tippen, Eigenschaften in die Akte.',
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
