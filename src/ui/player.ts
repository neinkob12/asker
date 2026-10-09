// Spieler auf diesem Gerät (localStorage): Name für die Bestenliste und ob das Intro schon lief.
// Fehlt der Speicher (privates Fenster, gesperrt), gilt beides nur bis zum Neuladen.

const NAME_KEY = 'koeln-tycoon:player-name';
const INTRO_KEY = 'koeln-tycoon:intro-seen';
/** Höchstlänge des Namens (auch der Server kürzt darauf). */
export const PLAYER_NAME_MAX = 20;

let memoryName = '';
let memoryIntro = false;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Name ohne Steuerzeichen und doppelte Leerzeichen, gekürzt (wie der Server, api/leaderboard.ts). */
export function cleanPlayerName(raw: string): string {
  const name = raw
    // Steuerzeichen (Zeilenumbruch, Tab) werden ein Leerzeichen, sonst klebt „Jakob\tMüller“ zusammen.
    .replace(/\p{Cc}/gu, ' ')
    // Unsichtbare Formatzeichen (Zero-Width, Rechts-nach-links) fliegen raus: sonst steht eine leere Zeile da.
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Nach Codepunkten kürzen: Ein Emoji an der Grenze bleibt ganz oder fällt weg, statt halb (Ersatzzeichen).
  return Array.from(name).slice(0, PLAYER_NAME_MAX).join('');
}

export function getPlayerName(): string {
  try {
    return cleanPlayerName(storage()?.getItem(NAME_KEY) ?? memoryName);
  } catch {
    return memoryName;
  }
}

export function setPlayerName(name: string): void {
  memoryName = cleanPlayerName(name);
  try {
    storage()?.setItem(NAME_KEY, memoryName);
  } catch {
    // Kein Speicher: Name gilt bis zum Neuladen.
  }
}

export function introSeen(): boolean {
  try {
    return storage()?.getItem(INTRO_KEY) === '1' || memoryIntro;
  } catch {
    return memoryIntro;
  }
}

export function markIntroSeen(): void {
  memoryIntro = true;
  try {
    storage()?.setItem(INTRO_KEY, '1');
  } catch {
    // Kein Speicher: Intro kommt beim nächsten Laden wieder.
  }
}
