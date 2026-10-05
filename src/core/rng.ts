// Seedbarer Zufall (mulberry32). Der Zustand ist eine 32-Bit-Zahl und liegt im Spielstand,
// damit gleicher Spielstand + gleiche Befehle immer das gleiche Ergebnis liefern.

/** Liefert [Zufallszahl in [0, 1), neuer Zustand]. */
export function rngNext(stateValue: number): [number, number] {
  const s = (stateValue + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, s];
}

/** Startzustand eines Zufallsstroms, abgeleitet aus Seed und Name (z.B. Modul-ID). */
export function seedStream(seed: number, name: string): number {
  // FNV-1a über den Namen, dann mit dem Seed gemischt.
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let x = (h ^ Math.imul(seed | 0, 0x9e3779b1)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) | 0;
}

/** Zufallsseed für ein neues Spiel (außerhalb der Simulation, darf echten Zufall nutzen). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Einfache Zufallsfunktion außerhalb eines Spielstands, z.B. für Tests oder Datengeneratoren. */
export function createRng(seed: number): () => number {
  let s = seedStream(seed, 'standalone');
  return () => {
    const [value, next] = rngNext(s);
    s = next;
    return value;
  };
}

/**
 * Zufallsfolge fest aus einem Schlüssel (gleicher Schlüssel = gleiche Folge), ohne Zustand im Spielstand. Dokumentierte
 * Ausnahme von „nur ctx.random()“: deterministisch, aber unabhängig von der Würfelfolge der Module. Für Würfe, die
 * Spielstände nicht verschieben sollen (Eigenschaften der Leute, Auftrag 34) und für Würfe pro Stadt (Auftrag 40):
 * Was eine Stadt würfelt, hängt dann nicht davon ab, welche und wie viele andere Städte frei sind.
 */
export function keyedRandom(key: string): () => number {
  let s = seedStream(0x5eed, key);
  return () => {
    const [value, next] = rngNext(s);
    s = next;
    return value;
  };
}

/** Würfel mit denselben Helfern wie `Ctx` (random, randomInt, chance, pick) über einer festen Folge. */
export interface Dice {
  random(): number;
  /** Ganze Zahl von min bis max (beide inklusive). */
  randomInt(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

/** Würfel aus einer Zufallsfunktion. */
export function diceFrom(random: () => number): Dice {
  return {
    random,
    randomInt: (min, max) => min + Math.floor(random() * (max - min + 1)),
    chance: (p) => random() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('pick: leere Liste');
      return items[Math.floor(random() * items.length)];
    },
  };
}

/** Würfel fest aus einem Schlüssel (`keyedRandom`). */
export function keyedDice(key: string): Dice {
  return diceFrom(keyedRandom(key));
}

/**
 * Würfel pro (Seed, Stadt, Tag, Zweck), z.B. der Tagesschritt des Marktindex einer Stadt (Auftrag 40, Etappe 0). Jede
 * Stadt würfelt so für sich, egal welche und wie viele Städte frei sind; neue Zwecke verschieben keine alten Würfe.
 */
export function cityDayDice(seed: number, purpose: string, cityId: string, day: number): Dice {
  return keyedDice(`${purpose}:${seed}:${cityId}:${day}`);
}
