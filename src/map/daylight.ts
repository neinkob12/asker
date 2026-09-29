// Tag und Nacht, an die Spieluhr gekoppelt. Rein rechnerisch (kein DOM), damit Karte, Sound und Tests
// dieselbe Kurve nutzen. Keine Jahreszeiten: Sonnenaufgang und -untergang sind jeden Tag gleich.

// Die Grenzen der Dämmerung kommen aus dem Kern (clock.ts), damit clock.isNight und das Licht übereinstimmen.

import { clock, DAWN, type DayPhase, DUSK, dayPhaseAt } from '../core';

export { DAWN, type DayPhase, DUSK } from '../core';

const smoothstep = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Helligkeit des Tages: 0 = tiefe Nacht, 1 = voller Tag, dazwischen weiche Dämmerung. */
export function daylight(minuteOfDay: number): number {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  if (m < DAWN.start || m >= DUSK.end) return 0;
  if (m < DAWN.end) return smoothstep((m - DAWN.start) / (DAWN.end - DAWN.start));
  if (m < DUSK.start) return 1;
  return 1 - smoothstep((m - DUSK.start) / (DUSK.end - DUSK.start));
}

/** Stärke der Dämmerungsfarbe (Morgen- und Abendrot): 0 außerhalb, 1 in der Mitte der Dämmerung. */
export function twilight(minuteOfDay: number): number {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  const bump = (from: number, to: number) => (m >= from && m < to ? Math.sin(((m - from) / (to - from)) * Math.PI) : 0);
  return Math.max(bump(DAWN.start, DAWN.end), bump(DUSK.start, DUSK.end));
}

export function dayPhase(minuteOfDay: number): DayPhase {
  return dayPhaseAt(minuteOfDay);
}

/** Tageslicht zu einer Spielzeit. */
export function daylightAt(time: number): number {
  return daylight(clock.minuteOfDay(time) + (time % 1));
}

export const DAY_PHASE_NAMES: Record<DayPhase, string> = {
  night: 'Nacht',
  dawn: 'Morgendämmerung',
  day: 'Tag',
  dusk: 'Abenddämmerung',
};
