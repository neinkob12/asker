import type { StaffStats } from './index';

// Werte aus dem Prototyp. Zeiten in Spielminuten.
export const RUNNER_HIRE_COST = 600;
export const RUNNER_DAILY_WAGE = 80;
/** So lange braucht ein Läufer für einen Kunden. */
export const RUNNER_SERVE_TIME = 20;

/** Werte eines neuen Mitarbeiters, solange es keine individuellen Werte gibt (Auftrag 13). */
export const DEFAULT_STATS: StaffStats = { speed: 50, caution: 50, strength: 50, charisma: 50, loyalty: 50 };

export const FIRST_NAMES = [
  'Kevin',
  'Murat',
  'Dennis',
  'Jana',
  'Sascha',
  'Luca',
  'Mehmet',
  'Tobi',
  'Chantal',
  'Dragan',
  'Nico',
  'Ayse',
  'Marco',
  'Sven',
  'Leonie',
  'Kemal',
] as const;

export const LAST_NAMES = ['K.', 'B.', 'S.', 'M.', 'Ö.', 'W.', 'R.', 'T.', 'Y.', 'L.'] as const;
