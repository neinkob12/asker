// Spieluhr. Die Zeit ist eine Zahl: Spielminuten seit Tag 1, 00:00 Uhr.

import { START_WEEKDAY } from './config';

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Tageslauf, für alle gleich (Simulation, Karte, Wetter, Sound): Dämmerung morgens und abends in Minuten seit
 * Mitternacht. Nacht ist vor der Morgen- und nach der Abenddämmerung. Keine Jahreszeiten.
 */
export const DAWN = { start: 5 * 60 + 15, end: 7 * 60 + 30 } as const;
export const DUSK = { start: 19 * 60 + 30, end: 21 * 60 + 45 } as const;

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

/** Tagesabschnitt zu einer Minute seit Mitternacht. */
export function dayPhaseAt(minuteOfDay: number): DayPhase {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (m < DAWN.start || m >= DUSK.end) return 'night';
  if (m < DAWN.end) return 'dawn';
  if (m < DUSK.start) return 'day';
  return 'dusk';
}

export const clock = {
  /** Spieltag, beginnend bei 1. */
  day: (time: number): number => Math.floor(time / MINUTES_PER_DAY) + 1,
  hour: (time: number): number => Math.floor(time / MINUTES_PER_HOUR) % 24,
  minute: (time: number): number => Math.floor(time) % MINUTES_PER_HOUR,
  /** Minuten seit Mitternacht (0–1439). */
  minuteOfDay: (time: number): number => Math.floor(time) % MINUTES_PER_DAY,
  /** Wochentag: 0 = Montag … 6 = Sonntag. */
  weekday: (time: number): number => (START_WEEKDAY + Math.floor(time / MINUTES_PER_DAY)) % 7,
  weekdayName: (time: number, short = false): string =>
    (short ? WEEKDAYS_SHORT : WEEKDAYS)[(START_WEEKDAY + Math.floor(time / MINUTES_PER_DAY)) % 7],
  isWeekend: (time: number): boolean => clock.weekday(time) >= 5,
  /** Tagesabschnitt: Nacht 21:45–5:15, Dämmerung, Tag (wie das Licht auf der Karte). */
  dayPhase: (time: number): DayPhase => dayPhaseAt(clock.minuteOfDay(time)),
  /** Nacht: 21:45 bis 5:15 Uhr (dieselbe Kurve wie das Licht auf der Karte). */
  isNight: (time: number): boolean => dayPhaseAt(clock.minuteOfDay(time)) === 'night',
  /** Anteil des Tages (0 = Mitternacht, 0.5 = Mittag). */
  dayProgress: (time: number): number => clock.minuteOfDay(time) / MINUTES_PER_DAY,
  /** Zeitpunkt aus Tag (ab 1), Stunde und Minute. */
  at: (day: number, hour = 0, minute = 0): number => (day - 1) * MINUTES_PER_DAY + hour * MINUTES_PER_HOUR + minute,
  /** "18:05" */
  formatTime: (time: number): string => `${pad(clock.hour(time))}:${pad(clock.minute(time))}`,
  /** "Tag 1, 18:05" (wie im Prototyp) */
  format: (time: number): string => `Tag ${clock.day(time)}, ${clock.formatTime(time)}`,
  /** "Fr, Tag 1, 18:05" */
  formatLong: (time: number): string => `${clock.weekdayName(time, true)}, ${clock.format(time)}`,
  /** Dauer in Spielminuten als Text, z.B. "12 Std. 30 Min." */
  formatDuration: (minutes: number): string => {
    const m = Math.max(0, Math.round(minutes));
    const h = Math.floor(m / 60);
    const rest = m % 60;
    if (h === 0) return `${rest} Min.`;
    return rest === 0 ? `${h} Std.` : `${h} Std. ${rest} Min.`;
  },
};
