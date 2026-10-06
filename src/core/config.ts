// Einstellbare Werte des Kerns. Werte der Module liegen in deren eigener config.ts.

/** Bei 1x vergehen pro echter Sekunde so viele Spielminuten (= Simulationsschritte). */
export const GAME_MINUTES_PER_REAL_SECOND = 4;

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
export const JOURNAL_LIMIT = 120;

/** So viele Handy-Nachrichten bleiben im Spielstand, ältere fallen weg. */
export const MESSAGE_LIMIT = 300;

/** Anrufe (Auftrag 30): So viele Spielminuten klingelt es (bei 1x etwa 30 Sekunden), dann gilt er als verpasst. */
export const CALL_RING_MINUTES = 120;
/** Nach einem verpassten Anruf ruft die Figur so viele Spielminuten später noch einmal an. */
export const CALL_RETRY_MINUTES = 360;
/** So oft klingelt es höchstens; danach bleibt nur der Chat mit denselben Antworten. */
export const CALL_MAX_ATTEMPTS = 3;

/** Autosave alle so viele echte Sekunden, solange gespielt wird. */
export const AUTOSAVE_INTERVAL_SECONDS = 10;

/** Anzahl der manuellen Speicherplätze. */
export const SAVE_SLOT_COUNT = 3;
