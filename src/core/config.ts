// Einstellbare Werte des Kerns. Werte der Module liegen in deren eigener config.ts.

/** Bei 1x vergehen pro echter Sekunde so viele Spielminuten (= Simulationsschritte). */
export const GAME_MINUTES_PER_REAL_SECOND = 5;

/** Wählbare Tempi. 0 = Pause. */
export const SPEEDS = [0, 1, 2, 4] as const;

/** Höchstens so viele Schritte pro Bild, damit ein Ruckler nicht alles einfriert. */
export const MAX_STEPS_PER_FRAME = 240;

/** Startzeitpunkt eines neuen Spiels: Tag 1, 18:00 Uhr. */
export const START_TIME = 18 * 60;

/** Wochentag von Tag 1: 0 = Montag … 4 = Freitag. */
export const START_WEEKDAY = 4;

export const START_DIRTY_MONEY = 1500;
export const START_CLEAN_MONEY = 0;

/** So viele Einträge behält das Journal. */
export const JOURNAL_LIMIT = 60;

/** So viele Handy-Nachrichten bleiben im Spielstand, ältere fallen weg. */
export const MESSAGE_LIMIT = 300;

/** Autosave alle so viele echte Sekunden, solange gespielt wird. */
export const AUTOSAVE_INTERVAL_SECONDS = 10;

/** Anzahl der manuellen Speicherplätze. */
export const SAVE_SLOT_COUNT = 3;
