// Spieluhr. Die Zeit ist eine Zahl: Spielminuten seit Tag 1, 00:00 Uhr.

import { START_WEEKDAY } from './config';

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const pad = (n: number) => String(n).padStart(2, '0');

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
  /** Nacht: 22 bis 6 Uhr. */
  isNight: (time: number): boolean => {
    const h = clock.hour(time);
    return h >= 22 || h < 6;
  },
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
